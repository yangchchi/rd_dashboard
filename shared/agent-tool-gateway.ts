export type ToolGatewayCategory = 'shell' | 'git' | 'file' | 'test' | 'deploy' | 'browser' | 'ai' | 'other';
export type ToolGatewayRiskLevel = 'low' | 'medium' | 'high';
export type ToolGatewayApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';
export type ToolGatewayCallStatus =
  | 'pending'
  | 'awaiting_approval'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface IPrepareToolCallInput {
  toolName: string;
  toolCategory: ToolGatewayCategory;
  command?: string | null;
  requestedRiskLevel?: ToolGatewayRiskLevel | null;
  requestedApprovalStatus?: ToolGatewayApprovalStatus | null;
  timeoutMs?: number | null;
}

export interface IPreparedToolCallPolicy {
  riskLevel: ToolGatewayRiskLevel;
  approvalStatus: ToolGatewayApprovalStatus;
  status: ToolGatewayCallStatus;
  timeoutMs: number;
  reason: string;
}

const DEFAULT_TIMEOUT_MS = 120000;
const MAX_TIMEOUT_MS = 900000;
const DANGEROUS_COMMAND_RE = /\b(rm\s+-rf|sudo|chmod\s+777|chown\s+-R|mkfs|dd\s+if=|shutdown|reboot|curl\b.*\|\s*(sh|bash)|wget\b.*\|\s*(sh|bash))\b/i;
const NETWORK_INSTALL_RE = /\b(npm|pnpm|yarn|pip|poetry|cargo|go)\s+(install|add|get|update)\b/i;
const DEPLOY_RE = /\b(kubectl|helm|terraform|vercel|flyctl|railway|wrangler|deploy)\b/i;
const PUSH_RE = /\bgit\s+push\b/i;
const TEST_RE = /\b(test|jest|vitest|playwright|pytest|go\s+test|cargo\s+test|npm\s+run\s+type|tsc)\b/i;

function clampTimeout(timeoutMs?: number | null): number {
  if (!Number.isFinite(timeoutMs || NaN)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Number(timeoutMs), 1000), MAX_TIMEOUT_MS);
}

function maxRisk(a: ToolGatewayRiskLevel, b: ToolGatewayRiskLevel): ToolGatewayRiskLevel {
  const order: Record<ToolGatewayRiskLevel, number> = { low: 1, medium: 2, high: 3 };
  return order[a] >= order[b] ? a : b;
}

export function inferToolRisk(input: Pick<IPrepareToolCallInput, 'toolCategory' | 'command' | 'toolName'>): {
  riskLevel: ToolGatewayRiskLevel;
  reason: string;
} {
  const command = String(input.command || '').trim();
  if (input.toolCategory === 'deploy' || DEPLOY_RE.test(command)) {
    return { riskLevel: 'high', reason: 'deploy-capable tool requires explicit approval' };
  }
  if (DANGEROUS_COMMAND_RE.test(command)) {
    return { riskLevel: 'high', reason: 'destructive shell pattern requires explicit approval' };
  }
  if (PUSH_RE.test(command)) {
    return { riskLevel: 'high', reason: 'git push mutates a remote branch' };
  }
  if (NETWORK_INSTALL_RE.test(command)) {
    return { riskLevel: 'medium', reason: 'dependency install or network package mutation' };
  }
  if (input.toolCategory === 'file' || input.toolCategory === 'git') {
    return { riskLevel: 'medium', reason: 'workspace mutation should be audited' };
  }
  if (input.toolCategory === 'test' || TEST_RE.test(command)) {
    return { riskLevel: 'low', reason: 'read-mostly verification command' };
  }
  return { riskLevel: 'low', reason: 'default low-risk tool call' };
}

export function prepareToolCallPolicy(input: IPrepareToolCallInput): IPreparedToolCallPolicy {
  const inferred = inferToolRisk(input);
  const riskLevel = input.requestedRiskLevel
    ? maxRisk(input.requestedRiskLevel, inferred.riskLevel)
    : inferred.riskLevel;
  const approvalStatus: ToolGatewayApprovalStatus =
    input.requestedApprovalStatus ||
    (riskLevel === 'high' ? 'pending' : 'not_required');
  const status: ToolGatewayCallStatus = approvalStatus === 'pending' ? 'awaiting_approval' : 'pending';
  return {
    riskLevel,
    approvalStatus,
    status,
    timeoutMs: clampTimeout(input.timeoutMs),
    reason: inferred.reason,
  };
}

export function assertToolCallCanStart(input: {
  status: ToolGatewayCallStatus;
  approvalStatus: ToolGatewayApprovalStatus;
}): void {
  if (input.approvalStatus === 'pending') {
    throw new Error('tool call requires approval before execution');
  }
  if (input.approvalStatus === 'rejected') {
    throw new Error('tool call approval was rejected');
  }
  if (input.status !== 'pending' && input.status !== 'awaiting_approval') {
    throw new Error(`tool call cannot start from status ${input.status}`);
  }
}
