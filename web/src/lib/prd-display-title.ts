import type { IProduct, IRequirement } from '@/lib/rd-types';
import { findProductForRequirement } from '@/lib/pipeline-page-utils';

/**
 * 卡片/列表展示：「产品名-需求标题」（与需求示例「AIGC平台-增加权限管理功能」一致）。
 * 有产品绑定时用产品主数据名称；无产品时退回 `storedPrdTitle` 或需求标题。
 */
export function formatProductDashRequirementTitle(
  requirement: IRequirement | undefined,
  products: IProduct[],
  fallbackRequirementTitle?: string
): string {
  const reqTitle =
    (requirement?.title ?? '').trim() || (fallbackRequirementTitle ?? '').trim();
  const product = findProductForRequirement(requirement, products);
  const productShort =
    product?.name?.trim() ||
    product?.identifier?.trim() ||
    product?.code?.trim() ||
    requirement?.product?.trim() ||
    '';
  if (productShort && reqTitle) return `${productShort}-${reqTitle}`;
  return reqTitle || (fallbackRequirementTitle ?? '').trim() || '';
}

export function formatPrdListTitle(
  requirement: IRequirement | undefined,
  products: IProduct[],
  storedPrdTitle?: string | null
): string {
  if (!requirement) return storedPrdTitle?.trim() || 'PRD文档';
  if (requirement.product?.trim()) {
    return (
      formatProductDashRequirementTitle(requirement, products, requirement.title) ||
      storedPrdTitle?.trim() ||
      'PRD文档'
    );
  }
  return storedPrdTitle?.trim() || requirement.title.trim() || 'PRD文档';
}

/** AI 生成 PRD 成功后写入库的 title */
export function buildNewPrdStoredTitle(
  requirement: IRequirement | undefined,
  products: IProduct[]
): string {
  const t = formatProductDashRequirementTitle(requirement, products);
  if (t) return t;
  return requirement?.title?.trim() || 'PRD文档';
}
