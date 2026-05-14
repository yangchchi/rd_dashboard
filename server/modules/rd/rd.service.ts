import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, type WriteStream } from 'node:fs';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve, sep } from 'node:path';
import { finished as waitStreamFinished } from 'node:stream/promises';
import { DRIZZLE_DATABASE } from '../../database/database.constants';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { DEFAULT_AI_SKILLS } from '../../../shared/ai-skill-defaults';
import {
  buildAgentWorkspaceCleanupCommand,
  buildAgentWorkspaceLifecyclePlan,
  type IAgentWorkspaceLifecyclePlan,
  type IWorkspaceLifecycleCommand,
} from '../../../shared/agent-workspace-manager';
import { resolveWorkspaceProductSlug } from '../../../shared/pipeline-workspace-path';
import { assertToolCallCanStart, prepareToolCallPolicy } from '../../../shared/agent-tool-gateway';
import { createDefaultOrgSpecConfig } from '../../../shared/org-spec-defaults';

/** 与前端 access-policy 内置角色 id 一致（rd_user_access_roles / rd_users.access_role_id 回退） */
const BUILTIN_ACCESS_ROLE_PM = 'role_pm';
const BUILTIN_ACCESS_ROLE_TM = 'role_tm';

export type RequirementStatus =
  | 'backlog'
  | 'prd_writing'
  | 'spec_defining'
  | 'ai_developing'
  | 'pending_acceptance'
  | 'released';

const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  backlog: '需求池',
  prd_writing: 'PRD编写中',
  spec_defining: '规格定义',
  ai_developing: 'AI开发中',
  pending_acceptance: '待验收',
  released: '已发布',
};

const REQUIREMENT_STATUS_TRANSITIONS: Record<RequirementStatus, RequirementStatus[]> = {
  backlog: ['prd_writing'],
  prd_writing: ['spec_defining'],
  spec_defining: ['ai_developing'],
  ai_developing: ['pending_acceptance'],
  pending_acceptance: ['released', 'prd_writing'],
  released: [],
};

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

export interface IRequirementFlowEventRow {
  id: string;
  requirementId: string;
  fromStatus?: RequirementStatus | null;
  toStatus: RequirementStatus;
  action: string;
  operator?: string | null;
  comment?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
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
  /** 编程计划（CP），Markdown，供 Cursor / Claude Code 等执行 */
  cpMarkdown?: string | null;
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
  result: 'pending' | 'approved' | 'rejected';
  status: 'pending' | 'approved' | 'rejected';
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

export interface IPipelineCodeReviewRecord {
  id: string;
  createdAt: string;
  summaryMarkdown: string;
  qualityMetrics: IPipelineQualityMetrics;
}

export interface IPipelineGeneratedTestCase {
  id: string;
  title: string;
  basis: Array<'fs' | 'ts' | 'code'>;
  trace: string;
  steps: string;
  expected: string;
  relatedApiPath?: string;
}

export interface IPipelineTestRunRecord {
  id: string;
  createdAt: string;
  testReport: IPipelineTestReport;
  caseIds: string[];
  note?: string;
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
  /** Agent worktree 第一层目录，与产品 identifier 对齐，如 ai-generation */
  workspaceProductSlug?: string;
  /** 与仓库 docs/{该名} 一致，本会话/需求文档目录唯一标识 */
  workspaceSessionFolder?: string;
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
  codeReviewHistory?: IPipelineCodeReviewRecord[] | null;
  generatedTestCases?: IPipelineGeneratedTestCase[] | null;
  testRunHistory?: IPipelineTestRunRecord[] | null;
  pipelineMeta: IPipelineMeta;
  commitStore?: IPipelineCommitStore | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export type PipelineRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type PipelineStepRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface IPipelineRunRow {
  id: string;
  pipelineTaskId?: string | null;
  requirementId: string;
  status: PipelineRunStatus;
  triggerMode: 'manual' | 'push' | 'schedule' | 'agent';
  contextSnapshot: Record<string, unknown>;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface IPipelineStepRunRow {
  id: string;
  pipelineRunId: string;
  stepKey: string;
  name: string;
  status: PipelineStepRunStatus;
  orderIndex: number;
  inputRef?: string | null;
  outputRef?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AgentSessionStatus =
  | 'draft'
  | 'planning'
  | 'awaiting_approval'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type AgentTaskRole = 'planner' | 'coder' | 'tester' | 'reviewer' | 'deployer' | 'integrator';
export type AgentTaskStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'blocked'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
export type AgentToolCallStatus =
  | 'pending'
  | 'awaiting_approval'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
export type AgentToolApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';
export type AgentRiskLevel = 'low' | 'medium' | 'high';
export type AgentWorkspaceKind = 'clone' | 'worktree' | 'container';
export type AgentWorkspaceStatus = 'provisioning' | 'ready' | 'dirty' | 'archived' | 'failed';

export interface IAgentSessionRow {
  id: string;
  pipelineRunId?: string | null;
  requirementId: string;
  specId?: string | null;
  contextPackId?: string | null;
  title: string;
  status: AgentSessionStatus;
  runtimeAdapter: 'codex_cli' | 'codex_cloud' | 'openclaw' | 'claude_code' | 'custom';
  model?: string | null;
  baseBranch?: string | null;
  agentBranch?: string | null;
  planMarkdown?: string | null;
  riskLevel: AgentRiskLevel;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface IAgentTaskRow {
  id: string;
  sessionId: string;
  pipelineStepRunId?: string | null;
  parentTaskId?: string | null;
  role: AgentTaskRole;
  title: string;
  instructions: string;
  status: AgentTaskStatus;
  orderIndex: number;
  locked: boolean;
  requiresApproval: boolean;
  metadata: Record<string, unknown>;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IAgentToolCallRow {
  id: string;
  sessionId: string;
  taskId?: string | null;
  workspaceId?: string | null;
  toolName: string;
  toolCategory: 'shell' | 'git' | 'file' | 'test' | 'deploy' | 'browser' | 'ai' | 'other';
  status: AgentToolCallStatus;
  approvalStatus: AgentToolApprovalStatus;
  riskLevel: AgentRiskLevel;
  inputSummary: string;
  outputSummary?: string | null;
  command?: string | null;
  exitCode?: number | null;
  durationMs?: number | null;
  metadata: Record<string, unknown>;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IAgentWorkspaceRow {
  id: string;
  sessionId: string;
  pipelineRunId?: string | null;
  kind: AgentWorkspaceKind;
  status: AgentWorkspaceStatus;
  repoUrl: string;
  baseBranch: string;
  agentBranch: string;
  worktreePath?: string | null;
  baseCommit?: string | null;
  headCommit?: string | null;
  lockOwnerTaskId?: string | null;
  isWriteLocked: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  cleanedAt?: string | null;
}

export interface IAgentWorkspaceProvisionResult {
  workspace: IAgentWorkspaceRow;
  plan: IAgentWorkspaceLifecyclePlan;
  toolCalls: IAgentToolCallRow[];
}

export type AgentExecutionEventType = 'started' | 'spawned' | 'stdout' | 'stderr' | 'heartbeat' | 'finished' | 'error';

export interface IAgentExecutionEvent {
  type: AgentExecutionEventType;
  toolCallId: string;
  chunk?: string;
  status?: AgentToolCallStatus;
  exitCode?: number | null;
  durationMs?: number | null;
  pid?: number | null;
  cwd?: string | null;
  command?: string | null;
  stdoutBytes?: number;
  stderrBytes?: number;
  changedFilesCount?: number;
  timestamp?: string;
  message?: string;
  toolCall?: IAgentToolCallRow;
}

interface IAgentExecutionProcess {
  /** Codex 子进程使用 ignore stdin；类型需允许 stdin 为 null */
  child: ChildProcess;
  startedAt: number;
  stdout: string;
  stderr: string;
  cancelled: boolean;
}

interface ICommandTextResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface IAgentWorkspaceReviewSummary {
  changedFiles: Array<{ path: string; changeType: 'add' | 'modify' | 'delete' }>;
  diffNameStatus: string;
  diffStat: string;
  statusShort: string;
  detectedTestCommands: string[];
  errorMessage?: string;
}

export interface IContextPackFile {
  path: string;
  kind: 'markdown' | 'json' | 'text';
  content: string;
}

export interface IContextPackManifest {
  requirementId: string;
  prdId?: string | null;
  specId?: string | null;
  pipelineRunId?: string | null;
  generatedAt: string;
  sources: {
    requirementUpdatedAt?: string;
    prdUpdatedAt?: string;
    specUpdatedAt?: string;
    orgSpecVersion?: number;
  };
  files: Array<{
    path: string;
    kind: IContextPackFile['kind'];
    bytes: number;
    sha256: string;
  }>;
}

export interface IContextPackRow {
  id: string;
  requirementId: string;
  prdId?: string | null;
  specId?: string | null;
  pipelineRunId?: string | null;
  version: number;
  checksum: string;
  manifest: IContextPackManifest;
  content: Record<string, IContextPackFile>;
  createdAt: string;
  createdBy?: string | null;
}

export interface IPipelineDocsExportItem {
  fileName: string;
  content: string;
}

/** 产品目录（与需求「所属产品」可同名关联，此处存结构化元数据） */
export interface IProductRow {
  id: string;
  code?: string | null;
  /** 产品标识（必填） */
  identifier?: string | null;
  name: string;
  description: string;
  owner?: string | null;
  technicalManager?: string | null;
  productType?: string | null;
  sandboxUrl?: string | null;
  productionUrl?: string | null;
  gitUrl?: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export type BountyTaskStatus = 'open' | 'developing' | 'delivered' | 'settled' | 'rework';

export interface IBountyTaskRow {
  id: string;
  requirementId: string;
  publisherId: string;
  publisherName?: string | null;
  title: string;
  description: string;
  rewardCoins: number;
  depositCoins: number;
  consolationCoins: number;
  difficultyTag: 'normal' | 'hard' | 'epic';
  deadlineAt: string;
  acceptStatus: BountyTaskStatus;
  /** @deprecated 旧版单人猎人；迁移后请用 pmUserId/tmUserId */
  hunterUserId?: string | null;
  hunterUserName?: string | null;
  pmUserId?: string | null;
  pmUserName?: string | null;
  tmUserId?: string | null;
  tmUserName?: string | null;
  pmAcceptedAt?: string | null;
  tmAcceptedAt?: string | null;
  acceptedAt?: string | null;
  deliveredAt?: string | null;
  settledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 站内信（赏金通知等） */
export interface ISiteMessageRow {
  id: string;
  recipientUserId: string;
  title: string;
  body: string;
  linkUrl: string;
  readAt?: string | null;
  createdAt: string;
  kind?: string | null;
  relatedBountyTaskId?: string | null;
}

export interface IAiSkillConfig {
  id: string;
  name: string;
  description?: string | null;
  provider: 'ark';
  endpoint?: string | null;
  model: string;
  stream?: boolean;
  tools?: unknown[];
  promptTemplate: string;
  updatedAt: string;
}

export interface IAgentWorkspaceSourceTreeNodeJson {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: IAgentWorkspaceSourceTreeNodeJson[];
}

@Injectable()
export class RdService implements OnModuleInit {
  private readonly logger = new Logger(RdService.name);
  private readonly runningExecutions = new Map<string, IAgentExecutionProcess>();

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
    await this.ensurePrdRequirementUniqueIndex();
    await this.ensureSpecPrdUniqueIndex();
    await this.ensurePipelineRequirementUniqueIndex();
    await this.ensureAcceptanceRequirementUniqueIndex();
    await this.ensureCommonAuditColumns();
    await this.ensureProductSchemaUpgrade();
    await this.ensureRequirementExtraColumns();
    await this.ensureBountyDualSlotColumns();
    await this.ensureSiteMessagesTable();
    await this.ensureRequirementFlowEventsTable();
    await this.ensurePipelineRunTables();
    await this.ensureAgentTables();
    await this.ensureContextPackTables();
    await this.ensureAiSkillTables();
    await this.ensureAiSkillDefaults();
    await this.ensureDatapaasRoleGrants();
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
      CREATE TABLE IF NOT EXISTS rd_ai_skill_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        provider TEXT NOT NULL DEFAULT 'ark',
        endpoint TEXT,
        model TEXT NOT NULL,
        stream BOOLEAN NOT NULL DEFAULT TRUE,
        tools JSONB NOT NULL DEFAULT '[]'::jsonb,
        prompt_template TEXT NOT NULL,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_bounty_tasks (
        id TEXT PRIMARY KEY,
        requirement_id TEXT NOT NULL REFERENCES rd_requirements(id) ON DELETE CASCADE,
        publisher_id TEXT NOT NULL,
        publisher_name TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        reward_coins INT NOT NULL DEFAULT 0,
        deposit_coins INT NOT NULL DEFAULT 0,
        consolation_coins INT NOT NULL DEFAULT 1,
        difficulty_tag TEXT NOT NULL DEFAULT 'normal',
        deadline_at TIMESTAMPTZ NOT NULL,
        accept_status TEXT NOT NULL DEFAULT 'open',
        hunter_user_id TEXT,
        hunter_user_name TEXT,
        accepted_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        settled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  private async ensureAiSkillTables(): Promise<void> {
    await this.db.execute(sql`
      ALTER TABLE rd_ai_skill_configs ADD COLUMN IF NOT EXISTS description TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_ai_skill_configs ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'ark';
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_ai_skill_configs ADD COLUMN IF NOT EXISTS endpoint TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_ai_skill_configs ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT '';
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_ai_skill_configs ADD COLUMN IF NOT EXISTS stream BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_ai_skill_configs ADD COLUMN IF NOT EXISTS tools JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_ai_skill_configs ADD COLUMN IF NOT EXISTS prompt_template TEXT NOT NULL DEFAULT '';
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_ai_skill_configs ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_ai_skill_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);
  }

  /** 初始化内置 Skill 到数据库（仅插入缺失项，不覆盖管理员已配置项） */
  private async ensureAiSkillDefaults(): Promise<void> {
    for (const skill of Object.values(DEFAULT_AI_SKILLS)) {
      await this.db.execute(sql`
        INSERT INTO rd_ai_skill_configs (
          id, name, description, provider, endpoint, model, stream, tools, prompt_template, is_deleted, updated_at
        ) VALUES (
          ${skill.id},
          ${skill.name},
          ${skill.description ?? null},
          ${skill.provider},
          ${skill.endpoint ?? null},
          ${skill.model},
          ${skill.stream ?? true},
          ${JSON.stringify(skill.tools ?? [])}::jsonb,
          ${skill.promptTemplate},
          FALSE,
          NOW()
        )
        ON CONFLICT (id) DO NOTHING;
      `);
    }
  }

  /** 同一需求仅允许存在一份 PRD。 */
  private async ensurePrdRequirementUniqueIndex(): Promise<void> {
    await this.db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS rd_prds_requirement_id_unique_idx
      ON rd_prds (requirement_id);
    `);
  }

  /** 同一 PRD 仅允许存在一份规格说明书。 */
  private async ensureSpecPrdUniqueIndex(): Promise<void> {
    try {
      await this.db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS rd_specs_prd_id_unique_idx
        ON rd_specs (prd_id);
      `);
    } catch (e) {
      this.logger.warn(
        `rd_specs 唯一索引创建失败（可能存在历史重复数据）: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** 同一需求仅允许存在一条研发流水线任务。 */
  private async ensurePipelineRequirementUniqueIndex(): Promise<void> {
    try {
      await this.db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS rd_pipeline_tasks_requirement_id_unique_idx
        ON rd_pipeline_tasks (requirement_id);
      `);
    } catch (e) {
      this.logger.warn(
        `rd_pipeline_tasks 唯一索引创建失败（可能存在历史重复数据）: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** 同一需求仅允许存在一条验收单。 */
  private async ensureAcceptanceRequirementUniqueIndex(): Promise<void> {
    try {
      await this.db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS rd_acceptance_records_requirement_id_unique_idx
        ON rd_acceptance_records (requirement_id);
      `);
    } catch (e) {
      this.logger.warn(
        `rd_acceptance_records 唯一索引创建失败（可能存在历史重复数据）: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
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
      ALTER TABLE rd_specs ADD COLUMN IF NOT EXISTS cp_markdown TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_pipeline_tasks ADD COLUMN IF NOT EXISTS created_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_pipeline_tasks ADD COLUMN IF NOT EXISTS updated_by TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_pipeline_tasks ADD COLUMN IF NOT EXISTS code_review_history JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_pipeline_tasks ADD COLUMN IF NOT EXISTS generated_test_cases JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_pipeline_tasks ADD COLUMN IF NOT EXISTS test_run_history JSONB NOT NULL DEFAULT '[]'::jsonb;
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

  private async ensureSiteMessagesTable(): Promise<void> {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_site_messages (
        id TEXT PRIMARY KEY,
        recipient_user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        link_url TEXT NOT NULL,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        kind TEXT,
        related_bounty_task_id TEXT
      );
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_rd_site_messages_recipient_created
      ON rd_site_messages (recipient_user_id, created_at DESC);
    `);
  }

  private async ensureRequirementFlowEventsTable(): Promise<void> {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_requirement_flow_events (
        id TEXT PRIMARY KEY,
        requirement_id TEXT NOT NULL REFERENCES rd_requirements(id) ON DELETE CASCADE,
        from_status TEXT,
        to_status TEXT NOT NULL,
        action TEXT NOT NULL,
        operator TEXT,
        comment TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_rd_requirement_flow_events_requirement_created
      ON rd_requirement_flow_events (requirement_id, created_at ASC);
    `);
  }

  private async ensurePipelineRunTables(): Promise<void> {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_pipeline_runs (
        id TEXT PRIMARY KEY,
        pipeline_task_id TEXT REFERENCES rd_pipeline_tasks(id) ON DELETE SET NULL,
        requirement_id TEXT NOT NULL REFERENCES rd_requirements(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        trigger_mode TEXT NOT NULL DEFAULT 'manual',
        context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_rd_pipeline_runs_requirement_created
      ON rd_pipeline_runs (requirement_id, created_at DESC);
    `);
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_pipeline_step_runs (
        id TEXT PRIMARY KEY,
        pipeline_run_id TEXT NOT NULL REFERENCES rd_pipeline_runs(id) ON DELETE CASCADE,
        step_key TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        order_index INT NOT NULL DEFAULT 0,
        input_ref TEXT,
        output_ref TEXT,
        error_code TEXT,
        error_message TEXT,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_rd_pipeline_step_runs_run_order
      ON rd_pipeline_step_runs (pipeline_run_id, order_index ASC);
    `);
  }

  private async ensureAgentTables(): Promise<void> {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_agent_sessions (
        id TEXT PRIMARY KEY,
        pipeline_run_id TEXT REFERENCES rd_pipeline_runs(id) ON DELETE SET NULL,
        requirement_id TEXT NOT NULL REFERENCES rd_requirements(id) ON DELETE CASCADE,
        spec_id TEXT REFERENCES rd_specs(id) ON DELETE SET NULL,
        context_pack_id TEXT,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        runtime_adapter TEXT NOT NULL DEFAULT 'custom',
        model TEXT,
        base_branch TEXT,
        agent_branch TEXT,
        plan_markdown TEXT,
        risk_level TEXT NOT NULL DEFAULT 'medium',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_rd_agent_sessions_pipeline_run
      ON rd_agent_sessions (pipeline_run_id, created_at DESC);
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_rd_agent_sessions_requirement
      ON rd_agent_sessions (requirement_id, created_at DESC);
    `);
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_agent_tasks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES rd_agent_sessions(id) ON DELETE CASCADE,
        pipeline_step_run_id TEXT REFERENCES rd_pipeline_step_runs(id) ON DELETE SET NULL,
        parent_task_id TEXT REFERENCES rd_agent_tasks(id) ON DELETE SET NULL,
        role TEXT NOT NULL,
        title TEXT NOT NULL,
        instructions TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        order_index INT NOT NULL DEFAULT 0,
        locked BOOLEAN NOT NULL DEFAULT FALSE,
        requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_rd_agent_tasks_session_order
      ON rd_agent_tasks (session_id, order_index ASC);
    `);
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_agent_workspaces (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES rd_agent_sessions(id) ON DELETE CASCADE,
        pipeline_run_id TEXT REFERENCES rd_pipeline_runs(id) ON DELETE SET NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        repo_url TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        agent_branch TEXT NOT NULL,
        worktree_path TEXT,
        base_commit TEXT,
        head_commit TEXT,
        lock_owner_task_id TEXT REFERENCES rd_agent_tasks(id) ON DELETE SET NULL,
        is_write_locked BOOLEAN NOT NULL DEFAULT FALSE,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        cleaned_at TIMESTAMPTZ
      );
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_rd_agent_workspaces_session
      ON rd_agent_workspaces (session_id, created_at DESC);
    `);
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_agent_tool_calls (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES rd_agent_sessions(id) ON DELETE CASCADE,
        task_id TEXT REFERENCES rd_agent_tasks(id) ON DELETE SET NULL,
        workspace_id TEXT REFERENCES rd_agent_workspaces(id) ON DELETE SET NULL,
        tool_name TEXT NOT NULL,
        tool_category TEXT NOT NULL,
        status TEXT NOT NULL,
        approval_status TEXT NOT NULL DEFAULT 'not_required',
        risk_level TEXT NOT NULL DEFAULT 'low',
        input_summary TEXT NOT NULL DEFAULT '',
        output_summary TEXT,
        command TEXT,
        exit_code INT,
        duration_ms INT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_rd_agent_tool_calls_session_created
      ON rd_agent_tool_calls (session_id, created_at ASC);
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_rd_agent_tool_calls_task_created
      ON rd_agent_tool_calls (task_id, created_at ASC);
    `);
  }

  private async ensureContextPackTables(): Promise<void> {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_context_packs (
        id TEXT PRIMARY KEY,
        requirement_id TEXT NOT NULL REFERENCES rd_requirements(id) ON DELETE CASCADE,
        prd_id TEXT REFERENCES rd_prds(id) ON DELETE SET NULL,
        spec_id TEXT REFERENCES rd_specs(id) ON DELETE SET NULL,
        pipeline_run_id TEXT REFERENCES rd_pipeline_runs(id) ON DELETE SET NULL,
        version INT NOT NULL,
        checksum TEXT NOT NULL,
        manifest JSONB NOT NULL,
        content JSONB NOT NULL,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (requirement_id, version)
      );
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_rd_context_packs_requirement_version
      ON rd_context_packs (requirement_id, version DESC);
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_rd_context_packs_pipeline_run
      ON rd_context_packs (pipeline_run_id, created_at DESC);
    `);
  }

  /** 悬赏双槽位：PM / TM 分别领取；齐满后 bounty 任务进入 developing（需求流转不由领取驱动） */
  private async ensureBountyDualSlotColumns(): Promise<void> {
    await this.db.execute(sql`
      ALTER TABLE rd_bounty_tasks ADD COLUMN IF NOT EXISTS pm_user_id TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_bounty_tasks ADD COLUMN IF NOT EXISTS pm_user_name TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_bounty_tasks ADD COLUMN IF NOT EXISTS pm_accepted_at TIMESTAMPTZ;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_bounty_tasks ADD COLUMN IF NOT EXISTS tm_user_id TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_bounty_tasks ADD COLUMN IF NOT EXISTS tm_user_name TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_bounty_tasks ADD COLUMN IF NOT EXISTS tm_accepted_at TIMESTAMPTZ;
    `);
    await this.db.execute(sql`
      UPDATE rd_bounty_tasks
      SET
        pm_user_id = hunter_user_id,
        pm_user_name = hunter_user_name,
        pm_accepted_at = accepted_at
      WHERE hunter_user_id IS NOT NULL
        AND pm_user_id IS NULL
        AND tm_user_id IS NULL;
    `);
    await this.db.execute(sql`
      UPDATE rd_bounty_tasks
      SET accept_status = 'open'
      WHERE pm_user_id IS NOT NULL
        AND tm_user_id IS NULL
        AND accept_status = 'developing';
    `);
  }

  /** 移除历史版本中的 extras 列（若存在） */
  private async ensureProductSchemaUpgrade(): Promise<void> {
    try {
      await this.db.execute(sql`
        ALTER TABLE rd_products DROP COLUMN IF EXISTS extras;
      `);
      await this.db.execute(sql`
        ALTER TABLE rd_products ADD COLUMN IF NOT EXISTS code TEXT;
      `);
      await this.db.execute(sql`
        ALTER TABLE rd_products ADD COLUMN IF NOT EXISTS technical_manager TEXT;
      `);
      await this.db.execute(sql`
        ALTER TABLE rd_products ADD COLUMN IF NOT EXISTS product_type TEXT;
      `);
      await this.db.execute(sql`
        ALTER TABLE rd_products ADD COLUMN IF NOT EXISTS identifier TEXT;
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

  private rowToRequirementFlowEvent(r: Record<string, unknown>): IRequirementFlowEventRow {
    return {
      id: String(r.id || ''),
      requirementId: String(r.requirement_id || r.requirementId || ''),
      fromStatus: (r.from_status as RequirementStatus) || (r.fromStatus as RequirementStatus) || null,
      toStatus: (r.to_status as RequirementStatus) || (r.toStatus as RequirementStatus),
      action: String(r.action || ''),
      operator: (r.operator as string) || undefined,
      comment: (r.comment as string) || undefined,
      metadata: this.parseJsonObject(r.metadata),
      createdAt: this.toIso(r.created_at ?? r.createdAt),
    };
  }

  private parseJsonObject(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return {};
      }
    }
    return {};
  }

  private rowToPrd(r: Record<string, unknown>): IPrdRow {
    const t = this.tsFromRow(r);
    return {
      id: r.id as string,
      requirementId: ((r.requirement_id as string) || (r.requirementId as string)),
      title: (r.title as string) || undefined,
      background: (r.background as string) || '',
      objectives: (r.objectives as string) || '',
      flowchart: (r.flowchart as string) || undefined,
      featureList: ((r.feature_list as IFeature[]) || (r.featureList as IFeature[]) || []),
      nonFunctional: (r.non_functional as string) || (r.nonFunctional as string) || '',
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
    const codeReviewHistoryRaw =
      (r.code_review_history as IPipelineCodeReviewRecord[] | null) ??
      (r.codeReviewHistory as IPipelineCodeReviewRecord[] | null);
    const generatedTestCasesRaw =
      (r.generated_test_cases as IPipelineGeneratedTestCase[] | null) ??
      (r.generatedTestCases as IPipelineGeneratedTestCase[] | null);
    const testRunHistoryRaw =
      (r.test_run_history as IPipelineTestRunRecord[] | null) ??
      (r.testRunHistory as IPipelineTestRunRecord[] | null);
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
      codeReviewHistory: Array.isArray(codeReviewHistoryRaw) ? codeReviewHistoryRaw : undefined,
      generatedTestCases: Array.isArray(generatedTestCasesRaw) ? generatedTestCasesRaw : undefined,
      testRunHistory: Array.isArray(testRunHistoryRaw) ? testRunHistoryRaw : undefined,
      pipelineMeta,
      commitStore: commitStore ?? undefined,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      createdBy: (r.created_by as string) || (r.createdBy as string) || undefined,
      updatedBy: (r.updated_by as string) || (r.updatedBy as string) || undefined,
    };
  }

  private rowToPipelineRun(r: Record<string, unknown>): IPipelineRunRow {
    const t = this.tsFromRow(r);
    return {
      id: String(r.id || ''),
      pipelineTaskId: (r.pipeline_task_id as string) || (r.pipelineTaskId as string) || undefined,
      requirementId: String(r.requirement_id || r.requirementId || ''),
      status: (r.status as PipelineRunStatus) || 'queued',
      triggerMode:
        ((r.trigger_mode as IPipelineRunRow['triggerMode']) ||
          (r.triggerMode as IPipelineRunRow['triggerMode']) ||
          'manual'),
      contextSnapshot: this.parseJsonObject(r.context_snapshot ?? r.contextSnapshot),
      startedAt: r.started_at || r.startedAt ? this.toIso(r.started_at ?? r.startedAt) : undefined,
      finishedAt: r.finished_at || r.finishedAt ? this.toIso(r.finished_at ?? r.finishedAt) : undefined,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      createdBy: (r.created_by as string) || (r.createdBy as string) || undefined,
      updatedBy: (r.updated_by as string) || (r.updatedBy as string) || undefined,
    };
  }

  private rowToPipelineStepRun(r: Record<string, unknown>): IPipelineStepRunRow {
    const t = this.tsFromRow(r);
    return {
      id: String(r.id || ''),
      pipelineRunId: String(r.pipeline_run_id || r.pipelineRunId || ''),
      stepKey: String(r.step_key || r.stepKey || ''),
      name: String(r.name || ''),
      status: (r.status as PipelineStepRunStatus) || 'queued',
      orderIndex: Number(r.order_index ?? r.orderIndex ?? 0),
      inputRef: (r.input_ref as string) || (r.inputRef as string) || undefined,
      outputRef: (r.output_ref as string) || (r.outputRef as string) || undefined,
      errorCode: (r.error_code as string) || (r.errorCode as string) || undefined,
      errorMessage: (r.error_message as string) || (r.errorMessage as string) || undefined,
      startedAt: r.started_at || r.startedAt ? this.toIso(r.started_at ?? r.startedAt) : undefined,
      finishedAt: r.finished_at || r.finishedAt ? this.toIso(r.finished_at ?? r.finishedAt) : undefined,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  private rowToAgentSession(r: Record<string, unknown>): IAgentSessionRow {
    const t = this.tsFromRow(r);
    return {
      id: String(r.id || ''),
      pipelineRunId: (r.pipeline_run_id as string) || (r.pipelineRunId as string) || undefined,
      requirementId: String(r.requirement_id || r.requirementId || ''),
      specId: (r.spec_id as string) || (r.specId as string) || undefined,
      contextPackId: (r.context_pack_id as string) || (r.contextPackId as string) || undefined,
      title: String(r.title || ''),
      status: (r.status as AgentSessionStatus) || 'draft',
      runtimeAdapter:
        ((r.runtime_adapter as IAgentSessionRow['runtimeAdapter']) ||
          (r.runtimeAdapter as IAgentSessionRow['runtimeAdapter']) ||
          'custom'),
      model: (r.model as string) || undefined,
      baseBranch: (r.base_branch as string) || (r.baseBranch as string) || undefined,
      agentBranch: (r.agent_branch as string) || (r.agentBranch as string) || undefined,
      planMarkdown: (r.plan_markdown as string) || (r.planMarkdown as string) || undefined,
      riskLevel: (r.risk_level as AgentRiskLevel) || (r.riskLevel as AgentRiskLevel) || 'medium',
      metadata: this.parseJsonObject(r.metadata),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      createdBy: (r.created_by as string) || (r.createdBy as string) || undefined,
      updatedBy: (r.updated_by as string) || (r.updatedBy as string) || undefined,
    };
  }

  private rowToAgentTask(r: Record<string, unknown>): IAgentTaskRow {
    const t = this.tsFromRow(r);
    return {
      id: String(r.id || ''),
      sessionId: String(r.session_id || r.sessionId || ''),
      pipelineStepRunId:
        (r.pipeline_step_run_id as string) || (r.pipelineStepRunId as string) || undefined,
      parentTaskId: (r.parent_task_id as string) || (r.parentTaskId as string) || undefined,
      role: (r.role as AgentTaskRole) || 'coder',
      title: String(r.title || ''),
      instructions: String(r.instructions || ''),
      status: (r.status as AgentTaskStatus) || 'queued',
      orderIndex: Number(r.order_index ?? r.orderIndex ?? 0),
      locked: Boolean(r.locked ?? false),
      requiresApproval: Boolean(r.requires_approval ?? r.requiresApproval ?? false),
      metadata: this.parseJsonObject(r.metadata),
      startedAt: r.started_at || r.startedAt ? this.toIso(r.started_at ?? r.startedAt) : undefined,
      finishedAt: r.finished_at || r.finishedAt ? this.toIso(r.finished_at ?? r.finishedAt) : undefined,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  private rowToAgentToolCall(r: Record<string, unknown>): IAgentToolCallRow {
    const t = this.tsFromRow(r);
    return {
      id: String(r.id || ''),
      sessionId: String(r.session_id || r.sessionId || ''),
      taskId: (r.task_id as string) || (r.taskId as string) || undefined,
      workspaceId: (r.workspace_id as string) || (r.workspaceId as string) || undefined,
      toolName: String(r.tool_name || r.toolName || ''),
      toolCategory:
        ((r.tool_category as IAgentToolCallRow['toolCategory']) ||
          (r.toolCategory as IAgentToolCallRow['toolCategory']) ||
          'other'),
      status: (r.status as AgentToolCallStatus) || 'pending',
      approvalStatus:
        ((r.approval_status as AgentToolApprovalStatus) ||
          (r.approvalStatus as AgentToolApprovalStatus) ||
          'not_required'),
      riskLevel: (r.risk_level as AgentRiskLevel) || (r.riskLevel as AgentRiskLevel) || 'low',
      inputSummary: String(r.input_summary || r.inputSummary || ''),
      outputSummary: (r.output_summary as string) || (r.outputSummary as string) || undefined,
      command: (r.command as string) || undefined,
      exitCode: r.exit_code != null || r.exitCode != null ? Number(r.exit_code ?? r.exitCode) : undefined,
      durationMs:
        r.duration_ms != null || r.durationMs != null ? Number(r.duration_ms ?? r.durationMs) : undefined,
      metadata: this.parseJsonObject(r.metadata),
      startedAt: r.started_at || r.startedAt ? this.toIso(r.started_at ?? r.startedAt) : undefined,
      finishedAt: r.finished_at || r.finishedAt ? this.toIso(r.finished_at ?? r.finishedAt) : undefined,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  private rowToAgentWorkspace(r: Record<string, unknown>): IAgentWorkspaceRow {
    const t = this.tsFromRow(r);
    return {
      id: String(r.id || ''),
      sessionId: String(r.session_id || r.sessionId || ''),
      pipelineRunId: (r.pipeline_run_id as string) || (r.pipelineRunId as string) || undefined,
      kind: (r.kind as AgentWorkspaceKind) || 'worktree',
      status: (r.status as AgentWorkspaceStatus) || 'provisioning',
      repoUrl: String(r.repo_url || r.repoUrl || ''),
      baseBranch: String(r.base_branch || r.baseBranch || ''),
      agentBranch: String(r.agent_branch || r.agentBranch || ''),
      worktreePath: (r.worktree_path as string) || (r.worktreePath as string) || undefined,
      baseCommit: (r.base_commit as string) || (r.baseCommit as string) || undefined,
      headCommit: (r.head_commit as string) || (r.headCommit as string) || undefined,
      lockOwnerTaskId:
        (r.lock_owner_task_id as string) || (r.lockOwnerTaskId as string) || undefined,
      isWriteLocked: Boolean(r.is_write_locked ?? r.isWriteLocked ?? false),
      metadata: this.parseJsonObject(r.metadata),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      cleanedAt: r.cleaned_at || r.cleanedAt ? this.toIso(r.cleaned_at ?? r.cleanedAt) : undefined,
    };
  }

  private rowToContextPack(r: Record<string, unknown>): IContextPackRow {
    return {
      id: String(r.id || ''),
      requirementId: String(r.requirement_id || r.requirementId || ''),
      prdId: (r.prd_id as string) || (r.prdId as string) || undefined,
      specId: (r.spec_id as string) || (r.specId as string) || undefined,
      pipelineRunId: (r.pipeline_run_id as string) || (r.pipelineRunId as string) || undefined,
      version: Number(r.version ?? 1),
      checksum: String(r.checksum || ''),
      manifest: this.parseJsonObject(r.manifest) as unknown as IContextPackManifest,
      content: this.parseJsonObject(r.content) as Record<string, IContextPackFile>,
      createdAt: this.toIso(r.created_at ?? r.createdAt),
      createdBy: (r.created_by as string) || (r.createdBy as string) || undefined,
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
      prdId: ((r.prd_id as string) || (r.prdId as string)),
      fsMarkdown: (r.fs_markdown as string) || (r.fsMarkdown as string) || undefined,
      tsMarkdown: (r.ts_markdown as string) || (r.tsMarkdown as string) || undefined,
      cpMarkdown: (r.cp_markdown as string) || (r.cpMarkdown as string) || undefined,
      functionalSpec: (r.functionalSpec as ISpecRow['functionalSpec']) || fs,
      technicalSpec: (r.technicalSpec as ISpecRow['technicalSpec']) || tsSpec,
      machineReadableJson: (r.machine_readable_json as string) || (r.machineReadableJson as string) || '',
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
      code: (r.code as string) || null,
      identifier: (r.identifier as string) || null,
      name: (r.name as string) || '',
      description: (r.description as string) || '',
      owner: (r.owner as string) || null,
      technicalManager: (r.technical_manager as string) || (r.technicalManager as string) || null,
      productType: (r.product_type as string) || (r.productType as string) || null,
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

  private rowToAiSkill(r: Record<string, unknown>): IAiSkillConfig {
    return {
      id: String(r.id || ''),
      name: String(r.name || ''),
      description: (r.description as string) || undefined,
      provider: 'ark',
      endpoint: (r.endpoint as string) || undefined,
      model: String(r.model || ''),
      stream: Boolean(r.stream ?? true),
      tools: Array.isArray(r.tools) ? (r.tools as unknown[]) : [],
      promptTemplate: String(r.prompt_template || r.promptTemplate || ''),
      updatedAt: this.toIso(r.updated_at ?? r.updatedAt),
    };
  }

  async listAiSkills(): Promise<IAiSkillConfig[]> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_ai_skill_configs WHERE is_deleted = FALSE ORDER BY id ASC;
    `);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToAiSkill(row));
  }

  async getAiSkill(id: string): Promise<IAiSkillConfig | null> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_ai_skill_configs WHERE id = ${id} AND is_deleted = FALSE LIMIT 1;
    `);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToAiSkill(rows[0]) : null;
  }

  async upsertAiSkill(
    id: string,
    patch: Partial<Omit<IAiSkillConfig, 'id' | 'updatedAt'>>,
  ): Promise<IAiSkillConfig> {
    const existing = await this.getAiSkill(id);
    const merged = {
      name: patch.name ?? existing?.name ?? id,
      description: patch.description ?? existing?.description ?? null,
      provider: 'ark' as const,
      endpoint: patch.endpoint ?? existing?.endpoint ?? null,
      model: patch.model ?? existing?.model ?? '',
      stream: patch.stream ?? existing?.stream ?? true,
      tools: patch.tools ?? existing?.tools ?? [],
      promptTemplate: patch.promptTemplate ?? existing?.promptTemplate ?? '',
    };
    await this.db.execute(sql`
      INSERT INTO rd_ai_skill_configs (
        id, name, description, provider, endpoint, model, stream, tools, prompt_template, is_deleted, updated_at
      ) VALUES (
        ${id},
        ${merged.name},
        ${merged.description},
        ${merged.provider},
        ${merged.endpoint},
        ${merged.model},
        ${merged.stream},
        ${JSON.stringify(merged.tools || [])}::jsonb,
        ${merged.promptTemplate},
        FALSE,
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        provider = EXCLUDED.provider,
        endpoint = EXCLUDED.endpoint,
        model = EXCLUDED.model,
        stream = EXCLUDED.stream,
        tools = EXCLUDED.tools,
        prompt_template = EXCLUDED.prompt_template,
        is_deleted = FALSE,
        updated_at = NOW();
    `);
    return (await this.getAiSkill(id)) as IAiSkillConfig;
  }

  async resetAiSkill(id: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE rd_ai_skill_configs SET is_deleted = TRUE, updated_at = NOW() WHERE id = ${id};
    `);
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

  async listRequirementFlowEvents(requirementId: string): Promise<IRequirementFlowEventRow[]> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_requirement_flow_events
      WHERE requirement_id = ${requirementId}
      ORDER BY created_at ASC;
    `);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToRequirementFlowEvent(row));
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

    const productTrimmed = (merged.product ?? '').trim();
    if (!productTrimmed) {
      if (!existing) {
        throw new BadRequestException('所属产品不能为空');
      }
      if (body.product !== undefined) {
        throw new BadRequestException('所属产品不能为空');
      }
    }

    const statusChanged = existing ? existing.status !== merged.status : true;
    if (statusChanged) {
      this.assertRequirementStatusTransition(existing?.status ?? null, merged.status);
    }

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
    if (statusChanged) {
      await this.recordRequirementFlowEvent({
        requirementId: merged.id,
        fromStatus: existing?.status ?? null,
        toStatus: merged.status,
        operator: merged.updatedBy ?? merged.createdBy ?? merged.submitter ?? null,
        comment: existing
          ? `需求状态从${REQUIREMENT_STATUS_LABELS[existing.status]}流转到${REQUIREMENT_STATUS_LABELS[merged.status]}`
          : '提交初始需求',
        createdAt: existing ? merged.updatedAt : merged.createdAt,
      });
    }
    return (await this.getRequirement(merged.id))!;
  }

  private assertRequirementStatusTransition(
    fromStatus: RequirementStatus | null,
    toStatus: RequirementStatus
  ): void {
    if (!fromStatus) {
      if (toStatus !== 'backlog') {
        throw new BadRequestException('新需求必须从需求池创建');
      }
      return;
    }
    const allowed = REQUIREMENT_STATUS_TRANSITIONS[fromStatus] ?? [];
    if (!allowed.includes(toStatus)) {
      const fromLabel = REQUIREMENT_STATUS_LABELS[fromStatus] ?? fromStatus;
      const toLabel = REQUIREMENT_STATUS_LABELS[toStatus] ?? toStatus;
      throw new BadRequestException(
        `非法需求状态流转：${fromLabel} -> ${toLabel}`
      );
    }
  }

  private async recordRequirementFlowEvent(input: {
    requirementId: string;
    fromStatus?: RequirementStatus | null;
    toStatus: RequirementStatus;
    operator?: string | null;
    comment?: string | null;
    createdAt?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const id = `rfe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const action = input.fromStatus
      ? `${REQUIREMENT_STATUS_LABELS[input.fromStatus]} -> ${REQUIREMENT_STATUS_LABELS[input.toStatus]}`
      : '需求创建';
    await this.db.execute(sql`
      INSERT INTO rd_requirement_flow_events (
        id, requirement_id, from_status, to_status, action, operator, comment, metadata, created_at
      ) VALUES (
        ${id},
        ${input.requirementId},
        ${input.fromStatus ?? null},
        ${input.toStatus},
        ${action},
        ${input.operator ?? null},
        ${input.comment ?? null},
        ${JSON.stringify(input.metadata ?? {})}::jsonb,
        ${input.createdAt ?? new Date().toISOString()}::timestamptz
      );
    `);
  }

  /** 用户是否拥有指定访问角色（含多角色与历史单列回退） */
  private async userHasAccessRole(userId: string, roleId: string): Promise<boolean> {
    const rid = String(roleId || '').trim();
    const uid = String(userId || '').trim();
    if (!rid || !uid) return false;
    const junction = await this.db.execute(sql`
      SELECT 1 FROM rd_user_access_roles WHERE user_id = ${uid} AND role_id = ${rid} LIMIT 1;
    `);
    if (this.rowsFromExecute(junction).length > 0) return true;
    const legacy = await this.db.execute(sql`
      SELECT access_role_id FROM rd_users WHERE id = ${uid} LIMIT 1;
    `);
    const rows = this.rowsFromExecute<{ access_role_id?: string | null }>(legacy);
    const raw = rows[0]?.access_role_id;
    return typeof raw === 'string' && raw.trim() === rid;
  }

  /**
   * 校验用户是否可领取 PM/TM 槽位：若需求指定了候选人则仅该用户；否则须为对应内置角色。
   */
  private async assertUserMayClaimRequirementSlot(
    req: IRequirementRow,
    role: 'pm' | 'tm',
    userId: string,
  ): Promise<void> {
    const uid = String(userId || '').trim();
    if (!uid) {
      throw new BadRequestException('缺少用户标识');
    }
    if (role === 'pm') {
      const designated = String(req.pmCandidateUserId || '').trim();
      if (designated) {
        if (uid !== designated) {
          throw new BadRequestException('本需求已指定产品经理领取人，仅指定用户可领取');
        }
        return;
      }
      const ok = await this.userHasAccessRole(uid, BUILTIN_ACCESS_ROLE_PM);
      if (!ok) {
        throw new BadRequestException('仅产品经理角色可领取产品经理任务');
      }
      return;
    }
    const designated = String(req.tmCandidateUserId || '').trim();
    if (designated) {
      if (uid !== designated) {
        throw new BadRequestException('本需求已指定技术经理领取人，仅指定用户可领取');
      }
      return;
    }
    const okTm = await this.userHasAccessRole(uid, BUILTIN_ACCESS_ROLE_TM);
    if (!okTm) {
      throw new BadRequestException('仅技术经理角色可领取技术经理任务');
    }
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
    await this.assertUserMayClaimRequirementSlot(req, body.role, userId);
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

  async getPrdByRequirementId(requirementId: string): Promise<IPrdRow | null> {
    const result = await this.db.execute(
      sql`SELECT * FROM rd_prds WHERE requirement_id = ${requirementId} LIMIT 1;`,
    );
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToPrd(rows[0]) : null;
  }

  async listPrdsByRequirementId(requirementId: string): Promise<IPrdRow[]> {
    const result = await this.db.execute(
      sql`SELECT * FROM rd_prds WHERE requirement_id = ${requirementId} ORDER BY updated_at DESC;`,
    );
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToPrd(row));
  }

  async getSpecByPrdId(prdId: string): Promise<ISpecRow | null> {
    const result = await this.db.execute(sql`SELECT * FROM rd_specs WHERE prd_id = ${prdId} LIMIT 1;`);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToSpec(rows[0]) : null;
  }

  async listSpecsByPrdIds(prdIds: string[]): Promise<ISpecRow[]> {
    if (!prdIds.length) return [];
    const values = prdIds.map((id) => sql`${id}`);
    const result = await this.db.execute(sql`
      SELECT * FROM rd_specs
      WHERE prd_id IN (${sql.join(values, sql`, `)})
      ORDER BY updated_at DESC;
    `);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToSpec(row));
  }

  private renderPrdMarkdown(prd: IPrdRow): string {
    const features = (prd.featureList || [])
      .map((feature, index) => {
        const criteria = (feature.acceptanceCriteria || []).map((c) => `- ${c}`).join('\n');
        return `### ${index + 1}. ${feature.name}\n\n${feature.description || ''}\n\n验收标准：\n${criteria || '- 暂无'}\n`;
      })
      .join('\n');
    return [
      `# PRD - ${prd.title || prd.id}`,
      '',
      `- PRD ID: ${prd.id}`,
      `- Requirement ID: ${prd.requirementId}`,
      `- Status: ${prd.status}`,
      `- Version: ${prd.version}`,
      `- Updated At: ${prd.updatedAt}`,
      '',
      '## 背景',
      prd.background || '',
      '',
      '## 目标',
      prd.objectives || '',
      '',
      '## 功能列表',
      features || '暂无',
      '',
      '## 非功能性需求',
      prd.nonFunctional || '',
      '',
    ].join('\n');
  }

  private renderRequirementMarkdown(requirement: IRequirementRow): string {
    return [
      `# Requirement - ${requirement.title || requirement.id}`,
      '',
      `- Requirement ID: ${requirement.id}`,
      `- Status: ${requirement.status}`,
      `- Priority: ${requirement.priority}`,
      `- Expected Date: ${requirement.expectedDate}`,
      `- Submitter: ${requirement.submitterName || requirement.submitter}`,
      `- Product: ${requirement.product || '未指定'}`,
      `- Updated At: ${requirement.updatedAt}`,
      '',
      '## 描述',
      requirement.description || '',
      '',
      '## 角色与领取',
      `- PM: ${requirement.pm || '未领取'}`,
      `- TM: ${requirement.tm || '未领取'}`,
      `- Bounty Points: ${requirement.bountyPoints}`,
      '',
    ].join('\n');
  }

  private renderOrgSpecMarkdown(config: unknown): string {
    const orgSpec = this.parseJsonObject(config);
    const orgName = String(orgSpec.orgName || '默认组织');
    const version = Number(orgSpec.version ?? 1);
    const defaultLanguage = String(orgSpec.defaultLanguage || 'typescript');
    const languages = this.parseJsonObject(orgSpec.languages);
    const sections = Object.values(languages)
      .filter((language): language is Record<string, unknown> => {
        if (!language || typeof language !== 'object' || Array.isArray(language)) return false;
        return (language as Record<string, unknown>).enabled !== false;
      })
      .map((language) => {
        const displayName = String(language.displayName || language.language || 'Unknown');
        const renderList = (title: string, value: unknown) => {
          const items = Array.isArray(value) ? value : [];
          return [`### ${title}`, ...(items.length ? items.map((item) => `- ${String(item)}`) : ['- 暂无'])].join('\n');
        };
        return [
          `## ${displayName}`,
          renderList('Style Guide', language.styleGuide),
          renderList('Must Follow', language.mustFollow),
          renderList('Forbidden', language.forbidden),
          renderList('Toolchain', language.toolchain),
          renderList('Testing', language.testing),
        ].join('\n\n');
      })
      .join('\n\n');
    return [
      `# Organization Coding Spec - ${orgName}`,
      '',
      `- Version: ${version}`,
      `- Default Language: ${defaultLanguage}`,
      '',
      sections || '暂无启用语言规范',
      '',
    ].join('\n');
  }

  private renderRepoSummaryMarkdown(input: {
    pipelineRun?: IPipelineRunRow | null;
    requirement: IRequirementRow;
    prd?: IPrdRow | null;
    spec?: ISpecRow | null;
  }): string {
    const meta = input.pipelineRun?.contextSnapshot || {};
    const lines = [
      '# Repository Summary',
      '',
      `- Requirement ID: ${input.requirement.id}`,
      `- Pipeline Run ID: ${input.pipelineRun?.id || '未创建'}`,
      `- PRD ID: ${input.prd?.id || '未绑定'}`,
      `- Spec ID: ${input.spec?.id || '未绑定'}`,
      `- Trigger Mode: ${input.pipelineRun?.triggerMode || 'manual'}`,
    ];
    const gitUrl = meta.gitUrl || meta.repoUrl || meta.repositoryUrl;
    const branch = meta.branch || meta.baseBranch || meta.targetBranch;
    if (gitUrl) lines.push(`- Repository URL: ${String(gitUrl)}`);
    if (branch) lines.push(`- Base Branch: ${String(branch)}`);
    lines.push('', '## Context Snapshot', '```json', JSON.stringify(meta, null, 2), '```', '');
    return lines.join('\n');
  }

  private hashText(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async buildPipelineDocsExport(requirementId: string): Promise<IPipelineDocsExportItem[]> {
    const requirement = await this.getRequirement(requirementId);
    if (!requirement) {
      throw new NotFoundException('需求不存在');
    }
    const prds = await this.listPrdsByRequirementId(requirementId);
    if (!prds.length) {
      throw new NotFoundException('未找到该需求对应的 PRD');
    }
    const specs = await this.listSpecsByPrdIds(prds.map((prd) => prd.id));
    const latestPrd = prds[0];
    const latestSpec = specs[0];
    if (!latestSpec) {
      throw new NotFoundException('未找到该需求对应的规格说明');
    }
    const fsContent =
      latestSpec.fsMarkdown?.trim() || JSON.stringify(latestSpec.functionalSpec || {}, null, 2);
    const tsContent =
      latestSpec.tsMarkdown?.trim() || JSON.stringify(latestSpec.technicalSpec || {}, null, 2);
    const cpContent =
      latestSpec.cpMarkdown?.trim() ||
      `# Implementation Plan\n\n> 请在规格编辑页的「编程计划（CP）」中生成或由 FS/TS 导出后粘贴内容。\n\n## 0. 执行约定\n\n- [ ] 基于仓库实际结构补充本计划。\n`;
    return [
      {
        fileName: 'prd.md',
        content: this.renderPrdMarkdown(latestPrd),
      },
      {
        fileName: 'fs-spec.md',
        content: fsContent,
      },
      {
        fileName: 'ts-spec.md',
        content: tsContent,
      },
      {
        fileName: 'plan.md',
        content: cpContent,
      },
    ];
  }

  async listContextPacks(requirementId?: string): Promise<IContextPackRow[]> {
    const result = requirementId
      ? await this.db.execute(sql`
          SELECT * FROM rd_context_packs
          WHERE requirement_id = ${requirementId}
          ORDER BY version DESC;
        `)
      : await this.db.execute(sql`
          SELECT * FROM rd_context_packs ORDER BY created_at DESC;
        `);
    return this.rowsFromExecute(result).map((row) => this.rowToContextPack(row));
  }

  async getContextPack(id: string): Promise<IContextPackRow | null> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_context_packs WHERE id = ${id} LIMIT 1;
    `);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToContextPack(rows[0]) : null;
  }

  private async nextContextPackVersion(requirementId: string): Promise<number> {
    const result = await this.db.execute(sql`
      SELECT COALESCE(MAX(version), 0) AS max_version
      FROM rd_context_packs
      WHERE requirement_id = ${requirementId};
    `);
    const row = this.rowsFromExecute<{ max_version?: unknown; maxVersion?: unknown }>(result)[0];
    return Number(row?.max_version ?? row?.maxVersion ?? 0) + 1;
  }

  async createContextPack(body: {
    id?: string;
    requirementId: string;
    prdId?: string | null;
    specId?: string | null;
    pipelineRunId?: string | null;
    createdBy?: string | null;
  }): Promise<IContextPackRow> {
    const requirement = await this.getRequirement(body.requirementId);
    if (!requirement) {
      throw new NotFoundException('需求不存在');
    }
    const prd = body.prdId
      ? await this.getPrd(body.prdId)
      : await this.getPrdByRequirementId(body.requirementId);
    if (!prd) {
      throw new NotFoundException('未找到该需求对应的 PRD');
    }
    if (prd.requirementId !== body.requirementId) {
      throw new BadRequestException('ContextPack 的 PRD 与需求不一致');
    }
    const spec = body.specId ? await this.getSpec(body.specId) : await this.getSpecByPrdId(prd.id);
    if (!spec) {
      throw new NotFoundException('未找到该需求对应的规格说明');
    }
    if (spec.prdId !== prd.id) {
      throw new BadRequestException('ContextPack 的 Spec 与 PRD 不一致');
    }
    let pipelineRun: IPipelineRunRow | null = null;
    if (body.pipelineRunId) {
      pipelineRun = await this.getPipelineRun(body.pipelineRunId);
      if (!pipelineRun) {
        throw new NotFoundException('PipelineRun 不存在');
      }
      if (pipelineRun.requirementId !== body.requirementId) {
        throw new BadRequestException('ContextPack 的 PipelineRun 与需求不一致');
      }
    }
    const orgSpec = (await this.getOrgSpecConfig()) ?? createDefaultOrgSpecConfig();
    const fsContent =
      spec.fsMarkdown?.trim() ||
      JSON.stringify(
        {
          functionalSpec: spec.functionalSpec,
          machineReadableJson: spec.machineReadableJson,
        },
        null,
        2,
      );
    const tsContent =
      spec.tsMarkdown?.trim() || JSON.stringify({ technicalSpec: spec.technicalSpec }, null, 2);
    const cpContent =
      spec.cpMarkdown?.trim() ||
      '# Implementation Plan\n\n> 当前规格尚未生成 CP，请先补齐编程计划后再执行 Agent 编码。\n';
    const files: IContextPackFile[] = [
      { path: 'context/requirement.md', kind: 'markdown', content: this.renderRequirementMarkdown(requirement) },
      { path: 'context/prd.md', kind: 'markdown', content: this.renderPrdMarkdown(prd) },
      { path: 'context/fs.json', kind: 'json', content: fsContent },
      { path: 'context/ts.json', kind: 'json', content: tsContent },
      { path: 'context/cp.md', kind: 'markdown', content: cpContent },
      { path: 'context/org-spec.md', kind: 'markdown', content: this.renderOrgSpecMarkdown(orgSpec) },
      {
        path: 'context/repo-summary.md',
        kind: 'markdown',
        content: this.renderRepoSummaryMarkdown({ pipelineRun, requirement, prd, spec }),
      },
    ];
    const generatedAt = new Date().toISOString();
    const manifest: IContextPackManifest = {
      requirementId: requirement.id,
      prdId: prd.id,
      specId: spec.id,
      pipelineRunId: pipelineRun?.id || body.pipelineRunId || null,
      generatedAt,
      sources: {
        requirementUpdatedAt: requirement.updatedAt,
        prdUpdatedAt: prd.updatedAt,
        specUpdatedAt: spec.updatedAt,
        orgSpecVersion: Number(this.parseJsonObject(orgSpec).version ?? 1),
      },
      files: files.map((file) => ({
        path: file.path,
        kind: file.kind,
        bytes: Buffer.byteLength(file.content),
        sha256: this.hashText(file.content),
      })),
    };
    const content = Object.fromEntries(files.map((file) => [file.path, file]));
    const checksum = this.hashText(JSON.stringify({ manifest, content }));
    const version = await this.nextContextPackVersion(requirement.id);
    const id = body.id?.trim() || `ctx_${requirement.id}_${version}`;
    await this.db.execute(sql`
      INSERT INTO rd_context_packs (
        id, requirement_id, prd_id, spec_id, pipeline_run_id, version, checksum,
        manifest, content, created_by, created_at
      ) VALUES (
        ${id},
        ${requirement.id},
        ${prd.id},
        ${spec.id},
        ${pipelineRun?.id ?? body.pipelineRunId ?? null},
        ${version},
        ${checksum},
        ${JSON.stringify(manifest)}::jsonb,
        ${JSON.stringify(content)}::jsonb,
        ${body.createdBy ?? null},
        ${generatedAt}::timestamptz
      );
    `);
    return (await this.getContextPack(id))!;
  }

  async upsertPrd(body: Partial<IPrdRow> & { id: string; requirementId: string }): Promise<IPrdRow> {
    const existing = await this.getPrd(body.id);
    const sameRequirementPrd = await this.getPrdByRequirementId(body.requirementId);
    if (sameRequirementPrd && sameRequirementPrd.id !== body.id) {
      throw new BadRequestException('该需求已存在PRD，不允许重复创建');
    }
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
    const specId = String(body.id || '').trim();
    const prdId = String(body.prdId || '').trim();
    if (!specId) {
      throw new BadRequestException('规格ID不能为空');
    }
    if (!prdId) {
      throw new BadRequestException('关联PRD不能为空');
    }
    const linkedPrd = await this.getPrd(prdId);
    if (!linkedPrd) {
      throw new BadRequestException('关联PRD不存在或已删除');
    }

    const existing = await this.getSpec(specId);
    const samePrdSpec = await this.getSpecByPrdId(prdId);
    if (samePrdSpec && samePrdSpec.id !== specId) {
      throw new BadRequestException('该需求已存在规格说明书，不允许重复创建');
    }
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
          id: specId,
          prdId,
          fsMarkdown: body.fsMarkdown,
          tsMarkdown: body.tsMarkdown,
          cpMarkdown: body.cpMarkdown,
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
    try {
      await this.db.execute(sql`
        INSERT INTO rd_specs (
          id, prd_id, fs_markdown, ts_markdown, cp_markdown, functional_spec, technical_spec,
          machine_readable_json, status, reviews,
          created_by, updated_by, created_at, updated_at
        ) VALUES (
          ${merged.id},
          ${merged.prdId},
          ${merged.fsMarkdown ?? null},
          ${merged.tsMarkdown ?? null},
          ${merged.cpMarkdown ?? null},
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
          cp_markdown = EXCLUDED.cp_markdown,
          functional_spec = EXCLUDED.functional_spec,
          technical_spec = EXCLUDED.technical_spec,
          machine_readable_json = EXCLUDED.machine_readable_json,
          status = EXCLUDED.status,
          reviews = EXCLUDED.reviews,
          updated_by = EXCLUDED.updated_by,
          updated_at = EXCLUDED.updated_at;
      `);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === '23503') {
        throw new BadRequestException('关联PRD不存在或已删除');
      }
      if (code === '23505') {
        throw new BadRequestException('该需求已存在规格说明书，不允许重复创建');
      }
      throw e;
    }
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
      const resultRaw = String(r.result || 'pending');
      const result: IAcceptanceRecordRow['result'] =
        resultRaw === 'approved' || resultRaw === 'rejected' ? resultRaw : 'pending';
      const statusRaw = (r.status as string) || result;
      const status: IAcceptanceRecordRow['status'] =
        statusRaw === 'approved' || statusRaw === 'rejected' ? statusRaw : 'pending';
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
    const existingByRequirement = await this.db.execute(sql`
      SELECT id, result FROM rd_acceptance_records WHERE requirement_id = ${rec.requirementId} LIMIT 1;
    `);
    const existingRows = this.rowsFromExecute<{ id: string; result: string }>(existingByRequirement);
    const now = new Date().toISOString();
    const status = rec.status ?? rec.result;
    const updatedAt = rec.updatedAt ?? now;
    const createdBy = rec.createdBy ?? rec.reviewer;
    const updatedBy = rec.updatedBy ?? rec.reviewer;

    if (existingRows[0]) {
      const ex = existingRows[0];
      const resultRaw = String(ex.result || '');
      if (resultRaw !== 'pending') {
        throw new BadRequestException('该需求已存在验收单，不允许重复创建');
      }
      await this.db.execute(sql`
        UPDATE rd_acceptance_records SET
          reviewer = ${rec.reviewer},
          scores = ${JSON.stringify(rec.scores)}::jsonb,
          feedback = ${rec.feedback},
          result = ${rec.result},
          status = ${status},
          updated_by = ${updatedBy},
          updated_at = ${updatedAt}::timestamptz
        WHERE id = ${ex.id};
      `);
      return;
    }

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
    const sameRequirementTaskResult = await this.db.execute(sql`
      SELECT * FROM rd_pipeline_tasks WHERE requirement_id = ${body.requirementId} LIMIT 1;
    `);
    const sameRequirementTaskRows = this.rowsFromExecute(sameRequirementTaskResult);
    const sameRequirementTask = sameRequirementTaskRows[0]
      ? this.rowToPipelineTask(sameRequirementTaskRows[0])
      : null;
    if (sameRequirementTask && sameRequirementTask.id !== body.id) {
      throw new BadRequestException('该需求已存在研发流水线，不允许重复创建');
    }
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
          codeReviewHistory:
            body.codeReviewHistory !== undefined ? body.codeReviewHistory : existing.codeReviewHistory ?? [],
          generatedTestCases:
            body.generatedTestCases !== undefined
              ? body.generatedTestCases
              : existing.generatedTestCases ?? [],
          testRunHistory:
            body.testRunHistory !== undefined ? body.testRunHistory : existing.testRunHistory ?? [],
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
          codeReviewHistory: body.codeReviewHistory ?? [],
          generatedTestCases: body.generatedTestCases ?? [],
          testRunHistory: body.testRunHistory ?? [],
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
        code_review_history, generated_test_cases, test_run_history, pipeline_meta, commit_store, created_by, updated_by, created_at, updated_at
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
        ${JSON.stringify(merged.codeReviewHistory ?? [])}::jsonb,
        ${JSON.stringify(merged.generatedTestCases ?? [])}::jsonb,
        ${JSON.stringify(merged.testRunHistory ?? [])}::jsonb,
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
        code_review_history = EXCLUDED.code_review_history,
        generated_test_cases = EXCLUDED.generated_test_cases,
        test_run_history = EXCLUDED.test_run_history,
        pipeline_meta = EXCLUDED.pipeline_meta,
        commit_store = EXCLUDED.commit_store,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;
    `);
    if (!existing) {
      const actor = merged.updatedBy ?? merged.createdBy ?? null;
      await this.advanceRequirementToAiDeveloping(merged.requirementId, actor);
    }
    return (await this.getPipelineTask(merged.id))!;
  }

  private async advanceRequirementToAiDeveloping(
    requirementId: string,
    actor?: string | null
  ): Promise<void> {
    const requirement = await this.getRequirement(requirementId);
    if (!requirement || requirement.status === 'ai_developing') return;
    const statusPath: RequirementStatus[] = [
      'backlog',
      'prd_writing',
      'spec_defining',
      'ai_developing',
    ];
    const currentIndex = statusPath.indexOf(requirement.status);
    const targetIndex = statusPath.indexOf('ai_developing');
    if (currentIndex === -1 || currentIndex > targetIndex) {
      await this.upsertRequirement({
        id: requirementId,
        status: 'ai_developing',
        updatedBy: actor ?? undefined,
      });
      return;
    }

    for (const nextStatus of statusPath.slice(currentIndex + 1, targetIndex + 1)) {
      await this.upsertRequirement({
        id: requirementId,
        status: nextStatus,
        updatedBy: actor ?? undefined,
      });
    }
  }

  async deletePipelineTask(id: string): Promise<void> {
    await this.db.execute(sql`DELETE FROM rd_pipeline_tasks WHERE id = ${id};`);
  }

  async listPipelineRuns(requirementId?: string): Promise<IPipelineRunRow[]> {
    const result = requirementId
      ? await this.db.execute(sql`
          SELECT * FROM rd_pipeline_runs
          WHERE requirement_id = ${requirementId}
          ORDER BY created_at DESC;
        `)
      : await this.db.execute(sql`
          SELECT * FROM rd_pipeline_runs ORDER BY created_at DESC;
        `);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToPipelineRun(row));
  }

  async getPipelineRun(id: string): Promise<IPipelineRunRow | null> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_pipeline_runs WHERE id = ${id} LIMIT 1;
    `);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToPipelineRun(rows[0]) : null;
  }

  async createPipelineRun(
    body: Partial<IPipelineRunRow> & { id?: string; requirementId: string }
  ): Promise<IPipelineRunRow> {
    const requirement = await this.getRequirement(body.requirementId);
    if (!requirement) {
      throw new BadRequestException('关联需求不存在或已删除');
    }
    const now = new Date().toISOString();
    const id = body.id?.trim() || `prun_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const status = body.status || 'queued';
    await this.db.execute(sql`
      INSERT INTO rd_pipeline_runs (
        id, pipeline_task_id, requirement_id, status, trigger_mode, context_snapshot,
        started_at, finished_at, created_by, updated_by, created_at, updated_at
      ) VALUES (
        ${id},
        ${body.pipelineTaskId ?? null},
        ${body.requirementId},
        ${status},
        ${body.triggerMode || 'manual'},
        ${JSON.stringify(body.contextSnapshot ?? {})}::jsonb,
        ${body.startedAt ?? null}::timestamptz,
        ${body.finishedAt ?? null}::timestamptz,
        ${body.createdBy ?? body.updatedBy ?? null},
        ${body.updatedBy ?? body.createdBy ?? null},
        ${body.createdAt ?? now}::timestamptz,
        ${body.updatedAt ?? now}::timestamptz
      );
    `);
    return (await this.getPipelineRun(id))!;
  }

  async listPipelineStepRuns(pipelineRunId: string): Promise<IPipelineStepRunRow[]> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_pipeline_step_runs
      WHERE pipeline_run_id = ${pipelineRunId}
      ORDER BY order_index ASC, created_at ASC;
    `);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToPipelineStepRun(row));
  }

  async upsertPipelineStepRun(
    body: Partial<IPipelineStepRunRow> & {
      id?: string;
      pipelineRunId: string;
      stepKey: string;
      name: string;
    }
  ): Promise<IPipelineStepRunRow> {
    const run = await this.getPipelineRun(body.pipelineRunId);
    if (!run) {
      throw new BadRequestException('关联 PipelineRun 不存在或已删除');
    }
    const now = new Date().toISOString();
    const id = body.id?.trim() || `pstep_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const status = body.status || 'queued';
    await this.db.execute(sql`
      INSERT INTO rd_pipeline_step_runs (
        id, pipeline_run_id, step_key, name, status, order_index,
        input_ref, output_ref, error_code, error_message,
        started_at, finished_at, created_at, updated_at
      ) VALUES (
        ${id},
        ${body.pipelineRunId},
        ${body.stepKey},
        ${body.name},
        ${status},
        ${body.orderIndex ?? 0},
        ${body.inputRef ?? null},
        ${body.outputRef ?? null},
        ${body.errorCode ?? null},
        ${body.errorMessage ?? null},
        ${body.startedAt ?? null}::timestamptz,
        ${body.finishedAt ?? null}::timestamptz,
        ${body.createdAt ?? now}::timestamptz,
        ${body.updatedAt ?? now}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        step_key = EXCLUDED.step_key,
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        order_index = EXCLUDED.order_index,
        input_ref = EXCLUDED.input_ref,
        output_ref = EXCLUDED.output_ref,
        error_code = EXCLUDED.error_code,
        error_message = EXCLUDED.error_message,
        started_at = EXCLUDED.started_at,
        finished_at = EXCLUDED.finished_at,
        updated_at = EXCLUDED.updated_at;
    `);
    const rows = await this.listPipelineStepRuns(body.pipelineRunId);
    return rows.find((row) => row.id === id)!;
  }

  async listAgentSessions(filters?: {
    pipelineRunId?: string;
    requirementId?: string;
  }): Promise<IAgentSessionRow[]> {
    let result: unknown;
    if (filters?.pipelineRunId) {
      result = await this.db.execute(sql`
        SELECT * FROM rd_agent_sessions
        WHERE pipeline_run_id = ${filters.pipelineRunId}
        ORDER BY created_at DESC;
      `);
    } else if (filters?.requirementId) {
      result = await this.db.execute(sql`
        SELECT * FROM rd_agent_sessions
        WHERE requirement_id = ${filters.requirementId}
        ORDER BY created_at DESC;
      `);
    } else {
      result = await this.db.execute(sql`
        SELECT * FROM rd_agent_sessions ORDER BY created_at DESC;
      `);
    }
    return this.rowsFromExecute(result).map((row) => this.rowToAgentSession(row));
  }

  async getAgentSession(id: string): Promise<IAgentSessionRow | null> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_agent_sessions WHERE id = ${id} LIMIT 1;
    `);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToAgentSession(rows[0]) : null;
  }

  async createAgentSession(
    body: Partial<IAgentSessionRow> & { id?: string; requirementId: string; title: string }
  ): Promise<IAgentSessionRow> {
    const requirement = await this.getRequirement(body.requirementId);
    if (!requirement) {
      throw new BadRequestException('关联需求不存在或已删除');
    }
    if (body.pipelineRunId) {
      const run = await this.getPipelineRun(body.pipelineRunId);
      if (!run) {
        throw new BadRequestException('关联 PipelineRun 不存在或已删除');
      }
      if (run.requirementId !== body.requirementId) {
        throw new BadRequestException('AgentSession 与 PipelineRun 的需求不一致');
      }
    }
    const now = new Date().toISOString();
    const id = body.id?.trim() || `asess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await this.db.execute(sql`
      INSERT INTO rd_agent_sessions (
        id, pipeline_run_id, requirement_id, spec_id, context_pack_id, title, status,
        runtime_adapter, model, base_branch, agent_branch, plan_markdown, risk_level,
        metadata, created_by, updated_by, created_at, updated_at
      ) VALUES (
        ${id},
        ${body.pipelineRunId ?? null},
        ${body.requirementId},
        ${body.specId ?? null},
        ${body.contextPackId ?? null},
        ${body.title},
        ${body.status || 'draft'},
        ${body.runtimeAdapter || 'custom'},
        ${body.model ?? null},
        ${body.baseBranch ?? null},
        ${body.agentBranch ?? null},
        ${body.planMarkdown ?? null},
        ${body.riskLevel || 'medium'},
        ${JSON.stringify(body.metadata ?? {})}::jsonb,
        ${body.createdBy ?? body.updatedBy ?? null},
        ${body.updatedBy ?? body.createdBy ?? null},
        ${body.createdAt ?? now}::timestamptz,
        ${body.updatedAt ?? now}::timestamptz
      );
    `);
    return (await this.getAgentSession(id))!;
  }

  /** 浅合并 metadata（用于工作台对话等客户端状态持久化） */
  async patchAgentSessionMetadata(
    id: string,
    patch: Record<string, unknown>,
    updatedBy?: string | null,
  ): Promise<IAgentSessionRow> {
    const current = await this.getAgentSession(id);
    if (!current) {
      throw new NotFoundException('AgentSession 不存在');
    }
    const merged = { ...current.metadata, ...patch };
    const now = new Date().toISOString();
    await this.db.execute(sql`
      UPDATE rd_agent_sessions
      SET metadata = ${JSON.stringify(merged)}::jsonb,
          updated_at = ${now}::timestamptz,
          updated_by = COALESCE(${updatedBy ?? null}, updated_by)
      WHERE id = ${id};
    `);
    return (await this.getAgentSession(id))!;
  }

  async listAgentTasks(sessionId: string): Promise<IAgentTaskRow[]> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_agent_tasks
      WHERE session_id = ${sessionId}
      ORDER BY order_index ASC, created_at ASC;
    `);
    return this.rowsFromExecute(result).map((row) => this.rowToAgentTask(row));
  }

  async upsertAgentTask(
    body: Partial<IAgentTaskRow> & { id?: string; sessionId: string; role: AgentTaskRole; title: string }
  ): Promise<IAgentTaskRow> {
    const session = await this.getAgentSession(body.sessionId);
    if (!session) {
      throw new BadRequestException('关联 AgentSession 不存在或已删除');
    }
    const now = new Date().toISOString();
    const id = body.id?.trim() || `atask_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await this.db.execute(sql`
      INSERT INTO rd_agent_tasks (
        id, session_id, pipeline_step_run_id, parent_task_id, role, title, instructions,
        status, order_index, locked, requires_approval, metadata, started_at, finished_at,
        created_at, updated_at
      ) VALUES (
        ${id},
        ${body.sessionId},
        ${body.pipelineStepRunId ?? null},
        ${body.parentTaskId ?? null},
        ${body.role},
        ${body.title},
        ${body.instructions ?? ''},
        ${body.status || 'queued'},
        ${body.orderIndex ?? 0},
        ${body.locked ?? false},
        ${body.requiresApproval ?? false},
        ${JSON.stringify(body.metadata ?? {})}::jsonb,
        ${body.startedAt ?? null}::timestamptz,
        ${body.finishedAt ?? null}::timestamptz,
        ${body.createdAt ?? now}::timestamptz,
        ${body.updatedAt ?? now}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        pipeline_step_run_id = EXCLUDED.pipeline_step_run_id,
        parent_task_id = EXCLUDED.parent_task_id,
        role = EXCLUDED.role,
        title = EXCLUDED.title,
        instructions = EXCLUDED.instructions,
        status = EXCLUDED.status,
        order_index = EXCLUDED.order_index,
        locked = EXCLUDED.locked,
        requires_approval = EXCLUDED.requires_approval,
        metadata = EXCLUDED.metadata,
        started_at = EXCLUDED.started_at,
        finished_at = EXCLUDED.finished_at,
        updated_at = EXCLUDED.updated_at;
    `);
    const rows = await this.listAgentTasks(body.sessionId);
    return rows.find((row) => row.id === id)!;
  }

  async listAgentToolCalls(filters: { sessionId: string; taskId?: string }): Promise<IAgentToolCallRow[]> {
    const result = filters.taskId
      ? await this.db.execute(sql`
          SELECT * FROM rd_agent_tool_calls
          WHERE session_id = ${filters.sessionId} AND task_id = ${filters.taskId}
          ORDER BY created_at ASC;
        `)
      : await this.db.execute(sql`
          SELECT * FROM rd_agent_tool_calls
          WHERE session_id = ${filters.sessionId}
          ORDER BY created_at ASC;
        `);
    return this.rowsFromExecute(result).map((row) => this.rowToAgentToolCall(row));
  }

  async upsertAgentToolCall(
    body: Partial<IAgentToolCallRow> & { id?: string; sessionId: string; toolName: string }
  ): Promise<IAgentToolCallRow> {
    const session = await this.getAgentSession(body.sessionId);
    if (!session) {
      throw new BadRequestException('关联 AgentSession 不存在或已删除');
    }
    const now = new Date().toISOString();
    const id = body.id?.trim() || `atool_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await this.db.execute(sql`
      INSERT INTO rd_agent_tool_calls (
        id, session_id, task_id, workspace_id, tool_name, tool_category, status,
        approval_status, risk_level, input_summary, output_summary, command, exit_code,
        duration_ms, metadata, started_at, finished_at, created_at, updated_at
      ) VALUES (
        ${id},
        ${body.sessionId},
        ${body.taskId ?? null},
        ${body.workspaceId ?? null},
        ${body.toolName},
        ${body.toolCategory || 'other'},
        ${body.status || 'pending'},
        ${body.approvalStatus || 'not_required'},
        ${body.riskLevel || 'low'},
        ${body.inputSummary ?? ''},
        ${body.outputSummary ?? null},
        ${body.command ?? null},
        ${body.exitCode ?? null},
        ${body.durationMs ?? null},
        ${JSON.stringify(body.metadata ?? {})}::jsonb,
        ${body.startedAt ?? null}::timestamptz,
        ${body.finishedAt ?? null}::timestamptz,
        ${body.createdAt ?? now}::timestamptz,
        ${body.updatedAt ?? now}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        task_id = EXCLUDED.task_id,
        workspace_id = EXCLUDED.workspace_id,
        tool_name = EXCLUDED.tool_name,
        tool_category = EXCLUDED.tool_category,
        status = EXCLUDED.status,
        approval_status = EXCLUDED.approval_status,
        risk_level = EXCLUDED.risk_level,
        input_summary = EXCLUDED.input_summary,
        output_summary = EXCLUDED.output_summary,
        command = EXCLUDED.command,
        exit_code = EXCLUDED.exit_code,
        duration_ms = EXCLUDED.duration_ms,
        metadata = EXCLUDED.metadata,
        started_at = EXCLUDED.started_at,
        finished_at = EXCLUDED.finished_at,
        updated_at = EXCLUDED.updated_at;
    `);
    const rows = await this.listAgentToolCalls({ sessionId: body.sessionId });
    return rows.find((row) => row.id === id)!;
  }

  async getAgentToolCall(id: string): Promise<IAgentToolCallRow | null> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_agent_tool_calls WHERE id = ${id} LIMIT 1;
    `);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToAgentToolCall(rows[0]) : null;
  }

  async prepareAgentToolCall(
    body: Partial<IAgentToolCallRow> & {
      id?: string;
      sessionId: string;
      toolName: string;
      toolCategory: IAgentToolCallRow['toolCategory'];
      timeoutMs?: number | null;
    }
  ): Promise<IAgentToolCallRow> {
    const policy = prepareToolCallPolicy({
      toolName: body.toolName,
      toolCategory: body.toolCategory,
      command: body.command,
      requestedRiskLevel: body.riskLevel,
      requestedApprovalStatus: body.approvalStatus,
      timeoutMs: body.timeoutMs,
    });
    return this.upsertAgentToolCall({
      ...body,
      status: policy.status,
      approvalStatus: policy.approvalStatus,
      riskLevel: policy.riskLevel,
      metadata: {
        ...(body.metadata || {}),
        timeoutMs: policy.timeoutMs,
        policyReason: policy.reason,
      },
    });
  }

  async approveAgentToolCall(
    id: string,
    body: { approved: boolean; approver?: string | null; reason?: string | null }
  ): Promise<IAgentToolCallRow> {
    const current = await this.getAgentToolCall(id);
    if (!current) {
      throw new NotFoundException('AgentToolCall 不存在');
    }
    const approvalStatus: AgentToolApprovalStatus = body.approved ? 'approved' : 'rejected';
    const status: AgentToolCallStatus = body.approved ? 'pending' : 'cancelled';
    return this.upsertAgentToolCall({
      ...current,
      approvalStatus,
      status,
      metadata: {
        ...current.metadata,
        approval: {
          approver: body.approver ?? null,
          reason: body.reason ?? null,
          decidedAt: new Date().toISOString(),
        },
      },
    });
  }

  async startAgentToolCall(id: string): Promise<IAgentToolCallRow> {
    const current = await this.getAgentToolCall(id);
    if (!current) {
      throw new NotFoundException('AgentToolCall 不存在');
    }
    try {
      assertToolCallCanStart({
        status: current.status,
        approvalStatus: current.approvalStatus,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
    return this.upsertAgentToolCall({
      ...current,
      status: 'running',
      startedAt: current.startedAt || new Date().toISOString(),
    });
  }

  async finishAgentToolCall(
    id: string,
    body: {
      exitCode?: number | null;
      outputSummary?: string | null;
      errorMessage?: string | null;
      durationMs?: number | null;
      status?: AgentToolCallStatus | null;
    }
  ): Promise<IAgentToolCallRow> {
    const current = await this.getAgentToolCall(id);
    if (!current) {
      throw new NotFoundException('AgentToolCall 不存在');
    }
    const exitCode = body.exitCode ?? 0;
    const status: AgentToolCallStatus = body.status || (exitCode === 0 ? 'succeeded' : 'failed');
    return this.upsertAgentToolCall({
      ...current,
      status,
      exitCode,
      outputSummary: body.outputSummary ?? current.outputSummary,
      durationMs: body.durationMs ?? current.durationMs,
      finishedAt: new Date().toISOString(),
      metadata: {
        ...current.metadata,
        errorMessage: body.errorMessage ?? null,
      },
    });
  }

  private async persistAgentExecutionOutput(
    current: IAgentToolCallRow,
    output: { stdout: string; stderr: string; lastEventType?: AgentExecutionEventType }
  ): Promise<IAgentToolCallRow> {
    return this.upsertAgentToolCall({
      ...current,
      metadata: {
        ...this.parseJsonObject(current.metadata),
        stdout: output.stdout.slice(-20000),
        stderr: output.stderr.slice(-20000),
        lastEventType: output.lastEventType ?? null,
        lastOutputAt: new Date().toISOString(),
      },
    });
  }

  async cancelAgentToolCallExecution(id: string): Promise<IAgentToolCallRow> {
    const execution = this.runningExecutions.get(id);
    const current = await this.getAgentToolCall(id);
    if (!current) {
      throw new NotFoundException('AgentToolCall 不存在');
    }
    const now = Date.now();
    if (execution) {
      execution.cancelled = true;
      if (!execution.child.killed) {
        execution.child.kill('SIGTERM');
      }
      return this.upsertAgentToolCall({
        ...current,
        status: 'cancelled',
        durationMs: current.durationMs ?? now - execution.startedAt,
        finishedAt: current.finishedAt || new Date().toISOString(),
        metadata: {
          ...this.parseJsonObject(current.metadata),
          executorCancelled: true,
          cancelledAt: new Date().toISOString(),
          stdout: execution.stdout.slice(-20000),
          stderr: execution.stderr.slice(-20000),
        },
      });
    }
    if (current.status !== 'running') {
      throw new BadRequestException('当前工具调用未处于运行中');
    }
    return this.upsertAgentToolCall({
      ...current,
      status: 'cancelled',
      finishedAt: current.finishedAt || new Date().toISOString(),
      metadata: {
        ...this.parseJsonObject(current.metadata),
        executorCancelled: true,
        cancelledAt: new Date().toISOString(),
      },
    });
  }

  private buildCodexExecCommand(input: {
    prompt: string;
    workspacePath: string;
    model?: string | null;
  }): { command: string; args: string[] } {
    const codexBin = String(process.env.CODEX_CLI_BIN || 'codex').trim() || 'codex';
    const args = [
      'exec',
      '--cd',
      input.workspacePath,
      '--sandbox',
      'workspace-write',
    ];
    const model = input.model?.trim() || process.env.CODEX_CLI_MODEL?.trim();
    if (model) {
      args.push('--model', model);
    }
    args.push(input.prompt);
    return { command: codexBin, args };
  }

  private runTextCommand(command: string, args: string[], cwd: string): Promise<ICommandTextResult> {
    return this.runTextCommandWithEnv(command, args, cwd, process.env);
  }

  private runTextCommandWithEnv(
    command: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
  ): Promise<ICommandTextResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd,
        env,
        shell: false,
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => {
        resolve({
          exitCode: 1,
          stdout,
          stderr: stderr || (error instanceof Error ? error.message : String(error)),
        });
      });
      child.on('close', (code) => {
        resolve({ exitCode: code, stdout, stderr });
      });
    });
  }

  private async createGitAskpassBundle(
    gitPat: string,
    gitUsername: string,
  ): Promise<{ env: NodeJS.ProcessEnv; dispose: () => Promise<void> }> {
    const tempRoot = await mkdtemp(join(tmpdir(), 'rd-agent-git-'));
    const askPassFile = join(tempRoot, 'git-askpass.sh');
    const script = `#!/bin/sh
case "$1" in
  *sername*) printf '%s\n' "$RD_GIT_USERNAME" ;;
  *assword*) printf '%s\n' "$RD_GIT_PAT" ;;
  *) printf '\n' ;;
esac
`;
    await writeFile(askPassFile, script, 'utf8');
    await chmod(askPassFile, 0o700);
    return {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: askPassFile,
        RD_GIT_USERNAME: gitUsername.trim() || 'git',
        RD_GIT_PAT: gitPat.trim(),
      },
      dispose: () => rm(tempRoot, { recursive: true, force: true }),
    };
  }

  /**
   * 在 Agent worktree 内执行 git add / commit / push，将当前分支推送到 origin 上对应 agent 分支。
   * HTTPS 需 PAT：请求体传入，或配置环境变量 RD_AGENT_GIT_PUSH_PAT（及可选 RD_AGENT_GIT_PUSH_USERNAME）。
   */
  async commitAndPushAgentWorkspace(
    workspaceId: string,
    body?: {
      commitMessage?: string | null;
      gitPat?: string | null;
      gitUsername?: string | null;
    },
  ): Promise<{
    committed: boolean;
    pushed: boolean;
    branch: string;
    commitHash: string | null;
    log: string[];
  }> {
    const workspace = await this.getAgentWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundException('AgentWorkspace 不存在');
    }
    if (workspace.status !== 'ready') {
      throw new BadRequestException('Workspace 未处于 ready 状态，无法推送');
    }
    const worktreePath = workspace.worktreePath?.trim();
    if (!worktreePath) {
      throw new BadRequestException('缺少 worktreePath');
    }
    const rootAbs = resolve(worktreePath);
    const st = await stat(rootAbs).catch(() => null);
    if (!st?.isDirectory()) {
      throw new BadRequestException('工作目录不存在');
    }
    const metaRoot = String(this.parseJsonObject(workspace.metadata).workspaceRoot || '')
      .trim()
      .replace(/\/+$/, '');
    if (metaRoot) {
      const rootNorm = rootAbs.endsWith(sep) ? rootAbs.slice(0, -1) : rootAbs;
      const metaNorm = resolve(metaRoot);
      if (rootNorm !== metaNorm && !rootNorm.startsWith(`${metaNorm}${sep}`)) {
        throw new BadRequestException('工作目录不在该 Workspace 允许的根路径下');
      }
    }

    const repoUrl = workspace.repoUrl.trim();
    const isHttps = /^https:\/\//i.test(repoUrl);
    const patFromBody = String(body?.gitPat || '').trim();
    const patFromEnv = String(process.env.RD_AGENT_GIT_PUSH_PAT || '').trim();
    const effectivePat = patFromBody || patFromEnv;
    const effectiveUser =
      String(body?.gitUsername || '').trim() ||
      String(process.env.RD_AGENT_GIT_PUSH_USERNAME || '').trim() ||
      'git';

    let env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    let disposeAskpass: (() => Promise<void>) | null = null;
    if (isHttps) {
      if (!effectivePat) {
        throw new BadRequestException(
          '远程为 HTTPS 时需提供 Personal Access Token：在弹窗中填写，或由运维配置环境变量 RD_AGENT_GIT_PUSH_PAT。',
        );
      }
      const bundle = await this.createGitAskpassBundle(effectivePat, effectiveUser);
      env = bundle.env;
      disposeAskpass = bundle.dispose;
    }

    const log: string[] = [];
    const agentBranch = workspace.agentBranch.trim();
    if (!agentBranch) {
      if (disposeAskpass) await disposeAskpass();
      throw new BadRequestException('Workspace 缺少 agentBranch');
    }

    const msgRaw = String(body?.commitMessage || '').trim();
    const commitMessage = (
      msgRaw ||
      `chore(agent): 推送 Agent 工作台变更 ${new Date().toISOString().slice(0, 19)}`
    )
      .replace(/\r?\n/g, ' ')
      .slice(0, 500);

    try {
      const inside = await this.runTextCommandWithEnv('git', ['-C', rootAbs, 'rev-parse', '--is-inside-work-tree'], rootAbs, env);
      log.push(`[git rev-parse] exit=${inside.exitCode}`);
      if (inside.exitCode !== 0 || inside.stdout.trim() !== 'true') {
        throw new BadRequestException(`不是有效的 Git 仓库：${inside.stderr || inside.stdout || 'rev-parse 失败'}`);
      }

      const add = await this.runTextCommandWithEnv('git', ['-C', rootAbs, 'add', '-A'], rootAbs, env);
      log.push(`[git add -A] exit=${add.exitCode}`);
      if (add.exitCode !== 0) {
        throw new BadRequestException(`git add 失败：${add.stderr || add.stdout}`);
      }

      const diffCached = await this.runTextCommandWithEnv('git', ['-C', rootAbs, 'diff', '--cached', '--quiet'], rootAbs, env);
      let committed = false;
      if (diffCached.exitCode === 0) {
        log.push('[git diff --cached] 无暂存变更，跳过 commit');
      } else {
        const commit = await this.runTextCommandWithEnv(
          'git',
          ['-C', rootAbs, 'commit', '-m', commitMessage],
          rootAbs,
          env,
        );
        log.push(`[git commit] exit=${commit.exitCode}`);
        if (commit.exitCode !== 0) {
          throw new BadRequestException(`git commit 失败：${commit.stderr || commit.stdout}`);
        }
        committed = true;
      }

      const push = await this.runTextCommandWithEnv(
        'git',
        ['-C', rootAbs, 'push', '-u', 'origin', `HEAD:refs/heads/${agentBranch}`],
        rootAbs,
        env,
      );
      log.push(`[git push] exit=${push.exitCode}`);
      if (push.exitCode !== 0) {
        throw new BadRequestException(`git push 失败：${push.stderr || push.stdout}`);
      }

      const head = await this.runTextCommandWithEnv('git', ['-C', rootAbs, 'rev-parse', 'HEAD'], rootAbs, env);
      const commitHash = head.exitCode === 0 ? head.stdout.trim() || null : null;
      if (commitHash) {
        await this.markAgentWorkspaceReady(workspaceId, { headCommit: commitHash });
      }

      return {
        committed,
        pushed: true,
        branch: agentBranch,
        commitHash,
        log,
      };
    } finally {
      if (disposeAskpass) {
        try {
          await disposeAskpass();
        } catch {
          /* ignore */
        }
      }
    }
  }

  private async pathLooksLikeGitRepo(absDir: string): Promise<boolean> {
    try {
      await stat(join(absDir, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  /** 删除占位的空/损坏缓存目录，避免 `git clone` 报 destination already exists */
  private async removeOrphanAgentCacheDir(workspace: IAgentWorkspaceRow, cachePath: string): Promise<void> {
    const metaRoot = String(this.parseJsonObject(workspace.metadata).workspaceRoot || '')
      .trim()
      .replace(/\/+$/, '');
    if (!metaRoot || !cachePath.startsWith(`${metaRoot}/`)) return;
    try {
      await stat(cachePath);
    } catch {
      return;
    }
    if (await this.pathLooksLikeGitRepo(cachePath)) return;
    try {
      await rm(cachePath, { recursive: true, force: true });
    } catch {
      /* 忽略 */
    }
  }

  /** 清理上次失败的 worktree 目录，避免 `worktree add` 报目录已存在 */
  private async bestEffortRemoveStaleWorktree(
    workspace: IAgentWorkspaceRow,
    command: IWorkspaceLifecycleCommand,
  ): Promise<void> {
    if (command.key !== 'add_worktree' || command.args[0] !== 'git' || command.args[1] !== '-C') {
      return;
    }
    const cachePath = command.args[2];
    const worktreePath = command.args[7];
    if (!cachePath || !worktreePath) return;
    const metaRoot = String(this.parseJsonObject(workspace.metadata).workspaceRoot || '')
      .trim()
      .replace(/\/+$/, '');
    await this.runTextCommand('git', ['-C', cachePath, 'worktree', 'remove', '--force', worktreePath], process.cwd());
    if (metaRoot && worktreePath.startsWith(`${metaRoot}/`)) {
      try {
        await rm(worktreePath, { recursive: true, force: true });
      } catch {
        /* 目录不存在或非空残留时忽略 */
      }
    }
  }

  private parseGitNameStatus(output: string): Array<{ path: string; changeType: 'add' | 'modify' | 'delete' }> {
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [statusRaw, ...pathParts] = line.split(/\s+/);
        const path = pathParts.at(-1)?.trim() || '';
        if (!path) return null;
        const status = statusRaw.charAt(0).toUpperCase();
        const changeType = status === 'A' ? 'add' : status === 'D' ? 'delete' : 'modify';
        return { path, changeType };
      })
      .filter((item): item is { path: string; changeType: 'add' | 'modify' | 'delete' } => Boolean(item));
  }

  private extractTestCommandsFromOutput(output: string): string[] {
    const commands = new Set<string>();
    const patterns = [
      /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test|test:[A-Za-z0-9_.:-]+|ci:check|type:check(?::[A-Za-z0-9_.:-]+)?|lint(?::[A-Za-z0-9_.:-]+)?)(?:[^\n\r]*)?/i,
      /\bnpx\s+(?:jest|vitest|playwright)(?:[^\n\r]*)?/i,
      /\b(?:jest|vitest|pytest)(?:[^\n\r]*)?/i,
    ];
    for (const line of output.split(/\r?\n/)) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match?.[0]) {
          const command = match[0].replace(/[`'"，。；;]+$/g, '').trim();
          if (command) {
            commands.add(command.slice(0, 300));
          }
        }
      }
    }
    return Array.from(commands);
  }

  private async collectAgentWorkspaceReviewSummary(
    workspacePath: string,
    executionOutput = ''
  ): Promise<IAgentWorkspaceReviewSummary> {
    const [nameStatus, diffStat, statusShort] = await Promise.all([
      this.runTextCommand('git', ['diff', '--name-status'], workspacePath),
      this.runTextCommand('git', ['diff', '--stat', '--compact-summary'], workspacePath),
      this.runTextCommand('git', ['status', '--short'], workspacePath),
    ]);
    const errorMessage = [nameStatus, diffStat, statusShort]
      .filter((result) => result.exitCode !== 0)
      .map((result) => result.stderr.trim())
      .filter(Boolean)
      .join('\n');
    return {
      changedFiles: this.parseGitNameStatus(nameStatus.stdout),
      diffNameStatus: nameStatus.stdout.slice(-12000),
      diffStat: diffStat.stdout.slice(-12000),
      statusShort: statusShort.stdout.slice(-12000),
      detectedTestCommands: this.extractTestCommandsFromOutput(executionOutput),
      errorMessage: errorMessage || undefined,
    };
  }

  private async ensureAgentWorkspaceExecutable(workspace: IAgentWorkspaceRow, workspacePath: string): Promise<string | null> {
    if (workspace.status !== 'ready') {
      return `AgentWorkspace 尚未就绪：当前状态 ${workspace.status}。请先完成 git.clone_cache / git.fetch / git.worktree_add 生命周期工具调用，并标记 workspace ready`;
    }
    try {
      const info = await stat(workspacePath);
      if (!info.isDirectory()) {
        return `AgentWorkspace 路径不是目录：${workspacePath}`;
      }
    } catch {
      return `AgentWorkspace 路径不存在：${workspacePath}。请先执行 workspace 生命周期 git 工具调用`;
    }
    return null;
  }

  async *runAgentToolCallStream(
    id: string,
    body?: { prompt?: string | null; model?: string | null }
  ): AsyncGenerator<IAgentExecutionEvent> {
    const current = await this.startAgentToolCall(id);
    const workspaceId = current.workspaceId?.trim();
    if (!workspaceId) {
      const message = 'Codex 执行需要绑定 AgentWorkspace';
      const failed = await this.finishAgentToolCall(id, { exitCode: 1, errorMessage: message });
      yield { type: 'error', toolCallId: id, status: failed.status, message, toolCall: failed };
      return;
    }
    const workspace = await this.getAgentWorkspace(workspaceId);
    const workspacePath = workspace?.worktreePath?.trim();
    if (!workspace || !workspacePath) {
      const message = 'AgentWorkspace 尚未准备 worktreePath';
      const failed = await this.finishAgentToolCall(id, { exitCode: 1, errorMessage: message });
      yield { type: 'error', toolCallId: id, status: failed.status, message, toolCall: failed };
      return;
    }
    const workspaceExecutableError = await this.ensureAgentWorkspaceExecutable(workspace, workspacePath);
    if (workspaceExecutableError) {
      const failed = await this.finishAgentToolCall(id, {
        exitCode: 1,
        errorMessage: workspaceExecutableError,
        outputSummary: workspaceExecutableError,
      });
      yield {
        type: 'error',
        toolCallId: id,
        status: failed.status,
        message: workspaceExecutableError,
        toolCall: failed,
      };
      return;
    }

    const startedAt = Date.now();
    const metadata = this.parseJsonObject(current.metadata);
    const rawPrompt = String(body?.prompt || metadata.prompt || current.inputSummary || '').trim();
    const wsMeta = this.parseJsonObject(workspace.metadata);
    const docsPath =
      typeof wsMeta.docsRelativePath === 'string' && wsMeta.docsRelativePath.trim()
        ? wsMeta.docsRelativePath.trim()
        : 'docs/<会话目录>/';
    /** 简短问答（工作台识别后）不再拼接长篇编码授权，避免模型复述刷屏 */
    const chatOnlyLead = '【本轮为简短问答，非编码任务】';
    const isChatOnlyRound = rawPrompt.startsWith(chatOnlyLead);
    /** 旧版 plan 含「等待 TM 批准」时，模型会只读分析后 exit=0 不落盘；注入硬性执行授权 */
    const agentExecCodingPostamble =
      '\n\n---\n【系统执行授权】当前为 RD Agent 已准备的 Git worktree（产品目录为代码生成根，可含 backend、frontend、Dockerfile 等），Workspace 与计划在网页侧已就绪。\n' +
      '你必须在本仓库内**实际改文件**（分支、实现、测试或类型检查至少其一），不得以「等待技术经理批准」结束且无变更。\n' +
      `规格与 PRD 位于本 worktree 下 \`${docsPath}\`（相对仓库根；勿使用已废弃的 docs/ai-pipeline/），勿依赖不存在的 \`context/\` 路径。` +
      '\n\n【回复约束】若用户本轮只是询问身份、所用模型或简短确认，请用一两句中文作答，勿复述上文 Plan 或本段授权全文。';
    const agentExecChatOnlyPostamble =
      '\n\n---\n【环境】当前在 RD Agent 准备的仓库 worktree 中执行 Codex CLI。\n' +
      '【回复要求】仅用简短中文直接回答用户问题；禁止复述 Plan、禁止复述长篇系统说明、禁止罗列此前对话全文；除非用户明确要求改代码或执行命令，否则不要主动发起仓库修改。';
    const agentExecPostamble = isChatOnlyRound ? agentExecChatOnlyPostamble : agentExecCodingPostamble;
    const prompt = `${rawPrompt}${agentExecPostamble}`;
    if (!rawPrompt) {
      const message = 'Codex 执行缺少 prompt';
      const failed = await this.finishAgentToolCall(id, { exitCode: 1, errorMessage: message });
      yield { type: 'error', toolCallId: id, status: failed.status, message, toolCall: failed };
      return;
    }
    const command = this.buildCodexExecCommand({ prompt, workspacePath, model: body?.model ?? current.metadata.model as string | null });
    const started = await this.upsertAgentToolCall({
      ...current,
      status: 'running',
      command: [command.command, ...command.args].join(' '),
      startedAt: current.startedAt || new Date(startedAt).toISOString(),
      metadata: {
        ...metadata,
        executor: 'codex_cli',
        prompt,
        cwd: workspacePath,
        stdout: '',
        stderr: '',
        spawnVerified: false,
      },
    });
    yield { type: 'started', toolCallId: id, status: 'running', toolCall: started };

    let stdout = '';
    let stderr = '';
    let latestToolCall = started;
    const child = spawn(command.command, command.args, {
      cwd: workspacePath,
      env: process.env,
      shell: false,
      /** 不设 ignore 时默认 stdin 为 pipe，Codex 会等待 stdin，出现 “Reading additional input from stdin…” 长时间无进展 */
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const spawnedAt = new Date().toISOString();
    latestToolCall = await this.upsertAgentToolCall({
      ...started,
      metadata: {
        ...this.parseJsonObject(started.metadata),
        pid: child.pid ?? null,
        spawnedAt,
        codexCommand: [command.command, ...command.args].join(' '),
        spawnVerified: Boolean(child.pid),
      },
    });
    yield {
      type: 'spawned',
      toolCallId: id,
      status: 'running',
      pid: child.pid ?? null,
      cwd: workspacePath,
      command: [command.command, ...command.args].join(' '),
      timestamp: spawnedAt,
      toolCall: latestToolCall,
    };
    const execution: IAgentExecutionProcess = {
      child,
      startedAt,
      stdout: '',
      stderr: '',
      cancelled: false,
    };
    this.runningExecutions.set(id, execution);

    const codexLogRoot = String(process.env.RD_AGENT_CODEX_LOG_DIR || '/tmp/rd-agent-workspaces/codex-logs').trim();
    const logDir = join(codexLogRoot, workspace.sessionId);
    let logStream: WriteStream | null = null;
    let executorLogPath: string | null = null;
    const appendCodexLog = (channel: 'out' | 'err', text: string) => {
      if (!logStream) return;
      const tag = channel === 'err' ? '[stderr] ' : '';
      try {
        logStream.write(`[${new Date().toISOString()}] ${tag}${text}`);
      } catch {
        /* 磁盘满等 */
      }
    };
    try {
      await mkdir(logDir, { recursive: true });
      executorLogPath = join(logDir, `${id}.log`);
      logStream = createWriteStream(executorLogPath, { flags: 'w' });
      logStream.write(
        `# rd-dashboard Codex 执行日志\n# toolCallId=${id}\n# sessionId=${workspace.sessionId}\n# started=${spawnedAt}\n# cwd=${workspacePath}\n# command=${[command.command, ...command.args].join(' ')}\n\n`,
      );
      latestToolCall = await this.upsertAgentToolCall({
        ...latestToolCall,
        metadata: {
          ...this.parseJsonObject(latestToolCall.metadata),
          executorLogPath,
          executorLogStartedAt: spawnedAt,
        },
      });
    } catch (error) {
      this.logger.warn(`打开 Codex 落盘日志失败 session=${workspace.sessionId} tool=${id}: ${String(error)}`);
      logStream = null;
      executorLogPath = null;
    }

    const queue: IAgentExecutionEvent[] = [];
    let settled = false;
    let exitCode: number | null = null;
    let errorMessage: string | undefined;
    let firstOutputAt: string | null = null;
    const waiters: Array<() => void> = [];
    const notify = () => {
      const waiter = waiters.shift();
      waiter?.();
    };
    const push = (event: IAgentExecutionEvent) => {
      queue.push(event);
      notify();
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      firstOutputAt = firstOutputAt || new Date().toISOString();
      stdout += text;
      execution.stdout = stdout;
      appendCodexLog('out', text);
      push({
        type: 'stdout',
        toolCallId: id,
        chunk: text,
        status: 'running',
        stdoutBytes: Buffer.byteLength(stdout),
        stderrBytes: Buffer.byteLength(stderr),
        timestamp: new Date().toISOString(),
      });
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      firstOutputAt = firstOutputAt || new Date().toISOString();
      stderr += text;
      execution.stderr = stderr;
      appendCodexLog('err', text);
      push({
        type: 'stderr',
        toolCallId: id,
        chunk: text,
        status: 'running',
        stdoutBytes: Buffer.byteLength(stdout),
        stderrBytes: Buffer.byteLength(stderr),
        timestamp: new Date().toISOString(),
      });
    });
    child.on('error', (error) => {
      errorMessage = error instanceof Error ? error.message : String(error);
      exitCode = 1;
      settled = true;
      notify();
    });
    child.on('close', (code) => {
      exitCode = code ?? 0;
      settled = true;
      notify();
    });

    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      heartbeat = setInterval(() => {
        if (settled) return;
        push({
          type: 'heartbeat',
          toolCallId: id,
          status: 'running',
          durationMs: Date.now() - startedAt,
          stdoutBytes: Buffer.byteLength(stdout),
          stderrBytes: Buffer.byteLength(stderr),
          timestamp: new Date().toISOString(),
        });
      }, 1000);

      while (!settled || queue.length > 0) {
        const event = queue.shift();
        if (event) {
          latestToolCall = await this.persistAgentExecutionOutput(latestToolCall, {
            stdout,
            stderr,
            lastEventType: event.type,
          });
          yield event;
          continue;
        }
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (logStream) {
        try {
          logStream.write(`\n# end exit=${exitCode ?? '?'} cancelled=${execution.cancelled}\n`);
          logStream.end();
          await waitStreamFinished(logStream);
        } catch (error) {
          this.logger.warn(`关闭 Codex 日志文件失败 tool=${id}: ${String(error)}`);
        }
        logStream = null;
      }
    }

    const durationMs = Date.now() - startedAt;
    const outputSummary = stdout.slice(-4000) || stderr.slice(-4000) || errorMessage || null;
    const wasCancelled = execution.cancelled;
    const reviewSummary = await this.collectAgentWorkspaceReviewSummary(workspacePath, `${stdout}\n${stderr}`);
    const finished = await this.finishAgentToolCall(id, {
      exitCode: wasCancelled ? 130 : exitCode,
      durationMs,
      outputSummary: wasCancelled ? outputSummary || 'Codex 执行已取消' : outputSummary,
      errorMessage: wasCancelled ? 'Codex 执行已取消' : errorMessage,
      status: wasCancelled ? 'cancelled' : null,
    });
    const mergedMetadata = {
      ...this.parseJsonObject(finished.metadata),
      executor: 'codex_cli',
      prompt,
      cwd: workspacePath,
      stdout: stdout.slice(-20000),
      stderr: stderr.slice(-20000),
      executorLogPath: executorLogPath ?? this.parseJsonObject(finished.metadata).executorLogPath ?? null,
      executorLogFinishedAt: executorLogPath ? new Date().toISOString() : null,
      executorCancelled: wasCancelled,
      firstOutputAt,
      changedFiles: reviewSummary.changedFiles,
      diffNameStatus: reviewSummary.diffNameStatus,
      diffStat: reviewSummary.diffStat,
      statusShort: reviewSummary.statusShort,
      detectedTestCommands: reviewSummary.detectedTestCommands,
      diffReviewError: reviewSummary.errorMessage ?? null,
      finishedAt: new Date().toISOString(),
    };
    const finalToolCall = await this.upsertAgentToolCall({
      ...finished,
      metadata: mergedMetadata,
    });
    yield {
      type: 'finished',
      toolCallId: id,
      status: finalToolCall.status,
      exitCode: wasCancelled ? 130 : exitCode,
      durationMs,
      changedFilesCount: reviewSummary.changedFiles.length,
      stdoutBytes: Buffer.byteLength(stdout),
      stderrBytes: Buffer.byteLength(stderr),
      timestamp: new Date().toISOString(),
      toolCall: finalToolCall,
    };
    this.runningExecutions.delete(id);
  }

  async listAgentWorkspaces(sessionId: string): Promise<IAgentWorkspaceRow[]> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_agent_workspaces
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC;
    `);
    return this.rowsFromExecute(result).map((row) => this.rowToAgentWorkspace(row));
  }

  async getAgentWorkspace(id: string): Promise<IAgentWorkspaceRow | null> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_agent_workspaces WHERE id = ${id} LIMIT 1;
    `);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToAgentWorkspace(rows[0]) : null;
  }

  /** 资源树中跳过的体积/缓存目录名 */
  private readonly agentWorkspaceSourceSkipDirNames = new Set([
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    'coverage',
    '__pycache__',
    '.venv',
    'venv',
    '.turbo',
    '.parcel-cache',
    'out',
    'target',
  ]);

  private readonly agentWorkspaceBinarySuffixes = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.zip',
    '.tar',
    '.gz',
    '.7z',
    '.pdf',
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.mp4',
    '.mov',
    '.webm',
    '.mp3',
    '.wasm',
    '.pyc',
    '.bin',
  ]);

  private toPosixRelativePath(rootAbs: string, absPath: string): string {
    return relative(rootAbs, absPath).split(sep).join('/');
  }

  private assertWorkspaceFileWithinRoot(rootAbs: string, requestedRel: string): string {
    const rel = requestedRel.trim().replace(/\\/g, '/');
    if (!rel || rel.includes('..')) {
      throw new BadRequestException('非法文件路径');
    }
    const full = resolve(join(rootAbs, ...rel.split('/')));
    const relCheck = relative(rootAbs, full);
    if (relCheck.startsWith('..') || relCheck === '..') {
      throw new BadRequestException('路径越界');
    }
    return full;
  }

  private async readAgentWorkspaceTreeNodes(
    rootAbs: string,
    dirAbs: string,
    depth: number,
    budget: { entries: number; cap: number; maxDepth: number; truncated: boolean },
  ): Promise<IAgentWorkspaceSourceTreeNodeJson[]> {
    if (depth > budget.maxDepth || budget.entries >= budget.cap) {
      if (budget.entries >= budget.cap) {
        budget.truncated = true;
      }
      return [];
    }
    const dirents = await readdir(dirAbs, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[]);
    const sorted = [...dirents].sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    const nodes: IAgentWorkspaceSourceTreeNodeJson[] = [];
    for (const d of sorted) {
      if (budget.entries >= budget.cap) {
        budget.truncated = true;
        break;
      }
      if (d.isSymbolicLink()) {
        continue;
      }
      const abs = join(dirAbs, d.name);
      if (d.isDirectory()) {
        if (this.agentWorkspaceSourceSkipDirNames.has(d.name)) continue;
        budget.entries += 1;
        const children = await this.readAgentWorkspaceTreeNodes(rootAbs, abs, depth + 1, budget);
        nodes.push({
          name: d.name,
          path: this.toPosixRelativePath(rootAbs, abs),
          type: 'directory',
          children,
        });
        continue;
      }
      if (d.isFile()) {
        const ext = extname(d.name).toLowerCase();
        if (this.agentWorkspaceBinarySuffixes.has(ext)) continue;
        budget.entries += 1;
        nodes.push({
          name: d.name,
          path: this.toPosixRelativePath(rootAbs, abs),
          type: 'file',
        });
      }
    }
    return nodes;
  }

  async listAgentWorkspaceSourceTree(workspaceId: string): Promise<{
    worktreePath: string;
    nodes: IAgentWorkspaceSourceTreeNodeJson[];
    truncated: boolean;
  }> {
    const workspace = await this.getAgentWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundException('AgentWorkspace 不存在');
    }
    const worktreePath = workspace.worktreePath?.trim();
    if (!worktreePath) {
      throw new BadRequestException('Workspace 尚未就绪或缺少 worktreePath');
    }
    const rootAbs = resolve(worktreePath);
    const st = await stat(rootAbs).catch(() => null);
    if (!st?.isDirectory()) {
      throw new BadRequestException('工作目录不存在或不可读');
    }
    const budget = { entries: 0, cap: 1500, maxDepth: 14, truncated: false };
    const nodes = await this.readAgentWorkspaceTreeNodes(rootAbs, rootAbs, 0, budget);
    return {
      worktreePath: rootAbs,
      nodes,
      truncated: budget.truncated,
    };
  }

  async getAgentWorkspaceSourceFile(
    workspaceId: string,
    relativePath: string,
  ): Promise<{ path: string; content: string; truncated: boolean }> {
    const workspace = await this.getAgentWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundException('AgentWorkspace 不存在');
    }
    const worktreePath = workspace.worktreePath?.trim();
    if (!worktreePath) {
      throw new BadRequestException('Workspace 尚未就绪或缺少 worktreePath');
    }
    const rootAbs = resolve(worktreePath);
    const fullPath = this.assertWorkspaceFileWithinRoot(rootAbs, relativePath);
    const st = await stat(fullPath).catch(() => null);
    if (!st?.isFile()) {
      throw new NotFoundException('文件不存在');
    }
    const maxBytes = 1_000_000;
    if (st.size > maxBytes) {
      throw new BadRequestException('文件过大（>1MB），请在运行后端的主机本地查看');
    }
    const buf = await readFile(fullPath);
    const nul = buf.indexOf(0);
    if (nul !== -1) {
      throw new BadRequestException('暂不支持在浏览器中预览二进制文件');
    }
    const maxChars = 400_000;
    const text = buf.toString('utf8');
    const truncated = text.length > maxChars;
    const content = truncated
      ? `${text.slice(0, maxChars)}\n\n…（正文已截断，请在本地打开完整文件）`
      : text;
    return {
      path: this.toPosixRelativePath(rootAbs, fullPath),
      content,
      truncated,
    };
  }

  async upsertAgentWorkspace(
    body: Partial<IAgentWorkspaceRow> & {
      id?: string;
      sessionId: string;
      repoUrl: string;
      baseBranch: string;
      agentBranch: string;
    }
  ): Promise<IAgentWorkspaceRow> {
    const session = await this.getAgentSession(body.sessionId);
    if (!session) {
      throw new BadRequestException('关联 AgentSession 不存在或已删除');
    }
    const now = new Date().toISOString();
    const id = body.id?.trim() || `awork_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await this.db.execute(sql`
      INSERT INTO rd_agent_workspaces (
        id, session_id, pipeline_run_id, kind, status, repo_url, base_branch, agent_branch,
        worktree_path, base_commit, head_commit, lock_owner_task_id, is_write_locked,
        metadata, created_at, updated_at, cleaned_at
      ) VALUES (
        ${id},
        ${body.sessionId},
        ${body.pipelineRunId ?? session.pipelineRunId ?? null},
        ${body.kind || 'worktree'},
        ${body.status || 'provisioning'},
        ${body.repoUrl},
        ${body.baseBranch},
        ${body.agentBranch},
        ${body.worktreePath ?? null},
        ${body.baseCommit ?? null},
        ${body.headCommit ?? null},
        ${body.lockOwnerTaskId ?? null},
        ${body.isWriteLocked ?? false},
        ${JSON.stringify(body.metadata ?? {})}::jsonb,
        ${body.createdAt ?? now}::timestamptz,
        ${body.updatedAt ?? now}::timestamptz,
        ${body.cleanedAt ?? null}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        pipeline_run_id = EXCLUDED.pipeline_run_id,
        kind = EXCLUDED.kind,
        status = EXCLUDED.status,
        repo_url = EXCLUDED.repo_url,
        base_branch = EXCLUDED.base_branch,
        agent_branch = EXCLUDED.agent_branch,
        worktree_path = EXCLUDED.worktree_path,
        base_commit = EXCLUDED.base_commit,
        head_commit = EXCLUDED.head_commit,
        lock_owner_task_id = EXCLUDED.lock_owner_task_id,
        is_write_locked = EXCLUDED.is_write_locked,
        metadata = EXCLUDED.metadata,
        updated_at = EXCLUDED.updated_at,
        cleaned_at = EXCLUDED.cleaned_at;
    `);
    const rows = await this.listAgentWorkspaces(body.sessionId);
    return rows.find((row) => row.id === id)!;
  }

  private async recordWorkspaceToolCall(input: {
    sessionId: string;
    workspaceId: string;
    command: IWorkspaceLifecycleCommand;
  }): Promise<IAgentToolCallRow> {
    return this.upsertAgentToolCall({
      id: `wtool_${input.workspaceId}_${input.command.orderIndex}_${input.command.key}`,
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      toolName: input.command.toolName,
      toolCategory: input.command.toolCategory,
      status: 'pending',
      approvalStatus: input.command.riskLevel === 'high' ? 'pending' : 'not_required',
      riskLevel: input.command.riskLevel,
      inputSummary: input.command.summary,
      command: input.command.command,
      metadata: {
        args: input.command.args,
        workspaceCommandKey: input.command.key,
        orderIndex: input.command.orderIndex,
        cleanup: Boolean(input.command.cleanup),
      },
    });
  }

  private workspaceLifecycleCommandsFromMetadata(workspace: IAgentWorkspaceRow): IWorkspaceLifecycleCommand[] {
    const metadata = this.parseJsonObject(workspace.metadata);
    const rawPlan = metadata.lifecyclePlan;
    if (!Array.isArray(rawPlan)) return [];
    return rawPlan
      .reduce<IWorkspaceLifecycleCommand[]>((commands, item) => {
        const row = this.parseJsonObject(item);
        const command = String(row.command || '').trim();
        const args = Array.isArray(row.args) ? row.args.map((arg) => String(arg)) : [];
        if (!command || args.length === 0) return commands;
        commands.push({
          key: row.key as IWorkspaceLifecycleCommand['key'],
          toolName: String(row.toolName || ''),
          toolCategory: (row.toolCategory as IWorkspaceLifecycleCommand['toolCategory']) || 'git',
          summary: String(row.summary || ''),
          command,
          args,
          riskLevel: (row.riskLevel as IWorkspaceLifecycleCommand['riskLevel']) || 'low',
          orderIndex: Number(row.orderIndex ?? 0),
          cleanup: Boolean(row.cleanup),
        });
        return commands;
      }, [])
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async executeAgentWorkspaceLifecycle(workspaceId: string): Promise<IAgentWorkspaceProvisionResult> {
    const workspace = await this.getAgentWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundException('AgentWorkspace 不存在');
    }
    const commands = this.workspaceLifecycleCommandsFromMetadata(workspace).filter((command) => !command.cleanup);
    if (!commands.length) {
      throw new BadRequestException('Workspace 缺少 lifecyclePlan');
    }
    const toolCalls: IAgentToolCallRow[] = [];
    let failed = false;
    for (const command of commands) {
      const toolCallId = `wtool_${workspaceId}_${command.orderIndex}_${command.key}`;
      const startedAt = Date.now();
      const existing = await this.getAgentToolCall(toolCallId);

      if (command.key === 'clone_cache') {
        const cachePath = command.args[command.args.length - 1];
        if (cachePath && (await this.pathLooksLikeGitRepo(cachePath))) {
          const skipped = await this.upsertAgentToolCall({
            ...(existing || {
              id: toolCallId,
              sessionId: workspace.sessionId,
              workspaceId,
              toolName: command.toolName,
              toolCategory: command.toolCategory,
              riskLevel: command.riskLevel,
              approvalStatus: command.riskLevel === 'high' ? 'pending' : 'not_required',
              inputSummary: command.summary,
              command: command.command,
              metadata: {},
            }),
            status: 'succeeded',
            exitCode: 0,
            durationMs: 0,
            outputSummary: `已存在本地缓存，跳过 clone：${cachePath}`,
            finishedAt: new Date().toISOString(),
            metadata: {
              ...this.parseJsonObject(existing?.metadata),
              args: command.args,
              workspaceCommandKey: command.key,
              orderIndex: command.orderIndex,
              skippedCloneCache: true,
            },
          });
          toolCalls.push(skipped);
          continue;
        }
        await this.removeOrphanAgentCacheDir(workspace, cachePath);
      }

      if (command.key === 'add_worktree') {
        await this.bestEffortRemoveStaleWorktree(workspace, command);
      }

      const started = await this.upsertAgentToolCall({
        ...(existing || {
          id: toolCallId,
          sessionId: workspace.sessionId,
          workspaceId,
          toolName: command.toolName,
          toolCategory: command.toolCategory,
          riskLevel: command.riskLevel,
          approvalStatus: command.riskLevel === 'high' ? 'pending' : 'not_required',
          inputSummary: command.summary,
          command: command.command,
          metadata: {},
        }),
        status: 'running',
        startedAt: existing?.startedAt || new Date(startedAt).toISOString(),
        metadata: {
          ...this.parseJsonObject(existing?.metadata),
          args: command.args,
          workspaceCommandKey: command.key,
          orderIndex: command.orderIndex,
          executedAt: new Date().toISOString(),
        },
      });
      const result = await this.runTextCommand(command.args[0], command.args.slice(1), process.cwd());
      const durationMs = Date.now() - startedAt;
      const finished = await this.upsertAgentToolCall({
        ...started,
        status: result.exitCode === 0 ? 'succeeded' : 'failed',
        exitCode: result.exitCode,
        durationMs,
        outputSummary: (result.stdout || result.stderr).slice(-4000),
        finishedAt: new Date().toISOString(),
        metadata: {
          ...this.parseJsonObject(started.metadata),
          stdout: result.stdout.slice(-20000),
          stderr: result.stderr.slice(-20000),
        },
      });
      toolCalls.push(finished);
      if (result.exitCode !== 0) {
        failed = true;
        break;
      }
    }
    const updatedWorkspace = failed
      ? await this.upsertAgentWorkspace({ ...workspace, status: 'failed' })
      : await this.markAgentWorkspaceReady(workspaceId);
    return {
      workspace: updatedWorkspace,
      plan: {
        repoUrl: workspace.repoUrl,
        baseBranch: workspace.baseBranch,
        agentBranch: workspace.agentBranch,
        workspaceRoot: String(this.parseJsonObject(workspace.metadata).workspaceRoot || ''),
        cachePath: String(this.parseJsonObject(workspace.metadata).cachePath || ''),
        worktreePath: workspace.worktreePath || '',
        commands,
      },
      toolCalls,
    };
  }

  async provisionAgentWorkspace(body: {
    sessionId: string;
    repoUrl: string;
    baseBranch?: string | null;
    agentBranch?: string | null;
    workspaceRoot?: string | null;
    kind?: AgentWorkspaceKind;
    createdBy?: string | null;
    productSlug?: string | null;
    sessionFolderName?: string | null;
  }): Promise<IAgentWorkspaceProvisionResult> {
    const session = await this.getAgentSession(body.sessionId);
    if (!session) {
      throw new BadRequestException('关联 AgentSession 不存在或已删除');
    }
    let productSlug = (body.productSlug || '').trim();
    let sessionFolderName = (body.sessionFolderName || '').trim();
    if (session.pipelineRunId) {
      const run = await this.getPipelineRun(session.pipelineRunId);
      const snap = (run?.contextSnapshot || {}) as Record<string, unknown>;
      if (!productSlug) {
        productSlug = String(snap.workspaceProductSlug || snap.workspace_product_slug || '').trim();
      }
      if (!sessionFolderName) {
        sessionFolderName = String(snap.workspaceSessionFolder || snap.workspace_session_folder || '').trim();
      }
      const taskId = String(snap.pipelineTaskId || '').trim();
      if ((!productSlug || !sessionFolderName) && taskId) {
        const task = await this.getPipelineTask(taskId);
        const meta = (task?.pipelineMeta || {}) as IPipelineMeta;
        if (!productSlug) productSlug = (meta.workspaceProductSlug || '').trim();
        if (!sessionFolderName) sessionFolderName = (meta.workspaceSessionFolder || '').trim();
      }
    }
    if (!productSlug && sessionFolderName && session.requirementId) {
      const req = await this.getRequirement(session.requirementId);
      if (req) {
        productSlug = resolveWorkspaceProductSlug({
          productIdentifier: undefined,
          productId: undefined,
          requirementProductKey: req.product,
        });
      }
    }
    const id = `awork_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const plan = buildAgentWorkspaceLifecyclePlan({
      workspaceId: id,
      sessionId: body.sessionId,
      requirementId: session.requirementId,
      pipelineRunId: session.pipelineRunId,
      repoUrl: body.repoUrl,
      baseBranch: body.baseBranch || session.baseBranch,
      agentBranch: body.agentBranch?.trim() || undefined,
      workspaceRoot: body.workspaceRoot,
      kind: body.kind || 'worktree',
      productSlug: productSlug || undefined,
      sessionFolderName: sessionFolderName || undefined,
    });
    const workspace = await this.upsertAgentWorkspace({
      id,
      sessionId: body.sessionId,
      pipelineRunId: session.pipelineRunId,
      kind: body.kind || 'worktree',
      status: 'provisioning',
      repoUrl: plan.repoUrl,
      baseBranch: plan.baseBranch,
      agentBranch: plan.agentBranch,
      worktreePath: plan.worktreePath,
      isWriteLocked: false,
      metadata: {
        workspaceRoot: plan.workspaceRoot,
        cachePath: plan.cachePath,
        docsSessionFolder: sessionFolderName || null,
        docsRelativePath: sessionFolderName ? `docs/${sessionFolderName}` : null,
        lifecyclePlan: plan.commands.map((command) => ({
          key: command.key,
          toolName: command.toolName,
          toolCategory: command.toolCategory,
          summary: command.summary,
          command: command.command,
          args: command.args,
          orderIndex: command.orderIndex,
          riskLevel: command.riskLevel,
          cleanup: Boolean(command.cleanup),
        })),
        createdBy: body.createdBy ?? null,
      },
    });
    const toolCalls: IAgentToolCallRow[] = [];
    for (const command of plan.commands) {
      toolCalls.push(await this.recordWorkspaceToolCall({ sessionId: body.sessionId, workspaceId: id, command }));
    }
    return { workspace, plan, toolCalls };
  }

  async markAgentWorkspaceReady(
    workspaceId: string,
    body?: { baseCommit?: string | null; headCommit?: string | null; lockOwnerTaskId?: string | null }
  ): Promise<IAgentWorkspaceRow> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_agent_workspaces WHERE id = ${workspaceId} LIMIT 1;
    `);
    const current = this.rowsFromExecute(result)[0];
    if (!current) {
      throw new NotFoundException('AgentWorkspace 不存在');
    }
    const workspace = this.rowToAgentWorkspace(current);
    return this.upsertAgentWorkspace({
      ...workspace,
      status: 'ready',
      baseCommit: body?.baseCommit ?? workspace.baseCommit,
      headCommit: body?.headCommit ?? workspace.headCommit,
      lockOwnerTaskId: body?.lockOwnerTaskId ?? workspace.lockOwnerTaskId,
      isWriteLocked: Boolean(body?.lockOwnerTaskId ?? workspace.lockOwnerTaskId),
    });
  }

  async cleanupAgentWorkspace(workspaceId: string): Promise<IAgentWorkspaceProvisionResult> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_agent_workspaces WHERE id = ${workspaceId} LIMIT 1;
    `);
    const current = this.rowsFromExecute(result)[0];
    if (!current) {
      throw new NotFoundException('AgentWorkspace 不存在');
    }
    const workspace = this.rowToAgentWorkspace(current);
    const cachePath = String(this.parseJsonObject(workspace.metadata).cachePath || '').trim();
    if (!cachePath || !workspace.worktreePath) {
      throw new BadRequestException('Workspace 缺少 cleanup 所需路径信息');
    }
    const command = buildAgentWorkspaceCleanupCommand({
      cachePath,
      worktreePath: workspace.worktreePath,
    });
    const toolCall = await this.recordWorkspaceToolCall({
      sessionId: workspace.sessionId,
      workspaceId,
      command,
    });
    const cleaned = await this.upsertAgentWorkspace({
      ...workspace,
      status: 'archived',
      isWriteLocked: false,
      cleanedAt: new Date().toISOString(),
    });
    return {
      workspace: cleaned,
      plan: {
        repoUrl: cleaned.repoUrl,
        baseBranch: cleaned.baseBranch,
        agentBranch: cleaned.agentBranch,
        workspaceRoot: String(this.parseJsonObject(cleaned.metadata).workspaceRoot || ''),
        cachePath,
        worktreePath: cleaned.worktreePath || '',
        commands: [command],
      },
      toolCalls: [toolCall],
    };
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
          code: body.code !== undefined ? nullIfEmpty(body.code) : existing.code,
          identifier:
            body.identifier !== undefined ? nullIfEmpty(body.identifier) : existing.identifier,
          name: body.name !== undefined ? String(body.name) : existing.name,
          description: body.description !== undefined ? String(body.description) : existing.description,
          owner: body.owner !== undefined ? nullIfEmpty(body.owner) : existing.owner,
          technicalManager:
            body.technicalManager !== undefined ? nullIfEmpty(body.technicalManager) : existing.technicalManager,
          productType: body.productType !== undefined ? nullIfEmpty(body.productType) : existing.productType,
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
          code: nullIfEmpty(body.code),
          identifier: nullIfEmpty(body.identifier),
          name: String(body.name || '').trim(),
          description: String(body.description ?? ''),
          owner: nullIfEmpty(body.owner),
          technicalManager: nullIfEmpty(body.technicalManager),
          productType: nullIfEmpty(body.productType),
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
    if (!(merged.identifier ?? '').trim()) {
      throw new BadRequestException('产品标识不能为空');
    }

    await this.db.execute(sql`
      INSERT INTO rd_products (
        id, code, identifier, name, description, owner, technical_manager, product_type,
        sandbox_url, production_url, git_url,
        status, created_by, updated_by, created_at, updated_at
      ) VALUES (
        ${merged.id},
        ${merged.code ?? null},
        ${merged.identifier!.trim()},
        ${merged.name.trim()},
        ${merged.description},
        ${merged.owner ?? null},
        ${merged.technicalManager ?? null},
        ${merged.productType ?? null},
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
        code = EXCLUDED.code,
        identifier = EXCLUDED.identifier,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        owner = EXCLUDED.owner,
        technical_manager = EXCLUDED.technical_manager,
        product_type = EXCLUDED.product_type,
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

  private rowToBountyTask(r: Record<string, unknown>): IBountyTaskRow {
    const t = this.tsFromRow(r);
    const toStatus = (raw: unknown): BountyTaskStatus => {
      const s = String(raw || 'open');
      if (s === 'developing' || s === 'delivered' || s === 'settled' || s === 'rework') {
        return s;
      }
      return 'open';
    };
    const toDifficulty = (raw: unknown): 'normal' | 'hard' | 'epic' => {
      const s = String(raw || 'normal');
      if (s === 'hard' || s === 'epic') return s;
      return 'normal';
    };
    const pmUid = (r.pm_user_id as string) || (r.pmUserId as string) || null;
    const tmUid = (r.tm_user_id as string) || (r.tmUserId as string) || null;
    const legacyHunter = (r.hunter_user_id as string) || (r.hunterUserId as string) || null;
    return {
      id: String(r.id),
      requirementId: String(r.requirement_id ?? r.requirementId),
      publisherId: String(r.publisher_id ?? r.publisherId),
      publisherName: (r.publisher_name as string) || (r.publisherName as string) || null,
      title: String(r.title || ''),
      description: String(r.description || ''),
      rewardCoins: Number(r.reward_coins ?? r.rewardCoins ?? 0),
      depositCoins: Number(r.deposit_coins ?? r.depositCoins ?? 0),
      consolationCoins: Number(r.consolation_coins ?? r.consolationCoins ?? 1),
      difficultyTag: toDifficulty(r.difficulty_tag ?? r.difficultyTag),
      deadlineAt: this.toIso(r.deadline_at ?? r.deadlineAt),
      acceptStatus: toStatus(r.accept_status ?? r.acceptStatus),
      hunterUserId: legacyHunter,
      hunterUserName: (r.hunter_user_name as string) || (r.hunterUserName as string) || null,
      pmUserId: pmUid,
      pmUserName: (r.pm_user_name as string) || (r.pmUserName as string) || null,
      tmUserId: tmUid,
      tmUserName: (r.tm_user_name as string) || (r.tmUserName as string) || null,
      pmAcceptedAt: r.pm_accepted_at != null ? this.toIso(r.pm_accepted_at) : (r.pmAcceptedAt != null ? this.toIso(r.pmAcceptedAt) : null),
      tmAcceptedAt: r.tm_accepted_at != null ? this.toIso(r.tm_accepted_at) : (r.tmAcceptedAt != null ? this.toIso(r.tmAcceptedAt) : null),
      acceptedAt: (r.accepted_at as string) || (r.acceptedAt as string) || null,
      deliveredAt: (r.delivered_at as string) || (r.deliveredAt as string) || null,
      settledAt: (r.settled_at as string) || (r.settledAt as string) || null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  private async getBountyTaskRow(id: string): Promise<IBountyTaskRow | null> {
    const result = await this.db.execute(sql`SELECT * FROM rd_bounty_tasks WHERE id = ${id} LIMIT 1;`);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToBountyTask(rows[0]) : null;
  }

  /**
   * 悬赏接槽成功后回写需求 pm/tm 与 taskAcceptances；不改变需求 status（AI开发中由创建流水线驱动）。
   */
  private async syncRequirementAfterBountyAccept(
    requirementId: string,
    role: 'pm' | 'tm',
    userId: string,
    userName: string | undefined,
  ): Promise<void> {
    const req = await this.getRequirement(requirementId);
    if (!req) {
      throw new NotFoundException('需求不存在');
    }
    if (role === 'pm') {
      if (req.taskAcceptances.some((t) => t.role === 'pm')) {
        throw new BadRequestException('产品经理任务已被领取');
      }
      if (req.pm) {
        throw new BadRequestException('产品经理任务已被领取');
      }
      const record: ITaskAcceptanceRecord = {
        id: `ta_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        role: 'pm',
        userId,
        userName,
        coins: req.pmCoins,
        acceptedAt: new Date().toISOString(),
      };
      await this.upsertRequirement({
        id: requirementId,
        pm: userId,
        taskAcceptances: [...req.taskAcceptances, record],
        updatedBy: userId,
      });
      return;
    }
    if (req.taskAcceptances.some((t) => t.role === 'tm')) {
      throw new BadRequestException('技术经理任务已被领取');
    }
    if (req.tm) {
      throw new BadRequestException('技术经理任务已被领取');
    }
    const record: ITaskAcceptanceRecord = {
      id: `ta_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      role: 'tm',
      userId,
      userName,
      coins: req.tmCoins,
      acceptedAt: new Date().toISOString(),
    };
    await this.upsertRequirement({
      id: requirementId,
      tm: userId,
      taskAcceptances: [...req.taskAcceptances, record],
      updatedBy: userId,
    });
  }

  async listBountyTasks(huntOnly = false): Promise<IBountyTaskRow[]> {
    if (huntOnly) {
      const result = await this.db.execute(sql`
        SELECT b.*
        FROM rd_bounty_tasks b
        WHERE b.accept_status = 'open'
          AND (b.pm_user_id IS NULL OR b.tm_user_id IS NULL)
        ORDER BY b.updated_at DESC;
      `);
      const rows = this.rowsFromExecute(result);
      return rows.map((row) => this.rowToBountyTask(row));
    }
    const result = await this.db.execute(sql`SELECT * FROM rd_bounty_tasks ORDER BY updated_at DESC;`);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToBountyTask(row));
  }

  private rowToSiteMessage(r: Record<string, unknown>): ISiteMessageRow {
    return {
      id: r.id as string,
      recipientUserId: (r.recipient_user_id as string) || (r.recipientUserId as string),
      title: String(r.title ?? ''),
      body: String(r.body ?? ''),
      linkUrl: (r.link_url as string) || (r.linkUrl as string) || '/bounty-hunt',
      readAt:
        r.read_at != null
          ? this.toIso(r.read_at)
          : r.readAt != null
            ? this.toIso(r.readAt)
            : null,
      createdAt: this.toIso(r.created_at ?? r.createdAt),
      kind: (r.kind as string) || null,
      relatedBountyTaskId:
        (r.related_bounty_task_id as string) || (r.relatedBountyTaskId as string) || null,
    };
  }

  /**
   * 角色为产品经理或技术经理的用户 id（去重）。
   */
  private async listPmAndTmUserIds(): Promise<string[]> {
    const junction = await this.db.execute(sql`
      SELECT user_id AS id FROM rd_user_access_roles
      WHERE role_id IN (${BUILTIN_ACCESS_ROLE_PM}, ${BUILTIN_ACCESS_ROLE_TM});
    `);
    const legacy = await this.db.execute(sql`
      SELECT id FROM rd_users
      WHERE access_role_id IN (${BUILTIN_ACCESS_ROLE_PM}, ${BUILTIN_ACCESS_ROLE_TM});
    `);
    const ids = new Set<string>();
    for (const row of this.rowsFromExecute<{ id: string }>(junction)) {
      if (row.id) ids.add(row.id);
    }
    for (const row of this.rowsFromExecute<{ id: string }>(legacy)) {
      if (row.id) ids.add(row.id);
    }
    return [...ids];
  }

  /**
   * 新发悬赏时通知所有 PM/TM（不含发起人本人）；失败仅记日志，不影响主流程。
   */
  private async notifyPmAndTmOnBountyPublished(params: {
    publisherId: string;
    publisherName: string;
    taskTitle: string;
    bountyTaskId: string;
  }): Promise<void> {
    try {
      const recipients = (await this.listPmAndTmUserIds()).filter(
        (id) => id && id !== params.publisherId,
      );
      if (recipients.length === 0) return;

      const title = '【悬赏通知】';
      const body = `金主【${params.publisherName}】发起了一条悬赏任务【${params.taskTitle}】，请速到赏金猎场查看`;
      /** 站内可导航的相对路径；前端也可拼接 origin 作绝对链接 */
      const linkUrl = `/bounty-hunt`;
      const now = new Date().toISOString();
      const kind = 'bounty_notice';

      for (const uid of recipients) {
        const mid = `msg_${params.bountyTaskId}_${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await this.db.execute(sql`
          INSERT INTO rd_site_messages (
            id, recipient_user_id, title, body, link_url, read_at, created_at, kind, related_bounty_task_id
          ) VALUES (
            ${mid}, ${uid}, ${title}, ${body}, ${linkUrl}, NULL, ${now}::timestamptz, ${kind}, ${params.bountyTaskId}
          );
        `);
      }
    } catch (e) {
      this.logger.warn(
        `悬赏站内信广播失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async listSiteMessages(recipientUserId: string): Promise<ISiteMessageRow[]> {
    const uid = String(recipientUserId || '').trim();
    if (!uid) return [];
    const result = await this.db.execute(sql`
      SELECT * FROM rd_site_messages
      WHERE recipient_user_id = ${uid}
      ORDER BY created_at DESC
      LIMIT 200;
    `);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToSiteMessage(row));
  }

  async markSiteMessageRead(messageId: string, recipientUserId: string): Promise<ISiteMessageRow> {
    const mid = String(messageId || '').trim();
    const uid = String(recipientUserId || '').trim();
    if (!mid) throw new BadRequestException('缺少消息 id');
    if (!uid) throw new BadRequestException('缺少用户标识');
    const now = new Date().toISOString();
    const result = await this.db.execute(sql`
      UPDATE rd_site_messages
      SET read_at = ${now}::timestamptz
      WHERE id = ${mid} AND recipient_user_id = ${uid}
      RETURNING *;
    `);
    const rows = this.rowsFromExecute(result);
    if (!rows[0]) {
      throw new NotFoundException('消息不存在');
    }
    return this.rowToSiteMessage(rows[0]);
  }

  async createBountyTask(
    body: Partial<IBountyTaskRow> & { requirementId: string; publisherId: string; title: string }
  ): Promise<IBountyTaskRow> {
    const id = body.id || `bty_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const rewardCoins = Math.max(0, Math.floor(Number(body.rewardCoins ?? 0)));
    const depositCoins = Math.max(0, Math.floor(Number(body.depositCoins ?? Math.floor(rewardCoins * 0.1))));
    const consolationCoins = Math.max(0, Math.floor(Number(body.consolationCoins ?? 1)));
    const deadlineAt = body.deadlineAt ? this.toIso(body.deadlineAt) : new Date(Date.now() + 3600_000).toISOString();
    const difficultyTag: 'normal' | 'hard' | 'epic' =
      body.difficultyTag === 'epic' || body.difficultyTag === 'hard' ? body.difficultyTag : 'normal';

    const dup = await this.db.execute(sql`
      SELECT id FROM rd_bounty_tasks
      WHERE requirement_id = ${body.requirementId}
        AND deadline_at > NOW()
        AND id <> ${id}
      LIMIT 1;
    `);
    if (this.rowsFromExecute<{ id: string }>(dup)[0]) {
      throw new BadRequestException('该需求已有悬赏在有效期内，截止前不可重复发布');
    }

    await this.db.execute(sql`
      INSERT INTO rd_bounty_tasks (
        id, requirement_id, publisher_id, publisher_name, title, description,
        reward_coins, deposit_coins, consolation_coins, difficulty_tag, deadline_at,
        accept_status, created_at, updated_at
      ) VALUES (
        ${id}, ${body.requirementId}, ${body.publisherId}, ${body.publisherName ?? null}, ${body.title},
        ${body.description ?? ''}, ${rewardCoins}, ${depositCoins}, ${consolationCoins}, ${difficultyTag},
        ${deadlineAt}::timestamptz, 'open', ${now}::timestamptz, ${now}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        reward_coins = EXCLUDED.reward_coins,
        deposit_coins = EXCLUDED.deposit_coins,
        consolation_coins = EXCLUDED.consolation_coins,
        difficulty_tag = EXCLUDED.difficulty_tag,
        deadline_at = EXCLUDED.deadline_at,
        updated_at = EXCLUDED.updated_at;
    `);
    const result = await this.db.execute(sql`SELECT * FROM rd_bounty_tasks WHERE id = ${id} LIMIT 1;`);
    const rows = this.rowsFromExecute(result);
    const task = this.rowToBountyTask(rows[0]);

    const pubName =
      String(body.publisherName ?? '')
        .trim() || task.publisherId;
    void this.notifyPmAndTmOnBountyPublished({
      publisherId: body.publisherId,
      publisherName: pubName,
      taskTitle: body.title,
      bountyTaskId: id,
    });

    return task;
  }

  async acceptBountyTask(
    id: string,
    body: { role: 'pm' | 'tm'; hunterUserId: string; hunterUserName?: string },
  ): Promise<{ ok: boolean; task?: IBountyTaskRow; consolationCoins?: number; bothFilled?: boolean }> {
    const role = body.role;
    if (role !== 'pm' && role !== 'tm') {
      throw new BadRequestException('role 须为 pm 或 tm');
    }
    const hunterUserId = String(body.hunterUserId || '').trim();
    if (!hunterUserId) throw new BadRequestException('缺少接单用户');

    const bountyBefore = await this.getBountyTaskRow(id);
    if (!bountyBefore) {
      throw new NotFoundException('悬赏任务不存在');
    }
    const reqForClaim = await this.getRequirement(bountyBefore.requirementId);
    if (!reqForClaim) {
      throw new NotFoundException('关联需求不存在');
    }
    await this.assertUserMayClaimRequirementSlot(reqForClaim, role, hunterUserId);
    const pmReady = Boolean(bountyBefore.pmUserId) || Boolean(bountyBefore.hunterUserId);
    if (role === 'tm' && !pmReady) {
      throw new BadRequestException('请先由产品经理领取本悬赏');
    }

    const now = new Date().toISOString();
    let result: unknown;
    if (role === 'pm') {
      result = await this.db.execute(sql`
        UPDATE rd_bounty_tasks
        SET
          pm_user_id = ${hunterUserId},
          pm_user_name = ${body.hunterUserName ?? null},
          pm_accepted_at = ${now}::timestamptz,
          accept_status = CASE WHEN tm_user_id IS NOT NULL THEN 'developing' ELSE 'open' END,
          accepted_at = CASE WHEN tm_user_id IS NOT NULL THEN ${now}::timestamptz ELSE accepted_at END,
          updated_at = ${now}::timestamptz
        WHERE id = ${id}
          AND accept_status = 'open'
          AND pm_user_id IS NULL
        RETURNING *;
      `);
    } else {
      result = await this.db.execute(sql`
        UPDATE rd_bounty_tasks
        SET
          tm_user_id = ${hunterUserId},
          tm_user_name = ${body.hunterUserName ?? null},
          tm_accepted_at = ${now}::timestamptz,
          accept_status = 'developing',
          accepted_at = ${now}::timestamptz,
          updated_at = ${now}::timestamptz
        WHERE id = ${id}
          AND accept_status = 'open'
          AND tm_user_id IS NULL
          AND pm_user_id IS NOT NULL
        RETURNING *;
      `);
    }
    const rows = this.rowsFromExecute(result);
    if (!rows[0]) {
      const fallback = await this.db.execute(sql`SELECT consolation_coins FROM rd_bounty_tasks WHERE id = ${id} LIMIT 1;`);
      const frows = this.rowsFromExecute<{ consolation_coins?: number }>(fallback);
      return { ok: false, consolationCoins: Number(frows[0]?.consolation_coins ?? 1) };
    }
    const task = this.rowToBountyTask(rows[0]);
    const bothFilled = Boolean(task.pmUserId && task.tmUserId);
    /** 赏金仅写 rd_bounty_tasks；须同步 rd_requirements.pm/tm 与 task_acceptances，否则仪表盘等依赖需求表的逻辑得到 null。 */
    await this.syncRequirementAfterBountyAccept(
      bountyBefore.requirementId,
      role,
      hunterUserId,
      body.hunterUserName,
    );
    return { ok: true, task, bothFilled };
  }

  async deliverBountyTask(id: string, actorUserId: string): Promise<IBountyTaskRow> {
    const now = new Date().toISOString();
    const result = await this.db.execute(sql`
      UPDATE rd_bounty_tasks
      SET accept_status = 'delivered', delivered_at = ${now}::timestamptz, updated_at = ${now}::timestamptz
      WHERE id = ${id}
        AND accept_status = 'developing'
        AND (pm_user_id = ${actorUserId} OR tm_user_id = ${actorUserId})
      RETURNING *;
    `);
    const rows = this.rowsFromExecute(result);
    if (!rows[0]) throw new BadRequestException('任务未处于可交付状态或无权限');
    return this.rowToBountyTask(rows[0]);
  }

  async settleBountyTask(id: string): Promise<IBountyTaskRow> {
    const now = new Date().toISOString();
    const result = await this.db.execute(sql`
      UPDATE rd_bounty_tasks
      SET accept_status = 'settled', settled_at = ${now}::timestamptz, updated_at = ${now}::timestamptz
      WHERE id = ${id} AND accept_status = 'delivered'
      RETURNING *;
    `);
    const rows = this.rowsFromExecute(result);
    if (!rows[0]) throw new BadRequestException('任务未处于待验收状态');
    return this.rowToBountyTask(rows[0]);
  }

  async rejectBountyTask(id: string): Promise<IBountyTaskRow> {
    const now = new Date().toISOString();
    const result = await this.db.execute(sql`
      UPDATE rd_bounty_tasks
      SET accept_status = 'rework', updated_at = ${now}::timestamptz
      WHERE id = ${id} AND accept_status = 'delivered'
      RETURNING *;
    `);
    const rows = this.rowsFromExecute(result);
    if (!rows[0]) throw new BadRequestException('任务未处于待验收状态');
    return this.rowToBountyTask(rows[0]);
  }
}
