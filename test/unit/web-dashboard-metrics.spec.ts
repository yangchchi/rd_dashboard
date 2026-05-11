import { buildDashboardEfficiencyMetrics } from '../../web/src/lib/dashboard-metrics';
import type { IPipelineTask, IRequirement } from '../../web/src/lib/rd-types';

const requirement = (id: string, status: IRequirement['status']): IRequirement => ({
  id,
  title: id,
  description: '',
  priority: 'P1',
  expectedDate: '2026-05-10',
  status,
  submitter: 'u1',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: status === 'released' ? '2026-05-10T00:00:00.000Z' : '2026-05-09T12:00:00.000Z',
});

const task = (id: string, requirementId: string): IPipelineTask => ({
  id,
  requirementId,
  requirementTitle: requirementId,
  status: 'completed',
  progress: 100,
  stage: '完成',
  startTime: '',
  estimatedEndTime: '',
  logs: [{ id: 'l1', timestamp: '00:00:00', level: 'info', message: 'done' }],
  qualityMetrics: {
    specConsistency: 90,
    apiCoverage: 80,
    codeQuality: 85,
    testPassRate: 95,
  },
  testReport: {
    total: 10,
    passed: 9,
    failed: 1,
    coverage: 80,
    details: [],
  },
  pipelineMeta: {},
});

describe('dashboard metrics', () => {
  it('builds efficiency, quality, and estimated cost metrics', () => {
    const metrics = buildDashboardEfficiencyMetrics(
      [requirement('req-1', 'released'), requirement('req-2', 'ai_developing')],
      [task('task-1', 'req-1')],
    );

    expect(metrics.totalRequirements).toBe(2);
    expect(metrics.releasedRequirements).toBe(1);
    expect(metrics.automationCoverage).toBe(50);
    expect(metrics.averageCycleHours).toBe(24);
    expect(metrics.averageQualityScore).toBe(88);
    expect(metrics.testPassRate).toBe(90);
    expect(metrics.estimatedAiCost).toBe(0.82);
  });
});
