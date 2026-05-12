import {
  deriveQualityMetricsFromReview,
  parseReviewScoreBlock,
} from '../../web/src/lib/pipeline-code-review-metrics';

describe('pipeline-code-review-metrics', () => {
  it('parses fixed score block', () => {
    const text = `
一些分析文字
【评分】规格一致性:82
【评分】API覆盖度:71
【评分】代码质量:88
【评分】测试通过率:90
`;
    expect(parseReviewScoreBlock(text)).toEqual({
      specConsistency: 82,
      apiCoverage: 71,
      codeQuality: 88,
      testPassRate: 90,
    });
    expect(deriveQualityMetricsFromReview({ summaryMarkdown: text })).toEqual(
      parseReviewScoreBlock(text),
    );
  });

  it('deriveQualityMetricsFromReview falls back when no score block', () => {
    const m = deriveQualityMetricsFromReview({
      summaryMarkdown: '整体良好，代码规范清晰。',
      testReport: { total: 4, passed: 3, failed: 1, coverage: 60, details: [] },
    });
    expect(m.testPassRate).toBe(75);
    expect(m.specConsistency).toBeGreaterThan(0);
    expect(m.specConsistency).toBeLessThanOrEqual(100);
  });
});
