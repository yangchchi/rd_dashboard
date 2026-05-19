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
  Cpu,
  File,
  FileText,
  FoldVertical,
  History,
  PanelRightClose,
  PanelRightOpen,
  ListChecks,
  Loader2,
  MessageSquarePlus,
  ScrollText,
  ShieldCheck,
  Package,
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
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
import {
  resolvePipelineExplicitAgentBranch,
  resolvePipelineGitBaseBranch,
} from '@shared/pipeline-meta-branch';
import {
  CODEX_CHAT_ONLY_MARKER,
  deriveCodexAnswerHeadline,
  isCodexShortChatAnswer,
  polishCodexBubbleForUi,
  stripLeadingLineIfMatchesTitle,
} from './agentCodexBubblePolish';

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

const CODING_TOOL_CONFIG: Record<
  ICodingToolChoice,
  {
    toolName: string;
    label: string;
    description: string;
    enabled: boolean;
    prepareSummary: string;
    prepareCommand: string;
    logTag: string;
  }
> = {
  codex_cli: {
    toolName: 'codex.exec',
    label: 'Codex CLI',
    description: '本机/服务端已安装 codex',
    enabled: true,
    prepareSummary: '在隔离 workspace 中执行编码任务（Codex CLI）',
    prepareCommand: 'codex exec --cd <workspace> --sandbox workspace-write <prompt>',
    logTag: 'Codex',
  },
  cursor_cli: {
    toolName: 'cursor.exec',
    label: 'Cursor',
    description: '本机/服务端已安装 agent（Cursor CLI）',
    enabled: true,
    prepareSummary: '在隔离 workspace 中执行编码任务（Cursor CLI）',
    prepareCommand: 'agent -p --force --output-format stream-json <prompt>',
    logTag: 'Cursor',
  },
  claude_code: {
    toolName: 'claude.exec',
    label: 'Claude Code',
    description: '即将支持',
    enabled: false,
    prepareSummary: '在隔离 workspace 中执行编码任务（Claude Code）',
    prepareCommand: 'claude <prompt>',
    logTag: 'Claude',
  },
};

const CODING_TOOL_OPTIONS = (Object.keys(CODING_TOOL_CONFIG) as ICodingToolChoice[]).map((id) => {
  const cfg = CODING_TOOL_CONFIG[id];
  return { id, label: cfg.label, description: cfg.description, enabled: cfg.enabled };
});

function codingToolExecName(choice: ICodingToolChoice): string {
  return CODING_TOOL_CONFIG[choice].toolName;
}

function codingToolLogTag(choice: ICodingToolChoice): string {
  return CODING_TOOL_CONFIG[choice].logTag;
}

function isCodingToolRunnable(choice: ICodingToolChoice): boolean {
  return CODING_TOOL_CONFIG[choice].enabled;
}

/** 编码工具偏好（localStorage，跨会话/任务保留用户上次选择） */
const WORKBENCH_CODING_TOOL_STORAGE_KEY = '__global_rd_workbench_coding_tool';
/** 写入 Agent Session metadata 的字段名 */
const WORKBENCH_CODING_TOOL_META_KEY = 'codingTool';

function parseCodingToolChoice(raw: unknown): ICodingToolChoice | null {
  if (raw === 'codex_cli' || raw === 'cursor_cli' || raw === 'claude_code') {
    return raw;
  }
  return null;
}

function readPersistedCodingTool(): ICodingToolChoice {
  if (typeof window === 'undefined') return 'codex_cli';
  try {
    return parseCodingToolChoice(localStorage.getItem(WORKBENCH_CODING_TOOL_STORAGE_KEY)) ?? 'codex_cli';
  } catch {
    return 'codex_cli';
  }
}

function persistCodingToolChoice(choice: ICodingToolChoice): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WORKBENCH_CODING_TOOL_STORAGE_KEY, choice);
  } catch {
    // ignore quota / private mode
  }
}

function codingToolFromRuntimeAdapter(
  adapter: IAgentSession['runtimeAdapter'] | undefined,
): ICodingToolChoice | null {
  if (adapter === 'codex_cli') return 'codex_cli';
  if (adapter === 'claude_code') return 'claude_code';
  if (adapter === 'custom') return 'cursor_cli';
  return null;
}

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
  /** 从发起到首字节输出的间隔（ms），妙搭式「思考了 N 秒」 */
  thinkingMs?: number | null;
  /** 本轮结束时检测到的变更文件数（若有） */
  changedFilesCount?: number | null;
}

function newChatMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const MAX_PRIOR_ASSISTANT_CHARS = 3200;

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

/** 妙搭式「思考了 N 秒」读秒（不足 1 秒按 1 秒展示，与常见产品一致） */
function formatThinkingSecondsLabel(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const sec = Math.max(1, Math.round(ms / 1000));
  return `${sec} 秒`;
}

function formatCodexCompletedAtSubtitle(iso: string, exitCode: number | null | undefined): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.floor((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  let dayPart = '';
  if (days === 0) dayPart = '今天';
  else if (days === 1) dayPart = '昨天';
  else dayPart = `${d.getMonth() + 1}月${d.getDate()}日`;
  const tail =
    exitCode === 0 ? '本轮已完成' : exitCode != null ? `exit ${exitCode}` : '已结束';
  return `${dayPart} ${hm} · ${tail}`;
}

function deriveCodexSummaryCardTitle(full: string): string {
  return deriveCodexAnswerHeadline(polishCodexBubbleForUi(full));
}

function getCodexBubbleDisplayContent(raw: string): {
  polished: string;
  title: string;
  bodyForMarkdown: string;
  shortChat: boolean;
} {
  const polished = polishCodexBubbleForUi(raw);
  const title = deriveCodexAnswerHeadline(polished);
  const bodyForMarkdown = stripLeadingLineIfMatchesTitle(polished, title);
  const shortChat = isCodexShortChatAnswer(polished);
  return { polished, title, bodyForMarkdown, shortChat };
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

/** 用户正文是否包含至少一处「工作台语义」的 @仓库路径（有路径字符）；仅有孤立 @ 不算 */
function draftContainsAtPathReference(draft: string): boolean {
  const d = draft.replace(/＠/g, '@');
  for (let i = 0; i < d.length; i++) {
    if (!charIsAtMark(d, i) || !isValidAtTriggerPrefix(d, i)) continue;
    const r = findAtPathAtomRange(d, i);
    if (r && r.end > r.start + 1) return true;
  }
  return false;
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
      key: 'builtin:verify',
      name: '运行验证',
      description: '在 worktree 内执行测试、lint 与类型检查并汇总结果',
      Icon: ListChecks,
      buildInsert: () =>
        '【快捷：运行验证】\n请在当前 worktree 内运行项目约定的测试、lint 与类型检查（优先 package.json scripts）；汇报通过/失败项、失败日志节选与修复建议；能修复的请直接改代码后复跑。\n\n',
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

const WORKBENCH_DELIVERY_SHORTCUT_KEYS = [
  'builtin:review',
  'builtin:verify',
  'builtin:risk',
  'builtin:acceptance',
] as const;

function getWorkbenchDeliveryShortcuts(): IAgentWorkbenchSlashRow[] {
  const byKey = new Map(buildBuiltinSlashRows().map((row) => [row.key, row]));
  return WORKBENCH_DELIVERY_SHORTCUT_KEYS.map((key) => byKey.get(key)).filter(
    (row): row is IAgentWorkbenchSlashRow => Boolean(row),
  );
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

/** 每条用户消息单独一轮 Codex：无 @ 路径时不内嵌整份 Plan，避免每轮通读 plan.md；有 @、「开始编码」延续轮、或 Plan/验收内置快捷时再带全量 Plan */
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
  const hasNewUserInstruction = Boolean(instructionThisTurn?.trim());
  const shortcutNeedsFullPlan =
    Boolean(instructionThisTurn?.trim()) &&
    /【快捷：(Plan 对齐|验收对齐|运行验证|代码审查|风险与回滚)】/.test(instructionThisTurn!);
  const embedFullPlan =
    !hasNewUserInstruction ||
    shortcutNeedsFullPlan ||
    draftContainsAtPathReference(instructionThisTurn ?? '');

  const planPreambleWithoutBody = [
    '【本轮：未在提示词中内嵌完整 Plan】',
    '工作区已挂载 ContextPack（如 docs/ 下的 plan.md、PRD/规格等）。',
    '若用户在本轮消息中用 @ 引用了具体仓库相对路径，请读取并对照该文件执行。',
    '若本轮用户正文中没有任何 @路径，请勿主动打开 plan.md、勿为「对齐 Context」而整目录扫描文档；仅依据下方「此前对话节选」「本轮指令」与当前代码树完成诉求。',
  ].join('\n');

  let body = embedFullPlan ? plan : planPreambleWithoutBody;
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

function pickReusablePendingCodingTool(
  rows: IAgentToolCall[],
  workspaceId: string,
  toolName: string,
): IAgentToolCall | undefined {
  const list = rows.filter(
    (tc) =>
      tc.toolName === toolName &&
      tc.workspaceId === workspaceId &&
      (tc.status === 'pending' || tc.status === 'awaiting_approval'),
  );
  if (!list.length) return undefined;
  return [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
}

/** 工作台步骤序号圆标（与「4 实时反馈」一致） */
const WORKBENCH_STEP_INDEX_BADGE_CLASS =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-700 dark:text-indigo-300';

/** Agent 工作台对话持久化字段（写入 rd_agent_sessions.metadata） */
const WORKBENCH_CHAT_META_KEY = 'workbenchChatMessages';
/** 输入区模式：Ask = 仅写入对话（Cursor Ask）；Agent = Enter/发送 执行 Codex（Cursor Agent） */
const WORKBENCH_COMPOSER_MODE_KEY = 'workbenchComposerMode';

type IWorkbenchComposerMode = 'ask' | 'agent';

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
    thinkingMs: m.thinkingMs ?? undefined,
    changedFilesCount: m.changedFilesCount ?? undefined,
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
    const thinkingMs =
      typeof r.thinkingMs === 'number' && Number.isFinite(r.thinkingMs) ? r.thinkingMs : undefined;
    const changedFilesCount =
      typeof r.changedFilesCount === 'number' && Number.isFinite(r.changedFilesCount)
        ? r.changedFilesCount
        : undefined;
    out.push({
      id,
      role,
      content,
      createdAt,
      variant,
      streaming: false,
      durationMs,
      exitCode,
      thinkingMs,
      changedFilesCount,
    });
  }
  return out.length ? out : null;
}

function collapseHistoryPreviewLine(s: string, maxLen: number): string {
  const normalized = s.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 1))}…`;
}

/** 从已持久化对话取最近一条用户发言的首行要点，供会话列表展示（参考 Cursor / 妙搭：突出对话关键信息） */
function deriveWorkbenchSessionHistoryPreview(session: IAgentSession): string | null {
  const raw = session.metadata?.[WORKBENCH_CHAT_META_KEY];
  const list = parsePersistedWorkbenchChat(raw);
  if (list?.length) {
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]!;
      if (m.role !== 'user') continue;
      const firstMeaningful =
        m.content
          .split(/\n/)
          .map((l) => l.trim())
          .find((l) => l.length > 0) ?? m.content.trim();
      const t = collapseHistoryPreviewLine(firstMeaningful, 96);
      if (t) return t;
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]!;
      if (m.role !== 'assistant' || m.variant === 'plan') continue;
      const body = stripPersistedCodexExitFooter(m.content);
      const firstMeaningful =
        body
          .split(/\n/)
          .map((l) => l.trim())
          .find((l) => l.length > 0) ?? body.trim();
      const t = collapseHistoryPreviewLine(firstMeaningful, 96);
      if (t && t.length >= 12) return t;
    }
  }
  const ins = session.metadata?.instruction;
  if (typeof ins === 'string' && ins.trim()) {
    const line =
      ins
        .split(/\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? ins.trim();
    return collapseHistoryPreviewLine(line, 96) || null;
  }
  const plan = session.planMarkdown?.trim();
  if (plan) {
    const line =
      plan
        .split(/\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? plan;
    return collapseHistoryPreviewLine(line, 96) || null;
  }
  return null;
}

function formatSessionHistoryMetaRow(session: IAgentSession): string {
  const when =
    session.updatedAt?.slice(0, 16)?.replace('T', ' ') ??
    session.createdAt?.slice(0, 16)?.replace('T', ' ') ??
    '';
  const bind = session.pipelineRunId ? '绑定流水线' : '独立会话';
  return `${(session.title || session.id).trim()} · ${bind} · ${when}`;
}

/** 去掉气泡持久化里可能带的 exit 页脚，避免进入历史摘要 */
function stripPersistedCodexExitFooter(text: string): string {
  const idx = text.lastIndexOf('\n\n---\nexit=');
  return idx === -1 ? text : text.slice(0, idx).trimEnd();
}

type AgentSessionHistoryBucket = 'today' | 'yesterday' | 'week' | 'older';

const AGENT_SESSION_HISTORY_BUCKET_LABEL: Record<AgentSessionHistoryBucket, string> = {
  today: '今天',
  yesterday: '昨天',
  week: '近 7 天',
  older: '更早',
};

function agentSessionHistoryTimeKey(s: IAgentSession): string {
  return s.updatedAt || s.createdAt;
}

function agentSessionHistoryCalendarBucket(iso: string): AgentSessionHistoryBucket {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'older';
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.floor((startOfDay(new Date()) - startOfDay(new Date(t))) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days >= 2 && days <= 7) return 'week';
  return 'older';
}

function groupAgentSessionsForHistoryList(rows: IAgentSession[]): {
  bucket: AgentSessionHistoryBucket;
  sessions: IAgentSession[];
}[] {
  const sorted = [...rows].sort((a, b) =>
    String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)),
  );
  const out: { bucket: AgentSessionHistoryBucket; sessions: IAgentSession[] }[] = [];
  for (const s of sorted) {
    const b = agentSessionHistoryCalendarBucket(agentSessionHistoryTimeKey(s));
    const prev = out[out.length - 1];
    if (!prev || prev.bucket !== b) {
      out.push({ bucket: b, sessions: [s] });
    } else {
      prev.sessions.push(s);
    }
  }
  return out;
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

type IWorkbenchSetupStep = 'thread' | 'workspace' | 'tool';

export function AgentWorkbenchPanel({ task, operatorName }: IAgentWorkbenchPanelProps) {
  const [instruction, setInstruction] = useState(
    '请根据 PRD、功能规格(FS)、技术规格(TS) 与编码计划（CP）完成编码与验证。',
  );
  const [codingTool, setCodingToolState] = useState<ICodingToolChoice>(() => readPersistedCodingTool());
  const [runtimeOutput, setRuntimeOutput] = useState('');
  const [runtimeState, setRuntimeState] = useState<ICodexRuntimeState>(initialCodexRuntimeState);
  const [chatMessages, setChatMessages] = useState<IAgentChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  /** Ask = 仅追加用户气泡；Agent = 发送并执行 Codex */
  const [composerMode, setComposerMode] = useState<IWorkbenchComposerMode>('agent');
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

  const { data: runs = [], isFetched: pipelineRunsFetched } = usePipelineRunsList(task.requirementId);
  const latestRun = latestByTime(runs);
  const {
    data: sessions = [],
    isFetched: sessionsFetched,
  } = useAgentSessionsList({ requirementId: task.requirementId });
  const pipelineLinkedSession = useMemo<IAgentSession | undefined>(
    () => sessions.find((session) => session.pipelineRunId === latestRun?.id) || latestByTime(sessions),
    [latestRun?.id, sessions],
  );
  const [historySessionId, setHistorySessionId] = useState<string | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  /** 当前选中的 setup 步骤（用于属性面板内容） */
  const [expandedSetupStep, setExpandedSetupStep] = useState<IWorkbenchSetupStep | null>(null);
  /** 步骤 1～3 属性面板：默认收起 */
  const [setupPropertiesOpen, setSetupPropertiesOpen] = useState(false);
  const [isAutoSettingUp, setIsAutoSettingUp] = useState(false);
  const autoSetupInFlightRef = useRef(false);
  const autoStep1AttemptedRef = useRef(false);
  const autoStep2AttemptedRef = useRef(false);

  useEffect(() => {
    setHistorySessionId(null);
  }, [latestRun?.id]);

  useEffect(() => {
    autoStep1AttemptedRef.current = false;
    autoStep2AttemptedRef.current = false;
    autoSetupInFlightRef.current = false;
    setIsAutoSettingUp(false);
    setExpandedSetupStep(null);
    setSetupPropertiesOpen(false);
  }, [task.id]);

  const handleSetupStepClick = (step: IWorkbenchSetupStep) => {
    if (expandedSetupStep === step && setupPropertiesOpen) {
      setSetupPropertiesOpen(false);
      setExpandedSetupStep(null);
      return;
    }
    setExpandedSetupStep(step);
    setSetupPropertiesOpen(true);
  };

  const activeSession = useMemo<IAgentSession | undefined>(() => {
    const id = historySessionId ?? pipelineLinkedSession?.id;
    if (!id) return undefined;
    return sessions.find((s) => s.id === id) ?? pipelineLinkedSession;
  }, [sessions, historySessionId, pipelineLinkedSession]);
  const { data: tasks = [] } = useAgentTasks(activeSession?.id);
  const { data: toolCalls = [] } = useAgentToolCalls(activeSession?.id, undefined, {
    pollWhileCodexRunningMs: 2500,
  });
  const { data: workspaces = [], isFetched: workspacesFetched } = useAgentWorkspaces(activeSession?.id);
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

  useEffect(() => {
    if (!activeSession?.id) {
      setComposerMode('agent');
      return;
    }
    const raw = activeSession.metadata[WORKBENCH_COMPOSER_MODE_KEY];
    if (raw === 'ask' || raw === 'agent') setComposerMode(raw);
    else setComposerMode('agent');
  }, [activeSession]);

  const applyCodingToolChoice = useCallback((choice: ICodingToolChoice) => {
    setCodingToolState(choice);
    persistCodingToolChoice(choice);
  }, []);

  const handleCodingToolChange = useCallback(
    (choice: ICodingToolChoice) => {
      applyCodingToolChoice(choice);
      if (!activeSession?.id) return;
      patchSessionMetadata.mutate({
        id: activeSession.id,
        patch: { [WORKBENCH_CODING_TOOL_META_KEY]: choice },
        updatedBy: operatorName ?? null,
      });
    },
    [activeSession?.id, applyCodingToolChoice, operatorName, patchSessionMetadata],
  );

  useEffect(() => {
    const fromMeta = parseCodingToolChoice(activeSession?.metadata?.[WORKBENCH_CODING_TOOL_META_KEY]);
    if (fromMeta) {
      applyCodingToolChoice(fromMeta);
      return;
    }
    if (!activeSession?.id) return;
    const fromAdapter = codingToolFromRuntimeAdapter(activeSession.runtimeAdapter);
    if (fromAdapter) {
      applyCodingToolChoice(fromAdapter);
    }
  }, [
    activeSession?.id,
    activeSession?.metadata,
    activeSession?.runtimeAdapter,
    applyCodingToolChoice,
  ]);

  const isBusy =
    createPipelineRun.isPending ||
    createContextPack.isPending ||
    createAgentSession.isPending ||
    upsertAgentTask.isPending ||
    provisionWorkspace.isPending ||
    executeWorkspaceLifecycle.isPending ||
    prepareToolCall.isPending ||
    approveToolCall.isPending;

  const activeCodingToolName = useMemo(() => codingToolExecName(codingTool), [codingTool]);

  const latestCodingToolCall = useMemo(
    () =>
      [...toolCalls]
        .filter((tc) => tc.toolName === activeCodingToolName)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0],
    [toolCalls, activeCodingToolName],
  );
  const runningCodingToolCall = useMemo(
    () => toolCalls.find((tc) => tc.toolName === activeCodingToolName && tc.status === 'running'),
    [toolCalls, activeCodingToolName],
  );
  const isCodingToolRunning =
    Boolean(runningCodingToolCall) || runCodexToolCall.isPending || prepareToolCall.isPending;

  useEffect(() => {
    const busy =
      Boolean(runningCodingToolCall) || runCodexToolCall.isPending || prepareToolCall.isPending;
    if (!busy) return;
    const id = window.setInterval(() => bumpStreamingClock(), 1000);
    return () => window.clearInterval(id);
  }, [runningCodingToolCall, runCodexToolCall.isPending, prepareToolCall.isPending]);

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

  const step3LatestCodingRound = useMemo(() => {
    const tc = latestCodingToolCall;
    if (!tc || tc.toolName !== activeCodingToolName) return null;
    return tc;
  }, [latestCodingToolCall, activeCodingToolName]);

  const step3TabStatus = useMemo(() => {
    if (!step2Done) return 'blocked' as const;
    if (isCodingToolRunning) return 'running' as const;
    const tc = step3LatestCodingRound;
    if (!tc) return 'idle' as const;
    if (tc.status === 'succeeded') return 'succeeded' as const;
    if (tc.status === 'failed' || tc.status === 'cancelled') return 'stopped' as const;
    return 'idle' as const;
  }, [step2Done, isCodingToolRunning, step3LatestCodingRound]);

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

  const codingServerSyncKey = latestCodingToolCall
    ? `${latestCodingToolCall.id}:${latestCodingToolCall.status}:${String(latestCodingToolCall.metadata?.lastOutputAt ?? '')}:${String(latestCodingToolCall.metadata?.executorLogPath ?? '')}:${String(latestCodingToolCall.updatedAt ?? '')}`
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在 session id 变化时全量 hydrate；同会话内 Plan/对话由其它 effect 增量同步
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
    if (!latestCodingToolCall || latestCodingToolCall.toolName !== activeCodingToolName) return;
    const m = latestCodingToolCall.metadata;
    const logPath = typeof m.executorLogPath === 'string' ? m.executorLogPath : '';
    const stdout = typeof m.stdout === 'string' ? m.stdout : '';
    const stderr = typeof m.stderr === 'string' ? m.stderr : '';
    if (!logPath && !stdout && !stderr) return;
    const toolLabel = codingToolLogTag(codingTool);
    const header = [
      logPath
        ? `【服务端完整日志文件】${logPath}\n（全文落盘；数据库仅保留末尾约 20KB 摘要。离开页面后请用该文件或下方摘要排查。）\n`
        : '',
      latestCodingToolCall.status === 'running'
        ? `【执行状态】running：${toolLabel} 可能仍在服务端执行；本页每 2.5s 拉取一次数据库中的输出摘要。\n`
        : `【执行状态】${latestCodingToolCall.status} exit=${latestCodingToolCall.exitCode ?? '—'}\n`,
      '---\n',
    ].join('');
    const body = [stdout, stderr ? `\n--- stderr（尾部） ---\n${stderr}` : ''].join('');
    setRuntimeOutput(`${header}${body}`);
  }, [codingServerSyncKey, runCodexToolCall.isPending, latestCodingToolCall, activeCodingToolName, codingTool]);

  const handleCreateThread = async (options?: { silent?: boolean }) => {
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
            gitBaseBranch: task.pipelineMeta.gitBaseBranch,
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
        baseBranch: resolvePipelineGitBaseBranch(task.pipelineMeta),
        planMarkdown,
        riskLevel: 'medium',
        metadata: {
          instruction,
          contextPackChecksum: contextPack.checksum,
          [WORKBENCH_CODING_TOOL_META_KEY]: codingTool,
        },
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
      const logPrefix = options?.silent ? '[自动][步骤1]' : '[步骤1]';
      appendLog(
        `${logPrefix} Agent Thread 已创建，ContextPack 已写入 PRD/规格 等文档快照（checksum=${contextPack.checksum.slice(0, 8)}…）`,
      );
      if (!options?.silent) {
        toast.success('步骤 1 完成：已生成编码提示词与任务线程');
      }
    } catch (error) {
      logger.error('创建 Agent Thread 失败', error);
      toast.error(error instanceof Error ? error.message : '创建 Agent Thread 失败');
      throw error;
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

  const ensureCodingToolPrepared = async (
    session: IAgentSession,
    workspaceId: string,
    tool: ICodingToolChoice,
  ) => {
    const cfg = CODING_TOOL_CONFIG[tool];
    await prepareToolCall.mutateAsync({
      sessionId: session.id,
      workspaceId,
      toolName: cfg.toolName,
      toolCategory: 'ai',
      inputSummary: cfg.prepareSummary,
      command: cfg.prepareCommand,
      metadata: {
        stage: 'workspace-ready',
        prompt: session.planMarkdown || instruction,
        codingTool: tool,
      },
    });
  };

  /** 步骤 2：批准提示词、按需创建 Workspace、拉取仓库与文档目录、执行 git 生命周期直至 ready */
  const handlePrepareWorkspace = async (options?: { silent?: boolean }): Promise<boolean> => {
    if (!activeSession) {
      toast.error('请先完成步骤 1');
      return false;
    }
    if (!task.pipelineMeta.gitUrl?.trim()) {
      toast.error('流水线未配置 Git 地址，无法准备 Workspace');
      return false;
    }
    const logPrefix = options?.silent ? '[自动][步骤2]' : '[步骤2]';
    try {
      appendLog(`${logPrefix} 开始：确认提示词 → 准备仓库与 Workspace…`);
      await ensurePlannerApproved(activeSession);

      let workspace = primaryWorkspace;
      const needNewWorkspace =
        !workspace || workspace.status === 'failed' || workspace.status === 'archived';

      if (needNewWorkspace) {
        appendLog(`${logPrefix} 创建 Workspace 计划并登记 git 生命周期…`);
        const result = await provisionWorkspace.mutateAsync({
          sessionId: activeSession.id,
          repoUrl: task.pipelineMeta.gitUrl,
          baseBranch: resolvePipelineGitBaseBranch(task.pipelineMeta),
          agentBranch: resolvePipelineExplicitAgentBranch(task.pipelineMeta, task.requirementId),
          createdBy: operatorName,
          kind: 'worktree',
          productSlug: task.pipelineMeta.workspaceProductSlug,
          sessionFolderName: task.pipelineMeta.workspaceSessionFolder,
        });
        workspace = result.workspace;
        appendLog(`${logPrefix} Workspace 已登记：${workspace.id}`);
        await ensureCodingToolPrepared(activeSession, workspace.id, codingTool);
      } else {
        const execName = codingToolExecName(codingTool);
        const hasCodingToolForWs = toolCalls.some(
          (tc) => tc.toolName === execName && tc.workspaceId === workspace!.id,
        );
        if (!hasCodingToolForWs) {
          appendLog(`${logPrefix} 补充 ${codingToolLogTag(codingTool)} 工具调用记录…`);
          await ensureCodingToolPrepared(activeSession, workspace!.id, codingTool);
        }
      }

      if (!workspace) {
        throw new Error('未能解析 Workspace');
      }

      if (workspace.status !== 'ready' || !workspace.worktreePath?.trim()) {
        appendLog(`${logPrefix} 执行 clone/fetch/worktree 等生命周期命令…`);
        const life = await executeWorkspaceLifecycle.mutateAsync({
          id: workspace.id,
          sessionId: activeSession.id,
        });
        for (const tc of life.toolCalls) {
          appendLog(`${logPrefix} ${tc.toolName} → ${tc.status} (exit=${tc.exitCode ?? '-'})`);
          if (tc.status === 'failed' && (tc.outputSummary || tc.metadata)) {
            const tail = (tc.outputSummary || '').trim();
            if (tail) {
              appendLog(`${logPrefix}[${tc.toolName} 输出]\n${tail}`);
            }
          }
        }
        appendLog(`${logPrefix} Workspace 状态：${life.workspace.status}`);
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
            appendLog(`${logPrefix}[诊断]${hint}`);
            toast.error('Workspace 准备失败', { description: `${detail.slice(0, 500)}${hint ? `\n${hint}` : ''}` });
          } else {
            toast.error('Workspace 准备未完成', {
              description: `状态：${life.workspace.status}。请检查 Git 地址、分支与运行环境的网络/权限。`,
            });
          }
          return false;
        }
      } else {
        appendLog(`${logPrefix} Workspace 已处于 ready，跳过生命周期`);
      }

      if (!options?.silent) {
        toast.success('步骤 2 完成：仓库与文档上下文已就绪');
      }
      return true;
    } catch (error) {
      logger.error('准备 Workspace 失败', error);
      appendLog(`${logPrefix}[错误] ${error instanceof Error ? error.message : '准备 Workspace 失败'}`);
      toast.error(error instanceof Error ? error.message : '准备 Workspace 失败');
      throw error;
    }
  };

  /** 创建流水线后自动完成步骤 1～2，焦点落在步骤 3 */
  useEffect(() => {
    if (historySessionId) return;
    if (!task.pipelineMeta.gitUrl?.trim()) return;
    if (!pipelineRunsFetched || !sessionsFetched) return;
    if (step1Done && step2Done) return;
    if (isBusy || autoSetupInFlightRef.current) return;

    if (step1Done && activeSession?.id && !workspacesFetched) return;

    const shouldRunStep1 = !step1Done && !autoStep1AttemptedRef.current;
    const shouldRunStep2 = step1Done && !step2Done && activeSession && !autoStep2AttemptedRef.current;
    if (!shouldRunStep1 && !shouldRunStep2) return;

    autoSetupInFlightRef.current = true;
    setIsAutoSettingUp(true);

    void (async () => {
      try {
        if (shouldRunStep1) {
          autoStep1AttemptedRef.current = true;
          await handleCreateThread({ silent: true });
          return;
        }
        if (shouldRunStep2) {
          autoStep2AttemptedRef.current = true;
          const ok = await handlePrepareWorkspace({ silent: true });
          if (ok) {
            toast.success('工作台已就绪', {
              description: '已自动完成 Thread 与 Workspace 准备，可直接开始编码。',
            });
          }
        }
      } catch {
        if (shouldRunStep1) autoStep1AttemptedRef.current = false;
        if (shouldRunStep2) autoStep2AttemptedRef.current = false;
      } finally {
        autoSetupInFlightRef.current = false;
        setIsAutoSettingUp(false);
      }
    })();
    // handleCreateThread / handlePrepareWorkspace 为稳定业务入口，省略 deps 避免重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    task.id,
    task.pipelineMeta.gitUrl,
    historySessionId,
    pipelineRunsFetched,
    sessionsFetched,
    workspacesFetched,
    step1Done,
    step2Done,
    activeSession?.id,
    isBusy,
  ]);

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

  /** 每轮独立编码工具：复用尚未执行的 pending 行，否则新建 tool call；stdout 流式写入对话气泡与底部输出流 */
  const executeCodexRound = async (opts: { appendUserFromDraft: boolean; userPromptOverride?: string }) => {
    if (!isCodingToolRunnable(codingTool)) {
      toast.message('该编码工具尚未接入', { description: '请选择已启用的 Codex CLI 或 Cursor' });
      return;
    }
    const toolCfg = CODING_TOOL_CONFIG[codingTool];
    const logTag = toolCfg.logTag;
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
    const userText = opts.userPromptOverride?.trim()
      ? opts.userPromptOverride.trim()
      : opts.appendUserFromDraft
        ? chatDraft.trim()
        : '';
    if ((opts.appendUserFromDraft || opts.userPromptOverride) && !userText) {
      toast.error('请输入本轮编码指令');
      return;
    }

    const snapshotForPrior: IAgentChatMessage[] =
      userText
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
      userText || null,
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
    if (opts.appendUserFromDraft && !opts.userPromptOverride) setChatDraft('');

    appendLog(`[${logTag}] 启动本轮执行…`);
    setRuntimeOutput((prev) => `${prev}\n--- 新轮次 ---\n`);
    setRuntimeState({
      ...initialCodexRuntimeState,
      phase: 'starting',
      toolCallId: undefined,
      startedAt: new Date().toISOString(),
    });

    /** 仅累积到对话气泡（Codex 常把交互输出写到 stderr，气泡不能只跟 stdout） */
    const appendAssistantContent = (chunk: string) => {
      if (!chunk) return;
      setChatMessages((prev) =>
        prev.map((m) => {
          if (m.id !== replyAssistantId) return m;
          const nextContent = m.content + chunk;
          if (m.thinkingMs == null && nextContent.trim().length > 0) {
            const elapsed = Math.max(0, Date.now() - Date.parse(m.createdAt));
            return { ...m, content: nextContent, thinkingMs: elapsed };
          }
          return { ...m, content: nextContent };
        }),
      );
    };

    const bumpAssistant = (chunk: string) => {
      if (!chunk) return;
      appendAssistantContent(chunk);
      setRuntimeOutput((prev) => `${prev}${chunk}`);
    };

    const assistantClosedRef = { current: false };
    const closeAssistantOnce = (
      tail: string,
      markRuntimeError: boolean,
      meta?: {
        durationMs?: number | null;
        exitCode?: number | null;
        changedFilesCount?: number | null;
      },
      fallbackToolCall?: IAgentToolCall | null,
    ) => {
      if (assistantClosedRef.current) return;
      assistantClosedRef.current = true;
      setChatMessages((prev) =>
        prev.map((m) => {
          if (m.id !== replyAssistantId) return m;
          let nextContent = `${m.content}${tail}`;
          if (!nextContent.trim() && fallbackToolCall?.metadata) {
            const fm = fallbackToolCall.metadata as Record<string, unknown>;
            const sOut = typeof fm.stdout === 'string' ? fm.stdout : '';
            const sErr = typeof fm.stderr === 'string' ? fm.stderr : '';
            const merged = [sOut, sErr].filter((x) => x.trim().length > 0).join('\n\n--- stderr ---\n');
            if (merged.trim()) {
              nextContent = `${merged.trim()}\n${tail}`;
            }
          }
          nextContent = polishCodexBubbleForUi(nextContent);
          const changed =
            meta?.changedFilesCount != null
              ? meta.changedFilesCount
              : (m.changedFilesCount ?? undefined);
          return {
            ...m,
            streaming: false,
            content: nextContent,
            ...(changed != null ? { changedFilesCount: changed } : {}),
            ...(meta
              ? {
                  durationMs: meta.durationMs ?? undefined,
                  exitCode: meta.exitCode ?? undefined,
                }
              : {}),
          };
        }),
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
      const pending = pickReusablePendingCodingTool(toolCalls, workspaceId, toolCfg.toolName);
      if (pending) {
        if (pending.approvalStatus === 'pending') {
          toast.error(`请先在工作台批准待审的 ${logTag} 工具调用`);
          closeAssistantOnce('\n\n【已取消】存在待审批工具调用。', false);
          return;
        }
        runnableToolCall = pending;
      } else {
        runnableToolCall = await prepareToolCall.mutateAsync({
          sessionId: activeSession.id,
          workspaceId,
          toolName: toolCfg.toolName,
          toolCategory: 'ai',
          inputSummary: `${logTag} — 对话中一轮`,
          command: toolCfg.prepareCommand,
          metadata: { prompt: executionPrompt, chatReplyId: replyAssistantId, codingTool },
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
            appendLog(`[${logTag}] 已启动`);
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
            appendLog(`[${logTag}] pid=${event.pid ?? '?'} cwd=${event.cwd || '-'}`);
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
            const chunk = event.chunk;
            setChatMessages((prev) =>
              prev.map((m) => {
                if (m.id !== replyAssistantId) return m;
                const cur = m.content.replace(/\r\n/g, '\n');
                const ch = chunk.replace(/\r\n/g, '\n');
                if (ch.length >= 80 && cur.endsWith(ch)) return m;
                return { ...m, content: m.content + chunk };
              }),
            );
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
            appendLog(`[${logTag}][错误] ${event.message || '执行失败'}`);
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
              `[${logTag}] 结束 exit=${event.exitCode ?? '?'} 耗时=${event.durationMs ?? 0}ms 变更文件≈${event.changedFilesCount ?? 0}`,
            );
            closeAssistantOnce(
              `\n\n---\nexit=${event.exitCode ?? '—'} · ${event.durationMs ?? 0}ms · 变更≈${event.changedFilesCount ?? 0}`,
              false,
              {
                durationMs: event.durationMs ?? null,
                exitCode: event.exitCode ?? null,
                changedFilesCount: event.changedFilesCount ?? null,
              },
              event.toolCall ?? null,
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

  const handleDeliveryShortcut = useCallback(
    async (row: IAgentWorkbenchSlashRow) => {
      if (!activeSession) {
        toast.error('请先完成步骤 1');
        return;
      }
      if (!step2Done || !readyWorkspace?.id) {
        toast.error('Workspace 未就绪，请先完成步骤 2');
        return;
      }
      if (!isCodingToolRunnable(codingTool)) {
        toast.message('该编码工具尚未接入', { description: '请选择已启用的 Codex CLI 或 Cursor' });
        return;
      }
      if (isCodingToolRunning || runCodexToolCall.isPending) {
        toast.message('编码任务运行中，请稍候');
        return;
      }
      const insert = row.buildInsert({ requirementTitle: task.requirementTitle }).trim();
      setComposerMode('agent');
      setChatDraft(insert);
      toast.message(`已启动：${row.name}`, { description: '请在下方编码对话查看进度' });
      await executeCodexRound({ appendUserFromDraft: false, userPromptOverride: insert });
    },
    [
      activeSession,
      step2Done,
      readyWorkspace?.id,
      codingTool,
      isCodingToolRunning,
      runCodexToolCall.isPending,
      task.requirementTitle,
    ],
  );

  const handleCancelCodex = async () => {
    if (!activeSession || !runningCodingToolCall) return;
    try {
      await cancelCodexExecution.mutateAsync({
        id: runningCodingToolCall.id,
        sessionId: activeSession.id,
      });
      appendLog(`[${codingToolLogTag(codingTool)}] 已请求停止当前进程`);
      toast.success('已请求停止');
    } catch (error) {
      logger.error('停止失败', error);
      toast.error(error instanceof Error ? error.message : '停止失败');
    }
  };

  const runtimePlaceholder =
    '日志：步骤 2 的 Workspace 命令与步骤 3/4 的编码输出将显示在此处。';

  const canComposerRunCodex =
    step2Done &&
    Boolean(readyWorkspace) &&
    !isCodingToolRunning &&
    isCodingToolRunnable(codingTool) &&
    !runCodexToolCall.isPending;

  const canComposerSendAsk = step1Done && Boolean(chatDraft.trim());

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

  const step3StatusBadge =
    !step2Done ? (
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
    );

  const deliveryShortcuts = useMemo(() => getWorkbenchDeliveryShortcuts(), []);

  const deliveryInsight = useMemo(() => {
    const changedCount = reviewSummary.files.length || runtimeState.changedFilesCount || 0;
    const testTotal = reviewSummary.testCommands.length;
    const failedCount = reviewSummary.failedCommands.length;
    let verifyLabel = '待运行';
    let verifyTone: 'muted' | 'success' | 'danger' = 'muted';
    if (failedCount > 0) {
      verifyLabel = `${failedCount} 项未通过`;
      verifyTone = 'danger';
    } else if (testTotal > 0) {
      verifyLabel = `验证通过 ${testTotal} 项`;
      verifyTone = 'success';
    } else if (task.testReport && task.testReport.total > 0) {
      verifyLabel =
        task.testReport.failed > 0
          ? `${task.testReport.failed} 项未通过`
          : `验证通过 ${task.testReport.passed} 项`;
      verifyTone = task.testReport.failed > 0 ? 'danger' : 'success';
    }
    const riskCount = reviewSummary.riskHints.length;
    const riskLabel =
      riskCount > 0
        ? reviewSummary.riskHints[0]!.length > 28
          ? `${reviewSummary.riskHints[0]!.slice(0, 28)}…`
          : reviewSummary.riskHints[0]!
        : '暂无高风险';
    return { changedCount, verifyLabel, verifyTone, riskLabel, riskCount };
  }, [reviewSummary, runtimeState.changedFilesCount, task.testReport]);

  const codingToolbar = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {step3StatusBadge}
      <Button
        size="sm"
        onClick={() => void handleRunCoding()}
        disabled={!step2Done || !readyWorkspace || isCodingToolRunning || !isCodingToolRunnable(codingTool)}
      >
        {runCodexToolCall.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Terminal className="mr-2 size-4" />}
        执行任务
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleCancelCodex}
        disabled={!runningCodingToolCall || !isCodingToolRunning || cancelCodexExecution.isPending}
      >
        {cancelCodexExecution.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Square className="mr-2 size-4" />}
        停止
      </Button>
    </div>
  );

  const stepper = (
    <div className="space-y-6">
      {isAutoSettingUp ? (
        <Alert className="border-primary/25 bg-primary/5">
          <Loader2 className="size-4 animate-spin text-primary" />
          <AlertTitle>正在自动准备工作台</AlertTitle>
          <AlertDescription>
            创建流水线后系统将自动完成「创建 Thread」与「准备 Workspace」，完成后可直接进入编码步骤。
          </AlertDescription>
        </Alert>
      ) : null}
      <div
        className="w-full overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
        role="group"
        aria-label="Agent 工作台步骤与快捷技能"
      >
        <div className="flex items-center justify-between gap-3 bg-muted/40 px-3 py-2.5">
          <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 overflow-x-auto sm:gap-2">
            {(
              [
                { id: 'thread' as const, index: 1, label: '创建 Agent Thread', done: step1Done },
                { id: 'workspace' as const, index: 2, label: '准备 Workspace', done: step2Done },
                {
                  id: 'tool' as const,
                  index: 3,
                  label: '调用编码工具',
                  done: step3TabStatus === 'succeeded',
                },
              ] as const
            ).map((step) => {
              const isStepExpanded = setupPropertiesOpen && expandedSetupStep === step.id;
              const isStepRunning = step.id === 'tool' && step3TabStatus === 'running';
              return (
                <button
                  key={step.id}
                  type="button"
                  aria-expanded={isStepExpanded}
                  onClick={() => handleSetupStepClick(step.id)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors sm:px-3.5 sm:text-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-muted/40',
                    isStepExpanded && 'bg-background text-foreground shadow-sm ring-1 ring-border/50',
                    !isStepExpanded && step.done && 'bg-green-500/10 text-foreground hover:bg-green-500/15',
                    !isStepExpanded &&
                      !step.done &&
                      isStepRunning &&
                      'bg-primary/10 text-foreground hover:bg-primary/15',
                    !isStepExpanded &&
                      !step.done &&
                      !isStepRunning &&
                      'text-muted-foreground hover:bg-background/70',
                  )}
                >
                  <span className={WORKBENCH_STEP_INDEX_BADGE_CLASS}>{step.index}</span>
                  <span>{step.label}</span>
                  {step.id === 'tool' && step3TabStatus === 'running' ? (
                    <Loader2 className="size-3 shrink-0 animate-spin text-primary" aria-hidden />
                  ) : null}
                  {step.id === 'tool' && step3TabStatus === 'stopped' ? (
                    <AlertCircle className="size-3 shrink-0 text-amber-600" aria-hidden />
                  ) : null}
                  {step.done ? <CheckCircle2 className="size-3 shrink-0 text-green-600" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 border border-border/50 bg-background/80 px-2.5 text-xs shadow-none hover:bg-background"
            aria-expanded={setupPropertiesOpen}
            aria-controls="agent-workbench-setup-properties"
            onClick={() => {
              setSetupPropertiesOpen((open) => {
                const next = !open;
                if (next && !expandedSetupStep) setExpandedSetupStep('tool');
                return next;
              });
            }}
          >
            {setupPropertiesOpen ? (
              <PanelRightClose className="size-3.5" aria-hidden />
            ) : (
              <PanelRightOpen className="size-3.5" aria-hidden />
            )}
            {setupPropertiesOpen ? '收起属性' : '展开属性'}
          </Button>
        </div>
        {setupPropertiesOpen && expandedSetupStep === 'thread' ? (
          <div
            id="agent-workbench-setup-properties"
            className="border-t border-border/40 bg-muted/20 px-3 py-3 outline-none animate-in fade-in-0 slide-in-from-top-1 duration-200"
          >
          <div
            className={cn(
              'rounded-lg bg-background p-4 shadow-none',
              'border-l-[3px] border-l-primary',
            )}
          >
            <p className="mb-3 flex items-start gap-1.5 text-xs text-muted-foreground">
              <FileText className="mt-0.5 size-3.5 shrink-0 text-primary" />
              创建流水线后将自动完成本步骤：打包 ContextPack（含 PRD、FS/TS 等）并生成编码提示词；也可在下方调整指令后手动重试。
            </p>
            <Textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              className="min-h-[100px] text-sm"
              placeholder="用自然语言描述要实现什么、验收标准或约束…"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={() => void handleCreateThread()} disabled={isBusy || isAutoSettingUp}>
                {createAgentSession.isPending || isAutoSettingUp ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Bot className="mr-2 size-4" />
                )}
                {isAutoSettingUp ? '自动准备中…' : '创建任务并生成提示词'}
              </Button>
              {step1Done ? (
                <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-700">
                  <CheckCircle2 className="mr-1 size-3" />
                  已完成
                </Badge>
              ) : null}
            </div>
          </div>
          </div>
        ) : null}
        {setupPropertiesOpen && expandedSetupStep === 'workspace' ? (
          <div className="border-t border-border/40 bg-muted/20 px-3 py-3 outline-none animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <div
            className={cn(
              'rounded-lg bg-background p-4 shadow-none',
              'border-l-[3px] border-l-primary',
            )}
          >
            <p className="mb-3 text-xs text-muted-foreground">
              创建流水线后将自动完成：确认提示词 → 登记隔离目录 → 克隆/拉取代码仓库，并把 ContextPack 落到 Workspace 侧供编码工具读取。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => void handlePrepareWorkspace()}
                disabled={!step1Done || isBusy || isAutoSettingUp}
              >
                {executeWorkspaceLifecycle.isPending || provisionWorkspace.isPending || isAutoSettingUp ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <ChevronRight className="mr-2 size-4" />
                )}
                {isAutoSettingUp ? '自动准备中…' : '准备 Workspace'}
              </Button>
              {step2Done ? (
                <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-700">
                  <CheckCircle2 className="mr-1 size-3" />
                  已就绪
                </Badge>
              ) : null}
            </div>
            {displayWorkspace ? (
              <div className="mt-3 rounded-lg bg-background/70 px-3 py-2.5 font-mono text-xs text-muted-foreground break-all ring-1 ring-border/20">
                <span className="font-sans font-medium text-foreground">当前目录：</span>
                {displayWorkspace.worktreePath || displayWorkspace.repoUrl} · {displayWorkspace.status}
              </div>
            ) : null}
          </div>
          </div>
        ) : null}
        {setupPropertiesOpen && expandedSetupStep === 'tool' ? (
          <div
            id="agent-workbench-setup-properties"
            className="border-t border-border/40 bg-muted/20 px-3 py-3 outline-none animate-in fade-in-0 slide-in-from-top-1 duration-200"
          >
          <div
            className={cn(
              'rounded-lg bg-background p-4 shadow-none',
              'border-l-[3px] border-l-primary',
            )}
          >
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              运行状态与「开始编码 / 停止」在标题栏右侧；在此选择编码工具后发起任务。
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">编码工具</label>
              <Select value={codingTool} onValueChange={(v) => handleCodingToolChange(v as ICodingToolChoice)}>
                <SelectTrigger className="w-full sm:max-w-md" aria-label="编码工具">
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
          </div>
          </div>
        ) : null}
        <div className="space-y-3 border-t border-border/40 bg-muted/30 px-3 py-3">
          <div className="grid grid-cols-1 overflow-hidden rounded-lg ring-1 ring-border/50 sm:grid-cols-3">
            <div className="flex items-center justify-between gap-3 border-b border-border/40 bg-background px-4 py-2.5 sm:border-r sm:border-b-0">
              <span className="shrink-0 text-xs text-muted-foreground">变更文件</span>
              <span className="tabular-nums text-sm font-semibold text-foreground">{deliveryInsight.changedCount}</span>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/40 bg-background px-4 py-2.5 sm:border-r sm:border-b-0">
              <span className="shrink-0 text-xs text-muted-foreground">验证结果</span>
              <span
                className={cn(
                  'min-w-0 truncate text-right text-sm font-semibold',
                  deliveryInsight.verifyTone === 'success' && 'text-green-600',
                  deliveryInsight.verifyTone === 'danger' && 'text-destructive',
                  deliveryInsight.verifyTone === 'muted' && 'text-muted-foreground',
                )}
              >
                {deliveryInsight.verifyLabel}
              </span>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 bg-background px-4 py-2.5">
              <span className="shrink-0 text-xs text-muted-foreground">风险提示</span>
              <span
                className={cn(
                  'min-w-0 truncate text-right text-sm font-semibold',
                  deliveryInsight.riskCount > 0 ? 'text-amber-800' : 'text-foreground',
                )}
                title={reviewSummary.riskHints.join('\n') || undefined}
              >
                {deliveryInsight.riskLabel}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {deliveryShortcuts.map((row) => (
              <Button
                key={row.key}
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 border-border/50 bg-background/90 text-xs shadow-none hover:bg-background"
                disabled={!canComposerRunCodex}
                title={row.description}
                onClick={() => void handleDeliveryShortcut(row)}
              >
                <row.Icon className="size-3.5 shrink-0" aria-hidden />
                {row.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div
        className={cn(
          'rounded-xl bg-muted/30 p-4 shadow-none',
          'border-l-[3px] border-l-indigo-500/70',
        )}
      >
        <div className="mb-3 flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex min-w-0 flex-1 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
              <span className={WORKBENCH_STEP_INDEX_BADGE_CLASS}>4</span>
              审阅与交付
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
                {runtimeOutput.trim() || isCodingToolRunning ? (
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
        {(runCodexToolCall.isPending || Boolean(runningCodingToolCall)) && (
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
                {runCodexToolCall.isPending || Boolean(runningCodingToolCall) ? (
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
                  {runtimeOutput.trim() || isCodingToolRunning ? (
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
                              <div className="mb-2 space-y-2">
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                  <Sparkles className="size-3.5 shrink-0 opacity-70" />
                                  <span>
                                    思考了{' '}
                                    {formatThinkingSecondsLabel(
                                      m.thinkingMs ??
                                        (!m.content.trim()
                                          ? Math.max(0, Date.now() - Date.parse(m.createdAt))
                                          : undefined),
                                    )}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-2 text-[12px] font-medium text-foreground/90 ring-1 ring-border/45">
                                  <Sparkles className="size-3.5 shrink-0 animate-pulse text-purple-600" />
                                  工作中…
                                </div>
                              </div>
                            ) : null}
                            {m.variant === 'codex' &&
                            !m.streaming &&
                            (m.thinkingMs != null ||
                              m.durationMs != null ||
                              (m.changedFilesCount ?? 0) > 0 ||
                              m.exitCode != null) ? (
                              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                                {m.thinkingMs != null ? (
                                  <span>思考了 {formatThinkingSecondsLabel(m.thinkingMs)}</span>
                                ) : null}
                                {m.thinkingMs != null &&
                                m.changedFilesCount != null &&
                                m.changedFilesCount > 0 ? (
                                  <span aria-hidden>
                                    ·
                                  </span>
                                ) : null}
                                {m.changedFilesCount != null && m.changedFilesCount > 0 ? (
                                  <span>变更约 {m.changedFilesCount} 个文件</span>
                                ) : null}
                                {m.durationMs != null &&
                                (m.thinkingMs != null ||
                                  (m.changedFilesCount != null && m.changedFilesCount > 0)) ? (
                                  <span aria-hidden>
                                    ·
                                  </span>
                                ) : null}
                                {m.durationMs != null ? (
                                  <span>总耗时 {formatDurationShort(m.durationMs)}</span>
                                ) : null}
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
                                    <Streamdown className={AGENT_CHAT_MARKDOWN_CLASS}>
                                      {polishCodexBubbleForUi(m.content)}
                                    </Streamdown>
                                  </div>
                                ) : (
                                  <span className="text-xs leading-relaxed text-muted-foreground">
                                    Agent 已启动，正在等待终端输出。部分场景下会先缓冲数秒；完整日志可点上方「文档」图标查看。
                                  </span>
                                )}
                              </div>
                            ) : m.variant === 'codex' && !m.streaming && m.content.trim() ? (
                              <div className="min-w-0 space-y-3">
                                <div className="flex gap-3 rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5 ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
                                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-background shadow-sm ring-1 ring-border/50">
                                    <Package className="size-4 text-primary" />
                                  </div>
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <p className="text-sm font-semibold leading-snug text-foreground">
                                      {(() => {
                                        const d = getCodexBubbleDisplayContent(m.content);
                                        return d.shortChat
                                          ? d.bodyForMarkdown.trim() || d.title
                                          : d.title;
                                      })()}
                                    </p>
                                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                                      {formatCodexCompletedAtSubtitle(m.createdAt, m.exitCode ?? null)}
                                    </p>
                                  </div>
                                </div>
                                {(() => {
                                  const display = getCodexBubbleDisplayContent(m.content);
                                  if (display.shortChat) return null;
                                  if (!display.bodyForMarkdown.trim()) return null;
                                  return (
                                    <div className="min-w-0 max-w-full overflow-x-auto overflow-y-visible">
                                      <Streamdown className={AGENT_CHAT_MARKDOWN_CLASS}>
                                        {display.bodyForMarkdown}
                                      </Streamdown>
                                    </div>
                                  );
                                })()}
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
                在
                <span className="font-medium text-foreground"> Ask </span>
                下仅写入对话气泡（不跑 Codex）；在
                <span className="font-medium text-foreground"> Agent </span>
                下发送并执行（需 Workspace 就绪），
                <span className="font-medium text-foreground"> Shift+Enter </span>
                换行。
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
                      e.preventDefault();
                      if (composerMode === 'ask') {
                        handleChatAppendUser();
                        return;
                      }
                      if (!canComposerRunCodex) return;
                      void handleChatSendAndExecute();
                    }}
                  />
                  <div className="flex items-center justify-between gap-2 border-t border-border/30 bg-muted/25 px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-1">
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        spacing={0}
                        value={composerMode}
                        onValueChange={(v) => {
                          if (v !== 'ask' && v !== 'agent') return;
                          setComposerMode(v);
                          if (!activeSession?.id) return;
                          patchSessionMetadata.mutate({
                            id: activeSession.id,
                            patch: { [WORKBENCH_COMPOSER_MODE_KEY]: v },
                            updatedBy: operatorName ?? null,
                          });
                        }}
                        disabled={!step1Done}
                        className="h-8 shrink-0"
                        aria-label="输入模式：Ask 或 Agent"
                      >
                        <ToggleGroupItem
                          value="ask"
                          aria-label="Ask：仅对话"
                          className="h-8 gap-1 px-2.5 text-xs data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                        >
                          <MessageSquarePlus className="size-3.5 shrink-0" />
                          Ask
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="agent"
                          aria-label="Agent：执行编码"
                          className="h-8 gap-1 px-2.5 text-xs data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                        >
                          <Cpu className="size-3.5 shrink-0" />
                          Agent
                        </ToggleGroupItem>
                      </ToggleGroup>
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
                        {CODING_TOOL_CONFIG[codingTool].label}
                      </Badge>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            className={cn(
                              'size-9 shrink-0 rounded-full shadow-sm',
                              composerMode === 'ask'
                                ? canComposerSendAsk
                                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                  : ''
                                : canComposerRunCodex && chatDraft.trim()
                                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                  : '',
                            )}
                            disabled={
                              composerMode === 'ask'
                                ? !canComposerSendAsk
                                : !canComposerRunCodex || !chatDraft.trim()
                            }
                            onClick={() => {
                              if (composerMode === 'ask') {
                                handleChatAppendUser();
                                return;
                              }
                              void handleChatSendAndExecute();
                            }}
                            aria-label={
                              composerMode === 'ask'
                                ? '发送（Ask，仅对话）'
                                : `发送并执行 ${CODING_TOOL_CONFIG[codingTool].label}（Agent）`
                            }
                          >
                            {composerMode === 'agent' && runCodexToolCall.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <ArrowUp className="size-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {composerMode === 'ask'
                            ? 'Ask：仅写入对话，不执行编码工具'
                            : `Agent：发送并执行本轮 ${CODING_TOOL_CONFIG[codingTool].label}（Workspace 就绪时）`}
                        </TooltipContent>
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
            <DialogContent className="flex max-h-[min(560px,78vh)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
              <DialogHeader className="border-b border-border px-6 py-4 text-left">
                <DialogTitle>会话历史</DialogTitle>
                <DialogDescription className="text-xs leading-relaxed">
                  主标题从已保存对话中提炼最近要点；副标题为会话名、绑定关系与最后活动时间。标记「当前流水线」的是本流水线绑定的会话。
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <ul className="space-y-3">
                  {groupAgentSessionsForHistoryList(sessions).map(({ bucket, sessions: bucketSessions }) => (
                    <li key={bucket} className="list-none">
                      <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {AGENT_SESSION_HISTORY_BUCKET_LABEL[bucket]}
                      </div>
                      <ul className="space-y-2">
                        {bucketSessions.map((s) => {
                          const isCurrentPipeline = pipelineLinkedSession?.id === s.id;
                          const isActiveView = activeSession?.id === s.id;
                          const preview = deriveWorkbenchSessionHistoryPreview(s);
                          return (
                            <li key={s.id}>
                              <button
                                type="button"
                                className={cn(
                                  'w-full rounded-lg border px-3 py-3 text-left text-sm shadow-sm transition-colors hover:bg-accent/80 hover:text-accent-foreground',
                                  isActiveView
                                    ? 'border-primary/40 bg-primary/[0.07] ring-1 ring-primary/15'
                                    : 'border-border/70 bg-card',
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
                                <div className="flex items-start gap-2.5">
                                  <div className="min-w-0 flex-1 space-y-1.5">
                                    <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
                                      {preview ?? '（暂无对话摘要，进入后可继续发送）'}
                                    </p>
                                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                                      {formatSessionHistoryMetaRow(s)}
                                    </p>
                                  </div>
                                  {isCurrentPipeline ? (
                                    <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px] font-normal">
                                      当前流水线
                                    </Badge>
                                  ) : null}
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bot className="size-5 text-primary" />
              Agent 工作台
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed max-w-none">
              创建流水线后自动完成 Thread 与 Workspace 准备；步骤 1～3 默认收起，点击步骤条可展开查看详情。
            </CardDescription>
          </div>
          {codingToolbar}
        </div>
      </CardHeader>
      <CardContent className="pt-2">{stepper}</CardContent>
    </Card>
  );
}
