'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { capabilityClient } from '@/lib/capability-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Streamdown } from '@/components/ui/streamdown';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { FileSearch, CheckCircle, XCircle, RotateCcw, ExternalLink, MessageSquare, History, AlertCircle, Star, Send } from 'lucide-react';
import { ListRowActionsMenu } from '@/components/business-ui/list-row-actions-menu';
import { toast } from 'sonner';
import { getCurrentUser } from '@/lib/auth';
import { rdAuditUpdate } from '@/lib/rd-actor';
import type { IAcceptanceRecord as IStoreAcceptanceRecord } from '@/lib/mock-data-store';
import {
  useAcceptanceRecords,
  useAddAcceptanceRecord,
  useDeleteRequirement,
  useRequirementsList,
  useUpsertRequirement,
} from '@/lib/rd-hooks';

interface IRequirement {
  id: string;
  title: string;
  description: string;
  sketchUrl?: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  expectedDate: string;
  status: 'backlog' | 'prd_writing' | 'spec_defining' | 'ai_developing' | 'pending_acceptance' | 'released';
  submitter: string;
  pm?: string;
  tm?: string;
  createdAt: string;
  updatedAt: string;
}

type IAcceptanceRecord = IStoreAcceptanceRecord;

interface IAcceptancePageProps {}

const getStatusBadge = (status: string) => {
  const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending_acceptance: { label: '待验收', variant: 'outline' },
    released: { label: '已发布', variant: 'default' },
  };
  const { label, variant } = config[status] || { label: status, variant: 'default' };
  return <Badge variant={variant}>{label}</Badge>;
};

const getPriorityBadge = (priority: string) => {
  const colors: Record<string, string> = {
    P0: 'bg-red-500/10 text-red-400 border-red-500/30',
    P1: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    P2: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    P3: 'bg-slate-500/10 text-slate-300 border-slate-500/25',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[priority] || colors.P3}`}>
      {priority}
    </span>
  );
};

const AcceptancePage: React.FC<IAcceptancePageProps> = () => {
  const router = useRouter();
  const currentProfile = useCurrentUserProfile();
  const { data: allRequirements = [] } = useRequirementsList();
  const { data: acceptanceHistory = [] } = useAcceptanceRecords();
  const addAcceptanceRecord = useAddAcceptanceRecord();
  const deleteRequirement = useDeleteRequirement();
  const upsertRequirement = useUpsertRequirement();
  const requirements = React.useMemo(
    () =>
      allRequirements.filter(
        (r) => r.status === 'pending_acceptance' || r.status === 'released'
      ),
    [allRequirements]
  );
  const [selectedRequirement, setSelectedRequirement] = useState<IRequirement | null>(null);
  const [isAcceptDialogOpen, setIsAcceptDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isRFCDialogOpen, setIsRFCDialogOpen] = useState(false);
  const [scores, setScores] = useState({ functionality: 3, valueMatch: 3, experience: 3 });
  const [feedback, setFeedback] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');

  const handleAcceptClick = (req: IRequirement) => {
    setSelectedRequirement(req);
    setScores({ functionality: 3, valueMatch: 3, experience: 3 });
    setFeedback('');
    setIsAcceptDialogOpen(true);
  };

  const handleRejectClick = (req: IRequirement) => {
    setSelectedRequirement(req);
    setScores({ functionality: 3, valueMatch: 3, experience: 3 });
    setFeedback('');
    setIsRejectDialogOpen(true);
  };

  const handleRFCClick = () => {
    setIsRejectDialogOpen(false);
    setIsRFCDialogOpen(true);
  };

  const runAIAnalysis = async () => {
    if (!feedback.trim()) {
      toast.error('请先输入验收反馈');
      return;
    }
    setIsAnalyzing(true);
    setAiAnalysis('');
    try {
      const stream = await capabilityClient
        .load('acceptance_feedback_analyzer_1')
        .callStream('textSummary', { acceptance_feedback: feedback });
      for await (const chunk of stream) {
        const typedChunk = chunk as { summary?: string };
        if (typedChunk.summary) {
          setAiAnalysis(prev => prev + typedChunk.summary);
        }
      }
    } catch (error) {
      toast.error('AI分析失败，请稍后重试');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const submitAcceptance = (approved: boolean) => {
    if (!selectedRequirement) return;
    const existingRecord = acceptanceHistory.find((r) => r.requirementId === selectedRequirement.id);
    if (existingRecord && existingRecord.result !== 'pending') {
      toast.error('该需求已存在验收单，不允许重复创建');
      setIsAcceptDialogOpen(false);
      setIsRejectDialogOpen(false);
      return;
    }

    const now = new Date().toISOString();
    const actorId = getCurrentUser()?.id?.trim() || currentProfile.user_id?.trim();
    const reviewerId = actorId || currentProfile.name || 'unknown';
    const newRecord: IAcceptanceRecord = {
      id: existingRecord?.result === 'pending' ? existingRecord.id : `acc-${Date.now()}`,
      requirementId: selectedRequirement.id,
      reviewer: reviewerId,
      scores,
      feedback,
      result: approved ? 'approved' : 'rejected',
      status: approved ? 'approved' : 'rejected',
      createdAt: existingRecord?.createdAt ?? now,
      updatedAt: now,
      createdBy: existingRecord?.createdBy ?? reviewerId,
      updatedBy: reviewerId,
    };

    void addAcceptanceRecord.mutateAsync(newRecord).then(() => {
      return upsertRequirement.mutateAsync({
        ...selectedRequirement,
        status: approved ? 'released' : 'pending_acceptance',
        updatedAt: now,
        ...rdAuditUpdate(),
      });
    }).then(() => {
      toast.success(approved ? '验收已通过' : '验收已驳回');
    });
    setIsAcceptDialogOpen(false);
    setIsRejectDialogOpen(false);
    setFeedback('');
    setAiAnalysis('');
  };

  const submitRFC = () => {
    if (!selectedRequirement) return;

    void upsertRequirement
      .mutateAsync({
        ...selectedRequirement,
        status: 'prd_writing',
        updatedAt: new Date().toISOString(),
        ...rdAuditUpdate(),
      })
      .then(() => toast.success('RFC变更申请已发起，需求已回退至PRD阶段'));
    setIsRFCDialogOpen(false);
    setFeedback('');
  };

  const goToSandbox = (reqId: string) => {
    window.open(`https://sandbox.example.com/${reqId}`, '_blank');
  };

  const handleViewDetail = (reqId: string) => {
    router.push(`/requirements/${reqId}`);
  };

  const handleEditRequirement = (reqId: string) => {
    router.push(`/requirements/${reqId}/edit`);
  };

  const handleDeleteRequirement = (reqId: string) => {
    if (!window.confirm('确认删除该需求吗？')) return;
    void deleteRequirement.mutateAsync(reqId).then(() => toast.success('需求已删除'));
  };

  /** 提测/交付创建的占位单 result 为 pending，应出现在「待验收」；仅已通过/已驳回的验收进入「验收历史」 */
  const completedAcceptanceHistory = acceptanceHistory.filter(
    (r) => r.result === 'approved' || r.result === 'rejected'
  );
  const pendingRequirements = requirements.filter((r) => r.status === 'pending_acceptance');
  const releasedRequirements = requirements.filter(r => r.status === 'released');

  const renderRequirementCard = (req: IRequirement) => (
    <Card key={req.id} className="mb-4 border-l-4 border-l-orange-500 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {getStatusBadge(req.status)}
              {getPriorityBadge(req.priority)}
            </div>
            <CardTitle className="text-lg">
              <button
                type="button"
                className="hover:underline text-left"
                onClick={() => handleViewDetail(req.id)}
              >
                {req.title}
              </button>
            </CardTitle>
            <CardDescription className="mt-1">期望上线: {req.expectedDate}</CardDescription>
          </div>
          {req.status === 'pending_acceptance' && (
            <ListRowActionsMenu
              stopPropagation
              onView={() => handleViewDetail(req.id)}
              onEdit={() => handleEditRequirement(req.id)}
              onDelete={() => handleDeleteRequirement(req.id)}
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="rd-surface-inset p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <FileSearch className="w-4 h-4" />
              原始需求
            </h4>
            <p className="line-clamp-4 text-sm text-muted-foreground">{req.description}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 backdrop-blur-sm">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300">
              <CheckCircle className="w-4 h-4" />
              实际实现
            </h4>
            <p className="text-sm text-emerald-200/90">
              功能已开发完成，部署至沙箱环境。点击下方链接查看实际效果。
            </p>
            <button 
              className="mt-2 flex h-auto items-center p-0 text-sm text-emerald-400 hover:underline"
              onClick={() => goToSandbox(req.id)}
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              访问沙箱环境
            </button>
          </div>
        </div>
        {req.status === 'pending_acceptance' && (
          <div className="mt-4 flex justify-end gap-2">
            <Button
              size="sm"
              onClick={() => handleAcceptClick(req)}
            >
              <Send className="mr-1 h-4 w-4" />
              验收
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleRejectClick(req)}
            >
              <XCircle className="mr-1 h-4 w-4" />
              驳回
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      <style jsx>{`
        .acceptance-page {
          animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="acceptance-page w-full space-y-6">
        <section className="w-full">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="rd-page-title">验收中心</h1>
              <p className="rd-page-desc mt-1">
                对比原始需求与实际实现，完成最终验收闭环
              </p>
            </div>
          </div>
        </section>

        <section className="w-full">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="pending">
                待验收
                {pendingRequirements.length > 0 && (
                  <span className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                    {pendingRequirements.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="history">验收历史</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-6">
              {pendingRequirements.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <CheckCircle className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>暂无待验收需求</EmptyTitle>
                    <EmptyDescription>当前没有需要您验收的需求，请稍后再来查看</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="space-y-4">
                  {pendingRequirements.map(renderRequirementCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-6">
              {completedAcceptanceHistory.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <History className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>暂无验收记录</EmptyTitle>
                    <EmptyDescription>您还没有进行过任何验收操作</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="space-y-4">
                  {completedAcceptanceHistory.map(record => {
                    const req = requirements.find(r => r.id === record.requirementId) || allRequirements.find(r => r.id === record.requirementId);
                    return (
                      <Card key={record.id} className="border-l-4 border-l-slate-400 shadow-sm">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <CardTitle className="text-lg mt-1">{req?.title ?? '未知需求'}</CardTitle>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Badge
                                variant={
                                  record.result === 'approved'
                                    ? 'default'
                                    : record.result === 'rejected'
                                      ? 'destructive'
                                      : 'outline'
                                }
                              >
                                {record.result === 'approved'
                                  ? '已通过'
                                  : record.result === 'rejected'
                                    ? '已驳回'
                                    : '待验收'}
                              </Badge>
                              {req && (
                                <ListRowActionsMenu
                                  stopPropagation
                                  onView={() => handleViewDetail(req.id)}
                                  onEdit={() => handleEditRequirement(req.id)}
                                  onDelete={() => handleDeleteRequirement(req.id)}
                                />
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="rd-surface-inset p-3 text-center">
                              <div className="text-2xl font-bold">{record.scores.functionality}</div>
                              <div className="text-xs text-muted-foreground">功能完整性</div>
                            </div>
                            <div className="rd-surface-inset p-3 text-center">
                              <div className="text-2xl font-bold">{record.scores.valueMatch}</div>
                              <div className="text-xs text-muted-foreground">业务价值匹配</div>
                            </div>
                            <div className="rd-surface-inset p-3 text-center">
                              <div className="text-2xl font-bold">{record.scores.experience}</div>
                              <div className="text-xs text-muted-foreground">体验满意度</div>
                            </div>
                          </div>
                          {record.feedback && (
                            <div className="flex items-start gap-2 text-sm text-muted-foreground">
                              <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                              <span>{record.feedback}</span>
                            </div>
                          )}
                          <div className="mt-3 text-xs text-muted-foreground">
                            验收人: {record.reviewer} · {new Date(record.createdAt).toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>

        <Dialog open={isAcceptDialogOpen} onOpenChange={setIsAcceptDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>验收通过</DialogTitle>
              <DialogDescription>
                请对需求实现进行评分，确认验收通过
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex justify-between">
                    <span>功能完整性</span>
                    <span className="text-muted-foreground">{scores.functionality}/5</span>
                  </Label>
                  <Slider
                    value={[scores.functionality]}
                    onValueChange={([v]) => setScores(s => ({ ...s, functionality: v }))}
                    max={5}
                    min={1}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex justify-between">
                    <span>业务价值匹配度</span>
                    <span className="text-muted-foreground">{scores.valueMatch}/5</span>
                  </Label>
                  <Slider
                    value={[scores.valueMatch]}
                    onValueChange={([v]) => setScores(s => ({ ...s, valueMatch: v }))}
                    max={5}
                    min={1}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex justify-between">
                    <span>体验满意度</span>
                    <span className="text-muted-foreground">{scores.experience}/5</span>
                  </Label>
                  <Slider
                    value={[scores.experience]}
                    onValueChange={([v]) => setScores(s => ({ ...s, experience: v }))}
                    max={5}
                    min={1}
                    step={1}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>验收反馈（可选）</Label>
                <Textarea
                  placeholder="请输入验收反馈或建议..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAcceptDialogOpen(false)}>取消</Button>
              <Button onClick={() => submitAcceptance(true)} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-4 h-4 mr-1" />
                确认通过
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>验收驳回</DialogTitle>
              <DialogDescription>
                请说明驳回原因，系统将提供AI改进建议
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="flex justify-between text-xs">
                    <span>功能完整性</span>
                    <span>{scores.functionality}/5</span>
                  </Label>
                  <Slider
                    value={[scores.functionality]}
                    onValueChange={([v]) => setScores(s => ({ ...s, functionality: v }))}
                    max={5}
                    min={1}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex justify-between text-xs">
                    <span>业务价值匹配</span>
                    <span>{scores.valueMatch}/5</span>
                  </Label>
                  <Slider
                    value={[scores.valueMatch]}
                    onValueChange={([v]) => setScores(s => ({ ...s, valueMatch: v }))}
                    max={5}
                    min={1}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex justify-between text-xs">
                    <span>体验满意度</span>
                    <span>{scores.experience}/5</span>
                  </Label>
                  <Slider
                    value={[scores.experience]}
                    onValueChange={([v]) => setScores(s => ({ ...s, experience: v }))}
                    max={5}
                    min={1}
                    step={1}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>驳回原因</Label>
                <Textarea
                  placeholder="请详细描述存在的问题和不符合需求的地方..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={4}
                />
              </div>
              
              {aiAnalysis && (
                <div className="bg-muted rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Star className="w-4 h-4" />
                    AI改进建议
                  </h4>
                  <div className="text-sm text-muted-foreground">
                    <Streamdown>{aiAnalysis}</Streamdown>
                  </div>
                </div>
              )}
            </div>
            
            <DialogFooter className="flex justify-between">
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={runAIAnalysis}
                  disabled={isAnalyzing || !feedback.trim()}
                >
                  {isAnalyzing ? '分析中...' : 'AI分析'}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>取消</Button>
                <Button 
                  variant="destructive"
                  onClick={() => submitAcceptance(false)}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  确认驳回
                </Button>
                <Button 
                  variant="default"
                  onClick={handleRFCClick}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  发起RFC
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isRFCDialogOpen} onOpenChange={setIsRFCDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                发起RFC变更申请
              </DialogTitle>
              <DialogDescription>
                此操作将创建变更申请(RFC)，并自动回退需求至PRD阶段
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4">
              <div className="rounded-lg border border-orange-500/25 bg-orange-500/10 p-4 backdrop-blur-sm">
                <h4 className="mb-2 text-sm font-medium text-orange-200">变更影响说明</h4>
                <ul className="list-inside list-disc space-y-1 text-sm text-orange-100/90">
                  <li>需求状态将回退至「PRD编写中」</li>
                  <li>产品经理将收到变更通知</li>
                  <li>技术规格需要重新评审</li>
                  <li>AI开发任务将自动终止</li>
                </ul>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRFCDialogOpen(false)}>取消</Button>
              <Button 
                onClick={submitRFC}
                className="bg-orange-600 hover:bg-orange-700"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                确认发起RFC
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default AcceptancePage;
