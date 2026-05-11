import { RdService, type IPipelineTaskRow, type IRequirementRow } from './rd.service';

const BASE_REQUIREMENT: IRequirementRow = {
  id: 'req-1',
  title: '需求',
  description: '',
  bountyPoints: 0,
  pmCoins: 0,
  tmCoins: 0,
  taskAcceptances: [],
  priority: 'P1',
  expectedDate: '2026-05-10',
  status: 'prd_writing',
  submitter: 'u1',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
  createdBy: 'u1',
  updatedBy: 'u1',
};

const PIPELINE_TASK: IPipelineTaskRow = {
  id: 'task-1',
  requirementId: 'req-1',
  requirementTitle: '需求',
  status: 'code_generating',
  progress: 0,
  stage: 'AI代码生成中',
  startTime: '2026-05-09T00:00:00.000Z',
  estimatedEndTime: '2026-05-09T01:00:00.000Z',
  logs: [],
  pipelineMeta: {},
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
  createdBy: 'tm-1',
  updatedBy: 'tm-1',
};

function requirementToRow(requirement: IRequirementRow): Record<string, unknown> {
  return {
    id: requirement.id,
    title: requirement.title,
    description: requirement.description,
    bounty_points: requirement.bountyPoints,
    pm_coins: requirement.pmCoins,
    tm_coins: requirement.tmCoins,
    task_acceptances: requirement.taskAcceptances,
    priority: requirement.priority,
    expected_date: requirement.expectedDate,
    status: requirement.status,
    submitter: requirement.submitter,
    created_at: requirement.createdAt,
    updated_at: requirement.updatedAt,
    created_by: requirement.createdBy,
    updated_by: requirement.updatedBy,
  };
}

function pipelineTaskToRow(task: IPipelineTaskRow): Record<string, unknown> {
  return {
    id: task.id,
    requirement_id: task.requirementId,
    requirement_title: task.requirementTitle,
    status: task.status,
    progress: task.progress,
    stage: task.stage,
    start_time: task.startTime,
    estimated_end_time: task.estimatedEndTime,
    logs: task.logs,
    pipeline_meta: task.pipelineMeta,
    commit_store: task.commitStore,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    created_by: task.createdBy,
    updated_by: task.updatedBy,
  };
}

describe('RdService pipeline task flow', () => {
  it('advances a prd-writing requirement through legal states when creating a pipeline task', async () => {
    const specDefiningRequirement: IRequirementRow = {
      ...BASE_REQUIREMENT,
      status: 'spec_defining',
    };
    const aiDevelopingRequirement: IRequirementRow = {
      ...BASE_REQUIREMENT,
      status: 'ai_developing',
    };
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([requirementToRow(BASE_REQUIREMENT)])
        .mockResolvedValueOnce([requirementToRow(BASE_REQUIREMENT)])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([requirementToRow(specDefiningRequirement)])
        .mockResolvedValueOnce([requirementToRow(specDefiningRequirement)])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([requirementToRow(aiDevelopingRequirement)])
        .mockResolvedValueOnce([pipelineTaskToRow(PIPELINE_TASK)]),
    };
    const service = new RdService(db as never);

    const task = await service.upsertPipelineTask(PIPELINE_TASK);

    expect(task.id).toBe('task-1');
    expect(db.execute).toHaveBeenCalledTimes(13);
  });
});
