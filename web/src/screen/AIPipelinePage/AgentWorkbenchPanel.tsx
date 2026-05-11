'use client';

import React, { useMemo, useState } from 'react';
import { Bot, CheckCircle2, FileDiff, Loader2, MessageSquareText, ShieldCheck, Square, Terminal, Workflow } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import type { IAgentExecutionEvent, IAgentSession, IAgentToolCall, IPipelineTask } from '@/lib/rd-types';
import { logger } from '@/lib/logger';
import { buildAgentDiffReviewSummary } from '@/lib/agent-review-utils';
import { canStartAgentToolCall, shouldCreateAgentToolCallRetry } from '@/lib/pipeline-page-utils';

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

function formatPlanPrompt(task: IPipelineTask, instruction: string): string {
  return [
    `# Agent Plan - ${task.requirementTitle}`,
    '',
    '## 目标',
    instruction.trim() || '请基于 ContextPack 完成本需求的代码实现与验证。',
    '',
    '## 推荐执行步骤',
    '- [ ] 读取 context/requirement.md、context/prd.md、context/fs.json、context/ts.json、context/cp.md',
    '- [ ] 输出影响文件清单、风险点与测试计划',
    '- [ ] 等待技术经理批准计划',
    '- [ ] 创建隔离 workspace 与 agent branch',
    '- [ ] 通过 Tool Gateway 执行受控 git/file/test 工具调用',
    '',
    '## 必须验证',
    '- [ ] 运行与变更相关的最小测试',
    '- [ ] 汇总 diff、测试结果、风险与回滚建议',
  ].join('\n');
}

function latestByTime<T extends { createdAt: string }>(items: T[]): T | undefined {
  return [...items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
}

export function AgentWorkbenchPanel({ task, operatorName }: IAgentWorkbenchPanelProps) {
  const [instruction, setInstruction] = useState('请根据 CP 编程计划执行实现，并在每个步骤后运行对应验证命令。');
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
  const { data: toolCalls = [] } = useAgentToolCalls(activeSession?.id);
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
  const isCodexWorkspaceReady = codexWorkspace?.status === 'ready' && Boolean(codexWorkspace.worktreePath);
  const workspaceLifecycleCalls = useMemo(
    () =>
      codexWorkspace
        ? toolCalls
            .filter((toolCall) => toolCall.workspaceId === codexWorkspace.id && toolCall.toolName.startsWith('git.'))
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        : [],
    [codexWorkspace, toolCalls],
  );
  const runtimePlaceholder = codexWorkspace && !isCodexWorkspaceReady
    ? '等待 Workspace 准备：请点击“执行 Workspace 准备”，完成 git.clone_cache / git.fetch / git.worktree_add 后再运行 Codex CLI。'
    : '等待 Codex CLI 输出...';

  const handleStartPlanning = async () => {
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
      const planMarkdown = formatPlanPrompt(task, instruction);
      const session = await createAgentSession.mutateAsync({
        requirementId: task.requirementId,
        pipelineRunId: run.id,
        contextPackId: contextPack.id,
        title: `${task.requirementTitle} Agent Thread`,
        status: 'awaiting_approval',
        runtimeAdapter: 'codex_cli',
        baseBranch: task.pipelineMeta.branch || 'main',
        planMarkdown,
        riskLevel: 'medium',
        metadata: { instruction, contextPackChecksum: contextPack.checksum },
        createdBy: operatorName,
      });
      await upsertAgentTask.mutateAsync({
        sessionId: session.id,
        role: 'planner',
        title: '生成实现计划',
        instructions: instruction,
        status: 'awaiting_approval',
        orderIndex: 1,
        locked: true,
        requiresApproval: true,
        metadata: { contextPackId: contextPack.id },
      });
      toast.success('Agent Thread 已创建，计划等待审核');
    } catch (error) {
      logger.error('创建 Agent Thread 失败', error);
      toast.error(error instanceof Error ? error.message : '创建 Agent Thread 失败');
    }
  };

  const handleApprovePlan = async () => {
    if (!activeSession) return;
    if (!task.pipelineMeta.gitUrl?.trim()) {
      toast.error('当前流水线缺少 Git 地址，无法创建 workspace');
      return;
    }
    try {
      await upsertAgentTask.mutateAsync({
        sessionId: activeSession.id,
        role: 'planner',
        title: '计划已批准',
        instructions: activeSession.planMarkdown || instruction,
        status: 'succeeded',
        orderIndex: 1,
        locked: true,
        requiresApproval: false,
        metadata: { approvedBy: operatorName, approvedAt: new Date().toISOString() },
      });
      const result = await provisionWorkspace.mutateAsync({
        sessionId: activeSession.id,
        repoUrl: task.pipelineMeta.gitUrl,
        baseBranch: task.pipelineMeta.branch || activeSession.baseBranch || 'main',
        createdBy: operatorName,
        kind: 'worktree',
      });
      await prepareToolCall.mutateAsync({
        sessionId: activeSession.id,
        workspaceId: result.workspace.id,
        toolName: 'codex.exec',
        toolCategory: 'ai',
        inputSummary: '调用 Codex CLI 在隔离 workspace 中执行编码任务',
        command: 'codex exec --cd <workspace> --sandbox workspace-write --ask-for-approval never <prompt>',
        metadata: {
          stage: 'plan-approved',
          prompt: activeSession.planMarkdown || instruction,
        },
      });
      toast.success('计划已批准，workspace 生命周期工具调用已生成');
    } catch (error) {
      logger.error('批准 Agent 计划失败', error);
      toast.error(error instanceof Error ? error.message : '批准 Agent 计划失败');
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
        reason: 'MVP 手动批准',
      });
      toast.success('工具调用已批准');
    } catch (error) {
      logger.error('批准工具调用失败', error);
      toast.error('批准失败');
    }
  };

  const handleRunCodex = async () => {
    if (!activeSession || !codexToolCall) return;
    if (!isCodexWorkspaceReady) {
      toast.error('Workspace 尚未 ready，请先完成 git 生命周期工具调用');
      setRuntimeState({
        ...initialCodexRuntimeState,
        phase: 'error',
        toolCallId: codexToolCall.id,
        status: codexToolCall.status,
        message: '未获得 PID：Workspace 尚未 ready，Codex CLI 尚未启动',
      });
      return;
    }
    setRuntimeOutput('');
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
          inputSummary: '重试调用 Codex CLI 在隔离 workspace 中执行编码任务',
          command: codexToolCall.command || 'codex exec --cd <workspace> --sandbox workspace-write --ask-for-approval never <prompt>',
          metadata: {
            ...codexToolCall.metadata,
            retryOfToolCallId: codexToolCall.id,
            retryCreatedAt: new Date().toISOString(),
            prompt: activeSession.planMarkdown || instruction,
          },
        });
        setRuntimeState((prev) => ({
          ...prev,
          toolCallId: runnableToolCall.id,
        }));
        setRuntimeOutput((prev) => `${prev}[executor] retry tool call created: ${runnableToolCall.id}\n`);
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
            setRuntimeOutput((prev) => `${prev}[executor] Codex CLI started\n`);
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
            setRuntimeOutput((prev) => `${prev}[executor] spawned pid=${event.pid ?? 'unknown'} cwd=${event.cwd || '-'}\n`);
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
              message: event.message || 'Codex 执行失败',
              lastEventAt: event.timestamp || new Date().toISOString(),
            }));
            setRuntimeOutput((prev) => `${prev}[error] ${event.message || 'Codex 执行失败'}\n`);
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
            setRuntimeOutput((prev) => `${prev}\n[executor] finished exit=${event.exitCode ?? 'unknown'} duration=${event.durationMs ?? 0}ms\n`);
          }
        },
      });
      toast.success('Codex CLI 执行结束');
    } catch (error) {
      setRuntimeState((prev) => ({
        ...prev,
        phase: 'error',
        message: error instanceof Error ? error.message : 'Codex CLI 执行失败',
        lastEventAt: new Date().toISOString(),
      }));
      logger.error('Codex CLI 执行失败', error);
      toast.error(error instanceof Error ? error.message : 'Codex CLI 执行失败');
    }
  };

  const handlePrepareWorkspaceRuntime = async () => {
    if (!activeSession || !codexWorkspace) return;
    setRuntimeOutput('[workspace] start lifecycle preparation\n');
    setRuntimeState({
      ...initialCodexRuntimeState,
      phase: 'starting',
      status: codexWorkspace.status,
      message: '正在执行 Workspace 准备，Codex CLI 尚未启动',
    });
    try {
      const result = await executeWorkspaceLifecycle.mutateAsync({
        id: codexWorkspace.id,
        sessionId: activeSession.id,
      });
      const lines = result.toolCalls.map((toolCall) => {
        const exit = toolCall.exitCode ?? '-';
        return `[workspace] ${toolCall.toolName} ${toolCall.status} exit=${exit}\n${toolCall.outputSummary || ''}`;
      });
      setRuntimeOutput((prev) => `${prev}${lines.join('\n')}\n[workspace] status=${result.workspace.status}\n`);
      setRuntimeState({
        ...initialCodexRuntimeState,
        phase: result.workspace.status === 'ready' ? 'idle' : 'error',
        status: result.workspace.status,
        message: result.workspace.status === 'ready'
          ? 'Workspace 已 ready，可以运行 Codex CLI'
          : 'Workspace 准备失败，请查看 git 生命周期日志',
      });
      toast.success('Workspace 已准备完成');
    } catch (error) {
      logger.error('执行 Workspace 准备失败', error);
      setRuntimeOutput((prev) => `${prev}[workspace:error] ${error instanceof Error ? error.message : '执行 Workspace 准备失败'}\n`);
      setRuntimeState({
        ...initialCodexRuntimeState,
        phase: 'error',
        status: codexWorkspace.status,
        message: error instanceof Error ? error.message : '执行 Workspace 准备失败',
      });
      toast.error(error instanceof Error ? error.message : '执行 Workspace 准备失败');
    }
  };

  const handleCancelCodex = async () => {
    if (!activeSession || !codexToolCall) return;
    try {
      await cancelCodexExecution.mutateAsync({
        id: codexToolCall.id,
        sessionId: activeSession.id,
      });
      setRuntimeState((prev) => ({
        ...prev,
        phase: 'finished',
        status: 'cancelled',
        message: '已请求停止 Codex CLI',
        lastEventAt: new Date().toISOString(),
      }));
      setRuntimeOutput((prev) => `${prev}\n[executor] cancellation requested\n`);
      toast.success('已请求停止 Codex CLI');
    } catch (error) {
      logger.error('停止 Codex CLI 失败', error);
      toast.error(error instanceof Error ? error.message : '停止 Codex CLI 失败');
    }
  };

  const handleApproveDiffReview = async () => {
    if (!activeSession) return;
    try {
      await prepareToolCall.mutateAsync({
        sessionId: activeSession.id,
        toolName: 'review.approve_diff',
        toolCategory: 'other',
        status: 'succeeded',
        approvalStatus: 'approved',
        riskLevel: reviewSummary.riskHints.length ? 'medium' : 'low',
        inputSummary: '人工批准 Agent diff review 与测试报告',
        outputSummary: `批准文件 ${reviewSummary.files.length} 个，测试命令 ${reviewSummary.testCommands.length} 条`,
        metadata: {
          diffReviewApproved: true,
          approvedBy: operatorName,
          approvedAt: new Date().toISOString(),
          files: reviewSummary.files,
          testCommands: reviewSummary.testCommands,
          failedCommands: reviewSummary.failedCommands,
          riskHints: reviewSummary.riskHints,
        },
      });
      toast.success('Diff Review 已批准');
    } catch (error) {
      logger.error('批准 Diff Review 失败', error);
      toast.error('批准 Diff Review 失败');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            Agent Thread
          </CardTitle>
          <CardDescription>
            对话式派活、计划审核、workspace 准备与工具调用审计。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            className="min-h-[120px]"
            placeholder="给 Agent 的执行要求"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleStartPlanning} disabled={isBusy}>
              {isBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <MessageSquareText className="mr-2 size-4" />}
              创建 Agent Thread
            </Button>
            <Button
              variant="outline"
              onClick={handleApprovePlan}
              disabled={!activeSession || isBusy}
            >
              <ShieldCheck className="mr-2 size-4" />
              批准计划并准备 Workspace
            </Button>
            <Button
              variant="outline"
              onClick={handleRunCodex}
              disabled={!activeSession || !codexToolCall || !isCodexWorkspaceReady || isCodexRunning}
            >
              {runCodexToolCall.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Terminal className="mr-2 size-4" />}
              运行 Codex CLI
            </Button>
            <Button
              variant="outline"
              onClick={handlePrepareWorkspaceRuntime}
              disabled={!activeSession || !codexWorkspace || isCodexWorkspaceReady || executeWorkspaceLifecycle.isPending}
            >
              {executeWorkspaceLifecycle.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}
              执行 Workspace 准备
            </Button>
            <Button
              variant="outline"
              onClick={handleCancelCodex}
              disabled={!activeSession || !codexToolCall || !isCodexRunning || cancelCodexExecution.isPending}
            >
              {cancelCodexExecution.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Square className="mr-2 size-4" />}
              停止执行
            </Button>
          </div>
          {activeSession ? (
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{activeSession.status}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{activeSession.id}</span>
                {activeSession.contextPackId && (
                  <span className="font-mono text-xs text-muted-foreground">ContextPack: {activeSession.contextPackId}</span>
                )}
              </div>
              <div className="prose prose-sm max-w-none text-sm whitespace-pre-wrap">
                {activeSession.planMarkdown || '暂无计划内容'}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              暂无 Agent Thread，请先创建计划。
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Workflow className="size-4 text-primary" />
              Plan Board
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tasks.length ? (
              tasks.map((item) => (
                <div key={item.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{item.title}</span>
                    <Badge variant="outline">{item.status}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {item.role} · order {item.orderIndex}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">暂无 Agent 任务。</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="size-4 text-primary" />
              Tool Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 rounded-md border bg-card p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={runtimeState.phase === 'error' ? 'destructive' : 'outline'}>
                    {runtimeState.phase}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {runtimeState.toolCallId || codexToolCall?.id || 'no tool call'}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {runtimeState.lastEventAt ? `last ${new Date(runtimeState.lastEventAt).toLocaleTimeString()}` : '等待事件'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <div className="rounded-md border p-2">
                  <div className="text-muted-foreground">PID</div>
                  <div className="font-mono">{runtimeState.pid ?? '-'}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-muted-foreground">Exit</div>
                  <div className="font-mono">{runtimeState.exitCode ?? '-'}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-muted-foreground">耗时</div>
                  <div className="font-mono">{runtimeState.durationMs != null ? `${runtimeState.durationMs}ms` : '-'}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-muted-foreground">变更</div>
                  <div className="font-mono">{runtimeState.changedFilesCount}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-muted-foreground">stdout</div>
                  <div className="font-mono">{runtimeState.stdoutBytes} B</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-muted-foreground">stderr</div>
                  <div className="font-mono">{runtimeState.stderrBytes} B</div>
                </div>
                <div className="rounded-md border p-2 md:col-span-2">
                  <div className="text-muted-foreground">状态</div>
                  <div className="font-mono">{runtimeState.status || codexToolCall?.status || '-'}</div>
                </div>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="break-all font-mono text-muted-foreground">
                  cwd: {runtimeState.cwd || String(codexToolCall?.metadata?.cwd || '-')}
                </div>
                <div className="break-all font-mono text-muted-foreground">
                  cmd: {runtimeState.command || codexToolCall?.command || '-'}
                </div>
                {runtimeState.message && (
                  <div className="text-red-600">{runtimeState.message}</div>
                )}
                {!runtimeState.pid && (runtimeState.phase === 'starting' || runtimeState.phase === 'error') && (
                  <div className="text-amber-600">
                    未获得 PID：尚未收到 spawned 事件，不能判定 Codex CLI 已执行。
                  </div>
                )}
                {codexToolCall && !isCodexWorkspaceReady && (
                  <div className="text-amber-600">
                    Workspace 未就绪：请先点击“执行 Workspace 准备”，完成 git.clone_cache / git.fetch / git.worktree_add。
                  </div>
                )}
                {workspaceLifecycleCalls.length > 0 && !isCodexWorkspaceReady && (
                  <div className="space-y-1 pt-1">
                    {workspaceLifecycleCalls.map((toolCall) => (
                      <div key={toolCall.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                        <span className="font-mono">{toolCall.toolName}</span>
                        <span className="font-mono">{toolCall.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <ScrollArea className="h-[280px] pr-3">
              <div className="space-y-2">
                {toolCalls.length ? (
                  toolCalls.map((toolCall) => (
                    <div key={toolCall.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{toolCall.toolName}</span>
                        <Badge variant={toolCall.riskLevel === 'high' ? 'destructive' : 'outline'}>
                          {toolCall.riskLevel}
                        </Badge>
                      </div>
                      <div className="mt-1 font-mono text-xs break-all text-muted-foreground">
                        {toolCall.command || toolCall.inputSummary}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {toolCall.status} / {toolCall.approvalStatus}
                        </span>
                        {toolCall.approvalStatus === 'pending' && (
                          <Button size="sm" variant="outline" onClick={() => handleApproveTool(toolCall.id)}>
                            批准
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">暂无工具调用。</p>
                )}
              </div>
            </ScrollArea>
            <div className="mt-3 rounded-md border bg-slate-950 p-3">
              <div className="mb-2 text-xs font-medium text-slate-400">实时 stdout / stderr</div>
              <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-slate-100">
                {runtimeOutput || runtimePlaceholder}
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileDiff className="size-4 text-primary" />
              Diff Review
            </CardTitle>
            <CardDescription>
              基于工具调用汇总变更文件、测试命令和风险提示。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border p-2">
                <div className="text-lg font-semibold">{reviewSummary.files.length}</div>
                <div className="text-xs text-muted-foreground">变更文件</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-lg font-semibold">{reviewSummary.testCommands.length}</div>
                <div className="text-xs text-muted-foreground">测试命令</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-lg font-semibold text-red-600">{reviewSummary.failedCommands.length}</div>
                <div className="text-xs text-muted-foreground">失败项</div>
              </div>
            </div>
            <ScrollArea className="h-[180px] rounded-md border p-3">
              <div className="space-y-3 text-sm">
                {reviewSummary.files.length > 0 ? (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">变更文件</div>
                    {reviewSummary.files.map((file) => (
                      <div key={file.path} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs break-all">{file.path}</span>
                        <Badge variant="outline">{file.changeType}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">暂无变更文件记录，可由后续工具调用写入 metadata.changedFiles。</p>
                )}
                {reviewSummary.testCommands.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">测试命令</div>
                    {reviewSummary.testCommands.map((command) => (
                      <div key={command} className="font-mono text-xs break-all">{command}</div>
                    ))}
                  </div>
                )}
                {reviewSummary.riskHints.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">风险提示</div>
                    {reviewSummary.riskHints.map((hint) => (
                      <div key={hint} className="text-xs text-red-600">{hint}</div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
            <Button
              className="w-full"
              variant={reviewSummary.approved ? 'outline' : 'default'}
              onClick={handleApproveDiffReview}
              disabled={!activeSession || reviewSummary.approved || isBusy}
            >
              <ShieldCheck className="mr-2 size-4" />
              {reviewSummary.approved ? '已批准 Diff Review' : '批准 Diff Review'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" />
              Workspace
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {workspaces.length ? (
              workspaces.map((workspace) => (
                <div key={workspace.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{workspace.agentBranch}</span>
                    <Badge variant="outline">{workspace.status}</Badge>
                  </div>
                  <div className="mt-1 font-mono text-xs break-all text-muted-foreground">
                    {workspace.worktreePath || workspace.repoUrl}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">计划批准后将生成隔离 workspace。</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
