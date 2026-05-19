'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Streamdown } from '@/components/ui/streamdown';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
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
  Paperclip,
  Link2,
  X,
  ChevronsUpDown,
} from 'lucide-react';
import { ListRowActionsMenu } from '@/components/business-ui/list-row-actions-menu';
import { toast } from 'sonner';
import {
  usePrdsList,
  useProductsList,
  useRequirementsList,
  useReviewPrd,
  useSubmitPrdReview,
  useUpsertPrd,
  useUpsertRequirement,
  useDeletePrd,
} from '@/lib/rd-hooks';
import { getCurrentUser } from '@/lib/auth';
import { rdAuditCreate, rdAuditUpdate } from '@/lib/rd-actor';
import { capabilityClient } from '@/lib/capability-client';
import { getRequirementStatusPresentation } from '@/lib/requirement-status-present';
import { cn } from '@/lib/utils';
import { RdPageModuleHeading } from '@/components/rd-page-module-heading';
import { Label } from '@/components/ui/label';
import type { IPrd, IRequirement } from '@/lib/rd-types';
import { formatPrdListTitle } from '@/lib/prd-display-title';
import {
  buildMultiPrdGenerationHints,
  buildMultiPrdStoredTitle,
  buildMultiRequirementOriginalBlock,
  formatPrdListRequirementSummary,
  getPrdCoveredRequirementIds,
  isRequirementCoveredByAnyPrd,
  requirementsMatchProduct,
  requirementProductKey,
} from '@/lib/prd-multi-requirement';

/** 单段上下文上限，避免超出模型窗口 */
const PRD_GEN_CONTEXT_MAX_CHARS = 28000;

function truncateForModelContext(text: string, maxChars: number): string {
  const t = text.trim();
  if (!t) return '';
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n\n…（已截断，原文约 ${t.length} 字）`;
}

/** 用户上传的参考文档（可多份） */
interface IPrdSupplementaryUpload {
  id: string;
  name: string;
  content: string;
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsText(file, 'UTF-8');
  });
}

/** 合并多份上传文档与粘贴内容，供 PRD 生成 API 引用 */
function buildUserSupplementaryDocumentForPrompt(
  uploads: IPrdSupplementaryUpload[],
  pasted: string
): string {
  const parts: string[] = [];
  if (uploads.length > 0) {
    parts.push(`【用户上传参考文档 · 共 ${uploads.length} 份，生成时须综合引用每一份】`);
    uploads.forEach((doc, i) => {
      const body = doc.content.trim();
      if (!body) return;
      parts.push(`\n---\n【${i + 1}/${uploads.length} · ${doc.name}】\n\n${body}`);
    });
  }
  const paste = pasted.trim();
  if (paste) {
    parts.push(`\n---\n【粘贴补充说明】\n\n${paste}`);
  }
  return parts.join('\n').trim();
}

function resetPrdSupplementaryState(
  setUploads: React.Dispatch<React.SetStateAction<IPrdSupplementaryUpload[]>>,
  setPasted: React.Dispatch<React.SetStateAction<string>>,
  fileInput: HTMLInputElement | null
): void {
  setUploads([]);
  setPasted('');
  if (fileInput) fileInput.value = '';
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

/** 同产品参考 PRD：除 background 外合并目标、功能列表等，避免只传空背景导致模型“丢上下文” */
function formatReferencePrdForPrompt(refPrd: IPrd, refReqTitle?: string): string {
  const chunks: string[] = [
    `【参考PRD】${refPrd.title || 'PRD文档'}`,
    refReqTitle ? `【其关联需求】${refReqTitle}` : '',
    '---',
  ].filter(Boolean);
  const b = (refPrd.background || '').trim();
  const o = (refPrd.objectives || '').trim();
  const nf = (refPrd.nonFunctional || '').trim();
  const fc = (refPrd.flowchart || '').trim();
  if (b) chunks.push(`### 背景\n${b}`);
  if (o) chunks.push(`### 项目目标\n${o}`);
  const fl = refPrd.featureList || [];
  if (fl.length > 0) {
    const lines = fl.map((f) => {
      const crit =
        f.acceptanceCriteria?.length ? `\n  - 验收：${f.acceptanceCriteria.join('；')}` : '';
      return `- **${f.name}**：${(f.description || '').trim()}${crit}`;
    });
    chunks.push(`### 功能列表\n${lines.join('\n')}`);
  }
  if (nf) chunks.push(`### 非功能性需求\n${nf}`);
  if (fc) chunks.push(`### 流程图说明\n${fc}`);
  return chunks.join('\n\n');
}

/** AI 流式生成最长等待（毫秒），避免接口挂起时按钮永久「生成中」 */
const PRD_STREAM_TIMEOUT_MS = 180_000;

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
  'prose prose-sm max-w-none prose-invert break-words prose-headings:scroll-mt-2 prose-headings:text-foreground prose-headings:font-semibold prose-h1:text-2xl prose-h1:mb-2 prose-h1:leading-tight prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-white/10 prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2 prose-p:text-foreground/90 prose-p:leading-relaxed prose-li:my-0.5 prose-li:text-foreground/90 prose-hr:border-white/10 prose-strong:text-foreground prose-table:text-sm prose-th:border-white/15 prose-td:border-white/10 prose-pre:max-w-full prose-pre:overflow-x-auto text-foreground/95';

interface IPrdListItem {
  id: string;
  requirementId: string;
  title: string;
  /** 列表展示用：产品名-需求标题 */
  displayTitle: string;
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

/** 与插件 prd_generator_1（PRD文档自动生成器）流式协议一致 */
interface PrdGeneratorStreamChunk {
  content: string;
}

const PRDPage: React.FC = () => {
  const router = useRouter();
  const { data: requirements = [] } = useRequirementsList();
  const { data: prds = [] } = usePrdsList();
  const { data: products = [] } = useProductsList();
  const upsertPrd = useUpsertPrd();
  const upsertRequirement = useUpsertRequirement();
  const reviewPrd = useReviewPrd();
  const submitPrdReview = useSubmitPrdReview();
  const deletePrd = useDeletePrd();

  const prdList: IPrdListItem[] = useMemo(() => {
    return prds.map((prd) => {
      const latest = prd.reviews?.[prd.reviews.length - 1];
      const req = requirements.find((r) => r.id === prd.requirementId);
      const reqSummary = formatPrdListRequirementSummary(prd, requirements);
      return {
        latestReviewComment: latest?.comment,
        latestReviewMeta: latest
          ? `${latest.reviewer} · ${new Date(latest.createdAt).toLocaleString('zh-CN')}`
          : '',
        id: prd.id,
        requirementId: prd.requirementId,
        title: prd.title || 'PRD文档',
        displayTitle:
          (prd.linkedRequirementIds?.length ?? 0) > 0
            ? prd.title?.trim() || formatPrdListTitle(req as IRequirement | undefined, products, prd.title)
            : formatPrdListTitle(req as IRequirement | undefined, products, prd.title),
        requirementTitle: reqSummary,
        status: prd.status,
        version: prd.version,
        author: prd.author || '未知',
        updatedAt: prd.updatedAt,
        requirementStatus: req?.status || 'backlog',
      };
    });
  }, [prds, requirements, products]);

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
  const [selectedRequirementIds, setSelectedRequirementIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [prdPreviewTab, setPrdPreviewTab] = useState<'edit' | 'preview'>('edit');
  /** 同产品下选中的已有 PRD id，空字符串表示不引用 */
  const [referencePrdId, setReferencePrdId] = useState('');
  const [uploadedSupplementaryDocs, setUploadedSupplementaryDocs] = useState<IPrdSupplementaryUpload[]>(
    []
  );
  const [pastedSupplementary, setPastedSupplementary] = useState('');
  const supplementaryFileInputRef = useRef<HTMLInputElement>(null);

  const selectedRequirements = useMemo(
    () =>
      selectedRequirementIds
        .map((id) => requirements.find((r) => r.id === id))
        .filter((r): r is IRequirement => Boolean(r)),
    [requirements, selectedRequirementIds]
  );

  const anchorRequirement = selectedRequirements[0];
  const productKey = requirementProductKey(anchorRequirement);
  const productLabel = useMemo(() => {
    if (!productKey) return '';
    const p = products.find((x) => x.id === productKey);
    return p ? `${p.name}（${p.identifier || p.code || p.id}）` : productKey;
  }, [productKey, products]);

  const siblingPrdOptions = useMemo(() => {
    if (!productKey) return [];
    const selectedSet = new Set(selectedRequirementIds);
    return prds.filter((prd) => {
      if (getPrdCoveredRequirementIds(prd).some((id) => selectedSet.has(id))) return false;
      const r = requirements.find((x) => x.id === prd.requirementId);
      return requirementProductKey(r) === productKey;
    });
  }, [prds, requirements, selectedRequirementIds, productKey]);

  useEffect(() => {
    if (!referencePrdId) return;
    const ok = siblingPrdOptions.some((p) => p.id === referencePrdId);
    if (!ok) setReferencePrdId('');
  }, [referencePrdId, siblingPrdOptions]);

  const filteredPRDList = prdList.filter((prd) => {
    const matchKeyword =
      prd.displayTitle.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      prd.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      prd.requirementTitle.toLowerCase().includes(searchKeyword.toLowerCase());
    const matchStatus = statusFilter === 'all' || prd.status === statusFilter;
    return matchKeyword && matchStatus;
  });

  const availableRequirements = useMemo(() => {
    return requirements.filter(
      (req) =>
        (req.status === 'backlog' || req.status === 'prd_writing') &&
        !isRequirementCoveredByAnyPrd(req.id, prds)
    );
  }, [prds, requirements]);

  const formatRequirementProductLabel = (req: IRequirement) => {
    const key = requirementProductKey(req);
    if (!key) return '未绑定产品';
    const p = products.find((x) => x.id === key);
    return p ? `${p.name}（${p.identifier || p.code || p.id}）` : key;
  };

  const isRequirementSelectableInDialog = (req: IRequirement) => {
    if (!anchorRequirement) return true;
    return requirementsMatchProduct(anchorRequirement, req);
  };

  /** 弹窗首次打开时默认选中第一项；异步加载后仅剔除不可用项，不强制回填已清空的选择 */
  const generateDialogBootstrappedRef = useRef(false);
  useEffect(() => {
    if (!showGenerateDialog) {
      generateDialogBootstrappedRef.current = false;
      return;
    }
    setSelectedRequirementIds((prev) => {
      const validIds = prev.filter((id) =>
        availableRequirements.some((r) => r.id === id)
      );
      if (validIds.length > 0) {
        return validIds.length !== prev.length ? validIds : prev;
      }
      if (!generateDialogBootstrappedRef.current) {
        generateDialogBootstrappedRef.current = true;
        const firstId = availableRequirements[0]?.id;
        return firstId ? [firstId] : [];
      }
      return prev;
    });
  }, [showGenerateDialog, availableRequirements]);

  const toggleRequirementSelection = (reqId: string) => {
    const req = requirements.find((r) => r.id === reqId);
    if (!req) return;
    setSelectedRequirementIds((prev) => {
      if (prev.includes(reqId)) {
        return prev.filter((id) => id !== reqId);
      }
      if (prev.length === 0) return [reqId];
      const anchor = requirements.find((r) => r.id === prev[0]);
      if (!requirementsMatchProduct(anchor, req)) {
        toast.error('仅可选择与首个需求相同「所属产品」的需求');
        return prev;
      }
      return [...prev, reqId];
    });
  };

  const handleGeneratePRD = async () => {
    if (selectedRequirementIds.length === 0) {
      toast.error('请至少选择一条要生成 PRD 的需求');
      return;
    }

    const selectedReqs = selectedRequirementIds
      .map((id) => requirements.find((r) => r.id === id))
      .filter((r): r is IRequirement => Boolean(r));
    if (selectedReqs.length === 0) return;

    const anchor = selectedReqs[0];
    const productMismatch = selectedReqs.some(
      (r) => !requirementsMatchProduct(anchor, r)
    );
    if (productMismatch) {
      toast.error('所选需求须属于同一产品');
      return;
    }

    const alreadyLinked = selectedRequirementIds.filter((id) =>
      isRequirementCoveredByAnyPrd(id, prds)
    );
    if (alreadyLinked.length > 0) {
      toast.error('部分需求已关联 PRD，不能重复生成');
      return;
    }

    setGenerating(true);
    setGeneratedContent('');
    setPrdPreviewTab('edit');
    setIsStreaming(true);

    const streamAbort = new AbortController();
    const streamTimeoutId = window.setTimeout(() => streamAbort.abort(), PRD_STREAM_TIMEOUT_MS);

    try {
      const productEntity = productKey ? products.find((x) => x.id === productKey) : undefined;
      const productLines: string[] = [];
      if (productKey) {
        productLines.push(`所属产品：${productLabel || productKey}`);
        const pd = (productEntity?.description || '').trim();
        if (pd) {
          productLines.push(
            `产品简介（语境对齐，节选）：\n${truncateForModelContext(pd, 4500)}`
          );
        }
      } else {
        productLines.push('所属产品：未绑定（需求未关联产品目录）');
      }

      const originalRequirement = buildMultiRequirementOriginalBlock(
        selectedReqs,
        productLines
      );

      const refPrd = referencePrdId ? prds.find((p) => p.id === referencePrdId) : undefined;
      const refReqTitle = refPrd
        ? requirements.find((r) => r.id === refPrd.requirementId)?.title
        : undefined;
      const relatedPrdBlock = refPrd ? formatReferencePrdForPrompt(refPrd, refReqTitle) : '';

      const related_prd_document = truncateForModelContext(
        relatedPrdBlock || '（未提供）',
        PRD_GEN_CONTEXT_MAX_CHARS
      );
      const suppCombined = buildUserSupplementaryDocumentForPrompt(
        uploadedSupplementaryDocs,
        pastedSupplementary
      );
      const user_supplementary_document = truncateForModelContext(
        suppCombined || '（未提供）',
        PRD_GEN_CONTEXT_MAX_CHARS
      );

      const uploadCount = uploadedSupplementaryDocs.length;
      const stream = capabilityClient
        .load('prd_generator_1')
        .callStream<PrdGeneratorStreamChunk>(
          'textGenerate',
          {
            original_requirement: originalRequirement,
            additional_requirements: [
              buildMultiPrdGenerationHints(selectedReqs.length),
              uploadCount > 0
                ? `用户已上传 ${uploadCount} 份参考文档，生成时须综合引用每一份中的有效信息，不得只采用其中一份而忽略其余。`
                : '',
            ]
              .filter(Boolean)
              .join(''),
            related_prd_document,
            user_supplementary_document,
          },
          { signal: streamAbort.signal }
        );

      let fullContent = '';
      for await (const chunk of stream) {
        if (chunk.content) {
          fullContent += chunk.content;
          setGeneratedContent((prev) => prev + chunk.content);
        }
      }

      const newId = `prd-${Date.now()}`;
      const now = new Date().toISOString();

      const actor = getCurrentUser();
      const authorLabel = (actor?.name?.trim() || actor?.username?.trim() || '').trim() || '匿名';

      const [primaryRequirement, ...linkedIds] = selectedRequirementIds;

      await upsertPrd.mutateAsync({
        id: newId,
        requirementId: primaryRequirement,
        linkedRequirementIds: linkedIds,
        title: buildMultiPrdStoredTitle(selectedReqs, products),
        background: fullContent,
        objectives: '',
        flowchart: '',
        featureList: [],
        nonFunctional: '',
        status: 'draft',
        version: 1,
        author: authorLabel,
        createdAt: now,
        updatedAt: now,
        ...rdAuditCreate(),
      });
      for (const req of selectedReqs) {
        await upsertRequirement.mutateAsync({
          ...req,
          status: 'prd_writing',
          updatedAt: now,
          ...rdAuditUpdate(),
        });
      }

      toast.success('PRD生成成功');
      setShowGenerateDialog(false);
      setGeneratedContent('');
      setSelectedRequirementIds([]);
      setReferencePrdId('');
      resetPrdSupplementaryState(
        setUploadedSupplementaryDocs,
        setPastedSupplementary,
        supplementaryFileInputRef.current
      );

      router.push(`/prd/${newId}/edit`);
    } catch (e) {
      const aborted =
        e instanceof DOMException && e.name === 'AbortError';
      toast.error(
        aborted
          ? `PRD 生成超过 ${PRD_STREAM_TIMEOUT_MS / 60_000} 分钟未结束，已取消。请检查 ARK_API_KEY、网络或模型服务。`
          : e instanceof Error
            ? e.message
            : 'PRD生成失败，请重试'
      );
    } finally {
      window.clearTimeout(streamTimeoutId);
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
    const actorUserId = getCurrentUser()?.id;
    void submitPrdReview
      .mutateAsync({ prdId, reviewer: '产品经理', comment, actorUserId })
      .then(() => {
        toast.success('PRD已提交审核');
      });
  };

  const handleApprove = (prdId: string) => {
    const comment = window.prompt('请输入审核通过意见（可选）') || undefined;
    const actorUserId = getCurrentUser()?.id;
    void reviewPrd.mutate(
      { prdId, status: 'approved', reviewer: '技术经理', comment, actorUserId },
      { onSuccess: () => toast.success('PRD审核已通过') }
    );
  };

  const handleReject = (prdId: string) => {
    const comment = window.prompt('请输入驳回原因（建议填写）') || undefined;
    const actorUserId = getCurrentUser()?.id;
    void reviewPrd.mutate(
      { prdId, status: 'rejected', reviewer: '技术经理', comment, actorUserId },
      { onSuccess: () => toast.success('PRD已驳回') }
    );
  };

  const handleSupplementaryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList?.length) return;
    const incoming = Array.from(fileList);
    const added: IPrdSupplementaryUpload[] = [];
    const failed: string[] = [];
    for (const file of incoming) {
      try {
        const text = await readTextFile(file);
        added.push({
          id: `supp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name,
          content: text,
        });
      } catch {
        failed.push(file.name);
      }
    }
    if (added.length > 0) {
      setUploadedSupplementaryDocs((prev) => [...prev, ...added]);
      toast.success(
        added.length === 1 ? `已添加参考文档：${added[0].name}` : `已添加 ${added.length} 份参考文档`
      );
    }
    if (failed.length > 0) {
      toast.error(`读取失败：${failed.join('、')}`);
    }
    if (supplementaryFileInputRef.current) supplementaryFileInputRef.current.value = '';
  };

  const removeSupplementaryDoc = (id: string) => {
    setUploadedSupplementaryDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const clearSupplementaryDocument = () => {
    resetPrdSupplementaryState(
      setUploadedSupplementaryDocs,
      setPastedSupplementary,
      supplementaryFileInputRef.current
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
      <div className="flex w-full flex-col gap-6">
        {/* 页面标题 */}
        <section className="w-full">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="rd-page-header-lead">
              <RdPageModuleHeading
                icon={FileText}
                title="智能文档"
                description="管理产品需求文档，支持AI辅助生成"
              />
            </div>
            <Button
              onClick={() => {
                setPrdPreviewTab('edit');
                setReferencePrdId('');
                resetPrdSupplementaryState(
                  setUploadedSupplementaryDocs,
                  setPastedSupplementary,
                  supplementaryFileInputRef.current
                );
                setShowGenerateDialog(true);
              }}
              className="shrink-0 shadow-sm sm:mt-0"
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

        {/* 筛选栏 — 与需求中心页同一套 rd-surface */}
        <section className="w-full">
          <div className="rd-surface-card rd-surface-card-hover px-4 py-4 sm:px-5 sm:py-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex min-w-[280px] flex-1">
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

        {/* PRD列表 — 与需求中心页同一表头条 + 内容区 */}
        <section className="w-full">
          <div className="rd-surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="rd-list-section-icon">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">智能文档列表</h2>
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
                            {prd.displayTitle}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="text-foreground">{prd.requirementTitle}</p>
                          <p className="text-xs text-muted-foreground">
                            {getRequirementStatusPresentation(prd.requirementStatus).label}
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
              setSelectedRequirementIds([]);
              setPrdPreviewTab('edit');
              setReferencePrdId('');
              resetPrdSupplementaryState(
                setUploadedSupplementaryDocs,
                setPastedSupplementary,
                supplementaryFileInputRef.current
              );
            }
          }}
        >
          <DialogContent className="mx-auto flex h-[92dvh] max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-4 sm:w-[calc(100vw-2rem)] sm:max-w-4xl sm:p-6">
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI生成PRD
              </DialogTitle>
              <DialogDescription>
                可多选同一产品下的多条需求，合并生成一份 PRD（各需求功能分段落区分，产品公共设计合并）；可选引用同产品已有 PRD，并上传参考文档（.txt / .md）。
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto py-3 sm:py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">选择需求（可多选，须同一产品）</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      disabled={generating || availableRequirements.length === 0}
                      className="h-auto min-h-10 w-full justify-between font-normal"
                    >
                      <span className="flex flex-1 flex-wrap items-center gap-1.5 text-left">
                        {selectedRequirements.length === 0 ? (
                          <span className="text-muted-foreground">
                            {availableRequirements.length === 0
                              ? '暂无可用需求'
                              : '请选择要生成 PRD 的需求'}
                          </span>
                        ) : (
                          selectedRequirements.map((req) => (
                            <Badge
                              key={req.id}
                              variant="secondary"
                              className="gap-1 pr-1 font-normal"
                            >
                              {req.title}
                              <span className="text-muted-foreground">{req.priority}</span>
                              <button
                                type="button"
                                className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
                                disabled={generating}
                                aria-label={`取消选择 ${req.title}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRequirementIds((prev) =>
                                    prev.filter((id) => id !== req.id)
                                  );
                                }}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))
                        )}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <ScrollArea className="max-h-64">
                      <ul className="p-1">
                        {availableRequirements.map((req) => {
                          const checked = selectedRequirementIds.includes(req.id);
                          const selectable = isRequirementSelectableInDialog(req);
                          const rowDisabled = generating || (!selectable && !checked);
                          return (
                            <li key={req.id}>
                              <button
                                type="button"
                                className={cn(
                                  'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent',
                                  checked && 'bg-accent/60',
                                  rowDisabled &&
                                    'cursor-not-allowed opacity-50 hover:bg-transparent'
                                )}
                                disabled={rowDisabled}
                                onClick={() => toggleRequirementSelection(req.id)}
                              >
                                <Checkbox
                                  checked={checked}
                                  className="mt-0.5 pointer-events-none"
                                  tabIndex={-1}
                                  aria-hidden
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="font-medium">{req.title}</span>
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    {req.priority}
                                  </Badge>
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {formatRequirementProductLabel(req)}
                                    {!selectable && !checked ? ' · 与已选需求产品不一致' : ''}
                                  </span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                        {availableRequirements.length === 0 && (
                          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                            暂无可用需求
                          </li>
                        )}
                      </ul>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
                {selectedRequirements.length > 0 && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    已选 {selectedRequirements.length} 条
                    {productKey ? ` · 产品：${productLabel || productKey}` : ' · 未绑定产品'}
                  </p>
                )}
                {selectedRequirements.map((req) => (
                  <p
                    key={req.id}
                    className="line-clamp-2 border-l-2 border-primary/30 pl-2 text-xs leading-relaxed text-muted-foreground"
                  >
                    <span className="font-medium text-foreground/90">{req.title}：</span>
                    {stripHtmlTags(req.description ?? '')}
                  </p>
                ))}
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-muted/15 p-3 sm:p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Link2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  关联文档（可选）
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  引用同产品已有 PRD 的正文，或上传多份参考文档 / 粘贴补充说明；所有材料将随原始需求一并送入模型，生成时须综合引用。
                </p>

                {selectedRequirementIds.length > 0 && !productKey && (
                  <p className="text-xs text-amber-700 dark:text-amber-400/90 leading-relaxed">
                    当前需求未设置「所属产品」，无法列出同产品 PRD。可在需求详情中补充产品后重试；您仍可仅使用下方用户文档作为补充输入。
                  </p>
                )}

                {selectedRequirementIds.length > 0 && productKey && (
                  <p className="text-xs text-muted-foreground">
                    当前产品：{productLabel || productKey}
                  </p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="prd-ref-prd" className="text-xs font-medium text-muted-foreground">
                    同产品已有 PRD
                  </Label>
                  <Select
                    value={referencePrdId || '__none__'}
                    onValueChange={(v) => setReferencePrdId(v === '__none__' ? '' : v)}
                    disabled={generating || !productKey || siblingPrdOptions.length === 0}
                  >
                    <SelectTrigger id="prd-ref-prd" className="w-full">
                      <SelectValue
                        placeholder={
                          !productKey
                            ? '需先为需求设置所属产品'
                            : siblingPrdOptions.length === 0
                              ? '暂无其他需求的 PRD'
                              : '选择要继承规范的参考 PRD'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">不引用</SelectItem>
                      {siblingPrdOptions.map((p) => {
                        const rForP = requirements.find((r) => r.id === p.requirementId);
                        const optLabel = formatPrdListTitle(
                          rForP as IRequirement | undefined,
                          products,
                          p.title
                        );
                        return (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="truncate">{optLabel}</span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" aria-hidden />
                    用户上传 / 粘贴（.txt、.md，建议 UTF-8，可多选）
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={supplementaryFileInputRef}
                      type="file"
                      accept=".txt,.md,.markdown,text/plain"
                      multiple
                      className="sr-only"
                      id="prd-gen-supplementary-file"
                      onChange={handleSupplementaryFileChange}
                      disabled={generating}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={generating}
                      onClick={() => supplementaryFileInputRef.current?.click()}
                    >
                      选择文件（可多选）
                    </Button>
                    {(uploadedSupplementaryDocs.length > 0 || pastedSupplementary.trim()) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={clearSupplementaryDocument}
                        disabled={generating}
                      >
                        清除全部
                      </Button>
                    )}
                  </div>
                  {uploadedSupplementaryDocs.length > 0 && (
                    <ul className="flex flex-wrap gap-2" aria-label="已上传参考文档">
                      {uploadedSupplementaryDocs.map((doc) => (
                        <li key={doc.id}>
                          <Badge
                            variant="secondary"
                            className="gap-1 pr-1 font-normal max-w-[min(100%,280px)]"
                          >
                            <span className="truncate" title={doc.name}>
                              {doc.name}
                            </span>
                            <span className="text-muted-foreground shrink-0">
                              ({doc.content.length.toLocaleString()} 字)
                            </span>
                            <button
                              type="button"
                              className="ml-0.5 rounded-sm p-0.5 hover:bg-muted disabled:opacity-50"
                              aria-label={`移除 ${doc.name}`}
                              disabled={generating}
                              onClick={() => removeSupplementaryDoc(doc.id)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Textarea
                    value={pastedSupplementary}
                    onChange={(e) => setPastedSupplementary(e.target.value)}
                    disabled={generating}
                    placeholder="可粘贴内部规范、接口约定、术语表等（与上方上传文件一并作为参考，可留空）"
                    className="min-h-[88px] resize-y font-mono text-xs leading-relaxed"
                    spellCheck={false}
                  />
                </div>
              </div>

              {isStreaming && (
                <div className="min-h-0 min-w-0 flex flex-1 flex-col space-y-3">
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
                      onValueChange={(v) => setPrdPreviewTab(v as 'edit' | 'preview')}
                      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden"
                    >
                      <TabsList className="grid h-10 w-full max-w-full shrink-0 grid-cols-2 rounded-full p-1 sm:max-w-md">
                        <TabsTrigger value="edit" className="rounded-full text-sm">
                          编辑
                        </TabsTrigger>
                        <TabsTrigger value="preview" className="rounded-full text-sm">
                          预览
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="edit" className="mt-0 min-h-0 min-w-0 flex-1 space-y-2 overflow-hidden data-[state=inactive]:hidden">
                        <p className="text-xs text-muted-foreground">源码查看（Markdown）；切换「预览」查看排版效果</p>
                        <div className="w-full overflow-hidden">
                          <Textarea
                            value={generatedContent}
                            readOnly
                            wrap="soft"
                            placeholder="等待 AI 输出 Markdown 内容..."
                            className="h-[clamp(9rem,30dvh,18rem)] w-full max-w-full resize-none overflow-x-auto whitespace-pre-wrap break-all font-mono text-sm leading-relaxed sm:h-[min(26rem,55vh)]"
                            spellCheck={false}
                          />
                        </div>
                      </TabsContent>
                      <TabsContent value="preview" className="mt-0 min-h-0 min-w-0 flex-1 space-y-2 overflow-hidden data-[state=inactive]:hidden">
                        <p className="text-xs text-muted-foreground">渲染预览（只读）；查看标题、列表、表格等排版效果</p>
                        <ScrollArea className="h-[clamp(9rem,30dvh,18rem)] w-full sm:h-[min(26rem,55vh)]">
                          <div className={`${PRD_GEN_PREVIEW_BOX} w-full overflow-x-auto p-4 sm:p-6 md:p-8`}>
                            <Streamdown className={PRD_GEN_STREAMDOWN_CLASS}>
                              {generatedContent || '暂无内容，请等待 AI 生成'}
                            </Streamdown>
                          </div>
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowGenerateDialog(false);
                  setGeneratedContent('');
                  setSelectedRequirementIds([]);
                  setPrdPreviewTab('edit');
                  setReferencePrdId('');
                  resetPrdSupplementaryState(
                    setUploadedSupplementaryDocs,
                    setPastedSupplementary,
                    supplementaryFileInputRef.current
                  );
                }}
                disabled={generating}
              >
                取消
              </Button>
              <Button
                onClick={handleGeneratePRD}
                disabled={selectedRequirementIds.length === 0 || generating}
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
