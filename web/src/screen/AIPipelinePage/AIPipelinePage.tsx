'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import type {
  IGitCommitRecord,
  IPipelineCodeReviewRecord,
  IPipelineTask,
  PipelineTaskStatus,
} from '@/lib/rd-types';
import { cn } from '@/lib/utils';
import { deriveQualityMetricsFromReview } from '@/lib/pipeline-code-review-metrics';
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
  const [reviewResult, setReviewResult] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPublishingDocs, setIsPublishingDocs] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);
  const [promptAction, setPromptAction] = useState<PromptActionState | null>(null);
  const [createForm, setCreateForm] = useState<ICreatePipelineForm>({
    name: '',
    gitUrl: '',
    gitAuthMode: 'ssh',
    gitUsername: '',
    gitPat: '',
    sandboxUrl: '',
    branch: 'main',
    triggerMode: 'manual',
    priority: 'P1',
    remarks: '',
    requirementId: '',
  });
  const logsEndRef = useRef<HTMLDivElement>(null);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId),
    [selectedTaskId, tasks],
  );
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
      .map((prd) => ({ id: prd.id, label: prd.title || prd.id }));
  }, [createForm.requirementId, prds]);
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
    setCreateForm({
      name: '',
      gitUrl: '',
      gitAuthMode: 'ssh',
      gitUsername: '',
      gitPat: '',
      sandboxUrl: '',
      branch: 'main',
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

  const syncPipelineNameByRequirement = (nextRequirementId: string) => {
    const nextRequirement = requirements.find((r) => r.id === nextRequirementId);
    const nextDefaultName = nextRequirement ? `${nextRequirement.title}-生产流水线` : '';
    const currentRequirement = requirements.find((r) => r.id === createForm.requirementId);
    const currentDefaultName = currentRequirement ? `${currentRequirement.title}-生产流水线` : '';
    const nextProduct = findProductForRequirement(nextRequirement, products);
    const nextGit = nextProduct?.gitUrl?.trim() ?? '';
    const nextSandbox = nextProduct?.sandboxUrl?.trim() ?? '';

    setCreateForm((prev) => {
      const shouldApplyDefaultName = !prev.name.trim() || prev.name === currentDefaultName;
      return {
        ...prev,
        requirementId: nextRequirementId,
        name: shouldApplyDefaultName ? nextDefaultName : prev.name,
        gitUrl: nextGit,
        sandboxUrl: nextSandbox,
      };
    });
  };

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

  const handleAction = async (action: 'pause' | 'retry' | 'rollback', taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    try {
      let next: IPipelineTask;
      switch (action) {
        case 'pause':
          next = { ...task, status: 'code_generating', stage: '已暂停' };
          break;
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
          createForm.branch.trim(),
          20,
          createForm.gitAuthMode === 'pat' ? createForm.gitUsername.trim() : undefined,
          createForm.gitAuthMode === 'pat' ? createForm.gitPat.trim() : undefined
        );
        commitStorePayload = {
          pipelineName: createForm.name.trim(),
          gitUrl: createForm.gitUrl.trim(),
          branch: createForm.branch.trim(),
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
          { id: `log-${Date.now()}-2`, timestamp: now.toLocaleTimeString(), level: 'info', message: `Git仓库：${createForm.gitUrl} (${createForm.branch})` },
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
                      : selectedTask?.requirementTitle || '交付引擎详情'
                    : '实时监控 AI 代码生成、测试与部署全流程'
                }
                descriptionLines={isDetail ? 'multi' : 'single'}
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
                  const accent = PIPELINE_CARD_ACCENT[task.status] ?? 'bg-slate-400';
                  return (
                    <Card
                      key={task.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`${task.requirementTitle}，${task.stage}，进度 ${task.progress}%`}
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
                          {getStatusBadge(task.status)}
                          {task.status === 'code_generating' ? (
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-purple-500/10 ring-1 ring-purple-500/20">
                              <Loader2 className="size-4 animate-spin text-purple-600" aria-hidden />
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mb-1 line-clamp-1 text-sm font-medium text-foreground" title={task.requirementTitle}>
                          {task.requirementTitle}
                        </h3>
                        <p className="mb-3 text-xs text-muted-foreground">{task.stage}</p>
                        <div className="space-y-2">
                          <div className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="font-medium uppercase tracking-wide text-muted-foreground">
                              进度
                            </span>
                            <span className="font-mono tabular-nums text-sm font-semibold text-foreground">
                              {task.progress}%
                            </span>
                          </div>
                          <Progress value={task.progress} className="h-1.5 bg-muted" />
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t pt-3">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700"
                              disabled={task.status === 'completed' || task.status === 'failed'}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAction('pause', task.id);
                              }}
                            >
                              暂停
                            </Button>
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
                          </div>
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
                <TabsTrigger value="commits">commit记录</TabsTrigger>
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
                        <div className="font-medium text-sm">{selectedTask.requirementTitle}</div>
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
                      测试报告
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedTask.testReport ? (
                      <div className="space-y-6">
                        {/* 测试统计 */}
                        <div className="grid grid-cols-4 gap-4">
                          <div className="text-center p-4 bg-muted/50 rounded-lg">
                            <div className="text-2xl font-bold">{selectedTask.testReport.total}</div>
                            <div className="text-xs text-muted-foreground mt-1">总测试数</div>
                          </div>
                          <div className="text-center p-4 bg-green-50 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">{selectedTask.testReport.passed}</div>
                            <div className="text-xs text-muted-foreground mt-1">通过</div>
                          </div>
                          <div className="text-center p-4 bg-red-50 rounded-lg">
                            <div className="text-2xl font-bold text-red-600">{selectedTask.testReport.failed}</div>
                            <div className="text-xs text-muted-foreground mt-1">失败</div>
                          </div>
                          <div className="text-center p-4 bg-blue-50 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">{selectedTask.testReport.coverage}%</div>
                            <div className="text-xs text-muted-foreground mt-1">代码覆盖率</div>
                          </div>
                        </div>

                        {/* 测试详情 */}
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left p-3 font-medium">测试用例</th>
                                <th className="text-left p-3 font-medium">状态</th>
                                <th className="text-left p-3 font-medium">耗时</th>
                                <th className="text-left p-3 font-medium">错误信息</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {selectedTask.testReport.details.map((test, idx) => (
                                <tr key={idx} className="hover:bg-muted/30">
                                  <td className="p-3 font-mono text-xs">{test.name}</td>
                                  <td className="p-3">
                                    {test.status === 'passed' ? (
                                      <Badge variant="default" className="bg-green-500 gap-1">
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
                                  <td className="p-3 text-red-500 text-xs">{test.error || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <FileCheck className="size-12 mb-2 opacity-50" />
                        <p>测试报告将在自动化测试完成后生成</p>
                        <p className="text-sm mt-1">当前阶段: {selectedTask.stage}</p>
                      </div>
                    )}
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
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>创建流水线</DialogTitle>
            <DialogDescription>
              配置流水线基础信息，必须关联 PRD 与规格，并对接 Git 仓库地址。
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2 pr-1">
            <div className="space-y-2">
              <label className="text-sm font-medium">关联需求（主线）</label>
              <Select
                value={createForm.requirementId}
                onValueChange={syncPipelineNameByRequirement}
              >
                <SelectTrigger>
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
              <p className="text-xs text-muted-foreground">
                仅展示满足前置依赖（已存在 PRD 与规格说明）且尚未创建流水线的需求。
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">流水线名称</label>
              <Input
                placeholder={defaultPipelineName || '例如：支付网关-生产流水线'}
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Git 认证方式</label>
                <Select
                  value={createForm.gitAuthMode}
                  onValueChange={(value: ICreatePipelineForm['gitAuthMode']) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      gitAuthMode: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择认证方式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ssh">SSH</SelectItem>
                    <SelectItem value="pat">PAT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">触发方式</label>
                <Select
                  value={createForm.triggerMode}
                  onValueChange={(value: ICreatePipelineForm['triggerMode']) =>
                    setCreateForm((prev) => ({ ...prev, triggerMode: value }))
                  }
                >
                  <SelectTrigger>
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
                <label className="text-sm font-medium">优先级</label>
                <Select
                  value={createForm.priority}
                  onValueChange={(value: ICreatePipelineForm['priority']) =>
                    setCreateForm((prev) => ({ ...prev, priority: value }))
                  }
                >
                  <SelectTrigger>
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Git 地址</label>
              <Input
                placeholder={
                  createForm.gitAuthMode === 'pat'
                    ? 'https://github.com/org/repo.git'
                    : 'git@github.com:org/repo.git'
                }
                value={createForm.gitUrl}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, gitUrl: e.target.value }))}
              />
              {productForSelectedRequirement && (
                <p className="text-xs text-muted-foreground">
                  已根据需求所属产品「{productForSelectedRequirement.name}」从产品目录带入；可在「产品管理」中维护仓库与沙箱。
                </p>
              )}
            </div>

            {createForm.gitAuthMode === 'pat' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Git 用户名</label>
                  <Input
                    placeholder="未填写时默认 git"
                    value={createForm.gitUsername}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, gitUsername: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Git PAT （ Personal Access Token ）</label>
                  <Input
                    type="password"
                    placeholder="仅 HTTPS 地址生效，不会保存到流水线元数据"
                    value={createForm.gitPat}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, gitPat: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">沙箱环境地址</label>
              <Input
                placeholder="https://sandbox.example.com"
                value={createForm.sandboxUrl}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, sandboxUrl: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">目标分支</label>
              <Input
                placeholder="main"
                value={createForm.branch}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, branch: e.target.value }))}
              />
            </div>

            <div className="rounded-md border bg-muted/20 p-3 text-sm space-y-1">
              <p>将自动关联该需求下的 PRD 与规格：</p>
              <p className="text-muted-foreground">PRD 数量：{prdOptions.length}</p>
              <p className="text-muted-foreground">规格数量：{specOptions.length}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">备注</label>
              <Textarea
                placeholder="可填写执行策略、环境变量说明等"
                value={createForm.remarks}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, remarks: e.target.value }))}
                className="min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t pt-4 bg-background">
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
                  提交中...
                </>
              ) : (
                '创建'
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
