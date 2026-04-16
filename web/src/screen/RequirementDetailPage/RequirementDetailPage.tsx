'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getCurrentUser, onStoredUserUpdated } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Streamdown } from '@/components/ui/streamdown';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { UserDisplay } from '@/components/business-ui/user-display';
import {
  ArrowLeft,
  FileText,
  Settings2,
  Cpu,
  GitBranch,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Edit3,
  CheckSquare,
  RotateCcw,
  MessageSquare,
  Paperclip,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  usePrdsList,
  useRequirement,
  useSpecsList,
  useAcceptanceRecords,
  usePipelineTasksList,
} from '@/lib/rd-hooks';
import type { IRequirement } from '@/lib/rd-types';
import { buildRequirementFlowHistory, type IFlowHistoryItem } from '@/lib/requirement-flow-history';

interface IRelatedDoc {
  id: string;
  type: 'prd' | 'spec' | 'code';
  title: string;
  status: string;
  updatedAt: string;
  url?: string;
}

// 状态配置
const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  backlog: { label: '需求池', color: 'text-slate-700', bgColor: 'bg-slate-500/10', icon: Clock },
  prd_writing: { label: 'PRD编写中', color: 'text-blue-700', bgColor: 'bg-blue-500/10', icon: FileText },
  spec_defining: { label: '规格说明书', color: 'text-indigo-700', bgColor: 'bg-indigo-500/10', icon: Settings2 },
  ai_developing: { label: 'AI开发中', color: 'text-purple-700', bgColor: 'bg-purple-500/10', icon: Cpu },
  pending_acceptance: { label: '待验收', color: 'text-orange-700', bgColor: 'bg-orange-500/10', icon: CheckCircle },
  released: { label: '已发布', color: 'text-green-700', bgColor: 'bg-green-500/10', icon: CheckCircle },
};

const priorityConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  P0: { label: 'P0', color: 'text-red-700', bgColor: 'bg-red-500/10' },
  P1: { label: 'P1', color: 'text-orange-700', bgColor: 'bg-orange-500/10' },
  P2: { label: 'P2', color: 'text-blue-700', bgColor: 'bg-blue-500/10' },
  P3: { label: 'P3', color: 'text-slate-700', bgColor: 'bg-slate-500/10' },
};

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const formatDateTime = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// 获取状态色条颜色
const getStatusColor = (status: string) => {
  const colorMap: Record<string, string> = {
    backlog: 'bg-slate-500',
    prd_writing: 'bg-blue-500',
    spec_defining: 'bg-indigo-500',
    ai_developing: 'bg-purple-500',
    pending_acceptance: 'bg-orange-500',
    released: 'bg-green-500',
  };
  return colorMap[status] || 'bg-slate-500';
};

const RequirementDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: requirement, isLoading: reqLoading } = useRequirement(id);
  const { data: prds = [] } = usePrdsList();
  const { data: specs = [] } = useSpecsList();
  const { data: acceptanceRecords = [] } = useAcceptanceRecords();
  const { data: pipelineTasks = [] } = usePipelineTasksList();
  const [history, setHistory] = useState<IFlowHistoryItem[]>([]);
  const [relatedDocs, setRelatedDocs] = useState<IRelatedDoc[]>([]);
  const [authVersion, setAuthVersion] = useState(0);
  const loading = reqLoading;

  useEffect(() => {
    const bump = () => setAuthVersion((v) => v + 1);
    const offUser = onStoredUserUpdated(bump);
    const onFocus = () => bump();
    window.addEventListener('focus', onFocus);
    return () => {
      offUser();
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (!id || !requirement) {
      setRelatedDocs([]);
      setHistory([]);
      return;
    }
    const related: IRelatedDoc[] = [];
    const prd = prds.find((p) => p.requirementId === id);
    if (prd) {
      related.push({
        id: prd.id,
        type: 'prd',
        title: prd.title || `${requirement.title} PRD`,
        status: prd.status,
        updatedAt: prd.updatedAt,
      });
    }
    const spec = prd ? specs.find((s) => s.prdId === prd.id) : undefined;
    if (spec) {
      related.push({
        id: spec.id,
        type: 'spec',
        title: `规格说明-${spec.id}`,
        status: spec.status,
        updatedAt: spec.updatedAt,
      });
    }
    setHistory(
      buildRequirementFlowHistory(
        requirement,
        prd,
        spec,
        pipelineTasks,
        acceptanceRecords,
        getCurrentUser()
      )
    );
    setRelatedDocs(related);
  }, [id, requirement, prds, specs, pipelineTasks, acceptanceRecords]);

  const handleBack = () => {
    router.push('/requirements');
  };

  const handleEdit = () => {
    router.push(`/requirements/${id}/edit`);
  };

  const handleViewPRD = () => {
    const prdDoc = relatedDocs.find((doc) => doc.type === 'prd');
    if (prdDoc) {
      router.push(`/prd/${prdDoc.id}/edit`);
    }
  };

  const handleViewSpec = () => {
    const specDoc = relatedDocs.find((doc) => doc.type === 'spec');
    if (specDoc) {
      router.push(`/specification/${specDoc.id}/edit`);
    }
  };

  const handleProceed = () => {
    // 进入下一阶段
    logger.info('进入下一阶段');
  };

  const handleAcceptance = () => {
    router.push('/acceptance');
  };

  if (loading) {
    return (
      <div className="w-full space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 bg-muted rounded" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  if (!requirement) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-20">
        <AlertCircle className="size-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">需求不存在或已被删除</p>
        <Button variant="outline" className="mt-4" onClick={handleBack}>
          返回列表
        </Button>
      </div>
    );
  }

  const statusInfo = statusConfig[requirement.status];
  const priorityInfo = priorityConfig[requirement.priority];
  const StatusIcon = statusInfo?.icon || Clock;
  void authVersion;
  const tags = (requirement as IRequirement & { tags?: string[] }).tags;

  const pmClaimed =
    Boolean(requirement.pm) || (requirement.taskAcceptances ?? []).some((r) => r.role === 'pm');
  const tmClaimed =
    Boolean(requirement.tm) || (requirement.taskAcceptances ?? []).some((r) => r.role === 'tm');
  const pmAcceptance = (requirement.taskAcceptances ?? []).find((r) => r.role === 'pm');
  const tmAcceptance = (requirement.taskAcceptances ?? []).find((r) => r.role === 'tm');
  const submitterDisplay = requirement.submitterName?.trim() || requirement.submitter;
  const pmDisplay = pmAcceptance?.userName?.trim() || requirement.pm;
  const tmDisplay = tmAcceptance?.userName?.trim() || requirement.tm;

  const pmCoins = requirement.pmCoins ?? 0;
  const tmCoins = requirement.tmCoins ?? 0;

  return (
    <>
      <style jsx>{`
        .page-enter {
          animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .timeline-line {
          position: absolute;
          left: 15px;
          top: 32px;
          bottom: -16px;
          width: 2px;
          background: var(--border);
        }
        .timeline-item:last-child .timeline-line {
          display: none;
        }
      `}</style>

      <div className="w-full space-y-6 page-enter">
        {/* 顶部导航 */}
        <section className="w-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="rd-page-title">{requirement.title}</h1>
              <p className="rd-page-desc mt-1">{requirement.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleEdit}>
              <Edit3 className="size-4 mr-2" />
              编辑
            </Button>
            {requirement.status === 'pending_acceptance' && (
              <Button onClick={handleAcceptance}>
                <CheckSquare className="size-4 mr-2" />
                去验收
              </Button>
            )}
            {requirement.status === 'ai_developing' && (
              <Button onClick={handleProceed}>
                <ArrowRight className="size-4 mr-2" />
                提交验收
              </Button>
            )}
          </div>
        </section>

        {/* 状态卡片 */}
        <section className="w-full">
          <Card className="relative overflow-hidden">
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${getStatusColor(requirement.status)}`} />
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <Badge className={`${priorityInfo.bgColor} ${priorityInfo.color} border-0`}>
                  {priorityInfo.label}
                </Badge>
                <Badge className={`${statusInfo.bgColor} ${statusInfo.color} border-0 flex items-center gap-1`}>
                  <StatusIcon className="size-3" />
                  {statusInfo.label}
                </Badge>
                {tags?.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">提交人</p>
                  <span className="text-sm text-foreground">{submitterDisplay || '—'}</span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">产品经理</p>
                  {pmDisplay ? (
                    <span className="text-sm text-foreground">{pmDisplay}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">待领取</span>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">技术经理</p>
                  {tmDisplay ? (
                    <span className="text-sm text-foreground">{tmDisplay}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">待领取</span>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">期望上线</p>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="size-4 text-muted-foreground" />
                    {formatDate(requirement.expectedDate)}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">所属产品</p>
                  <p className="text-sm text-foreground">{requirement.product || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">金币</p>
                  <p className="font-mono text-sm tabular-nums text-foreground">
                    {requirement.bountyPoints != null && requirement.bountyPoints > 0 ? (
                      <>
                        共 {requirement.bountyPoints}
                        <span className="ml-2 block text-[11px] font-normal text-muted-foreground">
                          PM {pmCoins} / TM {tmCoins}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {(requirement.taskAcceptances?.length ?? 0) > 0 ? (
          <section className="w-full">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">任务领取记录</CardTitle>
                <CardDescription>
                  领取时记入；金币仅在需求验收通过并<strong>已发布</strong>后对领取人生效。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {requirement.taskAcceptances!.map((rec) => (
                    <li
                      key={rec.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <span>
                        {rec.role === 'pm' ? '产品经理' : '技术经理'} ·{' '}
                        <span className="font-medium">{rec.userName || rec.userId}</span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {rec.coins} 金币 ·{' '}
                        {requirement.status === 'released' ? (
                          <span className="text-green-600 dark:text-green-400">已生效</span>
                        ) : (
                          <span>待发布后生效</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {/* 主内容区 */}
        <section className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：详情内容 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 需求描述 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <MessageSquare className="size-4" />
                  需求描述
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-foreground [&_.streamdown]:max-w-none">
                  {requirement.description?.trim() ? (
                    <Streamdown className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-headings:scroll-mt-4 prose-p:leading-relaxed prose-li:my-0.5 prose-table:text-sm">
                      {requirement.description}
                    </Streamdown>
                  ) : (
                    <p className="text-sm text-muted-foreground">暂无描述</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 关联文档 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Paperclip className="size-4" />
                  关联文档
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {relatedDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => doc.type === 'prd' ? handleViewPRD() : doc.type === 'spec' ? handleViewSpec() : null}
                    >
                      <div className="flex items-center gap-3">
                        {doc.type === 'prd' && <FileText className="size-4 text-blue-500" />}
                        {doc.type === 'spec' && <Settings2 className="size-4 text-indigo-500" />}
                        {doc.type === 'code' && <GitBranch className="size-4 text-purple-500" />}
                        <div>
                          <p className="text-sm font-medium">{doc.title}</p>
                          <p className="text-xs text-muted-foreground">
                            更新于 {formatDateTime(doc.updatedAt)}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={doc.status === 'approved' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {doc.status === 'approved' ? '已批准' : doc.status === 'developing' ? '开发中' : '草稿'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 流转历史 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <RotateCcw className="size-4" />
                  流转历史
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {history.map((item, index) => (
                    <div key={item.id} className="timeline-item relative pl-8 pb-6">
                      <div className="timeline-line" />
                      <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{item.action}</p>
                          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1 gap-y-1">
                            <span>{item.stage}</span>
                            <span aria-hidden>·</span>
                            <UserDisplay value={item.operator} size="small" showLabel />
                          </div>
                          {item.comment && (
                            <p className="text-xs text-muted-foreground mt-2 bg-muted p-2 rounded">
                              {item.comment}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(item.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 右侧：当前状态与待办 */}
          <div className="space-y-6">
            {/* 当前阶段 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">当前阶段</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-3 rounded-lg ${statusInfo.bgColor}`}>
                    <StatusIcon className={`size-5 ${statusInfo.color}`} />
                  </div>
                  <div>
                    <p className="font-medium">{statusInfo.label}</p>
                    <p className="text-xs text-muted-foreground">当前状态</p>
                  </div>
                </div>

                <Separator className="my-4" />

                {/* 待办事项 */}
                <div>
                  <p className="text-sm font-medium mb-3">待办事项</p>
                  <div className="space-y-2">
                    {requirement.status === 'backlog' && (
                      <>
                        <div className="flex items-start gap-2 text-sm">
                          <AlertCircle className="size-4 text-muted-foreground mt-0.5" />
                          <span className="text-muted-foreground">等待产品经理进行需求评审</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm">
                          <AlertCircle className="size-4 text-muted-foreground mt-0.5" />
                          <span className="text-muted-foreground">确认期望上线时间</span>
                        </div>
                      </>
                    )}
                    {requirement.status === 'prd_writing' && (
                      <>
                        <div className="flex items-start gap-2 text-sm">
                          <AlertCircle className="size-4 text-muted-foreground mt-0.5" />
                          <span className="text-muted-foreground">完成PRD文档编写</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm">
                          <AlertCircle className="size-4 text-muted-foreground mt-0.5" />
                          <span className="text-muted-foreground">绘制业务流程图</span>
                        </div>
                      </>
                    )}
                    {requirement.status === 'spec_defining' && (
                      <>
                        <div className="flex items-start gap-2 text-sm">
                          <AlertCircle className="size-4 text-muted-foreground mt-0.5" />
                          <span className="text-muted-foreground">定义功能规格(FS)</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm">
                          <AlertCircle className="size-4 text-muted-foreground mt-0.5" />
                          <span className="text-muted-foreground">定义技术规格(TS)</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm">
                          <AlertCircle className="size-4 text-muted-foreground mt-0.5" />
                          <span className="text-muted-foreground">生成Machine-Readable格式</span>
                        </div>
                      </>
                    )}
                    {requirement.status === 'ai_developing' && (
                      <>
                        <div className="flex items-start gap-2 text-sm">
                          <div className="size-4 mt-0.5 relative">
                            <div className="absolute inset-0 bg-primary rounded-full animate-ping opacity-75" />
                            <div className="relative size-4 bg-primary rounded-full" />
                          </div>
                          <span className="text-primary font-medium">AI正在生成代码...</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm">
                          <AlertCircle className="size-4 text-muted-foreground mt-0.5" />
                          <span className="text-muted-foreground">等待自动化测试完成</span>
                        </div>
                      </>
                    )}
                    {requirement.status === 'pending_acceptance' && (
                      <>
                        <div className="flex items-start gap-2 text-sm">
                          <AlertCircle className="size-4 text-orange-500 mt-0.5" />
                          <span className="text-orange-600 font-medium">等待干系人验收</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm">
                          <AlertCircle className="size-4 text-muted-foreground mt-0.5" />
                          <span className="text-muted-foreground">对比原始需求与实际功能</span>
                        </div>
                      </>
                    )}
                    {requirement.status === 'released' && (
                      <div className="flex items-start gap-2 text-sm">
                        <CheckCircle className="size-4 text-green-500 mt-0.5" />
                        <span className="text-green-600">需求已闭环，已正式发布</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="my-4" />

                {/* 快捷操作 */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">快捷操作</p>
                  {requirement.status === 'prd_writing' && (
                    <Button className="w-full" size="sm" onClick={handleViewPRD}>
                      <FileText className="size-4 mr-2" />
                      编辑PRD
                    </Button>
                  )}
                  {requirement.status === 'spec_defining' && (
                    <Button className="w-full" size="sm" onClick={handleViewSpec}>
                      <Settings2 className="size-4 mr-2" />
                      编辑规格
                    </Button>
                  )}
                  {requirement.status === 'ai_developing' && (
                    <Button className="w-full" size="sm" variant="outline" onClick={() => router.push('/ai-pipeline')}>
                      <Cpu className="size-4 mr-2" />
                      查看流水线
                    </Button>
                  )}
                  {requirement.status === 'pending_acceptance' && (
                    <Button className="w-full" size="sm" onClick={handleAcceptance}>
                      <CheckSquare className="size-4 mr-2" />
                      开始验收
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 时间信息 */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">创建时间</span>
                    <span>{formatDateTime(requirement.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">最后更新</span>
                    <span>{formatDateTime(requirement.updatedAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">距期望上线</span>
                    <span className={new Date(requirement.expectedDate) < new Date() ? 'text-red-500' : 'text-green-600'}>
                      {Math.ceil((new Date(requirement.expectedDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} 天
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </>
  );
};

export default RequirementDetailPage;
