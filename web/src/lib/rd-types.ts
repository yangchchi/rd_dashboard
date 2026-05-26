import type { RequirementChangeType } from '@shared/product-baseline';

export type RequirementStatus =
  | 'backlog'
  | 'prd_writing'
  | 'spec_defining'
  | 'ai_developing'
  | 'pending_acceptance'
  | 'released';

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type Role = 'stakeholder' | 'pm' | 'tm';
export type ReviewStatus = 'draft' | 'reviewing' | 'approved' | 'rejected';
export type SpecStatus = 'draft' | 'reviewing' | 'approved';
export type { OrgSpecLanguage, IOrgLanguageSpec, IOrganizationSpecConfig } from '@shared/org-spec-defaults';
export type {
  RequirementChangeType,
  ProductCapabilitySource,
  ProductCapabilityInterfaceKind,
  IProductCapability,
  IProductCapabilityInterface,
  IProductBaseline,
  IRequirementImpactPreview,
} from '@shared/product-baseline';
export {
  REQUIREMENT_CHANGE_TYPE_LABELS,
  REQUIREMENT_CHANGE_TYPE_HINTS,
  REQUIREMENT_CHANGE_TYPE_OPTIONS,
  isBrownfieldChangeType,
  normalizeRequirementChangeType,
} from '@shared/product-baseline';

export interface IAiSkillConfig {
  id: string;
  name: string;
  description?: string;
  provider: 'ark';
  endpoint?: string;
  model: string;
  stream?: boolean;
  tools?: Array<Record<string, unknown>>;
  promptTemplate: string;
  updatedAt?: string;
}

/** 任务领取记录；金币在需求「已发布」后对领取人生效 */
export interface ITaskAcceptanceRecord {
  id: string;
  role: 'pm' | 'tm';
  userId: string;
  userName?: string;
  coins: number;
  acceptedAt: string;
}

export type BountyTaskStatus = 'open' | 'developing' | 'delivered' | 'settled' | 'rework';

export interface IBountyTask {
  id: string;
  requirementId: string;
  publisherId: string;
  publisherName?: string;
  title: string;
  description: string;
  rewardCoins: number;
  depositCoins: number;
  consolationCoins: number;
  difficultyTag: 'normal' | 'hard' | 'epic';
  deadlineAt: string;
  acceptStatus: BountyTaskStatus;
  /** @deprecated 旧版单人猎人 */
  hunterUserId?: string;
  hunterUserName?: string;
  pmUserId?: string;
  pmUserName?: string;
  tmUserId?: string;
  tmUserName?: string;
  pmAcceptedAt?: string;
  tmAcceptedAt?: string;
  acceptedAt?: string;
  deliveredAt?: string;
  settledAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** 产品目录（结构化元数据；需求里的「所属产品」可与 name 对齐） */
export type ProductLifecycleStatus = 'active' | 'archived';

export interface IProduct {
  id: string;
  /** 产品编码（主数据唯一业务键，可与名称并列展示） */
  code?: string;
  /** 产品标识（必填主数据，用于系统内识别与展示，建议使用英文/数字/短横线） */
  identifier?: string;
  name: string;
  description: string;
  /** 产品负责人 */
  owner?: string;
  /** 技术经理 */
  technicalManager?: string;
  /** 产品类型（如自研系统、平台型产品等） */
  productType?: string;
  sandboxUrl?: string;
  productionUrl?: string;
  gitUrl?: string;
  status?: ProductLifecycleStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface IRequirement {
  id: string;
  title: string;
  description: string;
  sketchUrl?: string;
  /** 所属产品（展示名，与产品主数据 name 对齐） */
  product?: string;
  /** 所属产品主数据 ID */
  productId?: string;
  /** 变更类型：greenfield | enhancement | defect | refactor */
  changeType?: RequirementChangeType;
  /** Brownfield 时引用的产品基线 */
  baselineId?: string;
  /** 金币总数（提交人设定，PM/TM 按份额分配） */
  bountyPoints?: number;
  /** 产品经理份额 */
  pmCoins?: number;
  /** 技术经理份额 */
  tmCoins?: number;
  /** 仅该用户可领取产品经理任务 */
  pmCandidateUserId?: string;
  /** 仅该用户可领取技术经理任务 */
  tmCandidateUserId?: string;
  taskAcceptances?: ITaskAcceptanceRecord[];
  priority: Priority;
  expectedDate: string;
  status: RequirementStatus;
  submitter: string;
  pm?: string;
  tm?: string;
  createdAt: string;
  updatedAt: string;
  submitterName?: string;
  aiCategory?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface IRequirementFlowEvent {
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

export interface IFeature {
  id: string;
  name: string;
  description: string;
  acceptanceCriteria: string[];
}

export interface IPrd {
  id: string;
  requirementId: string;
  /** 与主需求合并为同一份 PRD 的其它需求 id */
  linkedRequirementIds?: string[];
  title?: string;
  background: string;
  objectives: string;
  flowchart?: string;
  featureList: IFeature[];
  nonFunctional: string;
  status: ReviewStatus;
  version: number;
  author?: string;
  createdAt?: string;
  updatedAt: string;
  reviews?: IReviewRecord[];
  createdBy?: string;
  updatedBy?: string;
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

export interface ISpecification {
  id: string;
  prdId: string;
  fsMarkdown?: string;
  tsMarkdown?: string;
  /** 编程计划（CP），Markdown，对应流水线下载包中的 plan.md */
  cpMarkdown?: string;
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
  status: SpecStatus;
  createdAt: string;
  updatedAt: string;
  reviews?: IReviewRecord[];
  createdBy?: string;
  updatedBy?: string;
}

export interface IReviewRecord {
  id: string;
  reviewer: string;
  action: 'submit' | 'approved' | 'rejected';
  comment?: string;
  createdAt: string;
}

export interface IAcceptanceRecord {
  id: string;
  requirementId: string;
  reviewer: string;
  scores: {
    functionality: number;
    valueMatch: number;
    experience: number;
  };
  feedback: string;
  result: 'pending' | 'approved' | 'rejected';
  status?: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface IUser {
  id: string;
  username: string;
  /** 姓名 */
  name?: string;
  email?: string;
  phone?: string;
  /** 头像地址（https 或 data:image 等） */
  avatarUrl?: string;
  /** 界面主题偏好 */
  themePreference?: 'light' | 'dark' | 'system';
  /** 与「角色定义」中的角色 id 对应，用于菜单/页面/按钮级权限（并集） */
  accessRoleIds?: string[];
  /** 主展示用角色，与 accessRoleIds 由内建优先级推导同步 */
  accessRoleId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ILoginResponse {
  token: string;
  user: IUser;
}

/** 站内信 */
export interface ISiteMessage {
  id: string;
  recipientUserId: string;
  title: string;
  body: string;
  linkUrl: string;
  readAt?: string;
  createdAt: string;
  kind?: string;
  relatedBountyTaskId?: string;
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

/** 由 FS / TS / 生成代码推导的自动化测试用例（持久化在流水线任务上） */
export interface IPipelineGeneratedTestCase {
  id: string;
  title: string;
  basis: Array<'fs' | 'ts' | 'code'>;
  /** 与规约或代码的对应说明 */
  trace: string;
  steps: string;
  expected: string;
  relatedApiPath?: string;
}

/** 单次自动化测试执行快照（与代码审查历史类似，可回看） */
export interface IPipelineTestRunRecord {
  id: string;
  createdAt: string;
  testReport: IPipelineTestReport;
  caseIds: string[];
  note?: string;
}

export interface IPipelineQualityMetrics {
  specConsistency: number;
  apiCoverage: number;
  codeQuality: number;
  testPassRate: number;
}

/** 单次「AI 代码审查」持久化记录（含当次解析出的质量指标快照） */
export interface IPipelineCodeReviewRecord {
  id: string;
  createdAt: string;
  summaryMarkdown: string;
  qualityMetrics: IPipelineQualityMetrics;
}

/** 提交到 Git 的单个文档（用于在流水线页拼 Web 链接） */
export interface IPipelinePublishedDocument {
  path: string;
  kind: 'prd' | 'fs' | 'ts' | 'cp';
  id: string;
  title: string;
}

export interface IPipelineMeta {
  name?: string;
  gitUrl?: string;
  /** 沙箱环境访问地址（常从产品目录带入） */
  sandboxUrl?: string;
  /**
   * 与 Agent 推送/工作目录一致的分支名（新流水线通常为需求 ID，如 req_xxx）。
   * 旧数据中本字段表示「远端基准分支」，此时无 `gitBaseBranch`。
   */
  branch?: string;
  /** 检出与 fetch 使用的远端基准分支；存在时表示 `branch` 为工作/推送分支 */
  gitBaseBranch?: string;
  triggerMode?: 'manual' | 'push' | 'schedule';
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  remarks?: string;
  prdIds?: string[];
  specIds?: string[];
  /** 本次提交写入仓库的文档清单（由 pipeline-git publish 返回） */
  publishedDocuments?: IPipelinePublishedDocument[];
  /** Agent worktree 第一层目录（产品标识），如 ai-generation */
  workspaceProductSlug?: string;
  /** 与 docs 下会话目录名一致，本会话唯一标识 */
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

export interface IPipelineTask {
  id: string;
  requirementId: string;
  requirementTitle: string;
  status: PipelineTaskStatus;
  progress: number;
  stage: string;
  startTime: string;
  estimatedEndTime: string;
  logs: IPipelineLogEntry[];
  testReport?: IPipelineTestReport;
  qualityMetrics?: IPipelineQualityMetrics;
  /** AI 根据 FS/TS/代码生成的测试用例清单 */
  generatedTestCases?: IPipelineGeneratedTestCase[];
  /** 每次「执行自动化测试」的报告快照历史 */
  testRunHistory?: IPipelineTestRunRecord[];
  /** 按时间顺序的审查历史，服务端持久化 */
  codeReviewHistory?: IPipelineCodeReviewRecord[];
  pipelineMeta: IPipelineMeta;
  commitStore?: IPipelineCommitStore;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export type PipelineRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type PipelineStepRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface IPipelineRun {
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

export interface IPipelineStepRun {
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

export interface IAgentSession {
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

export interface IAgentTask {
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

export interface IAgentToolCall {
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
  toolCall?: IAgentToolCall;
}

export interface IAgentWorkspace {
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

export interface IAgentWorkspaceSourceTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: IAgentWorkspaceSourceTreeNode[];
}

export interface IAgentWorkspaceSourceTreeResponse {
  worktreePath: string;
  nodes: IAgentWorkspaceSourceTreeNode[];
  truncated: boolean;
}

export interface IWorkspaceLifecycleCommand {
  key: 'clone_cache' | 'fetch_base' | 'add_worktree' | 'clone_branch' | 'checkout_agent_branch' | 'cleanup_worktree';
  toolName: string;
  toolCategory: 'git' | 'file';
  summary: string;
  command: string;
  args: string[];
  riskLevel: AgentRiskLevel;
  orderIndex: number;
  cleanup?: boolean;
}

export interface IAgentWorkspaceLifecyclePlan {
  repoUrl: string;
  baseBranch: string;
  agentBranch: string;
  workspaceRoot: string;
  cachePath: string;
  worktreePath: string;
  commands: IWorkspaceLifecycleCommand[];
}

export interface IAgentWorkspaceProvisionResult {
  workspace: IAgentWorkspace;
  plan: IAgentWorkspaceLifecyclePlan;
  toolCalls: IAgentToolCall[];
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

export interface IContextPack {
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
