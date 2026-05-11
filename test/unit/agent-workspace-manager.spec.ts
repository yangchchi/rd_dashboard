import {
  buildAgentBranch,
  buildAgentWorkspaceLifecyclePlan,
  sanitizeWorkspaceSegment,
} from '../../shared/agent-workspace-manager';

describe('agent workspace manager', () => {
  it('builds stable safe branch and path segments', () => {
    expect(sanitizeWorkspaceSegment('REQ 你好/../1', 'fallback')).toBe('req-1');
    expect(
      buildAgentBranch({
        requirementId: 'REQ 1',
        pipelineRunId: 'RUN 1',
      }),
    ).toBe('codex/rd-req-1-run-1');
  });

  it('creates a worktree lifecycle plan with auditable git commands', () => {
    const plan = buildAgentWorkspaceLifecyclePlan({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      requirementId: 'req-1',
      pipelineRunId: 'run-1',
      repoUrl: 'git@example.com:demo/repo.git',
      baseBranch: 'main',
    });

    expect(plan.agentBranch).toBe('codex/rd-req-1-run-1');
    expect(plan.worktreePath).toContain('/sessions/session-1/workspace-1');
    expect(plan.commands.map((command) => command.key)).toEqual([
      'clone_cache',
      'fetch_base',
      'add_worktree',
      'cleanup_worktree',
    ]);
    expect(plan.commands[2].command).toContain('worktree add');
    expect(plan.commands[3].cleanup).toBe(true);
  });

  it('supports simple clone mode when worktree cache is not desired', () => {
    const plan = buildAgentWorkspaceLifecyclePlan({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      requirementId: 'req-1',
      repoUrl: 'https://example.com/demo/repo.git',
      baseBranch: 'develop',
      agentBranch: 'codex/custom',
      kind: 'clone',
    });

    expect(plan.commands.map((command) => command.key)).toEqual([
      'clone_branch',
      'checkout_agent_branch',
    ]);
    expect(plan.commands[0].command).toContain('git clone --branch develop');
    expect(plan.agentBranch).toBe('codex/custom');
  });
});
