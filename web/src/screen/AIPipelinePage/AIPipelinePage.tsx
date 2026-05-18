'use client';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { capabilityClient } from '@/lib/capability-client';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Cpu,
  RotateCcw,
  XCircle,
  Terminal,
  BarChart3,
  Activity,
  ExternalLink,
  Code2,
  FileCheck,
  CheckCircle2,
  Loader2,
  Plus,
  GitCommitHorizontal,
  ArrowLeft,
  History,
  Play,
  FlaskConical,
} from 'lucide-react';
import { RdPageModuleHeading } from '@/components/rd-page-module-heading';
import { ListRowActionsMenu } from '@/components/business-ui/list-row-actions-menu';
import {
  ConfirmActionDialog,
  PromptActionDialog,
  type ConfirmActionState,
  type PromptActionState,
} from '@/components/business-ui/confirm-action-dialog';
import { Streamdown } from '@/components/ui/streamdown';
import { logger } from '@/lib/logger';
import { rdAuditCreate, rdAuditUpdate } from '@/lib/rd-actor';
import {
  useAgentSessionsList,
  useDeletePipelineTask,
  usePipelineTasksList,
  usePrdsList,
  useProductsList,
  useRequirementsList,
  useSpecsList,
  useUpsertPipelineTask,
} from '@/lib/rd-hooks';
import { gitBlobViewerUrl } from '@/lib/git-web-url';
import { rdApi } from '@/lib/rd-api';
import { getAuthToken } from '@/lib/auth';
import { defaultGitPatFormFields } from '@/lib/git-pat-storage';
import type {
  IAgentSession,
  IGitCommitRecord,
  IPipelineCodeReviewRecord,
  IPipelineTask,
  IPipelineTestRunRecord,
  IRequirement,
  PipelineTaskStatus,
} from '@/lib/rd-types';
import { formatPrdListTitle, formatProductDashRequirementTitle } from '@/lib/prd-display-title';
import { cn } from '@/lib/utils';
import { deriveQualityMetricsFromReview } from '@/lib/pipeline-code-review-metrics';
import {
  buildFsTsContextForTask,
  collectAgentWorkspaceCodeExcerpt,
  heuristicExecuteReport,
  heuristicGeneratedCasesFromSpecs,
  parseExecutionReportFromAi,
  parseGeneratedCasesFromAi,
  resolveSpecsForPipelineTask,
} from '@/lib/pipeline-test-artifacts';
import {
  extractPipelineErrorMessage,
  findProductForRequirement,
  formatPipelineFileTimestamp,
  isValidPipelineGitUrl,
  pipelineLogLevelColors,
  pipelineStatusConfig,
  publishedDocsFromPublishResult,
} from '@/lib/pipeline-page-utils';
import { buildWorkspaceSessionFolderName, resolveWorkspaceProductSlug } from '@shared/pipeline-workspace-path';
import { AgentWorkbenchPanel } from './AgentWorkbenchPanel';
import { AgentWorkspaceCodePanel } from './AgentWorkspaceCodePanel';
import { toast } from 'sonner';

interface ICodeReviewResult {
  summary: string;
}

interface IRelationOption {
  id: string;
  label: string;
}

interface ICreatePipelineForm {
  name: string;
  gitUrl: string;
  gitAuthMode: 'ssh' | 'pat';
  gitUsername: string;
  gitPat: string;
  sandboxUrl: string;
  /** 检出基准（默认 main），用于拉取 commit 记录与 Agent worktree 的 origin 引用 */
  gitBaseBranch: string;
  /** Agent 工作区与推送目标分支（默认与关联需求 ID 一致） */
  branch: string;
  triggerMode: 'manual' | 'push' | 'schedule';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  remarks: string;
  requirementId: string;
}

const PIPELINE_CARD_ACCENT: Record<PipelineTaskStatus, string> = {
  code_generating: 'bg-purple-600',
  self_testing: 'bg-blue-500',
  building: 'bg-indigo-500',
  deploying: 'bg-orange-500',
  completed: 'bg-green-600',
  failed: 'bg-red-600',
};

const PIPELINE_STATUS_BADGE_SOFT: Record<PipelineTaskStatus, string> = {
  code_generating: 'border-purple-500/30 bg-purple-500/10 text-purple-900 dark:text-purple-100',
  self_testing: 'border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-100',
  building: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-900 dark:text-indigo-100',
  deploying: 'border-orange-500/35 bg-orange-500/10 text-orange-950 dark:text-orange-100',
  completed: 'border-green-500/30 bg-green-500/10 text-green-900 dark:text-green-100',
  failed: 'border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-100',
};

/** 看板卡片：当后端未写入 progress 时，用阶段下限避免长期显示 0% */
const PIPELINE_CARD_PROGRESS_FLOOR: Record<PipelineTaskStatus, number> = {
  code_generating: 12,
  self_testing: 40,
  building: 62,
  deploying: 84,
  completed: 100,
  failed: 0,
};

const PIPELINE_CARD_STAGE_LABEL: Record<PipelineTaskStatus, string> = {
  code_generating: '代码生成',
  self_testing: '自动化测试',
  building: '构建',
  deploying: '部署',
  completed: '交付完成',
  failed: '已失败',
};

function displayPipelineCardProgressPct(
  task: IPipelineTask,
  opts?: { codingFinishedOnCard?: boolean },
): number {
  const raw = Number.isFinite(task.progress) ? Math.min(100, Math.max(0, task.progress)) : 0;
  let floor = PIPELINE_CARD_PROGRESS_FLOOR[task.status] ?? 0;
  if (task.status === 'code_generating' && opts?.codingFinishedOnCard) {
    floor = Math.max(floor, 38);
  }
  if (task.status === 'failed') return raw > 0 ? raw : floor;
  return Math.min(100, Math.max(raw, floor));
}

function pickLatestAgentSessionForRequirement(
  requirementId: string,
  sessions: IAgentSession[],
): IAgentSession | undefined {
  const forReq = sessions.filter((s) => s.requirementId === requirementId);
  if (!forReq.length) return undefined;
  return [...forReq].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
}

/** 流水线仍为「代码生成」阶段，但 Agent 会话已结束 → 卡片上展示「编码已完成」 */
function isAgentCodingFinishedWhilePipelineCodeGenerating(
  task: IPipelineTask,
  session: IAgentSession | undefined,
): boolean {
  if (task.status !== 'code_generating') return false;
  return session?.status === 'completed';
}

function authJsonHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? getAuthToken() : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type AIPipelinePageProps = {
  /** list：仅看板；detail：单条流水线 Tab 详情 */
  view?: 'list' | 'detail';
  /** view 为 detail 时的流水线任务 id */
  detailTaskId?: string;
};

const AIPipelinePage: React.FC<AIPipelinePageProps> = ({
  view = 'list',
  detailTaskId: detailTaskIdProp,
}) => {
  const router = useRouter();
  const isList = view === 'list';
  const isDetail = view === 'detail';
  const detailTaskId = (detailTaskIdProp || '').trim();
  const currentProfile = useCurrentUserProfile();
  const { data: requirements = [] } = useRequirementsList();
  const { data: products = [] } = useProductsList();
  const { data: prds = [] } = usePrdsList();
  const { data: specs = [] } = useSpecsList();
  const { data: tasks = [], isLoading: tasksLoading } = usePipelineTasksList();
  const { data: agentSessionsForBoard = [] } = useAgentSessionsList(undefined, { enabled: isList });
  const pipelineBoardStats = useMemo(() => {
    let running = 0;
    let completed = 0;
    let failed = 0;
    for (const t of tasks) {
      if (t.status === 'completed') completed += 1;
      else if (t.status === 'failed') failed += 1;
      else running += 1;
    }
    return { running, completed, failed };
  }, [tasks]);
  const upsertPipelineTask = useUpsertPipelineTask();
  const deletePipelineTask = useDeletePipelineTask();
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  const [isReviewing, setIsReviewing] = useState(false);
  const [isGeneratingTestCases, setIsGeneratingTestCases] = useState(false);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testRunPreview, setTestRunPreview] = useState<IPipelineTestRunRecord | null>(null);
  /** 与代码审查一致：测试用例生成 / 测试报告执行 的流式 Markdown 输出 */
  const [testStreamPhase, setTestStreamPhase] = useState<'generate_cases' | 'execute_tests' | null>(null);
  const [testStreamMarkdown, setTestStreamMarkdown] = useState('');
  const [reviewResult, setReviewResult] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPublishingDocs, setIsPublishingDocs] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);
  const [promptAction, setPromptAction] = useState<PromptActionState | null>(null);
  const [createForm, setCreateForm] = useState<ICreatePipelineForm>(() => {
    const gitPatDefaults = defaultGitPatFormFields();
    return {
      name: '',
      gitUrl: '',
      gitAuthMode: 'pat',
      gitUsername: gitPatDefaults.username,
      gitPat: gitPatDefaults.pat,
      sandboxUrl: '',
      gitBaseBranch: 'main',
      branch: '',
      triggerMode: 'manual',
      priority: 'P1',
      remarks: '',
      requirementId: '',
    };
  });
  const logsEndRef = useRef<HTMLDivElement>(null);
  const testStreamEndRef = useRef<HTMLDivElement>(null);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId),
    [selectedTaskId, tasks],
  );
  const selectedTaskLinkedSpecs = useMemo(
    () => (selectedTask ? resolveSpecsForPipelineTask(selectedTask, specs) : []),
    [selectedTask, specs],
  );
  const displayTestReport = useMemo(() => {
    if (!selectedTask) return undefined;
    if (testRunPreview) return testRunPreview.testReport;
    if (selectedTask.testReport) return selectedTask.testReport;
    const hist = selectedTask.testRunHistory;
    if (hist?.length) return hist[hist.length - 1]!.testReport;
    return undefined;
  }, [selectedTask, testRunPreview]);
  const selectedRequirement = requirements.find((r) => r.id === createForm.requirementId);
  const availableRequirementsForPipeline = useMemo(() => {
    const requirementIdsWithPipeline = new Set(tasks.map((t) => t.requirementId));
    const prdIdsWithSpec = new Set(specs.map((s) => s.prdId));
    const requirementIdsWithPrd = new Set(prds.map((p) => p.requirementId));
    const requirementIdsWithSpec = new Set(
      prds.filter((p) => prdIdsWithSpec.has(p.id)).map((p) => p.requirementId)
    );
    return requirements.filter(
      (r) =>
        ((!requirementIdsWithPipeline.has(r.id) &&
          requirementIdsWithPrd.has(r.id) &&
          requirementIdsWithSpec.has(r.id)) ||
          r.id === createForm.requirementId)
    );
  }, [createForm.requirementId, prds, requirements, specs, tasks]);
  const productForSelectedRequirement = useMemo(
    () => findProductForRequirement(selectedRequirement, products),
    [products, selectedRequirement],
  );
  const selectedRequirementProductGitUrl = productForSelectedRequirement?.gitUrl?.trim() ?? '';
  const selectedRequirementProductSandboxUrl = productForSelectedRequirement?.sandboxUrl?.trim() ?? '';
  const prdOptions = useMemo<IRelationOption[]>(() => {
    const activeRequirementId = createForm.requirementId;
    return prds
      .filter((prd) => !activeRequirementId || prd.requirementId === activeRequirementId)
      .map((prd) => {
        const req = requirements.find((r) => r.id === prd.requirementId);
        return {
          id: prd.id,
          label: formatPrdListTitle(req as IRequirement | undefined, products, prd.title) || prd.id,
        };
      });
  }, [createForm.requirementId, prds, requirements, products]);
  const resolveTaskCardTitle = useCallback(
    (task: IPipelineTask) =>
      formatProductDashRequirementTitle(
        requirements.find((r) => r.id === task.requirementId),
        products,
        task.requirementTitle
      ) || task.requirementTitle,
    [requirements, products]
  );
  const specOptions = useMemo<IRelationOption[]>(() => {
    const activeRequirementId = createForm.requirementId;
    const prdIdSet = new Set(prds.filter((p) => p.requirementId === activeRequirementId).map((p) => p.id));
    return specs
      .filter((spec) => !activeRequirementId || prdIdSet.has(spec.prdId))
      .map((spec) => ({ id: spec.id, label: `${spec.id} (${spec.status})` }));
  }, [createForm.requirementId, prds, specs]);
  const defaultPipelineName = selectedRequirement ? `${selectedRequirement.title}-生产流水线` : '';
  const selectedTaskCommitStore = selectedTask?.commitStore;

  const resetCreateForm = () => {
    const gitPatDefaults = defaultGitPatFormFields();
    setCreateForm({
      name: '',
      gitUrl: '',
      gitAuthMode: 'pat',
      gitUsername: gitPatDefaults.username,
      gitPat: gitPatDefaults.pat,
      sandboxUrl: '',
      gitBaseBranch: 'main',
      branch: '',
      triggerMode: 'manual',
      priority: 'P1',
      remarks: '',
      requirementId: '',
    });
  };

  const fetchGitCommits = async (
    gitUrl: string,
    branch: string,
    limit = 20,
    gitUsername?: string,
    gitPat?: string
  ): Promise<IGitCommitRecord[]> => {
    const payload = {
      gitUrl: gitUrl.trim(),
      branch: branch.trim(),
      limit,
      gitUsername: (gitUsername || '').trim() || undefined,
      gitPat: (gitPat || '').trim() || undefined,
    };
    const fallbackUrls = [
      '/api/pipeline-git/commits',
      '/pipeline-git/commits',
      'http://localhost:3000/pipeline-git/commits',
    ];
    let lastError = '';
    for (const url of fallbackUrls) {
      try {
        // eslint-disable-next-line no-restricted-syntax
        const response = await globalThis.fetch(url, {
          method: 'POST',
          headers: authJsonHeaders(),
          body: JSON.stringify(payload),
        });
        if (response.status === 404 || response.status === 403) {
          continue;
        }
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          lastError = extractPipelineErrorMessage(result, '获取 commit 记录失败');
          continue;
        }
        return Array.isArray(result) ? result : [];
      } catch (error) {
        lastError = extractPipelineErrorMessage(error, '获取 commit 记录失败');
      }
    }
    throw new Error(lastError || '获取 commit 记录失败');
  };

  const syncPipelineNameByRequirement = useCallback((nextRequirementId: string) => {
    setCreateForm((prev) => {
      const nextRequirement = requirements.find((r) => r.id === nextRequirementId);
      const nextDefaultName = nextRequirement ? `${nextRequirement.title}-生产流水线` : '';
      const currentRequirement = requirements.find((r) => r.id === prev.requirementId);
      const currentDefaultName = currentRequirement ? `${currentRequirement.title}-生产流水线` : '';
      const nextProduct = findProductForRequirement(nextRequirement, products);
      const nextGit = nextProduct?.gitUrl?.trim() ?? '';
      const nextSandbox = nextProduct?.sandboxUrl?.trim() ?? '';
      const shouldApplyDefaultName = !prev.name.trim() || prev.name === currentDefaultName;
      return {
        ...prev,
        requirementId: nextRequirementId,
        name: shouldApplyDefaultName ? nextDefaultName : prev.name,
        branch: nextRequirementId.trim(),
        gitUrl: nextGit,
        sandboxUrl: nextSandbox,
      };
    });
  }, [requirements, products]);

  /** 创建弹窗打开时，用个人设置中保存的 Git PAT 补全空字段 */
  useEffect(() => {
    if (!isCreateDialogOpen) return;
    const stored = defaultGitPatFormFields();
    if (!stored.username && !stored.pat) return;
    setCreateForm((prev) => {
      if (prev.gitAuthMode !== 'pat') return prev;
      const nextUsername = prev.gitUsername.trim() ? prev.gitUsername : stored.username;
      const nextPat = prev.gitPat.trim() ? prev.gitPat : stored.pat;
      if (nextUsername === prev.gitUsername && nextPat === prev.gitPat) return prev;
      return { ...prev, gitUsername: nextUsername, gitPat: nextPat };
    });
  }, [isCreateDialogOpen]);

  /** 创建弹窗打开且未选需求时，列表有数据则默认选中第一项（含名称与产品 Git/沙箱同步） */
  useEffect(() => {
    if (!isCreateDialogOpen || createForm.requirementId) return;
    const first = availableRequirementsForPipeline[0];
    if (!first) return;
    syncPipelineNameByRequirement(first.id);
  }, [
    isCreateDialogOpen,
    createForm.requirementId,
    availableRequirementsForPipeline,
    syncPipelineNameByRequirement,
  ]);

  // 自动滚动日志到底部
  useEffect(() => {
    if (logsEndRef.current && activeTab === 'logs') {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedTask?.logs, activeTab]);

  useEffect(() => {
    if (isList) {
      setSelectedTaskId('');
      return;
    }
    if (!detailTaskId) {
      setSelectedTaskId('');
      return;
    }
    if (tasksLoading) return;
    if (!tasks.length || !tasks.some((t) => t.id === detailTaskId)) {
      toast.error('未找到该流水线');
      router.replace('/ai-pipeline');
      return;
    }
    setSelectedTaskId(detailTaskId);
  }, [isList, detailTaskId, tasks, tasksLoading, router]);

  useEffect(() => {
    if (!isDetail) return;
    if (!detailTaskId) {
      router.replace('/ai-pipeline');
    }
  }, [isDetail, detailTaskId, router]);

  useEffect(() => {
    setTestRunPreview(null);
    setTestStreamPhase(null);
    setTestStreamMarkdown('');
  }, [selectedTaskId]);

  useEffect(() => {
    if (activeTab !== 'tests') return;
    if (!testStreamMarkdown && !isGeneratingTestCases && !isRunningTests) return;
    testStreamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeTab, testStreamMarkdown, isGeneratingTestCases, isRunningTests]);

  /** 切换任务或列表刷新后，用服务端持久化的最近一次审查摘要填充展示（审查进行中不覆盖） */
  useEffect(() => {
    if (isReviewing || !isDetail || !selectedTaskId) return;
    const task = tasks.find((t) => t.id === selectedTaskId);
    const hist = task?.codeReviewHistory;
    if (hist?.length) {
      setReviewResult(hist[hist.length - 1].summaryMarkdown);
    } else {
      setReviewResult('');
    }
  }, [isDetail, isReviewing, selectedTaskId, tasks]);

  /** 产品列表晚于需求加载时，在 Git/沙箱仍为空时补全 */
  useEffect(() => {
    if (!createForm.requirementId) return;
    const g = selectedRequirementProductGitUrl;
    const s = selectedRequirementProductSandboxUrl;
    if (!g && !s) return;
    setCreateForm((prev) => {
      const nextGit = prev.gitUrl.trim() ? prev.gitUrl : g;
      const nextSandbox = prev.sandboxUrl.trim() ? prev.sandboxUrl : s;
      if (nextGit === prev.gitUrl && nextSandbox === prev.sandboxUrl) return prev;
      return { ...prev, gitUrl: nextGit, sandboxUrl: nextSandbox };
    });
  }, [createForm.requirementId, selectedRequirementProductGitUrl, selectedRequirementProductSandboxUrl]);

  const handleAction = async (action: 'retry' | 'rollback', taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    try {
      let next: IPipelineTask;
      switch (action) {
        case 'retry':
          next = { ...task, status: 'code_generating', progress: 0, stage: '重新生成中' };
          break;
        case 'rollback':
          next = { ...task, status: 'failed', stage: '已回滚' };
          break;
      }
      await upsertPipelineTask.mutateAsync({ ...next, ...rdAuditUpdate() });
      toast.success('操作已保存');
    } catch (error) {
      logger.error('更新流水线任务失败', error);
      toast.error('保存失败，请重试');
    }
  };

  const handleViewTask = (taskId: string) => {
    router.push(`/ai-pipeline/${encodeURIComponent(taskId)}`);
  };

  const renamePipelineTask = async (taskId: string, nextName: string) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    try {
      await upsertPipelineTask.mutateAsync({
        ...target,
        requirementTitle: nextName.trim(),
        ...rdAuditUpdate(),
      });
      toast.success('已更新');
    } catch (error) {
      logger.error('更新流水线任务失败', error);
      toast.error('保存失败，请重试');
    }
  };

  const deletePipelineTaskById = async (taskId: string) => {
    try {
      await deletePipelineTask.mutateAsync(taskId);
      toast.success('已删除');
      if (isDetail && detailTaskId === taskId) {
        router.replace('/ai-pipeline');
      }
    } catch (error) {
      logger.error('删除流水线任务失败', error);
      toast.error('删除失败，请重试');
    }
  };

  const handleEditTask = (taskId: string) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    setPromptAction({
      title: '重命名流水线',
      description: '更新后会同步显示在流水线列表和详情区域。',
      label: '流水线名称',
      initialValue: target.requirementTitle,
      confirmLabel: '保存',
      onConfirm: async (nextName) => {
        setPromptAction(null);
        await renamePipelineTask(taskId, nextName);
      },
    });
  };

  const handleDeleteTask = (taskId: string) => {
    const target = tasks.find((t) => t.id === taskId);
    setConfirmAction({
      title: '删除流水线任务',
      description: target
        ? `确认删除「${target.requirementTitle}」吗？流水线日志、报告与关联元数据将一并删除。`
        : '确认删除该流水线任务吗？流水线日志、报告与关联元数据将一并删除。',
      confirmLabel: '删除',
      destructive: true,
      onConfirm: async () => {
        setConfirmAction(null);
        await deletePipelineTaskById(taskId);
      },
    });
  };

  const handleDownloadDocs = async (task: IPipelineTask) => {
    try {
      const blob = await rdApi.downloadPipelineDocsZip(task.requirementId);
      const url = window.URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      const safeTitle = task.requirementTitle.replace(/[\\/:*?"<>|]/g, '_').trim() || task.requirementId;
      anchor.href = url;
      anchor.download = `${safeTitle}-${formatPipelineFileTimestamp()}.zip`;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success('文档打包下载已开始');
    } catch (error) {
      logger.error('下载流水线文档失败', error);
      toast.error('下载失败，请稍后重试');
    }
  };

  const handleCodeReview = async () => {
    if (!selectedTask) return;

    const taskSnapshot = selectedTask;
    setIsReviewing(true);
    setReviewResult('');

    const testSummary =
      taskSnapshot.testReport && taskSnapshot.testReport.total > 0
        ? `\n=== 测试报告摘要 ===\n通过 ${taskSnapshot.testReport.passed}/${taskSnapshot.testReport.total}，失败 ${taskSnapshot.testReport.failed}，覆盖率 ${taskSnapshot.testReport.coverage}%`
        : '';
    const codeContent = [
      '=== 流水线日志 ===',
      ...taskSnapshot.logs.map((l) => `[${l.timestamp}][${l.level}] ${l.message}`),
      testSummary,
    ]
      .join('\n')
      .slice(0, 120_000);

    const additionalRequirements =
      '重点关注代码规范、潜在 bug 与性能问题。审查结束后请在文末追加以下四行（将数字替换为 0–100 的整数评分，勿加其它前缀）：\n' +
      '【评分】规格一致性:数字\n' +
      '【评分】API覆盖度:数字\n' +
      '【评分】代码质量:数字\n' +
      '【评分】测试通过率:数字';

    let accumulated = '';
    try {
      const stream = await capabilityClient
        .load('code_review_assistant_1')
        .callStream<ICodeReviewResult>('textSummary', {
          code_content: codeContent,
          additional_requirements: additionalRequirements,
        });

      for await (const chunk of stream) {
        if (chunk.summary) {
          accumulated += chunk.summary;
          setReviewResult(accumulated);
        }
      }

      if (!accumulated.trim()) {
        accumulated = '（模型未返回有效审查内容）';
        setReviewResult(accumulated);
      }

      const qualityMetrics = deriveQualityMetricsFromReview({
        summaryMarkdown: accumulated,
        testReport: taskSnapshot.testReport,
      });
      const record: IPipelineCodeReviewRecord = {
        id: `review_${Date.now()}`,
        createdAt: new Date().toISOString(),
        summaryMarkdown: accumulated,
        qualityMetrics,
      };
      const nextHistory = [...(taskSnapshot.codeReviewHistory ?? []), record];

      await upsertPipelineTask.mutateAsync({
        ...taskSnapshot,
        qualityMetrics,
        codeReviewHistory: nextHistory,
        ...rdAuditUpdate(),
      });
      toast.success('审查已完成，质量指标与记录已保存');
    } catch (error) {
      logger.error('代码审查失败:', error);
      const fallback = '代码审查服务暂时不可用，请稍后重试。';
      setReviewResult(fallback);
      toast.error('审查失败，未写入记录');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleGeneratePipelineTestCases = async () => {
    if (!selectedTask) return;
    const linked = resolveSpecsForPipelineTask(selectedTask, specs);
    if (!linked.length) {
      toast.error('未找到关联规格（FS/TS），请确认流水线已绑定 PRD/规格');
      return;
    }
    setIsGeneratingTestCases(true);
    setTestStreamPhase('generate_cases');
    setTestStreamMarkdown('> 正在读取 FS/TS 与 Agent Workspace 生成代码…\n\n');
    const taskSnapshot = selectedTask;
    const streamHeadCases = '> **测试用例生成**（流式输出）\n\n';
    try {
      const fsTs = buildFsTsContextForTask(taskSnapshot, linked);
      const codeExcerpt = await collectAgentWorkspaceCodeExcerpt(taskSnapshot.requirementId);
      setTestStreamMarkdown(streamHeadCases);
      const bundle = `=== FS / TS 规约上下文 ===\n${fsTs}\n\n=== 生成代码摘录（Agent Workspace）===\n${codeExcerpt}`.slice(
        0,
        118_000,
      );

      const additionalRequirements =
        '你是资深测试架构师。请仅基于上文 FS、TS 与生成代码设计「可自动化执行」的测试用例。\n' +
        '正文可做简短说明；最后必须且仅能包含一个 JSON 代码块（fence 标记为 json），格式如下（勿在代码块外再写 JSON）：\n' +
        '```json\n' +
        '{"cases":[{"id":"string","title":"string","basis":["fs","ts","code"],"trace":"string","steps":"string","expected":"string","relatedApiPath":"string?"}]}\n' +
        '```\n' +
        '至少 4 条；basis 每项为 fs、ts、code 的非空子集；需覆盖 API 契约、数据层与关键实现路径。';

      let accumulated = '';
      const stream = await capabilityClient
        .load('pipeline_test_case_generator_1')
        .callStream<ICodeReviewResult>('textSummary', {
          code_content: bundle,
          additional_requirements: additionalRequirements,
        });

      for await (const chunk of stream) {
        if (chunk.summary) {
          accumulated += chunk.summary;
          setTestStreamMarkdown(streamHeadCases + accumulated);
        }
      }

      if (!accumulated.trim()) {
        accumulated = '（模型未返回有效内容）';
        setTestStreamMarkdown(streamHeadCases + accumulated);
      }

      let cases = parseGeneratedCasesFromAi(accumulated);
      if (!cases?.length) {
        cases = heuristicGeneratedCasesFromSpecs(linked);
        toast.message('已用语义模板生成测试用例', {
          description: '模型未返回可解析 JSON，已根据 FS/TS 结构化内容回退生成。',
        });
      } else {
        toast.success(`已生成 ${cases.length} 条测试用例`);
      }

      await upsertPipelineTask.mutateAsync({
        ...taskSnapshot,
        generatedTestCases: cases,
        ...rdAuditUpdate(),
      });
    } catch (error) {
      logger.error('生成测试用例失败', error);
      setTestStreamMarkdown(
        (prev) =>
          prev +
          `\n\n---\n**生成失败：** ${error instanceof Error ? error.message : '请稍后重试'}\n`,
      );
      toast.error('生成失败，请稍后重试');
    } finally {
      setIsGeneratingTestCases(false);
    }
  };

  const handleRunPipelineTests = async () => {
    if (!selectedTask) return;
    const cases = selectedTask.generatedTestCases ?? [];
    if (!cases.length) {
      toast.error('请先生成测试用例');
      return;
    }
    setIsRunningTests(true);
    setTestStreamPhase('execute_tests');
    setTestStreamMarkdown('> 正在汇总测试用例与 FS/TS、代码上下文…\n\n');
    const taskSnapshot = selectedTask;
    const runSalt = `run_${Date.now()}`;
    const streamHeadRun = '> **测试报告**（流式输出，解析末尾 JSON 后写入下方统计表）\n\n';
    try {
      const linked = resolveSpecsForPipelineTask(taskSnapshot, specs);
      const fsTs = buildFsTsContextForTask(taskSnapshot, linked);
      const codeExcerpt = await collectAgentWorkspaceCodeExcerpt(taskSnapshot.requirementId);
      setTestStreamMarkdown(streamHeadRun);
      const caseLines = cases
        .map(
          (c) =>
            `- [${c.id}] ${c.title}\n  依据: ${c.basis.join('+')} · ${c.trace}\n  步骤: ${c.steps}\n  期望: ${c.expected}`,
        )
        .join('\n');
      const bundle =
        `=== 待执行用例 ===\n${caseLines}\n\n=== FS/TS 上下文（摘要）===\n${fsTs.slice(0, 40_000)}\n\n=== 代码摘录 ===\n${codeExcerpt.slice(0, 40_000)}`.slice(
          0,
          118_000,
        );

      const additionalRequirements =
        '请模拟在沙箱中对上述用例执行自动化测试，给出汇总结果。\n' +
        '最后必须且仅能包含一个 JSON 代码块（fence 为 json），格式：\n' +
        '```json\n' +
        '{"coverage":0-100的整数,"details":[{"name":"与用例标题一致或子步骤","status":"passed或failed","duration":"如 42ms","error":"失败时必填否则省略"}]}\n' +
        '```\n' +
        'details 条数应与待执行用例一一对应或可为其合理子拆分；coverage 为估算代码覆盖率。';

      let accumulated = '';
      const stream = await capabilityClient
        .load('pipeline_test_runner_1')
        .callStream<ICodeReviewResult>('textSummary', {
          code_content: bundle,
          additional_requirements: additionalRequirements,
        });

      for await (const chunk of stream) {
        if (chunk.summary) {
          accumulated += chunk.summary;
          setTestStreamMarkdown(streamHeadRun + accumulated);
        }
      }

      if (!accumulated.trim()) {
        accumulated = '（模型未返回有效内容）';
        setTestStreamMarkdown(streamHeadRun + accumulated);
      }

      let report = parseExecutionReportFromAi(accumulated);
      let note: string | undefined;
      if (!report) {
        report = heuristicExecuteReport(cases, runSalt);
        note = '模型未返回可解析执行结果，已使用 FS/TS/用例驱动的演示执行器。';
        toast.message('已生成测试报告', { description: note });
      } else {
        toast.success('自动化测试已完成并写入报告');
      }

      const record: IPipelineTestRunRecord = {
        id: `trun_${Date.now()}`,
        createdAt: new Date().toISOString(),
        testReport: report,
        caseIds: cases.map((c) => c.id),
        note,
      };
      const nextHistory = [...(taskSnapshot.testRunHistory ?? []), record];
      const lastReview = taskSnapshot.codeReviewHistory?.[taskSnapshot.codeReviewHistory.length - 1];
      const qualityMetrics = deriveQualityMetricsFromReview({
        summaryMarkdown: lastReview?.summaryMarkdown ?? '',
        testReport: report,
      });

      await upsertPipelineTask.mutateAsync({
        ...taskSnapshot,
        testReport: report,
        testRunHistory: nextHistory,
        qualityMetrics,
        ...rdAuditUpdate(),
      });
      setTestRunPreview(null);
    } catch (error) {
      logger.error('执行自动化测试失败', error);
      setTestStreamMarkdown(
        (prev) =>
          prev +
          `\n\n---\n**执行失败：** ${error instanceof Error ? error.message : '请稍后重试'}\n`,
      );
      toast.error('执行失败，未更新报告');
    } finally {
      setIsRunningTests(false);
    }
  };

  const handleCreatePipeline = async () => {
    if (!createForm.name.trim()) {
      toast.error('请输入流水线名称');
      return;
    }
    if (!createForm.requirementId) {
      toast.error('请先选择需求');
      return;
    }
    const existingTask = tasks.find((t) => t.requirementId === createForm.requirementId);
    if (existingTask) {
      toast.error('该需求已存在研发流水线，不允许重复创建');
      return;
    }
    if (!isValidPipelineGitUrl(createForm.gitUrl)) {
      toast.error('请输入有效的Git地址（https/ssh且以.git结尾）');
      return;
    }
    if (createForm.gitAuthMode === 'pat') {
      if (!createForm.gitPat.trim()) {
        toast.error('请选择 PAT 认证时请填写 Git PAT');
        return;
      }
      if (!/^https?:\/\//i.test(createForm.gitUrl.trim())) {
        toast.error('使用 PAT 时请填写 HTTPS Git 地址');
        return;
      }
    }
    if (createForm.gitAuthMode === 'ssh' && !/^git@[\w.-]+:[\w./-]+\.git$/i.test(createForm.gitUrl.trim())) {
      toast.error('使用 SSH 时请填写 SSH 格式 Git 地址');
      return;
    }
    if (!createForm.branch.trim()) {
      toast.error('请输入目标分支');
      return;
    }

    const selectedPrds = prds.filter((p) => p.requirementId === createForm.requirementId);
    const prdIdSet = new Set(selectedPrds.map((p) => p.id));
    const selectedSpecs = specs.filter((s) => prdIdSet.has(s.prdId));

    if (!selectedPrds.length) {
      toast.error('未找到可提交的PRD内容，请先补充PRD详情');
      return;
    }
    if (!selectedSpecs.length) {
      toast.error('未找到可提交的规格内容，请先补充规格详情');
      return;
    }

    setIsPublishingDocs(true);
    try {
      const docSessionAt = new Date();
      const workspaceSessionFolder = buildWorkspaceSessionFolderName(
        selectedRequirement?.title || createForm.name.trim(),
        docSessionAt,
      );
      const workspaceProductSlug = resolveWorkspaceProductSlug({
        productIdentifier: productForSelectedRequirement?.identifier,
        productId: productForSelectedRequirement?.id,
        requirementProductKey: selectedRequirement?.product,
      });
      const payload = {
        pipelineName: createForm.name.trim(),
        requirementTitle: selectedRequirement?.title || createForm.name.trim(),
        gitUrl: createForm.gitUrl.trim(),
        gitUsername: createForm.gitAuthMode === 'pat' ? createForm.gitUsername.trim() || undefined : undefined,
        gitPat: createForm.gitAuthMode === 'pat' ? createForm.gitPat.trim() || undefined : undefined,
        branch: createForm.branch.trim(),
        remarks: createForm.remarks.trim(),
        operator: currentProfile?.name || currentProfile?.email || 'unknown',
        prds: selectedPrds,
        specs: selectedSpecs,
        productSlug: workspaceProductSlug,
        sessionFolderName: workspaceSessionFolder,
      };

      const publishUrls = [
        '/api/pipeline-git/publish',
        '/pipeline-git/publish',
        'http://localhost:3000/pipeline-git/publish',
      ];
      let result: unknown = {};
      let publishSuccess = false;
      let publishError = '提交PRD/规格到Git失败';

      for (const url of publishUrls) {
        try {
          // eslint-disable-next-line no-restricted-syntax
          const response = await fetch(url, {
            method: 'POST',
            headers: authJsonHeaders(),
            body: JSON.stringify(payload),
          });
          result = await response.json().catch(() => ({}));
          if (response.status === 404 || response.status === 403) {
            publishError = extractPipelineErrorMessage(result, publishError);
            continue;
          }
          if (!response.ok) {
            publishError = extractPipelineErrorMessage(result, publishError);
            continue;
          }
          publishSuccess = true;
          break;
        } catch (error) {
          publishError = extractPipelineErrorMessage(error, publishError);
        }
      }

      if (!publishSuccess) {
        throw new Error(publishError);
      }
      const publishResult = result as { commitHash?: string };

      const now = new Date();
      const taskId = `task-${Date.now()}`;
      const relatedPrd = selectedPrds
        .map((p) => p.id)
        .map((id) => prdOptions.find((item) => item.id === id)?.label || id)
        .join('、');
      let commitStorePayload: IPipelineTask['commitStore'];
      try {
        const commitRecords = await fetchGitCommits(
          createForm.gitUrl.trim(),
          (createForm.gitBaseBranch.trim() || 'main'),
          20,
          createForm.gitAuthMode === 'pat' ? createForm.gitUsername.trim() : undefined,
          createForm.gitAuthMode === 'pat' ? createForm.gitPat.trim() : undefined
        );
        commitStorePayload = {
          pipelineName: createForm.name.trim(),
          gitUrl: createForm.gitUrl.trim(),
          branch: (createForm.gitBaseBranch.trim() || 'main'),
          records: commitRecords,
          updatedAt: new Date().toISOString(),
        };
      } catch (error) {
        logger.warn('拉取 commit 记录失败', error);
        toast.warning('流水线已创建，但 commit 记录暂未获取成功');
      }

      const newTask: IPipelineTask = {
        id: taskId,
        requirementId: createForm.requirementId,
        requirementTitle: selectedRequirement?.title || createForm.name || `流水线-${relatedPrd}`,
        status: 'code_generating',
        progress: 0,
        stage: 'AI代码生成中',
        startTime: now.toLocaleString('zh-CN'),
        estimatedEndTime: new Date(now.getTime() + 60 * 60 * 1000).toLocaleString('zh-CN'),
        logs: [
          { id: `log-${Date.now()}-1`, timestamp: now.toLocaleTimeString(), level: 'info', message: `已创建流水线：${createForm.name}` },
          {
            id: `log-${Date.now()}-2`,
            timestamp: now.toLocaleTimeString(),
            level: 'info',
            message: `Git仓库：${createForm.gitUrl}（工作分支 ${createForm.branch.trim()}，基准 ${createForm.gitBaseBranch.trim() || 'main'}）`,
          },
          { id: `log-${Date.now()}-3`, timestamp: now.toLocaleTimeString(), level: 'success', message: `文档已提交到Git，commit: ${publishResult.commitHash || 'unknown'}` },
          {
            id: `log-${Date.now()}-4`,
            timestamp: now.toLocaleTimeString(),
            level: 'info',
            message: `已按需求主线关联 PRD ${selectedPrds.length} 项，规格 ${selectedSpecs.length} 项`,
          },
          ...(createForm.gitAuthMode === 'pat' && createForm.gitPat.trim()
            ? [
                {
                  id: `log-${Date.now()}-5`,
                  timestamp: now.toLocaleTimeString(),
                  level: 'info' as const,
                  message: '当前流水线已通过 HTTPS + PAT 认证连接 Git 仓库',
                },
              ]
            : []),
        ],
        qualityMetrics: {
          specConsistency: 0,
          apiCoverage: 0,
          codeQuality: 0,
          testPassRate: 0,
        },
        pipelineMeta: {
          name: createForm.name.trim(),
          gitUrl: createForm.gitUrl.trim(),
          sandboxUrl: createForm.sandboxUrl.trim() || undefined,
          branch: createForm.branch.trim(),
          gitBaseBranch: createForm.gitBaseBranch.trim() || 'main',
          triggerMode: createForm.triggerMode,
          priority: createForm.priority,
          remarks: createForm.remarks.trim(),
          prdIds: selectedPrds.map((p) => p.id),
          specIds: selectedSpecs.map((s) => s.id),
          publishedDocuments: publishedDocsFromPublishResult(publishResult),
          workspaceProductSlug,
          workspaceSessionFolder,
        },
        commitStore: commitStorePayload,
        ...rdAuditCreate(),
      };

      await upsertPipelineTask.mutateAsync(newTask);
      setIsCreateDialogOpen(false);
      resetCreateForm();
      toast.success(`流水线创建成功，文档已提交（${publishResult.commitHash || '未知提交号'}）`);
      router.push(`/ai-pipeline/${encodeURIComponent(taskId)}`);
    } catch (error) {
      const message = extractPipelineErrorMessage(error, '提交失败');
      toast.error(message);
      logger.error('创建流水线并提交文档失败:', error);
    } finally {
      setIsPublishingDocs(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config = pipelineStatusConfig[status];
    if (!config) return null;
    const Icon = config.icon;
    const st = status as PipelineTaskStatus;
    const soft = PIPELINE_STATUS_BADGE_SOFT[st];
    if (!soft) {
      return (
        <Badge variant="outline" className="gap-1.5 border-border font-medium">
          <Icon className="size-3 shrink-0 opacity-80" />
          {config.label}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className={cn('gap-1.5 border font-medium', soft)}>
        <span className={cn('size-1.5 shrink-0 rounded-full', config.color)} aria-hidden />
        <Icon className="size-3 shrink-0 opacity-90" aria-hidden />
        {config.label}
      </Badge>
    );
  };

  return (
    <>
      <style jsx>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-pulse-dot {
          animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .log-terminal {
          background: linear-gradient(180deg, hsl(222 47% 11%) 0%, hsl(222 47% 8%) 100%);
        }
      `}</style>

      <div className="flex w-full flex-col gap-6">
        <ConfirmActionDialog
          state={confirmAction}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
        />
        <PromptActionDialog
          state={promptAction}
          onOpenChange={(open) => {
            if (!open) setPromptAction(null);
          }}
        />
        {/* 页面标题 */}
        <section className="w-full">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="rd-page-header-lead">
              <RdPageModuleHeading
                icon={Cpu}
                title={isDetail ? '交付引擎详情' : '交付引擎'}
                description={
                  isDetail
                    ? tasksLoading
                      ? '加载交付任务…'
                      : selectedTask ? resolveTaskCardTitle(selectedTask) : '交付引擎详情'
                    : '实时监控 AI 代码生成、测试与部署全流程'
                }
                leading={
                  isDetail ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => router.push('/ai-pipeline')}
                      aria-label="返回交付引擎列表"
                    >
                      <ArrowLeft className="size-4" />
                    </Button>
                  ) : undefined
                }
                footer={
                  isDetail && !tasksLoading && selectedTask ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      返回交付引擎可查看或创建其他流水线。
                    </p>
                  ) : undefined
                }
              />
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end">
              {isList ? (
                <Button onClick={() => setIsCreateDialogOpen(true)} className="shrink-0 shadow-sm sm:mt-0">
                  <Plus className="size-4 mr-2" />
                  创建流水线
                </Button>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 animate-pulse-dot rounded-full bg-purple-500" />
                  <span>运行中: {pipelineBoardStats.running}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span>已完成: {pipelineBoardStats.completed}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  <span>失败: {pipelineBoardStats.failed}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 流水线看板（仅列表页） */}
        {isList ? (
        <section className="w-full">
          <Card className="overflow-hidden border-border shadow-sm ring-1 ring-black/[0.03]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                交付引擎看板
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                点击卡片进入详情；快捷操作请使用卡片上的按钮或「···」菜单。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tasksLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              ) : tasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-6 py-16 text-center">
                  <Cpu className="mx-auto mb-3 size-10 text-muted-foreground/60" aria-hidden />
                  <p className="text-sm font-medium text-foreground">暂无流水线任务</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    创建流水线后，任务将保存到数据库并在此展示。
                  </p>
                </div>
              ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {tasks.map(task => {
                  const latestSession = pickLatestAgentSessionForRequirement(
                    task.requirementId,
                    agentSessionsForBoard,
                  );
                  const codingFinishedOnCard = isAgentCodingFinishedWhilePipelineCodeGenerating(
                    task,
                    latestSession,
                  );
                  const accent =
                    codingFinishedOnCard
                      ? 'bg-green-600'
                      : (PIPELINE_CARD_ACCENT[task.status] ?? 'bg-slate-400');
                  const cardProgressPct = displayPipelineCardProgressPct(task, { codingFinishedOnCard });
                  const cardExecLabel =
                    task.status === 'code_generating'
                      ? codingFinishedOnCard
                        ? '已完成'
                        : '代码生成中'
                      : (pipelineStatusConfig[task.status]?.label ?? task.stage);
                  const cardSubtitle = codingFinishedOnCard ? '编码阶段已完成' : task.stage;
                  return (
                    <Card
                      key={task.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`${resolveTaskCardTitle(task)}，${cardExecLabel}，阶段进度 ${cardProgressPct}%`}
                      className={cn(
                        'group relative cursor-pointer overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all duration-200',
                        'hover:-translate-y-0.5 hover:shadow-md',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      )}
                      onClick={() => router.push(`/ai-pipeline/${encodeURIComponent(task.id)}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/ai-pipeline/${encodeURIComponent(task.id)}`);
                        }
                      }}
                    >
                      <span
                        className={cn('absolute left-0 top-0 z-[1] h-full w-1 rounded-r', accent)}
                        aria-hidden
                      />
                      <CardContent className="relative p-4 pl-5">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          {task.status === 'code_generating' && codingFinishedOnCard ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                'gap-1.5 border font-medium',
                                PIPELINE_STATUS_BADGE_SOFT.completed,
                              )}
                            >
                              <span className="size-1.5 shrink-0 rounded-full bg-green-500" aria-hidden />
                              <CheckCircle2 className="size-3 shrink-0 opacity-90" aria-hidden />
                              已完成
                            </Badge>
                          ) : (
                            getStatusBadge(task.status)
                          )}
                          {task.status === 'code_generating' && !codingFinishedOnCard ? (
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-purple-500/10 ring-1 ring-purple-500/20">
                              <Loader2 className="size-4 animate-spin text-purple-600" aria-hidden />
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mb-1 line-clamp-1 text-sm font-medium text-foreground" title={resolveTaskCardTitle(task)}>
                          {resolveTaskCardTitle(task)}
                        </h3>
                        <p className="mb-3 text-xs text-muted-foreground">{cardSubtitle}</p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate text-muted-foreground">
                              <span className="font-medium text-foreground/90">
                                {PIPELINE_CARD_STAGE_LABEL[task.status]}
                              </span>
                              <span className="mx-1.5 text-border">·</span>
                              <span>阶段进度</span>
                            </span>
                            <span className="shrink-0 font-mono tabular-nums text-sm font-semibold text-foreground">
                              {cardProgressPct}%
                            </span>
                          </div>
                          <Progress
                            value={cardProgressPct}
                            className="h-2 bg-muted/80 [&_[data-slot=progress-indicator]]:duration-500 [&_[data-slot=progress-indicator]]:ease-out"
                          />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadDocs(task);
                            }}
                          >
                            下载（本地开发）
                          </Button>
                          <ListRowActionsMenu
                            stopPropagation
                            onView={() => handleViewTask(task.id)}
                            onEdit={() => handleEditTask(task.id)}
                            onDelete={() => handleDeleteTask(task.id)}
                            extraActions={[
                              {
                                key: 'retry',
                                label: '重试',
                                icon: <RotateCcw className="size-3" />,
                                onClick: () => handleAction('retry', task.id),
                              },
                              {
                                key: 'rollback',
                                label: '回滚',
                                icon: <XCircle className="size-3" />,
                                onClick: () => handleAction('rollback', task.id),
                                disabled: task.status === 'completed',
                                variant: 'destructive',
                              },
                              ...(task.status === 'completed' && task.pipelineMeta?.sandboxUrl?.trim()
                                ? [
                                    {
                                      key: 'sandbox',
                                      label: '访问沙箱',
                                      icon: <ExternalLink className="size-3" />,
                                      onClick: () =>
                                        window.open(
                                          task.pipelineMeta!.sandboxUrl!.trim(),
                                          '_blank',
                                          'noopener,noreferrer'
                                        ),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              )}
            </CardContent>
          </Card>
        </section>
        ) : null}

        {/* 任务详情（仅详情页，且已解析到任务） */}
        {isDetail && tasksLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-10 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        {isDetail && selectedTask ? (
          <section className="w-full">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full max-w-full grid-cols-6">
                <TabsTrigger value="overview">概览</TabsTrigger>
                <TabsTrigger value="agent">Agent工作台</TabsTrigger>
                <TabsTrigger value="code">项目代码</TabsTrigger>
                <TabsTrigger value="logs">实时日志</TabsTrigger>
                <TabsTrigger value="tests">测试报告</TabsTrigger>
                <TabsTrigger value="commits">Commit记录</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* 质量指标 */}
                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BarChart3 className="size-4 text-primary" />
                        质量指标面板
                      </CardTitle>
                      <CardDescription>
                        AI生成代码的质量评估结果
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {selectedTask.qualityMetrics ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center p-4 bg-muted/50 rounded-lg">
                            <div className="text-2xl font-bold text-primary">
                              {selectedTask.qualityMetrics.specConsistency}%
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">规格一致性</div>
                          </div>
                          <div className="text-center p-4 bg-muted/50 rounded-lg">
                            <div className="text-2xl font-bold text-indigo-500">
                              {selectedTask.qualityMetrics.apiCoverage}%
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">API覆盖度</div>
                          </div>
                          <div className="text-center p-4 bg-muted/50 rounded-lg">
                            <div className="text-2xl font-bold text-purple-500">
                              {selectedTask.qualityMetrics.codeQuality}%
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">代码质量</div>
                          </div>
                          <div className="text-center p-4 bg-muted/50 rounded-lg">
                            <div className="text-2xl font-bold text-green-500">
                              {selectedTask.qualityMetrics.testPassRate}%
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">测试通过率</div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                          <Activity className="size-12 mb-2 opacity-50" />
                          <p>任务进行中，质量指标将在代码生成完成后显示</p>
                        </div>
                      )}

                      {selectedTask.status !== 'failed' && (
                        <div className="mt-6 pt-6 border-t">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="font-medium flex items-center gap-2">
                              <Code2 className="size-4" />
                              AI代码审查
                            </h4>
                            <Button 
                              size="sm" 
                              onClick={handleCodeReview}
                              disabled={isReviewing}
                            >
                              {isReviewing ? (
                                <>
                                  <Loader2 className="size-3 mr-1 animate-spin" />
                                  分析中...
                                </>
                              ) : (
                                '启动审查'
                              )}
                            </Button>
                          </div>
                          {reviewResult && (
                            <div className="bg-muted/30 rounded-lg p-4">
                              <Streamdown>{reviewResult}</Streamdown>
                            </div>
                          )}
                          {selectedTask.codeReviewHistory &&
                            selectedTask.codeReviewHistory.length > 0 && (
                              <div className="mt-4 space-y-2">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                  <History className="size-3.5 shrink-0" />
                                  审查记录（点击切换查看）
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {[...selectedTask.codeReviewHistory].reverse().map((rec) => (
                                    <Button
                                      key={rec.id}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8 text-xs font-normal"
                                      onClick={() => setReviewResult(rec.summaryMarkdown)}
                                    >
                                      {new Date(rec.createdAt).toLocaleString('zh-CN', {
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* 任务信息 */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">任务信息</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">关联需求</div>
                        <div className="font-medium text-sm">{resolveTaskCardTitle(selectedTask)}</div>
                      </div>
                      {selectedTask.pipelineMeta?.gitUrl && (
                        <>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Git地址</div>
                            <div className="font-mono text-xs break-all">{selectedTask.pipelineMeta.gitUrl}</div>
                          </div>
                          {selectedTask.pipelineMeta.sandboxUrl?.trim() && (
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">沙箱环境</div>
                              <div className="font-mono text-xs break-all">{selectedTask.pipelineMeta.sandboxUrl}</div>
                            </div>
                          )}
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">目标分支</div>
                            <div className="font-mono text-sm">{selectedTask.pipelineMeta.branch}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">关联PRD</div>
                            <div className="text-sm">{(selectedTask.pipelineMeta.prdIds ?? []).join('、')}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">关联规格</div>
                            <div className="text-sm">{(selectedTask.pipelineMeta.specIds ?? []).join('、')}</div>
                          </div>
                          {selectedTask.pipelineMeta.publishedDocuments &&
                            selectedTask.pipelineMeta.publishedDocuments.length > 0 && (
                              <div className="pt-2">
                                <div className="text-xs text-muted-foreground mb-2">Git 文档（PRD / FS / TS / plan.md）</div>
                                <ul className="space-y-1.5 text-sm">
                                  {selectedTask.pipelineMeta.publishedDocuments.map((doc) => {
                                    const href = gitBlobViewerUrl(
                                      selectedTask.pipelineMeta!.gitUrl!,
                                      selectedTask.pipelineMeta!.branch!,
                                      doc.path
                                    );
                                    const kindLabel =
                                      doc.kind === 'prd'
                                        ? 'PRD'
                                        : doc.kind === 'fs'
                                          ? 'FS'
                                          : doc.kind === 'cp'
                                            ? 'CP'
                                            : 'TS';
                                    return (
                                      <li key={doc.path} className="break-all">
                                        {href ? (
                                          <a
                                            href={href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-medium text-primary underline-offset-4 hover:underline"
                                          >
                                            <ExternalLink className="mr-1 inline size-3.5 shrink-0 align-text-bottom" />
                                            [{kindLabel}] {doc.title}
                                          </a>
                                        ) : (
                                          <span className="text-muted-foreground">
                                            <span className="font-medium text-foreground">[{kindLabel}]</span>{' '}
                                            <span className="font-mono text-xs">{doc.path}</span>
                                            <span className="ml-1 text-xs">（当前仓库托管方无法自动生成浏览链接）</span>
                                          </span>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                        </>
                      )}
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">开始时间</div>
                        <div className="text-sm">{selectedTask.startTime}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">预计完成</div>
                        <div className="text-sm">{selectedTask.estimatedEndTime}</div>
                      </div>
                      <div className="pt-4 border-t">
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => router.push(`/requirements/${selectedTask.requirementId}`)}
                        >
                          查看需求详情
                        </Button>
                      </div>
                      {selectedTask.status === 'completed' && selectedTask.pipelineMeta?.sandboxUrl?.trim() && (
                        <Button
                          type="button"
                          className="w-full"
                          onClick={() => {
                            const u = selectedTask.pipelineMeta!.sandboxUrl!.trim();
                            window.open(u, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          <ExternalLink className="size-4 mr-2" />
                          访问沙箱环境
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="agent" className="mt-4">
                <AgentWorkbenchPanel
                  task={selectedTask}
                  operatorName={currentProfile?.name || currentProfile?.email || 'unknown'}
                />
              </TabsContent>

              <TabsContent value="code" className="mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Code2 className="size-4 text-primary" />
                      代码
                    </CardTitle>
                    <CardDescription>
                      在 Agent Workspace 的 worktree 中浏览源文件（只读），样式类似本地 IDE。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AgentWorkspaceCodePanel task={selectedTask} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="logs" className="mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Terminal className="size-4 text-primary" />
                      实时日志
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] w-full rounded-md border log-terminal p-4 font-mono text-sm">
                      {selectedTask.logs.map((log) => (
                        <div key={log.id} className="flex gap-3 py-1">
                          <span className="text-slate-500 shrink-0 w-[80px]">[{log.timestamp}]</span>
                          <span className={`shrink-0 w-[50px] font-medium ${pipelineLogLevelColors[log.level]}`}>
                            {log.level.toUpperCase()}
                          </span>
                          <span className="text-slate-300 break-all">{log.message}</span>
                        </div>
                      ))}
                      {selectedTask.status === 'code_generating' && (
                        <div className="flex gap-3 py-1 animate-pulse">
                          <span className="text-slate-500 shrink-0 w-[80px]">[{new Date().toLocaleTimeString()}]</span>
                          <span className="text-blue-400 shrink-0 w-[50px] font-medium">INFO</span>
                          <span className="text-slate-300">...</span>
                        </div>
                      )}
                      <div ref={logsEndRef} />
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tests" className="mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileCheck className="size-4 text-primary" />
                      测试报告与自动化用例
                    </CardTitle>
                    <CardDescription>
                      测试用例依据 FS、TS 与 Agent Workspace 中的生成代码由 AI 推导；每次执行测试会更新当前报告并追加一条历史快照（与代码审查记录类似）。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        已解析关联规格 {selectedTaskLinkedSpecs.length} 份
                        {(selectedTask.pipelineMeta?.specIds?.length ?? 0) > 0
                          ? `（meta.specIds：${(selectedTask.pipelineMeta?.specIds ?? []).join('、')}）`
                          : '（未配置 specIds 时按 PRD 回退匹配）'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleGeneratePipelineTestCases()}
                          disabled={
                            isGeneratingTestCases ||
                            isRunningTests ||
                            upsertPipelineTask.isPending ||
                            !selectedTaskLinkedSpecs.length
                          }
                        >
                          {isGeneratingTestCases ? (
                            <>
                              <Loader2 className="size-3 mr-1 animate-spin" />
                              生成中…
                            </>
                          ) : (
                            <>
                              <FlaskConical className="size-3.5 mr-1" />
                              AI 生成测试用例
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void handleRunPipelineTests()}
                          disabled={
                            isGeneratingTestCases ||
                            isRunningTests ||
                            upsertPipelineTask.isPending ||
                            !(selectedTask.generatedTestCases && selectedTask.generatedTestCases.length > 0)
                          }
                        >
                          {isRunningTests ? (
                            <>
                              <Loader2 className="size-3 mr-1 animate-spin" />
                              执行中…
                            </>
                          ) : (
                            <>
                              <Play className="size-3.5 mr-1" />
                              执行自动化测试
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {(testStreamPhase !== null || testStreamMarkdown.trim().length > 0) && (
                      <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2 shrink-0">
                          <h4 className="font-medium text-sm flex items-center gap-2 min-w-0">
                            {testStreamPhase === 'execute_tests' ? (
                              <>
                                <Activity className="size-4 text-primary shrink-0" />
                                测试报告 · 模型流式输出
                              </>
                            ) : testStreamPhase === 'generate_cases' ? (
                              <>
                                <FlaskConical className="size-4 text-primary shrink-0" />
                                测试用例 · 模型流式输出
                              </>
                            ) : (
                              <>
                                <FileCheck className="size-4 text-muted-foreground shrink-0" />
                                最近一次模型输出
                              </>
                            )}
                          </h4>
                          <div className="flex shrink-0 items-center gap-2">
                            {(isGeneratingTestCases || isRunningTests) && (
                              <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                            )}
                            <span className="hidden text-[10px] text-muted-foreground sm:inline tabular-nums">
                              框内滚动查看
                            </span>
                          </div>
                        </div>
                        <div
                          className={cn(
                            'h-[min(38vh,360px)] max-h-[50vh] w-full min-h-[8rem] shrink-0 overflow-y-auto overflow-x-auto',
                            'rounded-md border border-border bg-card p-3 text-sm overscroll-y-contain',
                            '[scrollbar-gutter:stable]',
                          )}
                          role="region"
                          aria-label="模型流式输出"
                        >
                          {testStreamMarkdown.trim() ? (
                            <div className="min-w-0 break-words [&_.prose]:max-w-none">
                              <Streamdown>{testStreamMarkdown}</Streamdown>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">正在连接模型…</p>
                          )}
                          <div ref={testStreamEndRef} className="h-px shrink-0" aria-hidden />
                        </div>
                      </div>
                    )}

                    {(selectedTask.generatedTestCases ?? []).length > 0 ? (
                      <div className="border border-border rounded-lg overflow-hidden">
                        <div className="bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          测试用例（自动生成 · 执行依据）
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/30 border-b border-border">
                              <tr>
                                <th className="text-left p-3 font-medium">标题 / 追溯</th>
                                <th className="text-left p-3 font-medium w-[120px]">依据</th>
                                <th className="text-left p-3 font-medium">步骤与期望</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {(selectedTask.generatedTestCases ?? []).map((tc) => (
                                <tr key={tc.id} className="hover:bg-muted/30">
                                  <td className="p-3 align-top">
                                    <div className="font-medium text-foreground">{tc.title}</div>
                                    <div className="text-xs text-muted-foreground mt-1 font-mono">{tc.trace}</div>
                                    {tc.relatedApiPath ? (
                                      <div className="text-xs text-primary mt-0.5 font-mono">{tc.relatedApiPath}</div>
                                    ) : null}
                                  </td>
                                  <td className="p-3 align-top">
                                    <div className="flex flex-wrap gap-1">
                                      {tc.basis.map((b) => (
                                        <Badge
                                          key={b}
                                          variant="outline"
                                          className={cn(
                                            'text-[10px] px-1.5 py-0 font-normal',
                                            b === 'fs' && 'border-slate-400/50 text-slate-700',
                                            b === 'ts' && 'border-indigo-400/50 text-indigo-800',
                                            b === 'code' && 'border-purple-400/50 text-purple-800',
                                          )}
                                        >
                                          {b.toUpperCase()}
                                        </Badge>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="p-3 align-top text-xs text-muted-foreground">
                                    <div>
                                      <span className="font-medium text-foreground">步骤：</span>
                                      {tc.steps}
                                    </div>
                                    <div className="mt-1">
                                      <span className="font-medium text-foreground">期望：</span>
                                      {tc.expected}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}

                    {displayTestReport ? (
                      <div className="space-y-4">
                        {testRunPreview ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
                            <span className="text-muted-foreground">
                              查看历史快照：
                              {new Date(testRunPreview.createdAt).toLocaleString('zh-CN')}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setTestRunPreview(null)}
                            >
                              返回当前 / 最新结果
                            </Button>
                          </div>
                        ) : null}
                        {testRunPreview?.note ? (
                          <p className="text-xs text-muted-foreground">{testRunPreview.note}</p>
                        ) : null}

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="text-center p-4 bg-muted/50 rounded-lg border border-border">
                            <div className="text-2xl font-bold">{displayTestReport.total}</div>
                            <div className="text-xs text-muted-foreground mt-1">总测试数</div>
                          </div>
                          <div className="text-center p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                            <div className="text-2xl font-bold text-green-700">{displayTestReport.passed}</div>
                            <div className="text-xs text-muted-foreground mt-1">通过</div>
                          </div>
                          <div className="text-center p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                            <div className="text-2xl font-bold text-red-700">{displayTestReport.failed}</div>
                            <div className="text-xs text-muted-foreground mt-1">失败</div>
                          </div>
                          <div className="text-center p-4 bg-primary/10 rounded-lg border border-primary/20">
                            <div className="text-2xl font-bold text-primary">{displayTestReport.coverage}%</div>
                            <div className="text-xs text-muted-foreground mt-1">代码覆盖率</div>
                          </div>
                        </div>

                        <div className="border border-border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50 border-b border-border">
                              <tr>
                                <th className="text-left p-3 font-medium">测试用例</th>
                                <th className="text-left p-3 font-medium">状态</th>
                                <th className="text-left p-3 font-medium">耗时</th>
                                <th className="text-left p-3 font-medium">错误信息</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {displayTestReport.details.map((test, idx) => (
                                <tr key={`${test.name}-${idx}`} className="hover:bg-muted/30">
                                  <td className="p-3 font-mono text-xs">{test.name}</td>
                                  <td className="p-3">
                                    {test.status === 'passed' ? (
                                      <Badge variant="default" className="bg-green-600 gap-1">
                                        <CheckCircle2 className="size-3" />
                                        通过
                                      </Badge>
                                    ) : (
                                      <Badge variant="destructive" className="gap-1">
                                        <XCircle className="size-3" />
                                        失败
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="p-3 text-muted-foreground">{test.duration}</td>
                                  <td className="p-3 text-red-600 text-xs">{test.error || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground border border-dashed border-border rounded-lg">
                        <FileCheck className="size-12 mb-2 opacity-50" />
                        <p>尚无测试报告</p>
                        <p className="text-sm mt-1 max-w-md">
                          请使用「AI 生成测试用例」后，再点击「执行自动化测试」生成报告。流水线阶段为：{selectedTask.stage}
                        </p>
                      </div>
                    )}

                    {selectedTask.testRunHistory && selectedTask.testRunHistory.length > 0 ? (
                      <div className="pt-2 border-t border-border">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                          <History className="size-3.5 shrink-0" />
                          测试执行历史（点击切换快照）
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant={testRunPreview ? 'outline' : 'default'}
                            size="sm"
                            className="h-8 text-xs font-normal"
                            onClick={() => setTestRunPreview(null)}
                          >
                            当前 / 最新
                          </Button>
                          {[...selectedTask.testRunHistory].reverse().map((rec) => (
                            <Button
                              key={rec.id}
                              type="button"
                              variant={testRunPreview?.id === rec.id ? 'default' : 'outline'}
                              size="sm"
                              className="h-8 text-xs font-normal"
                              onClick={() => setTestRunPreview(rec)}
                            >
                              {new Date(rec.createdAt).toLocaleString('zh-CN', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                              {rec.note ? ' · 回退' : ''}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="commits" className="mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <GitCommitHorizontal className="size-4 text-primary" />
                      Commit记录
                    </CardTitle>
                    <CardDescription>
                      展示流水线关联 Git 仓库最近提交记录（已保存至数据库）
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedTaskCommitStore?.records?.length ? (
                      <div className="space-y-3">
                        <div className="text-xs text-muted-foreground">
                          仓库：{selectedTaskCommitStore.gitUrl} | 分支：{selectedTaskCommitStore.branch}
                        </div>
                        <div className="rounded-md border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left p-3 font-medium">Hash</th>
                                <th className="text-left p-3 font-medium">提交信息</th>
                                <th className="text-left p-3 font-medium">作者</th>
                                <th className="text-left p-3 font-medium">时间</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedTaskCommitStore.records.map((record) => (
                                <tr key={`${record.hash}-${record.date}`} className="border-t">
                                  <td className="p-3 font-mono text-xs">{record.hash}</td>
                                  <td className="p-3">{record.message}</td>
                                  <td className="p-3">{record.author}</td>
                                  <td className="p-3 text-muted-foreground">{record.date}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <GitCommitHorizontal className="size-12 mb-2 opacity-50" />
                        <p>暂无 commit 记录</p>
                        <p className="text-sm mt-1">请先创建并提交该流水线文档到 Git</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </section>
        ) : null}
      </div>

      {isList ? (
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 pt-6 pb-4 text-left">
            <DialogTitle>创建流水线</DialogTitle>
            <DialogDescription>
              选择已具备 PRD 与规格的需求，配置 Git 与运行环境；提交后将写入文档并生成可追踪的流水线记录。
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-5 pr-1">
            <section
              className="space-y-4 rounded-lg border border-border bg-muted/20 p-4 shadow-sm"
              aria-labelledby="cp-section-req"
            >
              <div className="space-y-1">
                <h3 id="cp-section-req" className="text-sm font-semibold text-foreground">
                  关联与命名
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  仅列出已具备 PRD 与规格、且尚未创建流水线的需求；名称可与需求标题联动。
                </p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cp-requirement" className="text-sm font-medium">
                    关联需求（主线）
                  </Label>
                  <Select
                    value={createForm.requirementId}
                    onValueChange={syncPipelineNameByRequirement}
                  >
                    <SelectTrigger id="cp-requirement" className="w-full">
                      <SelectValue placeholder="请先选择需求" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRequirementsForPipeline.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.title} ({r.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cp-name" className="text-sm font-medium">
                    流水线名称
                  </Label>
                  <Input
                    id="cp-name"
                    placeholder={defaultPipelineName || '例如：支付网关-生产流水线'}
                    value={createForm.name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
              </div>
            </section>

            <section
              className="space-y-4 rounded-lg border border-border bg-muted/20 p-4 shadow-sm"
              aria-labelledby="cp-section-git"
            >
              <div className="space-y-1">
                <h3 id="cp-section-git" className="text-sm font-semibold text-foreground">
                  Git 仓库与认证
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  默认使用 PAT + HTTPS；仓库地址可与产品主数据对齐后在创建页微调。
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="cp-git-auth" className="text-sm font-medium">
                    Git 认证方式
                  </Label>
                  <Select
                    value={createForm.gitAuthMode}
                    onValueChange={(value: ICreatePipelineForm['gitAuthMode']) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        gitAuthMode: value,
                      }))
                    }
                  >
                    <SelectTrigger id="cp-git-auth" className="w-full">
                      <SelectValue placeholder="选择认证方式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pat">PAT（Personal Access Token）</SelectItem>
                      <SelectItem value="ssh">SSH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cp-trigger" className="text-sm font-medium">
                    触发方式
                  </Label>
                  <Select
                    value={createForm.triggerMode}
                    onValueChange={(value: ICreatePipelineForm['triggerMode']) =>
                      setCreateForm((prev) => ({ ...prev, triggerMode: value }))
                    }
                  >
                    <SelectTrigger id="cp-trigger" className="w-full">
                      <SelectValue placeholder="选择触发方式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">手动触发</SelectItem>
                      <SelectItem value="push">代码推送触发</SelectItem>
                      <SelectItem value="schedule">定时触发</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cp-priority" className="text-sm font-medium">
                    优先级
                  </Label>
                  <Select
                    value={createForm.priority}
                    onValueChange={(value: ICreatePipelineForm['priority']) =>
                      setCreateForm((prev) => ({ ...prev, priority: value }))
                    }
                  >
                    <SelectTrigger id="cp-priority" className="w-full">
                      <SelectValue placeholder="选择优先级" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="P0">P0</SelectItem>
                      <SelectItem value="P1">P1</SelectItem>
                      <SelectItem value="P2">P2</SelectItem>
                      <SelectItem value="P3">P3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {createForm.gitAuthMode === 'pat' && (
                <div
                  className="rounded-md border border-border bg-background/80 px-3 py-2.5 text-xs text-muted-foreground"
                  role="note"
                >
                  <span className="font-medium text-foreground">PAT 说明：</span>
                  <a
                    href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
                    className="text-primary underline-offset-2 hover:underline ml-1"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub
                  </a>
                  <span className="mx-1 text-muted-foreground">·</span>
                  <a
                    href="https://docs.gitlab.com/user/profile/personal_access_tokens/"
                    className="text-primary underline-offset-2 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitLab
                  </a>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="cp-git-url" className="text-sm font-medium">
                  Git 仓库地址
                </Label>
                <Input
                  id="cp-git-url"
                  className="font-mono text-sm"
                  placeholder={
                    createForm.gitAuthMode === 'pat'
                      ? 'https://github.com/org/repo.git'
                      : 'git@github.com:org/repo.git'
                  }
                  value={createForm.gitUrl}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, gitUrl: e.target.value }))}
                />
                {productForSelectedRequirement && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    已由产品「{productForSelectedRequirement.name}」预填；可在「产品管理」中维护主数据后重新打开本弹窗同步。
                  </p>
                )}
              </div>

              {createForm.gitAuthMode === 'pat' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cp-git-user" className="text-sm font-medium">
                      Git 用户名
                    </Label>
                    <Input
                      id="cp-git-user"
                      placeholder="未填写时默认 git"
                      value={createForm.gitUsername}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, gitUsername: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cp-git-pat" className="text-sm font-medium">
                      Git PAT（Personal Access Token）
                    </Label>
                    <Input
                      id="cp-git-pat"
                      type="password"
                      placeholder="可在「个人设置」保存默认 PAT；不会写入流水线持久化元数据"
                      value={createForm.gitPat}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, gitPat: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </section>

            <section
              className="space-y-4 rounded-lg border border-border bg-muted/20 p-4 shadow-sm"
              aria-labelledby="cp-section-run"
            >
              <h3 id="cp-section-run" className="text-sm font-semibold text-foreground">
                运行环境
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cp-sandbox" className="text-sm font-medium">
                    沙箱环境地址
                  </Label>
                  <Input
                    id="cp-sandbox"
                    className="font-mono text-sm"
                    placeholder="https://sandbox.example.com"
                    value={createForm.sandboxUrl}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, sandboxUrl: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cp-branch" className="text-sm font-medium">
                    目标分支
                  </Label>
                  <Input
                    id="cp-branch"
                    className="font-mono text-sm"
                    placeholder={createForm.requirementId || 'req_…'}
                    value={createForm.branch}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, branch: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    默认与需求 ID 一致，用于 Agent 工作区与推送；仓库检出基准分支固定为{' '}
                    <span className="font-mono">{createForm.gitBaseBranch.trim() || 'main'}</span>。
                  </p>
                </div>
              </div>
            </section>

            <div
              className="space-y-2 rounded-lg border border-border border-l-4 border-l-primary bg-muted/20 p-4 text-sm shadow-sm"
              role="status"
            >
              <p className="font-semibold text-foreground">交付前核对</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                提交后将把 PRD / 规格文档推送至上述 Git 分支，并创建本流水线任务。
              </p>
              <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                <li>PRD 数量：{prdOptions.length}</li>
                <li>规格数量：{specOptions.length}</li>
              </ul>
            </div>

            <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4 shadow-sm">
              <div className="space-y-2">
                <Label htmlFor="cp-remarks" className="text-sm font-medium">
                  备注
                </Label>
                <Textarea
                  id="cp-remarks"
                  placeholder="可填写执行策略、环境变量说明等"
                  value={createForm.remarks}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, remarks: e.target.value }))}
                  className="min-h-[88px]"
                />
              </div>
            </section>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background px-6 py-4 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                resetCreateForm();
              }}
            >
              取消
            </Button>
            <Button onClick={handleCreatePipeline} disabled={isPublishingDocs}>
              {isPublishingDocs ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  提交中…
                </>
              ) : (
                '创建流水线'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      ) : null}
    </>
  );
};

export default AIPipelinePage;
