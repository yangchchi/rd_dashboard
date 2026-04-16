import type {
  IAcceptanceRecord,
  IBountyTask,
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
  const st = (p.status as string) || 'active';
  return {
    id: p.id as string,
    name: (p.name as string) || '',
    description: (p.description as string) || '',
    owner: (p.owner as string) || undefined,
    sandboxUrl: (p.sandboxUrl as string) || (p.sandbox_url as string) || undefined,
    productionUrl: (p.productionUrl as string) || (p.production_url as string) || undefined,
    gitUrl: (p.gitUrl as string) || (p.git_url as string) || undefined,
    status: st === 'archived' ? 'archived' : 'active',
    createdAt: (p.createdAt as string) || (p.created_at as string),
    updatedAt: (p.updatedAt as string) || (p.updated_at as string),
    createdBy: (p.createdBy as string) || (p.created_by as string) || undefined,
    updatedBy: (p.updatedBy as string) || (p.updated_by as string) || undefined,
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
    createdAt: (r.createdAt as string) || (r.created_at as string),
    updatedAt: (r.updatedAt as string) || (r.updated_at as string),
    submitterName: (r.submitterName as string) || (r.submitter_name as string) || undefined,
    aiCategory: (r.aiCategory as string) || (r.ai_category as string) || undefined,
    createdBy: (r.createdBy as string) || (r.created_by as string) || undefined,
    updatedBy: (r.updatedBy as string) || (r.updated_by as string) || undefined,
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
    createdBy: (p.createdBy as string) || (p.created_by as string) || undefined,
    updatedBy: (p.updatedBy as string) || (p.updated_by as string) || undefined,
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
    createdBy: (s.createdBy as string) || (s.created_by as string) || undefined,
    updatedBy: (s.updatedBy as string) || (s.updated_by as string) || undefined,
  };
}

function mapBountyTask(b: Record<string, unknown>): IBountyTask {
  return {
    id: b.id as string,
    requirementId: (b.requirementId as string) || (b.requirement_id as string),
    publisherId: (b.publisherId as string) || (b.publisher_id as string),
    publisherName: (b.publisherName as string) || (b.publisher_name as string) || undefined,
    title: (b.title as string) || '',
    description: (b.description as string) || '',
    rewardCoins: Number(b.rewardCoins ?? b.reward_coins ?? 0),
    depositCoins: Number(b.depositCoins ?? b.deposit_coins ?? 0),
    consolationCoins: Number(b.consolationCoins ?? b.consolation_coins ?? 1),
    difficultyTag:
      ((b.difficultyTag as IBountyTask['difficultyTag']) ||
        (b.difficulty_tag as IBountyTask['difficultyTag']) ||
        'normal'),
    deadlineAt: (b.deadlineAt as string) || (b.deadline_at as string) || new Date().toISOString(),
    acceptStatus:
      ((b.acceptStatus as IBountyTask['acceptStatus']) ||
        (b.accept_status as IBountyTask['acceptStatus']) ||
        'open'),
    hunterUserId: (b.hunterUserId as string) || (b.hunter_user_id as string) || undefined,
    hunterUserName: (b.hunterUserName as string) || (b.hunter_user_name as string) || undefined,
    pmUserId: (b.pmUserId as string) || (b.pm_user_id as string) || undefined,
    pmUserName: (b.pmUserName as string) || (b.pm_user_name as string) || undefined,
    tmUserId: (b.tmUserId as string) || (b.tm_user_id as string) || undefined,
    tmUserName: (b.tmUserName as string) || (b.tm_user_name as string) || undefined,
    pmAcceptedAt: (b.pmAcceptedAt as string) || (b.pm_accepted_at as string) || undefined,
    tmAcceptedAt: (b.tmAcceptedAt as string) || (b.tm_accepted_at as string) || undefined,
    acceptedAt: (b.acceptedAt as string) || (b.accepted_at as string) || undefined,
    deliveredAt: (b.deliveredAt as string) || (b.delivered_at as string) || undefined,
    settledAt: (b.settledAt as string) || (b.settled_at as string) || undefined,
    createdAt: (b.createdAt as string) || (b.created_at as string) || new Date().toISOString(),
    updatedAt: (b.updatedAt as string) || (b.updated_at as string) || new Date().toISOString(),
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

  async submitPrdForReview(
    prdId: string,
    reviewer?: string,
    comment?: string,
    actorUserId?: string
  ): Promise<IPrd | null> {
    const raw = await json<Record<string, unknown> | null>(
      `/prds/${encodeURIComponent(prdId)}/submit-review`,
      {
        method: 'POST',
        body: JSON.stringify({ reviewer, comment, actorUserId }),
      }
    );
    return raw ? mapPrd(raw) : null;
  },

  async reviewPrd(
    prdId: string,
    status: 'approved' | 'rejected',
    reviewer?: string,
    comment?: string,
    actorUserId?: string
  ): Promise<IPrd | null> {
    const raw = await json<Record<string, unknown> | null>(
      `/prds/${encodeURIComponent(prdId)}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ status, reviewer, comment, actorUserId }),
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

  async submitSpecForReview(
    specId: string,
    reviewer?: string,
    comment?: string,
    actorUserId?: string
  ): Promise<ISpecification | null> {
    const raw = await json<Record<string, unknown> | null>(
      `/specs/${encodeURIComponent(specId)}/submit-review`,
      {
        method: 'POST',
        body: JSON.stringify({ reviewer, comment, actorUserId }),
      }
    );
    return raw ? mapSpec(raw) : null;
  },

  async approveSpec(
    specId: string,
    reviewer?: string,
    comment?: string,
    actorUserId?: string
  ): Promise<ISpecification | null> {
    const raw = await json<Record<string, unknown> | null>(
      `/specs/${encodeURIComponent(specId)}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ reviewer, comment, actorUserId }),
      }
    );
    return raw ? mapSpec(raw) : null;
  },

  async rejectSpec(
    specId: string,
    reviewer?: string,
    comment?: string,
    actorUserId?: string
  ): Promise<ISpecification | null> {
    const raw = await json<Record<string, unknown> | null>(
      `/specs/${encodeURIComponent(specId)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reviewer, comment, actorUserId }),
      }
    );
    return raw ? mapSpec(raw) : null;
  },

  async getOrgSpecConfig(): Promise<IOrganizationSpecConfig | null> {
    const raw = await json<IOrganizationSpecConfig | null | undefined>('/org-spec');
    // json() 在 204 / 空 body 时为 undefined；React Query 不允许 query 结果为 undefined
    return raw ?? null;
  },

  async saveOrgSpecConfig(config: IOrganizationSpecConfig): Promise<void> {
    await json('/org-spec', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  async listAcceptanceRecords(): Promise<IAcceptanceRecord[]> {
    const rows = await json<Record<string, unknown>[]>('/acceptance');
    return rows.map((r) => {
      const resultRaw = String(r.result || 'pending');
      const result: IAcceptanceRecord['result'] =
        resultRaw === 'approved' || resultRaw === 'rejected' ? resultRaw : 'pending';
      const statusRaw = String(r.status || result);
      const status: IAcceptanceRecord['status'] =
        statusRaw === 'approved' || statusRaw === 'rejected' ? statusRaw : 'pending';
      return {
        id: r.id as string,
        requirementId: (r.requirementId as string) || (r.requirement_id as string),
        reviewer: r.reviewer as string,
        scores: r.scores as IAcceptanceRecord['scores'],
        feedback: (r.feedback as string) || '',
        result,
        status,
        createdAt: (r.createdAt as string) || (r.created_at as string),
        updatedAt: (r.updatedAt as string) || (r.updated_at as string) || undefined,
        createdBy: (r.createdBy as string) || (r.created_by as string) || undefined,
        updatedBy: (r.updatedBy as string) || (r.updated_by as string) || undefined,
      };
    });
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

  async downloadPipelineDocsZip(requirementId: string): Promise<Blob> {
    const res = await fetch(`${BASE}/pipeline-docs/download?requirementId=${encodeURIComponent(requirementId)}`);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`${res.status}: ${t}`);
    }
    return res.blob();
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

  async listBountyTasks(): Promise<IBountyTask[]> {
    const rows = await json<Record<string, unknown>[]>('/bounty-tasks');
    return rows.map(mapBountyTask);
  },

  async listHuntBountyTasks(): Promise<IBountyTask[]> {
    const rows = await json<Record<string, unknown>[]>('/bounty-tasks/hunt');
    return rows.map(mapBountyTask);
  },

  async createBountyTask(
    body: Partial<IBountyTask> & { requirementId: string; publisherId: string; title: string }
  ): Promise<IBountyTask> {
    const raw = await json<Record<string, unknown>>('/bounty-tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return mapBountyTask(raw);
  },

  async acceptBountyTask(
    id: string,
    body: { role: 'pm' | 'tm'; hunterUserId: string; hunterUserName?: string }
  ): Promise<{ ok: boolean; task?: IBountyTask; consolationCoins?: number; bothFilled?: boolean }> {
    const raw = await json<Record<string, unknown>>(`/bounty-tasks/${encodeURIComponent(id)}/accept`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return {
      ok: Boolean(raw.ok),
      task: raw.task ? mapBountyTask(raw.task as Record<string, unknown>) : undefined,
      consolationCoins: raw.consolationCoins != null ? Number(raw.consolationCoins) : undefined,
      bothFilled: raw.bothFilled != null ? Boolean(raw.bothFilled) : undefined,
    };
  },

  async deliverBountyTask(id: string, actorUserId: string): Promise<IBountyTask> {
    const raw = await json<Record<string, unknown>>(`/bounty-tasks/${encodeURIComponent(id)}/deliver`, {
      method: 'POST',
      body: JSON.stringify({ actorUserId }),
    });
    return mapBountyTask(raw);
  },

  async settleBountyTask(id: string): Promise<IBountyTask> {
    const raw = await json<Record<string, unknown>>(`/bounty-tasks/${encodeURIComponent(id)}/settle`, {
      method: 'POST',
    });
    return mapBountyTask(raw);
  },

  async rejectBountyTask(id: string): Promise<IBountyTask> {
    const raw = await json<Record<string, unknown>>(`/bounty-tasks/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
    });
    return mapBountyTask(raw);
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
    createdBy: (row.createdBy as string) || (row.created_by as string) || undefined,
    updatedBy: (row.updatedBy as string) || (row.updated_by as string) || undefined,
  };
}
