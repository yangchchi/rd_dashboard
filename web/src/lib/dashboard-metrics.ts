import type { IPipelineTask, IRequirement } from './rd-types';

export interface IDashboardEfficiencyMetrics {
  totalRequirements: number;
  releasedRequirements: number;
  activePipelineTasks: number;
  automationCoverage: number;
  averageCycleHours: number;
  averageQualityScore: number;
  testPassRate: number;
  estimatedAiCost: number;
}

function toTime(value: string | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildDashboardEfficiencyMetrics(
  requirements: IRequirement[],
  pipelineTasks: IPipelineTask[],
): IDashboardEfficiencyMetrics {
  const released = requirements.filter((requirement) => requirement.status === 'released');
  const activePipelineTasks = pipelineTasks.filter((task) => task.status !== 'completed' && task.status !== 'failed');
  const automatedRequirementIds = new Set(pipelineTasks.map((task) => task.requirementId));
  const cycleHours = released
    .map((requirement) => {
      const start = toTime(requirement.createdAt);
      const end = toTime(requirement.updatedAt);
      if (start == null || end == null || end < start) return null;
      return (end - start) / 3600000;
    })
    .filter((value): value is number => value != null);
  const qualityScores = pipelineTasks
    .map((task) => {
      const metrics = task.qualityMetrics;
      if (!metrics) return null;
      return average([
        metrics.specConsistency,
        metrics.apiCoverage,
        metrics.codeQuality,
        metrics.testPassRate,
      ]);
    })
    .filter((value): value is number => value != null);
  const testTotals = pipelineTasks.reduce(
    (acc, task) => {
      if (!task.testReport) return acc;
      acc.total += task.testReport.total;
      acc.passed += task.testReport.passed;
      return acc;
    },
    { total: 0, passed: 0 },
  );
  const estimatedAiCost = pipelineTasks.reduce((sum, task) => {
    const logCost = (task.logs?.length || 0) * 0.02;
    const qualityCost = task.qualityMetrics ? 0.5 : 0;
    const testCost = task.testReport ? task.testReport.total * 0.03 : 0;
    return sum + logCost + qualityCost + testCost;
  }, 0);

  return {
    totalRequirements: requirements.length,
    releasedRequirements: released.length,
    activePipelineTasks: activePipelineTasks.length,
    automationCoverage:
      requirements.length > 0 ? Math.round((automatedRequirementIds.size / requirements.length) * 100) : 0,
    averageCycleHours: Math.round(average(cycleHours) * 10) / 10,
    averageQualityScore: Math.round(average(qualityScores)),
    testPassRate: testTotals.total > 0 ? Math.round((testTotals.passed / testTotals.total) * 100) : 0,
    estimatedAiCost: Math.round(estimatedAiCost * 100) / 100,
  };
}
