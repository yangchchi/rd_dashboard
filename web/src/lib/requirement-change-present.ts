import {
  isBrownfieldChangeType,
  REQUIREMENT_CHANGE_TYPE_LABELS,
  type IProductBaseline,
  type IRequirement,
  type RequirementChangeType,
} from '@/lib/rd-types';

export function formatRequirementChangeLabel(changeType?: RequirementChangeType): string {
  if (!changeType) return REQUIREMENT_CHANGE_TYPE_LABELS.greenfield;
  return REQUIREMENT_CHANGE_TYPE_LABELS[changeType] ?? changeType;
}

export function formatRequirementChangeBadge(
  requirement: Pick<IRequirement, 'changeType' | 'baselineId'>,
  baseline?: Pick<IProductBaseline, 'version'> | null,
): string {
  const ct = requirement.changeType ?? 'greenfield';
  const base = formatRequirementChangeLabel(ct);
  if (!isBrownfieldChangeType(ct)) return base;
  if (baseline?.version) return `${base} · 基线 ${baseline.version}`;
  if (requirement.baselineId) return `${base} · 已绑基线`;
  return `${base} · 缺基线`;
}
