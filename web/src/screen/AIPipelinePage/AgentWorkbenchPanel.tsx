'use client';

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowUp,
  Bot,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  File,
  FileText,
  FoldVertical,
  History,
  ListChecks,
  Loader2,
  MessageSquarePlus,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  User,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Streamdown } from '@/components/ui/streamdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useAgentSessionsList,
  useAgentTasks,
  useAgentToolCalls,
  useAgentWorkspaces,
  useApproveAgentToolCall,
  useCancelAgentToolCallExecution,
  useCreateAgentSession,
  useCreateContextPack,
  useCreatePipelineRun,
  useExecuteAgentWorkspaceLifecycle,
  usePatchAgentSessionMetadata,
  usePipelineRunsList,
  usePrepareAgentToolCall,
  useProvisionAgentWorkspace,
  useRunAgentToolCallWithCodex,
  useUpsertAgentTask,
  useAgentWorkspaceSourceTree,
} from '@/lib/rd-hooks';
import type {
  IAgentExecutionEvent,
  IAgentSession,
  IAgentToolCall,
  IAgentWorkspace,
  IAgentWorkspaceSourceTreeNode,
  IPipelineTask,
} from '@/lib/rd-types';
import type { IAiSkillConfig } from '@/lib/ai-skill-engine';
import { logger } from '@/lib/logger';
import { buildAgentDiffReviewSummary } from '@/lib/agent-review-utils';
import { fillAiSkillPromptTemplate } from '@/lib/ai-skill-engine';
import { AGENT_WORKBENCH_PLAN_SKILL_ID, getAiSkill, listAiSkills } from '@/lib/ai-skills';
import { cn } from '@/lib/utils';

/** 编码对话内助手气泡的 Markdown 排版（流式与非流式共用） */
const AGENT_CHAT_MARKDOWN_CLASS =
  'prose prose-sm dark:prose-invert max-w-none w-full min-w-0 break-words text-foreground prose-p:leading-relaxed prose-li:my-0.5 prose-headings:scroll-mt-4 prose-pre:max-w-full prose-pre:overflow-x-auto prose-pre:whitespace-pre prose-pre:break-normal prose-pre:bg-slate-950 prose-pre:text-slate-100 prose-pre:ring-1 prose-pre:ring-slate-800/80 prose-code:rounded-md prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none';

interface IAgentWorkbenchPanelProps {
  task: IPipelineTask;
  operatorName?: string;
}

interface ICodexRuntimeState {
  phase: 'idle' | 'starting' | 'spawned' | 'running' | 'finished' | 'error';
  toolCallId?: string;
  pid?: number | null;
  cwd?: string | null;
  command?: string | null;
  startedAt?: string | null;
  lastEventAt?: string | null;
  durationMs?: number | null;
  exitCode?: number | null;
  status?: string | null;
  stdoutBytes: number;
  stderrBytes: number;
  changedFilesCount: number;
  message?: string | null;
}

const initialCodexRuntimeState: ICodexRuntimeState = {
  phase: 'idle',
  stdoutBytes: 0,
  stderrBytes: 0,
  changedFilesCount: 0,
};

type ICodingToolChoice = 'codex_cli' | 'cursor_cli' | 'claude_code';

const CODING_TOOL_OPTIONS: Array<{ id: ICodingToolChoice; label: string; description: string; enabled: boolean }> = [
  { id: 'codex_cli', label: 'Codex CLI', description: '本机/服务端已安装 codex', enabled: true },
  { id: 'cursor_cli', label: 'Cursor', description: '即将支持', enabled: false },
  { id: 'claude_code', label: 'Claude Code', description: '即将支持', enabled: false },
];

function latestByTime<T extends { createdAt: string }>(items: T[]): T | undefined {
  return [...items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
}

function pickWorkspaceForSession(workspaces: IAgentWorkspace[]): IAgentWorkspace | undefined {
  const open = workspaces.filter((w) => w.status !== 'archived');
  if (!open.length) return undefined;
  return [...open].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
}

type IAgentChatRole = 'assistant' | 'user';

interface IAgentChatMessage {
  id: string;
  role: IAgentChatRole;
  content: string;
  createdAt: string;
  variant?: 'plan' | 'codex';
  streaming?: boolean;
  /** Codex 本轮结束时的耗时（ms），用于气泡顶栏展示 */
  durationMs?: number | null;
  exitCode?: number | null;
}

function newChatMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const MAX_PRIOR_ASSISTANT_CHARS = 3200;

/** 与 rd.service Codex 后缀逻辑对齐：以此开头的 prompt 走「简短问答」短后缀，避免强编码授权刷屏 */
const CODEX_CHAT_ONLY_MARKER = '【本轮为简短问答，非编码任务】';

/** 判断是否为闲聊 / 身份类短问句，避免把整份 Plan + 超长历史塞进 Codex */
function isLikelyConversationalCodexTurn(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 200) return false;
  if (
    /[[\]{}`]|\.tsx?\b|\.vue\b|\.py\b|\.go\b|npm |yarn |pnpm |git |docker|k8s|PRD|FS\/TS|eslint|jest|curl |swagger/i.test(
      t,
    )
  ) {
    return false;
  }
  /** 明确的迭代 / 需求表述 → 一律走完整编码上下文（避免「增加 XX 功能」被误判为简短问答） */
  if (
    /实现|开发|修改|重构|部署|联调|分支|commit|merge|类型检查|单元测试|验收|bug|fix|feature|组件|页面|路由|接口|数据库|增加|添加|新增|删除|移除|去掉|补充|完善|调整|优化|修复|升级|迭代|对接|集成|导入|导出|需求|模块|菜单|CRUD|权限|角色|报表|字典|故事点/i.test(
      t,
    )
  ) {
    return false;
  }
  if (
    /部门管理功能|用户管理功能|权限管理|角色管理|菜单管理|组织管理|员工管理|数据字典|工作流|审批流/i.test(t)
  ) {
    return false;
  }
  return true;
}

function truncateText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n…（已截断）`;
}

function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs ? `${m}m ${rs}s` : `${m}m`;
}

/** 对话输入框内 `/` 技能菜单：单行摘要 */
function truncateOneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * 光标前若存在「可触发的 /xxx」则视为技能菜单。
 * - 允许行首、空白后、换行后的 `/`；
 * - `/` 前若为字母/数字/中文等「词内字符」则不触发（避免 URL、路径误触），但常见中文标点后可触发；
 * - 全角 `／` 按 `/` 处理；
 * - 仅含 `/` 且光标在 0 时仍视为在「/ 之后」输入（兼容部分浏览器 selection 异常）。
 */
function parseSlashTrigger(draft: string, cursor: number): { start: number; filter: string } | null {
  const norm = draft.replace(/／/g, '/');
  let c = Math.min(Math.max(cursor, 0), norm.length);
  if (norm === '/' && c === 0) c = 1;
  const before = norm.slice(0, c);
  const m = before.match(/(^|[\s\n])(\/)([^\s]*)$/);
  if (m && m.index !== undefined) {
    const slashIdx = m.index + m[1].length;
    return { start: slashIdx, filter: (m[3] ?? '').toLowerCase() };
  }
  const slashIdx = before.lastIndexOf('/');
  if (slashIdx < 0) return null;
  const after = before.slice(slashIdx + 1);
  if (after.includes('\n')) return null;
  if (slashIdx > 0) {
    const prev = before[slashIdx - 1]!;
    if (/\S/.test(prev) && /[a-zA-Z0-9_\u4e00-\u9fff]/.test(prev)) return null;
  }
  return { start: slashIdx, filter: after.toLowerCase() };
}

/**
 * 光标前「可触发的 @xxx」用于插入仓库内文件路径（与 `/` 规则对称；全角 ＠ 视为 @）。
 * 筛选段内不含第二个 @，避免误伤邮箱。
 * 路径 token 后出现空白则视为已结束引用（例如 `@a/b.md 开始编码`），不再弹出补全。
 */
function parseAtTrigger(draft: string, cursor: number): { start: number; filter: string } | null {
  const norm = draft.replace(/＠/g, '@');
  let c = Math.min(Math.max(cursor, 0), norm.length);
  if (norm === '@' && c === 0) c = 1;
  const before = norm.slice(0, c);
  const m = before.match(/(^|[\s\n])(@)([^\s@]*)$/);
  if (m && m.index !== undefined) {
    const atIdx = m.index + m[1].length;
    return { start: atIdx, filter: (m[3] ?? '').toLowerCase() };
  }
  const atIdx = before.lastIndexOf('@');
  if (atIdx < 0) return null;
  const after = before.slice(atIdx + 1);
  if (after.includes('\n') || after.includes('@')) return null;
  /** 已输入空格等，说明 @ 路径段结束，后续是自然语言指令，不应把整段当作筛选串 */
  if (/\s/.test(after)) return null;
  if (atIdx > 0) {
    const prev = before[atIdx - 1]!;
    if (/\S/.test(prev) && /[a-zA-Z0-9_\u4e00-\u9fff]/.test(prev)) return null;
  }
  return { start: atIdx, filter: after.toLowerCase() };
}

/** 同时存在 `/` 与 `@` 时，只保留离光标更近的一段作为当前菜单 */
function reconcileComposerMentions(
  draft: string,
  cursor: number,
): { slash: { start: number; filter: string } | null; at: { start: number; filter: string } | null } {
  const slash = parseSlashTrigger(draft, cursor);
  const at = parseAtTrigger(draft, cursor);
  if (slash && at) {
    if (at.start > slash.start) return { slash: null, at };
    return { slash, at: null };
  }
  return { slash, at };
}

function charIsAtMark(d: string, i: number): boolean {
  const c = d[i];
  return c === '@' || c === '＠';
}

function isValidAtTriggerPrefix(d: string, atIdx: number): boolean {
  if (!charIsAtMark(d, atIdx)) return false;
  if (atIdx > 0) {
    const prev = d[atIdx - 1]!;
    if (/\S/.test(prev) && /[a-zA-Z0-9_\u4e00-\u9fff]/.test(prev)) return false;
  }
  return true;
}

/** @ 路径段：@ 起至首个空白/@ 之前（与 parseAtTrigger 语义一致，不含尾部空格） */
function findAtPathAtomRange(d: string, indexInPath: number): { start: number; end: number } | null {
  if (indexInPath < 0 || indexInPath >= d.length) return null;
  let j = indexInPath;
  while (j >= 0 && !charIsAtMark(d, j)) {
    const ch = d[j];
    if (ch === '\n' || ch === ' ' || ch === '\t' || ch === '\r') return null;
    j--;
  }
  if (j < 0 || !charIsAtMark(d, j) || !isValidAtTriggerPrefix(d, j)) return null;
  let end = j + 1;
  while (end < d.length) {
    const ch = d[end]!;
    if (ch === '\n' || ch === ' ' || ch === '\t' || ch === '\r' || charIsAtMark(d, end)) break;
    end++;
  }
  if (indexInPath >= j && indexInPath < end) return { start: j, end };
  return null;
}

function charIsSlashMark(d: string, i: number): boolean {
  return d[i] === '/' || d[i] === '／';
}

function isValidSlashTriggerPrefix(d: string, slashIdx: number): boolean {
  if (!charIsSlashMark(d, slashIdx)) return false;
  if (slashIdx > 0) {
    const prev = d[slashIdx - 1]!;
    if (/\S/.test(prev) && /[a-zA-Z0-9_\u4e00-\u9fff]/.test(prev)) return false;
  }
  return true;
}

/** 技能前缀 `/xxx`：与 parseSlashTrigger 首分支一致，路径内不含空白与换行 */
function findSlashPrefixAtomRange(d: string, indexInPrefix: number): { start: number; end: number } | null {
  if (indexInPrefix < 0 || indexInPrefix >= d.length) return null;
  let j = indexInPrefix;
  while (j >= 0 && !charIsSlashMark(d, j)) {
    const ch = d[j];
    if (ch === '\n' || ch === ' ' || ch === '\t' || ch === '\r') return null;
    j--;
  }
  if (j < 0 || !charIsSlashMark(d, j) || !isValidSlashTriggerPrefix(d, j)) return null;
  let end = j + 1;
  while (end < d.length) {
    const ch = d[end]!;
    if (ch === '\n' || ch === ' ' || ch === '\t' || ch === '\r') break;
    end++;
  }
  if (indexInPrefix >= j && indexInPrefix < end) return { start: j, end };
  return null;
}

/** Backspace 将要删除的字符下标为 deleteIndex；整段删除 @ 路径或 `/` 技能前缀 */
function findComposerAtomicBackspaceRange(draft: string, deleteIndex: number): { start: number; end: number } | null {
  const atR = findAtPathAtomRange(draft, deleteIndex);
  const slashR = findSlashPrefixAtomRange(draft, deleteIndex);
  if (atR && slashR) {
    if (atR.start <= slashR.start && atR.end >= slashR.end) return atR;
    if (slashR.start <= atR.start && slashR.end >= atR.end) return slashR;
    return atR.start <= slashR.start ? atR : slashR;
  }
  return atR ?? slashR;
}

/** Delete 键：光标在 atom 起点时整段前删 */
function findComposerAtomicForwardDeleteRange(
  draft: string,
  cursor: number,
): { start: number; end: number } | null {
  const atR = charIsAtMark(draft, cursor) && isValidAtTriggerPrefix(draft, cursor) ? findAtPathAtomRange(draft, cursor) : null;
  if (atR && atR.start === cursor) return atR;
  const slashR =
    charIsSlashMark(draft, cursor) && isValidSlashTriggerPrefix(draft, cursor)
      ? findSlashPrefixAtomRange(draft, cursor)
      : null;
  if (slashR && slashR.start === cursor) return slashR;
  return null;
}

function flattenAgentWorkspaceFilePaths(nodes: IAgentWorkspaceSourceTreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: IAgentWorkspaceSourceTreeNode[]) => {
    for (const n of list) {
      if (n.type === 'file' && n.path?.trim()) out.push(n.path.trim());
      else if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return [...new Set(out)].sort((a, b) => a.localeCompare(b, 'en'));
}

function skillIconForSkillId(skillId: string): LucideIcon {
  const id = skillId.toLowerCase();
  if (id.includes('prd')) return FileText;
  if (id.includes('spec') || id.includes('fs_') || id.includes('ts_') || id.includes('tech')) return ListChecks;
  if (id.includes('review') || id.includes('审查')) return ShieldCheck;
  if (id.includes('accept') || id.includes('验收')) return ClipboardList;
  if (id.includes('conflict') || id.includes('冲突')) return Sparkles;
  if (id.includes('plan') || id.includes('agent_workbench')) return Wand2;
  return Sparkles;
}

function buildAiSkillSlashInsert(skill: IAiSkillConfig, requirementTitle: string): string {
  const hint = skill.description?.trim() || truncateOneLine(skill.promptTemplate, 280);
  return `【技能：${skill.name}】（skill_id: ${skill.id}）\n${hint}\n\n请结合当前 worktree / ContextPack 落实上述意图；若模板含占位变量请从需求「${requirementTitle}」与仓库现状合理推断。\n\n`;
}

interface IAgentWorkbenchSlashRow {
  key: string;
  name: string;
  description: string;
  Icon: LucideIcon;
  buildInsert: (ctx: { requirementTitle: string }) => string;
}

function buildBuiltinSlashRows(): IAgentWorkbenchSlashRow[] {
  return [
    {
      key: 'builtin:compress',
      name: '压缩上下文',
      description: '生成本轮前要点摘要，便于长线程接力',
      Icon: FoldVertical,
      buildInsert: () =>
        '【快捷：压缩上下文】\n请用 10 条以内要点概括：当前进度、未决问题、已改文件、下一步建议；忽略与编码无关的寒暄。\n\n',
    },
    {
      key: 'builtin:review',
      name: '代码审查',
      description: '从风险、缺陷、测试缺口角度审视当前改动',
      Icon: ShieldCheck,
      buildInsert: () =>
        '【快捷：代码审查】\n请基于当前 worktree diff 做审查：风险点、逻辑缺陷、边界情况、测试缺口与可执行改进；能直接修复的请改代码并自检。\n\n',
    },
    {
      key: 'builtin:acceptance',
      name: '验收对齐',
      description: '对照需求与 Plan 列出与验收标准的差距',
      Icon: ClipboardList,
      buildInsert: ({ requirementTitle }) =>
        `【快捷：验收对齐】\n需求：「${requirementTitle}」。请对照 Plan / PRD 要点，列出与验收标准仍存在的差距、需补测试或文档处，并给出最小补齐方案。\n\n`,
    },
    {
      key: 'builtin:risk',
      name: '风险与回滚',
      description: '依赖、数据与部署层面的风险与回滚建议',
      Icon: ListChecks,
      buildInsert: () =>
        '【快捷：风险与回滚】\n请识别本变更的依赖、数据迁移、配置与部署风险；给出文件级回滚建议与验证步骤。\n\n',
    },
    {
      key: 'builtin:plan_sync',
      name: 'Plan 对齐',
      description: '用 checklist 对比 Plan 与实际执行的偏差',
      Icon: Wand2,
      buildInsert: () =>
        '【快捷：Plan 对齐】\n请阅读原文 Plan，仅用 checklist 列出与当前实现不一致处，并建议如何更新 Plan 文案（不执行无依据的大范围重写）。\n\n',
    },
  ];
}

/** 已完成的「用户 → Agent」轮次，用于构造下一轮 Codex 的上下文（不含当前正在输入的一轮） */
function extractCompletedPriorTurns(messages: IAgentChatMessage[]): { user: string; assistant: string }[] {
  const prior: { user: string; assistant: string }[] = [];
  let i = 1;
  while (i < messages.length) {
    const cur = messages[i];
    if (cur.role === 'user') {
      const next = messages[i + 1];
      if (next?.role === 'assistant' && next.variant === 'codex' && !next.streaming) {
        prior.push({ user: cur.content, assistant: next.content });
        i += 2;
        continue;
      }
      break;
    }
    if (cur.role === 'assistant' && cur.variant === 'codex' && !cur.streaming) {
      i += 1;
      continue;
    }
    break;
  }
  return prior;
}

/** 每条用户消息单独一轮 Codex：Plan + 历史节选 + 本轮指令（或由步骤 3 触发的无新指令延续） */
function buildSingleTurnCodexPrompt(
  planMarkdown: string,
  instructionThisTurn: string | null,
  priorTurns: { user: string; assistant: string }[],
  fallbackInstruction: string,
): string {
  if (instructionThisTurn?.trim() && isLikelyConversationalCodexTurn(instructionThisTurn)) {
    return [
      CODEX_CHAT_ONLY_MARKER,
      '',
      `用户：${instructionThisTurn.trim()}`,
      '',
      '请用简短中文直接回答。不要复述 Plan，不要复述「系统」类授权说明，不要粘贴此前多轮对话全文。',
    ].join('\n');
  }

  const plan = planMarkdown.trim() || fallbackInstruction.trim();
  let body = plan;
  if (priorTurns.length > 0) {
    body += '\n\n---\n【此前对话（节选；每轮 Codex 独立执行）】\n';
    priorTurns.forEach((t, idx) => {
      body += `\n### 第 ${idx + 1} 轮\n用户：\n${t.user}\n\nAgent 输出节选：\n${truncateText(t.assistant, MAX_PRIOR_ASSISTANT_CHARS)}\n`;
    });
  }
  if (instructionThisTurn?.trim()) {
    body += `\n\n---\n【本轮请执行的指令】\n${instructionThisTurn.trim()}`;
  } else {
    body +=
      '\n\n---\n【本轮】请严格依据上述 Plan 与 Context 在仓库内完成实现、自测或必要的类型检查（本回合由「开始编码」触发）。';
  }
  return body;
}

function pickReusablePendingCodex(
  rows: IAgentToolCall[],
  workspaceId: string,
): IAgentToolCall | undefined {
  const list = rows.filter(
    (tc) =>
      tc.toolName === 'codex.exec' &&
      tc.workspaceId === workspaceId &&
      (tc.status === 'pending' || tc.status === 'awaiting_approval'),
  );
  if (!list.length) return undefined;
  return [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
}

/** Agent 工作台对话持久化字段（写入 rd_agent_sessions.metadata） */
const WORKBENCH_CHAT_META_KEY = 'workbenchChatMessages';

function serializeWorkbenchChat(messages: IAgentChatMessage[]): Record<string, unknown>[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    variant: m.variant,
    streaming: false,
    durationMs: m.durationMs ?? undefined,
    exitCode: m.exitCode ?? undefined,
  }));
}

function parsePersistedWorkbenchChat(meta: unknown): IAgentChatMessage[] | null {
  if (!Array.isArray(meta)) return null;
  const out: IAgentChatMessage[] = [];
  for (const row of meta) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    const role = r.role === 'user' || r.role === 'assistant' ? r.role : null;
    const content = typeof r.content === 'string' ? r.content : '';
    const createdAt = typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString();
    if (!id || !role) continue;
    const variant = r.variant === 'plan' || r.variant === 'codex' ? r.variant : undefined;
    const durationMs =
      typeof r.durationMs === 'number' && Number.isFinite(r.durationMs) ? r.durationMs : undefined;
    const exitCode =
      typeof r.exitCode === 'number' && Number.isFinite(r.exitCode) ? r.exitCode : undefined;
    out.push({ id, role, content, createdAt, variant, streaming: false, durationMs, exitCode });
  }
  return out.length ? out : null;
}

function hydrateChatMessagesForSession(session: IAgentSession): IAgentChatMessage[] {
  const planBody = session.planMarkdown?.trim() || '（暂无 plan，请完成步骤 1 生成编码提示词）';
  const planId = `plan-${session.id}`;
  const raw = session.metadata?.[WORKBENCH_CHAT_META_KEY];
  const persisted = parsePersistedWorkbenchChat(raw);
  if (persisted?.length) {
    const first = persisted[0];
    if (first.variant === 'plan' && first.role === 'assistant') {
      return [
        { ...first, content: planBody, streaming: false },
        ...persisted.slice(1).map((m) => ({ ...m, streaming: false })),
      ];
    }
    return [
      {
        id: planId,
        role: 'assistant',
        content: planBody,
        createdAt: session.createdAt,
        variant: 'plan',
      },
      ...persisted.map((m) => ({ ...m, streaming: false })),
    ];
  }
  return [
    {
      id: planId,
      role: 'assistant',
      content: planBody,
      createdAt: session.createdAt,
      variant: 'plan',
    },
  ];
}

/** 与步骤 1/2 完成态对齐：默认展示「第一个未完成」对应的设置 Tab */
function workbenchSetupTabForProgress(step1Done: boolean, step2Done: boolean): 'thread' | 'workspace' | 'tool' {
  if (!step1Done) return 'thread';
  if (!step2Done) return 'workspace';
  return 'tool';
}

function formatAgentSessionPickLabel(session: IAgentSession): string {
  const t = session.createdAt?.slice(0, 16)?.replace('T', ' ') ?? '';
  const tail = session.pipelineRunId ? ' · 流水线' : '';
  return `${session.title || session.id}${tail} · ${t}`;
}

export function AgentWorkbenchPanel({ task, operatorName }: IAgentWorkbenchPanelProps) {
  const [instruction, setInstruction] = useState(
    '请根据 PRD、功能规格(FS)、技术规格(TS) 与编码计划（CP）完成编码与验证。',
  );
  const [codingTool, setCodingTool] = useState<ICodingToolChoice>('codex_cli');
  const [runtimeOutput, setRuntimeOutput] = useState('');
  const [runtimeState, setRuntimeState] = useState<ICodexRuntimeState>(initialCodexRuntimeState);
  const [chatMessages, setChatMessages] = useState<IAgentChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const chatTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [aiSkillsForSlash, setAiSkillsForSlash] = useState<IAiSkillConfig[]>([]);
  const [slashMenu, setSlashMenu] = useState<{ start: number; filter: string } | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [atMenu, setAtMenu] = useState<{ start: number; filter: string } | null>(null);
  const [atActiveIndex, setAtActiveIndex] = useState(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const logsPreRef = useRef<HTMLPreElement | null>(null);
  const [, bumpStreamingClock] = useReducer((x: number) => x + 1, 0);
  const skipNextChatPersistRef = useRef(false);
  const hydratedChatSessionIdRef = useRef<string | null>(null);

  const { data: runs = [] } = usePipelineRunsList(task.requirementId);
  const latestRun = latestByTime(runs);
  const { data: sessions = [] } = useAgentSessionsList({ requirementId: task.requirementId });
  const pipelineLinkedSession = useMemo<IAgentSession | undefined>(
    () => sessions.find((session) => session.pipelineRunId === latestRun?.id) || latestByTime(sessions),
    [latestRun?.id, sessions],
  );
  const [historySessionId, setHistorySessionId] = useState<string | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [workbenchSetupTab, setWorkbenchSetupTab] = useState<'thread' | 'workspace' | 'tool'>('thread');

  useEffect(() => {
    setHistorySessionId(null);
  }, [latestRun?.id]);

  const activeSession = useMemo<IAgentSession | undefined>(() => {
    const id = historySessionId ?? pipelineLinkedSession?.id;
    if (!id) return undefined;
    return sessions.find((s) => s.id === id) ?? pipelineLinkedSession;
  }, [sessions, historySessionId, pipelineLinkedSession]);
  const { data: tasks = [] } = useAgentTasks(activeSession?.id);
  const { data: toolCalls = [] } = useAgentToolCalls(activeSession?.id, undefined, {
    pollWhileCodexRunningMs: 2500,
  });
  const { data: workspaces = [] } = useAgentWorkspaces(activeSession?.id);
  const reviewSummary = useMemo(() => buildAgentDiffReviewSummary(toolCalls), [toolCalls]);

  const createPipelineRun = useCreatePipelineRun();
  const createContextPack = useCreateContextPack();
  const createAgentSession = useCreateAgentSession();
  const upsertAgentTask = useUpsertAgentTask();
  const provisionWorkspace = useProvisionAgentWorkspace();
  const executeWorkspaceLifecycle = useExecuteAgentWorkspaceLifecycle();
  const prepareToolCall = usePrepareAgentToolCall();
  const approveToolCall = useApproveAgentToolCall();
  const runCodexToolCall = useRunAgentToolCallWithCodex();
  const cancelCodexExecution = useCancelAgentToolCallExecution();
  const patchSessionMetadata = usePatchAgentSessionMetadata();

  const isBusy =
    createPipelineRun.isPending ||
    createContextPack.isPending ||
    createAgentSession.isPending ||
    upsertAgentTask.isPending ||
    provisionWorkspace.isPending ||
    executeWorkspaceLifecycle.isPending ||
    prepareToolCall.isPending ||
    approveToolCall.isPending;

  const latestCodexToolCall = useMemo(
    () =>
      [...toolCalls]
        .filter((tc) => tc.toolName === 'codex.exec')
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0],
    [toolCalls],
  );
  const runningCodexToolCall = useMemo(
    () => toolCalls.find((tc) => tc.toolName === 'codex.exec' && tc.status === 'running'),
    [toolCalls],
  );
  const isCodexRunning =
    Boolean(runningCodexToolCall) || runCodexToolCall.isPending || prepareToolCall.isPending;

  useEffect(() => {
    const busy = Boolean(runningCodexToolCall) || runCodexToolCall.isPending;
    if (!busy) return;
    const id = window.setInterval(() => bumpStreamingClock(), 1000);
    return () => window.clearInterval(id);
  }, [runningCodexToolCall, runCodexToolCall.isPending]);

  const readyWorkspace = useMemo(
    () => workspaces.find((w) => w.status === 'ready' && Boolean(w.worktreePath?.trim())),
    [workspaces],
  );
  const primaryWorkspace = useMemo(() => pickWorkspaceForSession(workspaces), [workspaces]);
  const isCodexWorkspaceReady = Boolean(readyWorkspace);
  const displayWorkspace = readyWorkspace ?? primaryWorkspace;

  /** 仅对已就绪 Workspace 拉源树；未就绪时用 primary id 会触发「缺少 worktreePath」类接口错误 */
  const workspaceSourceTreeQuery = useAgentWorkspaceSourceTree(readyWorkspace?.id);
  const workspaceTree = workspaceSourceTreeQuery.data;

  const step1Done = Boolean(activeSession);
  const step2Done = isCodexWorkspaceReady;
  useEffect(() => {
    setWorkbenchSetupTab(workbenchSetupTabForProgress(step1Done, step2Done));
  }, [task.id, activeSession?.id, step1Done, step2Done]);

  const step3LatestCodexRound = useMemo(() => {
    const tc = latestCodexToolCall;
    if (!tc || tc.toolName !== 'codex.exec') return null;
    return tc;
  }, [latestCodexToolCall]);

  const step3TabStatus = useMemo(() => {
    if (!step2Done) return 'blocked' as const;
    if (isCodexRunning) return 'running' as const;
    const tc = step3LatestCodexRound;
    if (!tc) return 'idle' as const;
    if (tc.status === 'succeeded') return 'succeeded' as const;
    if (tc.status === 'failed' || tc.status === 'cancelled') return 'stopped' as const;
    return 'idle' as const;
  }, [step2Done, isCodexRunning, step3LatestCodexRound]);

  const pendingApprovals = useMemo(
    () => toolCalls.filter((tc) => tc.approvalStatus === 'pending'),
    [toolCalls],
  );

  const appendLog = (line: string) => {
    setRuntimeOutput((prev) => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}${line}\n`);
  };

  const handleChatAppendUser = () => {
    const text = chatDraft.trim();
    if (!text || !activeSession) return;
    setChatMessages((prev) => [
      ...prev,
      { id: newChatMessageId(), role: 'user', content: text, createdAt: new Date().toISOString() },
    ]);
    setChatDraft('');
    setSlashMenu(null);
    setAtMenu(null);
  };

  const codexServerSyncKey = latestCodexToolCall
    ? `${latestCodexToolCall.id}:${latestCodexToolCall.status}:${String(latestCodexToolCall.metadata?.lastOutputAt ?? '')}:${String(latestCodexToolCall.metadata?.executorLogPath ?? '')}:${String(latestCodexToolCall.updatedAt ?? '')}`
    : '';

  /** 切换会话时从服务端 metadata 恢复对话（妙搭式历史） */
  useEffect(() => {
    if (!activeSession?.id) {
      setChatMessages([]);
      hydratedChatSessionIdRef.current = null;
      return;
    }
    skipNextChatPersistRef.current = true;
    setChatMessages(hydrateChatMessagesForSession(activeSession));
    hydratedChatSessionIdRef.current = activeSession.id;
    const rid = requestAnimationFrame(() => {
      skipNextChatPersistRef.current = false;
    });
    return () => cancelAnimationFrame(rid);
  }, [activeSession?.id]);

  /** 同一会话内 Plan 文案随服务端更新 */
  useEffect(() => {
    if (!activeSession?.id) return;
    const planBody = activeSession.planMarkdown?.trim() || '（暂无 plan，请完成步骤 1 生成编码提示词）';
    const planId = `plan-${activeSession.id}`;
    setChatMessages((prev) => {
      if (!prev.length || prev[0]?.variant !== 'plan') return prev;
      if (prev[0].content === planBody) return prev;
      if (prev[0].id !== planId && prev[0].variant === 'plan') {
        return [{ ...prev[0], id: planId, content: planBody }, ...prev.slice(1)];
      }
      return [{ ...prev[0], content: planBody }, ...prev.slice(1)];
    });
  }, [activeSession?.id, activeSession?.planMarkdown]);

  /** 对话持久化（防抖写入会话 metadata） */
  useEffect(() => {
    if (!activeSession?.id || skipNextChatPersistRef.current) return;
    if (hydratedChatSessionIdRef.current !== activeSession.id) return;
    if (!chatMessages.length) return;
    const sid = activeSession.id;
    const payload = serializeWorkbenchChat(chatMessages);
    const handle = window.setTimeout(() => {
      if (skipNextChatPersistRef.current) return;
      patchSessionMetadata.mutate({
        id: sid,
        patch: { [WORKBENCH_CHAT_META_KEY]: payload },
        updatedBy: operatorName ?? null,
      });
    }, 650);
    return () => window.clearTimeout(handle);
    // patchSessionMetadata 引用稳定，不参与依赖以免多余触发
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate 来自 React Query，语义稳定
  }, [chatMessages, activeSession?.id, operatorName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
  }, [chatMessages, bumpStreamingClock]);

  useEffect(() => {
    if (!logsDialogOpen) return;
    const el = logsPreRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logsDialogOpen, runtimeOutput]);

  useEffect(() => {
    if (runCodexToolCall.isPending) return;
    if (!latestCodexToolCall || latestCodexToolCall.toolName !== 'codex.exec') return;
    const m = latestCodexToolCall.metadata;
    const logPath = typeof m.executorLogPath === 'string' ? m.executorLogPath : '';
    const stdout = typeof m.stdout === 'string' ? m.stdout : '';
    const stderr = typeof m.stderr === 'string' ? m.stderr : '';
    if (!logPath && !stdout && !stderr) return;
    const header = [
      logPath
        ? `【服务端完整日志文件】${logPath}\n（全文落盘；数据库仅保留末尾约 20KB 摘要。离开页面后请用该文件或下方摘要排查。）\n`
        : '',
      latestCodexToolCall.status === 'running'
        ? '【执行状态】running：Codex 可能仍在服务端执行；本页每 2.5s 拉取一次数据库中的输出摘要。\n'
        : `【执行状态】${latestCodexToolCall.status} exit=${latestCodexToolCall.exitCode ?? '—'}\n`,
      '---\n',
    ].join('');
    const body = [stdout, stderr ? `\n--- stderr（尾部） ---\n${stderr}` : ''].join('');
    setRuntimeOutput(`${header}${body}`);
  }, [codexServerSyncKey, runCodexToolCall.isPending, latestCodexToolCall]);

  const handleCreateThread = async () => {
    try {
      const run =
        latestRun ||
        (await createPipelineRun.mutateAsync({
          requirementId: task.requirementId,
          pipelineTaskId: task.id,
          status: 'queued',
          triggerMode: 'agent',
          contextSnapshot: {
            gitUrl: task.pipelineMeta.gitUrl,
            branch: task.pipelineMeta.branch,
            sandboxUrl: task.pipelineMeta.sandboxUrl,
            pipelineTaskId: task.id,
            workspaceProductSlug: task.pipelineMeta.workspaceProductSlug,
            workspaceSessionFolder: task.pipelineMeta.workspaceSessionFolder,
          },
          createdBy: operatorName,
        }));
      const contextPack = await createContextPack.mutateAsync({
        requirementId: task.requirementId,
        pipelineRunId: run.id,
        prdId: task.pipelineMeta.prdIds?.[0],
        specId: task.pipelineMeta.specIds?.[0],
        createdBy: operatorName,
      });
      const planSkill = await getAiSkill(AGENT_WORKBENCH_PLAN_SKILL_ID);
      const goalText = instruction.trim() || '请基于 ContextPack 完成本需求的代码实现与验证。';
      const planMarkdown = fillAiSkillPromptTemplate(planSkill.promptTemplate, {
        requirement_title: task.requirementTitle,
        instruction: goalText,
      });
      const runtimeAdapter =
        codingTool === 'codex_cli' ? 'codex_cli' : codingTool === 'claude_code' ? 'claude_code' : 'custom';
      const session = await createAgentSession.mutateAsync({
        requirementId: task.requirementId,
        pipelineRunId: run.id,
        contextPackId: contextPack.id,
        title: `${task.requirementTitle} · Agent`,
        status: 'awaiting_approval',
        runtimeAdapter,
        baseBranch: task.pipelineMeta.branch || 'main',
        planMarkdown,
        riskLevel: 'medium',
        metadata: { instruction, contextPackChecksum: contextPack.checksum },
        createdBy: operatorName,
      });
      await upsertAgentTask.mutateAsync({
        sessionId: session.id,
        role: 'planner',
        title: '生成编码提示词',
        instructions: instruction,
        status: 'awaiting_approval',
        orderIndex: 1,
        locked: true,
        requiresApproval: true,
        metadata: { contextPackId: contextPack.id },
      });
      appendLog(`[步骤1] Agent Thread 已创建，ContextPack 已写入 PRD/规格 等文档快照（checksum=${contextPack.checksum.slice(0, 8)}…）`);
      toast.success('步骤 1 完成：已生成编码提示词与任务线程');
      setWorkbenchSetupTab('workspace');
    } catch (error) {
      logger.error('创建 Agent Thread 失败', error);
      toast.error(error instanceof Error ? error.message : '创建 Agent Thread 失败');
    }
  };

  const ensurePlannerApproved = async (session: IAgentSession) => {
    await upsertAgentTask.mutateAsync({
      sessionId: session.id,
      role: 'planner',
      title: '提示词已确认',
      instructions: session.planMarkdown || instruction,
      status: 'succeeded',
      orderIndex: 1,
      locked: true,
      requiresApproval: false,
      metadata: { approvedBy: operatorName, approvedAt: new Date().toISOString() },
    });
  };

  const ensureCodexToolPrepared = async (session: IAgentSession, workspaceId: string) => {
    await prepareToolCall.mutateAsync({
      sessionId: session.id,
      workspaceId,
      toolName: 'codex.exec',
      toolCategory: 'ai',
      inputSummary: '在隔离 workspace 中执行编码任务（Codex CLI）',
      command: 'codex exec --cd <workspace> --sandbox workspace-write <prompt>',
      metadata: {
        stage: 'workspace-ready',
        prompt: session.planMarkdown || instruction,
      },
    });
  };

  /** 步骤 2：批准提示词、按需创建 Workspace、拉取仓库与文档目录、执行 git 生命周期直至 ready */
  const handlePrepareWorkspace = async () => {
    if (!activeSession) {
      toast.error('请先完成步骤 1');
      return;
    }
    if (!task.pipelineMeta.gitUrl?.trim()) {
      toast.error('流水线未配置 Git 地址，无法准备 Workspace');
      return;
    }
    try {
      appendLog('[步骤2] 开始：确认提示词 → 准备仓库与 Workspace…');
      await ensurePlannerApproved(activeSession);

      let workspace = primaryWorkspace;
      const needNewWorkspace =
        !workspace || workspace.status === 'failed' || workspace.status === 'archived';

      if (needNewWorkspace) {
        appendLog('[步骤2] 创建 Workspace 计划并登记 git 生命周期…');
        const result = await provisionWorkspace.mutateAsync({
          sessionId: activeSession.id,
          repoUrl: task.pipelineMeta.gitUrl,
          baseBranch: task.pipelineMeta.branch || activeSession.baseBranch || 'main',
          createdBy: operatorName,
          kind: 'worktree',
          productSlug: task.pipelineMeta.workspaceProductSlug,
          sessionFolderName: task.pipelineMeta.workspaceSessionFolder,
        });
        workspace = result.workspace;
        appendLog(`[步骤2] Workspace 已登记：${workspace.id}`);
        await ensureCodexToolPrepared(activeSession, workspace.id);
      } else {
        const hasCodexForWs = toolCalls.some(
          (tc) => tc.toolName === 'codex.exec' && tc.workspaceId === workspace!.id,
        );
        if (!hasCodexForWs) {
          appendLog('[步骤2] 补充 Codex 工具调用记录…');
          await ensureCodexToolPrepared(activeSession, workspace!.id);
        }
      }

      if (!workspace) {
        throw new Error('未能解析 Workspace');
      }

      if (workspace.status !== 'ready' || !workspace.worktreePath?.trim()) {
        appendLog('[步骤2] 执行 clone/fetch/worktree 等生命周期命令…');
        const life = await executeWorkspaceLifecycle.mutateAsync({
          id: workspace.id,
          sessionId: activeSession.id,
        });
        for (const tc of life.toolCalls) {
          appendLog(`[步骤2] ${tc.toolName} → ${tc.status} (exit=${tc.exitCode ?? '-'})`);
          if (tc.status === 'failed' && (tc.outputSummary || tc.metadata)) {
            const tail = (tc.outputSummary || '').trim();
            if (tail) {
              appendLog(`[步骤2][${tc.toolName} 输出]\n${tail}`);
            }
          }
        }
        appendLog(`[步骤2] Workspace 状态：${life.workspace.status}`);
        if (life.workspace.status !== 'ready') {
          const failed = [...life.toolCalls].reverse().find((tc) => tc.status === 'failed');
          const detail = (failed?.outputSummary || '').trim().slice(0, 1200);
          const hint =
            /Permission denied \(publickey\)/i.test(detail) || /publickey/i.test(detail)
              ? '（常见原因：流水线填了 SSH 地址，但运行后端的环境未配置 SSH 私钥；可改为 HTTPS + Token 或配置 deploy key。）'
              : /could not read from remote/i.test(detail) || /unable to access/i.test(detail)
                ? '（常见原因：仓库私有、网络不可达或需代理。）'
                : /fatal: invalid branch name|not found in upstream/i.test(detail) || /couldn't find remote ref/i.test(detail)
                  ? '（常见原因：基准分支名与远端不一致，请检查流水线里的分支是否为远端存在的分支，例如 main / master。）'
                  : /already exists/i.test(detail)
                    ? '（常见原因：缓存目录残留；已尝试自动清理，若仍失败请手动删除对应 /tmp/rd-agent-workspaces/cache 子目录后重试。）'
                    : '';
          if (detail) {
            appendLog(`[步骤2][诊断]${hint}`);
            toast.error('Workspace 准备失败', { description: `${detail.slice(0, 500)}${hint ? `\n${hint}` : ''}` });
          } else {
            toast.error('Workspace 准备未完成', {
              description: `状态：${life.workspace.status}。请检查 Git 地址、分支与运行环境的网络/权限。`,
            });
          }
          return;
        }
      } else {
        appendLog('[步骤2] Workspace 已处于 ready，跳过生命周期');
      }

      toast.success('步骤 2 完成：仓库与文档上下文已就绪');
      setWorkbenchSetupTab('tool');
    } catch (error) {
      logger.error('准备 Workspace 失败', error);
      appendLog(`[步骤2][错误] ${error instanceof Error ? error.message : '准备 Workspace 失败'}`);
      toast.error(error instanceof Error ? error.message : '准备 Workspace 失败');
    }
  };

  const handleApproveTool = async (toolCallId: string) => {
    if (!activeSession) return;
    try {
      await approveToolCall.mutateAsync({
        id: toolCallId,
        sessionId: activeSession.id,
        approved: true,
        approver: operatorName,
        reason: '工作台批准',
      });
      toast.success('工具调用已批准');
    } catch (error) {
      logger.error('批准工具调用失败', error);
      toast.error('批准失败');
    }
  };

  /** 每轮独立 Codex：复用尚未执行的 pending 行，否则新建 tool call；stdout 流式写入对话气泡与底部输出流 */
  const executeCodexRound = async (opts: { appendUserFromDraft: boolean }) => {
    if (codingTool !== 'codex_cli') {
      toast.message('该编码工具尚未接入', { description: '请暂时选择 Codex CLI' });
      return;
    }
    if (!activeSession) {
      toast.error('请先完成步骤 1');
      return;
    }
    if (!readyWorkspace?.id) {
      toast.error('Workspace 未就绪，请先完成步骤 2');
      return;
    }
    const workspaceId = readyWorkspace.id;
    const plan = activeSession.planMarkdown || '';
    const userText = opts.appendUserFromDraft ? chatDraft.trim() : '';
    if (opts.appendUserFromDraft && !userText) {
      toast.error('请输入本轮编码指令');
      return;
    }

    const snapshotForPrior: IAgentChatMessage[] =
      opts.appendUserFromDraft && userText
        ? [
            ...chatMessages,
            {
              id: newChatMessageId(),
              role: 'user',
              content: userText,
              createdAt: new Date().toISOString(),
            },
          ]
        : [...chatMessages];
    const priorTurns = extractCompletedPriorTurns(snapshotForPrior);
    const executionPrompt = buildSingleTurnCodexPrompt(
      plan,
      opts.appendUserFromDraft ? userText : null,
      priorTurns,
      instruction,
    ).trim();
    if (!executionPrompt) {
      toast.error('提示词为空：请完成步骤 1');
      return;
    }

    const replyAssistantId = newChatMessageId();
    const assistantBubble: IAgentChatMessage = {
      id: replyAssistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      variant: 'codex',
      streaming: true,
    };
    setChatMessages(() => [...snapshotForPrior, assistantBubble]);
    if (opts.appendUserFromDraft) setChatDraft('');

    appendLog('[Codex] 启动本轮执行…');
    setRuntimeOutput((prev) => `${prev}\n--- 新轮次 ---\n`);
    setRuntimeState({
      ...initialCodexRuntimeState,
      phase: 'starting',
      toolCallId: undefined,
      startedAt: new Date().toISOString(),
    });

    const bumpAssistant = (chunk: string) => {
      if (!chunk) return;
      setChatMessages((prev) =>
        prev.map((m) => (m.id === replyAssistantId ? { ...m, content: m.content + chunk } : m)),
      );
      setRuntimeOutput((prev) => `${prev}${chunk}`);
    };

    const assistantClosedRef = { current: false };
    const closeAssistantOnce = (
      tail: string,
      markRuntimeError: boolean,
      meta?: { durationMs?: number | null; exitCode?: number | null },
    ) => {
      if (assistantClosedRef.current) return;
      assistantClosedRef.current = true;
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === replyAssistantId
            ? {
                ...m,
                streaming: false,
                content: `${m.content}${tail}`,
                ...(meta
                  ? {
                      durationMs: meta.durationMs ?? undefined,
                      exitCode: meta.exitCode ?? undefined,
                    }
                  : {}),
              }
            : m,
        ),
      );
      if (markRuntimeError) {
        setRuntimeState((prev) => ({
          ...prev,
          phase: 'error',
          lastEventAt: new Date().toISOString(),
        }));
      }
    };

    let runnableToolCall: IAgentToolCall;
    try {
      const pending = pickReusablePendingCodex(toolCalls, workspaceId);
      if (pending) {
        if (pending.approvalStatus === 'pending') {
          toast.error('请先在工作台批准待审的 Codex 工具调用');
          closeAssistantOnce('\n\n【已取消】存在待审批工具调用。', false);
          return;
        }
        runnableToolCall = pending;
      } else {
        runnableToolCall = await prepareToolCall.mutateAsync({
          sessionId: activeSession.id,
          workspaceId,
          toolName: 'codex.exec',
          toolCategory: 'ai',
          inputSummary: 'Codex — 对话中一轮',
          command: 'codex exec --cd <workspace> --sandbox workspace-write <prompt>',
          metadata: { prompt: executionPrompt, chatReplyId: replyAssistantId },
        });
      }

      setRuntimeState((prev) => ({
        ...prev,
        toolCallId: runnableToolCall.id,
      }));

      await runCodexToolCall.mutateAsync({
        id: runnableToolCall.id,
        sessionId: activeSession.id,
        prompt: executionPrompt,
        onEvent: (event: IAgentExecutionEvent) => {
          if (event.type === 'started') {
            setRuntimeState((prev) => ({
              ...prev,
              phase: 'starting',
              toolCallId: event.toolCallId,
              status: event.status || prev.status,
              lastEventAt: new Date().toISOString(),
            }));
            appendLog('[Codex] 已启动');
          }
          if (event.type === 'spawned') {
            setRuntimeState((prev) => ({
              ...prev,
              phase: 'spawned',
              toolCallId: event.toolCallId,
              pid: event.pid,
              cwd: event.cwd,
              command: event.command,
              status: event.status || prev.status,
              lastEventAt: event.timestamp || new Date().toISOString(),
            }));
            appendLog(`[Codex] pid=${event.pid ?? '?'} cwd=${event.cwd || '-'}`);
          }
          if (event.type === 'stdout' && event.chunk) {
            setRuntimeState((prev) => ({
              ...prev,
              phase: 'running',
              toolCallId: event.toolCallId,
              status: event.status || prev.status,
              stdoutBytes: event.stdoutBytes ?? prev.stdoutBytes,
              stderrBytes: event.stderrBytes ?? prev.stderrBytes,
              lastEventAt: event.timestamp || new Date().toISOString(),
            }));
            bumpAssistant(event.chunk);
          }
          if (event.type === 'stderr' && event.chunk) {
            setRuntimeState((prev) => ({
              ...prev,
              phase: 'running',
              toolCallId: event.toolCallId,
              status: event.status || prev.status,
              stdoutBytes: event.stdoutBytes ?? prev.stdoutBytes,
              stderrBytes: event.stderrBytes ?? prev.stderrBytes,
              lastEventAt: event.timestamp || new Date().toISOString(),
            }));
            setRuntimeOutput((prev) => `${prev}[stderr] ${event.chunk}`);
          }
          if (event.type === 'heartbeat') {
            setRuntimeState((prev) => ({
              ...prev,
              phase: 'running',
              toolCallId: event.toolCallId,
              status: event.status || prev.status,
              durationMs: event.durationMs ?? prev.durationMs,
              stdoutBytes: event.stdoutBytes ?? prev.stdoutBytes,
              stderrBytes: event.stderrBytes ?? prev.stderrBytes,
              lastEventAt: event.timestamp || new Date().toISOString(),
            }));
          }
          if (event.type === 'error') {
            setRuntimeState((prev) => ({
              ...prev,
              phase: 'error',
              toolCallId: event.toolCallId,
              status: event.status || prev.status,
              message: event.message || '执行失败',
              lastEventAt: event.timestamp || new Date().toISOString(),
            }));
            appendLog(`[Codex][错误] ${event.message || '执行失败'}`);
            closeAssistantOnce(`\n\n【错误】${event.message || '执行失败'}`, true);
          }
          if (event.type === 'finished') {
            setRuntimeState((prev) => ({
              ...prev,
              phase: 'finished',
              toolCallId: event.toolCallId,
              status: event.status || prev.status,
              exitCode: event.exitCode,
              durationMs: event.durationMs,
              stdoutBytes: event.stdoutBytes ?? prev.stdoutBytes,
              stderrBytes: event.stderrBytes ?? prev.stderrBytes,
              changedFilesCount: event.changedFilesCount ?? prev.changedFilesCount,
              lastEventAt: event.timestamp || new Date().toISOString(),
            }));
            appendLog(
              `[Codex] 结束 exit=${event.exitCode ?? '?'} 耗时=${event.durationMs ?? 0}ms 变更文件≈${event.changedFilesCount ?? 0}`,
            );
            closeAssistantOnce(
              `\n\n---\nexit=${event.exitCode ?? '—'} · ${event.durationMs ?? 0}ms · 变更≈${event.changedFilesCount ?? 0}`,
              false,
              { durationMs: event.durationMs ?? null, exitCode: event.exitCode ?? null },
            );
          }
        },
      });
      toast.success('本轮编码已结束');
    } catch (error) {
      const msg = error instanceof Error ? error.message : '编码任务失败';
      setRuntimeState((prev) => ({
        ...prev,
        phase: 'error',
        message: msg,
        lastEventAt: new Date().toISOString(),
      }));
      closeAssistantOnce(`\n\n【异常】${msg}`, true);
      logger.error('编码任务失败', error);
      toast.error(msg);
    }
  };

  const handleRunCoding = async () => {
    await executeCodexRound({ appendUserFromDraft: false });
  };

  const handleChatSendAndExecute = async () => {
    await executeCodexRound({ appendUserFromDraft: true });
  };

  const handleCancelCodex = async () => {
    if (!activeSession || !runningCodexToolCall) return;
    try {
      await cancelCodexExecution.mutateAsync({
        id: runningCodexToolCall.id,
        sessionId: activeSession.id,
      });
      appendLog('[Codex] 已请求停止当前进程');
      toast.success('已请求停止');
    } catch (error) {
      logger.error('停止失败', error);
      toast.error(error instanceof Error ? error.message : '停止失败');
    }
  };

  const runtimePlaceholder =
    '日志：步骤 2 的 Workspace 命令与步骤 3/4 的编码输出将显示在此处。';

  const codexStreamingElapsedMs = useMemo(() => {
    const busy = Boolean(runningCodexToolCall) || runCodexToolCall.isPending;
    if (!busy || !runtimeState.startedAt) return 0;
    return Math.max(0, Date.now() - Date.parse(runtimeState.startedAt));
  }, [runningCodexToolCall, runCodexToolCall.isPending, runtimeState.startedAt, bumpStreamingClock]);

  const canComposerRunCodex =
    step2Done &&
    Boolean(readyWorkspace) &&
    !isCodexRunning &&
    codingTool === 'codex_cli' &&
    !runCodexToolCall.isPending;

  useEffect(() => {
    let cancelled = false;
    void listAiSkills()
      .then((list) => {
        if (!cancelled) setAiSkillsForSlash(list);
      })
      .catch((err) => {
        logger.warn('[AgentWorkbench] listAiSkills failed', err);
        if (!cancelled) setAiSkillsForSlash([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const slashRows = useMemo((): IAgentWorkbenchSlashRow[] => {
    const builtins = buildBuiltinSlashRows();
    const fromRemote: IAgentWorkbenchSlashRow[] = aiSkillsForSlash.map((s) => ({
      key: `skill:${s.id}`,
      name: s.name,
      description: s.description?.trim() || truncateOneLine(s.promptTemplate, 100),
      Icon: skillIconForSkillId(s.id),
      buildInsert: ({ requirementTitle }) => buildAiSkillSlashInsert(s, requirementTitle),
    }));
    return [...builtins, ...fromRemote];
  }, [aiSkillsForSlash]);

  const slashFiltered = useMemo(() => {
    if (!slashMenu) return [];
    const q = slashMenu.filter.trim().toLowerCase();
    if (!q) return slashRows;
    return slashRows.filter(
      (r) =>
        r.key.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    );
  }, [slashRows, slashMenu]);

  const atFileIndex = useMemo(() => {
    const paths = new Set<string>();
    for (const doc of task.pipelineMeta.publishedDocuments ?? []) {
      const p = doc.path?.trim();
      if (p) paths.add(p);
    }
    for (const p of flattenAgentWorkspaceFilePaths(workspaceTree?.nodes ?? [])) {
      paths.add(p);
    }
    return [...paths].sort((a, b) => a.localeCompare(b, 'en'));
  }, [task.pipelineMeta.publishedDocuments, workspaceTree?.nodes]);

  const atFiltered = useMemo(() => {
    if (!atMenu) return [];
    const q = atMenu.filter.trim().toLowerCase();
    const base = !q
      ? atFileIndex
      : atFileIndex.filter((p) => {
          const pl = p.toLowerCase();
          return pl.includes(q) || pl.split('/').pop()?.toLowerCase().includes(q);
        });
    return base.slice(0, 120);
  }, [atFileIndex, atMenu]);

  const atPickerEmptyHint = useMemo(() => {
    if (atFileIndex.length > 0) {
      const raw = atMenu?.filter.trim() ?? '';
      return raw
        ? `没有匹配「${raw}」的路径，请调整关键词或按 Esc 关闭`
        : '没有可展示的路径，请按 Esc 关闭';
    }
    if (!readyWorkspace?.id) {
      return '暂无匹配文件。请先完成「准备 Workspace」以加载仓库目录；已发布的 PRD/规格路径也会出现在此列表。';
    }
    if (workspaceSourceTreeQuery.isFetching && workspaceSourceTreeQuery.data === undefined) {
      return '正在加载仓库文件列表…';
    }
    if (workspaceSourceTreeQuery.isError) {
      const m =
        workspaceSourceTreeQuery.error instanceof Error
          ? workspaceSourceTreeQuery.error.message
          : String(workspaceSourceTreeQuery.error ?? '未知错误');
      return `无法加载仓库文件列表：${m}`;
    }
    return '暂无可选路径：仓库中暂无已索引的源文件，且当前流水线未挂载已发布 PRD/规格路径。';
  }, [
    atFileIndex.length,
    atMenu?.filter,
    readyWorkspace?.id,
    workspaceSourceTreeQuery.isFetching,
    workspaceSourceTreeQuery.data,
    workspaceSourceTreeQuery.isError,
    workspaceSourceTreeQuery.error,
  ]);

  useEffect(() => {
    if (!slashMenu) return;
    setSlashActiveIndex(0);
  }, [slashMenu?.start, slashMenu?.filter]); // eslint-disable-line react-hooks/exhaustive-deps -- 仅当 / 段或筛选串变化时归零，避免 slashMenu 新对象引用每键触发

  useEffect(() => {
    if (!atMenu) return;
    setAtActiveIndex(0);
  }, [atMenu?.start, atMenu?.filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const applySlashSelection = useCallback(
    (row: IAgentWorkbenchSlashRow) => {
      const sm = slashMenu;
      if (!sm) return;
      const ta = chatTextareaRef.current;
      const end = ta?.selectionStart ?? chatDraft.length;
      const insert = row.buildInsert({ requirementTitle: task.requirementTitle });
      const nextDraft = chatDraft.slice(0, sm.start) + insert + chatDraft.slice(end);
      setChatDraft(nextDraft);
      setSlashMenu(null);
      setAtMenu(null);
      requestAnimationFrame(() => {
        if (!ta) return;
        const pos = sm.start + insert.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
    },
    [slashMenu, chatDraft, task.requirementTitle],
  );

  const applyAtSelection = useCallback(
    (path: string) => {
      const am = atMenu;
      if (!am) return;
      const ta = chatTextareaRef.current;
      const end = ta?.selectionStart ?? chatDraft.length;
      const insert = `@${path}`;
      const nextDraft = chatDraft.slice(0, am.start) + insert + chatDraft.slice(end);
      setChatDraft(nextDraft);
      setAtMenu(null);
      setSlashMenu(null);
      requestAnimationFrame(() => {
        if (!ta) return;
        const pos = am.start + insert.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
    },
    [atMenu, chatDraft],
  );

  const syncComposerMenusFromTextarea = useCallback(() => {
    const ta = chatTextareaRef.current;
    if (!ta) return;
    let c = ta.selectionStart ?? ta.value.length;
    const v = ta.value;
    const normS = v.replace(/／/g, '/');
    const normA = v.replace(/＠/g, '@');
    if (normS === '/' && c === 0) c = 1;
    if (normA === '@' && c === 0) c = 1;
    const { slash, at } = reconcileComposerMentions(v, c);
    setSlashMenu(slash);
    setAtMenu(at);
  }, []);

  const openSkillPaletteFromToolbar = useCallback(() => {
    if (!step1Done) return;
    const ta = chatTextareaRef.current;
    const next = chatDraft.length === 0 || chatDraft.endsWith('\n') ? `${chatDraft}/` : `${chatDraft}\n/`;
    setChatDraft(next);
    setAtMenu(null);
    setSlashMenu(parseSlashTrigger(next, next.length));
    requestAnimationFrame(() => {
      ta?.focus();
      const pos = next.length;
      ta?.setSelectionRange(pos, pos);
    });
  }, [chatDraft, step1Done]);

  const openFilePaletteFromToolbar = useCallback(() => {
    if (!step1Done) return;
    const ta = chatTextareaRef.current;
    const next = chatDraft.length === 0 || chatDraft.endsWith('\n') ? `${chatDraft}@` : `${chatDraft}\n@`;
    setChatDraft(next);
    setSlashMenu(null);
    setAtMenu(parseAtTrigger(next, next.length));
    requestAnimationFrame(() => {
      ta?.focus();
      const pos = next.length;
      ta?.setSelectionRange(pos, pos);
    });
  }, [chatDraft, step1Done]);

  const stepper = (
    <div className="space-y-6">
      <Tabs
        value={workbenchSetupTab}
        onValueChange={(v) => setWorkbenchSetupTab(v as 'thread' | 'workspace' | 'tool')}
        className="w-full gap-4"
      >
        <TabsList
          className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl bg-muted/35 p-1.5 ring-1 ring-border/25"
          aria-label="Agent 工作台步骤"
        >
          <TabsTrigger
            value="thread"
            className="flex flex-col items-center gap-1 px-2 py-2 text-center text-[11px] leading-tight sm:flex-row sm:text-sm"
          >
            <span className="line-clamp-2">创建 Agent Thread</span>
            {step1Done ? <CheckCircle2 className="size-3.5 shrink-0 text-green-600" aria-hidden /> : null}
          </TabsTrigger>
          <TabsTrigger
            value="workspace"
            className="flex flex-col items-center gap-1 px-2 py-2 text-center text-[11px] leading-tight sm:flex-row sm:text-sm"
            disabled={!step1Done}
          >
            <span className="line-clamp-2">准备 Workspace</span>
            {step2Done ? <CheckCircle2 className="size-3.5 shrink-0 text-green-600" aria-hidden /> : null}
          </TabsTrigger>
          <TabsTrigger
            value="tool"
            className="flex flex-col items-center gap-1 px-2 py-2 text-center text-[11px] leading-tight sm:flex-row sm:text-sm"
            disabled={!step2Done}
          >
            <span className="line-clamp-2">调用编码工具</span>
            {step3TabStatus === 'running' ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
            ) : null}
            {step3TabStatus === 'succeeded' ? (
              <CheckCircle2 className="size-3.5 shrink-0 text-green-600" aria-hidden />
            ) : null}
            {step3TabStatus === 'stopped' ? (
              <AlertCircle className="size-3.5 shrink-0 text-amber-600" aria-hidden />
            ) : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="thread" className="mt-0 outline-none">
          <div
            className={cn(
              'rounded-xl bg-muted/25 p-4 shadow-none',
              'border-l-[3px] border-l-primary',
            )}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  1
                </span>
                创建 Agent Thread（生成提示词）
              </div>
              {step1Done ? (
                <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-700">
                  <CheckCircle2 className="mr-1 size-3" />
                  已完成
                </Badge>
              ) : null}
            </div>
            <p className="mb-3 flex items-start gap-1.5 text-xs text-muted-foreground">
              <FileText className="mt-0.5 size-3.5 shrink-0 text-primary" />
              系统会根据流水线关联需求打包 ContextPack（含 PRD、FS/TS 等），再结合下方指令生成可执行的编码提示词。
            </p>
            <Textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              className="min-h-[100px] text-sm"
              placeholder="用自然语言描述要实现什么、验收标准或约束…"
            />
            <Button className="mt-3" onClick={handleCreateThread} disabled={isBusy}>
              {createAgentSession.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Bot className="mr-2 size-4" />}
              创建任务并生成提示词
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="workspace" className="mt-0 outline-none">
          <div
            className={cn(
              'rounded-xl bg-muted/25 p-4 shadow-none',
              'border-l-[3px] border-l-primary',
            )}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  2
                </span>
                准备 Workspace（仓库 + 文档上下文）
              </div>
              {step2Done ? (
                <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-700">
                  <CheckCircle2 className="mr-1 size-3" />
                  已就绪
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              一键完成：确认提示词 → 登记隔离目录 → 克隆/拉取代码仓库，并把 ContextPack 落到 Workspace 侧供编码工具读取。
            </p>
            <Button variant="secondary" onClick={handlePrepareWorkspace} disabled={!step1Done || isBusy}>
              {executeWorkspaceLifecycle.isPending || provisionWorkspace.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <ChevronRight className="mr-2 size-4" />
              )}
              准备 Workspace
            </Button>
            {displayWorkspace ? (
              <div className="mt-3 rounded-lg bg-background/70 px-3 py-2.5 font-mono text-xs text-muted-foreground break-all ring-1 ring-border/20">
                <span className="font-sans font-medium text-foreground">当前目录：</span>
                {displayWorkspace.worktreePath || displayWorkspace.repoUrl} · {displayWorkspace.status}
              </div>
            ) : null}
          </div>
        </TabsContent>
        <TabsContent value="tool" className="mt-0 outline-none">
          <div
            className={cn(
              'rounded-xl bg-muted/25 p-4 shadow-none',
              'border-l-[3px] border-l-primary',
            )}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  3
                </span>
                调用编码工具
              </div>
              {!step2Done ? (
                <Badge variant="outline" className="border-muted-foreground/25 text-muted-foreground">
                  需先完成步骤 2
                </Badge>
              ) : step3TabStatus === 'running' ? (
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  <Loader2 className="mr-1 size-3 animate-spin" />
                  运行中
                </Badge>
              ) : step3TabStatus === 'succeeded' ? (
                <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-700">
                  <CheckCircle2 className="mr-1 size-3" />
                  最近一轮已成功
                </Badge>
              ) : step3TabStatus === 'stopped' ? (
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-800">
                  <AlertCircle className="mr-1 size-3" />
                  最近一轮已结束（未成功）
                </Badge>
              ) : (
                <Badge variant="outline" className="border-border text-muted-foreground">
                  待开始
                </Badge>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">编码工具</label>
                <Select
                  value={codingTool}
                  onValueChange={(v) => setCodingTool(v as ICodingToolChoice)}
                >
                  <SelectTrigger className="w-full sm:max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CODING_TOOL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id} disabled={!opt.enabled}>
                        {opt.label} — {opt.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void handleRunCoding()}
                  disabled={!step2Done || !readyWorkspace || isCodexRunning || codingTool !== 'codex_cli'}
                >
                  {runCodexToolCall.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Terminal className="mr-2 size-4" />}
                  开始编码
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancelCodex}
                  disabled={!runningCodexToolCall || !isCodexRunning || cancelCodexExecution.isPending}
                >
                  {cancelCodexExecution.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Square className="mr-2 size-4" />}
                  停止
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div
        className={cn(
          'rounded-xl bg-muted/30 p-4 shadow-none',
          'border-l-[3px] border-l-indigo-500/70',
        )}
      >
        <div className="mb-3 flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex min-w-0 flex-1 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                4
              </span>
              实时反馈
            </div>
            <div
              className="flex min-w-0 flex-wrap items-center gap-1.5 sm:border-l sm:border-border/50 sm:pl-3"
              aria-label="本轮运行指标"
            >
              <span
                className="inline-flex max-w-[8rem] items-baseline gap-1 rounded-md border border-indigo-500/15 bg-indigo-500/[0.06] px-1.5 py-0.5 tabular-nums ring-1 ring-inset ring-indigo-500/10"
                title="进程 PID"
              >
                <span className="select-none font-sans text-[9px] font-semibold uppercase tracking-wide text-indigo-600/90 dark:text-indigo-300/90">
                  PID
                </span>
                <span className="truncate font-mono text-[11px] font-medium text-foreground">
                  {runtimeState.pid ?? '—'}
                </span>
              </span>
              <span
                className="inline-flex items-baseline gap-1 rounded-md border border-border/60 bg-muted/25 px-1.5 py-0.5 tabular-nums"
                title="退出码"
              >
                <span className="select-none font-sans text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Exit
                </span>
                <span className="font-mono text-[11px] font-medium text-foreground">
                  {runtimeState.exitCode ?? '—'}
                </span>
              </span>
              <span
                className="inline-flex items-baseline gap-1 rounded-md border border-border/60 bg-muted/25 px-1.5 py-0.5 tabular-nums"
                title="本轮耗时"
              >
                <span className="select-none font-sans text-[9px] font-semibold tracking-wide text-muted-foreground">
                  耗时
                </span>
                <span className="font-mono text-[11px] font-medium text-foreground">
                  {runtimeState.durationMs != null ? formatDurationShort(runtimeState.durationMs) : '—'}
                </span>
              </span>
              <span
                className="inline-flex items-baseline gap-1 rounded-md border border-border/60 bg-muted/25 px-1.5 py-0.5 tabular-nums"
                title="检测到的变更文件数"
              >
                <span className="select-none font-sans text-[9px] font-semibold tracking-wide text-muted-foreground">
                  变更
                </span>
                <span className="font-mono text-[11px] font-medium text-foreground">
                  {reviewSummary.files.length || runtimeState.changedFilesCount}
                </span>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 self-start sm:self-center">
            {!activeSession ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative size-8 shrink-0 text-muted-foreground hover:text-foreground"
                title="输出日志"
                aria-label="打开输出日志"
                onClick={() => setLogsDialogOpen(true)}
              >
                <ScrollText className="size-4" />
                {runtimeOutput.trim() || isCodexRunning ? (
                  <span
                    className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
                    aria-hidden
                  />
                ) : null}
              </Button>
            ) : null}
            <Badge variant={runtimeState.phase === 'error' ? 'destructive' : 'outline'}>{runtimeState.phase}</Badge>
          </div>
        </div>
        {(runCodexToolCall.isPending || Boolean(runningCodexToolCall)) && (
          <Alert variant="warning" className="mb-3">
            <Terminal className="size-4" />
            <AlertTitle>编码任务与连接状态</AlertTitle>
            <AlertDescription>
              {runCodexToolCall.isPending
                ? '本页正通过流式连接接收输出；离开页面会断开该连接（服务端 Codex 多数情况下仍会继续跑完）。完整输出请点击编码对话标题栏「输出日志」图标在弹窗中查看（含服务端日志路径）。'
                : '工具调用状态为 running：Codex 可能仍在服务端执行；本页每 2.5s 拉取数据库中的输出摘要。也可登录运行后端的主机查看日志文件。'}
            </AlertDescription>
          </Alert>
        )}
        {activeSession ? (
          <>
          <div className="mb-3 flex min-h-0 min-w-0 max-h-[min(92vh,800px)] flex-col overflow-x-hidden overflow-y-visible rounded-xl bg-card/80 text-sm ring-1 ring-border/25">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-muted/45 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                {runCodexToolCall.isPending || Boolean(runningCodexToolCall) ? (
                  <>
                    <Sparkles className="size-3.5 shrink-0 text-purple-600 animate-pulse" />
                    <span>工作中…</span>
                  </>
                ) : (
                  <>
                    <Bot className="size-3.5 shrink-0 text-primary" />
                    <span>编码对话</span>
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {sessions.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                    title="会话历史"
                    aria-label="打开会话历史"
                    onClick={() => setHistoryDialogOpen(true)}
                  >
                    <History className="size-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="relative size-8 shrink-0 text-muted-foreground hover:text-foreground"
                  title="输出日志"
                  aria-label="打开输出日志"
                  onClick={() => setLogsDialogOpen(true)}
                >
                  <ScrollText className="size-4" />
                  {runtimeOutput.trim() || isCodexRunning ? (
                    <span
                      className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
                      aria-hidden
                    />
                  ) : null}
                </Button>
                <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                  持久化 · 每轮 Codex · 流式
                </Badge>
              </div>
            </div>
            {historySessionId &&
            pipelineLinkedSession &&
            historySessionId !== pipelineLinkedSession.id ? (
              <Alert className="mx-3 mt-2 shrink-0 rounded-md border-amber-500/40 bg-amber-500/5 py-2">
                <History className="size-3.5 text-amber-700" />
                <AlertTitle className="text-xs text-amber-900">查看历史会话</AlertTitle>
                <AlertDescription className="text-xs leading-relaxed text-amber-950/80">
                  对话内容已从服务端加载；Workspace / Codex 绑定当前所选会话。返回最新流水线请点击标题栏历史图标，在弹窗中选择带「当前流水线」的会话。
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-indigo-500/[0.03]">
              <div className="min-h-[min(200px,35vh)] flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth">
                <div className="space-y-4 p-3 pb-4 sm:p-4">
                  {chatMessages.map((m) =>
                    m.role === 'assistant' ? (
                      <div key={m.id} className="flex w-full min-w-0 gap-2.5">
                        <div
                          className={cn(
                            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-primary shadow-sm',
                            m.variant === 'codex' && m.streaming
                              ? 'bg-purple-500/15 text-purple-700'
                              : '',
                          )}
                        >
                          {m.variant === 'codex' && m.streaming ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Bot className="size-4" />
                          )}
                        </div>
                        <div className="min-w-0 w-full flex-1">
                          <div
                            className={cn(
                              'rounded-2xl rounded-tl-md px-3 py-2.5 text-left shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
                              m.variant === 'plan'
                                ? 'bg-indigo-500/[0.08]'
                                : 'bg-background/90',
                            )}
                          >
                            {m.variant === 'plan' ? (
                              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                <FileText className="size-3.5 shrink-0 text-indigo-600" />
                                Plan · 编码基准
                              </div>
                            ) : null}
                            {m.variant === 'codex' && m.streaming ? (
                              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground/80">
                                  <Sparkles className="size-3 text-purple-600" />
                                  生成中 · {formatDurationShort(codexStreamingElapsedMs)}
                                </span>
                              </div>
                            ) : null}
                            {m.variant === 'codex' && !m.streaming && m.durationMs != null ? (
                              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
                                <span
                                  className={cn(
                                    'font-medium',
                                    m.exitCode === 0
                                      ? 'text-green-700'
                                      : m.exitCode != null
                                        ? 'text-red-700'
                                        : 'text-muted-foreground',
                                  )}
                                >
                                  {m.exitCode === 0
                                    ? '已成功结束'
                                    : m.exitCode != null
                                      ? '进程异常结束（非成功）'
                                      : '已结束'}
                                  {' · '}
                                  {formatDurationShort(m.durationMs)}
                                </span>
                                {m.exitCode != null ? (
                                  <span
                                    className={cn(
                                      'rounded-md px-1.5 py-0.5 font-mono text-[10px]',
                                      m.exitCode === 0
                                        ? 'bg-green-500/15 text-green-800'
                                        : 'bg-red-500/15 text-red-800',
                                    )}
                                  >
                                    exit {m.exitCode}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                            {m.variant === 'codex' && m.streaming ? (
                              <div className="min-w-0 space-y-2">
                                {m.content.trim() ? (
                                  <div className="max-h-[min(400px,50vh)] min-h-0 overflow-y-auto overflow-x-auto rounded-lg px-0.5 py-1">
                                    <Streamdown className={AGENT_CHAT_MARKDOWN_CLASS}>{m.content}</Streamdown>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">等待 Codex 流式输出…</span>
                                )}
                              </div>
                            ) : m.content.trim() ? (
                              <div className="min-w-0 max-w-full overflow-x-auto overflow-y-visible">
                                <Streamdown className={AGENT_CHAT_MARKDOWN_CLASS}>{m.content}</Streamdown>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">（空）</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={m.id} className="flex w-full min-w-0 justify-end gap-2.5">
                        <div className="min-w-0 max-w-[min(100%,85%)] rounded-2xl rounded-br-md bg-primary/[0.06] px-3 py-2.5 text-left text-sm leading-relaxed text-foreground shadow-sm ring-1 ring-primary/10 whitespace-pre-wrap break-words">
                          {m.content}
                        </div>
                        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground shadow-sm">
                          <User className="size-4" />
                        </div>
                      </div>
                    ),
                  )}
                  <div ref={chatEndRef} className="h-px shrink-0" aria-hidden />
                </div>
              </div>
            </div>
            <div className="shrink-0 border-t border-border/40 bg-muted/25 shadow-[0_-6px_20px_-10px_rgba(15,23,42,0.08)]">
              <p className="bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                对话持久化到当前会话；时钟图标切换历史，
                <span className="font-medium text-foreground"> 文档图标 </span>
                查看完整输出日志。
                <span className="font-medium text-foreground"> 输入 / </span>
                或「技能」、
                <span className="font-medium text-foreground"> 输入 @ </span>
                或「文件」可选仓库路径（↑↓ Enter，Esc 关闭）；
                <span className="font-medium text-foreground"> Enter </span>
                发送并执行（Workspace 就绪时），
                <span className="font-medium text-foreground"> Shift+Enter </span>
                换行；左侧「仅对话」只写入气泡。
              </p>
              <div className="p-2 sm:p-3">
                <div className="relative overflow-visible rounded-xl bg-background/90 ring-1 ring-border/25 shadow-sm">
                  {atMenu ? (
                    <div
                      className="absolute bottom-full left-0 right-0 z-[80] mb-1 max-h-[min(280px,42vh)] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-card shadow-md"
                      role="listbox"
                      aria-label="选择文件路径"
                    >
                      {atFiltered.length > 0 ? (
                        atFiltered.map((path, idx) => (
                          <button
                            key={path}
                            type="button"
                            role="option"
                            aria-selected={idx === atActiveIndex}
                            className={cn(
                              'flex w-full gap-2.5 px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                              idx === atActiveIndex && 'bg-accent text-accent-foreground',
                            )}
                            onMouseEnter={() => setAtActiveIndex(idx)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyAtSelection(path)}
                          >
                            <File className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 flex-1 font-mono text-xs leading-snug text-foreground">
                              {path}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="px-2.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
                          {atPickerEmptyHint}
                        </div>
                      )}
                    </div>
                  ) : slashMenu && slashFiltered.length > 0 ? (
                    <div
                      className="absolute bottom-full left-0 right-0 z-[80] mb-1 max-h-[min(280px,42vh)] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-card shadow-md"
                      role="listbox"
                      aria-label="技能与快捷提示"
                    >
                      {slashFiltered.map((row, idx) => {
                        const Icon = row.Icon;
                        return (
                          <button
                            key={row.key}
                            type="button"
                            role="option"
                            aria-selected={idx === slashActiveIndex}
                            className={cn(
                              'flex w-full gap-2.5 px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                              idx === slashActiveIndex && 'bg-accent text-accent-foreground',
                            )}
                            onMouseEnter={() => setSlashActiveIndex(idx)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applySlashSelection(row)}
                          >
                            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium text-foreground">{row.name}</span>
                              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                                {row.description}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <Textarea
                    ref={chatTextareaRef}
                    value={chatDraft}
                    onChange={(e) => {
                      const v = e.target.value;
                      let c = e.target.selectionStart ?? v.length;
                      const normS = v.replace(/／/g, '/');
                      const normA = v.replace(/＠/g, '@');
                      if (normS === '/' && c === 0) c = 1;
                      if (normA === '@' && c === 0) c = 1;
                      setChatDraft(v);
                      const { slash, at } = reconcileComposerMentions(v, c);
                      setSlashMenu(slash);
                      setAtMenu(at);
                    }}
                    onSelect={syncComposerMenusFromTextarea}
                    onClick={syncComposerMenusFromTextarea}
                    onKeyUp={syncComposerMenusFromTextarea}
                    placeholder="描述变更或验收反馈…（/ 技能 · @ 文件）"
                    disabled={!step1Done}
                    className="min-h-[72px] resize-none border-0 bg-transparent px-3 py-2.5 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    onKeyDown={(e) => {
                      if (
                        (e.key === 'Backspace' || e.key === 'Delete') &&
                        !e.ctrlKey &&
                        !e.metaKey &&
                        !(e as React.KeyboardEvent).nativeEvent?.isComposing
                      ) {
                        const ta = chatTextareaRef.current;
                        if (ta) {
                          const selStart = ta.selectionStart ?? 0;
                          const selEnd = ta.selectionEnd ?? 0;
                          if (selStart === selEnd) {
                            let range: { start: number; end: number } | null = null;
                            if (e.key === 'Backspace' && selStart > 0) {
                              range = findComposerAtomicBackspaceRange(chatDraft, selStart - 1);
                            } else if (e.key === 'Delete' && selStart < chatDraft.length) {
                              range = findComposerAtomicForwardDeleteRange(chatDraft, selStart);
                            }
                            if (range && range.end > range.start) {
                              e.preventDefault();
                              const next = chatDraft.slice(0, range.start) + chatDraft.slice(range.end);
                              const pos = range.start;
                              setChatDraft(next);
                              setSlashMenu(null);
                              setAtMenu(null);
                              requestAnimationFrame(() => {
                                const el = chatTextareaRef.current;
                                if (!el) return;
                                el.focus();
                                el.setSelectionRange(pos, pos);
                                const { slash, at } = reconcileComposerMentions(next, pos);
                                setSlashMenu(slash);
                                setAtMenu(at);
                              });
                              return;
                            }
                          }
                        }
                      }
                      if (atMenu) {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setAtMenu(null);
                          return;
                        }
                        if (atFiltered.length > 0) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setAtActiveIndex((i) => Math.min(atFiltered.length - 1, i + 1));
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setAtActiveIndex((i) => Math.max(0, i - 1));
                            return;
                          }
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            const path = atFiltered[atActiveIndex] ?? atFiltered[0];
                            if (path) applyAtSelection(path);
                            return;
                          }
                        } else if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          setAtMenu(null);
                          return;
                        }
                      }
                      if (slashMenu && slashFiltered.length > 0) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSlashActiveIndex((i) => Math.min(slashFiltered.length - 1, i + 1));
                          return;
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSlashActiveIndex((i) => Math.max(0, i - 1));
                          return;
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setSlashMenu(null);
                          return;
                        }
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          const row = slashFiltered[slashActiveIndex] ?? slashFiltered[0];
                          if (row) applySlashSelection(row);
                          return;
                        }
                      }
                      if (e.key !== 'Enter' || e.shiftKey) return;
                      if (!chatDraft.trim() || !step1Done) return;
                      if (!canComposerRunCodex) return;
                      e.preventDefault();
                      void handleChatSendAndExecute();
                    }}
                  />
                  <div className="flex items-center justify-between gap-2 border-t border-border/30 bg-muted/25 px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                            onClick={handleChatAppendUser}
                            disabled={!step1Done || !chatDraft.trim()}
                          >
                            <MessageSquarePlus className="size-4 shrink-0" />
                            <span className="hidden text-xs sm:inline">仅对话</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px]">
                          写入对话队列，稍后在步骤 3 执行 Codex
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
                            onClick={openSkillPaletteFromToolbar}
                            disabled={!step1Done}
                            aria-label="打开技能列表"
                          >
                            <Wand2 className="size-4 shrink-0" />
                            <span className="hidden text-xs sm:inline">技能</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[260px]">
                          插入「/」并打开技能菜单（与键盘输入 / 相同）。内置快捷不依赖插件配置；下方亦含插件技能列表。
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
                            onClick={openFilePaletteFromToolbar}
                            disabled={!step1Done}
                            aria-label="选择文件路径"
                          >
                            <File className="size-4 shrink-0" />
                            <span className="hidden text-xs sm:inline">文件</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[260px]">
                          插入「@」并打开文件路径列表（与键盘输入 @ 相同）。数据来自当前 Workspace 目录树与流水线已发布文档路径。
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="hidden font-mono text-[10px] font-normal text-muted-foreground sm:inline-flex">
                        Codex CLI
                      </Badge>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            className={cn(
                              'size-9 shrink-0 rounded-full shadow-sm',
                              canComposerRunCodex && chatDraft.trim()
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                : '',
                            )}
                            disabled={!canComposerRunCodex || !chatDraft.trim()}
                            onClick={() => void handleChatSendAndExecute()}
                            aria-label="发送并执行 Codex"
                          >
                            {runCodexToolCall.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <ArrowUp className="size-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">发送并执行本轮 Codex</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </div>
              {tasks.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-border/30 px-3 py-2 text-xs text-muted-foreground">
                  {tasks.map((t) => (
                    <span key={t.id} className="rounded-full bg-muted/50 px-2.5 py-0.5 ring-1 ring-border/15">
                      {t.title}: {t.status}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
            <DialogContent className="flex max-h-[min(520px,75vh)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
              <DialogHeader className="border-b border-border px-6 py-4 text-left">
                <DialogTitle>会话历史</DialogTitle>
                <DialogDescription className="text-xs leading-relaxed">
                  选择一项加载已保存的对话。标记为「当前流水线」的是当前研发流水线绑定的会话。
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                <ul className="space-y-1">
                  {[...sessions]
                    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
                    .map((s) => {
                      const isCurrentPipeline = pipelineLinkedSession?.id === s.id;
                      const isActiveView = activeSession?.id === s.id;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            className={cn(
                              'w-full rounded-md border border-transparent px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                              isActiveView && 'border-primary/30 bg-primary/10',
                            )}
                            onClick={() => {
                              if (isCurrentPipeline) {
                                setHistorySessionId(null);
                              } else {
                                setHistorySessionId(s.id);
                              }
                              setHistoryDialogOpen(false);
                            }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="min-w-0 flex-1 break-words font-medium leading-snug">
                                {formatAgentSessionPickLabel(s)}
                              </span>
                              {isCurrentPipeline ? (
                                <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                                  当前流水线
                                </Badge>
                              ) : null}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            </DialogContent>
          </Dialog>
          </>
        ) : null}
        <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
          <DialogContent className="flex max-h-[min(560px,80vh)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
            <DialogHeader className="border-b border-border px-6 py-4 text-left">
              <DialogTitle>输出日志</DialogTitle>
              <DialogDescription className="text-xs leading-relaxed">
                完整 stdout / stderr 摘要与服务端日志路径。流式内容已同步到上方对话气泡。
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-hidden border-t border-slate-800 bg-slate-950">
              <pre
                ref={logsPreRef}
                className="max-h-[min(420px,60vh)] min-h-[200px] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-relaxed text-slate-100"
              >
                {runtimeOutput.trim() || runtimePlaceholder}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
        {pendingApprovals.length > 0 ? (
          <div className="mb-3 rounded-xl bg-amber-500/[0.07] p-3 text-sm ring-1 ring-amber-500/20">
            <div className="mb-2 font-medium text-amber-800">有待审批的工具调用</div>
            <ul className="space-y-2">
              {pendingApprovals.map((tc) => (
                <li key={tc.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs">{tc.toolName}</span>
                  <Button size="sm" variant="outline" onClick={() => handleApproveTool(tc.id)}>
                    批准
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {runtimeState.message ? (
          <p className="mt-2 text-xs text-red-600">{runtimeState.message}</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <Card className="border-0 shadow-md shadow-black/[0.04] ring-1 ring-border/30">
      <CardHeader className="border-b border-border/40 bg-muted/20 pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="size-5 text-primary" />
          Agent 工作台
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed max-w-none">
          调用 AI 工具完成编码任务；完成后焦点会自动落在下一步。
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2">{stepper}</CardContent>
    </Card>
  );
}
