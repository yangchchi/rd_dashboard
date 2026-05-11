import {
  assertToolCallCanStart,
  inferToolRisk,
  prepareToolCallPolicy,
} from '../../shared/agent-tool-gateway';

describe('agent tool gateway policy', () => {
  it('requires approval for deploy and destructive shell commands', () => {
    expect(
      prepareToolCallPolicy({
        toolName: 'deploy.run',
        toolCategory: 'deploy',
        command: 'kubectl apply -f deploy.yaml',
      }),
    ).toMatchObject({
      riskLevel: 'high',
      approvalStatus: 'pending',
      status: 'awaiting_approval',
    });

    expect(
      inferToolRisk({
        toolName: 'shell.run',
        toolCategory: 'shell',
        command: 'rm -rf /tmp/workspace',
      }).riskLevel,
    ).toBe('high');
  });

  it('keeps test commands low risk and clamps timeout', () => {
    expect(
      prepareToolCallPolicy({
        toolName: 'test.run',
        toolCategory: 'test',
        command: 'npm test',
        timeoutMs: 10,
      }),
    ).toMatchObject({
      riskLevel: 'low',
      approvalStatus: 'not_required',
      status: 'pending',
      timeoutMs: 1000,
    });
  });

  it('blocks starting calls that still need approval', () => {
    expect(() =>
      assertToolCallCanStart({
        status: 'awaiting_approval',
        approvalStatus: 'pending',
      }),
    ).toThrow(/requires approval/);

    expect(() =>
      assertToolCallCanStart({
        status: 'pending',
        approvalStatus: 'approved',
      }),
    ).not.toThrow();
  });
});
