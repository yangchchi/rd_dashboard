import type { IPrd, IProduct, IRequirement } from '@/lib/rd-types';

/** PRD 覆盖的全部需求 id（主需求 + 关联需求） */
export function getPrdCoveredRequirementIds(prd: {
  requirementId: string;
  linkedRequirementIds?: string[];
}): string[] {
  const linked = (prd.linkedRequirementIds ?? []).filter(
    (id) => id && id !== prd.requirementId
  );
  return [prd.requirementId, ...linked];
}

export function isRequirementCoveredByAnyPrd(
  requirementId: string,
  prds: Array<{ requirementId: string; linkedRequirementIds?: string[] }>
): boolean {
  return prds.some((prd) => getPrdCoveredRequirementIds(prd).includes(requirementId));
}

export function requirementProductKey(req: IRequirement | undefined): string {
  return (req?.product ?? '').trim();
}

/** 与首个已选需求是否同属一个产品（含均未绑定产品） */
export function requirementsMatchProduct(
  anchor: IRequirement | undefined,
  candidate: IRequirement | undefined
): boolean {
  return requirementProductKey(anchor) === requirementProductKey(candidate);
}

function productShortName(requirement: IRequirement, products: IProduct[]): string {
  const p = products.find((x) => x.id === requirement.product);
  return (
    p?.name?.trim() ||
    p?.identifier?.trim() ||
    p?.code?.trim() ||
    requirement.product?.trim() ||
    ''
  );
}

export function buildMultiPrdStoredTitle(
  requirements: IRequirement[],
  products: IProduct[]
): string {
  if (requirements.length === 0) return 'PRD文档';
  if (requirements.length === 1) {
    const short = productShortName(requirements[0], products);
    const t = requirements[0].title?.trim() || '';
    if (short && t) return `${short}-${t}`;
    return t || 'PRD文档';
  }
  const productShort = productShortName(requirements[0], products);
  const names = requirements.map((r) => r.title.trim()).filter(Boolean);
  const joined = names.join('、');
  const suffix =
    joined.length > 48 ? `${joined.slice(0, 45)}…等${requirements.length}项` : joined;
  if (productShort) return `${productShort}-合并PRD（${suffix}）`;
  return `合并PRD（${suffix}）`;
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

/** 多需求合并生成时的原始需求上下文块 */
export function buildMultiRequirementOriginalBlock(
  requirements: IRequirement[],
  productLines: string[]
): string {
  const reqSections = requirements
    .map((req, index) => {
      const lines = [
        `### 需求 ${index + 1}：${req.title}`,
        `需求 ID：${req.id}`,
        `期望上线时间：${req.expectedDate}`,
        `业务优先级：${req.priority}`,
        `需求描述：${stripHtmlTags(req.description || '')}`,
      ];
      if (req.sketchUrl) lines.push(`草图/附件链接：${req.sketchUrl}`);
      if (req.aiCategory) lines.push(`AI 预分类：${req.aiCategory}`);
      return lines.join('\n');
    })
    .join('\n\n');

  const multiHint =
    requirements.length > 1
      ? [
          '【多需求合并说明】以下多条需求属于同一产品，合并生成为一份 PRD：',
          '- 文档须采用「产品公共设计（写一次）」+「分需求功能与验收（逐条区分）」结构；',
          '- 各需求的功能边界、流程与验收标准必须分段落清晰标注需求名称，禁止混写导致归属不清；',
          '- 账号、权限、通用组件、数据模型、非功能约束等产品级内容合并至公共章节，避免重复。',
        ].join('\n')
      : '【范围锚定】「需求标题 / 需求描述」定义本条 PRD 必须交付的功能与价值；产品信息与参考文档仅用于术语、定位与约束对齐，禁止用参考材料中的其他独立功能主题替代本条需求。';

  return [multiHint, ...productLines, '---', '【待覆盖需求清单】', reqSections]
    .filter((x) => String(x).trim().length > 0)
    .join('\n');
}

export function buildMultiPrdGenerationHints(requirementCount: number): string {
  const base = [
    '请生成完整的 PRD（背景、目标、业务流程、功能列表、非功能性需求等），结构清晰、可评审。',
    '产品简介与用户上传文档不得喧宾夺主，不得编造未在材料中出现且与需求无关的大段“行业故事”。',
    '若提供了同产品参考 PRD 或用户上传文档：继承术语、结构习惯与产品级约束，并与各条需求自洽；冲突处以对应需求描述为准。',
  ];
  if (requirementCount <= 1) {
    return [
      ...base,
      '业务范围必须与上文各「需求标题」「需求描述」一致。',
    ].join('');
  }
  return [
    ...base,
    `本文档须覆盖全部 ${requirementCount} 条需求：先写「产品公共设计」章节（架构、通用能力、共享非功能约束），再按需求逐条写「需求 N · 标题」子章节，功能点与验收标准不得交叉污染。`,
  ].join('');
}

export function formatPrdListRequirementSummary(
  prd: Pick<IPrd, 'requirementId' | 'linkedRequirementIds'>,
  requirements: IRequirement[]
): string {
  const ids = getPrdCoveredRequirementIds(prd);
  const titles = ids
    .map((id) => requirements.find((r) => r.id === id)?.title?.trim())
    .filter(Boolean) as string[];
  if (titles.length <= 1) return titles[0] || '未关联需求';
  return titles.join('、');
}
