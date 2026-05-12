import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { rdApi } from './rd-api';
import type {
  IAcceptanceRecord,
  IAgentExecutionEvent,
  IAgentSession,
  IAgentTask,
  IAgentToolCall,
  IAgentWorkspace,
  IAgentWorkspaceProvisionResult,
  IBountyTask,
  IContextPack,
  IOrganizationSpecConfig,
  IPipelineRun,
  IPipelineStepRun,
  IPipelineTask,
  IPrd,
  IRequirement,
  IRequirementFlowEvent,
  ISpecification,
} from './rd-types';

export const rdSiteMessagesQueryKey = (userId: string | undefined) =>
  ['rd', 'site-messages', userId ?? ''] as const;

export const rdKeys = {
  requirements: ['rd', 'requirements'] as const,
  requirementFlowEvents: (id: string | undefined) => ['rd', 'requirements', id ?? '', 'flow-events'] as const,
  prds: ['rd', 'prds'] as const,
  specs: ['rd', 'specs'] as const,
  orgSpec: ['rd', 'orgSpec'] as const,
  acceptance: ['rd', 'acceptance'] as const,
  pipelineTasks: ['rd', 'pipeline-tasks'] as const,
  pipelineRuns: ['rd', 'pipeline-runs'] as const,
  pipelineStepRuns: (pipelineRunId: string | undefined) =>
    ['rd', 'pipeline-runs', pipelineRunId ?? '', 'steps'] as const,
  agentSessions: ['rd', 'agent-sessions'] as const,
  agentTasks: (sessionId: string | undefined) =>
    ['rd', 'agent-sessions', sessionId ?? '', 'tasks'] as const,
  agentToolCalls: (sessionId: string | undefined, taskId?: string) =>
    ['rd', 'agent-sessions', sessionId ?? '', 'tool-calls', taskId ?? ''] as const,
  agentWorkspaces: (sessionId: string | undefined) =>
    ['rd', 'agent-sessions', sessionId ?? '', 'workspaces'] as const,
  agentWorkspaceSourceTree: (workspaceId: string | undefined) =>
    ['rd', 'agent-workspaces', workspaceId ?? '', 'source-tree'] as const,
  agentWorkspaceSourceFile: (workspaceId: string | undefined, path: string | undefined) =>
    ['rd', 'agent-workspaces', workspaceId ?? '', 'source-file', path ?? ''] as const,
  contextPacks: ['rd', 'context-packs'] as const,
  products: ['rd', 'products'] as const,
  bountyTasks: ['rd', 'bounty-tasks'] as const,
  bountyHuntTasks: ['rd', 'bounty-hunt-tasks'] as const,
};

export function useRequirementsList() {
  return useQuery({
    queryKey: rdKeys.requirements,
    queryFn: () => rdApi.listRequirements(),
  });
}

export function useProductsList() {
  return useQuery({
    queryKey: rdKeys.products,
    queryFn: () => rdApi.listProducts(),
  });
}

export function useRequirement(id: string | undefined) {
  return useQuery({
    queryKey: [...rdKeys.requirements, id],
    queryFn: () => (id ? rdApi.getRequirement(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useRequirementFlowEvents(id: string | undefined) {
  return useQuery<IRequirementFlowEvent[]>({
    queryKey: rdKeys.requirementFlowEvents(id),
    queryFn: () => (id ? rdApi.listRequirementFlowEvents(id) : Promise.resolve([])),
    enabled: Boolean(id),
  });
}

export function useUpsertRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IRequirement> & { id: string }) => rdApi.upsertRequirement(body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
      void qc.invalidateQueries({ queryKey: rdKeys.requirementFlowEvents(data.id) });
    },
  });
}

export function useAcceptRequirementTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      requirementId: string;
      role: 'pm' | 'tm';
      userId: string;
      userName?: string;
    }) =>
      rdApi.acceptRequirementTask(args.requirementId, {
        role: args.role,
        userId: args.userId,
        userName: args.userName,
      }),
    onSuccess: (_data, args) => {
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
      void qc.invalidateQueries({ queryKey: [...rdKeys.requirements, args.requirementId] });
    },
  });
}

export function useDeleteRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rdApi.deleteRequirement(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function usePrdsList() {
  return useQuery({
    queryKey: rdKeys.prds,
    queryFn: () => rdApi.listPrds(),
  });
}

export function usePrd(id: string | undefined) {
  return useQuery({
    queryKey: [...rdKeys.prds, id],
    queryFn: () => (id ? rdApi.getPrd(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useUpsertPrd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IPrd> & { id: string; requirementId: string }) => rdApi.upsertPrd(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.prds });
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function useDeletePrd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rdApi.deletePrd(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.prds });
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function useSubmitPrdReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { prdId: string; reviewer?: string; comment?: string; actorUserId?: string }) =>
      rdApi.submitPrdForReview(args.prdId, args.reviewer, args.comment, args.actorUserId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.prds });
    },
  });
}

export function useReviewPrd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      prdId: string;
      status: 'approved' | 'rejected';
      reviewer?: string;
      comment?: string;
      actorUserId?: string;
    }) => rdApi.reviewPrd(args.prdId, args.status, args.reviewer, args.comment, args.actorUserId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.prds });
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function useSpecsList() {
  return useQuery({
    queryKey: rdKeys.specs,
    queryFn: () => rdApi.listSpecs(),
  });
}

export function useSpec(id: string | undefined) {
  return useQuery({
    queryKey: [...rdKeys.specs, id],
    queryFn: () => (id ? rdApi.getSpec(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useUpsertSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ISpecification> & { id: string; prdId: string }) =>
      rdApi.upsertSpec(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.specs });
    },
  });
}

export function useDeleteSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rdApi.deleteSpec(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.specs });
    },
  });
}

export function useSubmitSpecReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { specId: string; reviewer?: string; comment?: string; actorUserId?: string }) =>
      rdApi.submitSpecForReview(args.specId, args.reviewer, args.comment, args.actorUserId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.specs });
    },
  });
}

export function useApproveSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { specId: string; reviewer?: string; comment?: string; actorUserId?: string }) =>
      rdApi.approveSpec(args.specId, args.reviewer, args.comment, args.actorUserId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.specs });
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function useRejectSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { specId: string; reviewer?: string; comment?: string; actorUserId?: string }) =>
      rdApi.rejectSpec(args.specId, args.reviewer, args.comment, args.actorUserId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.specs });
    },
  });
}

export function useOrgSpecConfig() {
  return useQuery({
    queryKey: rdKeys.orgSpec,
    queryFn: () => rdApi.getOrgSpecConfig(),
  });
}

export function useSaveOrgSpecConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: IOrganizationSpecConfig) => rdApi.saveOrgSpecConfig(config),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.orgSpec });
    },
  });
}

export function useAcceptanceRecords() {
  return useQuery({
    queryKey: rdKeys.acceptance,
    queryFn: () => rdApi.listAcceptanceRecords(),
  });
}

export function useAddAcceptanceRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (record: IAcceptanceRecord) => rdApi.addAcceptanceRecord(record),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.acceptance });
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function usePipelineTasksList() {
  return useQuery({
    queryKey: rdKeys.pipelineTasks,
    queryFn: () => rdApi.listPipelineTasks(),
  });
}

export function useUpsertPipelineTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IPipelineTask> & { id: string; requirementId: string }) =>
      rdApi.upsertPipelineTask(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.pipelineTasks });
    },
  });
}

export function useDeletePipelineTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rdApi.deletePipelineTask(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.pipelineTasks });
    },
  });
}

export function usePipelineRunsList(requirementId?: string) {
  return useQuery({
    queryKey: requirementId ? [...rdKeys.pipelineRuns, requirementId] : rdKeys.pipelineRuns,
    queryFn: () => rdApi.listPipelineRuns(requirementId),
  });
}

export function useCreatePipelineRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IPipelineRun> & { requirementId: string }) =>
      rdApi.createPipelineRun(body),
    onSuccess: (run) => {
      void qc.invalidateQueries({ queryKey: rdKeys.pipelineRuns });
      void qc.invalidateQueries({ queryKey: [...rdKeys.pipelineRuns, run.requirementId] });
    },
  });
}

export function usePipelineStepRuns(pipelineRunId: string | undefined) {
  return useQuery({
    queryKey: rdKeys.pipelineStepRuns(pipelineRunId),
    queryFn: () => (pipelineRunId ? rdApi.listPipelineStepRuns(pipelineRunId) : Promise.resolve([])),
    enabled: Boolean(pipelineRunId),
  });
}

export function useUpsertPipelineStepRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<IPipelineStepRun> & { pipelineRunId: string; stepKey: string; name: string }
    ) => rdApi.upsertPipelineStepRun(body),
    onSuccess: (step) => {
      void qc.invalidateQueries({ queryKey: rdKeys.pipelineStepRuns(step.pipelineRunId) });
    },
  });
}

export function useAgentSessionsList(filters?: { pipelineRunId?: string; requirementId?: string }) {
  return useQuery({
    queryKey: [
      ...rdKeys.agentSessions,
      filters?.pipelineRunId ?? '',
      filters?.requirementId ?? '',
    ] as const,
    queryFn: () => rdApi.listAgentSessions(filters),
  });
}

export function useAgentSession(id: string | undefined) {
  return useQuery({
    queryKey: [...rdKeys.agentSessions, id ?? ''] as const,
    queryFn: () => (id ? rdApi.getAgentSession(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useCreateAgentSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IAgentSession> & { requirementId: string; title: string }) =>
      rdApi.createAgentSession(body),
    onSuccess: (session) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentSessions });
      if (session.pipelineRunId) {
        void qc.invalidateQueries({
          queryKey: [...rdKeys.agentSessions, session.pipelineRunId],
        });
      }
    },
  });
}

export function usePatchAgentSessionMetadata() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      patch: Record<string, unknown>;
      updatedBy?: string | null;
    }) => rdApi.patchAgentSessionMetadata(args.id, args.patch, args.updatedBy),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentSessions });
    },
  });
}

export function useAgentTasks(sessionId: string | undefined) {
  return useQuery({
    queryKey: rdKeys.agentTasks(sessionId),
    queryFn: () => (sessionId ? rdApi.listAgentTasks(sessionId) : Promise.resolve([])),
    enabled: Boolean(sessionId),
  });
}

export function useUpsertAgentTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<IAgentTask> & { sessionId: string; role: IAgentTask['role']; title: string }
    ) => rdApi.upsertAgentTask(body),
    onSuccess: (task) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentTasks(task.sessionId) });
    },
  });
}

export function useAgentToolCalls(
  sessionId: string | undefined,
  taskId?: string,
  options?: { pollWhileCodexRunningMs?: number },
) {
  const pollMs = options?.pollWhileCodexRunningMs;
  return useQuery({
    queryKey: rdKeys.agentToolCalls(sessionId, taskId),
    queryFn: () => (sessionId ? rdApi.listAgentToolCalls(sessionId, taskId) : Promise.resolve([])),
    enabled: Boolean(sessionId),
    refetchInterval: (query) => {
      if (!pollMs) return false;
      const rows = query.state.data as IAgentToolCall[] | undefined;
      if (!rows?.length) return false;
      const codexRunning = rows.some((row) => row.toolName === 'codex.exec' && row.status === 'running');
      return codexRunning ? pollMs : false;
    },
  });
}

export function useUpsertAgentToolCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IAgentToolCall> & { sessionId: string; toolName: string }) =>
      rdApi.upsertAgentToolCall(body),
    onSuccess: (toolCall) => {
      void qc.invalidateQueries({
        queryKey: rdKeys.agentToolCalls(toolCall.sessionId),
      });
      if (toolCall.taskId) {
        void qc.invalidateQueries({
          queryKey: rdKeys.agentToolCalls(toolCall.sessionId, toolCall.taskId),
        });
      }
    },
  });
}

export function usePrepareAgentToolCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<IAgentToolCall> & {
        sessionId: string;
        toolName: string;
        toolCategory: IAgentToolCall['toolCategory'];
        timeoutMs?: number | null;
      }
    ) => rdApi.prepareAgentToolCall(body),
    onSuccess: (toolCall) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentToolCalls(toolCall.sessionId) });
    },
  });
}

export function useApproveAgentToolCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      sessionId: string;
      approved: boolean;
      approver?: string | null;
      reason?: string | null;
    }) =>
      rdApi.approveAgentToolCall(args.id, {
        approved: args.approved,
        approver: args.approver,
        reason: args.reason,
      }),
    onSuccess: (toolCall) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentToolCalls(toolCall.sessionId) });
      if (toolCall.taskId) {
        void qc.invalidateQueries({
          queryKey: rdKeys.agentToolCalls(toolCall.sessionId, toolCall.taskId),
        });
      }
    },
  });
}

export function useStartAgentToolCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; sessionId: string }) => rdApi.startAgentToolCall(args.id),
    onSuccess: (toolCall) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentToolCalls(toolCall.sessionId) });
    },
  });
}

export function useCancelAgentToolCallExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; sessionId: string }) => rdApi.cancelAgentToolCallExecution(args.id),
    onSuccess: (toolCall) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentToolCalls(toolCall.sessionId) });
    },
  });
}

export function useRunAgentToolCallWithCodex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      sessionId: string;
      prompt?: string | null;
      model?: string | null;
      onEvent?: (event: IAgentExecutionEvent) => void;
    }) => {
      let finalEvent: IAgentExecutionEvent | null = null;
      for await (const event of rdApi.runAgentToolCallWithCodex(args.id, {
        prompt: args.prompt,
        model: args.model,
      })) {
        finalEvent = event;
        args.onEvent?.(event);
      }
      return finalEvent;
    },
    onSettled: (_data, _error, args) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentToolCalls(args.sessionId) });
      void qc.invalidateQueries({ queryKey: rdKeys.agentWorkspaces(args.sessionId) });
    },
  });
}

export function useFinishAgentToolCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      sessionId: string;
      exitCode?: number | null;
      outputSummary?: string | null;
      errorMessage?: string | null;
      durationMs?: number | null;
    }) =>
      rdApi.finishAgentToolCall(args.id, {
        exitCode: args.exitCode,
        outputSummary: args.outputSummary,
        errorMessage: args.errorMessage,
        durationMs: args.durationMs,
      }),
    onSuccess: (toolCall) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentToolCalls(toolCall.sessionId) });
    },
  });
}

export function useAgentWorkspaces(sessionId: string | undefined) {
  return useQuery({
    queryKey: rdKeys.agentWorkspaces(sessionId),
    queryFn: () => (sessionId ? rdApi.listAgentWorkspaces(sessionId) : Promise.resolve([])),
    enabled: Boolean(sessionId),
  });
}

export function useAgentWorkspaceSourceTree(workspaceId: string | undefined) {
  return useQuery({
    queryKey: rdKeys.agentWorkspaceSourceTree(workspaceId),
    queryFn: () => rdApi.listAgentWorkspaceSourceTree(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 15_000,
  });
}

export function useAgentWorkspaceSourceFile(workspaceId: string | undefined, filePath: string | undefined) {
  return useQuery({
    queryKey: rdKeys.agentWorkspaceSourceFile(workspaceId, filePath),
    queryFn: () => rdApi.getAgentWorkspaceSourceFile(workspaceId!, filePath!),
    enabled: Boolean(workspaceId && filePath),
    staleTime: 30_000,
  });
}

export function useCommitAndPushAgentWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      workspaceId: string;
      sessionId: string;
      body?: { commitMessage?: string | null; gitPat?: string | null; gitUsername?: string | null };
    }) => rdApi.commitAndPushAgentWorkspace(args.workspaceId, args.body),
    onSuccess: (_data, args) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentWorkspaces(args.sessionId) });
      void qc.invalidateQueries({ queryKey: rdKeys.agentWorkspaceSourceTree(args.workspaceId) });
      void qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === 'rd' &&
          q.queryKey[1] === 'agent-workspaces' &&
          q.queryKey[2] === args.workspaceId &&
          q.queryKey[3] === 'source-file',
      });
    },
  });
}

export function useUpsertAgentWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<IAgentWorkspace> & {
        sessionId: string;
        repoUrl: string;
        baseBranch: string;
        agentBranch: string;
      }
    ) => rdApi.upsertAgentWorkspace(body),
    onSuccess: (workspace) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentWorkspaces(workspace.sessionId) });
    },
  });
}

export function useProvisionAgentWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      sessionId: string;
      repoUrl: string;
      baseBranch?: string | null;
      agentBranch?: string | null;
      workspaceRoot?: string | null;
      kind?: IAgentWorkspace['kind'];
      createdBy?: string | null;
      productSlug?: string | null;
      sessionFolderName?: string | null;
    }) => rdApi.provisionAgentWorkspace(body),
    onSuccess: (result: IAgentWorkspaceProvisionResult) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentWorkspaces(result.workspace.sessionId) });
      void qc.invalidateQueries({ queryKey: rdKeys.agentToolCalls(result.workspace.sessionId) });
    },
  });
}

export function useMarkAgentWorkspaceReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      sessionId: string;
      baseCommit?: string | null;
      headCommit?: string | null;
      lockOwnerTaskId?: string | null;
    }) =>
      rdApi.markAgentWorkspaceReady(args.id, {
        baseCommit: args.baseCommit,
        headCommit: args.headCommit,
        lockOwnerTaskId: args.lockOwnerTaskId,
      }),
    onSuccess: (workspace) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentWorkspaces(workspace.sessionId) });
    },
  });
}

export function useExecuteAgentWorkspaceLifecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; sessionId: string }) => rdApi.executeAgentWorkspaceLifecycle(args.id),
    onSuccess: (result: IAgentWorkspaceProvisionResult) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentWorkspaces(result.workspace.sessionId) });
      void qc.invalidateQueries({ queryKey: rdKeys.agentToolCalls(result.workspace.sessionId) });
    },
  });
}

export function useCleanupAgentWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; sessionId: string }) => rdApi.cleanupAgentWorkspace(args.id),
    onSuccess: (result: IAgentWorkspaceProvisionResult) => {
      void qc.invalidateQueries({ queryKey: rdKeys.agentWorkspaces(result.workspace.sessionId) });
      void qc.invalidateQueries({ queryKey: rdKeys.agentToolCalls(result.workspace.sessionId) });
    },
  });
}

export function useContextPacksList(requirementId?: string) {
  return useQuery({
    queryKey: requirementId ? [...rdKeys.contextPacks, requirementId] : rdKeys.contextPacks,
    queryFn: () => rdApi.listContextPacks(requirementId),
  });
}

export function useContextPack(id: string | undefined) {
  return useQuery({
    queryKey: [...rdKeys.contextPacks, id ?? ''] as const,
    queryFn: () => (id ? rdApi.getContextPack(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useCreateContextPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      id?: string;
      requirementId: string;
      prdId?: string | null;
      specId?: string | null;
      pipelineRunId?: string | null;
      createdBy?: string | null;
    }) => rdApi.createContextPack(body),
    onSuccess: (pack: IContextPack) => {
      void qc.invalidateQueries({ queryKey: rdKeys.contextPacks });
      void qc.invalidateQueries({ queryKey: [...rdKeys.contextPacks, pack.requirementId] });
    },
  });
}

export function useBountyTasksList() {
  return useQuery({
    queryKey: rdKeys.bountyTasks,
    queryFn: () => rdApi.listBountyTasks(),
  });
}

export function useBountyHuntTasksList() {
  return useQuery({
    queryKey: rdKeys.bountyHuntTasks,
    queryFn: () => rdApi.listHuntBountyTasks(),
  });
}

export function useCreateBountyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IBountyTask> & { requirementId: string; publisherId: string; title: string }) =>
      rdApi.createBountyTask(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.bountyTasks });
      void qc.invalidateQueries({ queryKey: rdKeys.bountyHuntTasks });
      void qc.invalidateQueries({ queryKey: ['rd', 'site-messages'] });
    },
  });
}

export function useSiteMessagesList(userId: string | undefined) {
  return useQuery({
    queryKey: rdSiteMessagesQueryKey(userId),
    queryFn: () => rdApi.listSiteMessages(userId!),
    enabled: Boolean(userId?.trim()),
    refetchInterval: 30_000,
  });
}

export function useMarkSiteMessageRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { messageId: string; userId: string }) =>
      rdApi.markSiteMessageRead(args.messageId, args.userId),
    onSuccess: (_data, args) => {
      void qc.invalidateQueries({ queryKey: rdSiteMessagesQueryKey(args.userId) });
    },
  });
}

export function useAcceptBountyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      role: 'pm' | 'tm';
      hunterUserId: string;
      hunterUserName?: string;
    }) =>
      rdApi.acceptBountyTask(args.id, {
        role: args.role,
        hunterUserId: args.hunterUserId,
        hunterUserName: args.hunterUserName,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.bountyTasks });
      void qc.invalidateQueries({ queryKey: rdKeys.bountyHuntTasks });
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function useDeliverBountyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; actorUserId: string }) =>
      rdApi.deliverBountyTask(args.id, args.actorUserId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.bountyTasks });
      void qc.invalidateQueries({ queryKey: rdKeys.bountyHuntTasks });
    },
  });
}

export function useSettleBountyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rdApi.settleBountyTask(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.bountyTasks });
      void qc.invalidateQueries({ queryKey: rdKeys.bountyHuntTasks });
    },
  });
}

export function useRejectBountyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rdApi.rejectBountyTask(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.bountyTasks });
      void qc.invalidateQueries({ queryKey: rdKeys.bountyHuntTasks });
    },
  });
}
