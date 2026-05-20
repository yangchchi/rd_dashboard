/** Brownfield PRD 增量模板（仅描述相对基线的变更） */

export function buildDeltaPrdTemplate(input: {
  productName: string;
  baselineVersion: string;
  gitRef: string;
  requirementTitle?: string;
}): string {
  const title = input.requirementTitle?.trim() || '（本次需求标题）';
  return [
    `# PRD 增量 · ${title}`,
    '',
    '## 基线引用',
    '',
    `- 产品：${input.productName}`,
    `- 基线版本：${input.baselineVersion}`,
    `- Git 引用：\`${input.gitRef}\``,
  '',
    '## 本次变更',
    '',
    '（仅描述新增、修改或删除的能力；不要重复描述基线中已有特性）',
    '',
    '### 新增',
    '',
    '- ',
    '',
    '### 修改',
    '',
    '- ',
    '',
    '### 删除',
    '',
    '- （无则写「无」）',
    '',
    '## 不变更声明',
    '',
    '明确列出本次交付 **不会改动** 的模块/接口/页面，避免 Agent 误改存量代码：',
    '',
    '- ',
    '',
    '## 影响面',
    '',
    '| 类型 | 范围 | 说明 |',
    '|------|------|------|',
    '| 模块 | | |',
    '| API | | |',
    '| 数据 | | |',
    '| 回归测试 | | |',
    '',
  ].join('\n');
}

export const DELTA_PRD_GENERATION_HINT = [
  '【重要】本次为存量产品增量需求（Brownfield），你必须：',
  '1. 仅输出相对产品基线的增量 PRD，使用 Markdown，且必须包含「## 基线引用」「## 本次变更」「## 不变更声明」「## 影响面」四个二级标题；',
  '2. 不要重写整份产品 PRD，不要重复描述基线中已具备的能力；',
  '3. 「不变更声明」须明确 untouched 范围，便于研发 Agent 约束改动边界。',
].join('\n');
