import { Activity, CheckCircle2, Code2, FileCheck, Loader2, XCircle } from 'lucide-react';
import type { ComponentType } from 'react';

import type {
  AgentToolApprovalStatus,
  AgentToolCallStatus,
  IPipelinePublishedDocument,
  IProduct,
  IRequirement,
} from '@/lib/rd-types';

export interface PipelineStatusConfig {
  label: string;
  color: string;
  icon: ComponentType<{ className?: string }>;
}

export const pipelineStatusConfig: Record<string, PipelineStatusConfig> = {
  code_generating: { label: '代码生成中', color: 'bg-purple-500', icon: Code2 },
  self_testing: { label: '自动化测试中', color: 'bg-blue-500', icon: FileCheck },
  building: { label: '构建中', color: 'bg-indigo-500', icon: Activity },
  deploying: { label: '部署中', color: 'bg-orange-500', icon: Loader2 },
  completed: { label: '已完成', color: 'bg-green-500', icon: CheckCircle2 },
  failed: { label: '失败', color: 'bg-red-500', icon: XCircle },
};

export const pipelineLogLevelColors: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  success: 'text-green-400',
};

export function extractPipelineErrorMessage(input: unknown, fallback: string): string {
  if (!input) return fallback;
  if (typeof input === 'string') return input;
  if (input instanceof Error) return input.message || fallback;
  if (Array.isArray(input)) {
    const text = input
      .map((item) => extractPipelineErrorMessage(item, ''))
      .filter((item) => item.trim().length > 0)
      .join('；');
    return text || fallback;
  }
  if (typeof input === 'object') {
    const data = input as Record<string, unknown>;
    const preferred = data.message ?? data.error ?? data.details ?? data.reason;
    if (preferred !== undefined) {
      const text = extractPipelineErrorMessage(preferred, '');
      if (text) return text;
    }
    const json = JSON.stringify(data);
    return json === '{}' ? fallback : json;
  }
  return String(input);
}

export function publishedDocsFromPublishResult(result: unknown): IPipelinePublishedDocument[] {
  const r = result as { documents?: IPipelinePublishedDocument[] };
  if (Array.isArray(r.documents) && r.documents.length > 0) return r.documents;
  return [];
}

export function findProductForRequirement(
  requirement: IRequirement | undefined,
  products: IProduct[]
): IProduct | undefined {
  const key = requirement?.product?.trim();
  if (!key) return undefined;
  const byId = products.find((p) => p.id === key);
  if (byId) return byId;
  const lower = key.toLowerCase();
  return products.find((p) => p.name.trim().toLowerCase() === lower);
}

export function isValidPipelineGitUrl(url: string): boolean {
  const normalized = url.trim();
  if (!normalized) return false;
  const httpPattern = /^https?:\/\/.+\.git$/i;
  const sshPattern = /^git@[\w.-]+:[\w./-]+\.git$/i;
  return httpPattern.test(normalized) || sshPattern.test(normalized);
}

export function formatPipelineFileTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** 与后端 {@link assertToolCallCanStart} 对齐：待审批或被拒绝时不可启动。 */
export function canStartAgentToolCall(
  status: AgentToolCallStatus | undefined,
  approvalStatus?: AgentToolApprovalStatus | null,
): boolean {
  if (!status) return false;
  if (status !== 'pending' && status !== 'awaiting_approval') return false;
  if (approvalStatus === 'pending' || approvalStatus === 'rejected') return false;
  if (status === 'awaiting_approval' && (approvalStatus === undefined || approvalStatus === null)) {
    return false;
  }
  return true;
}

export function shouldCreateAgentToolCallRetry(status: AgentToolCallStatus | undefined): boolean {
  return status === 'failed' || status === 'succeeded' || status === 'cancelled';
}
