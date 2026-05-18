import { EventEmitter } from 'node:events';

jest.mock('node:child_process', () => ({
  spawn: jest.fn(),
}));
jest.mock('node:fs/promises', () => ({
  stat: jest.fn(),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('node:fs', () => {
  const { Writable } = require('node:stream') as typeof import('node:stream');
  return {
    createWriteStream: jest.fn(
      () =>
        new Writable({
          write(_chunk: unknown, _encoding: unknown, callback: (error?: Error | null) => void) {
            callback();
          },
        }),
    ),
  };
});

import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { RdService, type IAgentToolCallRow } from './rd.service';

function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    killed: boolean;
    kill: jest.Mock;
    pid: number;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.pid = 4242;
  child.kill = jest.fn(() => {
    child.killed = true;
    return true;
  });
  return child;
}

function createClosedCommand(stdout = '', stderr = '', code = 0) {
  const child = createMockChild();
  setImmediate(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.emit('close', code);
  });
  return child;
}

function mockSpawnWithGitReview(child: ReturnType<typeof createMockChild>, outputs: string[]) {
  let index = 0;
  (spawn as jest.Mock).mockImplementation(() => {
    if (index === 0) {
      index += 1;
      return child;
    }
    const output = outputs[index - 1] || '';
    index += 1;
    return createClosedCommand(output);
  });
}

function toolCallWith(overrides: Partial<IAgentToolCallRow>): IAgentToolCallRow {
  return {
    id: 'tool-1',
    sessionId: 'session-1',
    taskId: 'task-1',
    workspaceId: 'workspace-1',
    toolName: 'codex.exec',
    toolCategory: 'ai',
    status: 'pending',
    approvalStatus: 'not_required',
    riskLevel: 'low',
    inputSummary: '执行编码任务',
    outputSummary: null,
    command: null,
    exitCode: null,
    durationMs: null,
    metadata: { prompt: '请修改代码并运行测试' },
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    ...overrides,
  };
}

function createServiceHarness(workspaceStatus: 'provisioning' | 'ready' | 'dirty' | 'archived' | 'failed' = 'ready') {
  const service = new RdService({ execute: jest.fn() } as never);
  let currentToolCall = toolCallWith({});
  const upserts: IAgentToolCallRow[] = [];

  jest.spyOn(service, 'getAgentToolCall').mockImplementation(async () => currentToolCall);
  jest.spyOn(service, 'startAgentToolCall').mockImplementation(async () => {
    currentToolCall = toolCallWith({
      ...currentToolCall,
      status: 'running',
      startedAt: currentToolCall.startedAt || '2026-05-09T00:00:01.000Z',
    });
    return currentToolCall;
  });
  jest.spyOn(service, 'getAgentWorkspace').mockResolvedValue({
    id: 'workspace-1',
    sessionId: 'session-1',
    pipelineRunId: 'run-1',
    kind: 'worktree',
    status: workspaceStatus,
    repoUrl: 'git@example.com:demo/repo.git',
    baseBranch: 'main',
    agentBranch: 'codex/rd-req-1-run-1',
    worktreePath: '/tmp/rd-agent-workspaces/session-1/workspace-1',
    isWriteLocked: false,
    metadata: {},
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
  });
  jest.spyOn(service, 'upsertAgentToolCall').mockImplementation(async (body) => {
    currentToolCall = toolCallWith({
      ...currentToolCall,
      ...body,
      id: body.id || currentToolCall.id,
      sessionId: body.sessionId || currentToolCall.sessionId,
      toolName: body.toolName || currentToolCall.toolName,
      metadata: body.metadata || currentToolCall.metadata,
      updatedAt: '2026-05-09T00:00:02.000Z',
    });
    upserts.push(currentToolCall);
    return currentToolCall;
  });
  jest.spyOn(service, 'finishAgentToolCall').mockImplementation(async (id, body) => {
    const exitCode = body.exitCode ?? 0;
    const status = body.status || (exitCode === 0 ? 'succeeded' : 'failed');
    currentToolCall = toolCallWith({
      ...currentToolCall,
      id,
      status,
      exitCode,
      outputSummary: body.outputSummary ?? currentToolCall.outputSummary,
      durationMs: body.durationMs ?? currentToolCall.durationMs,
      finishedAt: '2026-05-09T00:00:03.000Z',
      metadata: {
        ...currentToolCall.metadata,
        errorMessage: body.errorMessage ?? null,
      },
    });
    upserts.push(currentToolCall);
    return currentToolCall;
  });

  return {
    service,
    upserts,
    getCurrentToolCall: () => currentToolCall,
  };
}

async function waitForSpawnCall() {
  for (let i = 0; i < 20; i += 1) {
    if ((spawn as jest.Mock).mock.calls.length > 0) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('spawn was not called');
}

describe('RdService agent executor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (stat as jest.Mock).mockResolvedValue({ isDirectory: () => true });
  });

  it('runs Codex CLI in the workspace and streams stdout/stderr events', async () => {
    const child = createMockChild();
    mockSpawnWithGitReview(child, [
      'M\tserver/modules/rd/rd.service.ts\nA\tweb/src/new.tsx\n',
      ' server/modules/rd/rd.service.ts | 12 ++++++\n web/src/new.tsx | 3 +++\n',
      ' M server/modules/rd/rd.service.ts\n?? web/src/new.tsx\n',
    ]);
    const { service, upserts, getCurrentToolCall } = createServiceHarness();
    const eventsPromise = (async () => {
      const events = [];
      for await (const event of service.runAgentToolCallStream('tool-1')) {
        events.push(event);
      }
      return events;
    })();

    await waitForSpawnCall();
    child.stdout.emit('data', Buffer.from('done\nnpm run type:check:server\n'));
    child.stderr.emit('data', Buffer.from('warn\n'));
    child.emit('close', 0);

    const events = await eventsPromise;

    expect(spawn).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining([
        'exec',
        '--cd',
        '/tmp/rd-agent-workspaces/session-1/workspace-1',
        '--sandbox',
        'workspace-write',
      ]),
      expect.objectContaining({ cwd: '/tmp/rd-agent-workspaces/session-1/workspace-1' }),
    );
    const codexArgs = (spawn as jest.Mock).mock.calls[0][1] as string[];
    const promptArg = codexArgs[codexArgs.length - 1];
    expect(promptArg).toContain('请修改代码并运行测试');
    expect(promptArg).toContain('系统执行授权');
    expect(events.map((event) => event.type)).toEqual([
      'started',
      'spawned',
      'stdout',
      'stderr',
      'finished',
    ]);
    expect(events.find((event) => event.type === 'spawned')).toEqual(
      expect.objectContaining({
        pid: 4242,
        cwd: '/tmp/rd-agent-workspaces/session-1/workspace-1',
        status: 'running',
      }),
    );
    expect(events.find((event) => event.type === 'stdout')?.chunk).toBe('done\nnpm run type:check:server\n');
    expect(events.find((event) => event.type === 'stderr')?.chunk).toBe('warn\n');
    expect(events.at(-1)?.status).toBe('succeeded');
    expect(events.at(-1)?.changedFilesCount).toBe(2);
    expect(events.at(-1)?.stdoutBytes).toBeGreaterThan(0);
    expect(upserts.some((toolCall) => toolCall.metadata.lastOutputAt)).toBe(true);
    expect(upserts.some((toolCall) => toolCall.metadata.pid === 4242)).toBe(true);
    expect(getCurrentToolCall().metadata.stdout).toBe('done\nnpm run type:check:server\n');
    expect(getCurrentToolCall().metadata.stderr).toBe('warn\n');
    expect(getCurrentToolCall().metadata.changedFiles).toEqual([
      { path: 'server/modules/rd/rd.service.ts', changeType: 'modify' },
      { path: 'web/src/new.tsx', changeType: 'add' },
    ]);
    expect(getCurrentToolCall().metadata.detectedTestCommands).toEqual(['npm run type:check:server']);
  });

  it('cancels a running Codex CLI process and marks the tool call cancelled', async () => {
    const child = createMockChild();
    mockSpawnWithGitReview(child, [
      'M\tserver/modules/rd/rd.service.ts\n',
      ' server/modules/rd/rd.service.ts | 12 ++++++\n',
      ' M server/modules/rd/rd.service.ts\n',
    ]);
    const { service } = createServiceHarness();
    const eventsPromise = (async () => {
      const events = [];
      for await (const event of service.runAgentToolCallStream('tool-1')) {
        events.push(event);
      }
      return events;
    })();

    await waitForSpawnCall();
    const cancelled = await service.cancelAgentToolCallExecution('tool-1');
    child.stdout.emit('data', Buffer.from('partial\n'));
    child.emit('close', 143);

    const events = await eventsPromise;

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(cancelled.status).toBe('cancelled');
    expect(events.at(-1)?.status).toBe('cancelled');
    expect(events.at(-1)?.exitCode).toBe(130);
  });

  it('does not spawn Codex CLI before the workspace is ready', async () => {
    const { service } = createServiceHarness('provisioning');
    const events = [];

    for await (const event of service.runAgentToolCallStream('tool-1')) {
      events.push(event);
    }

    expect(spawn).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        type: 'error',
        status: 'failed',
        message: expect.stringContaining('AgentWorkspace 尚未就绪'),
      }),
    ]);
  });

  it('runs Cursor CLI in the workspace and streams parsed stdout from stream-json', async () => {
    const child = createMockChild();
    mockSpawnWithGitReview(child, [
      'M\tserver/modules/rd/rd.service.ts\n',
      ' server/modules/rd/rd.service.ts | 12 ++++++\n',
      ' M server/modules/rd/rd.service.ts\n',
    ]);
    const { service, getCurrentToolCall } = createServiceHarness();
    const current = getCurrentToolCall();
    current.toolName = 'cursor.exec';
    const eventsPromise = (async () => {
      const events = [];
      for await (const event of service.runAgentToolCallStream('tool-1')) {
        events.push(event);
      }
      return events;
    })();

    await waitForSpawnCall();
    child.stdout.emit(
      'data',
      Buffer.from(
        `${JSON.stringify({
          type: 'assistant',
          timestamp_ms: 1,
          message: { content: [{ type: 'text', text: '正在修改 ' }] },
        })}\n${JSON.stringify({
          type: 'assistant',
          timestamp_ms: 2,
          message: { content: [{ type: 'text', text: 'rd.service.ts' }] },
        })}\n`,
      ),
    );
    child.emit('close', 0);

    const events = await eventsPromise;

    expect(spawn).toHaveBeenCalledWith(
      'agent',
      expect.arrayContaining(['-p', '--force', '--output-format', 'stream-json', '--stream-partial-output']),
      expect.objectContaining({ cwd: '/tmp/rd-agent-workspaces/session-1/workspace-1' }),
    );
    const stdoutChunks = events.filter((event) => event.type === 'stdout').map((event) => event.chunk);
    expect(stdoutChunks.join('')).toBe('正在修改 rd.service.ts');
    expect(getCurrentToolCall().metadata.executor).toBe('cursor_cli');
  });

  it('does not spawn Codex CLI when the workspace path is missing on disk', async () => {
    (stat as jest.Mock).mockRejectedValue(new Error('missing'));
    const { service } = createServiceHarness('ready');
    const events = [];

    for await (const event of service.runAgentToolCallStream('tool-1')) {
      events.push(event);
    }

    expect(spawn).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        type: 'error',
        status: 'failed',
        message: expect.stringContaining('AgentWorkspace 路径不存在'),
      }),
    ]);
  });
});
