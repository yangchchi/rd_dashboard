import { RdService } from './rd.service';

const SESSION_ROW = {
  id: 'session-1',
  pipeline_run_id: 'run-1',
  requirement_id: 'req-1',
  spec_id: 'spec-1',
  context_pack_id: 'ctx-1',
  title: 'AI 自动编码',
  status: 'planning',
  runtime_adapter: 'codex_cli',
  base_branch: 'main',
  agent_branch: null,
  risk_level: 'medium',
  metadata: {},
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
};

const WORKSPACE_ID = 'awork_1_3llllll';

const WORKSPACE_ROW = {
  id: WORKSPACE_ID,
  session_id: 'session-1',
  pipeline_run_id: 'run-1',
  kind: 'worktree',
  status: 'provisioning',
  repo_url: 'git@example.com:demo/repo.git',
  base_branch: 'main',
  agent_branch: 'codex/rd-req-1-run-1',
  worktree_path: `/tmp/rd-agent-workspaces/sessions/session-1/${WORKSPACE_ID}`,
  base_commit: null,
  head_commit: null,
  lock_owner_task_id: null,
  is_write_locked: false,
  metadata: {
    workspaceRoot: '/tmp/rd-agent-workspaces',
    cachePath: '/tmp/rd-agent-workspaces/cache/req-1-repo',
  },
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
  cleaned_at: null,
};

const TOOL_CALL_ROW = {
  id: `wtool_${WORKSPACE_ID}_10_clone_cache`,
  session_id: 'session-1',
  task_id: null,
  workspace_id: WORKSPACE_ID,
  tool_name: 'git.clone_cache',
  tool_category: 'git',
  status: 'pending',
  approval_status: 'not_required',
  risk_level: 'medium',
  input_summary: 'Clone repository cache for isolated worktree',
  output_summary: null,
  command: 'git clone --no-checkout git@example.com:demo/repo.git /tmp/rd-agent-workspaces/cache/req-1-repo',
  exit_code: null,
  duration_ms: null,
  metadata: { workspaceCommandKey: 'clone_cache', orderIndex: 10 },
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
};

describe('RdService workspace manager', () => {
  it('provisions a workspace plan and records lifecycle tool calls', async () => {
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([WORKSPACE_ROW])
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([TOOL_CALL_ROW])
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{ ...TOOL_CALL_ROW, id: `wtool_${WORKSPACE_ID}_20_fetch_base`, tool_name: 'git.fetch' }])
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{ ...TOOL_CALL_ROW, id: `wtool_${WORKSPACE_ID}_30_add_worktree`, tool_name: 'git.worktree_add' }])
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([
          { ...TOOL_CALL_ROW, id: `wtool_${WORKSPACE_ID}_900_cleanup_worktree`, tool_name: 'git.worktree_remove' },
        ]),
    };
    const service = new RdService(db as never);
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(1);

    try {
      const result = await service.provisionAgentWorkspace({
        sessionId: 'session-1',
        repoUrl: 'git@example.com:demo/repo.git',
        baseBranch: 'main',
      });

      expect(result.workspace.id).toBe(WORKSPACE_ID);
      expect(result.plan.agentBranch).toBe('codex/rd-req-1-run-1');
      expect(result.plan.commands.map((command) => command.key)).toEqual([
        'clone_cache',
        'fetch_base',
        'add_worktree',
        'cleanup_worktree',
      ]);
      expect(result.toolCalls).toHaveLength(4);
      expect(result.toolCalls[0].toolName).toBe('git.clone_cache');
    } finally {
      randomSpy.mockRestore();
      dateSpy.mockRestore();
    }
  });

  it('archives a workspace and records a cleanup command', async () => {
    const archivedRow = {
      ...WORKSPACE_ROW,
      status: 'archived',
      is_write_locked: false,
      cleaned_at: '2026-05-09T00:00:01.000Z',
    };
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([WORKSPACE_ROW])
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([
          { ...TOOL_CALL_ROW, id: `wtool_${WORKSPACE_ID}_900_cleanup_worktree`, tool_name: 'git.worktree_remove' },
        ])
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([archivedRow]),
    };
    const service = new RdService(db as never);

    const result = await service.cleanupAgentWorkspace(WORKSPACE_ID);

    expect(result.workspace.status).toBe('archived');
    expect(result.workspace.cleanedAt).toBe('2026-05-09T00:00:01.000Z');
    expect(result.plan.commands[0].key).toBe('cleanup_worktree');
    expect(result.toolCalls[0].toolName).toBe('git.worktree_remove');
  });
});
