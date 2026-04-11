import type {
  IAcceptanceRecord,
  IOrganizationSpecConfig,
  IPipelineCommitStore,
  IPipelineLogEntry,
  IPipelineMeta,
  IPipelineQualityMetrics,
  IPipelineTask,
  IPipelineTestReport,
  IPrd,
  IProduct,
  IRequirement,
  ITaskAcceptanceRecord,
  ISpecification,
} from './rd-types';

const BASE = '/api/rd';

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status}: ${t}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text.trim()) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

function splitBountyLocal(bounty: number): { pmCoins: number; tmCoins: number } {
  const b = Math.max(0, Math.floor(bounty));
  const pmCoins = Math.floor(b / 2);
  return { pmCoins, tmCoins: b - pmCoins };
}

function mapProduct(p: Record<string, unknown>): IProduct {
  return {
    id: p.id as string,
    name: (p.name as string) || '',
    description: (p.description as string) || '',
    owner: (p.owner as string) || undefined,
    sandboxUrl: (p.sandboxUrl as string) || (p.sandbox_url as string) || undefined,
    productionUrl: (p.productionUrl as string) || (p.production_url as string) || undefined,
    gitUrl: (p.gitUrl as string) || (p.git_url as string) || undefined,
    createdAt: (p.createdAt as string) || (p.created_at as string),
    updatedAt: (p.updatedAt as string) || (p.updated_at as string),
  };
}

function mapRequirement(r: Record<string, unknown>): IRequirement {
  const bountyRaw = r.bountyPoints ?? r.bounty_points;
  const bountyNum =
    bountyRaw === undefined || bountyRaw === null ? 0 : Number(bountyRaw);
  const bountyPoints = Number.isFinite(bountyNum) ? Math.max(0, Math.floor(bountyNum)) : 0;
  let pmCoins = Number(r.pmCoins ?? r.pm_coins ?? 0);
  let tmCoins = Number(r.tmCoins ?? r.tm_coins ?? 0);
  if (!Number.isFinite(pmCoins)) pmCoins = 0;
  if (!Number.isFinite(tmCoins)) tmCoins = 0;
  if (pmCoins === 0 && tmCoins === 0 && bountyPoints > 0) {
    const s = splitBountyLocal(bountyPoints);
    pmCoins = s.pmCoins;
    tmCoins = s.tmCoins;
  }
  const taRaw = r.taskAcceptances ?? r.task_acceptances;
  let taskAcceptances: IRequirement['taskAcceptances'] = [];
  if (Array.isArray(taRaw)) {
    taskAcceptances = taRaw as ITaskAcceptanceRecord[];
  } else if (typeof taRaw === 'string') {
    try {
      const p = JSON.parse(taRaw) as unknown;
      if (Array.isArray(p)) taskAcceptances = p as ITaskAcceptanceRecord[];
    } catch {
      taskAcceptances = [];
    }
  }
  return {
    id: r.id as string,
    title: r.title as string,
    description: (r.description as string) || '',
    sketchUrl: (r.sketchUrl as string) || (r.sketch_url as string) || undefined,
    product: (() => {
      const p = r.product != null ? String(r.product).trim() : '';
      return p || undefined;
    })(),
    bountyPoints,
    pmCoins,
    tmCoins,
    pmCandidateUserId: (r.pmCandidateUserId as string) || (r.pm_candidate_user_id as string) || undefined,
    tmCandidateUserId: (r.tmCandidateUserId as string) || (r.tm_candidate_user_id as string) || undefined,
    taskAcceptances,
    priority: r.priority as IRequirement['priority'],
    expectedDate: (r.expectedDate as string) || (r.expected_date as string),
    status: r.status as IRequirement['status'],
    submitter: r.submitter as string,
    pm: (r.pm as string) || undefined,
    tm: (r.tm as string) || undefined,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
    submitterName: (r.submitterName as string) || (r.submitter_name as string) || undefined,
    aiCategory: (r.aiCategory as string) || (r.ai_category as string) || undefined,
  };
}

function mapPrd(p: Record<string, unknown>): IPrd {
  return {
    id: p.id as string,
    requirementId: (p.requirementId as string) || (p.requirement_id as string),
    title: (p.title as string) || undefined,
    background: (p.background as string) || '',
    objectives: (p.objectives as string) || '',
    flowchart: (p.flowchart as string) || undefined,
    featureList: (p.featureList as IPrd['featureList']) || (p.feature_list as IPrd['featureList']) || [],
    nonFunctional: (p.nonFunctional as string) || (p.non_functional as string) || '',
    status: p.status as IPrd['status'],
    version: Number(p.version),
    author: (p.author as string) || undefined,
    createdAt: (p.createdAt as string) || (p.created_at as string) || undefined,
    updatedAt: (p.updatedAt as string) || (p.updated_at as string),
    reviews: (p.reviews as IPrd['reviews']) || [],
  };
}

function mapSpec(s: Record<string, unknown>): ISpecification {
  const fs = (s.functionalSpec || s.functional_spec) as ISpecification['functionalSpec'];
  const ts = (s.technicalSpec || s.technical_spec) as ISpecification['technicalSpec'];
  return {
    id: s.id as string,
    prdId: (s.prdId as string) || (s.prd_id as string),
    fsMarkdown: (s.fsMarkdown as string) || (s.fs_markdown as string) || undefined,
    tsMarkdown: (s.tsMarkdown as string) || (s.ts_markdown as string) || undefined,
    functionalSpec: fs || { apis: [], uiComponents: [], interactions: [] },
    technicalSpec: ts || {
      databaseSchema: {},
      architecture: '',
      thirdPartyIntegrations: [],
    },
    machineReadableJson:
      (s.machineReadableJson as string) || (s.machine_readable_json as string) || '',
    status: s.status as ISpecification['status'],
    createdAt: (s.createdAt as string) || (s.created_at as string),
    updatedAt: (s.updatedAt as string) || (s.updated_at as string),
    reviews: (s.reviews as ISpecification['reviews']) || [],
  };
}

export const rdApi = {
  async listRequirements(): Promise<IRequirement[]> {
    const rows = await json<Record<string, unknown>[]>('/requirements');
    return rows.map(mapRequirement);
  },

  async getRequirement(id: string): Promise<IRequirement | null> {
    const r = await json<Record<string, unknown> | null>(`/requirements/${encodeURIComponent(id)}`);
    return r ? mapRequirement(r) : null;
  },

  async upsertRequirement(body: Partial<IRequirement> & { id: string }): Promise<IRequirement> {
    const raw = await json<Record<string, unknown>>('/requirements', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return mapRequirement(raw);
  },

  async acceptRequirementTask(
    requirementId: string,
    body: { role: 'pm' | 'tm'; userId: string; userName?: string }
  ): Promise<IRequirement> {
    const raw = await json<Record<string, unknown>>(
      `/requirements/${encodeURIComponent(requirementId)}/accept-task`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
    return mapRequirement(raw);
  },

  async deleteRequirement(id: string): Promise<void> {
    await json(`/requirements/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async listPrds(): Promise<IPrd[]> {
    const rows = await json<Record<string, unknown>[]>('/prds');
    return rows.map(mapPrd);
  },

  async getPrd(id: string): Promise<IPrd | null> {
    const p = await json<Record<string, unknown> | null>(`/prds/${encodeURIComponent(id)}`);
    return p ? mapPrd(p) : null;
  },

  async upsertPrd(body: Partial<IPrd> & { id: string; requirementId: string }): Promise<IPrd> {
    const raw = await json<Record<string, unknown>>('/prds', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return mapPrd(raw);
  },

  async deletePrd(id: string): Promise<void> {
    await json(`/prds/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async submitPrdForReview(prdId: string, reviewer?: string, comment?: string): Promise<IPrd | null> {
    const raw = await json<Record<string, unknown> | null>(
      `/prds/${encodeURIComponent(prdId)}/submit-review`,
      {
        method: 'POST',
        body: JSON.stringify({ reviewer, comment }),
      }
    );
    return raw ? mapPrd(raw) : null;
  },

  async reviewPrd(
    prdId: string,
    status: 'approved' | 'rejected',
    reviewer?: string,
    comment?: string
  ): Promise<IPrd | null> {
    const raw = await json<Record<string, unknown> | null>(
      `/prds/${encodeURIComponent(prdId)}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ status, reviewer, comment }),
      }
    );
    return raw ? mapPrd(raw) : null;
  },

  async listSpecs(): Promise<ISpecification[]> {
    const rows = await json<Record<string, unknown>[]>('/specs');
    return rows.map(mapSpec);
  },

  async getSpec(id: string): Promise<ISpecification | null> {
    const s = await json<Record<string, unknown> | null>(`/specs/${encodeURIComponent(id)}`);
    return s ? mapSpec(s) : null;
  },

  async upsertSpec(body: Partial<ISpecification> & { id: string; prdId: string }): Promise<ISpecification> {
    const raw = await json<Record<string, unknown>>('/specs', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return mapSpec(raw);
  },

  async deleteSpec(id: string): Promise<void> {
    await json(`/specs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async submitSpecForReview(specId: string, reviewer?: string, comment?: string): Promise<ISpecification | null> {
    const raw = await json<Record<string, unknown> | null>(
      `/specs/${encodeURIComponent(specId)}/submit-review`,
      {
        method: 'POST',
        body: JSON.stringify({ reviewer, comment }),
      }
    );
    return raw ? mapSpec(raw) : null;
  },

  async approveSpec(specId: string, reviewer?: string, comment?: string): Promise<ISpecification | null> {
    const raw = await json<Record<string, unknown> | null>(
      `/specs/${encodeURIComponent(specId)}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ reviewer, comment }),
      }
    );
    return raw ? mapSpec(raw) : null;
  },

  async rejectSpec(specId: string, reviewer?: string, comment?: string): Promise<ISpecification | null> {
    const raw = await json<Record<string, unknown> | null>(
      `/specs/${encodeURIComponent(specId)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reviewer, comment }),
      }
    );
    return raw ? mapSpec(raw) : null;
  },

  async getOrgSpecConfig(): Promise<IOrganizationSpecConfig | null> {
    return json<IOrganizationSpecConfig | null>('/org-spec');
  },

  async saveOrgSpecConfig(config: IOrganizationSpecConfig): Promise<void> {
    await json('/org-spec', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  async listAcceptanceRecords(): Promise<IAcceptanceRecord[]> {
    const rows = await json<Record<string, unknown>[]>('/acceptance');
    return rows.map((r) => ({
      id: r.id as string,
      requirementId: (r.requirementId as string) || (r.requirement_id as string),
      reviewer: r.reviewer as string,
      scores: r.scores as IAcceptanceRecord['scores'],
      feedback: (r.feedback as string) || '',
      result: r.result as IAcceptanceRecord['result'],
      createdAt: (r.createdAt as string) || (r.created_at as string),
    }));
  },

  async addAcceptanceRecord(record: IAcceptanceRecord): Promise<void> {
    await json('/acceptance', {
      method: 'POST',
      body: JSON.stringify(record),
    });
  },

  async listPipelineTasks(): Promise<IPipelineTask[]> {
    const rows = await json<Record<string, unknown>[]>('/pipeline-tasks');
    return rows.map(mapPipelineTask);
  },

  async upsertPipelineTask(
    body: Partial<IPipelineTask> & { id: string; requirementId: string }
  ): Promise<IPipelineTask> {
    const raw = await json<Record<string, unknown>>('/pipeline-tasks', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return mapPipelineTask(raw);
  },

  async deletePipelineTask(id: string): Promise<void> {
    await json(`/pipeline-tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async listProducts(): Promise<IProduct[]> {
    const rows = await json<Record<string, unknown>[]>('/products');
    return rows.map(mapProduct);
  },

  async getProduct(id: string): Promise<IProduct | null> {
    const p = await json<Record<string, unknown> | null>(`/products/${encodeURIComponent(id)}`);
    return p ? mapProduct(p) : null;
  },

  async upsertProduct(body: Partial<IProduct> & { id: string }): Promise<IProduct> {
    const raw = await json<Record<string, unknown>>('/products', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return mapProduct(raw);
  },

  async deleteProduct(id: string): Promise<void> {
    await json(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};

function mapPipelineTask(row: Record<string, unknown>): IPipelineTask {
  const logs = (row.logs as IPipelineLogEntry[]) || [];
  const testReport =
    (row.testReport as IPipelineTestReport | undefined) ||
    (row.test_report as IPipelineTestReport | undefined);
  const qualityMetrics =
    (row.qualityMetrics as IPipelineQualityMetrics | undefined) ||
    (row.quality_metrics as IPipelineQualityMetrics | undefined);
  const pipelineMeta =
    (row.pipelineMeta as IPipelineMeta) || (row.pipeline_meta as IPipelineMeta) || {};
  const commitStore =
    (row.commitStore as IPipelineCommitStore | undefined) ||
    (row.commit_store as IPipelineCommitStore | undefined);
  return {
    id: row.id as string,
    requirementId: (row.requirementId as string) || (row.requirement_id as string),
    requirementTitle: (row.requirementTitle as string) || (row.requirement_title as string),
    status: row.status as IPipelineTask['status'],
    progress: Number(row.progress ?? 0),
    stage: (row.stage as string) || '',
    startTime: (row.startTime as string) || (row.start_time as string) || '',
    estimatedEndTime: (row.estimatedEndTime as string) || (row.estimated_end_time as string) || '',
    logs,
    testReport,
    qualityMetrics,
    pipelineMeta,
    commitStore,
    createdAt: (row.createdAt as string) || (row.created_at as string),
    updatedAt: (row.updatedAt as string) || (row.updated_at as string),
  };
}
