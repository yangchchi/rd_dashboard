/**
 * 流水线 Git 分支元数据解析。
 *
 * 新流水线在 `pipelineMeta` 中同时保存：
 * - `gitBaseBranch`：远端检出/抓取基准（通常为 main）
 * - `branch`：Agent 工作目录与推送使用的分支名（通常为需求 ID，如 req_xxx）
 *
 * 旧数据仅有 `branch`，语义为「基准分支」，与历史行为兼容。
 */

export type IPipelineBranchMetaInput = {
  gitBaseBranch?: string | null;
  branch?: string | null;
};

/** 用于 git fetch / worktree 的远端基准分支名 */
export function resolvePipelineGitBaseBranch(meta: IPipelineBranchMetaInput | undefined): string {
  const explicit = meta?.gitBaseBranch?.trim();
  if (explicit) return explicit;
  return meta?.branch?.trim() || 'main';
}

/**
 * 传给 Workspace 生命周期的显式 agent 分支名。
 * 仅在存在 `gitBaseBranch` 时返回（新流水线）；否则 undefined，由服务端生成 codex/rd-… 分支。
 */
export function resolvePipelineExplicitAgentBranch(
  meta: IPipelineBranchMetaInput | undefined,
  requirementId: string,
): string | undefined {
  if (!meta?.gitBaseBranch?.trim()) return undefined;
  const w = meta.branch?.trim() || requirementId?.trim();
  return w || undefined;
}

/** 界面展示用的「工作/推送分支」标签 */
export function resolvePipelineWorkspaceBranchLabel(
  meta: IPipelineBranchMetaInput | undefined,
  requirementId: string,
): string {
  if (meta?.gitBaseBranch?.trim()) {
    return meta.branch?.trim() || requirementId || 'main';
  }
  return meta?.branch?.trim() || requirementId || 'main';
}
