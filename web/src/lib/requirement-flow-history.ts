import type { UserInput } from '@/components/business-ui/types/user';
import type {
  IAcceptanceRecord,
  IPipelineTask,
  IPrd,
  IRequirement,
  ISpecification,
} from '@/lib/rd-types';

export interface IFlowHistoryItem {
  id: string;
  action: string;
  stage: string;
  operator: UserInput;
  timestamp: string;
  comment?: string;
}

/** 与登录用户一致时用于补全展示名（批量查用户接口在本项目中可能为空实现） */
export interface IFlowHistoryViewer {
  id: string;
  username: string;
  name?: string;
}

const PLACEHOLDER_OPERATOR_LABELS = new Set(['当前用户', '未知', '未知用户']);

function isPlaceholderOperatorLabel(label: string): boolean {
  return PLACEHOLDER_OPERATOR_LABELS.has(label.trim());
}

function resolveOperatorDisplay(
  userId: string | null | undefined,
  explicit: string | null | undefined,
  viewer: IFlowHistoryViewer | null | undefined
): string | undefined {
  const ex = explicit?.trim();
  if (ex && !isPlaceholderOperatorLabel(ex)) return ex;
  const id = (userId || '').trim();
  if (viewer && id && viewer.id === id) {
    const n = viewer.name?.trim();
    const u = viewer.username?.trim();
    if (n || u) return n || u;
  }
  if (id && id !== 'system') return id;
  return undefined;
}

function operatorUser(
  userId: string | null | undefined,
  displayName: string | null | undefined,
  viewer?: IFlowHistoryViewer | null
): UserInput {
  const id = (userId || '').trim() || 'system';
  const resolved = resolveOperatorDisplay(userId, displayName, viewer ?? null);
  if (resolved) {
    return { user_id: id, name: { zh_cn: resolved, en_us: resolved } };
  }
  return { user_id: id };
}

/**
 * 根据需求及其关联 PRD / 规格 / 流水线 / 验收记录构造流转时间轴（按时间升序）。
 */
export function buildRequirementFlowHistory(
  requirement: IRequirement,
  prd: IPrd | undefined,
  spec: ISpecification | undefined,
  pipelineTasks: IPipelineTask[],
  acceptanceForReq: IAcceptanceRecord[],
  viewer?: IFlowHistoryViewer | null
): IFlowHistoryItem[] {
  const items: IFlowHistoryItem[] = [];

  items.push({
    id: `${requirement.id}-created`,
    action: '需求创建',
    stage: '需求池',
    operator: operatorUser(
      requirement.createdBy || requirement.submitter,
      requirement.submitterName || requirement.submitter,
      viewer
    ),
    timestamp: requirement.createdAt,
    comment: '提交初始需求',
  });

  if (prd) {
    items.push({
      id: `${prd.id}-prd-enter`,
      action: '进入PRD阶段',
      stage: 'PRD编写中',
      operator: operatorUser(prd.createdBy, prd.author, viewer),
      timestamp: prd.createdAt || prd.updatedAt,
      comment: '需求评审通过，开始PRD编写',
    });

    if (prd.status === 'reviewing' || prd.status === 'approved' || prd.status === 'rejected') {
      const action =
        prd.status === 'approved'
          ? 'PRD完成'
          : prd.status === 'reviewing'
            ? 'PRD已提交评审'
            : 'PRD已驳回';
      const comment =
        prd.status === 'approved'
          ? 'PRD文档已完成，等待技术评审'
          : prd.status === 'reviewing'
            ? 'PRD已提交审核'
            : 'PRD被驳回，请修改后重提';
      items.push({
        id: `${prd.id}-prd-milestone`,
        action,
        stage: 'PRD编写中',
        operator: operatorUser(prd.updatedBy || prd.createdBy, prd.author, viewer),
        timestamp: prd.updatedAt,
        comment,
      });
    }
  }

  if (spec) {
    items.push({
      id: `${spec.id}-spec-enter`,
      action: '进入规格阶段',
      stage: '规格说明书',
      operator: operatorUser(spec.createdBy, undefined, viewer),
      timestamp: spec.createdAt,
      comment: '技术评审通过，开始规格说明书编写',
    });

    if (spec.status === 'approved') {
      items.push({
        id: `${spec.id}-spec-done`,
        action: '规格完成',
        stage: '规格说明书',
        operator: operatorUser(spec.updatedBy || spec.createdBy, undefined, viewer),
        timestamp: spec.updatedAt,
        comment: '技术规格已确定，Machine-Readable格式已生成',
      });
    }
  }

  const tasksForReq = pipelineTasks
    .filter((t) => t.requirementId === requirement.id)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.createdAt || a.updatedAt || 0).getTime() -
        new Date(b.createdAt || b.updatedAt || 0).getTime()
    );
  const firstTask = tasksForReq[0];
  if (firstTask) {
    items.push({
      id: `${firstTask.id}-ai`,
      action: '进入AI开发',
      stage: 'AI开发中',
      operator: operatorUser(firstTask.createdBy, undefined, viewer),
      timestamp: firstTask.createdAt || firstTask.updatedAt || requirement.updatedAt,
      comment: 'AI开始自动生成代码',
    });
  }

  const accSorted = acceptanceForReq
    .filter((a) => a.requirementId === requirement.id)
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const acc of accSorted) {
    items.push({
      id: acc.id,
      action: acc.result === 'approved' ? '验收通过' : '验收不通过',
      stage: '验收中心',
      operator: operatorUser(acc.createdBy || acc.reviewer, acc.reviewer, viewer),
      timestamp: acc.createdAt,
      comment: acc.feedback || undefined,
    });
  }

  if (requirement.status === 'released') {
    items.push({
      id: `${requirement.id}-released`,
      action: '已发布',
      stage: '已发布',
      operator: operatorUser(requirement.updatedBy, requirement.submitterName, viewer),
      timestamp: requirement.updatedAt,
      comment: '需求已闭环发布',
    });
  }

  items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return items;
}
