'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { 
  FileText, 
  Settings2, 
  Code2, 
  Database, 
  AlertTriangle, 
  CheckCircle, 
  Plus,
  RefreshCw,
  ShieldAlert,
  ArrowRight,
  Send,
  XCircle,
} from 'lucide-react';
import { ListRowActionsMenu } from '@/components/business-ui/list-row-actions-menu';
import { Streamdown } from '@/components/ui/streamdown';
import { capabilityClient } from '@/lib/capability-client';
import { getCurrentUser } from '@/lib/auth';
import { useApproveSpec, useDeleteSpec, usePrdsList, useRejectSpec, useSpecsList, useSubmitSpecReview } from '@/lib/rd-hooks';
import { mapSpecsToListRows, type ISpecListRow } from '@/lib/spec-list-mapper';
import { toast } from 'sonner';

interface IConflictResult {
  conflict_type: string;
  position: string;
  description: string;
  suggestion: string;
}

const SpecPage: React.FC = () => {
  const router = useRouter();
  const { data: fullSpecs = [], isLoading: loadingSpecs } = useSpecsList();
  const { data: prds = [] } = usePrdsList();
  const approveSpecMutation = useApproveSpec();
  const rejectSpecMutation = useRejectSpec();
  const submitSpecReviewMutation = useSubmitSpecReview();
  const deleteSpecMutation = useDeleteSpec();
  const specs = React.useMemo(() => mapSpecsToListRows(fullSpecs, prds), [fullSpecs, prds]);
  const loading = loadingSpecs;
  const [selectedSpec, setSelectedSpec] = useState<ISpecListRow | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<string>('');
  const [conflicts, setConflicts] = useState<IConflictResult[]>([]);

  const getFSProgress = (spec: ISpecListRow) => {
    const total = spec.functionalSpec.apis + spec.functionalSpec.uiComponents + spec.functionalSpec.interactions;
    const completed = spec.functionalSpec.completedApis + spec.functionalSpec.completedUi + spec.functionalSpec.completedInteractions;
    return Math.round((completed / total) * 100);
  };

  const getTSProgress = (spec: ISpecListRow) => {
    let completed = 0;
    let total = 3;
    if (spec.technicalSpec.databaseSchema) completed++;
    if (spec.technicalSpec.architecture) completed++;
    completed += spec.technicalSpec.completedIntegrations > 0 ? 1 : 0;
    return Math.round((completed / total) * 100);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/10 text-green-400 hover:bg-green-500/20"><CheckCircle className="w-3 h-3 mr-1" />已批准</Badge>;
      case 'reviewing':
        return <Badge className="bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"><RefreshCw className="w-3 h-3 mr-1" />评审中</Badge>;
      default:
        return <Badge className="bg-slate-500/10 text-slate-300 hover:bg-slate-500/20"><FileText className="w-3 h-3 mr-1" />草稿</Badge>;
    }
  };

  const handleAIReview = async (spec: ISpecListRow) => {
    setSelectedSpec(spec);
    setIsReviewDialogOpen(true);
    setIsReviewing(true);
    setReviewResult('');
    setConflicts([]);

    try {
      const techSpecContent = `
功能规格 (FS):
- API接口: ${spec.functionalSpec.completedApis}/${spec.functionalSpec.apis} 已完成
- UI组件: ${spec.functionalSpec.completedUi}/${spec.functionalSpec.uiComponents} 已完成
- 交互逻辑: ${spec.functionalSpec.completedInteractions}/${spec.functionalSpec.interactions} 已完成

技术规格 (TS):
- 数据库Schema: ${spec.technicalSpec.databaseSchema ? '已完成' : '未完成'}
- 系统架构: ${spec.technicalSpec.architecture ? '已完成' : '未完成'}
- 第三方集成: ${spec.technicalSpec.completedIntegrations}/${spec.technicalSpec.thirdPartyIntegrations} 已完成

Machine-Readable JSON: ${spec.machineReadableJson ? '已生成' : '未生成'}
      `;

      const existingSystemLogic = `
现有系统架构:
1. 采用微服务架构，服务间通过gRPC通信
2. 数据库使用PostgreSQL主从架构
3. 缓存层使用Redis集群
4. 权限系统基于RBAC模型
5. API网关使用Kong，限流策略为1000req/s
6. 文件存储使用MinIO对象存储
7. 消息队列使用RabbitMQ
8. 现有用户表结构与新增字段需要兼容
      `;

      const result = await capabilityClient
        .load('conflict_detector_tech_spec_1')
        .call('textToJson', {
          tech_spec_content: techSpecContent,
          existing_system_logic: existingSystemLogic,
        });

      const resultData = result as { conflict_list?: IConflictResult[] };
      if (resultData?.conflict_list && Array.isArray(resultData.conflict_list)) {
        setConflicts(resultData.conflict_list);
        if (resultData.conflict_list.length === 0) {
          setReviewResult('✅ 未检测到冲突\n\n技术规格与现有系统架构兼容，可以继续推进开发。');
        } else {
          const conflictSummary = resultData.conflict_list.map((c: IConflictResult, i: number) => 
            `**冲突 ${i + 1}: ${c.conflict_type}**\n- 位置: ${c.position}\n- 描述: ${c.description}\n- 建议: ${c.suggestion}`
          ).join('\n\n');
          setReviewResult(`⚠️ 检测到 ${resultData.conflict_list.length} 个潜在冲突\n\n${conflictSummary}`);
        }
      } else {
        setReviewResult('✅ 未检测到冲突\n\n技术规格与现有系统架构兼容，可以继续推进开发。');
      }
    } catch (error) {
      setReviewResult('❌ 检测失败\n\n请稍后重试或联系管理员。');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleEditSpec = (specId: string) => {
    router.push(`/specification/${specId}/edit`);
  };

  const handleViewSpec = (specId: string) => {
    router.push(`/specification/${specId}/edit`);
  };

  const handleCreateSpec = () => {
    router.push('/specification/new/edit');
  };

  const handleApproveSpec = (specId: string) => {
    const comment = window.prompt('请输入审核通过意见（可选）') || undefined;
    const actorUserId = getCurrentUser()?.id;
    void approveSpecMutation
      .mutateAsync({ specId, reviewer: '技术经理', comment, actorUserId })
      .then(() => toast.success('规格审核已通过，需求已进入AI开发阶段'));
  };

  const handleRejectSpec = (specId: string) => {
    const comment = window.prompt('请输入驳回原因（建议填写）') || undefined;
    const actorUserId = getCurrentUser()?.id;
    void rejectSpecMutation
      .mutateAsync({ specId, reviewer: '技术经理', comment, actorUserId })
      .then(() => toast.success('规格已驳回并退回草稿'));
  };

  const handleSubmitReview = (specId: string) => {
    const comment = window.prompt('请输入提交审核说明（可选）') || undefined;
    const actorUserId = getCurrentUser()?.id;
    void submitSpecReviewMutation
      .mutateAsync({ specId, reviewer: '技术经理', comment, actorUserId })
      .then(() => toast.success('规格已提交审核'));
  };

  const handleDeleteSpec = (specId: string) => {
    if (!window.confirm('确认删除该规格文档吗？')) return;
    void deleteSpecMutation.mutateAsync(specId).then(() => toast.success('规格已删除'));
  };

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        .spec-card {
          transition: transform 0.2s ease-out, box-shadow 0.2s ease-out, border-color 0.2s ease-out;
        }
        .spec-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px -12px hsl(0 0% 0% / 0.55);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>

      <div className="w-full space-y-6 animate-fade-in">
        {/* 页面标题 */}
        <section className="w-full">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="rd-page-title">规格说明书</h1>
              <p className="rd-page-desc mt-1">
                编辑页推荐流程：组织编码约束 → 功能规格 FS（参考 PRD）→ 技术规格 TS（参考 FS + 约束）→ 编程计划 CP（参考 FS + TS，对应 plan.md），并导出 Machine-Readable JSON
              </p>
            </div>
            <Button onClick={handleCreateSpec}>
              <Plus className="w-4 h-4 mr-2" />
              新建规格
            </Button>
          </div>
        </section>

        {/* 统计概览 */}
        <section className="w-full grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{specs.length}</p>
                  <p className="text-xs text-muted-foreground">规格总数</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-slate-500/10 p-2">
                  <Settings2 className="h-5 w-5 text-slate-300" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{specs.filter(s => s.status === 'draft').length}</p>
                  <p className="text-xs text-muted-foreground">草稿中</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-indigo-500/10 p-2">
                  <RefreshCw className="h-5 w-5 text-indigo-300" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{specs.filter(s => s.status === 'reviewing').length}</p>
                  <p className="text-xs text-muted-foreground">评审中</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-500/10 p-2">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{specs.filter(s => s.status === 'approved').length}</p>
                  <p className="text-xs text-muted-foreground">已批准</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 规格列表 */}
        <section className="w-full">
          {specs.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>暂无规格文档</EmptyTitle>
                <EmptyDescription>点击上方按钮创建新的规格说明书</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={handleCreateSpec}>
                  <Plus className="w-4 h-4 mr-2" />
                  新建规格
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="space-y-4">
              {specs.map((spec) => (
                <Card key={spec.id} className="spec-card overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    {/* 左侧状态条 */}
                    <div 
                      className={`w-1 md:w-1.5 shrink-0 ${
                        spec.status === 'approved' ? 'bg-green-500' :
                        spec.status === 'reviewing' ? 'bg-indigo-500' : 'bg-slate-400'
                      }`} 
                    />
                    
                    <CardContent className="flex-1 p-5">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        {/* 左侧信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              className="text-base font-medium text-foreground truncate hover:underline text-left"
                              onClick={() => handleViewSpec(spec.id)}
                            >
                              {spec.prdTitle}
                            </button>
                            {getStatusBadge(spec.status)}
                            {spec.machineReadableJson && (
                              <Badge variant="outline" className="text-xs">
                                <Code2 className="w-3 h-3 mr-1" />
                                Machine-Ready
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            最后更新: {new Date(spec.updatedAt).toLocaleString('zh-CN')}
                          </p>
                          {/* 进度条 */}
                          <div className="mt-4 space-y-3">
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="flex items-center text-muted-foreground">
                                  <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                                  功能规格 (FS)
                                </span>
                                <span className="font-medium">{getFSProgress(spec)}%</span>
                              </div>
                              <Progress value={getFSProgress(spec)} className="h-1.5" />
                              <div className="flex gap-4 mt-1.5 text-xs text-muted-foreground">
                                <span>API: {spec.functionalSpec.completedApis}/{spec.functionalSpec.apis}</span>
                                <span>UI: {spec.functionalSpec.completedUi}/{spec.functionalSpec.uiComponents}</span>
                                <span>交互: {spec.functionalSpec.completedInteractions}/{spec.functionalSpec.interactions}</span>
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="flex items-center text-muted-foreground">
                                  <Database className="w-3.5 h-3.5 mr-1.5" />
                                  技术规格 (TS)
                                </span>
                                <span className="font-medium">{getTSProgress(spec)}%</span>
                              </div>
                              <Progress value={getTSProgress(spec)} className="h-1.5" />
                            </div>
                          </div>
                        </div>

                        {/* 右侧操作 */}
                        <div className="flex items-center shrink-0">
                          <ListRowActionsMenu
                            onView={() => handleViewSpec(spec.id)}
                            onEdit={() => handleEditSpec(spec.id)}
                            onDelete={() => handleDeleteSpec(spec.id)}
                            extraActions={[
                              ...(spec.status === 'draft'
                                ? [
                                    {
                                      key: 'submit-review',
                                      label: '提交审核',
                                      icon: <Send className="h-4 w-4" />,
                                      onClick: () => handleSubmitReview(spec.id),
                                    },
                                  ]
                                : []),
                              ...(spec.status === 'reviewing'
                                ? [
                                    {
                                      key: 'approve',
                                      label: '通过审核',
                                      icon: <CheckCircle className="h-4 w-4 text-green-500" />,
                                      onClick: () => handleApproveSpec(spec.id),
                                    },
                                    {
                                      key: 'reject',
                                      label: '驳回',
                                      icon: <XCircle className="h-4 w-4" />,
                                      onClick: () => handleRejectSpec(spec.id),
                                      variant: 'destructive' as const,
                                    },
                                  ]
                                : []),
                              {
                                key: 'ai-review',
                                label: 'AI预评审',
                                icon: <ShieldAlert className="h-4 w-4" />,
                                onClick: () => handleAIReview(spec),
                              },
                            ]}
                          />
                        </div>
                      </div>
                      {spec.reviews && spec.reviews.length > 0 && (
                        <div className="mt-3 text-xs text-muted-foreground">
                          最近审核：{spec.reviews[spec.reviews.length - 1].reviewer}
                          {' · '}
                          {new Date(spec.reviews[spec.reviews.length - 1].createdAt).toLocaleString('zh-CN')}
                          {spec.reviews[spec.reviews.length - 1].comment
                            ? ` · ${spec.reviews[spec.reviews.length - 1].comment}`
                            : ''}
                        </div>
                      )}
                    </CardContent>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* AI预评审弹窗 */}
        <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-indigo-500" />
                AI 预评审 - {selectedSpec?.prdTitle}
              </DialogTitle>
              <DialogDescription>
                检测技术规格与现有系统架构的逻辑冲突
              </DialogDescription>
            </DialogHeader>
            
            <div className="mt-4 space-y-4 overflow-y-auto max-h-[60vh]">
              {isReviewing ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-primary mb-4" />
                  <p className="text-sm text-muted-foreground">AI正在分析技术规格...</p>
                  <p className="text-xs text-muted-foreground mt-1">预计需要 10-20 秒</p>
                </div>
              ) : conflicts.length > 0 ? (
                <>
                  <Alert className="border-amber-500/50 bg-amber-50/50">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <AlertTitle className="text-amber-800">检测到 {conflicts.length} 个潜在冲突</AlertTitle>
                    <AlertDescription className="text-amber-700">
                      请在进入AI开发前解决以下冲突，以避免生成代码与现有系统不兼容。
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-3">
                    {conflicts.map((conflict, index) => (
                      <Card key={index} className="border-l-4 border-l-amber-500">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <h4 className="font-medium text-sm">
                                {conflict.conflict_type}
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">
                                位置: {conflict.position}
                              </p>
                              <p className="text-sm mt-2">{conflict.description}</p>
                              <div className="mt-3 p-2 bg-slate-50 rounded text-xs">
                                <span className="font-medium text-green-700">建议: </span>
                                {conflict.suggestion}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              ) : reviewResult ? (
                <div className="prose prose-sm max-w-none">
                  <Streamdown>{reviewResult}</Streamdown>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsReviewDialogOpen(false)}>
                关闭
              </Button>
              {conflicts.length > 0 && (
                <Button onClick={() => selectedSpec && handleEditSpec(selectedSpec.id)}>
                  去修复
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default SpecPage;
