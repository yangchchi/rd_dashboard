/** Brownfield 规格（FS/TS）增量生成约束 */

export const DELTA_FS_GENERATION_HINT = [
  '【重要】本次为存量产品增量需求（Brownfield），生成 **Delta FS**：',
  '1. 仅描述相对产品基线的新增/修改/删除能力与接口，勿重写整份存量 FS；',
  '2. Markdown 须含二级标题：「## 基线引用」「## 本次变更」「## 不变更声明」「## 影响面」；',
  '3. 「不变更声明」列出本次不得改动的模块/API。',
].join('\n');

export const DELTA_TS_GENERATION_HINT = [
  '【重要】本次为 Brownfield Delta TS：',
  '1. 仅输出相对基线技术栈的增量（Schema/架构/集成变更）；',
  '2. 须含「## 基线引用」「## 本次变更」「## 不变更声明」；',
  '3. 与 Delta FS 的影响面保持一致。',
].join('\n');

export function buildDeltaFsTemplate(input: {
  productName: string;
  baselineVersion: string;
  requirementTitle?: string;
}): string {
  const title = input.requirementTitle?.trim() || '（本次需求）';
  return [
    `# FS 增量 · ${title}`,
    '',
    '## 基线引用',
    '',
    `- 产品：${input.productName}`,
    `- 基线版本：${input.baselineVersion}`,
    '',
    '## 本次变更',
    '',
    '（仅描述相对基线的功能/API/UI 变更）',
    '',
    '## 不变更声明',
    '',
    '- ',
    '',
    '## 影响面',
    '',
    '| 类型 | 范围 | 说明 |',
    '|------|------|------|',
    '| API | | |',
    '| UI | | |',
    '',
  ].join('\n');
}
