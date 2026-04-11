'use client';
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Streamdown } from '@/components/ui/streamdown';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  Search,
  Clock,
  Sparkles,
  Loader2,
  CheckCircle,
  XCircle,
  Send,
  Files,
  PenLine,
  CircleCheck,
} from 'lucide-react';
import { ListRowActionsMenu } from '@/components/business-ui/list-row-actions-menu';
import { toast } from 'sonner';
import {
  usePrdsList,
  useRequirementsList,
  useReviewPrd,
  useSubmitPrdReview,
  useUpsertPrd,
  useUpsertRequirement,
  useDeletePrd,
} from '@/lib/rd-hooks';
import { capabilityClient } from '@/lib/capability-client';
import { parsePrdMarkdownSections } from '@/lib/prd-markdown';
import { cn } from '@/lib/utils';

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

/** 列表与详情统一展示本地时间，避免裸 ISO 字符串 */
function formatPrdDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 生成预览：与全局 Card 一致的磨砂文档区 */
const PRD_GEN_PREVIEW_BOX =
  'rounded-xl border border-white/[0.08] bg-card/90 shadow-inner shadow-black/20 ring-1 ring-white/5 backdrop-blur-xl';
const PRD_GEN_STREAMDOWN_CLASS =
  'prose prose-sm max-w-none prose-invert prose-headings:scroll-mt-2 prose-headings:text-foreground prose-headings:font-semibold prose-h1:text-2xl prose-h1:mb-2 prose-h1:leading-tight prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-white/10 prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2 prose-p:text-foreground/90 prose-p:leading-relaxed prose-li:my-0.5 prose-li:text-foreground/90 prose-hr:border-white/10 prose-strong:text-foreground prose-table:text-sm prose-th:border-white/15 prose-td:border-white/10 text-foreground/95';

interface IPrdListItem {
  id: string;
  requirementId: string;
  title: string;
  requirementTitle: string;
  status: 'draft' | 'reviewing' | 'approved' | 'rejected';
  version: number;
  author: string;
  updatedAt: string;
  requirementStatus: string;
  latestReviewComment?: string;
  latestReviewMeta?: string;
}

const STATUS_BADGES: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className: string }
> = {
  draft: {
    label: '草稿',
    variant: 'secondary',
    className:
      'no-default-hover-elevate border-slate-500/25 bg-slate-500/10 text-slate-200 shadow-none',
  },
  reviewing: {
    label: '评审中',
    variant: 'outline',
    className:
      'no-default-hover-elevate border-blue-500/30 bg-blue-500/10 text-blue-300 shadow-none',
  },
  approved: {
    label: '已通过',
    variant: 'default',
    className:
      'no-default-hover-elevate border-emerald-500/25 bg-emerald-500/10 text-emerald-300 shadow-none',
  },
  rejected: {
    label: '已驳回',
    variant: 'destructive',
    className:
      'no-default-hover-elevate border-red-500/25 bg-red-500/10 text-red-300 shadow-none',
  },
};

const REQUIREMENT_STATUS_MAP: Record<string, string> = {
  backlog: '需求池',
  prd_writing: 'PRD编写中',
  spec_defining: '规格说明书',
  ai_developing: 'AI开发中',
  pending_acceptance: '待验收',
  released: '已发布',
};

/** 与插件 prd_generator_1（PRD文档自动生成器）流式协议一致 */
interface PrdGeneratorStreamChunk {
  content: string;
}

const PRDPage: React.FC = () => {
  const router = useRouter();
  const { data: requirements = [] } = useRequirementsList();
  const { data: prds = [] } = usePrdsList();
  const upsertPrd = useUpsertPrd();
  const upsertRequirement = useUpsertRequirement();
  const reviewPrd = useReviewPrd();
  const submitPrdReview = useSubmitPrdReview();
  const deletePrd = useDeletePrd();

  const prdList: IPrdListItem[] = useMemo(() => {
    return prds.map((prd) => {
      const latest = prd.reviews?.[prd.reviews.length - 1];
      const req = requirements.find((r) => r.id === prd.requirementId);
      return {
        latestReviewComment: latest?.comment,
        latestReviewMeta: latest
          ? `${latest.reviewer} · ${new Date(latest.createdAt).toLocaleString('zh-CN')}`
          : '',
        id: prd.id,
        requirementId: prd.requirementId,
        title: prd.title || 'PRD文档',
        requirementTitle: req?.title || '未关联需求',
        status: prd.status,
        version: prd.version,
        author: prd.author || '未知',
        updatedAt: prd.updatedAt,
        requirementStatus: req?.status || 'backlog',
      };
    });
  }, [prds, requirements]);

  const prdStats = useMemo(
    () => ({
      total: prdList.length,
      draft: prdList.filter((p) => p.status === 'draft').length,
      reviewing: prdList.filter((p) => p.status === 'reviewing').length,
      approved: prdList.filter((p) => p.status === 'approved').length,
    }),
    [prdList]
  );

  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [prdPreviewTab, setPrdPreviewTab] = useState<'full' | 'structured'>('full');

  const prdPreviewSections = useMemo(
    () => parsePrdMarkdownSections(generatedContent),
    [generatedContent]
  );

  const filteredPRDList = prdList.filter((prd) => {
    const matchKeyword = prd.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      prd.requirementTitle.toLowerCase().includes(searchKeyword.toLowerCase());
    const matchStatus = statusFilter === 'all' || prd.status === statusFilter;
    return matchKeyword && matchStatus;
  });

  const availableRequirements = requirements.filter(req => 
    req.status === 'backlog' || req.status === 'prd_writing'
  );

  const handleGeneratePRD = async () => {
    if (!selectedRequirement) {
      toast.error('请选择要生成PRD的需求');
      return;
    }

    const requirement = requirements.find(r => r.id === selectedRequirement);
    if (!requirement) return;

    setGenerating(true);
    setGeneratedContent('');
    setPrdPreviewTab('full');
    setIsStreaming(true);

    try {
      const originalRequirement = [
        `需求标题：${requirement.title}`,
        `需求描述：${stripHtmlTags(requirement.description || '')}`,
        `期望上线时间：${requirement.expectedDate}`,
        `业务优先级：${requirement.priority}`,
      ].join('\n');

      const stream = capabilityClient
        .load('prd_generator_1')
        .callStream<PrdGeneratorStreamChunk>('textGenerate', {
          original_requirement: originalRequirement,
          additional_requirements:
            '请生成完整的PRD文档，包含背景、目标、业务流程、功能列表和非功能性需求。',
        });

      let fullContent = '';
      for await (const chunk of stream) {
        if (chunk.content) {
          fullContent += chunk.content;
          setGeneratedContent((prev) => prev + chunk.content);
        }
      }

      const newId = `prd-${Date.now()}`;
      const now = new Date().toISOString();

      await upsertPrd.mutateAsync({
        id: newId,
        requirementId: requirement.id,
        title: `${requirement.title}PRD`,
        background: fullContent,
        objectives: '',
        flowchart: '',
        featureList: [],
        nonFunctional: '',
        status: 'draft',
        version: 1,
        author: '当前用户',
        createdAt: now,
        updatedAt: now,
      });
      await upsertRequirement.mutateAsync({
        ...requirement,
        status: 'prd_writing',
        updatedAt: now,
      });

      toast.success('PRD生成成功');
      setShowGenerateDialog(false);
      setGeneratedContent('');
      setSelectedRequirement('');

      router.push(`/prd/${newId}/edit`);
    } catch {
      toast.error('PRD生成失败，请重试');
    } finally {
      setGenerating(false);
      setIsStreaming(false);
    }
  };

  const handleEdit = (prdId: string) => {
    router.push(`/prd/${prdId}/edit`);
  };

  const handleView = (prdId: string) => {
    router.push(`/prd/${prdId}/edit`);
  };

  const handleDelete = (prdId: string) => {
    if (!window.confirm('确认删除该PRD吗？删除后无法恢复。')) return;
    void deletePrd.mutateAsync(prdId).then(() => toast.success('PRD已删除'));
  };

  const handleSubmitReview = (prdId: string) => {
    const comment = window.prompt('请输入提交审核说明（可选）') || undefined;
    void submitPrdReview.mutateAsync({ prdId, reviewer: '产品经理', comment }).then(() => {
      toast.success('PRD已提交审核');
    });
  };

  const handleApprove = (prdId: string) => {
    const comment = window.prompt('请输入审核通过意见（可选）') || undefined;
    void reviewPrd.mutate(
      { prdId, status: 'approved', reviewer: '技术经理', comment },
      { onSuccess: () => toast.success('PRD审核已通过') }
    );
  };

  const handleReject = (prdId: string) => {
    const comment = window.prompt('请输入驳回原因（建议填写）') || undefined;
    void reviewPrd.mutate(
      { prdId, status: 'rejected', reviewer: '技术经理', comment },
      { onSuccess: () => toast.success('PRD已驳回') }
    );
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_BADGES[status] || {
      label: status,
      variant: 'secondary' as const,
      className: '',
    };
    return (
      <Badge variant={config.variant} className={cn('gap-1.5', config.className)}>
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            status === 'draft' && 'bg-slate-400',
            status === 'reviewing' && 'bg-blue-400',
            status === 'approved' && 'bg-emerald-400',
            status === 'rejected' && 'bg-red-400',
            !['draft', 'reviewing', 'approved', 'rejected'].includes(status) && 'bg-muted-foreground'
          )}
        />
        {config.label}
      </Badge>
    );
  };

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
        {/* 页面标题 */}
        <section className="w-full">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="rd-page-title">PRD管理</h1>
              <p className="rd-page-desc mt-1">
                管理产品需求文档，支持AI辅助生成
              </p>
            </div>
            <Button
              onClick={() => {
                setPrdPreviewTab('full');
                setShowGenerateDialog(true);
              }}
              className="shrink-0 bg-gradient-to-r from-primary to-primary/85 shadow-md shadow-primary/25 transition-[filter,box-shadow] hover:brightness-110 hover:shadow-lg hover:shadow-primary/30"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              AI生成PRD
            </Button>
          </div>
        </section>

        {/* 统计：左色条 + 图标，减少空白、数字更醒目 */}
        <section className="w-full">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                {
                  label: '全部PRD',
                  value: prdStats.total,
                  Icon: Files,
                  bar: 'bg-slate-400',
                  iconWrap: 'border-white/10 bg-white/[0.06] text-slate-200',
                  valueClass: 'text-foreground tabular-nums',
                },
                {
                  label: '草稿',
                  value: prdStats.draft,
                  Icon: PenLine,
                  bar: 'bg-slate-500',
                  iconWrap: 'border-white/10 bg-white/[0.06] text-slate-300',
                  valueClass: 'text-slate-200 tabular-nums',
                },
                {
                  label: '评审中',
                  value: prdStats.reviewing,
                  Icon: Send,
                  bar: 'bg-primary',
                  iconWrap: 'border-primary/25 bg-primary/15 text-primary',
                  valueClass: 'text-primary tabular-nums',
                },
                {
                  label: '已通过',
                  value: prdStats.approved,
                  Icon: CircleCheck,
                  bar: 'bg-emerald-500',
                  iconWrap: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
                  valueClass: 'text-emerald-400 tabular-nums',
                },
              ] as const
            ).map((item) => (
              <div
                key={item.label}
                className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-card/80 py-3.5 pl-4 pr-3 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.06)] backdrop-blur-xl"
              >
                <span
                  className={cn('absolute left-0 top-3 bottom-3 w-1 rounded-r', item.bar)}
                  aria-hidden
                />
                <div className="flex items-center gap-3 pl-2">
                  <div
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-xl border',
                      item.iconWrap
                    )}
                  >
                    <item.Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {item.label}
                    </p>
                    <p className={cn('text-2xl font-semibold leading-tight', item.valueClass)}>
                      {item.value}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 筛选栏 — 与需求列表页同一套 rd-surface */}
        <section className="w-full">
          <div className="rd-surface-card rd-surface-card-hover px-4 py-4 sm:px-5 sm:py-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex min-w-[280px] flex-1 max-w-sm">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索PRD标题或关联需求..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="rd-input-glass h-12 rounded-xl pl-11"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="rd-select-glass h-12 w-40 rounded-xl">
                  <SelectValue placeholder="状态筛选" />
                </SelectTrigger>
                <SelectContent className="rd-select-content">
                  <SelectItem value="all" className="rd-select-item">全部状态</SelectItem>
                  <SelectItem value="draft" className="rd-select-item">草稿</SelectItem>
                  <SelectItem value="reviewing" className="rd-select-item">评审中</SelectItem>
                  <SelectItem value="approved" className="rd-select-item">已通过</SelectItem>
                  <SelectItem value="rejected" className="rd-select-item">已驳回</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* PRD列表 — 与需求列表页同一表头条 + 内容区 */}
        <section className="w-full">
          <div className="rd-surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="rd-list-section-icon">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">PRD列表</h2>
                  <p className="text-sm text-muted-foreground">
                    共 <span className="font-bold text-primary">{filteredPRDList.length}</span> 个PRD文档
                  </p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto px-4 pb-5 pt-2 sm:px-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">PRD标题</TableHead>
                    <TableHead>关联需求</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>版本</TableHead>
                    <TableHead>负责人</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead className="pr-4 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPRDList.map((prd) => (
                    <TableRow key={prd.id}>
                      <TableCell className="max-w-[220px] pl-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <button
                            type="button"
                            className="font-medium hover:underline text-left"
                            onClick={() => handleView(prd.id)}
                          >
                            {prd.title}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="text-foreground">{prd.requirementTitle}</p>
                          <p className="text-xs text-muted-foreground">
                            {REQUIREMENT_STATUS_MAP[prd.requirementStatus]}
                          </p>
                          {prd.latestReviewComment && (
                            <p className="text-xs text-muted-foreground mt-1">
                              审核意见：{prd.latestReviewComment}
                            </p>
                          )}
                          {prd.latestReviewMeta && (
                            <p className="text-xs text-muted-foreground">
                              {prd.latestReviewMeta}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(prd.status)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">v{prd.version}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {prd.author.slice(0, 1)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{prd.author}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="inline-flex max-w-[11rem] items-center gap-1.5 text-xs">
                          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="font-mono text-foreground/90">{formatPrdDateTime(prd.updatedAt)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex items-center justify-end">
                          <ListRowActionsMenu
                            onView={() => handleView(prd.id)}
                            onEdit={() => handleEdit(prd.id)}
                            onDelete={() => handleDelete(prd.id)}
                            extraActions={[
                              ...(prd.status === 'draft' || prd.status === 'rejected'
                                ? [
                                    {
                                      key: 'submit-review',
                                      label: '提交审核',
                                      icon: <Send className="h-4 w-4" />,
                                      onClick: () => handleSubmitReview(prd.id),
                                    },
                                  ]
                                : []),
                              ...(prd.status === 'reviewing'
                                ? [
                                    {
                                      key: 'approve',
                                      label: '通过审核',
                                      icon: <CheckCircle className="h-4 w-4 text-green-500" />,
                                      onClick: () => handleApprove(prd.id),
                                    },
                                    {
                                      key: 'reject',
                                      label: '驳回',
                                      icon: <XCircle className="h-4 w-4" />,
                                      onClick: () => handleReject(prd.id),
                                      variant: 'destructive' as const,
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredPRDList.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        暂无PRD文档
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>

        {/* AI生成PRD弹窗 */}
        <Dialog
          open={showGenerateDialog}
          onOpenChange={(open) => {
            setShowGenerateDialog(open);
            if (!open) {
              setGeneratedContent('');
              setSelectedRequirement('');
              setPrdPreviewTab('full');
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI生成PRD
              </DialogTitle>
              <DialogDescription>
                选择需求池中的需求，AI将自动生成结构化PRD文档
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">选择需求</label>
                <Select 
                  value={selectedRequirement} 
                  onValueChange={setSelectedRequirement}
                  disabled={generating}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择要生成PRD的需求" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRequirements.map((req) => (
                      <SelectItem key={req.id} value={req.id}>
                        <div className="flex items-center gap-2">
                          <span>{req.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {req.priority}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                    {availableRequirements.length === 0 && (
                      <SelectItem value="" disabled>
                        暂无可用需求
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {selectedRequirement && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {stripHtmlTags(
                      requirements.find((r) => r.id === selectedRequirement)?.description ?? ''
                    )}
                  </p>
                )}
              </div>

              {isStreaming && (
                <div className="space-y-3 min-h-0">
                  <div className="flex items-center gap-2 shrink-0">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">AI正在生成PRD...</span>
                  </div>
                  {!generatedContent ? (
                    <div
                      className={`flex h-64 items-center justify-center px-6 text-sm text-muted-foreground ${PRD_GEN_PREVIEW_BOX}`}
                    >
                      等待生成…
                    </div>
                  ) : (
                    <Tabs
                      value={prdPreviewTab}
                      onValueChange={(v) => setPrdPreviewTab(v as 'full' | 'structured')}
                      className="flex min-h-0 flex-col gap-3"
                    >
                      <TabsList className="grid h-10 w-full max-w-md shrink-0 grid-cols-2 rounded-full p-1">
                        <TabsTrigger value="full" className="rounded-full text-sm">
                          全文 Markdown
                        </TabsTrigger>
                        <TabsTrigger value="structured" className="rounded-full text-sm">
                          结构化
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="full" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                        <ScrollArea className="h-[min(26rem,55vh)] w-full">
                          <div className={`${PRD_GEN_PREVIEW_BOX} p-6 md:p-8`}>
                            <Streamdown className={PRD_GEN_STREAMDOWN_CLASS}>{generatedContent}</Streamdown>
                          </div>
                        </ScrollArea>
                      </TabsContent>
                      <TabsContent
                        value="structured"
                        className="mt-0 min-h-0 flex-1 space-y-3 data-[state=inactive]:hidden"
                      >
                        <p className="text-xs text-muted-foreground">
                          按「## 1. …」分节展示；每块为独立阅读区，与全文同源
                        </p>
                        <ScrollArea className="h-[min(26rem,55vh)] w-full">
                          <div className="space-y-4 pr-3">
                            {prdPreviewSections.docTitle && (
                              <div className={`${PRD_GEN_PREVIEW_BOX} px-6 py-5`}>
                                <p className="text-lg font-semibold leading-snug text-slate-50">
                                  {prdPreviewSections.docTitle}
                                </p>
                              </div>
                            )}
                            {prdPreviewSections.sections.map((sec, i) => (
                              <div key={`${sec.title}-${i}`} className={`${PRD_GEN_PREVIEW_BOX} p-5 md:p-6`}>
                                <h3 className="mb-3 border-b border-white/10 pb-2 text-base font-semibold text-foreground">
                                  {sec.title}
                                </h3>
                                <Streamdown className={PRD_GEN_STREAMDOWN_CLASS}>
                                  {sec.body || '（本节暂无内容）'}
                                </Streamdown>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowGenerateDialog(false);
                  setGeneratedContent('');
                  setSelectedRequirement('');
                  setPrdPreviewTab('full');
                }}
                disabled={generating}
              >
                取消
              </Button>
              <Button
                onClick={handleGeneratePRD}
                disabled={!selectedRequirement || generating}
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    开始生成
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default PRDPage;
