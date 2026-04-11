'use client';
import React, { useState, useEffect, useRef } from 'react';
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
  Play, 
  Pause, 
  RotateCcw, 
  XCircle, 
  CheckCircle2, 
  AlertCircle,
  Terminal,
  BarChart3,
  Activity,
  ExternalLink,
  Code2,
  FileCheck,
  Loader2,
  Plus,
  GitCommitHorizontal,
} from 'lucide-react';
import { ListRowActionsMenu } from '@/components/business-ui/list-row-actions-menu';
import { Streamdown } from '@/components/ui/streamdown';
import { logger } from '@/lib/logger';
import {
  useDeletePipelineTask,
  usePipelineTasksList,
  usePrdsList,
  useRequirementsList,
  useSpecsList,
  useUpsertPipelineTask,
} from '@/lib/rd-hooks';
import type { IGitCommitRecord, IPipelineTask } from '@/lib/rd-types';
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
  branch: string;
  triggerMode: 'manual' | 'push' | 'schedule';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  remarks: string;
  requirementId: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{className?: string}> }> = {
  code_generating: { label: '代码生成中', color: 'bg-purple-500', icon: Code2 },
  self_testing: { label: '自动化测试中', color: 'bg-blue-500', icon: FileCheck },
  building: { label: '构建中', color: 'bg-indigo-500', icon: Activity },
  deploying: { label: '部署中', color: 'bg-orange-500', icon: Loader2 },
  completed: { label: '已完成', color: 'bg-green-500', icon: CheckCircle2 },
  failed: { label: '失败', color: 'bg-red-500', icon: XCircle },
};

const logLevelColors: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  success: 'text-green-400',
};

const AIPipelinePage: React.FC = () => {
  const router = useRouter();
  const currentProfile = useCurrentUserProfile();
  const { data: requirements = [] } = useRequirementsList();
  const { data: prds = [] } = usePrdsList();
  const { data: specs = [] } = useSpecsList();
  const { data: tasks = [], isLoading: tasksLoading } = usePipelineTasksList();
  const upsertPipelineTask = useUpsertPipelineTask();
  const deletePipelineTask = useDeletePipelineTask();
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPublishingDocs, setIsPublishingDocs] = useState(false);
  const [prdOptions, setPrdOptions] = useState<IRelationOption[]>([]);
  const [specOptions, setSpecOptions] = useState<IRelationOption[]>([]);
  const [createForm, setCreateForm] = useState<ICreatePipelineForm>({
    name: '',
    gitUrl: '',
    branch: 'main',
    triggerMode: 'manual',
    priority: 'P1',
    remarks: '',
    requirementId: '',
  });
  const logsEndRef = useRef<HTMLDivElement>(null);

  const selectedTask = tasks.find(t => t.id === selectedTaskId);
  const selectedRequirement = requirements.find((r) => r.id === createForm.requirementId);
  const defaultPipelineName = selectedRequirement ? `${selectedRequirement.title}-生产流水线` : '';
  const selectedTaskCommitStore = selectedTask?.commitStore;

  const isValidGitUrl = (url: string) => {
    const normalized = url.trim();
    if (!normalized) return false;
    const httpPattern = /^https?:\/\/.+\.git$/i;
    const sshPattern = /^git@[\w.-]+:[\w./-]+\.git$/i;
    return httpPattern.test(normalized) || sshPattern.test(normalized);
  };

  const resetCreateForm = () => {
    setCreateForm({
      name: '',
      gitUrl: '',
      branch: 'main',
      triggerMode: 'manual',
      priority: 'P1',
      remarks: '',
      requirementId: '',
    });
  };

  const fetchGitCommits = async (gitUrl: string, branch: string, limit = 20): Promise<IGitCommitRecord[]> => {
    const query = new URLSearchParams({
      gitUrl: gitUrl.trim(),
      branch: branch.trim(),
      limit: String(limit),
    }).toString();
    const fallbackUrls = [
      `/api/pipeline-git/commits?${query}`,
      `/pipeline-git/commits?${query}`,
      `http://localhost:3000/pipeline-git/commits?${query}`,
    ];
    let lastError = '';
    for (const url of fallbackUrls) {
      // eslint-disable-next-line no-restricted-syntax
      const response = await globalThis.fetch(url);
      if (response.status === 404 || response.status === 403) {
        continue;
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = String((result && (result.message || result.error)) || '获取 commit 记录失败');
        continue;
      }
      return Array.isArray(result) ? result : [];
    }
    throw new Error(lastError || '获取 commit 记录失败');
  };

  const syncPipelineNameByRequirement = (nextRequirementId: string) => {
    const nextRequirement = requirements.find((r) => r.id === nextRequirementId);
    const nextDefaultName = nextRequirement ? `${nextRequirement.title}-生产流水线` : '';
    const currentRequirement = requirements.find((r) => r.id === createForm.requirementId);
    const currentDefaultName = currentRequirement ? `${currentRequirement.title}-生产流水线` : '';

    setCreateForm((prev) => {
      const shouldApplyDefaultName = !prev.name.trim() || prev.name === currentDefaultName;
      return {
        ...prev,
        requirementId: nextRequirementId,
        name: shouldApplyDefaultName ? nextDefaultName : prev.name,
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
    if (!tasks.length) {
      setSelectedTaskId('');
      return;
    }
    setSelectedTaskId((prev) => (tasks.some((t) => t.id === prev) ? prev : tasks[0].id));
  }, [tasks]);

  useEffect(() => {
    const activeRequirementId = createForm.requirementId;
    const prdList = prds
      .filter((prd) => !activeRequirementId || prd.requirementId === activeRequirementId)
      .map((prd) => ({ id: prd.id, label: prd.title || prd.id }));
    const prdIdSet = new Set(prds.filter((p) => p.requirementId === activeRequirementId).map((p) => p.id));
    const specList = specs
      .filter((spec) => !activeRequirementId || prdIdSet.has(spec.prdId))
      .map((spec) => ({ id: spec.id, label: `${spec.id} (${spec.status})` }));
    setPrdOptions(prdList);
    setSpecOptions(specList);
  }, [prds, specs, createForm.requirementId]);

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
      await upsertPipelineTask.mutateAsync(next);
      toast.success('操作已保存');
    } catch (error) {
      logger.error('更新流水线任务失败', error);
      toast.error('保存失败，请重试');
    }
  };

  const handleViewTask = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const handleEditTask = async (taskId: string) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    const nextName = window.prompt('请输入新的流水线名称', target.requirementTitle);
    if (!nextName || !nextName.trim()) return;
    try {
      await upsertPipelineTask.mutateAsync({ ...target, requirementTitle: nextName.trim() });
      toast.success('已更新');
    } catch (error) {
      logger.error('更新流水线任务失败', error);
      toast.error('保存失败，请重试');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('确认删除该流水线任务吗？')) return;
    try {
      await deletePipelineTask.mutateAsync(taskId);
      toast.success('已删除');
    } catch (error) {
      logger.error('删除流水线任务失败', error);
      toast.error('删除失败，请重试');
    }
  };

  const handleCodeReview = async () => {
    if (!selectedTask) return;
    
    setIsReviewing(true);
    setReviewResult('');
    
    try {
      const codeContent = selectedTask.logs.map(l => l.message).join('\n');
      const stream = await capabilityClient
        .load('code_review_assistant_1')
        .callStream<ICodeReviewResult>('textSummary', {
          code_content: codeContent,
          additional_requirements: '重点关注代码规范、潜在bug和性能问题'
        });

      for await (const chunk of stream) {
        if (chunk.summary) {
          setReviewResult(prev => prev + chunk.summary);
        }
      }
    } catch (error) {
      logger.error('代码审查失败:', error);
      setReviewResult('代码审查服务暂时不可用，请稍后重试。');
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
    if (!isValidGitUrl(createForm.gitUrl)) {
      toast.error('请输入有效的Git地址（https/ssh且以.git结尾）');
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
      const payload = {
        pipelineName: createForm.name.trim(),
        gitUrl: createForm.gitUrl.trim(),
        branch: createForm.branch.trim(),
        remarks: createForm.remarks.trim(),
        operator: currentProfile?.name || currentProfile?.email || 'unknown',
        prds: selectedPrds,
        specs: selectedSpecs,
      };

      // eslint-disable-next-line no-restricted-syntax
      let response = await fetch('/api/pipeline-git/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.status === 404 || response.status === 403) {
        // eslint-disable-next-line no-restricted-syntax
        response = await fetch('/pipeline-git/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if (response.status === 404 || response.status === 403) {
        // eslint-disable-next-line no-restricted-syntax
        response = await fetch('http://localhost:3000/pipeline-git/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (result && (result.message || result.error)) || '提交PRD/规格到Git失败';
        throw new Error(Array.isArray(message) ? message.join('；') : String(message));
      }

      const now = new Date();
      const taskId = `task-${Date.now()}`;
      const relatedPrd = selectedPrds
        .map((p) => p.id)
        .map((id) => prdOptions.find((item) => item.id === id)?.label || id)
        .join('、');
      let commitStorePayload: IPipelineTask['commitStore'];
      try {
        const commitRecords = await fetchGitCommits(createForm.gitUrl.trim(), createForm.branch.trim(), 20);
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
          { id: `log-${Date.now()}-3`, timestamp: now.toLocaleTimeString(), level: 'success', message: `文档已提交到Git，commit: ${result.commitHash || 'unknown'}` },
          {
            id: `log-${Date.now()}-4`,
            timestamp: now.toLocaleTimeString(),
            level: 'info',
            message: `已按需求主线关联 PRD ${selectedPrds.length} 项，规格 ${selectedSpecs.length} 项`,
          },
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
          branch: createForm.branch.trim(),
          triggerMode: createForm.triggerMode,
          priority: createForm.priority,
          remarks: createForm.remarks.trim(),
          prdIds: selectedPrds.map((p) => p.id),
          specIds: selectedSpecs.map((s) => s.id),
        },
        commitStore: commitStorePayload,
      };

      await upsertPipelineTask.mutateAsync(newTask);
      setSelectedTaskId(taskId);
      setIsCreateDialogOpen(false);
      resetCreateForm();
      toast.success(`流水线创建成功，文档已提交（${result.commitHash || '未知提交号'}）`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '提交失败';
      toast.error(message);
      logger.error('创建流水线并提交文档失败:', error);
    } finally {
      setIsPublishingDocs(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status];
    if (!config) return null;
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} text-white gap-1`}>
        <Icon className="size-3" />
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

      <div className="w-full space-y-6">
        {/* 页面标题 */}
        <section className="w-full">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2 rd-page-title">
                <Cpu className="size-6 text-purple-500" />
                AI开发监控
              </h1>
              <p className="rd-page-desc mt-1">
                实时监控AI代码生成、测试与部署全流程
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="size-4 mr-2" />
                创建流水线
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse-dot" />
                  <span>运行中: {tasks.filter(t => t.status !== 'completed' && t.status !== 'failed').length}</span>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>已完成: {tasks.filter(t => t.status === 'completed').length}</span>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span>失败: {tasks.filter(t => t.status === 'failed').length}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 流水线看板 */}
        <section className="w-full">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                流水线看板
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tasksLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              ) : tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  暂无流水线任务。创建流水线后，任务将保存到数据库并在此展示。
                </p>
              ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {tasks.map(task => {
                  const isSelected = selectedTaskId === task.id;
                  
                  return (
                    <Card 
                      key={task.id}
                      className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                        isSelected ? 'ring-2 ring-primary border-primary' : ''
                      }`}
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          {getStatusBadge(task.status)}
                          {task.status === 'code_generating' && (
                            <Loader2 className="size-4 animate-spin text-purple-500" />
                          )}
                        </div>
                        <h3 className="font-medium text-sm line-clamp-1 mb-1" title={task.requirementTitle}>
                          {task.requirementTitle}
                        </h3>
                        <p className="text-xs text-muted-foreground mb-3">
                          {task.stage}
                        </p>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">进度</span>
                            <span className="font-medium">{task.progress}%</span>
                          </div>
                          <Progress value={task.progress} className="h-1.5" />
                        </div>
                        <div className="flex items-center justify-end mt-3 pt-3 border-t">
                          <ListRowActionsMenu
                            stopPropagation
                            onView={() => handleViewTask(task.id)}
                            onEdit={() => handleEditTask(task.id)}
                            onDelete={() => handleDeleteTask(task.id)}
                            extraActions={[
                              {
                                key: 'pause',
                                label: '暂停',
                                icon: <Pause className="size-3" />,
                                onClick: () => handleAction('pause', task.id),
                                disabled: task.status === 'completed' || task.status === 'failed',
                              },
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
                              ...(task.status === 'completed'
                                ? [
                                    {
                                      key: 'sandbox',
                                      label: '访问沙箱',
                                      icon: <ExternalLink className="size-3" />,
                                      onClick: () => window.open('#', '_blank'),
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

        {/* 任务详情 */}
        {selectedTask && (
          <section className="w-full">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 max-w-2xl">
                <TabsTrigger value="overview">概览</TabsTrigger>
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
                      {selectedTask.status === 'completed' && (
                        <Button className="w-full">
                          <ExternalLink className="size-4 mr-2" />
                          访问沙箱环境
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </div>
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
                      {selectedTask.logs.map((log, index) => (
                        <div key={log.id} className="flex gap-3 py-1">
                          <span className="text-slate-500 shrink-0 w-[80px]">[{log.timestamp}]</span>
                          <span className={`shrink-0 w-[50px] font-medium ${logLevelColors[log.level]}`}>
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
        )}
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>创建流水线</DialogTitle>
            <DialogDescription>
              配置流水线基础信息，必须关联 PRD 与规格，并对接 Git 仓库地址。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
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
                  {requirements.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title} ({r.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">流水线名称</label>
              <Input
                placeholder={defaultPipelineName || '例如：支付网关-生产流水线'}
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                placeholder="https://github.com/org/repo.git 或 git@github.com:org/repo.git"
                value={createForm.gitUrl}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, gitUrl: e.target.value }))}
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

          <DialogFooter>
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
    </>
  );
};

export default AIPipelinePage;
