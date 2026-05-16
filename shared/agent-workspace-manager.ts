export type WorkspaceCommandCategory = 'git' | 'file';
export type WorkspaceCommandRisk = 'low' | 'medium' | 'high';

export interface IWorkspaceLifecycleCommand {
  key:
    | 'clone_cache'
    | 'fetch_base'
    | 'fetch_workspace_tip'
    | 'add_worktree'
    | 'clone_branch'
    | 'checkout_agent_branch'
    | 'cleanup_worktree';
  toolName: string;
  toolCategory: WorkspaceCommandCategory;
  summary: string;
  command: string;
  args: string[];
  riskLevel: WorkspaceCommandRisk;
  orderIndex: number;
  /** 为 true 时命令非 0 退出码不中断后续 lifecycle（如远端尚无工作分支时的 fetch） */
  optional?: boolean;
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

export interface IBuildAgentWorkspacePlanInput {
  workspaceId: string;
  sessionId: string;
  requirementId: string;
  pipelineRunId?: string | null;
  repoUrl: string;
  baseBranch?: string | null;
  agentBranch?: string | null;
  workspaceRoot?: string | null;
  kind?: 'clone' | 'worktree' | 'container';
  /** 产品目录段，如 ai-generation；存在时 worktree 根为 {workspaceRoot}/{productSlug} */
  productSlug?: string | null;
  /** 与仓库内 docs/{该名}/ 一致；仅用于元数据/提示，不参与 worktree 物理路径 */
  sessionFolderName?: string | null;
}

const DEFAULT_WORKSPACE_ROOT = '/tmp/rd-agent-workspaces';

function trimSlashes(value: string): string {
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

export function sanitizeWorkspaceSegment(value: string | null | undefined, fallback: string): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 64);
  return normalized || fallback;
}

export function normalizeWorkspaceRoot(root?: string | null): string {
  const normalized = String(root || DEFAULT_WORKSPACE_ROOT).trim().replace(/\/+$/, '');
  return normalized || DEFAULT_WORKSPACE_ROOT;
}

export function buildAgentBranch(input: {
  requirementId: string;
  pipelineRunId?: string | null;
  sessionId?: string | null;
  prefix?: string | null;
}): string {
  const prefix = trimSlashes(String(input.prefix || 'codex'));
  const requirement = sanitizeWorkspaceSegment(input.requirementId, 'requirement');
  const runOrSession = sanitizeWorkspaceSegment(input.pipelineRunId || input.sessionId, 'run');
  return `${prefix}/rd-${requirement}-${runOrSession}`;
}

function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9_./:@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function renderCommand(args: string[]): string {
  return args.map(shellQuote).join(' ');
}

function repoNameFromUrl(repoUrl: string): string {
  const trimmed = repoUrl.trim().replace(/\.git$/i, '');
  const tail = trimmed.split(/[/:]/).filter(Boolean).pop();
  return sanitizeWorkspaceSegment(tail, 'repo');
}

function joinPath(...parts: string[]): string {
  return parts
    .map((part, index) => (index === 0 ? part.replace(/\/+$/, '') : trimSlashes(part)))
    .filter(Boolean)
    .join('/');
}

export function buildAgentWorkspaceLifecyclePlan(
  input: IBuildAgentWorkspacePlanInput,
): IAgentWorkspaceLifecyclePlan {
  const repoUrl = input.repoUrl.trim();
  if (!repoUrl) {
    throw new Error('repoUrl is required');
  }
  const baseBranch = String(input.baseBranch || 'main').trim() || 'main';
  const autoAgentBranch = buildAgentBranch({
    requirementId: input.requirementId,
    pipelineRunId: input.pipelineRunId,
    sessionId: input.sessionId,
  });
  const workspaceBranchSuffix = sanitizeWorkspaceSegment(input.workspaceId, 'wt');
  /** 每个 Workspace 独占一条分支名，避免多个 worktree 报「branch is already checked out」 */
  const agentBranch = input.agentBranch?.trim() || `${autoAgentBranch}-${workspaceBranchSuffix}`;
  const workspaceRoot = normalizeWorkspaceRoot(input.workspaceRoot);
  const sessionSegment = sanitizeWorkspaceSegment(input.sessionId, 'session');
  const workspaceSegment = sanitizeWorkspaceSegment(input.workspaceId, 'workspace');
  const requirementSegment = sanitizeWorkspaceSegment(input.requirementId, 'requirement');
  const repoSegment = repoNameFromUrl(repoUrl);
  const cachePath = joinPath(workspaceRoot, 'cache', `${requirementSegment}-${repoSegment}`);
  const productSeg = sanitizeWorkspaceSegment(input.productSlug || 'default', 'product');
  const useProductWorkspaceRoot = Boolean(input.productSlug?.trim());
  const worktreePath = useProductWorkspaceRoot
    ? joinPath(workspaceRoot, productSeg)
    : joinPath(workspaceRoot, 'sessions', sessionSegment, workspaceSegment);
  const kind = input.kind || 'worktree';

  if (kind === 'clone') {
    const cloneArgs = ['git', 'clone', '--branch', baseBranch, repoUrl, worktreePath];
    const checkoutArgs = ['git', '-C', worktreePath, 'checkout', '-B', agentBranch];
    return {
      repoUrl,
      baseBranch,
      agentBranch,
      workspaceRoot,
      cachePath,
      worktreePath,
      commands: [
        {
          key: 'clone_branch',
          toolName: 'git.clone',
          toolCategory: 'git',
          summary: `Clone ${baseBranch} into isolated workspace`,
          command: renderCommand(cloneArgs),
          args: cloneArgs,
          riskLevel: 'medium',
          orderIndex: 10,
        },
        {
          key: 'checkout_agent_branch',
          toolName: 'git.checkout_branch',
          toolCategory: 'git',
          summary: `Create or reset agent branch ${agentBranch}`,
          command: renderCommand(checkoutArgs),
          args: checkoutArgs,
          riskLevel: 'medium',
          orderIndex: 20,
        },
      ],
    };
  }

  const cloneCacheArgs = ['git', 'clone', '--no-checkout', repoUrl, cachePath];
  const fetchArgs = ['git', '-C', cachePath, 'fetch', 'origin', baseBranch, '--depth', '1'];
  /** $1=cachePath $2=baseBranch $3=agentBranch $4=worktreePath — 优先基于远端工作分支 tip，否则基于基准分支 */
  const addWorktreeFromRemoteTipScript =
    'START=$(git -C "$1" rev-parse --verify "refs/remotes/origin/$3" 2>/dev/null || git -C "$1" rev-parse "origin/$2") && git -C "$1" worktree add -B "$3" "$4" "$START"';
  const worktreeArgs = ['sh', '-c', addWorktreeFromRemoteTipScript, '_', cachePath, baseBranch, agentBranch, worktreePath];
  const cleanupArgs = ['git', '-C', cachePath, 'worktree', 'remove', '--force', worktreePath];

  const commands: IWorkspaceLifecycleCommand[] = [
    {
      key: 'clone_cache',
      toolName: 'git.clone_cache',
      toolCategory: 'git',
      summary: 'Clone repository cache for isolated worktree',
      command: renderCommand(cloneCacheArgs),
      args: cloneCacheArgs,
      riskLevel: 'medium',
      orderIndex: 10,
    },
    {
      key: 'fetch_base',
      toolName: 'git.fetch',
      toolCategory: 'git',
      summary: `Fetch base branch ${baseBranch}`,
      command: renderCommand(fetchArgs),
      args: fetchArgs,
      riskLevel: 'low',
      orderIndex: 20,
    },
  ];

  if (agentBranch !== baseBranch) {
    const fetchTipArgs = ['git', '-C', cachePath, 'fetch', 'origin', agentBranch, '--depth', '1'];
    commands.push({
      key: 'fetch_workspace_tip',
      toolName: 'git.fetch_workspace_tip',
      toolCategory: 'git',
      summary: `Fetch workspace branch ${agentBranch} if present on remote (optional)`,
      command: renderCommand(fetchTipArgs),
      args: fetchTipArgs,
      riskLevel: 'low',
      orderIndex: 25,
      optional: true,
    });
  }

  commands.push(
    {
      key: 'add_worktree',
      toolName: 'git.worktree_add',
      toolCategory: 'git',
      summary: `Create worktree on ${agentBranch} from remote tip of same branch, else from origin/${baseBranch}`,
      command: renderCommand(worktreeArgs),
      args: worktreeArgs,
      riskLevel: 'medium',
      orderIndex: 30,
    },
    {
      key: 'cleanup_worktree',
      toolName: 'git.worktree_remove',
      toolCategory: 'git',
      summary: 'Remove isolated worktree after run completion',
      command: renderCommand(cleanupArgs),
      args: cleanupArgs,
      riskLevel: 'low',
      orderIndex: 900,
      cleanup: true,
    },
  );

  return {
    repoUrl,
    baseBranch,
    agentBranch,
    workspaceRoot,
    cachePath,
    worktreePath,
    commands,
  };
}

export function buildAgentWorkspaceCleanupCommand(input: {
  cachePath: string;
  worktreePath: string;
}): IWorkspaceLifecycleCommand {
  const cleanupArgs = ['git', '-C', input.cachePath, 'worktree', 'remove', '--force', input.worktreePath];
  return {
    key: 'cleanup_worktree',
    toolName: 'git.worktree_remove',
    toolCategory: 'git',
    summary: 'Remove isolated worktree after run completion',
    command: renderCommand(cleanupArgs),
    args: cleanupArgs,
    riskLevel: 'low',
    orderIndex: 900,
    cleanup: true,
  };
}
