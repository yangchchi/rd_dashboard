/** Brownfield 编程计划（CP）首段约束 */

export const CP_DELTA_READ_BASELINE_STEP =
  '- [ ] 阅读 `context/product/as-built.md` 与 `context/product/manifest.json`，确认存量能力与 untouched 范围';

export function buildCpDeltaPreamble(impactSection?: string): string {
  const impact = impactSection?.trim()
    ? `\n\n> 回归范围（来自 PRD 影响面）：\n${impactSection.trim()}`
    : '';
  return [
    '# Implementation Plan',
    '',
    CP_DELTA_READ_BASELINE_STEP,
    '- [ ] 仅修改影响面涉及的目录/文件，禁止重构无关模块',
    '- [ ] 变更完成后运行影响面内的回归用例',
    impact,
    '',
  ].join('\n');
}
