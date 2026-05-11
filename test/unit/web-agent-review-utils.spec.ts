import { buildAgentDiffReviewSummary } from '../../web/src/lib/agent-review-utils';
import type { IAgentToolCall } from '../../web/src/lib/rd-types';

const baseToolCall: IAgentToolCall = {
  id: 'tool-1',
  sessionId: 'session-1',
  toolName: 'test.run',
  toolCategory: 'test',
  status: 'succeeded',
  approvalStatus: 'not_required',
  riskLevel: 'low',
  inputSummary: '运行测试',
  command: 'npm run ci:check',
  exitCode: 0,
  durationMs: 1000,
  metadata: {},
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
};

describe('agent review utils', () => {
  it('summarizes changed files, tests, risks, and approval from tool calls', () => {
    const summary = buildAgentDiffReviewSummary([
      {
        ...baseToolCall,
        metadata: {
          changedFiles: [
            { path: 'web/src/App.tsx', changeType: 'modify' },
            { path: 'server/main.ts', changeType: 'add' },
          ],
          diffReviewApproved: true,
        },
      },
      {
        ...baseToolCall,
        id: 'tool-2',
        toolName: 'deploy.run',
        toolCategory: 'deploy',
        riskLevel: 'high',
        command: 'kubectl apply -f deploy.yaml',
      },
      {
        ...baseToolCall,
        id: 'tool-3',
        status: 'failed',
        exitCode: 1,
        command: 'npm test',
      },
    ]);

    expect(summary.files.map((file) => file.path)).toEqual(['server/main.ts', 'web/src/App.tsx']);
    expect(summary.testCommands).toEqual(['npm run ci:check', 'npm test']);
    expect(summary.failedCommands).toEqual(['npm test']);
    expect(summary.riskHints).toContain('deploy.run: 高风险工具调用');
    expect(summary.approved).toBe(true);
  });

  it('uses executor diff metadata when changedFiles is not present', () => {
    const summary = buildAgentDiffReviewSummary([
      {
        ...baseToolCall,
        id: 'tool-codex',
        toolName: 'codex.exec',
        toolCategory: 'ai',
        command: 'codex exec --cd /tmp/workspace',
        metadata: {
          diffNameStatus: 'M\tserver/modules/rd/rd.service.ts\nA\tweb/src/screen/NewPanel.tsx\nD\told/file.ts\n',
          detectedTestCommands: ['npm run type:check:server', 'npx jest server/modules/rd/rd-agent-executor.spec.ts --runInBand'],
          diffReviewError: 'git status failed',
        },
      },
    ]);

    expect(summary.files).toEqual([
      { path: 'old/file.ts', changeType: 'delete' },
      { path: 'server/modules/rd/rd.service.ts', changeType: 'modify' },
      { path: 'web/src/screen/NewPanel.tsx', changeType: 'add' },
    ]);
    expect(summary.testCommands).toEqual([
      'npm run type:check:server',
      'npx jest server/modules/rd/rd-agent-executor.spec.ts --runInBand',
    ]);
    expect(summary.riskHints).toContain('diff review: git status failed');
  });

  it('does not treat codex exec command text as a test command', () => {
    const summary = buildAgentDiffReviewSummary([
      {
        ...baseToolCall,
        id: 'tool-codex-plan',
        toolName: 'codex.exec',
        toolCategory: 'ai',
        command: 'codex exec --cd /tmp/workspace --sandbox workspace-write # 必须验证 npm run test:p0',
        metadata: {},
      },
    ]);

    expect(summary.testCommands).toEqual([]);
  });
});
