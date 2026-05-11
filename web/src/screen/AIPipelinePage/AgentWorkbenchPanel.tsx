'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Square,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  usePipelineRunsList,
  usePrepareAgentToolCall,
  useProvisionAgentWorkspace,
  useRunAgentToolCallWithCodex,
  useUpsertAgentTask,
} from '@/lib/rd-hooks';
import type { IAgentExecutionEvent, IAgentSession, IAgentToolCall, IAgentWorkspace, IPipelineTask } from '@/lib/rd-types';
import { logger } from '@/lib/logger';
import { buildAgentDiffReviewSummary } from '@/lib/agent-review-utils';
import { fillAiSkillPromptTemplate } from '@/lib/ai-skill-engine';
import { AGENT_WORKBENCH_PLAN_SKILL_ID, getAiSkill } from '@/lib/ai-skills';
import { canStartAgentToolCall, shouldCreateAgentToolCallRetry } from '@/lib/pipeline-page-utils';
import { cn } from '@/lib/utils';

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

export function AgentWorkbenchPanel({ task, operatorName }: IAgentWorkbenchPanelProps) {
  const [instruction, setInstruction] = useState(
    '请根据 PRD、功能规格(FS)、技术规格(TS) 与实现计划完成编码与验证。',
  );
  const [codingTool, setCodingTool] = useState<ICodingToolChoice>('codex_cli');
  const [runtimeOutput, setRuntimeOutput] = useState('');
  const [runtimeState, setRuntimeState] = useState<ICodexRuntimeState>(initialCodexRuntimeState);

  const { data: runs = [] } = usePipelineRunsList(task.requirementId);
  const latestRun = latestByTime(runs);
  const { data: sessions = [] } = useAgentSessionsList({ requirementId: task.requirementId });
  const activeSession = useMemo<IAgentSession | undefined>(
    () => sessions.find((session) => session.pipelineRunId === latestRun?.id) || latestByTime(sessions),
    [latestRun?.id, sessions],
  );
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

  const isBusy =
    createPipelineRun.isPending ||
    createContextPack.isPending ||
    createAgentSession.isPending ||
    upsertAgentTask.isPending ||
    provisionWorkspace.isPending ||
    executeWorkspaceLifecycle.isPending ||
    prepareToolCall.isPending ||
    approveToolCall.isPending;

  const codexToolCall = useMemo<IAgentToolCall | undefined>(
    () => [...toolCalls].reverse().find((toolCall) => toolCall.toolName === 'codex.exec'),
    [toolCalls],
  );
  const isCodexRunning = runCodexToolCall.isPending || codexToolCall?.status === 'running';
  const codexCanStart = canStartAgentToolCall(codexToolCall?.status, codexToolCall?.approvalStatus);
  const codexNeedsRetry = shouldCreateAgentToolCallRetry(codexToolCall?.status);
  const codexWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === codexToolCall?.workspaceId),
    [codexToolCall?.workspaceId, workspaces],
  );
  const primaryWorkspace = useMemo(() => pickWorkspaceForSession(workspaces), [workspaces]);
  const isCodexWorkspaceReady = codexWorkspace?.status === 'ready' && Boolean(codexWorkspace.worktreePath);

  const step1Done = Boolean(activeSession);
  const step2Done = isCodexWorkspaceReady;
  const pendingApprovals = useMemo(
    () => toolCalls.filter((tc) => tc.approvalStatus === 'pending'),
    [toolCalls],
  );

  const appendLog = (line: string) => {
    setRuntimeOutput((prev) => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}${line}\n`);
  };

  const codexServerSyncKey = codexToolCall
    ? `${codexToolCall.id}:${codexToolCall.status}:${String(codexToolCall.metadata?.lastOutputAt ?? '')}:${String(codexToolCall.metadata?.executorLogPath ?? '')}:${String(codexToolCall.updatedAt ?? '')}`
    : '';

  useEffect(() => {
    if (runCodexToolCall.isPending) return;
    if (!codexToolCall || codexToolCall.toolName !== 'codex.exec') return;
    const m = codexToolCall.metadata;
    const logPath = typeof m.executorLogPath === 'string' ? m.executorLogPath : '';
    const stdout = typeof m.stdout === 'string' ? m.stdout : '';
    const stderr = typeof m.stderr === 'string' ? m.stderr : '';
    if (!logPath && !stdout && !stderr) return;
    const header = [
      logPath
        ? `【服务端完整日志文件】${logPath}\n（全文落盘；数据库仅保留末尾约 20KB 摘要。离开页面后请用该文件或下方摘要排查。）\n`
        : '',
      codexToolCall.status === 'running'
        ? '【执行状态】running：Codex 可能仍在服务端执行；本页每 2.5s 拉取一次数据库中的输出摘要。\n'
        : `【执行状态】${codexToolCall.status} exit=${codexToolCall.exitCode ?? '—'}\n`,
      '---\n',
    ].join('');
    const body = [stdout, stderr ? `\n--- stderr（尾部） ---\n${stderr}` : ''].join('');
    setRuntimeOutput(`${header}${body}`);
  }, [codexServerSyncKey, runCodexToolCall.isPending]);

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

  const handleRunCoding = async () => {
    if (codingTool !== 'codex_cli') {
      toast.message('该编码工具尚未接入', { description: '请暂时选择 Codex CLI' });
      return;
    }
    if (!activeSession || !codexToolCall) {
      toast.error('请先完成步骤 1 与 2');
      return;
    }
    if (!isCodexWorkspaceReady) {
      toast.error('Workspace 未就绪，请先完成步骤 2');
      return;
    }
    appendLog('[步骤3] 启动编码工具…');
    setRuntimeOutput((prev) => `${prev}\n`);
    setRuntimeState({
      ...initialCodexRuntimeState,
      phase: 'starting',
      toolCallId: codexToolCall.id,
      startedAt: new Date().toISOString(),
    });
    try {
      let runnableToolCall = codexToolCall;
      if (!codexCanStart) {
        if (!codexNeedsRetry) {
          toast.error(`当前工具调用状态为 ${codexToolCall.status}，暂不能启动`);
          return;
        }
        runnableToolCall = await prepareToolCall.mutateAsync({
          sessionId: activeSession.id,
          workspaceId: codexToolCall.workspaceId,
          toolName: 'codex.exec',
          toolCategory: 'ai',
          inputSummary: '重试：在隔离 workspace 中执行编码任务',
          command: codexToolCall.command || 'codex exec --cd <workspace> --sandbox workspace-write <prompt>',
          metadata: {
            ...codexToolCall.metadata,
            retryOfToolCallId: codexToolCall.id,
            retryCreatedAt: new Date().toISOString(),
            prompt: activeSession.planMarkdown || instruction,
          },
        });
        setRuntimeState((prev) => ({ ...prev, toolCallId: runnableToolCall.id }));
        appendLog(`[步骤3] 已创建重试工具调用 ${runnableToolCall.id}`);
      }
      await runCodexToolCall.mutateAsync({
        id: runnableToolCall.id,
        sessionId: activeSession.id,
        prompt: activeSession.planMarkdown || instruction,
        onEvent: (event: IAgentExecutionEvent) => {
          if (event.type === 'started') {
            setRuntimeState((prev) => ({
              ...prev,
              phase: 'starting',
              toolCallId: event.toolCallId,
              status: event.status || prev.status,
              lastEventAt: new Date().toISOString(),
            }));
            appendLog('[步骤4] Codex 已启动');
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
            appendLog(`[步骤4] 子进程 pid=${event.pid ?? '?'} cwd=${event.cwd || '-'}`);
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
            setRuntimeOutput((prev) => `${prev}${event.chunk}`);
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
            appendLog(`[步骤4][错误] ${event.message || '执行失败'}`);
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
              `[步骤4] 结束 exit=${event.exitCode ?? '?'} 耗时=${event.durationMs ?? 0}ms 变更文件≈${event.changedFilesCount ?? 0}`,
            );
          }
        },
      });
      toast.success('编码任务已结束');
    } catch (error) {
      setRuntimeState((prev) => ({
        ...prev,
        phase: 'error',
        message: error instanceof Error ? error.message : '编码任务失败',
        lastEventAt: new Date().toISOString(),
      }));
      logger.error('编码任务失败', error);
      toast.error(error instanceof Error ? error.message : '编码任务失败');
    }
  };

  const handleCancelCodex = async () => {
    if (!activeSession || !codexToolCall) return;
    try {
      await cancelCodexExecution.mutateAsync({
        id: codexToolCall.id,
        sessionId: activeSession.id,
      });
      appendLog('[步骤4] 已请求停止编码进程');
      toast.success('已请求停止');
    } catch (error) {
      logger.error('停止失败', error);
      toast.error(error instanceof Error ? error.message : '停止失败');
    }
  };

  const runtimePlaceholder =
    '日志：步骤 2 的 Workspace 命令与步骤 3/4 的编码输出将显示在此处。';

  const stepper = (
    <ol className="space-y-6">
      <li
        className={cn(
          'rounded-lg border border-border bg-card p-4 shadow-sm',
          'border-l-[3px] border-l-primary',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 mb-3">
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
        <p className="text-xs text-muted-foreground mb-3 flex items-start gap-1.5">
          <FileText className="size-3.5 shrink-0 mt-0.5 text-primary" />
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
      </li>

      <li
        className={cn(
          'rounded-lg border border-border bg-card p-4 shadow-sm',
          'border-l-[3px] border-l-primary',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 mb-3">
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
        {primaryWorkspace ? (
          <div className="mt-3 rounded-md border bg-muted/20 px-3 py-2 font-mono text-xs text-muted-foreground break-all">
            <span className="font-sans font-medium text-foreground">当前目录：</span>
            {primaryWorkspace.worktreePath || primaryWorkspace.repoUrl} · {primaryWorkspace.status}
          </div>
        ) : null}
      </li>

      <li
        className={cn(
          'rounded-lg border border-border bg-card p-4 shadow-sm',
          'border-l-[3px] border-l-primary',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              3
            </span>
            调用编码工具
          </div>
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
              onClick={handleRunCoding}
              disabled={!step2Done || !codexToolCall || isCodexRunning || codingTool !== 'codex_cli'}
            >
              {runCodexToolCall.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Terminal className="mr-2 size-4" />}
              开始编码
            </Button>
            <Button
              variant="outline"
              onClick={handleCancelCodex}
              disabled={!codexToolCall || !isCodexRunning || cancelCodexExecution.isPending}
            >
              {cancelCodexExecution.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Square className="mr-2 size-4" />}
              停止
            </Button>
          </div>
        </div>
      </li>

      <li
        className={cn(
          'rounded-lg border border-border bg-card p-4 shadow-sm',
          'border-l-[3px] border-l-primary',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              4
            </span>
            实时反馈
          </div>
          <Badge variant={runtimeState.phase === 'error' ? 'destructive' : 'outline'}>{runtimeState.phase}</Badge>
        </div>
        {(runCodexToolCall.isPending || codexToolCall?.status === 'running') && (
          <Alert variant="warning" className="mb-3">
            <Terminal className="size-4" />
            <AlertTitle>编码任务与连接状态</AlertTitle>
            <AlertDescription>
              {runCodexToolCall.isPending
                ? '本页正通过流式连接接收输出；离开页面会断开该连接（服务端 Codex 多数情况下仍会继续跑完）。完整输出以步骤 4 顶部「服务端完整日志文件」为准。'
                : '工具调用状态为 running：Codex 可能仍在服务端执行；本页每 2.5s 拉取数据库中的输出摘要。也可登录运行后端的主机查看日志文件。'}
            </AlertDescription>
          </Alert>
        )}
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-md border border-border px-2 py-1.5">
            <div className="text-muted-foreground">PID</div>
            <div className="font-mono">{runtimeState.pid ?? '—'}</div>
          </div>
          <div className="rounded-md border border-border px-2 py-1.5">
            <div className="text-muted-foreground">Exit</div>
            <div className="font-mono">{runtimeState.exitCode ?? '—'}</div>
          </div>
          <div className="rounded-md border border-border px-2 py-1.5">
            <div className="text-muted-foreground">耗时</div>
            <div className="font-mono">{runtimeState.durationMs != null ? `${runtimeState.durationMs}ms` : '—'}</div>
          </div>
          <div className="rounded-md border border-border px-2 py-1.5">
            <div className="text-muted-foreground">变更文件</div>
            <div className="font-mono">{reviewSummary.files.length || runtimeState.changedFilesCount}</div>
          </div>
        </div>
        {activeSession ? (
          <details className="mb-3 rounded-md border border-border text-sm">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium text-foreground bg-muted/30">
              查看生成的提示词（plan）
            </summary>
            <div className="max-h-40 overflow-auto whitespace-pre-wrap border-t border-border p-3 text-xs leading-relaxed text-muted-foreground">
              {activeSession.planMarkdown || '（空）'}
            </div>
          </details>
        ) : null}
        {tasks.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {tasks.map((t) => (
              <span key={t.id} className="rounded-full border border-border px-2 py-0.5">
                {t.title}: {t.status}
              </span>
            ))}
          </div>
        ) : null}
        {pendingApprovals.length > 0 ? (
          <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
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
        <div className="rounded-lg border border-border bg-slate-950 p-3">
          <div className="mb-2 text-xs font-medium text-slate-400">输出流</div>
          <pre className="max-h-[min(360px,50vh)] overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-slate-100">
            {runtimeOutput.trim() || runtimePlaceholder}
          </pre>
        </div>
        {runtimeState.message ? (
          <p className="mt-2 text-xs text-red-600">{runtimeState.message}</p>
        ) : null}
      </li>
    </ol>
  );

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="size-5 text-primary" />
          Agent 工作台
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed max-w-[720px]">
          参考{' '}
          <a
            href="https://miaoda.feishu.cn/home"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            飞书妙搭
          </a>
          ：在网页下达指令，由 ContextPack 携带 PRD / FS / TS 等文档，与仓库一起在 Workspace 中交给编码工具执行，并在步骤 4 查看实时输出。
        </CardDescription>
      </CardHeader>
      <CardContent>{stepper}</CardContent>
    </Card>
  );
}
