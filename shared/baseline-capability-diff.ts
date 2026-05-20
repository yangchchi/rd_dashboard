import type { IProductBaseline, IProductCapability } from './product-baseline';

function capabilityKey(c: IProductCapability): string {
  return `${(c.domain || '').trim()}|${(c.name || '').trim()}`;
}

export interface IBaselineCapabilityDiff {
  added: IProductCapability[];
  removed: IProductCapability[];
}

/** 对比两个基线的结构化能力条目（按 domain+name） */
export function diffBaselineCapabilities(
  base: IProductBaseline,
  target: IProductBaseline,
): IBaselineCapabilityDiff {
  const baseList = base.capabilities ?? [];
  const targetList = target.capabilities ?? [];
  const baseMap = new Map(baseList.map((c) => [capabilityKey(c), c]));
  const targetMap = new Map(targetList.map((c) => [capabilityKey(c), c]));

  const added: IProductCapability[] = [];
  const removed: IProductCapability[] = [];

  for (const [key, c] of targetMap) {
    if (!baseMap.has(key)) added.push(c);
  }
  for (const [key, c] of baseMap) {
    if (!targetMap.has(key)) removed.push(c);
  }

  return { added, removed };
}
