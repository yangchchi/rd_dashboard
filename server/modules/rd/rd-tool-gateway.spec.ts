import { BadRequestException } from '@nestjs/common';
import { RdService } from './rd.service';

const SESSION_ROW = {
  id: 'session-1',
  pipeline_run_id: 'run-1',
  requirement_id: 'req-1',
  title: 'AI 自动编码',
  status: 'running',
  runtime_adapter: 'codex_cli',
  risk_level: 'medium',
  metadata: {},
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
};

const TOOL_CALL_ROW = {
  id: 'tool-1',
  session_id: 'session-1',
  task_id: 'task-1',
  workspace_id: 'workspace-1',
  tool_name: 'deploy.run',
  tool_category: 'deploy',
  status: 'awaiting_approval',
  approval_status: 'pending',
  risk_level: 'high',
  input_summary: '部署沙箱',
  output_summary: null,
  command: 'kubectl apply -f deploy.yaml',
  exit_code: null,
  duration_ms: null,
  metadata: { timeoutMs: 120000, policyReason: 'deploy-capable tool requires explicit approval' },
  started_at: null,
  finished_at: null,
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
};

describe('RdService tool gateway', () => {
  it('prepares high-risk tool calls as awaiting approval', async () => {
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([TOOL_CALL_ROW]),
    };
    const service = new RdService(db as never);

    const toolCall = await service.prepareAgentToolCall({
      id: 'tool-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      workspaceId: 'workspace-1',
      toolName: 'deploy.run',
      toolCategory: 'deploy',
      inputSummary: '部署沙箱',
      command: 'kubectl apply -f deploy.yaml',
    });

    expect(toolCall.status).toBe('awaiting_approval');
    expect(toolCall.approvalStatus).toBe('pending');
    expect(toolCall.riskLevel).toBe('high');
    expect(toolCall.metadata.timeoutMs).toBe(120000);
  });

  it('blocks starting a pending approval tool call', async () => {
    const db = {
      execute: jest.fn().mockResolvedValueOnce([TOOL_CALL_ROW]),
    };
    const service = new RdService(db as never);

    await expect(service.startAgentToolCall('tool-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approves, starts, and finishes a tool call', async () => {
    const approvedRow = {
      ...TOOL_CALL_ROW,
      status: 'pending',
      approval_status: 'approved',
      metadata: { ...TOOL_CALL_ROW.metadata, approval: { approver: 'tm-1' } },
    };
    const runningRow = {
      ...approvedRow,
      status: 'running',
      started_at: '2026-05-09T00:00:01.000Z',
    };
    const finishedRow = {
      ...runningRow,
      status: 'succeeded',
      exit_code: 0,
      output_summary: '部署完成',
      duration_ms: 1234,
      finished_at: '2026-05-09T00:00:02.000Z',
    };
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([TOOL_CALL_ROW])
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([approvedRow])
        .mockResolvedValueOnce([approvedRow])
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([runningRow])
        .mockResolvedValueOnce([runningRow])
        .mockResolvedValueOnce([SESSION_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([finishedRow]),
    };
    const service = new RdService(db as never);

    const approved = await service.approveAgentToolCall('tool-1', {
      approved: true,
      approver: 'tm-1',
      reason: '沙箱部署允许',
    });
    const running = await service.startAgentToolCall('tool-1');
    const finished = await service.finishAgentToolCall('tool-1', {
      exitCode: 0,
      outputSummary: '部署完成',
      durationMs: 1234,
    });

    expect(approved.approvalStatus).toBe('approved');
    expect(running.status).toBe('running');
    expect(finished.status).toBe('succeeded');
    expect(finished.durationMs).toBe(1234);
  });
});
