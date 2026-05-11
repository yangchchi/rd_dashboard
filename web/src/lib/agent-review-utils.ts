import type { IAgentToolCall } from './rd-types';

export interface IAgentDiffReviewFile {
  path: string;
  changeType: 'add' | 'modify' | 'delete';
}

export interface IAgentDiffReviewSummary {
  files: IAgentDiffReviewFile[];
  testCommands: string[];
  failedCommands: string[];
  riskHints: string[];
  approved: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function collectFileHints(toolCall: IAgentToolCall): IAgentDiffReviewFile[] {
  const metadata = asRecord(toolCall.metadata);
  const rawFiles = metadata.changedFiles;
  if (Array.isArray(rawFiles)) {
    return rawFiles
      .map((item) => {
        const row = asRecord(item);
        const path = String(row.path || '').trim();
        const changeTypeRaw = String(row.changeType || row.type || 'modify');
        const changeType: IAgentDiffReviewFile['changeType'] =
          changeTypeRaw === 'add' || changeTypeRaw === 'delete' ? changeTypeRaw : 'modify';
        return path ? { path, changeType } : null;
      })
      .filter((item): item is IAgentDiffReviewFile => Boolean(item));
  }
  const diffNameStatus = typeof metadata.diffNameStatus === 'string' ? metadata.diffNameStatus : '';
  if (diffNameStatus.trim()) {
    return diffNameStatus
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [statusRaw, ...pathParts] = line.split(/\s+/);
        const path = pathParts.at(-1)?.trim() || '';
        if (!path) return null;
        const status = statusRaw.charAt(0).toUpperCase();
        const changeType: IAgentDiffReviewFile['changeType'] =
          status === 'A' ? 'add' : status === 'D' ? 'delete' : 'modify';
        return { path, changeType };
      })
      .filter((item): item is IAgentDiffReviewFile => Boolean(item));
  }
  const summary = `${toolCall.outputSummary || ''}\n${toolCall.inputSummary || ''}`;
  const matches = summary.match(/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g) || [];
  return Array.from(new Set(matches)).map((path) => ({ path, changeType: 'modify' as const }));
}

function collectDetectedTestCommands(toolCall: IAgentToolCall): string[] {
  const metadata = asRecord(toolCall.metadata);
  const rawCommands = metadata.detectedTestCommands;
  if (Array.isArray(rawCommands)) {
    return rawCommands
      .map((command) => String(command || '').trim())
      .filter(Boolean);
  }
  return [];
}

function isTestToolCall(toolCall: IAgentToolCall): boolean {
  if (toolCall.toolCategory === 'test') return true;
  if (toolCall.toolCategory === 'ai' || toolCall.toolCategory === 'git' || toolCall.toolCategory === 'file') {
    return false;
  }
  return /\b(npm\s+(?:run\s+)?(?:test|ci:check|type:check|lint)|pnpm\s+(?:test|run\s+test)|yarn\s+(?:test|run\s+test)|npx\s+(?:jest|vitest|playwright)|jest|vitest|pytest|tsc)\b/i.test(toolCall.command || '');
}

export function buildAgentDiffReviewSummary(toolCalls: IAgentToolCall[]): IAgentDiffReviewSummary {
  const filesByPath = new Map<string, IAgentDiffReviewFile>();
  const testCommands = new Set<string>();
  const failedCommands = new Set<string>();
  const riskHints = new Set<string>();
  let approved = false;

  for (const toolCall of toolCalls) {
    for (const file of collectFileHints(toolCall)) {
      filesByPath.set(file.path, file);
    }
    for (const command of collectDetectedTestCommands(toolCall)) {
      testCommands.add(command);
    }
    if (isTestToolCall(toolCall)) {
      const command = toolCall.command || toolCall.inputSummary;
      if (command) testCommands.add(command);
      if (toolCall.status === 'failed' || Number(toolCall.exitCode ?? 0) !== 0) {
        failedCommands.add(command || toolCall.toolName);
      }
    }
    if (toolCall.riskLevel === 'high') {
      riskHints.add(`${toolCall.toolName}: 高风险工具调用`);
    }
    if (toolCall.approvalStatus === 'rejected') {
      riskHints.add(`${toolCall.toolName}: 审批已拒绝`);
    }
    const metadata = asRecord(toolCall.metadata);
    if (metadata.diffReviewApproved === true) {
      approved = true;
    }
    if (typeof metadata.riskHint === 'string' && metadata.riskHint.trim()) {
      riskHints.add(metadata.riskHint.trim());
    }
    if (typeof metadata.diffReviewError === 'string' && metadata.diffReviewError.trim()) {
      riskHints.add(`diff review: ${metadata.diffReviewError.trim()}`);
    }
  }

  return {
    files: Array.from(filesByPath.values()).sort((a, b) => a.path.localeCompare(b.path)),
    testCommands: Array.from(testCommands),
    failedCommands: Array.from(failedCommands),
    riskHints: Array.from(riskHints),
    approved,
  };
}
