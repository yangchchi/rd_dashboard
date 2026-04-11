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
export type OrgSpecLanguage = 'java' | 'python' | 'go' | 'node' | 'react' | 'vue' | 'typescript';

/** 任务领取记录；金币在需求「已发布」后对领取人生效 */
export interface ITaskAcceptanceRecord {
  id: string;
  role: 'pm' | 'tm';
  userId: string;
  userName?: string;
  coins: number;
  acceptedAt: string;
}

/** 产品目录（结构化元数据；需求里的「所属产品」可与 name 对齐） */
export interface IProduct {
  id: string;
  name: string;
  description: string;
  owner?: string;
  sandboxUrl?: string;
  productionUrl?: string;
  gitUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IRequirement {
  id: string;
  title: string;
  description: string;
  sketchUrl?: string;
  /** 所属产品 */
  product?: string;
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
}

export interface IOrgLanguageSpec {
  language: OrgSpecLanguage;
  displayName: string;
  enabled: boolean;
  styleGuide: string[];
  mustFollow: string[];
  forbidden: string[];
  toolchain: string[];
  testing: string[];
}

export interface IOrganizationSpecConfig {
  id: string;
  orgName: string;
  version: number;
  defaultLanguage: OrgSpecLanguage;
  updatedAt: string;
  languages: Record<OrgSpecLanguage, IOrgLanguageSpec>;
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
  result: 'approved' | 'rejected';
  createdAt: string;
}

export interface IUser {
  id: string;
  username: string;
  /** 姓名 */
  name?: string;
  email?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ILoginResponse {
  token: string;
  user: IUser;
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

export interface IPipelineMeta {
  name?: string;
  gitUrl?: string;
  branch?: string;
  triggerMode?: 'manual' | 'push' | 'schedule';
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  remarks?: string;
  prdIds?: string[];
  specIds?: string[];
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
  pipelineMeta: IPipelineMeta;
  commitStore?: IPipelineCommitStore;
  createdAt?: string;
  updatedAt?: string;
}
