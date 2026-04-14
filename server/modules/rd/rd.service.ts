import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { DRIZZLE_DATABASE } from '../../database/database.constants';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

import {
  SEED_ACCEPTANCE,
  SEED_ORG_SPEC_CONFIG,
  SEED_PRDS,
  SEED_REQUIREMENTS,
  SEED_SPECS,
} from './seed-data';

export type RequirementStatus =
  | 'backlog'
  | 'prd_writing'
  | 'spec_defining'
  | 'ai_developing'
  | 'pending_acceptance'
  | 'released';

/** 任务接受记录（金币在需求验收通过/已发布后生效） */
export interface ITaskAcceptanceRecord {
  id: string;
  role: 'pm' | 'tm';
  userId: string;
  userName?: string;
  coins: number;
  acceptedAt: string;
}

export interface IRequirementRow {
  id: string;
  title: string;
  description: string;
  sketchUrl?: string | null;
  /** 所属产品 */
  product?: string | null;
  /** 金币总数（提交人设定，在 PM/TM 间拆分） */
  bountyPoints: number;
  /** 产品经理对应金币份额 */
  pmCoins: number;
  /** 技术经理对应金币份额 */
  tmCoins: number;
  /** 可选：仅该用户可领取产品经理任务 */
  pmCandidateUserId?: string | null;
  /** 可选：仅该用户可领取技术经理任务 */
  tmCandidateUserId?: string | null;
  /** 领取记录 */
  taskAcceptances: ITaskAcceptanceRecord[];
  priority: string;
  expectedDate: string;
  status: RequirementStatus;
  submitter: string;
  pm?: string | null;
  tm?: string | null;
  submitterName?: string | null;
  aiCategory?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export function splitBountyToRoleCoins(bounty: number): { pmCoins: number; tmCoins: number } {
  const b = Math.max(0, Math.floor(Number(bounty)));
  const pmCoins = Math.floor(b / 2);
  const tmCoins = b - pmCoins;
  return { pmCoins, tmCoins };
}

export interface IFeature {
  id: string;
  name: string;
  description: string;
  acceptanceCriteria: string[];
}

export interface IReviewRecord {
  id: string;
  reviewer: string;
  action: 'submit' | 'approved' | 'rejected';
  comment?: string;
  createdAt: string;
}

export interface IPrdRow {
  id: string;
  requirementId: string;
  title?: string | null;
  background: string;
  objectives: string;
  flowchart?: string | null;
  featureList: IFeature[];
  nonFunctional: string;
  status: 'draft' | 'reviewing' | 'approved' | 'rejected';
  version: number;
  author?: string | null;
  createdAt: string;
  updatedAt: string;
  reviews?: IReviewRecord[];
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface IApiDef {
  path: string;
  method: string;
  description: string;
  requestParams: object;
  response: object;
}

export interface IUIComponent {
  name: string;
  type: string;
  props: object;
  events: string[];
}

export interface IInteraction {
  trigger: string;
  action: string;
  condition?: string;
}

export interface ISpecRow {
  id: string;
  prdId: string;
  fsMarkdown?: string | null;
  tsMarkdown?: string | null;
  functionalSpec: {
    apis: IApiDef[];
    uiComponents: IUIComponent[];
    interactions: IInteraction[];
  };
  technicalSpec: {
    databaseSchema: object;
    architecture: string;
    thirdPartyIntegrations: string[];
  };
  machineReadableJson: string;
  status: 'draft' | 'reviewing' | 'approved';
  createdAt: string;
  updatedAt: string;
  reviews?: IReviewRecord[];
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface IAcceptanceRecordRow {
  id: string;
  requirementId: string;
  reviewer: string;
  scores: { functionality: number; valueMatch: number; experience: number };
  feedback: string;
  result: 'approved' | 'rejected';
  status: 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export type PipelineTaskStatus =
  | 'code_generating'
  | 'self_testing'
  | 'building'
  | 'deploying'
  | 'completed'
  | 'failed';

export interface IPipelineLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface IPipelineTestCase {
  name: string;
  status: 'passed' | 'failed';
  duration: string;
  error?: string;
}

export interface IPipelineTestReport {
  total: number;
  passed: number;
  failed: number;
  coverage: number;
  details: IPipelineTestCase[];
}

export interface IPipelineQualityMetrics {
  specConsistency: number;
  apiCoverage: number;
  codeQuality: number;
  testPassRate: number;
}

export interface IPipelinePublishedDocument {
  path: string;
  kind: 'prd' | 'fs' | 'ts';
  id: string;
  title: string;
}

export interface IPipelineMeta {
  name?: string;
  gitUrl?: string;
  sandboxUrl?: string;
  branch?: string;
  triggerMode?: 'manual' | 'push' | 'schedule';
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  remarks?: string;
  prdIds?: string[];
  specIds?: string[];
  publishedDocuments?: IPipelinePublishedDocument[];
}

export interface IGitCommitRecord {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface IPipelineCommitStore {
  pipelineName: string;
  gitUrl: string;
  branch: string;
  records: IGitCommitRecord[];
  updatedAt: string;
}

export interface IPipelineTaskRow {
  id: string;
  requirementId: string;
  requirementTitle: string;
  status: PipelineTaskStatus;
  progress: number;
  stage: string;
  startTime: string;
  estimatedEndTime: string;
  logs: IPipelineLogEntry[];
  testReport?: IPipelineTestReport | null;
  qualityMetrics?: IPipelineQualityMetrics | null;
  pipelineMeta: IPipelineMeta;
  commitStore?: IPipelineCommitStore | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

/** 产品目录（与需求「所属产品」可同名关联，此处存结构化元数据） */
export interface IProductRow {
  id: string;
  name: string;
  description: string;
  owner?: string | null;
  sandboxUrl?: string | null;
  productionUrl?: string | null;
  gitUrl?: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

@Injectable()
export class RdService implements OnModuleInit {
  private readonly logger = new Logger(RdService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  /** postgres-js 查询结果为继承 Array 的 RowList；部分驱动为 `{ rows }`，需统一解析。 */
  private rowsFromExecute<T extends Record<string, unknown>>(result: unknown): T[] {
    if (Array.isArray(result)) {
      return result as T[];
    }
    const r = result as { rows?: T[] };
    return r.rows ?? [];
  }

  /** 用于 INSERT/UPDATE 的可空 JSONB 片段（PostgreSQL 字面量） */
  private jsonbSql(value: unknown) {
    if (value === undefined || value === null) {
      return sql.raw('NULL::jsonb');
    }
    return sql.raw(`'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`);
  }

  async onModuleInit() {
    await this.ensureTables();
    await this.ensureCommonAuditColumns();
    await this.ensureProductSchemaUpgrade();
    await this.ensureRequirementExtraColumns();
    await this.ensureDatapaasRoleGrants();
    await this.seedIfEmpty();
  }

  /**
   * DataPaas 的 SqlExecutionContextMiddleware 会在 HTTP 请求里执行
   * `SET LOCAL ROLE 'anon_<schema>'` / `authenticated_*` / `service_role_*`。
   * 表由超级用户/owner 创建后，这些角色默认无权限，会报 42501，导致前端读不到数据。
   * 启动时（无 HTTP 上下文、不切换 ROLE）以 owner 身份补授权。
   */
  private async ensureDatapaasRoleGrants(): Promise<void> {
    try {
      await this.db.execute(sql`
        GRANT USAGE ON SCHEMA public TO anon_, authenticated_, service_role_;
      `);
      await this.db.execute(sql`
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon_, authenticated_, service_role_;
      `);
      await this.db.execute(sql`
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon_, authenticated_, service_role_;
      `);
      await this.db.execute(sql`
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon_, authenticated_, service_role_;
      `);
    } catch (e) {
      this.logger.warn(
        `未能为 DataPaas 角色授予 public 表权限（若无 anon_ 等角色可忽略）: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async seedIfEmpty() {
    const cnt = await this.db.execute(sql`SELECT count(*)::int AS c FROM rd_requirements;`);
    const rows = this.rowsFromExecute<{ c: number }>(cnt);
    if (Number(rows[0]?.c ?? 0) > 0) {
      return;
    }
    this.logger.log('初次启动：写入 RD 演示数据到 PostgreSQL');
    for (const r of SEED_REQUIREMENTS) {
      await this.upsertRequirement(r);
    }
    for (const p of SEED_PRDS) {
      await this.upsertPrd(p);
    }
    for (const s of SEED_SPECS) {
      await this.upsertSpec(s);
    }
    await this.saveOrgSpecConfig(SEED_ORG_SPEC_CONFIG);
    for (const a of SEED_ACCEPTANCE) {
      await this.addAcceptanceRecord(a);
    }
  }

  private async ensureTables() {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_requirements (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        sketch_url TEXT,
        priority TEXT NOT NULL,
        expected_date TEXT NOT NULL,
        status TEXT NOT NULL,
        submitter TEXT NOT NULL,
        pm TEXT,
        tm TEXT,
        submitter_name TEXT,
        ai_category TEXT,
        product TEXT,
        bounty_points INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_prds (
        id TEXT PRIMARY KEY,
        requirement_id TEXT NOT NULL REFERENCES rd_requirements(id) ON DELETE CASCADE,
        title TEXT,
        background TEXT NOT NULL DEFAULT '',
        objectives TEXT NOT NULL DEFAULT '',
        flowchart TEXT,
        feature_list JSONB NOT NULL DEFAULT '[]'::jsonb,
        non_functional TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        version INT NOT NULL DEFAULT 1,
        author TEXT,
        reviews JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_specs (
        id TEXT PRIMARY KEY,
        prd_id TEXT NOT NULL REFERENCES rd_prds(id) ON DELETE CASCADE,
        fs_markdown TEXT,
        ts_markdown TEXT,
        functional_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
        technical_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
        machine_readable_json TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        reviews JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_org_spec_config (
        id TEXT PRIMARY KEY,
        config JSONB NOT NULL
      );
    `);
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_acceptance_records (
        id TEXT PRIMARY KEY,
        requirement_id TEXT NOT NULL REFERENCES rd_requirements(id) ON DELETE CASCADE,
        reviewer TEXT NOT NULL,
        scores JSONB NOT NULL,
        feedback TEXT NOT NULL DEFAULT '',
        result TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_pipeline_tasks (
        id TEXT PRIMARY KEY,
        requirement_id TEXT NOT NULL REFERENCES rd_requirements(id) ON DELETE CASCADE,
        requirement_title TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INT NOT NULL DEFAULT 0,
        stage TEXT NOT NULL,
        start_time TEXT NOT NULL,
        estimated_end_time TEXT NOT NULL,
        logs JSONB NOT NULL DEFAULT '[]'::jsonb,
        test_report JSONB,
        quality_metrics JSONB,
        pipeline_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        commit_store JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        owner TEXT,
        sandbox_url TEXT,
        production_url TEXT,
        git_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  /** 已有库升级：各表补充 created_by / updated_by 等通用审计字段 */
  private async ensureCommonAuditColumns(): Promise<void> {
    await this.db.execute(sql`
      ALTER TABLE rd_requirements ADD COLUMN IF NOT EXISTS created_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_requirements ADD COLUMN IF NOT EXISTS updated_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_prds ADD COLUMN IF NOT EXISTS created_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_prds ADD COLUMN IF NOT EXISTS updated_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_specs ADD COLUMN IF NOT EXISTS created_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_specs ADD COLUMN IF NOT EXISTS updated_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_pipeline_tasks ADD COLUMN IF NOT EXISTS created_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_pipeline_tasks ADD COLUMN IF NOT EXISTS updated_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_products ADD COLUMN IF NOT EXISTS created_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_products ADD COLUMN IF NOT EXISTS updated_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_acceptance_records ADD COLUMN IF NOT EXISTS created_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_acceptance_records ADD COLUMN IF NOT EXISTS updated_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_acceptance_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_acceptance_records ADD COLUMN IF NOT EXISTS status TEXT;
    `);

    await this.db.execute(sql`
      UPDATE rd_acceptance_records SET updated_at = created_at WHERE updated_at IS NULL;
    `);
    await this.db.execute(sql`
      UPDATE rd_acceptance_records SET status = result WHERE status IS NULL OR status = '';
    `);

    await this.db.execute(sql`
      UPDATE rd_requirements SET created_by = submitter WHERE created_by IS NULL AND submitter IS NOT NULL;
    `);
    await this.db.execute(sql`
      UPDATE rd_requirements
      SET updated_by = COALESCE(pm, tm, submitter)
      WHERE updated_by IS NULL;
    `);
    await this.db.execute(sql`
      UPDATE rd_prds SET created_by = author WHERE created_by IS NULL AND author IS NOT NULL;
    `);
    await this.db.execute(sql`
      UPDATE rd_prds SET updated_by = author WHERE updated_by IS NULL AND author IS NOT NULL;
    `);
    await this.db.execute(sql`
      UPDATE rd_specs SET updated_by = created_by WHERE updated_by IS NULL AND created_by IS NOT NULL;
    `);
    await this.db.execute(sql`
      UPDATE rd_pipeline_tasks SET updated_by = created_by WHERE updated_by IS NULL AND created_by IS NOT NULL;
    `);
    await this.db.execute(sql`
      UPDATE rd_products
      SET updated_by = COALESCE(owner, created_by)
      WHERE updated_by IS NULL;
    `);
    await this.db.execute(sql`
      UPDATE rd_acceptance_records SET created_by = reviewer WHERE created_by IS NULL AND reviewer IS NOT NULL;
    `);
    await this.db.execute(sql`
      UPDATE rd_acceptance_records
      SET updated_by = COALESCE(reviewer, created_by)
      WHERE updated_by IS NULL;
    `);
    await this.db.execute(sql`
      UPDATE rd_acceptance_records SET updated_at = created_at WHERE updated_at IS NULL;
    `);
  }

  /** 已有库升级：补充需求表字段 */
  private async ensureRequirementExtraColumns(): Promise<void> {
    await this.db.execute(sql`
      ALTER TABLE rd_requirements ADD COLUMN IF NOT EXISTS product TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_requirements ADD COLUMN IF NOT EXISTS bounty_points INT NOT NULL DEFAULT 0;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_requirements ADD COLUMN IF NOT EXISTS pm_coins INT NOT NULL DEFAULT 0;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_requirements ADD COLUMN IF NOT EXISTS tm_coins INT NOT NULL DEFAULT 0;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_requirements ADD COLUMN IF NOT EXISTS pm_candidate_user_id TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_requirements ADD COLUMN IF NOT EXISTS tm_candidate_user_id TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_requirements ADD COLUMN IF NOT EXISTS task_acceptances JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    await this.db.execute(sql`
      UPDATE rd_requirements
      SET
        pm_coins = (bounty_points / 2),
        tm_coins = bounty_points - (bounty_points / 2)
      WHERE bounty_points > 0 AND pm_coins = 0 AND tm_coins = 0;
    `);
  }

  /** 移除历史版本中的 extras 列（若存在） */
  private async ensureProductSchemaUpgrade(): Promise<void> {
    try {
      await this.db.execute(sql`
        ALTER TABLE rd_products DROP COLUMN IF EXISTS extras;
      `);
    } catch (e) {
      this.logger.warn(
        `rd_products 结构升级跳过: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private toIso(value: unknown): string {
    if (value == null) return new Date().toISOString();
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? new Date().toISOString() : value.toISOString();
    }
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  /** 兼容 snake_case / camelCase（不同驱动或序列化层可能混用） */
  private tsFromRow(r: Record<string, unknown>): { createdAt: string; updatedAt: string } {
    const createdRaw = r.created_at ?? r.createdAt;
    const updatedRaw = r.updated_at ?? r.updatedAt;
    return {
      createdAt: this.toIso(createdRaw),
      updatedAt: this.toIso(updatedRaw),
    };
  }

  private parseTaskAcceptances(raw: unknown): ITaskAcceptanceRecord[] {
    if (Array.isArray(raw)) {
      return raw as ITaskAcceptanceRecord[];
    }
    if (typeof raw === 'string') {
      try {
        const p = JSON.parse(raw) as unknown;
        return Array.isArray(p) ? (p as ITaskAcceptanceRecord[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private rowToRequirement(r: Record<string, unknown>): IRequirementRow {
    const t = this.tsFromRow(r);
    const bountyRaw = r.bounty_points ?? r.bountyPoints;
    const bountyNum = bountyRaw == null ? 0 : Number(bountyRaw);
    const bountyPoints = Number.isFinite(bountyNum) ? Math.max(0, Math.floor(bountyNum)) : 0;
    let pmCoins = Number(r.pm_coins ?? r.pmCoins ?? 0);
    let tmCoins = Number(r.tm_coins ?? r.tmCoins ?? 0);
    if (!Number.isFinite(pmCoins)) pmCoins = 0;
    if (!Number.isFinite(tmCoins)) tmCoins = 0;
    if (pmCoins === 0 && tmCoins === 0 && bountyPoints > 0) {
      const s = splitBountyToRoleCoins(bountyPoints);
      pmCoins = s.pmCoins;
      tmCoins = s.tmCoins;
    }
    return {
      id: r.id as string,
      title: r.title as string,
      description: (r.description as string) || '',
      sketchUrl: (r.sketch_url as string) || (r.sketchUrl as string) || undefined,
      product: (r.product as string) || undefined,
      bountyPoints,
      pmCoins,
      tmCoins,
      pmCandidateUserId: (r.pm_candidate_user_id as string) || (r.pmCandidateUserId as string) || undefined,
      tmCandidateUserId: (r.tm_candidate_user_id as string) || (r.tmCandidateUserId as string) || undefined,
      taskAcceptances: this.parseTaskAcceptances(r.task_acceptances ?? r.taskAcceptances),
      priority: r.priority as string,
      expectedDate: ((r.expected_date as string) || (r.expectedDate as string)) ?? '',
      status: r.status as RequirementStatus,
      submitter: r.submitter as string,
      pm: (r.pm as string) || undefined,
      tm: (r.tm as string) || undefined,
      submitterName: (r.submitter_name as string) || (r.submitterName as string) || undefined,
      aiCategory: (r.ai_category as string) || (r.aiCategory as string) || undefined,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      createdBy: (r.created_by as string) || (r.createdBy as string) || undefined,
      updatedBy: (r.updated_by as string) || (r.updatedBy as string) || undefined,
    };
  }

  private rowToPrd(r: Record<string, unknown>): IPrdRow {
    const t = this.tsFromRow(r);
    return {
      id: r.id as string,
      requirementId: r.requirement_id as string,
      title: (r.title as string) || undefined,
      background: (r.background as string) || '',
      objectives: (r.objectives as string) || '',
      flowchart: (r.flowchart as string) || undefined,
      featureList: (r.feature_list as IFeature[]) || [],
      nonFunctional: (r.non_functional as string) || '',
      status: r.status as IPrdRow['status'],
      version: Number(r.version),
      author: (r.author as string) || undefined,
      reviews: (r.reviews as IReviewRecord[]) || [],
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      createdBy: (r.created_by as string) || (r.createdBy as string) || undefined,
      updatedBy: (r.updated_by as string) || (r.updatedBy as string) || undefined,
    };
  }

  private rowToPipelineTask(r: Record<string, unknown>): IPipelineTaskRow {
    const t = this.tsFromRow(r);
    const logs = (r.logs as IPipelineLogEntry[]) || [];
    const testReport = (r.test_report as IPipelineTestReport | null) ?? (r.testReport as IPipelineTestReport | null);
    const qualityMetrics =
      (r.quality_metrics as IPipelineQualityMetrics | null) ?? (r.qualityMetrics as IPipelineQualityMetrics | null);
    const pipelineMeta =
      (r.pipeline_meta as IPipelineMeta) || (r.pipelineMeta as IPipelineMeta) || {};
    const commitStore =
      (r.commit_store as IPipelineCommitStore | null) ?? (r.commitStore as IPipelineCommitStore | null);
    return {
      id: r.id as string,
      requirementId: (r.requirement_id as string) || (r.requirementId as string),
      requirementTitle: (r.requirement_title as string) || (r.requirementTitle as string),
      status: r.status as PipelineTaskStatus,
      progress: Number(r.progress ?? 0),
      stage: (r.stage as string) || '',
      startTime: (r.start_time as string) || (r.startTime as string) || '',
      estimatedEndTime: (r.estimated_end_time as string) || (r.estimatedEndTime as string) || '',
      logs,
      testReport: testReport ?? undefined,
      qualityMetrics: qualityMetrics ?? undefined,
      pipelineMeta,
      commitStore: commitStore ?? undefined,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      createdBy: (r.created_by as string) || (r.createdBy as string) || undefined,
      updatedBy: (r.updated_by as string) || (r.updatedBy as string) || undefined,
    };
  }

  private rowToSpec(r: Record<string, unknown>): ISpecRow {
    const t = this.tsFromRow(r);
    const fs = (r.functional_spec as ISpecRow['functionalSpec']) || {
      apis: [],
      uiComponents: [],
      interactions: [],
    };
    const tsSpec = (r.technical_spec as ISpecRow['technicalSpec']) || {
      databaseSchema: {},
      architecture: '',
      thirdPartyIntegrations: [],
    };
    return {
      id: r.id as string,
      prdId: r.prd_id as string,
      fsMarkdown: (r.fs_markdown as string) || undefined,
      tsMarkdown: (r.ts_markdown as string) || undefined,
      functionalSpec: fs,
      technicalSpec: tsSpec,
      machineReadableJson: (r.machine_readable_json as string) || '',
      status: r.status as ISpecRow['status'],
      reviews: (r.reviews as IReviewRecord[]) || [],
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      createdBy: (r.created_by as string) || (r.createdBy as string) || undefined,
      updatedBy: (r.updated_by as string) || (r.updatedBy as string) || undefined,
    };
  }

  private rowToProduct(r: Record<string, unknown>): IProductRow {
    const t = this.tsFromRow(r);
    const st = (r.status as string) || 'active';
    const status: IProductRow['status'] = st === 'archived' ? 'archived' : 'active';
    return {
      id: r.id as string,
      name: (r.name as string) || '',
      description: (r.description as string) || '',
      owner: (r.owner as string) || null,
      sandboxUrl: (r.sandbox_url as string) || (r.sandboxUrl as string) || null,
      productionUrl: (r.production_url as string) || (r.productionUrl as string) || null,
      gitUrl: (r.git_url as string) || (r.gitUrl as string) || null,
      status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      createdBy: (r.created_by as string) || (r.createdBy as string) || undefined,
      updatedBy: (r.updated_by as string) || (r.updatedBy as string) || undefined,
    };
  }

  async listRequirements(): Promise<IRequirementRow[]> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_requirements ORDER BY updated_at DESC;
    `);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToRequirement(row));
  }

  async getRequirement(id: string): Promise<IRequirementRow | null> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_requirements WHERE id = ${id} LIMIT 1;
    `);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToRequirement(rows[0]) : null;
  }

  async upsertRequirement(body: Partial<IRequirementRow> & { id: string }): Promise<IRequirementRow> {
    const existing = await this.getRequirement(body.id);
    const now = new Date().toISOString();
    const bountyPoints =
      body.bountyPoints !== undefined && body.bountyPoints !== null
        ? Math.max(0, Math.floor(Number(body.bountyPoints)))
        : existing?.bountyPoints ?? 0;
    const { pmCoins, tmCoins } = splitBountyToRoleCoins(bountyPoints);

    const nullIfEmpty = (v: string | null | undefined): string | null => {
      if (v == null) return null;
      const t = String(v).trim();
      return t ? t : null;
    };

    const definedBody = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined),
    ) as Partial<IRequirementRow>;

    const merged: IRequirementRow = existing
      ? {
          ...existing,
          ...definedBody,
          bountyPoints,
          pmCoins,
          tmCoins,
          product:
            body.product !== undefined
              ? nullIfEmpty(body.product as string | null)
              : existing.product ?? null,
          pmCandidateUserId:
            body.pmCandidateUserId !== undefined
              ? nullIfEmpty(body.pmCandidateUserId as string | null)
              : existing.pmCandidateUserId ?? null,
          tmCandidateUserId:
            body.tmCandidateUserId !== undefined
              ? nullIfEmpty(body.tmCandidateUserId as string | null)
              : existing.tmCandidateUserId ?? null,
          taskAcceptances:
            body.taskAcceptances !== undefined ? body.taskAcceptances : existing.taskAcceptances,
          createdAt: existing.createdAt,
          updatedAt: now,
          createdBy: existing.createdBy ?? body.createdBy ?? null,
          updatedBy: body.updatedBy !== undefined ? body.updatedBy : existing.updatedBy ?? null,
        }
      : {
          id: body.id,
          title: body.title || '',
          description: body.description || '',
          sketchUrl: body.sketchUrl,
          product: nullIfEmpty(body.product as string | null | undefined),
          bountyPoints,
          pmCoins,
          tmCoins,
          pmCandidateUserId: nullIfEmpty(body.pmCandidateUserId as string | null | undefined),
          tmCandidateUserId: nullIfEmpty(body.tmCandidateUserId as string | null | undefined),
          taskAcceptances: body.taskAcceptances ?? [],
          priority: body.priority || 'P1',
          expectedDate: body.expectedDate || now.slice(0, 10),
          status: body.status || 'backlog',
          submitter: body.submitter || '',
          pm: body.pm,
          tm: body.tm,
          submitterName: body.submitterName,
          aiCategory: body.aiCategory,
          createdAt: body.createdAt || now,
          updatedAt: body.updatedAt || now,
          createdBy: body.createdBy ?? body.updatedBy ?? body.submitter ?? null,
          updatedBy: body.updatedBy ?? body.createdBy ?? body.submitter ?? null,
        };

    await this.db.execute(sql`
      INSERT INTO rd_requirements (
        id, title, description, sketch_url, product, bounty_points, pm_coins, tm_coins,
        pm_candidate_user_id, tm_candidate_user_id, task_acceptances,
        priority, expected_date, status,
        submitter, pm, tm, submitter_name, ai_category,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        ${merged.id},
        ${merged.title},
        ${merged.description},
        ${merged.sketchUrl ?? null},
        ${merged.product ?? null},
        ${merged.bountyPoints},
        ${merged.pmCoins},
        ${merged.tmCoins},
        ${merged.pmCandidateUserId ?? null},
        ${merged.tmCandidateUserId ?? null},
        ${JSON.stringify(merged.taskAcceptances ?? [])}::jsonb,
        ${merged.priority},
        ${merged.expectedDate},
        ${merged.status},
        ${merged.submitter},
        ${merged.pm ?? null},
        ${merged.tm ?? null},
        ${merged.submitterName ?? null},
        ${merged.aiCategory ?? null},
        ${merged.createdBy ?? null},
        ${merged.updatedBy ?? null},
        ${merged.createdAt}::timestamptz,
        ${merged.updatedAt}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        sketch_url = EXCLUDED.sketch_url,
        product = EXCLUDED.product,
        bounty_points = EXCLUDED.bounty_points,
        pm_coins = EXCLUDED.pm_coins,
        tm_coins = EXCLUDED.tm_coins,
        pm_candidate_user_id = EXCLUDED.pm_candidate_user_id,
        tm_candidate_user_id = EXCLUDED.tm_candidate_user_id,
        task_acceptances = EXCLUDED.task_acceptances,
        priority = EXCLUDED.priority,
        expected_date = EXCLUDED.expected_date,
        status = EXCLUDED.status,
        submitter = EXCLUDED.submitter,
        pm = EXCLUDED.pm,
        tm = EXCLUDED.tm,
        submitter_name = EXCLUDED.submitter_name,
        ai_category = EXCLUDED.ai_category,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;
    `);
    return (await this.getRequirement(merged.id))!;
  }

  /**
   * 产品经理 / 技术经理领取任务，写入领取记录；金币在需求状态为已发布后生效。
   */
  async acceptRequirementTask(
    requirementId: string,
    body: { role: 'pm' | 'tm'; userId: string; userName?: string },
  ): Promise<IRequirementRow> {
    if (body.role !== 'pm' && body.role !== 'tm') {
      throw new BadRequestException('role 须为 pm 或 tm');
    }
    const req = await this.getRequirement(requirementId);
    if (!req) {
      throw new NotFoundException('需求不存在');
    }
    const userId = String(body.userId || '').trim();
    if (!userId) {
      throw new BadRequestException('缺少用户标识');
    }
    if (body.role === 'pm') {
      if (req.taskAcceptances.some((t) => t.role === 'pm')) {
        throw new BadRequestException('产品经理任务已被领取');
      }
      if (req.pm) {
        throw new BadRequestException('产品经理任务已被领取');
      }
      const coins = req.pmCoins;
      const record: ITaskAcceptanceRecord = {
        id: `ta_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        role: 'pm',
        userId,
        userName: body.userName,
        coins,
        acceptedAt: new Date().toISOString(),
      };
      return this.upsertRequirement({
        id: requirementId,
        pm: userId,
        taskAcceptances: [...req.taskAcceptances, record],
        updatedBy: userId,
      });
    }
    if (req.taskAcceptances.some((t) => t.role === 'tm')) {
      throw new BadRequestException('技术经理任务已被领取');
    }
    if (req.tm) {
      throw new BadRequestException('技术经理任务已被领取');
    }
    const coins = req.tmCoins;
    const record: ITaskAcceptanceRecord = {
      id: `ta_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      role: 'tm',
      userId,
      userName: body.userName,
      coins,
      acceptedAt: new Date().toISOString(),
    };
    return this.upsertRequirement({
      id: requirementId,
      tm: userId,
      taskAcceptances: [...req.taskAcceptances, record],
      updatedBy: userId,
    });
  }

  async deleteRequirement(id: string): Promise<void> {
    await this.db.execute(sql`DELETE FROM rd_requirements WHERE id = ${id};`);
  }

  async listPrds(): Promise<IPrdRow[]> {
    const result = await this.db.execute(sql`SELECT * FROM rd_prds ORDER BY updated_at DESC;`);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToPrd(row));
  }

  async getPrd(id: string): Promise<IPrdRow | null> {
    const result = await this.db.execute(sql`SELECT * FROM rd_prds WHERE id = ${id} LIMIT 1;`);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToPrd(rows[0]) : null;
  }

  async upsertPrd(body: Partial<IPrdRow> & { id: string; requirementId: string }): Promise<IPrdRow> {
    const existing = await this.getPrd(body.id);
    const now = new Date().toISOString();
    const merged: IPrdRow = existing
      ? {
          ...existing,
          ...body,
          featureList: body.featureList ?? existing.featureList,
          reviews: body.reviews ?? existing.reviews,
          createdAt: existing.createdAt,
          updatedAt: now,
          createdBy: existing.createdBy ?? body.createdBy ?? null,
          updatedBy: body.updatedBy !== undefined ? body.updatedBy : existing.updatedBy ?? null,
        }
      : {
          id: body.id,
          requirementId: body.requirementId,
          title: body.title,
          background: body.background || '',
          objectives: body.objectives || '',
          flowchart: body.flowchart,
          featureList: body.featureList || [],
          nonFunctional: body.nonFunctional || '',
          status: body.status || 'draft',
          version: body.version ?? 1,
          author: body.author,
          reviews: body.reviews || [],
          createdAt: body.createdAt || now,
          updatedAt: body.updatedAt || now,
          createdBy: body.createdBy ?? body.updatedBy ?? body.author ?? null,
          updatedBy: body.updatedBy ?? body.createdBy ?? body.author ?? null,
        };
    await this.db.execute(sql`
      INSERT INTO rd_prds (
        id, requirement_id, title, background, objectives, flowchart,
        feature_list, non_functional, status, version, author, reviews,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        ${merged.id},
        ${merged.requirementId},
        ${merged.title ?? null},
        ${merged.background},
        ${merged.objectives},
        ${merged.flowchart ?? null},
        ${JSON.stringify(merged.featureList)}::jsonb,
        ${merged.nonFunctional},
        ${merged.status},
        ${merged.version},
        ${merged.author ?? null},
        ${JSON.stringify(merged.reviews || [])}::jsonb,
        ${merged.createdBy ?? null},
        ${merged.updatedBy ?? null},
        ${merged.createdAt}::timestamptz,
        ${merged.updatedAt}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        requirement_id = EXCLUDED.requirement_id,
        title = EXCLUDED.title,
        background = EXCLUDED.background,
        objectives = EXCLUDED.objectives,
        flowchart = EXCLUDED.flowchart,
        feature_list = EXCLUDED.feature_list,
        non_functional = EXCLUDED.non_functional,
        status = EXCLUDED.status,
        version = EXCLUDED.version,
        author = EXCLUDED.author,
        reviews = EXCLUDED.reviews,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;
    `);
    return (await this.getPrd(merged.id))!;
  }

  async deletePrd(id: string): Promise<void> {
    await this.db.execute(sql`DELETE FROM rd_prds WHERE id = ${id};`);
  }

  async submitPrdForReview(
    prdId: string,
    reviewer = '系统',
    comment?: string,
    actorUserId?: string
  ): Promise<IPrdRow | null> {
    const prd = await this.getPrd(prdId);
    if (!prd) return null;
    const record: IReviewRecord = {
      id: `rvw_prd_submit_${Date.now()}`,
      reviewer,
      action: 'submit',
      comment,
      createdAt: new Date().toISOString(),
    };
    const actor = actorUserId?.trim() || reviewer;
    return this.upsertPrd({
      ...prd,
      status: 'reviewing',
      reviews: [...(prd.reviews || []), record],
      updatedBy: actor,
    });
  }

  async reviewPrd(
    prdId: string,
    status: 'approved' | 'rejected',
    reviewer = '审核人',
    comment?: string,
    actorUserId?: string
  ): Promise<IPrdRow | null> {
    const prd = await this.getPrd(prdId);
    if (!prd) return null;
    const record: IReviewRecord = {
      id: `rvw_prd_${status}_${Date.now()}`,
      reviewer,
      action: status,
      comment,
      createdAt: new Date().toISOString(),
    };
    const actor = actorUserId?.trim() || reviewer;
    const next = await this.upsertPrd({
      ...prd,
      status,
      reviews: [...(prd.reviews || []), record],
      updatedBy: actor,
    });
    if (status === 'approved') {
      await this.upsertRequirement({
        id: prd.requirementId,
        status: 'spec_defining',
        updatedBy: actor,
      });
    }
    return next;
  }

  async listSpecs(): Promise<ISpecRow[]> {
    const result = await this.db.execute(sql`SELECT * FROM rd_specs ORDER BY updated_at DESC;`);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToSpec(row));
  }

  async getSpec(id: string): Promise<ISpecRow | null> {
    const result = await this.db.execute(sql`SELECT * FROM rd_specs WHERE id = ${id} LIMIT 1;`);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToSpec(rows[0]) : null;
  }

  async upsertSpec(body: Partial<ISpecRow> & { id: string; prdId: string }): Promise<ISpecRow> {
    const existing = await this.getSpec(body.id);
    const now = new Date().toISOString();
    const merged: ISpecRow = existing
      ? {
          ...existing,
          ...body,
          functionalSpec: body.functionalSpec ?? existing.functionalSpec,
          technicalSpec: body.technicalSpec ?? existing.technicalSpec,
          reviews: body.reviews ?? existing.reviews,
          createdAt: existing.createdAt,
          updatedAt: now,
          createdBy: existing.createdBy ?? body.createdBy ?? null,
          updatedBy: body.updatedBy !== undefined ? body.updatedBy : existing.updatedBy ?? null,
        }
      : {
          id: body.id,
          prdId: body.prdId,
          fsMarkdown: body.fsMarkdown,
          tsMarkdown: body.tsMarkdown,
          functionalSpec: body.functionalSpec || { apis: [], uiComponents: [], interactions: [] },
          technicalSpec: body.technicalSpec || {
            databaseSchema: {},
            architecture: '',
            thirdPartyIntegrations: [],
          },
          machineReadableJson: body.machineReadableJson || '',
          status: body.status || 'draft',
          reviews: body.reviews || [],
          createdAt: body.createdAt || now,
          updatedAt: body.updatedAt || now,
          createdBy: body.createdBy ?? body.updatedBy ?? null,
          updatedBy: body.updatedBy ?? body.createdBy ?? null,
        };
    await this.db.execute(sql`
      INSERT INTO rd_specs (
        id, prd_id, fs_markdown, ts_markdown, functional_spec, technical_spec,
        machine_readable_json, status, reviews,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        ${merged.id},
        ${merged.prdId},
        ${merged.fsMarkdown ?? null},
        ${merged.tsMarkdown ?? null},
        ${JSON.stringify(merged.functionalSpec)}::jsonb,
        ${JSON.stringify(merged.technicalSpec)}::jsonb,
        ${merged.machineReadableJson},
        ${merged.status},
        ${JSON.stringify(merged.reviews || [])}::jsonb,
        ${merged.createdBy ?? null},
        ${merged.updatedBy ?? null},
        ${merged.createdAt}::timestamptz,
        ${merged.updatedAt}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        prd_id = EXCLUDED.prd_id,
        fs_markdown = EXCLUDED.fs_markdown,
        ts_markdown = EXCLUDED.ts_markdown,
        functional_spec = EXCLUDED.functional_spec,
        technical_spec = EXCLUDED.technical_spec,
        machine_readable_json = EXCLUDED.machine_readable_json,
        status = EXCLUDED.status,
        reviews = EXCLUDED.reviews,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;
    `);
    return (await this.getSpec(merged.id))!;
  }

  async deleteSpec(id: string): Promise<void> {
    await this.db.execute(sql`DELETE FROM rd_specs WHERE id = ${id};`);
  }

  async submitSpecForReview(
    specId: string,
    reviewer = '系统',
    comment?: string,
    actorUserId?: string
  ): Promise<ISpecRow | null> {
    const spec = await this.getSpec(specId);
    if (!spec) return null;
    const record: IReviewRecord = {
      id: `rvw_spec_submit_${Date.now()}`,
      reviewer,
      action: 'submit',
      comment,
      createdAt: new Date().toISOString(),
    };
    const actor = actorUserId?.trim() || reviewer;
    return this.upsertSpec({
      ...spec,
      status: 'reviewing',
      reviews: [...(spec.reviews || []), record],
      updatedBy: actor,
    });
  }

  async approveSpec(
    specId: string,
    reviewer = '审核人',
    comment?: string,
    actorUserId?: string
  ): Promise<ISpecRow | null> {
    const spec = await this.getSpec(specId);
    if (!spec) return null;
    const record: IReviewRecord = {
      id: `rvw_spec_approved_${Date.now()}`,
      reviewer,
      action: 'approved',
      comment,
      createdAt: new Date().toISOString(),
    };
    const actor = actorUserId?.trim() || reviewer;
    const next = await this.upsertSpec({
      ...spec,
      status: 'approved',
      reviews: [...(spec.reviews || []), record],
      updatedBy: actor,
    });
    const prd = await this.getPrd(spec.prdId);
    if (prd) {
      await this.upsertRequirement({ id: prd.requirementId, status: 'ai_developing', updatedBy: actor });
    }
    return next;
  }

  async rejectSpec(
    specId: string,
    reviewer = '审核人',
    comment?: string,
    actorUserId?: string
  ): Promise<ISpecRow | null> {
    const spec = await this.getSpec(specId);
    if (!spec) return null;
    const record: IReviewRecord = {
      id: `rvw_spec_rejected_${Date.now()}`,
      reviewer,
      action: 'rejected',
      comment,
      createdAt: new Date().toISOString(),
    };
    const actor = actorUserId?.trim() || reviewer;
    return this.upsertSpec({
      ...spec,
      status: 'draft',
      reviews: [...(spec.reviews || []), record],
      updatedBy: actor,
    });
  }

  async getOrgSpecConfig(): Promise<unknown | null> {
    const result = await this.db.execute(sql`
      SELECT config FROM rd_org_spec_config WHERE id = 'org-spec-default' LIMIT 1;
    `);
    const rows = this.rowsFromExecute<{ config?: unknown }>(result);
    return rows[0]?.config ?? null;
  }

  async saveOrgSpecConfig(config: unknown): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO rd_org_spec_config (id, config)
      VALUES ('org-spec-default', ${JSON.stringify(config)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config;
    `);
  }

  async listAcceptanceRecords(): Promise<IAcceptanceRecordRow[]> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_acceptance_records ORDER BY created_at DESC;
    `);
    const rows = this.rowsFromExecute(result);
    return rows.map((r) => {
      const result = r.result as IAcceptanceRecordRow['result'];
      const statusRaw = (r.status as string) || result;
      const status: IAcceptanceRecordRow['status'] =
        statusRaw === 'rejected' ? 'rejected' : 'approved';
      return {
        id: r.id as string,
        requirementId: (r.requirement_id as string) || (r.requirementId as string),
        reviewer: r.reviewer as string,
        scores: r.scores as IAcceptanceRecordRow['scores'],
        feedback: (r.feedback as string) || '',
        result,
        status,
        createdAt: this.toIso(r.created_at ?? r.createdAt),
        updatedAt: this.toIso(r.updated_at ?? r.updatedAt ?? r.created_at ?? r.createdAt),
        createdBy: (r.created_by as string) || (r.createdBy as string) || undefined,
        updatedBy: (r.updated_by as string) || (r.updatedBy as string) || undefined,
      };
    });
  }

  async addAcceptanceRecord(rec: IAcceptanceRecordRow): Promise<void> {
    const now = new Date().toISOString();
    const status = rec.status ?? rec.result;
    const updatedAt = rec.updatedAt ?? now;
    const createdBy = rec.createdBy ?? rec.reviewer;
    const updatedBy = rec.updatedBy ?? rec.reviewer;
    await this.db.execute(sql`
      INSERT INTO rd_acceptance_records (
        id, requirement_id, reviewer, scores, feedback, result, status,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        ${rec.id},
        ${rec.requirementId},
        ${rec.reviewer},
        ${JSON.stringify(rec.scores)}::jsonb,
        ${rec.feedback},
        ${rec.result},
        ${status},
        ${createdBy},
        ${updatedBy},
        ${rec.createdAt}::timestamptz,
        ${updatedAt}::timestamptz
      );
    `);
  }

  async listPipelineTasks(): Promise<IPipelineTaskRow[]> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_pipeline_tasks ORDER BY updated_at DESC;
    `);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToPipelineTask(row));
  }

  async getPipelineTask(id: string): Promise<IPipelineTaskRow | null> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_pipeline_tasks WHERE id = ${id} LIMIT 1;
    `);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToPipelineTask(rows[0]) : null;
  }

  async upsertPipelineTask(
    body: Partial<IPipelineTaskRow> & { id: string; requirementId: string }
  ): Promise<IPipelineTaskRow> {
    const existing = await this.getPipelineTask(body.id);
    const now = new Date().toISOString();
    const merged: IPipelineTaskRow = existing
      ? {
          ...existing,
          ...body,
          logs: body.logs ?? existing.logs,
          pipelineMeta: body.pipelineMeta ?? existing.pipelineMeta,
          commitStore: body.commitStore !== undefined ? body.commitStore : existing.commitStore,
          testReport: body.testReport !== undefined ? body.testReport : existing.testReport,
          qualityMetrics: body.qualityMetrics !== undefined ? body.qualityMetrics : existing.qualityMetrics,
          createdAt: existing.createdAt,
          updatedAt: now,
          createdBy: existing.createdBy ?? body.createdBy ?? null,
          updatedBy: body.updatedBy !== undefined ? body.updatedBy : existing.updatedBy ?? null,
        }
      : {
          id: body.id,
          requirementId: body.requirementId,
          requirementTitle: body.requirementTitle || '',
          status: body.status || 'code_generating',
          progress: body.progress ?? 0,
          stage: body.stage || '',
          startTime: body.startTime || now,
          estimatedEndTime: body.estimatedEndTime || now,
          logs: body.logs || [],
          testReport: body.testReport,
          qualityMetrics: body.qualityMetrics,
          pipelineMeta: body.pipelineMeta || {},
          commitStore: body.commitStore,
          createdAt: body.createdAt || now,
          updatedAt: body.updatedAt || now,
          createdBy: body.createdBy ?? body.updatedBy ?? null,
          updatedBy: body.updatedBy ?? body.createdBy ?? null,
        };
    await this.db.execute(sql`
      INSERT INTO rd_pipeline_tasks (
        id, requirement_id, requirement_title, status, progress, stage,
        start_time, estimated_end_time, logs, test_report, quality_metrics,
        pipeline_meta, commit_store, created_by, updated_by, created_at, updated_at
      ) VALUES (
        ${merged.id},
        ${merged.requirementId},
        ${merged.requirementTitle},
        ${merged.status},
        ${merged.progress},
        ${merged.stage},
        ${merged.startTime},
        ${merged.estimatedEndTime},
        ${JSON.stringify(merged.logs)}::jsonb,
        ${this.jsonbSql(merged.testReport ?? null)},
        ${this.jsonbSql(merged.qualityMetrics ?? null)},
        ${JSON.stringify(merged.pipelineMeta || {})}::jsonb,
        ${this.jsonbSql(merged.commitStore ?? null)},
        ${merged.createdBy ?? null},
        ${merged.updatedBy ?? null},
        ${merged.createdAt}::timestamptz,
        ${merged.updatedAt}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        requirement_id = EXCLUDED.requirement_id,
        requirement_title = EXCLUDED.requirement_title,
        status = EXCLUDED.status,
        progress = EXCLUDED.progress,
        stage = EXCLUDED.stage,
        start_time = EXCLUDED.start_time,
        estimated_end_time = EXCLUDED.estimated_end_time,
        logs = EXCLUDED.logs,
        test_report = EXCLUDED.test_report,
        quality_metrics = EXCLUDED.quality_metrics,
        pipeline_meta = EXCLUDED.pipeline_meta,
        commit_store = EXCLUDED.commit_store,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;
    `);
    return (await this.getPipelineTask(merged.id))!;
  }

  async deletePipelineTask(id: string): Promise<void> {
    await this.db.execute(sql`DELETE FROM rd_pipeline_tasks WHERE id = ${id};`);
  }

  async listProducts(): Promise<IProductRow[]> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_products ORDER BY updated_at DESC;
    `);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToProduct(row));
  }

  async getProduct(id: string): Promise<IProductRow | null> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_products WHERE id = ${id} LIMIT 1;
    `);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToProduct(rows[0]) : null;
  }

  async upsertProduct(body: Partial<IProductRow> & { id: string }): Promise<IProductRow> {
    const existing = await this.getProduct(body.id);
    const now = new Date().toISOString();
    const nullIfEmpty = (v: string | null | undefined): string | null => {
      if (v == null) return null;
      const t = String(v).trim();
      return t ? t : null;
    };

    const merged: IProductRow = existing
      ? {
          ...existing,
          ...body,
          name: body.name !== undefined ? String(body.name) : existing.name,
          description: body.description !== undefined ? String(body.description) : existing.description,
          owner: body.owner !== undefined ? nullIfEmpty(body.owner) : existing.owner,
          sandboxUrl: body.sandboxUrl !== undefined ? nullIfEmpty(body.sandboxUrl) : existing.sandboxUrl,
          productionUrl: body.productionUrl !== undefined ? nullIfEmpty(body.productionUrl) : existing.productionUrl,
          gitUrl: body.gitUrl !== undefined ? nullIfEmpty(body.gitUrl) : existing.gitUrl,
          status: body.status !== undefined ? body.status : existing.status,
          createdAt: existing.createdAt,
          updatedAt: now,
          createdBy: existing.createdBy ?? body.createdBy ?? null,
          updatedBy: body.updatedBy !== undefined ? body.updatedBy : existing.updatedBy ?? null,
        }
      : {
          id: body.id,
          name: String(body.name || '').trim(),
          description: String(body.description ?? ''),
          owner: nullIfEmpty(body.owner),
          sandboxUrl: nullIfEmpty(body.sandboxUrl),
          productionUrl: nullIfEmpty(body.productionUrl),
          gitUrl: nullIfEmpty(body.gitUrl),
          status: body.status ?? 'active',
          createdAt: body.createdAt || now,
          updatedAt: body.updatedAt || now,
          createdBy: body.createdBy ?? body.updatedBy ?? nullIfEmpty(body.owner),
          updatedBy: body.updatedBy ?? body.createdBy ?? nullIfEmpty(body.owner),
        };

    if (!merged.name.trim()) {
      throw new BadRequestException('产品名称不能为空');
    }

    await this.db.execute(sql`
      INSERT INTO rd_products (
        id, name, description, owner, sandbox_url, production_url, git_url,
        status, created_by, updated_by, created_at, updated_at
      ) VALUES (
        ${merged.id},
        ${merged.name.trim()},
        ${merged.description},
        ${merged.owner ?? null},
        ${merged.sandboxUrl ?? null},
        ${merged.productionUrl ?? null},
        ${merged.gitUrl ?? null},
        ${merged.status},
        ${merged.createdBy ?? null},
        ${merged.updatedBy ?? null},
        ${merged.createdAt}::timestamptz,
        ${merged.updatedAt}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        owner = EXCLUDED.owner,
        sandbox_url = EXCLUDED.sandbox_url,
        production_url = EXCLUDED.production_url,
        git_url = EXCLUDED.git_url,
        status = EXCLUDED.status,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;
    `);
    return (await this.getProduct(merged.id))!;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.db.execute(sql`DELETE FROM rd_products WHERE id = ${id};`);
  }
}
