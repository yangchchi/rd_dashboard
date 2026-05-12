import type { IPipelineQualityMetrics, IPipelineTestReport } from '@/lib/rd-types';

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function pickScore(text: string, pattern: RegExp): number | undefined {
  const m = text.match(pattern);
  if (!m) return undefined;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return undefined;
  return clampPct(v);
}

/**
 * 解析审查摘要末尾的固定评分块（由「启动审查」请求中的额外说明引导模型输出）。
 */
export function parseReviewScoreBlock(text: string): IPipelineQualityMetrics | null {
  const specConsistency = pickScore(text, /【评分】\s*规格一致性\s*[:：]\s*(\d{1,3})/);
  const apiCoverage = pickScore(text, /【评分】\s*API覆盖度\s*[:：]\s*(\d{1,3})/);
  const codeQuality = pickScore(text, /【评分】\s*代码质量\s*[:：]\s*(\d{1,3})/);
  const testPassRate = pickScore(text, /【评分】\s*测试通过率\s*[:：]\s*(\d{1,3})/);
  if (
    specConsistency === undefined &&
    apiCoverage === undefined &&
    codeQuality === undefined &&
    testPassRate === undefined
  ) {
    return null;
  }
  return {
    specConsistency: specConsistency ?? 70,
    apiCoverage: apiCoverage ?? 70,
    codeQuality: codeQuality ?? 70,
    testPassRate: testPassRate ?? 70,
  };
}

function heuristicFromSummaryAndTests(
  summary: string,
  testReport?: IPipelineTestReport | null,
): IPipelineQualityMetrics {
  let specConsistency = 72;
  let apiCoverage = 70;
  let codeQuality = 74;
  let testPassRate = 68;

  if (testReport && testReport.total > 0) {
    testPassRate = clampPct((100 * testReport.passed) / testReport.total);
    apiCoverage = clampPct(testReport.coverage * 0.85 + 10);
  }

  const negHits = summary.match(/严重|漏洞|高风险|致命|崩溃|不通过|缺陷|内存泄漏|竞态|死锁/g);
  const posHits = summary.match(/优秀|良好|通过|完善|规范|清晰|合理|可维护/g);
  const neg = negHits?.length ?? 0;
  const pos = posHits?.length ?? 0;
  const delta = pos * 2 - neg * 5;

  specConsistency = clampPct(specConsistency + delta);
  apiCoverage = clampPct(apiCoverage + delta * 0.8);
  codeQuality = clampPct(codeQuality + delta * 1.1);
  if (!testReport || testReport.total === 0) {
    testPassRate = clampPct(testPassRate + delta * 0.5);
  }

  return { specConsistency, apiCoverage, codeQuality, testPassRate };
}

/** 优先解析模型输出的评分块；失败时结合测试报告与摘要关键词估算四项指标。 */
export function deriveQualityMetricsFromReview(params: {
  summaryMarkdown: string;
  testReport?: IPipelineTestReport | null;
}): IPipelineQualityMetrics {
  const parsed = parseReviewScoreBlock(params.summaryMarkdown);
  if (parsed) return parsed;
  return heuristicFromSummaryAndTests(params.summaryMarkdown, params.testReport ?? null);
}
