'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { ChevronRight, FileCode2, Folder, FolderOpen, GitBranch, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { loadGitPatWithMigration } from '@/lib/git-pat-storage';
import { codeToHtml } from '@/lib/shiki';
import type { BundledLanguage, BundledTheme } from '@/lib/shiki';
import {
  useAgentSessionsList,
  useAgentWorkspaceSourceFile,
  useAgentWorkspaceSourceTree,
  useAgentWorkspaces,
  useCommitAndPushAgentWorkspace,
  usePipelineRunsList,
} from '@/lib/rd-hooks';
import type { IAgentWorkspace, IAgentWorkspaceSourceTreeNode, IPipelineTask } from '@/lib/rd-types';
import { resolvePipelineWorkspaceBranchLabel } from '@shared/pipeline-meta-branch';
import { cn } from '@/lib/utils';

interface IAgentWorkspaceCodePanelProps {
  task: IPipelineTask;
}

function latestByTime<T extends { createdAt: string }>(items: T[]): T | undefined {
  return [...items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
}

function pickWorkspaceForSession(workspaces: IAgentWorkspace[]): IAgentWorkspace | undefined {
  const open = workspaces.filter((w) => w.status !== 'archived');
  if (!open.length) return undefined;
  return [...open].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
}

function guessBundledLang(filePath: string): BundledLanguage {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, BundledLanguage> = {
    ts: 'ts',
    tsx: 'tsx',
    js: 'js',
    jsx: 'jsx',
    mjs: 'mjs',
    cjs: 'cjs',
    json: 'json',
    jsonc: 'jsonc',
    md: 'md',
    mdx: 'md',
    css: 'css',
    html: 'html',
    htm: 'html',
    vue: 'html',
  };
  return map[ext] ?? 'tsx';
}

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
  onFile,
  activePath,
}: {
  node: IAgentWorkspaceSourceTreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
  onFile: (path: string) => void;
  activePath: string | null;
}) {
  const isDir = node.type === 'directory';
  const isOpen = expanded.has(node.path);
  if (isDir) {
    return (
      <div>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-0.5 py-0.5 text-left text-[12px] text-foreground hover:bg-accent/70',
            activePath?.startsWith(`${node.path}/`) && 'bg-primary/10',
          )}
          style={{ paddingLeft: 6 + depth * 10 }}
          onClick={() => toggle(node.path)}
        >
          <ChevronRight
            className={cn('size-3 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')}
          />
          {isOpen ? (
            <FolderOpen className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400/90" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400/90" />
          )}
          <span className="min-w-0 truncate">{node.name}</span>
        </button>
        {isOpen && node.children?.map((c) => (
          <TreeRow
            key={c.path}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            onFile={onFile}
            activePath={activePath}
          />
        ))}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-1 py-0.5 text-left text-[12px] text-foreground hover:bg-accent/70',
        activePath === node.path && 'bg-primary/15 font-medium text-primary dark:bg-primary/20',
      )}
      style={{ paddingLeft: 18 + depth * 10 }}
      onClick={() => onFile(node.path)}
    >
      <FileCode2 className="size-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
      <span className="min-w-0 truncate">{node.name}</span>
    </button>
  );
}

function CodeEditorBody({ path, content }: { path: string; content: string }) {
  const { resolvedTheme } = useTheme();
  const [html, setHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    const shikiTheme: BundledTheme = resolvedTheme === 'dark' ? 'github-dark' : 'github-light';
    (async () => {
      try {
        const lang = guessBundledLang(path);
        const out = await codeToHtml(content, {
          lang,
          theme: shikiTheme,
        });
        if (!cancelled) setHtml(out);
      } catch {
        if (!cancelled) setHtml('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, content, resolvedTheme]);

  const lines = content.split('\n');
  const lineGutterClass =
    'select-none border-r border-border bg-muted/70 py-2 pr-3 pl-2 text-right text-muted-foreground dark:bg-zinc-950/70';

  if (!html) {
    return (
      <div className="flex min-h-[200px] bg-background font-mono text-[13px] leading-6">
        <div className={lineGutterClass}>
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words bg-background p-2 text-foreground">
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex min-h-[200px] bg-background font-mono text-[13px] leading-6">
      <div className={lineGutterClass}>
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div
        className="min-w-0 flex-1 overflow-x-auto bg-background p-2 dark:bg-transparent [&_pre]:m-0 [&_pre]:max-w-none [&_pre]:rounded-none [&_pre]:p-0 [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:leading-6 [&_code]:font-mono"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

export function AgentWorkspaceCodePanel({ task }: IAgentWorkspaceCodePanelProps) {
  const { data: runs = [] } = usePipelineRunsList(task.requirementId);
  const latestRun = latestByTime(runs);
  const { data: sessions = [] } = useAgentSessionsList({ requirementId: task.requirementId });
  const pipelineLinkedSession = useMemo(
    () => sessions.find((s) => s.pipelineRunId === latestRun?.id) || latestByTime(sessions),
    [latestRun?.id, sessions],
  );
  const sessionId = pipelineLinkedSession?.id;
  const { data: workspaces = [] } = useAgentWorkspaces(sessionId);
  const readyWorkspace = useMemo(
    () => workspaces.find((w) => w.status === 'ready' && Boolean(w.worktreePath?.trim())),
    [workspaces],
  );
  const primaryWorkspace = useMemo(() => pickWorkspaceForSession(workspaces), [workspaces]);
  const browseWorkspace = readyWorkspace ?? primaryWorkspace;

  const { data: treeData, isLoading: treeLoading, error: treeError, refetch } = useAgentWorkspaceSourceTree(
    browseWorkspace?.id,
  );

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']));

  useEffect(() => {
    if (!treeData?.nodes?.length) return;
    const next = new Set<string>(['']);
    const walk = (nodes: IAgentWorkspaceSourceTreeNode[], depth: number) => {
      for (const n of nodes) {
        if (n.type === 'directory' && depth < 2) {
          next.add(n.path);
          if (n.children) walk(n.children, depth + 1);
        }
      }
    };
    walk(treeData.nodes, 0);
    setExpanded(next);
  }, [treeData?.nodes]);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }, []);

  const [openTabs, setOpenTabs] = useState<{ path: string; title: string }[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);

  const openFile = useCallback((path: string) => {
    const title = path.split('/').pop() || path;
    setOpenTabs((prev) => (prev.some((t) => t.path === path) ? prev : [...prev, { path, title }]));
    setActivePath(path);
  }, []);

  const closeTab = useCallback((path: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.path !== path);
      setActivePath((cur) => {
        if (cur !== path) return cur;
        return next.length ? next[next.length - 1]!.path : null;
      });
      return next;
    });
  }, []);

  const { data: fileData, isLoading: fileLoading, error: fileError } = useAgentWorkspaceSourceFile(
    browseWorkspace?.id,
    activePath ?? undefined,
  );

  const commitPushMutation = useCommitAndPushAgentWorkspace();
  const [gitDialogOpen, setGitDialogOpen] = useState(false);
  const [gitCommitMessage, setGitCommitMessage] = useState('');
  const [gitPat, setGitPat] = useState('');
  const [gitUsername, setGitUsername] = useState('');

  const repoUrl = browseWorkspace?.repoUrl?.trim() ?? '';
  const isHttpsRepo = /^https:\/\//i.test(repoUrl);
  const pushBranchRef =
    browseWorkspace?.agentBranch?.trim() ||
    resolvePipelineWorkspaceBranchLabel(task.pipelineMeta, task.requirementId);

  useEffect(() => {
    if (!gitDialogOpen) return;
    void loadGitPatWithMigration().then((stored) => {
      if (!stored.username && !stored.pat) return;
      setGitUsername((prev) => (prev.trim() ? prev : stored.username));
      setGitPat((prev) => (prev.trim() ? prev : stored.pat));
    });
  }, [gitDialogOpen]);

  const handleGitPushSubmit = async () => {
    if (!browseWorkspace?.id || !sessionId) return;
    try {
      const res = await commitPushMutation.mutateAsync({
        workspaceId: browseWorkspace.id,
        sessionId,
        body: {
          commitMessage: gitCommitMessage.trim() || undefined,
          gitPat: isHttpsRepo ? gitPat.trim() || undefined : undefined,
          gitUsername: isHttpsRepo ? gitUsername.trim() || undefined : undefined,
        },
      });
      toast.success('已推送到远程', {
        description: `分支 ${res.branch}${res.commitHash ? ` · ${res.commitHash.slice(0, 7)}` : ''}${res.committed ? '（含新提交）' : '（无新文件变更）'}`,
      });
      setGitPat('');
      setGitDialogOpen(false);
      void refetch();
    } catch (e) {
      toastApiError(e, '推送失败');
    }
  };

  const breadcrumb = useMemo(() => {
    if (!activePath) return [];
    return activePath.split('/');
  }, [activePath]);

  if (!sessionId) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        请先完成 Agent 工作台步骤 1 创建会话；代码浏览依赖已绑定的 Workspace。
      </p>
    );
  }

  if (!browseWorkspace?.worktreePath?.trim()) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        Workspace 尚未就绪。请在 Agent 工作台完成「准备 Workspace」后再查看代码。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-mono break-all">
          根目录：<span className="text-foreground">{treeData?.worktreePath ?? browseWorkspace.worktreePath}</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => void refetch()}>
            刷新
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={browseWorkspace.status !== 'ready' || commitPushMutation.isPending}
            onClick={() => setGitDialogOpen(true)}
          >
            {commitPushMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <GitBranch className="size-3.5" />
            )}
            提交git
          </Button>
        </div>
      </div>
      <Dialog open={gitDialogOpen} onOpenChange={setGitDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>提交并推送到远程</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              将在当前 worktree 执行 <span className="font-mono">git add -A</span>、
              <span className="font-mono"> git commit</span>（有变更时）与{' '}
              <span className="font-mono">git push origin HEAD:refs/heads/{pushBranchRef}</span>
              。请确认已审查差异；推送会更新远程上的 Agent 分支。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="git-commit-msg" className="text-xs">
                提交说明
              </Label>
              <Textarea
                id="git-commit-msg"
                value={gitCommitMessage}
                onChange={(e) => setGitCommitMessage(e.target.value)}
                placeholder="留空则使用默认说明"
                className="min-h-[72px] resize-y text-sm"
              />
            </div>
            {isHttpsRepo ? (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <p className="text-[11px] text-muted-foreground">
                  当前仓库为 HTTPS，需 Personal Access Token 才能推送（也可由运维配置服务端环境变量
                  <span className="font-mono"> RD_AGENT_GIT_PUSH_PAT</span>）。
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="git-username" className="text-xs">
                    Git 用户名（可选）
                  </Label>
                  <Input
                    id="git-username"
                    value={gitUsername}
                    onChange={(e) => setGitUsername(e.target.value)}
                    placeholder="默认 git"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="git-pat" className="text-xs">
                    Personal Access Token
                  </Label>
                  <Input
                    id="git-pat"
                    type="password"
                    value={gitPat}
                    onChange={(e) => setGitPat(e.target.value)}
                    placeholder="若服务端已配置 RD_AGENT_GIT_PUSH_PAT 可留空"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                当前为 SSH 等地址，将使用运行后端主机上的已有凭据（如 SSH Agent）进行推送。
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setGitDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={commitPushMutation.isPending} onClick={() => void handleGitPushSubmit()}>
              {commitPushMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              确认推送
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {treeData?.truncated ? (
        <p className="text-xs text-amber-800 dark:text-amber-200/90">
          目录条目较多，已截断展示；可在本地 worktree 查看完整仓库。
        </p>
      ) : null}
      <div className="flex h-[min(75vh,680px)] min-h-[400px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm md:flex-row">
        <aside className="flex w-full max-h-[38vh] shrink-0 flex-col border-b border-border bg-muted/50 md:h-auto md:max-h-none md:w-56 md:shrink-0 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">资源管理器</span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="py-1 pr-1">
              {treeLoading ? (
                <p className="px-2 py-4 text-xs text-muted-foreground">加载目录…</p>
              ) : treeError ? (
                <p className="px-2 py-4 text-xs text-red-600">{(treeError as Error).message || '加载失败'}</p>
              ) : treeData?.nodes?.length ? (
                treeData.nodes.map((n) => (
                  <TreeRow
                    key={n.path}
                    node={n}
                    depth={0}
                    expanded={expanded}
                    toggle={toggle}
                    onFile={openFile}
                    activePath={activePath}
                  />
                ))
              ) : (
                <p className="px-2 py-4 text-xs text-muted-foreground">目录为空</p>
              )}
            </div>
          </ScrollArea>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
          <div className="flex shrink-0 items-center gap-0 overflow-x-auto border-b border-border bg-muted/40 px-1">
            {openTabs.length === 0 ? (
              <span className="px-3 py-2 text-xs text-muted-foreground">在左侧选择文件打开</span>
            ) : (
              openTabs.map((tab) => (
                <div
                  key={tab.path}
                  className={cn(
                    'flex max-w-[200px] shrink-0 items-center gap-0.5 border-r border-border px-2 py-1.5 text-[12px]',
                    activePath === tab.path
                      ? 'border-b-2 border-b-primary bg-card text-foreground shadow-sm'
                      : 'cursor-pointer text-muted-foreground hover:bg-muted/60',
                  )}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActivePath(tab.path)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActivePath(tab.path);
                    }
                  }}
                >
                  <span className="min-w-0 truncate">{tab.title}</span>
                  <button
                    type="button"
                    className="rounded p-0.5 hover:bg-muted"
                    aria-label={`关闭 ${tab.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.path);
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          {activePath ? (
            <>
              <div className="shrink-0 border-b border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                {breadcrumb.map((seg, i) => (
                  <span key={`${seg}-${i}`}>
                    {i > 0 ? <span className="mx-0.5 text-muted-foreground/35">›</span> : null}
                    <span className={i === breadcrumb.length - 1 ? 'text-foreground' : undefined}>{seg}</span>
                  </span>
                ))}
              </div>
              <ScrollArea className="min-h-0 flex-1">
                {fileLoading ? (
                  <p className="p-4 text-xs text-muted-foreground">读取文件…</p>
                ) : fileError ? (
                  <p className="p-4 text-xs text-red-600">{(fileError as Error).message || '读取失败'}</p>
                ) : fileData ? (
                  <div>
                    {fileData.truncated ? (
                      <p className="border-b border-amber-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/35 dark:text-amber-50/95">
                        正文已在服务端截断，完整内容请在本地打开该文件。
                      </p>
                    ) : null}
                    <CodeEditorBody path={fileData.path} content={fileData.content} />
                  </div>
                ) : null}
              </ScrollArea>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              从左侧资源树点击文件即可预览
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
