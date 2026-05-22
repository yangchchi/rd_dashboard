import type {
  IAcceptanceRecord,
  IAgentSession,
  IAgentExecutionEvent,
  IAgentTask,
  IAgentToolCall,
  IAgentWorkspace,
  IAgentWorkspaceProvisionResult,
  IAgentWorkspaceSourceTreeResponse,
  IBountyTask,
  IContextPack,
  IOrganizationSpecConfig,
  IPipelineCommitStore,
  IPipelineCodeReviewRecord,
  IPipelineGeneratedTestCase,
  IPipelineLogEntry,
  IPipelineMeta,
  IPipelineQualityMetrics,
  IPipelineRun,
  IPipelineStepRun,
  IPipelineTask,
  IPipelineTestReport,
  IPipelineTestRunRecord,
  IPrd,
  IProduct,
  IProductBaseline,
  IProductCapability,
  IRequirement,
  IRequirementImpactPreview,
  RequirementChangeType,
  IRequirementFlowEvent,
  ITaskAcceptanceRecord,
  ISpecification,
  IAiSkillConfig,
  ISiteMessage,
} from './rd-types';
import { getAuthToken, rejectIfUnauthorized } from './auth';
import { normalizeRequirementChangeType } from '@shared/product-baseline';

const BASE = '/api/rd';

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? getAuthToken() : null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const t = await res.text();
    rejectIfUnauthorized(res.status, t);
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
  const codeRaw = p.code != null ? String(p.code).trim() : '';
  const tmRaw = p.technicalManager ?? p.technical_manager;
  const ptRaw = p.productType ?? p.product_type;
  const idRaw = p.identifier != null ? String(p.identifier).trim() : '';
  return {
    id: p.id as string,
    code: codeRaw || undefined,
    identifier: idRaw || undefined,
    name: (p.name as string) || '',
    description: (p.description as string) || '',
    owner: (p.owner as string) || undefined,
    technicalManager: tmRaw != null && String(tmRaw).trim() ? String(tmRaw).trim() : undefined,
    productType: ptRaw != null && String(ptRaw).trim() ? String(ptRaw).trim() : undefined,
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

function mapProductCapability(c: Record<string, unknown>): IProductCapability {
  const ifaceRaw = c.interfaces;
  let interfaces: IProductCapability['interfaces'] = [];
  if (Array.isArray(ifaceRaw)) {
    interfaces = ifaceRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const kind = row.kind;
        const ref = row.ref;
        if (
          (kind === 'api' || kind === 'route' || kind === 'event') &&
          typeof ref === 'string' &&
          ref.trim()
        ) {
          return { kind: kind as 'api' | 'route' | 'event', ref: ref.trim() };
        }
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }
  return {
    id: String(c.id),
    productId: String(c.productId || c.product_id),
    baselineId: String(c.baselineId || c.baseline_id),
    baselineVersion: String(c.baselineVersion || c.baseline_version || ''),
    domain: String(c.domain || ''),
    name: String(c.name || ''),
    description: String(c.description || ''),
    interfaces,
    source: (String(c.source || 'manual') as IProductCapability['source']) || 'manual',
    sourceRef: (c.sourceRef as string) || (c.source_ref as string) || undefined,
    sortOrder: Number(c.sortOrder ?? c.sort_order ?? 0),
  };
}

function mapProductBaseline(b: Record<string, unknown>): IProductBaseline {
  const capsRaw = b.capabilities;
  const capabilities = Array.isArray(capsRaw)
    ? capsRaw.map((c) => mapProductCapability(c as Record<string, unknown>))
    : undefined;
  return {
    id: String(b.id),
    productId: String(b.productId || b.product_id),
    version: String(b.version),
    gitRef: String(b.gitRef || b.git_ref),
    gitUrl: (b.gitUrl as string) || (b.git_url as string) || undefined,
    asBuiltMarkdown: String(b.asBuiltMarkdown || b.as_built_markdown || ''),
    notes: (b.notes as string) || undefined,
    capabilities,
    frozenAt: String(b.frozenAt || b.frozen_at),
    frozenBy: (b.frozenBy as string) || (b.frozen_by as string) || undefined,
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
    productId: (r.productId as string) || (r.product_id as string) || undefined,
    changeType: normalizeRequirementChangeType(r.changeType ?? r.change_type),
    baselineId: (r.baselineId as string) || (r.baseline_id as string) || undefined,
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

function mapRequirementFlowEvent(r: Record<string, unknown>): IRequirementFlowEvent {
  return {
    id: String(r.id || ''),
    requirementId: String(r.requirementId || r.requirement_id || ''),
    fromStatus: (r.fromStatus as IRequirementFlowEvent['fromStatus']) || (r.from_status as IRequirementFlowEvent['fromStatus']) || null,
    toStatus: (r.toStatus as IRequirementFlowEvent['toStatus']) || (r.to_status as IRequirementFlowEvent['toStatus']),
    action: String(r.action || ''),
    operator: (r.operator as string) || undefined,
    comment: (r.comment as string) || undefined,
    metadata: (r.metadata as Record<string, unknown>) || {},
    createdAt: (r.createdAt as string) || (r.created_at as string),
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
    cpMarkdown: (s.cpMarkdown as string) || (s.cp_markdown as string) || undefined,
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

function mapAiSkill(s: Record<string, unknown>): IAiSkillConfig {
  return {
    id: String(s.id || ''),
    name: String(s.name || ''),
    description: (s.description as string) || undefined,
    provider: 'ark',
    endpoint: (s.endpoint as string) || undefined,
    model: String(s.model || ''),
    stream: Boolean(s.stream ?? true),
    tools: Array.isArray(s.tools) ? (s.tools as Array<Record<string, unknown>>) : [],
    promptTemplate: String(s.promptTemplate || s.prompt_template || ''),
    updatedAt: (s.updatedAt as string) || (s.updated_at as string) || undefined,
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

  async listRequirementFlowEvents(requirementId: string): Promise<IRequirementFlowEvent[]> {
    const rows = await json<Record<string, unknown>[]>(
      `/requirements/${encodeURIComponent(requirementId)}/flow-events`
    );
    return rows.map(mapRequirementFlowEvent);
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

  async listAiSkills(): Promise<IAiSkillConfig[]> {
    const rows = await json<Record<string, unknown>[]>('/ai-skills');
    return rows.map(mapAiSkill);
  },

  async getAiSkill(id: string): Promise<IAiSkillConfig | null> {
    const raw = await json<Record<string, unknown> | null>(`/ai-skills/${encodeURIComponent(id)}`);
    return raw ? mapAiSkill(raw) : null;
  },

  async upsertAiSkill(id: string, body: Partial<IAiSkillConfig>): Promise<IAiSkillConfig> {
    const raw = await json<Record<string, unknown>>(`/ai-skills/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return mapAiSkill(raw);
  },

  async resetAiSkill(id: string): Promise<void> {
    await json(`/ai-skills/${encodeURIComponent(id)}`, { method: 'DELETE' });
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

  async listPipelineRuns(requirementId?: string): Promise<IPipelineRun[]> {
    const query = requirementId ? `?requirementId=${encodeURIComponent(requirementId)}` : '';
    const rows = await json<Record<string, unknown>[]>(`/pipeline-runs${query}`);
    return rows.map(mapPipelineRun);
  },

  async getPipelineRun(id: string): Promise<IPipelineRun | null> {
    const row = await json<Record<string, unknown> | null>(`/pipeline-runs/${encodeURIComponent(id)}`);
    return row ? mapPipelineRun(row) : null;
  },

  async createPipelineRun(body: Partial<IPipelineRun> & { requirementId: string }): Promise<IPipelineRun> {
    const raw = await json<Record<string, unknown>>('/pipeline-runs', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return mapPipelineRun(raw);
  },

  async listPipelineStepRuns(pipelineRunId: string): Promise<IPipelineStepRun[]> {
    const rows = await json<Record<string, unknown>[]>(
      `/pipeline-runs/${encodeURIComponent(pipelineRunId)}/steps`
    );
    return rows.map(mapPipelineStepRun);
  },

  async upsertPipelineStepRun(
    body: Partial<IPipelineStepRun> & { pipelineRunId: string; stepKey: string; name: string }
  ): Promise<IPipelineStepRun> {
    const raw = await json<Record<string, unknown>>('/pipeline-step-runs', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return mapPipelineStepRun(raw);
  },

  async listAgentSessions(filters?: {
    pipelineRunId?: string;
    requirementId?: string;
  }): Promise<IAgentSession[]> {
    const params = new URLSearchParams();
    if (filters?.pipelineRunId) params.set('pipelineRunId', filters.pipelineRunId);
    if (filters?.requirementId) params.set('requirementId', filters.requirementId);
    const query = params.toString() ? `?${params.toString()}` : '';
    const rows = await json<Record<string, unknown>[]>(`/agent-sessions${query}`);
    return rows.map(mapAgentSession);
  },

  async getAgentSession(id: string): Promise<IAgentSession | null> {
    const row = await json<Record<string, unknown> | null>(`/agent-sessions/${encodeURIComponent(id)}`);
    return row ? mapAgentSession(row) : null;
  },

  async createAgentSession(
    body: Partial<IAgentSession> & { requirementId: string; title: string }
  ): Promise<IAgentSession> {
    const raw = await json<Record<string, unknown>>('/agent-sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return mapAgentSession(raw);
  },

  async patchAgentSessionMetadata(
    id: string,
    patch: Record<string, unknown>,
    updatedBy?: string | null,
  ): Promise<IAgentSession> {
    const raw = await json<Record<string, unknown>>(
      `/agent-sessions/${encodeURIComponent(id)}/metadata`,
      {
        method: 'PATCH',
        body: JSON.stringify({ patch, updatedBy: updatedBy ?? null }),
      },
    );
    return mapAgentSession(raw);
  },

  async listAgentTasks(sessionId: string): Promise<IAgentTask[]> {
    const rows = await json<Record<string, unknown>[]>(
      `/agent-sessions/${encodeURIComponent(sessionId)}/tasks`
    );
    return rows.map(mapAgentTask);
  },

  async upsertAgentTask(
    body: Partial<IAgentTask> & { sessionId: string; role: IAgentTask['role']; title: string }
  ): Promise<IAgentTask> {
    const raw = await json<Record<string, unknown>>('/agent-tasks', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return mapAgentTask(raw);
  },

  async listAgentToolCalls(sessionId: string, taskId?: string): Promise<IAgentToolCall[]> {
    const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : '';
    const rows = await json<Record<string, unknown>[]>(
      `/agent-sessions/${encodeURIComponent(sessionId)}/tool-calls${query}`
    );
    return rows.map(mapAgentToolCall);
  },

  async upsertAgentToolCall(
    body: Partial<IAgentToolCall> & { sessionId: string; toolName: string }
  ): Promise<IAgentToolCall> {
    const raw = await json<Record<string, unknown>>('/agent-tool-calls', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return mapAgentToolCall(raw);
  },

  async prepareAgentToolCall(
    body: Partial<IAgentToolCall> & {
      sessionId: string;
      toolName: string;
      toolCategory: IAgentToolCall['toolCategory'];
      timeoutMs?: number | null;
    }
  ): Promise<IAgentToolCall> {
    const raw = await json<Record<string, unknown>>('/agent-tool-calls/prepare', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return mapAgentToolCall(raw);
  },

  async approveAgentToolCall(
    id: string,
    body: { approved: boolean; approver?: string | null; reason?: string | null }
  ): Promise<IAgentToolCall> {
    const raw = await json<Record<string, unknown>>(`/agent-tool-calls/${encodeURIComponent(id)}/approval`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return mapAgentToolCall(raw);
  },

  async startAgentToolCall(id: string): Promise<IAgentToolCall> {
    const raw = await json<Record<string, unknown>>(`/agent-tool-calls/${encodeURIComponent(id)}/start`, {
      method: 'POST',
    });
    return mapAgentToolCall(raw);
  },

  async cancelAgentToolCallExecution(id: string): Promise<IAgentToolCall> {
    const raw = await json<Record<string, unknown>>(`/agent-tool-calls/${encodeURIComponent(id)}/cancel-execution`, {
      method: 'POST',
    });
    return mapAgentToolCall(raw);
  },

  async *runAgentToolCallWithCodex(
    id: string,
    body: { prompt?: string | null; model?: string | null }
  ): AsyncIterable<IAgentExecutionEvent> {
    const token = typeof window !== 'undefined' ? getAuthToken() : null;
    const response = await fetch(`${BASE}/agent-tool-calls/${encodeURIComponent(id)}/run-codex`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      rejectIfUnauthorized(response.status, text);
      throw new Error(`${response.status}: ${text || 'Codex stream failed'}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          let parsed: {
            status_code?: string;
            data?: IAgentExecutionEvent & { toolCall?: Record<string, unknown> };
            error_msg?: string;
          };
          try {
            parsed = JSON.parse(raw) as typeof parsed;
          } catch {
            continue;
          }
          if (parsed.status_code !== '0') {
            throw new Error(parsed.error_msg || 'Codex stream failed');
          }
          if (!parsed.data) continue;
          yield {
            ...parsed.data,
            toolCall: parsed.data.toolCall ? mapAgentToolCall(parsed.data.toolCall) : undefined,
          };
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  async finishAgentToolCall(
    id: string,
    body: {
      exitCode?: number | null;
      outputSummary?: string | null;
      errorMessage?: string | null;
      durationMs?: number | null;
    }
  ): Promise<IAgentToolCall> {
    const raw = await json<Record<string, unknown>>(`/agent-tool-calls/${encodeURIComponent(id)}/finish`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return mapAgentToolCall(raw);
  },

  async listAgentWorkspaces(sessionId: string): Promise<IAgentWorkspace[]> {
    const rows = await json<Record<string, unknown>[]>(
      `/agent-sessions/${encodeURIComponent(sessionId)}/workspaces`
    );
    return rows.map(mapAgentWorkspace);
  },

  async upsertAgentWorkspace(
    body: Partial<IAgentWorkspace> & {
      sessionId: string;
      repoUrl: string;
      baseBranch: string;
      agentBranch: string;
    }
  ): Promise<IAgentWorkspace> {
    const raw = await json<Record<string, unknown>>('/agent-workspaces', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return mapAgentWorkspace(raw);
  },

  async provisionAgentWorkspace(body: {
    sessionId: string;
    repoUrl: string;
    baseBranch?: string | null;
    agentBranch?: string | null;
    workspaceRoot?: string | null;
    kind?: IAgentWorkspace['kind'];
    createdBy?: string | null;
    productSlug?: string | null;
    sessionFolderName?: string | null;
  }): Promise<IAgentWorkspaceProvisionResult> {
    const raw = await json<Record<string, unknown>>('/agent-workspaces/provision', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return mapAgentWorkspaceProvisionResult(raw);
  },

  async markAgentWorkspaceReady(
    id: string,
    body?: { baseCommit?: string | null; headCommit?: string | null; lockOwnerTaskId?: string | null }
  ): Promise<IAgentWorkspace> {
    const raw = await json<Record<string, unknown>>(`/agent-workspaces/${encodeURIComponent(id)}/ready`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    });
    return mapAgentWorkspace(raw);
  },

  async executeAgentWorkspaceLifecycle(id: string): Promise<IAgentWorkspaceProvisionResult> {
    const raw = await json<Record<string, unknown>>(`/agent-workspaces/${encodeURIComponent(id)}/execute-lifecycle`, {
      method: 'POST',
    });
    return mapAgentWorkspaceProvisionResult(raw);
  },

  async cleanupAgentWorkspace(id: string): Promise<IAgentWorkspaceProvisionResult> {
    const raw = await json<Record<string, unknown>>(`/agent-workspaces/${encodeURIComponent(id)}/cleanup`, {
      method: 'POST',
    });
    return mapAgentWorkspaceProvisionResult(raw);
  },

  async listAgentWorkspaceSourceTree(workspaceId: string): Promise<IAgentWorkspaceSourceTreeResponse> {
    return json<IAgentWorkspaceSourceTreeResponse>(
      `/agent-workspaces/${encodeURIComponent(workspaceId)}/source-tree`,
    );
  },

  async getAgentWorkspaceSourceFile(
    workspaceId: string,
    relativePath: string,
  ): Promise<{ path: string; content: string; truncated: boolean }> {
    const q = `?path=${encodeURIComponent(relativePath)}`;
    return json<{ path: string; content: string; truncated: boolean }>(
      `/agent-workspaces/${encodeURIComponent(workspaceId)}/source-file${q}`,
    );
  },

  async commitAndPushAgentWorkspace(
    workspaceId: string,
    body?: { commitMessage?: string | null; gitPat?: string | null; gitUsername?: string | null },
  ): Promise<{ committed: boolean; pushed: boolean; branch: string; commitHash: string | null; log: string[] }> {
    return json(`/agent-workspaces/${encodeURIComponent(workspaceId)}/git-commit-push`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    });
  },

  async listContextPacks(requirementId?: string): Promise<IContextPack[]> {
    const query = requirementId ? `?requirementId=${encodeURIComponent(requirementId)}` : '';
    const rows = await json<Record<string, unknown>[]>(`/context-packs${query}`);
    return rows.map(mapContextPack);
  },

  async getContextPack(id: string): Promise<IContextPack | null> {
    const row = await json<Record<string, unknown> | null>(`/context-packs/${encodeURIComponent(id)}`);
    return row ? mapContextPack(row) : null;
  },

  async createContextPack(body: {
    id?: string;
    requirementId: string;
    prdId?: string | null;
    specId?: string | null;
    pipelineRunId?: string | null;
    baselineId?: string | null;
    createdBy?: string | null;
  }): Promise<IContextPack> {
    const raw = await json<Record<string, unknown>>('/context-packs', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return mapContextPack(raw);
  },

  async downloadPipelineDocsZip(requirementId: string): Promise<Blob> {
    const token = typeof window !== 'undefined' ? getAuthToken() : null;
    const res = await fetch(`${BASE}/pipeline-docs/download?requirementId=${encodeURIComponent(requirementId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      const t = await res.text();
      rejectIfUnauthorized(res.status, t);
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

  async listProductBaselines(productId: string): Promise<IProductBaseline[]> {
    const rows = await json<Record<string, unknown>[]>(
      `/products/${encodeURIComponent(productId)}/baselines`,
    );
    return rows.map(mapProductBaseline);
  },

  async getProductBaseline(productId: string, baselineId: string): Promise<IProductBaseline | null> {
    const row = await json<Record<string, unknown> | null>(
      `/products/${encodeURIComponent(productId)}/baselines/${encodeURIComponent(baselineId)}`,
    );
    return row ? mapProductBaseline(row) : null;
  },

  async createProductBaseline(
    productId: string,
    body: {
      id?: string;
      version: string;
      gitRef: string;
      gitUrl?: string | null;
      asBuiltMarkdown?: string;
      notes?: string | null;
      frozenBy?: string | null;
      capabilities?: Array<{
        domain?: string;
        name: string;
        description?: string;
        interfaces?: IProductCapability['interfaces'];
        source?: IProductCapability['source'];
        sourceRef?: string;
        sortOrder?: number;
      }>;
    },
  ): Promise<IProductBaseline> {
    const raw = await json<Record<string, unknown>>(
      `/products/${encodeURIComponent(productId)}/baselines`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    return mapProductBaseline(raw);
  },

  async getRequirementImpactPreview(requirementId: string): Promise<IRequirementImpactPreview> {
    return json<IRequirementImpactPreview>(
      `/requirements/${encodeURIComponent(requirementId)}/impact-preview`,
    );
  },

  async listBountyTasks(): Promise<IBountyTask[]> {
    const rows = await json<Record<string, unknown>[]>('/bounty-tasks');
    return rows.map(mapBountyTask);
  },

  async listHuntBountyTasks(): Promise<IBountyTask[]> {
    const rows = await json<Record<string, unknown>[]>('/bounty-tasks/hunt');
    return rows.map(mapBountyTask);
  },

  async listSiteMessages(userId: string): Promise<ISiteMessage[]> {
    const q = encodeURIComponent(userId);
    const rows = await json<Record<string, unknown>[]>(`/site-messages?userId=${q}`);
    return rows.map(mapSiteMessage);
  },

  async markSiteMessageRead(messageId: string, userId: string): Promise<ISiteMessage> {
    const raw = await json<Record<string, unknown>>(`/site-messages/${encodeURIComponent(messageId)}/read`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return mapSiteMessage(raw);
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

function mapSiteMessage(row: Record<string, unknown>): ISiteMessage {
  const readRaw = row.readAt ?? row.read_at;
  return {
    id: row.id as string,
    recipientUserId: (row.recipientUserId as string) || (row.recipient_user_id as string) || '',
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    linkUrl: (row.linkUrl as string) || (row.link_url as string) || '/bounty-hunt',
    readAt: readRaw != null && String(readRaw) !== '' ? String(readRaw) : undefined,
    createdAt: (row.createdAt as string) || (row.created_at as string) || '',
    kind: (row.kind as string) || undefined,
    relatedBountyTaskId:
      (row.relatedBountyTaskId as string) || (row.related_bounty_task_id as string) || undefined,
  };
}

function mapPipelineTask(row: Record<string, unknown>): IPipelineTask {
  const logs = (row.logs as IPipelineLogEntry[]) || [];
  const testReport =
    (row.testReport as IPipelineTestReport | undefined) ||
    (row.test_report as IPipelineTestReport | undefined);
  const qualityMetrics =
    (row.qualityMetrics as IPipelineQualityMetrics | undefined) ||
    (row.quality_metrics as IPipelineQualityMetrics | undefined);
  const codeReviewHistoryRaw =
    (row.codeReviewHistory as IPipelineCodeReviewRecord[] | undefined) ||
    (row.code_review_history as IPipelineCodeReviewRecord[] | undefined);
  const generatedTestCasesRaw =
    (row.generatedTestCases as IPipelineGeneratedTestCase[] | undefined) ||
    (row.generated_test_cases as IPipelineGeneratedTestCase[] | undefined);
  const testRunHistoryRaw =
    (row.testRunHistory as IPipelineTestRunRecord[] | undefined) ||
    (row.test_run_history as IPipelineTestRunRecord[] | undefined);
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
    codeReviewHistory: Array.isArray(codeReviewHistoryRaw) ? codeReviewHistoryRaw : undefined,
    generatedTestCases: Array.isArray(generatedTestCasesRaw) ? generatedTestCasesRaw : undefined,
    testRunHistory: Array.isArray(testRunHistoryRaw) ? testRunHistoryRaw : undefined,
    pipelineMeta,
    commitStore,
    createdAt: (row.createdAt as string) || (row.created_at as string),
    updatedAt: (row.updatedAt as string) || (row.updated_at as string),
    createdBy: (row.createdBy as string) || (row.created_by as string) || undefined,
    updatedBy: (row.updatedBy as string) || (row.updated_by as string) || undefined,
  };
}

function mapPipelineRun(row: Record<string, unknown>): IPipelineRun {
  return {
    id: row.id as string,
    pipelineTaskId: (row.pipelineTaskId as string) || (row.pipeline_task_id as string) || undefined,
    requirementId: (row.requirementId as string) || (row.requirement_id as string),
    status: row.status as IPipelineRun['status'],
    triggerMode:
      ((row.triggerMode as IPipelineRun['triggerMode']) ||
        (row.trigger_mode as IPipelineRun['triggerMode']) ||
        'manual'),
    contextSnapshot:
      ((row.contextSnapshot as Record<string, unknown>) ||
        (row.context_snapshot as Record<string, unknown>) ||
        {}),
    startedAt: (row.startedAt as string) || (row.started_at as string) || undefined,
    finishedAt: (row.finishedAt as string) || (row.finished_at as string) || undefined,
    createdAt: (row.createdAt as string) || (row.created_at as string),
    updatedAt: (row.updatedAt as string) || (row.updated_at as string),
    createdBy: (row.createdBy as string) || (row.created_by as string) || undefined,
    updatedBy: (row.updatedBy as string) || (row.updated_by as string) || undefined,
  };
}

function mapPipelineStepRun(row: Record<string, unknown>): IPipelineStepRun {
  return {
    id: row.id as string,
    pipelineRunId: (row.pipelineRunId as string) || (row.pipeline_run_id as string),
    stepKey: (row.stepKey as string) || (row.step_key as string),
    name: row.name as string,
    status: row.status as IPipelineStepRun['status'],
    orderIndex: Number(row.orderIndex ?? row.order_index ?? 0),
    inputRef: (row.inputRef as string) || (row.input_ref as string) || undefined,
    outputRef: (row.outputRef as string) || (row.output_ref as string) || undefined,
    errorCode: (row.errorCode as string) || (row.error_code as string) || undefined,
    errorMessage: (row.errorMessage as string) || (row.error_message as string) || undefined,
    startedAt: (row.startedAt as string) || (row.started_at as string) || undefined,
    finishedAt: (row.finishedAt as string) || (row.finished_at as string) || undefined,
    createdAt: (row.createdAt as string) || (row.created_at as string),
    updatedAt: (row.updatedAt as string) || (row.updated_at as string),
  };
}

function mapAgentSession(row: Record<string, unknown>): IAgentSession {
  return {
    id: row.id as string,
    pipelineRunId: (row.pipelineRunId as string) || (row.pipeline_run_id as string) || undefined,
    requirementId: (row.requirementId as string) || (row.requirement_id as string),
    specId: (row.specId as string) || (row.spec_id as string) || undefined,
    contextPackId: (row.contextPackId as string) || (row.context_pack_id as string) || undefined,
    title: String(row.title || ''),
    status: row.status as IAgentSession['status'],
    runtimeAdapter:
      ((row.runtimeAdapter as IAgentSession['runtimeAdapter']) ||
        (row.runtime_adapter as IAgentSession['runtimeAdapter']) ||
        'custom'),
    model: (row.model as string) || undefined,
    baseBranch: (row.baseBranch as string) || (row.base_branch as string) || undefined,
    agentBranch: (row.agentBranch as string) || (row.agent_branch as string) || undefined,
    planMarkdown: (row.planMarkdown as string) || (row.plan_markdown as string) || undefined,
    riskLevel:
      ((row.riskLevel as IAgentSession['riskLevel']) ||
        (row.risk_level as IAgentSession['riskLevel']) ||
        'medium'),
    metadata:
      ((row.metadata as Record<string, unknown>) ||
        {}),
    createdAt: (row.createdAt as string) || (row.created_at as string),
    updatedAt: (row.updatedAt as string) || (row.updated_at as string),
    createdBy: (row.createdBy as string) || (row.created_by as string) || undefined,
    updatedBy: (row.updatedBy as string) || (row.updated_by as string) || undefined,
  };
}

function mapAgentTask(row: Record<string, unknown>): IAgentTask {
  return {
    id: row.id as string,
    sessionId: (row.sessionId as string) || (row.session_id as string),
    pipelineStepRunId:
      (row.pipelineStepRunId as string) || (row.pipeline_step_run_id as string) || undefined,
    parentTaskId: (row.parentTaskId as string) || (row.parent_task_id as string) || undefined,
    role: row.role as IAgentTask['role'],
    title: String(row.title || ''),
    instructions: String(row.instructions || ''),
    status: row.status as IAgentTask['status'],
    orderIndex: Number(row.orderIndex ?? row.order_index ?? 0),
    locked: Boolean(row.locked ?? false),
    requiresApproval: Boolean(row.requiresApproval ?? row.requires_approval ?? false),
    metadata: (row.metadata as Record<string, unknown>) || {},
    startedAt: (row.startedAt as string) || (row.started_at as string) || undefined,
    finishedAt: (row.finishedAt as string) || (row.finished_at as string) || undefined,
    createdAt: (row.createdAt as string) || (row.created_at as string),
    updatedAt: (row.updatedAt as string) || (row.updated_at as string),
  };
}

function mapAgentToolCall(row: Record<string, unknown>): IAgentToolCall {
  const exitCodeRaw = row.exitCode ?? row.exit_code;
  const durationRaw = row.durationMs ?? row.duration_ms;
  return {
    id: row.id as string,
    sessionId: (row.sessionId as string) || (row.session_id as string),
    taskId: (row.taskId as string) || (row.task_id as string) || undefined,
    workspaceId: (row.workspaceId as string) || (row.workspace_id as string) || undefined,
    toolName: String(row.toolName || row.tool_name || ''),
    toolCategory:
      ((row.toolCategory as IAgentToolCall['toolCategory']) ||
        (row.tool_category as IAgentToolCall['toolCategory']) ||
        'other'),
    status: row.status as IAgentToolCall['status'],
    approvalStatus:
      ((row.approvalStatus as IAgentToolCall['approvalStatus']) ||
        (row.approval_status as IAgentToolCall['approvalStatus']) ||
        'not_required'),
    riskLevel:
      ((row.riskLevel as IAgentToolCall['riskLevel']) ||
        (row.risk_level as IAgentToolCall['riskLevel']) ||
        'low'),
    inputSummary: String(row.inputSummary || row.input_summary || ''),
    outputSummary: (row.outputSummary as string) || (row.output_summary as string) || undefined,
    command: (row.command as string) || undefined,
    exitCode: exitCodeRaw != null ? Number(exitCodeRaw) : undefined,
    durationMs: durationRaw != null ? Number(durationRaw) : undefined,
    metadata: (row.metadata as Record<string, unknown>) || {},
    startedAt: (row.startedAt as string) || (row.started_at as string) || undefined,
    finishedAt: (row.finishedAt as string) || (row.finished_at as string) || undefined,
    createdAt: (row.createdAt as string) || (row.created_at as string),
    updatedAt: (row.updatedAt as string) || (row.updated_at as string),
  };
}

function mapAgentWorkspace(row: Record<string, unknown>): IAgentWorkspace {
  return {
    id: row.id as string,
    sessionId: (row.sessionId as string) || (row.session_id as string),
    pipelineRunId: (row.pipelineRunId as string) || (row.pipeline_run_id as string) || undefined,
    kind: row.kind as IAgentWorkspace['kind'],
    status: row.status as IAgentWorkspace['status'],
    repoUrl: String(row.repoUrl || row.repo_url || ''),
    baseBranch: String(row.baseBranch || row.base_branch || ''),
    agentBranch: String(row.agentBranch || row.agent_branch || ''),
    worktreePath: (row.worktreePath as string) || (row.worktree_path as string) || undefined,
    baseCommit: (row.baseCommit as string) || (row.base_commit as string) || undefined,
    headCommit: (row.headCommit as string) || (row.head_commit as string) || undefined,
    lockOwnerTaskId:
      (row.lockOwnerTaskId as string) || (row.lock_owner_task_id as string) || undefined,
    isWriteLocked: Boolean(row.isWriteLocked ?? row.is_write_locked ?? false),
    metadata: (row.metadata as Record<string, unknown>) || {},
    createdAt: (row.createdAt as string) || (row.created_at as string),
    updatedAt: (row.updatedAt as string) || (row.updated_at as string),
    cleanedAt: (row.cleanedAt as string) || (row.cleaned_at as string) || undefined,
  };
}

function mapAgentWorkspaceProvisionResult(row: Record<string, unknown>): IAgentWorkspaceProvisionResult {
  const toolCalls = Array.isArray(row.toolCalls) ? row.toolCalls : [];
  return {
    workspace: mapAgentWorkspace(row.workspace as Record<string, unknown>),
    plan: row.plan as IAgentWorkspaceProvisionResult['plan'],
    toolCalls: toolCalls.map((toolCall) => mapAgentToolCall(toolCall as Record<string, unknown>)),
  };
}

function mapContextPack(row: Record<string, unknown>): IContextPack {
  return {
    id: row.id as string,
    requirementId: (row.requirementId as string) || (row.requirement_id as string),
    prdId: (row.prdId as string) || (row.prd_id as string) || undefined,
    specId: (row.specId as string) || (row.spec_id as string) || undefined,
    pipelineRunId: (row.pipelineRunId as string) || (row.pipeline_run_id as string) || undefined,
    version: Number(row.version ?? 1),
    checksum: String(row.checksum || ''),
    manifest: (row.manifest as IContextPack['manifest']) || {
      requirementId: '',
      generatedAt: '',
      sources: {},
      files: [],
    },
    content: (row.content as IContextPack['content']) || {},
    createdAt: (row.createdAt as string) || (row.created_at as string),
    createdBy: (row.createdBy as string) || (row.created_by as string) || undefined,
  };
}
