import { RdService, type IRequirementRow } from './rd.service';

const REQUIREMENT_ROW: IRequirementRow = {
  id: 'req-1',
  title: '需求',
  description: '',
  changeType: 'greenfield',
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
  trigger_mode: 'manual',
  context_snapshot: { source: 'unit' },
  started_at: null,
  finished_at: null,
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
  created_by: 'tm-1',
  updated_by: 'tm-1',
};

const STEP_ROW = {
  id: 'step-1',
  pipeline_run_id: 'run-1',
  step_key: 'context_pack',
  name: '构建上下文包',
  status: 'queued',
  order_index: 1,
  input_ref: null,
  output_ref: null,
  error_code: null,
  error_message: null,
  started_at: null,
  finished_at: null,
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
};

describe('RdService pipeline runs', () => {
  it('creates a pipeline run for an existing requirement', async () => {
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([REQUIREMENT_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([RUN_ROW]),
    };
    const service = new RdService(db as never);

    const run = await service.createPipelineRun({
      id: 'run-1',
      pipelineTaskId: 'task-1',
      requirementId: 'req-1',
      contextSnapshot: { source: 'unit' },
      createdBy: 'tm-1',
    });

    expect(run.id).toBe('run-1');
    expect(run.contextSnapshot).toEqual({ source: 'unit' });
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it('upserts and lists step runs for a pipeline run', async () => {
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([RUN_ROW])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([STEP_ROW]),
    };
    const service = new RdService(db as never);

    const step = await service.upsertPipelineStepRun({
      id: 'step-1',
      pipelineRunId: 'run-1',
      stepKey: 'context_pack',
      name: '构建上下文包',
      orderIndex: 1,
    });

    expect(step.id).toBe('step-1');
    expect(step.pipelineRunId).toBe('run-1');
    expect(step.stepKey).toBe('context_pack');
  });
});
