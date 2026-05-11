import { BadRequestException } from '@nestjs/common';
import { RdService, type IRequirementRow } from './rd.service';

const REQUIREMENT_ROW: IRequirementRow = {
  id: 'req-1',
  title: '需求',
  description: '',
  bountyPoints: 0,
  pmCoins: 0,
  tmCoins: 0,
  taskAcceptances: [],
  priority: 'P1',
  expectedDate: '2026-05-10',
  status: 'ai_developing',
  submitter: 'u1',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
};

const RUN_ROW = {
  id: 'run-1',
  pipeline_task_id: 'task-1',
  requirement_id: 'req-1',
  status: 'queued',
  trigger_mode: 'agent',
  context_snapshot: { source: 'unit' },
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
};

const SESSION_ROW = {
  id: 'session-1',
  pipeline_run_id: 'run-1',
  requirement_id: 'req-1',
  spec_id: 'spec-1',
  context_pack_id: 'ctx-1',
  title: 'AI 自动编码',
  status: 'planning',
  runtime_adapter: 'codex_cli',
  model: 'gpt-5.5',
  base_branch: 'main',
  agent_branch: 'agent/req-1',
  plan_markdown: '1. 修改代码',
  risk_level: 'medium',
  metadata: { entry: 'pipeline' },
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
  created_by: 'tm-1',
  updated_by: 'tm-1',
};

const TASK_ROW = {
  id: 'task-1',
  session_id: 'session-1',
  pipeline_step_run_id: 'step-1',
  parent_task_id: null,
  role: 'planner',
  title: '生成计划',
  instructions: '阅读上下文并输出计划',
  status: 'queued',
  order_index: 1,
  locked: true,
  requires_approval: true,
  metadata: { expected: 'plan' },
  started_at: null,
  finished_at: null,
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
};

const WORKSPACE_ROW = {
  id: 'workspace-1',
  session_id: 'session-1',
  pipeline_run_id: 'run-1',
  kind: 'worktree',
  status: 'ready',
  repo_url: 'git@example.com:demo/repo.git',
  base_branch: 'main',
  agent_branch: 'agent/req-1',
  worktree_path: '/tmp/agent/req-1',
  base_commit: 'base123',
  head_commit: 'head456',
  lock_owner_task_id: 'task-1',
  is_write_locked: true,
  metadata: { owner: 'coder' },
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
  cleaned_at: null,
};

const TOOL_CALL_ROW = {
  id: 'tool-1',
  session_id: 'session-1',
  task_id: 'task-1',
  workspace_id: 'workspace-1',
  tool_name: 'shell.run',
  tool_category: 'shell',
  status: 'awaiting_approval',
  approval_status: 'pending',
  risk_level: 'high',
  input_summary: 'npm install',
  output_summary: null,
  command: 'npm install',
  exit_code: null,
  duration_ms: null,
  metadata: { reason: 'dependency install' },
  started_at: null,
  finished_at: null,
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
};

describe('RdService agent delivery ledger', () => {
  it('creates an agent session linked to a pipeline run', async () => {
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([REQUIREMENT_ROW])
        .mockResolvedValueOnce([RUN_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([SESSION_ROW]),
    };
    const service = new RdService(db as never);

    const session = await service.createAgentSession({
      id: 'session-1',
      pipelineRunId: 'run-1',
      requirementId: 'req-1',
      specId: 'spec-1',
      contextPackId: 'ctx-1',
      title: 'AI 自动编码',
      status: 'planning',
      runtimeAdapter: 'codex_cli',
      baseBranch: 'main',
      agentBranch: 'agent/req-1',
      metadata: { entry: 'pipeline' },
    });

    expect(session.id).toBe('session-1');
    expect(session.pipelineRunId).toBe('run-1');
    expect(session.contextPackId).toBe('ctx-1');
    expect(session.metadata).toEqual({ entry: 'pipeline' });
    expect(db.execute).toHaveBeenCalledTimes(4);
  });

  it('rejects sessions whose pipeline run belongs to another requirement', async () => {
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([REQUIREMENT_ROW])
        .mockResolvedValueOnce([{ ...RUN_ROW, requirement_id: 'req-other' }]),
    };
    const service = new RdService(db as never);

    await expect(
      service.createAgentSession({
        id: 'session-1',
        pipelineRunId: 'run-1',
        requirementId: 'req-1',
        title: 'AI 自动编码',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts agent tasks, workspaces, and tool calls for a session', async () => {
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([TASK_ROW])
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([WORKSPACE_ROW])
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([TOOL_CALL_ROW]),
    };
    const service = new RdService(db as never);

    const task = await service.upsertAgentTask({
      id: 'task-1',
      sessionId: 'session-1',
      pipelineStepRunId: 'step-1',
      role: 'planner',
      title: '生成计划',
      instructions: '阅读上下文并输出计划',
      locked: true,
      requiresApproval: true,
      metadata: { expected: 'plan' },
    });
    const workspace = await service.upsertAgentWorkspace({
      id: 'workspace-1',
      sessionId: 'session-1',
      repoUrl: 'git@example.com:demo/repo.git',
      baseBranch: 'main',
      agentBranch: 'agent/req-1',
      status: 'ready',
      lockOwnerTaskId: 'task-1',
      isWriteLocked: true,
    });
    const toolCall = await service.upsertAgentToolCall({
      id: 'tool-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      workspaceId: 'workspace-1',
      toolName: 'shell.run',
      toolCategory: 'shell',
      status: 'awaiting_approval',
      approvalStatus: 'pending',
      riskLevel: 'high',
      inputSummary: 'npm install',
      command: 'npm install',
    });

    expect(task.requiresApproval).toBe(true);
    expect(workspace.pipelineRunId).toBe('run-1');
    expect(workspace.isWriteLocked).toBe(true);
    expect(toolCall.approvalStatus).toBe('pending');
    expect(toolCall.riskLevel).toBe('high');
    expect(db.execute).toHaveBeenCalledTimes(9);
  });
});
