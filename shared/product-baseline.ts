/** 需求变更类型：Greenfield = 从零；其余为 Brownfield（在现有产品上改动） */
export type RequirementChangeType = 'greenfield' | 'enhancement' | 'defect' | 'refactor';

export type ProductCapabilitySource =
  | 'manual'
  | 'git_scan'
  | 'released_requirement'
  | 'acceptance_snapshot';

export type ProductCapabilityInterfaceKind = 'api' | 'route' | 'event';

export interface IProductCapabilityInterface {
  kind: ProductCapabilityInterfaceKind;
  ref: string;
}

export interface IProductCapability {
  id: string;
  productId: string;
  baselineId: string;
  baselineVersion: string;
  domain: string;
  name: string;
  description: string;
  interfaces?: IProductCapabilityInterface[];
  source: ProductCapabilitySource;
  sourceRef?: string;
  sortOrder?: number;
}

export interface IProductBaseline {
  id: string;
  productId: string;
  version: string;
  gitRef: string;
  gitUrl?: string;
  asBuiltMarkdown: string;
  notes?: string;
  capabilities?: IProductCapability[];
  frozenAt: string;
  frozenBy?: string;
}

export interface IRequirementImpactPreview {
  requirementId: string;
  changeType: RequirementChangeType;
  baselineId?: string;
  baselineVersion?: string;
  modules: string[];
  apis: string[];
  risks: string[];
}

export const REQUIREMENT_CHANGE_TYPE_LABELS: Record<RequirementChangeType, string> = {
  greenfield: '新功能',
  enhancement: '功能增强',
  defect: '缺陷修复',
  refactor: '重构',
};

/** 变更类型说明（展示在选择框下方） */
export const REQUIREMENT_CHANGE_TYPE_HINTS: Record<RequirementChangeType, string> = {
  greenfield: '从零建设新产品或大功能（Greenfield），无需绑定产品基线。',
  enhancement: '在已有产品上扩展或调整能力（Brownfield），须选择所属产品与基线版本。',
  defect: '修复已有功能的缺陷（Brownfield），须选择所属产品与基线版本。',
  refactor: '技术重构或偿还债务，对外行为不变（Brownfield），须选择所属产品与基线版本。',
};

export const REQUIREMENT_CHANGE_TYPE_OPTIONS: RequirementChangeType[] = [
  'greenfield',
  'enhancement',
  'defect',
  'refactor',
];

export function isBrownfieldChangeType(changeType: RequirementChangeType): boolean {
  return changeType !== 'greenfield';
}

export function normalizeRequirementChangeType(raw: unknown): RequirementChangeType {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (v === 'enhancement' || v === 'defect' || v === 'refactor' || v === 'greenfield') {
    return v;
  }
  return 'greenfield';
}
