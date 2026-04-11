import type { IPrd, ISpecification } from './rd-types';

/** Spec 列表页展示用结构（由完整规格推导） */
export interface ISpecListRow {
  id: string;
  prdId: string;
  prdTitle: string;
  requirementId?: string;
  functionalSpec: {
    apis: number;
    uiComponents: number;
    interactions: number;
    completedApis: number;
    completedUi: number;
    completedInteractions: number;
  };
  technicalSpec: {
    databaseSchema: boolean;
    architecture: boolean;
    thirdPartyIntegrations: number;
    completedIntegrations: number;
  };
  machineReadableJson: boolean;
  status: ISpecification['status'];
  updatedAt: string;
  reviews?: ISpecification['reviews'];
}

export function specificationToListRow(spec: ISpecification, prdTitle: string, requirementId?: string): ISpecListRow {
  const apis = spec.functionalSpec?.apis?.length ?? 0;
  const ui = spec.functionalSpec?.uiComponents?.length ?? 0;
  const inter = spec.functionalSpec?.interactions?.length ?? 0;
  const ds = spec.technicalSpec?.databaseSchema;
  const hasDb =
    ds !== null &&
    ds !== undefined &&
    (typeof ds !== 'object' ? Boolean(ds) : Object.keys(ds as object).length > 0);
  const arch = Boolean(spec.technicalSpec?.architecture?.trim());
  const tp = spec.technicalSpec?.thirdPartyIntegrations?.length ?? 0;
  return {
    id: spec.id,
    prdId: spec.prdId,
    prdTitle,
    requirementId,
    functionalSpec: {
      apis,
      uiComponents: ui,
      interactions: inter,
      completedApis: apis,
      completedUi: ui,
      completedInteractions: inter,
    },
    technicalSpec: {
      databaseSchema: hasDb,
      architecture: arch,
      thirdPartyIntegrations: tp,
      completedIntegrations: tp,
    },
    machineReadableJson: Boolean(spec.machineReadableJson?.trim()),
    status: spec.status,
    updatedAt: spec.updatedAt,
    reviews: spec.reviews,
  };
}

export function mapSpecsToListRows(specs: ISpecification[], prds: IPrd[]): ISpecListRow[] {
  const byPrd = (pid: string) => prds.find((p) => p.id === pid);
  return specs.map((s) => {
    const prd = byPrd(s.prdId);
    return specificationToListRow(s, prd?.title || prd?.id || '—', prd?.requirementId);
  });
}
