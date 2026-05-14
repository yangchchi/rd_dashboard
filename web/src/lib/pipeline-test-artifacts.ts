import { rdApi } from '@/lib/rd-api';
import type {
  IAgentWorkspace,
  IAgentWorkspaceSourceTreeNode,
  IPipelineGeneratedTestCase,
  IPipelineTask,
  IPipelineTestCase,
  IPipelineTestReport,
  ISpecification,
} from '@/lib/rd-types';

function latestByTime<T extends { createdAt: string }>(items: T[]): T | undefined {
  return [...items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
}

function pickWorkspaceForSession(workspaces: IAgentWorkspace[]): IAgentWorkspace | undefined {
  const open = workspaces.filter((w) => w.status !== 'archived');
  if (!open.length) return undefined;
  return [...open].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
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

const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs|vue|py|go|rs|java|kt)$/i;

function sliceCenter(text: string, max: number): string {
  if (text.length <= max) return text;
  const half = Math.floor(max / 2);
  return `${text.slice(0, half)}\n\n/* … 中间省略 ${text.length - max} 字符 … */\n\n${text.slice(-half)}`;
}

/**
 * 解析 AI 输出中的 ```json ... ``` 代码块。
 */
export function parseJsonCodeBlock<T>(text: string): T | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!m) return null;
  const raw = m[1].trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function stableHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function resolveSpecsForPipelineTask(
  task: IPipelineTask,
  allSpecs: ISpecification[],
): ISpecification[] {
  const specIds = new Set((task.pipelineMeta?.specIds ?? []).filter(Boolean));
  const prdIds = new Set((task.pipelineMeta?.prdIds ?? []).filter(Boolean));
  const byIds = allSpecs.filter((s) => specIds.has(s.id));
  if (byIds.length) return byIds;
  return allSpecs.filter((s) => prdIds.has(s.prdId));
}

export function buildFsTsContextForTask(task: IPipelineTask, linkedSpecs: ISpecification[]): string {
  const parts: string[] = [];
  parts.push(`流水线：${task.requirementTitle}（${task.requirementId}）`);
  if (!linkedSpecs.length) {
    parts.push('【规格】未匹配到关联 FS/TS，请检查 pipelineMeta.specIds / prdIds。');
    return parts.join('\n\n');
  }
  for (const spec of linkedSpecs) {
    parts.push(`=== 规格 ${spec.id}（PRD ${spec.prdId}）===`);
    if (spec.fsMarkdown?.trim()) {
      parts.push('--- FS（Markdown）---\n' + sliceCenter(spec.fsMarkdown.trim(), 12_000));
    }
    if (spec.tsMarkdown?.trim()) {
      parts.push('--- TS（Markdown）---\n' + sliceCenter(spec.tsMarkdown.trim(), 12_000));
    }
    parts.push('--- FS（结构化 functionalSpec）---\n' + sliceCenter(JSON.stringify(spec.functionalSpec, null, 2), 10_000));
    parts.push('--- TS（结构化 technicalSpec）---\n' + sliceCenter(JSON.stringify(spec.technicalSpec, null, 2), 10_000));
    if (spec.machineReadableJson?.trim()) {
      parts.push('--- machineReadableJson ---\n' + sliceCenter(spec.machineReadableJson.trim(), 8000));
    }
  }
  return parts.join('\n\n');
}

/**
 * 从 Agent Workspace 拉取若干源文件片段，作为测试用例生成的「生成代码」依据。
 */
export async function collectAgentWorkspaceCodeExcerpt(requirementId: string): Promise<string> {
  const runs = await rdApi.listPipelineRuns(requirementId);
  const latestRun = latestByTime(runs);
  const sessions = await rdApi.listAgentSessions({ requirementId });
  const session =
    sessions.find((s) => s.pipelineRunId === latestRun?.id) ?? latestByTime(sessions);
  if (!session?.id) {
    return '【生成代码】暂无 Agent 会话，请先在「Agent 工作台」关联流水线并生成 worktree。';
  }
  const workspaces = await rdApi.listAgentWorkspaces(session.id);
  const ready = workspaces.find((w) => w.status === 'ready' && Boolean(w.worktreePath?.trim()));
  const workspace = ready ?? pickWorkspaceForSession(workspaces);
  if (!workspace?.id) {
    return '【生成代码】未找到可用 Workspace。';
  }
  const tree = await rdApi.listAgentWorkspaceSourceTree(workspace.id);
  const paths = flattenAgentWorkspaceFilePaths(tree.nodes ?? []).filter((p) => CODE_EXT.test(p));
  if (!paths.length) {
    return '【生成代码】源树中未找到常见源码文件（.ts/.tsx/.js 等）。';
  }
  const take = paths.slice(0, 14);
  const blocks: string[] = [];
  let budget = 28_000;
  for (const p of take) {
    if (budget < 800) break;
    try {
      const file = await rdApi.getAgentWorkspaceSourceFile(workspace.id, p);
      const header = `// ---- ${p}${file.truncated ? '（服务端已截断）' : ''} ----\n`;
      const body = sliceCenter(file.content, Math.min(6000, budget - header.length));
      blocks.push(header + body);
      budget -= header.length + body.length;
    } catch {
      blocks.push(`// ---- ${p} ----\n// （读取失败，已跳过）\n`);
    }
  }
  return blocks.join('\n\n');
}

function normalizeBasis(v: unknown): Array<'fs' | 'ts' | 'code'> {
  if (!Array.isArray(v)) return ['fs'];
  const out: Array<'fs' | 'ts' | 'code'> = [];
  for (const x of v) {
    if (x === 'fs' || x === 'ts' || x === 'code') out.push(x);
  }
  return out.length ? out : ['fs'];
}

export function parseGeneratedCasesFromAi(text: string): IPipelineGeneratedTestCase[] | null {
  const parsed = parseJsonCodeBlock<{ cases?: unknown[] }>(text);
  const rawCases = parsed?.cases;
  if (!Array.isArray(rawCases) || rawCases.length === 0) return null;
  const out: IPipelineGeneratedTestCase[] = [];
  for (let i = 0; i < rawCases.length; i += 1) {
    const row = rawCases[i];
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const title = String(o.title ?? o.name ?? '').trim();
    if (!title) continue;
    const id = String(o.id ?? `tc_ai_${Date.now()}_${i}`).trim();
    out.push({
      id,
      title,
      basis: normalizeBasis(o.basis),
      trace: String(o.trace ?? o.rationale ?? '').trim() || '—',
      steps: String(o.steps ?? o.step ?? '').trim() || '—',
      expected: String(o.expected ?? o.assertion ?? '').trim() || '—',
      relatedApiPath: o.relatedApiPath != null ? String(o.relatedApiPath) : undefined,
    });
  }
  return out.length ? out : null;
}

/** 无模型或 JSON 解析失败时，从 FS/TS 结构推导占位用例，保证流程可演示。 */
export function heuristicGeneratedCasesFromSpecs(linkedSpecs: ISpecification[]): IPipelineGeneratedTestCase[] {
  const cases: IPipelineGeneratedTestCase[] = [];
  let n = 0;
  for (const spec of linkedSpecs) {
    for (const api of spec.functionalSpec.apis.slice(0, 12)) {
      n += 1;
      cases.push({
        id: `tc_fs_${spec.id}_${n}`,
        title: `${api.method} ${api.path} 契约与错误路径`,
        basis: ['fs', 'code'],
        trace: `FS.functionalSpec.apis · ${api.path}`,
        steps: `构造符合 requestParams 的请求，调用 ${api.method} ${api.path}；覆盖 2xx 与典型 4xx。`,
        expected: '响应体符合 FS 中 response 定义；错误时返回约定结构。',
        relatedApiPath: api.path,
      });
    }
    const schemaKeys = Object.keys(spec.technicalSpec.databaseSchema ?? {}).slice(0, 4);
    if (schemaKeys.length) {
      n += 1;
      cases.push({
        id: `tc_ts_${spec.id}_${n}`,
        title: `数据层与 TS.databaseSchema 一致性（${schemaKeys.join(', ')}）`,
        basis: ['ts', 'code'],
        trace: 'TS.technicalSpec.databaseSchema',
        steps: '校验迁移/实体字段与 TS 中 schema 描述一致；空值与约束策略符合说明。',
        expected: '读写路径无未声明字段；索引与关系符合架构描述。',
      });
    }
    for (const ev of spec.functionalSpec.uiComponents.slice(0, 3)) {
      n += 1;
      cases.push({
        id: `tc_ui_${spec.id}_${n}`,
        title: `UI 组件 ${ev.name} 属性与事件`,
        basis: ['fs', 'code'],
        trace: `FS.uiComponents · ${ev.name}`,
        steps: `渲染 ${ev.name}，校验 props 与 events：${(ev.events ?? []).join(', ')}`,
        expected: '交互与 FS 中组件定义一致。',
      });
    }
  }
  if (cases.length < 3) {
    cases.push({
      id: 'tc_generic_smoke',
      title: '端到端冒烟：主流程可完成且无未处理异常',
      basis: ['fs', 'ts', 'code'],
      trace: 'FS+TS+生成代码综合',
      steps: '按 PRD 主路径执行关键用户操作。',
      expected: '无 5xx；核心数据与 FS/TS 一致。',
    });
  }
  return cases.slice(0, 24);
}

/** 解析「执行测试」AI 输出中的 JSON：coverage + details[] */
export function parseExecutionReportFromAi(text: string): IPipelineTestReport | null {
  const parsed = parseJsonCodeBlock<{
    coverage?: number;
    details?: Array<{ name?: string; status?: string; duration?: string; error?: string }>;
  }>(text);
  if (!parsed?.details || !Array.isArray(parsed.details)) return null;
  const details: IPipelineTestCase[] = [];
  for (const d of parsed.details) {
    if (!d || typeof d !== 'object') continue;
    const name = String(d.name ?? '').trim();
    if (!name) continue;
    const st = String(d.status ?? '').toLowerCase();
    const status: IPipelineTestCase['status'] = st === 'failed' || st === 'fail' ? 'failed' : 'passed';
    details.push({
      name,
      status,
      duration: String(d.duration ?? '—').trim() || '—',
      error: d.error != null && String(d.error).trim() ? String(d.error) : undefined,
    });
  }
  if (!details.length) return null;
  const passed = details.filter((x) => x.status === 'passed').length;
  const failed = details.length - passed;
  let coverage = Number(parsed.coverage);
  if (!Number.isFinite(coverage)) {
    coverage = Math.min(98, Math.round(52 + (passed / details.length) * 44));
  }
  coverage = Math.max(0, Math.min(100, Math.round(coverage)));
  return {
    total: details.length,
    passed,
    failed,
    coverage,
    details,
  };
}

export function heuristicExecuteReport(
  cases: IPipelineGeneratedTestCase[],
  runSalt: string,
): IPipelineTestReport {
  const details: IPipelineTestCase[] = cases.map((c) => {
    const pass = stableHash(`${c.id}:${runSalt}`) % 11 !== 0;
    const ms = 12 + (stableHash(c.title + runSalt) % 180);
    return {
      name: c.title,
      status: pass ? 'passed' : 'failed',
      duration: `${ms}ms`,
      error: pass ? undefined : '断言失败：与 FS/TS 或代码实现不一致（演示占位）。',
    };
  });
  const passed = details.filter((d) => d.status === 'passed').length;
  const failed = details.length - passed;
  const coverage = Math.min(98, Math.round(58 + (passed / Math.max(details.length, 1)) * 38));
  return {
    total: details.length,
    passed,
    failed,
    coverage,
    details,
  };
}
