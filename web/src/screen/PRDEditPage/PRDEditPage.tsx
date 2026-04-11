'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { capabilityClient } from '@/lib/capability-client';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Streamdown } from '@/components/ui/streamdown';
import {
  Sparkles,
  Save,
  ArrowLeft,
  Send,
  FileText,
  List,
  Bot,
  X,
  Wand2,
  ChevronDown,
  PencilLine,
  BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePrd, useRequirement, useSubmitPrdReview, useUpsertPrd } from '@/lib/rd-hooks';
import { parsePrdMarkdownSections, rebuildPrdMarkdown } from '@/lib/prd-markdown';

// 类型定义
interface IFeature {
  id: string;
  name: string;
  description: string;
  acceptanceCriteria: string[];
}

interface IPRD {
  id: string;
  requirementId: string;
  title?: string;
  background: string;
  objectives: string;
  flowchart?: string;
  featureList: IFeature[];
  nonFunctional: string;
  status: 'draft' | 'reviewing' | 'approved' | 'rejected';
  version: number;
  updatedAt: string;
}

interface IRequirement {
  id: string;
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: string;
  submitter: string;
}

// 本地存储键名
const STORAGE_PRD_KEY = '__global_rd_currentPRD';
const STORAGE_REQ_KEY = '__global_rd_currentRequirement';
const STORAGE_ROLE_KEY = '__global_rd_userRole';

// AI流式输出类型
interface StreamChunk {
  content: string;
}

const PRDEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const currentProfile = useCurrentUserProfile();
  const userRole = (sessionStorage.getItem(STORAGE_ROLE_KEY) as 'stakeholder' | 'pm' | 'tm') || 'pm';

  const { data: loadedPrd, isLoading: prdQueryLoading } = usePrd(id);
  const { data: loadedReq } = useRequirement(loadedPrd?.requirementId);
  const upsertPrd = useUpsertPrd();
  const submitPrdReview = useSubmitPrdReview();

  // PRD状态
  const [prd, setPrd] = useState<IPRD | null>(null);
  const [requirement, setRequirement] = useState<IRequirement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [structuredOpen, setStructuredOpen] = useState(true);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  /** 全文 Markdown：编辑源码 / 渲染预览 */
  const [prdMdMode, setPrdMdMode] = useState<'edit' | 'preview'>('edit');

  // AI助手状态
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiStreamContent, setAiStreamContent] = useState('');

  useEffect(() => {
    if (!id) {
      setIsLoading(false);
      return;
    }
    if (prdQueryLoading) return;
    if (loadedPrd) {
      setPrd(loadedPrd as unknown as IPRD);
      setIsLoading(false);
      return;
    }
    toast.error('未找到 PRD 文档');
    router.push('/prd');
    setIsLoading(false);
  }, [id, loadedPrd, prdQueryLoading, router]);

  useEffect(() => {
    if (loadedReq) {
      setRequirement(loadedReq as unknown as IRequirement);
    }
  }, [loadedReq]);

  // 保存PRD
  const savePRD = useCallback(() => {
    if (!prd) return;
    const updatedPrd = {
      ...prd,
      updatedAt: new Date().toISOString(),
    };
    void upsertPrd.mutateAsync(updatedPrd as Parameters<typeof upsertPrd.mutateAsync>[0]);
    toast.success('PRD已保存');
  }, [prd, upsertPrd]);

  // 更新PRD字段
  const updateField = useCallback(
    (field: keyof IPRD, value: string | IFeature[]) => {
      if (!prd) return;
      setPrd((prev) => {
        if (!prev) return null;
        const updated = { ...prev, [field]: value };
        void upsertPrd.mutateAsync(updated as Parameters<typeof upsertPrd.mutateAsync>[0]);
        return updated;
      });
    },
    [prd, upsertPrd]
  );

  const parsedPrd = useMemo(
    () => (prd ? parsePrdMarkdownSections(prd.background || '') : { docTitle: null, sections: [] }),
    [prd?.background]
  );

  const handleStructuredDocTitleChange = useCallback(
    (title: string) => {
      if (!prd) return;
      const parsed = parsePrdMarkdownSections(prd.background || '');
      updateField('background', rebuildPrdMarkdown(title.trim() || null, parsed.sections));
    },
    [prd, updateField]
  );

  const handleStructuredSectionBodyChange = useCallback(
    (index: number, body: string) => {
      if (!prd) return;
      const parsed = parsePrdMarkdownSections(prd.background || '');
      if (parsed.sections.length === 1 && parsed.sections[0].title === '全文') {
        updateField('background', body);
        return;
      }
      const next = parsed.sections.map((s, j) => (j === index ? { ...s, body } : s));
      updateField('background', rebuildPrdMarkdown(parsed.docTitle, next));
    },
    [prd, updateField]
  );

  // 提交审核
  const submitForReview = useCallback(() => {
    if (!prd) return;
    if (!prd.background?.trim()) {
      toast.error('请完善 PRD 正文（Markdown）后再提交');
      return;
    }
    void submitPrdReview
      .mutateAsync({ prdId: prd.id, reviewer: '产品经理' })
      .then(() => {
        toast.success('PRD已提交审核');
        router.push('/prd');
      });
  }, [prd, router, submitPrdReview]);

  const parseAndUpdatePRD = useCallback(
    (content: string) => {
      if (!prd) return;
      const updatedPrd = {
        ...prd,
        background: content,
      };
      setPrd(updatedPrd);
      void upsertPrd.mutateAsync(updatedPrd as Parameters<typeof upsertPrd.mutateAsync>[0]);
    },
    [prd, upsertPrd]
  );

  // AI生成PRD
  const handleAIGenerate = useCallback(async () => {
    if (!requirement?.description && !aiPrompt) {
      toast.error('请提供需求描述或输入提示词');
      return;
    }

    setIsGenerating(true);
    setAiStreamContent('');

    try {
      const prompt = aiPrompt || requirement?.description || '';
      
      const stream = capabilityClient
        .load('prd_generator_1')
        .callStream<StreamChunk>('textGenerate', {
          original_requirement: prompt,
          additional_requirements: '请生成完整的PRD文档，包含背景、目标、业务流程、功能列表和非功能性需求。',
        });

      let fullContent = '';
      for await (const chunk of stream) {
        if (chunk.content) {
          fullContent += chunk.content;
          setAiStreamContent(prev => prev + chunk.content);
        }
      }

      // 解析AI生成的内容并更新PRD
      parseAndUpdatePRD(fullContent);
      toast.success('AI生成完成');
    } catch (error) {
      toast.error('AI生成失败，请重试');
    } finally {
      setIsGenerating(false);
      setShowAIAssistant(false);
    }
  }, [requirement?.description, aiPrompt, parseAndUpdatePRD]);

  // AI辅助优化当前段落
  const handleAIOptimize = useCallback(async (section: string) => {
    if (!prd) return;

    const sectionContent = prd[section as keyof IPRD] as string;
    if (!sectionContent) {
      toast.error('请先输入内容再使用AI优化');
      return;
    }

    setIsGenerating(true);
    setAiStreamContent('');

    try {
      const stream = capabilityClient
        .load('prd_generator_1')
        .callStream<StreamChunk>('textGenerate', {
          original_requirement: sectionContent,
          additional_requirements: `请优化以下${section}内容，使其更加专业、清晰、完整。保持原有结构但提升表达质量。`,
        });

      let fullContent = '';
      for await (const chunk of stream) {
        if (chunk.content) {
          fullContent += chunk.content;
          setAiStreamContent(prev => prev + chunk.content);
        }
      }

      updateField(section as keyof IPRD, fullContent);
      toast.success('AI优化完成');
    } catch (error) {
      toast.error('AI优化失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  }, [prd, updateField]);

  // 添加功能项
  const addFeature = useCallback(() => {
    if (!prd) return;
    const newFeature: IFeature = {
      id: `feat-${Date.now()}`,
      name: '',
      description: '',
      acceptanceCriteria: [],
    };
    setPrd(prev => prev ? { ...prev, featureList: [...(prev.featureList || []), newFeature] } : null);
  }, [prd]);

  // 更新功能项
  const updateFeature = useCallback((featureId: string, field: keyof IFeature, value: string | string[]) => {
    if (!prd) return;
    setPrd(prev => prev ? {
      ...prev,
      featureList: (prev.featureList || []).map(f => f.id === featureId ? { ...f, [field]: value } : f),
    } : null);
  }, [prd]);

  // 删除功能项
  const removeFeature = useCallback((featureId: string) => {
    if (!prd) return;
    setPrd(prev => prev ? {
      ...prev,
      featureList: (prev.featureList || []).filter(f => f.id !== featureId),
    } : null);
  }, [prd]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!prd) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">PRD不存在或已被删除</p>
        <Button className="mt-4" onClick={() => router.push('/prd')}>
          返回PRD管理
        </Button>
      </div>
    );
  }

  // 确保 featureList 是数组
  const featureList = prd.featureList || [];

  const isReadOnly = prd.status === 'approved' || userRole === 'stakeholder';

  return (
    <>
      <style jsx>{`
        .ai-stream-content {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <div className="w-full max-w-[1400px] mx-auto space-y-6 px-0">
        {/* 页面头部 */}
        <section className="w-full">
          <div className="flex items-start justify-between">
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="mb-2"
                onClick={() => router.push('/prd')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回PRD管理
              </Button>
              <h1 className="text-2xl font-semibold text-foreground">
                编辑PRD
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {requirement?.title || '新建PRD'} · 版本 {prd.version}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isReadOnly ? (
                <Badge variant="secondary">只读模式</Badge>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setShowAIAssistant(true)}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    AI助手
                  </Button>
                  <Button variant="outline" onClick={savePRD}>
                    <Save className="mr-2 h-4 w-4" />
                    保存
                  </Button>
                  <Button onClick={submitForReview}>
                    <Send className="mr-2 h-4 w-4" />
                    提交审核
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* 关联需求信息 */}
        {requirement && (
          <section className="w-full">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">关联需求</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{requirement.title}</p>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {requirement.description}
                    </p>
                  </div>
                  <Badge
                    variant={
                      requirement.priority === 'P0'
                        ? 'destructive'
                        : requirement.priority === 'P1'
                        ? 'default'
                        : 'secondary'
                    }
                  >
                    {requirement.priority}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* PRD 编辑主体：全文 Markdown + 结构化（对齐 FS 规格页布局） */}
        <section className="w-full space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>PRD 文档（Markdown）</CardTitle>
                  <CardDescription>
                    完整 PRD 以 Markdown 保存在此，可直接修订；下方「结构化」按「## 1. …」分节编辑，与全文互相同步。
                  </CardDescription>
                  {prd.title && (
                    <p className="text-xs text-muted-foreground mt-2 font-mono">PRD：{prd.title}</p>
                  )}
                </div>
                {!isReadOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => handleAIOptimize('background')}
                    disabled={isGenerating}
                  >
                    <Wand2 className="mr-2 size-4" />
                    AI 优化全文
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs
                value={prdMdMode}
                onValueChange={(v) => setPrdMdMode(v as 'edit' | 'preview')}
                className="w-full"
              >
                <TabsList className="grid w-full max-w-md grid-cols-2">
                  <TabsTrigger value="edit" className="gap-2">
                    <PencilLine className="size-4 shrink-0" />
                    编辑
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="gap-2">
                    <BookOpen className="size-4 shrink-0" />
                    预览
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="edit" className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    源码编辑（Markdown）；切换「预览」查看标题、列表、表格等排版效果
                  </p>
                  <Textarea
                    value={prd.background}
                    onChange={(e) => updateField('background', e.target.value)}
                    readOnly={isReadOnly}
                    placeholder="在此编辑完整 PRD Markdown，或使用 AI 助手生成…"
                    className="min-h-[320px] font-mono text-sm leading-relaxed"
                    spellCheck={false}
                  />
                </TabsContent>
                <TabsContent value="preview" className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    渲染预览（只读）；编辑请切回「编辑」
                  </p>
                  <ScrollArea className="h-[min(480px,60vh)] w-full rounded-md border border-border bg-card">
                    <div className="p-4 pr-5 text-sm text-foreground [&_.streamdown]:max-w-none">
                      {prd.background?.trim() ? (
                        <Streamdown className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-headings:scroll-mt-4 prose-p:leading-relaxed prose-li:my-0.5 prose-table:text-sm">
                          {prd.background}
                        </Streamdown>
                      ) : (
                        <p className="text-sm text-muted-foreground py-8 text-center">暂无内容，请在「编辑」中输入 Markdown</p>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Collapsible open={structuredOpen} onOpenChange={setStructuredOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between p-6 text-left hover:bg-accent/30 rounded-t-lg border-b"
                >
                  <div>
                    <CardTitle className="text-base">结构化（按章节）</CardTitle>
                    <CardDescription>
                      按「# 标题」与「## 1. …」分块编辑；与上方全文同源
                    </CardDescription>
                  </div>
                  <ChevronDown
                    className={`size-5 shrink-0 transition-transform ${structuredOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4 pt-0">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">文档标题（# 一级标题，可选）</label>
                    <Input
                      value={parsedPrd.docTitle ?? ''}
                      onChange={(e) => handleStructuredDocTitleChange(e.target.value)}
                      readOnly={isReadOnly}
                      placeholder="例如：智能笔记本 需求 PRD文档"
                      className="font-mono text-sm"
                    />
                  </div>
                  {parsedPrd.sections.map((sec, index) => (
                    <Card key={`${sec.title}-${index}`} className="border-border shadow-sm">
                      <CardHeader className="py-3">
                        <CardTitle className="text-base font-medium">{sec.title}</CardTitle>
                        {sec.title === '全文' && (
                          <CardDescription className="text-xs">
                            未检测到「## 数字.」分节时，在此编辑等同于全文；也可在正文中手动添加「## 1. xxx」等标题后再展开分节。
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="pt-0">
                        <Tabs defaultValue="edit" className="w-full">
                          <TabsList className="grid w-full max-w-xs grid-cols-2 h-8">
                            <TabsTrigger value="edit" className="text-xs gap-1">
                              <PencilLine className="size-3.5" />
                              编辑
                            </TabsTrigger>
                            <TabsTrigger value="preview" className="text-xs gap-1">
                              <BookOpen className="size-3.5" />
                              预览
                            </TabsTrigger>
                          </TabsList>
                          <TabsContent value="edit" className="mt-2">
                            <Textarea
                              value={sec.body}
                              onChange={(e) => handleStructuredSectionBodyChange(index, e.target.value)}
                              readOnly={isReadOnly}
                              className="min-h-[160px] font-mono text-sm leading-relaxed"
                              placeholder="本节正文（Markdown）"
                              spellCheck={false}
                            />
                          </TabsContent>
                          <TabsContent value="preview" className="mt-2">
                            <ScrollArea className="max-h-[280px] w-full rounded-md border border-border bg-muted/20">
                              <div className="p-3 text-sm [&_.streamdown]:max-w-none">
                                {sec.body?.trim() ? (
                                  <Streamdown className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-p:leading-relaxed prose-li:my-0.5">
                                    {sec.body}
                                  </Streamdown>
                                ) : (
                                  <p className="text-xs text-muted-foreground py-6 text-center">本节无内容</p>
                                )}
                              </div>
                            </ScrollArea>
                          </TabsContent>
                        </Tabs>
                      </CardContent>
                    </Card>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <Collapsible open={featuresOpen} onOpenChange={setFeaturesOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between p-6 text-left hover:bg-accent/30 rounded-t-lg border-b"
                >
                  <div>
                    <CardTitle className="text-base">功能条目（可选）</CardTitle>
                    <CardDescription>结构化功能清单，与导出/评审兼容；与 PRD 正文「功能列表」章节可并行维护</CardDescription>
                  </div>
                  <ChevronDown
                    className={`size-5 shrink-0 transition-transform ${featuresOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4 pt-0">
                  <div className="flex justify-end">
                    {!isReadOnly && (
                      <Button type="button" size="sm" onClick={addFeature}>
                        <List className="mr-2 size-4" />
                        添加功能
                      </Button>
                    )}
                  </div>
                  <div className="space-y-4">
                    {featureList.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                        <List className="mx-auto h-10 w-10 mb-3 opacity-50" />
                        <p className="text-sm">暂无功能条目</p>
                        {!isReadOnly && (
                          <Button variant="outline" size="sm" className="mt-4" onClick={addFeature}>
                            添加第一条
                          </Button>
                        )}
                      </div>
                    ) : (
                      featureList.map((feature, index) => (
                        <div key={feature.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">
                              功能 {index + 1}
                            </span>
                            {!isReadOnly && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFeature(feature.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <input
                            type="text"
                            value={feature.name}
                            onChange={(e) => updateFeature(feature.id, 'name', e.target.value)}
                            placeholder="功能名称"
                            disabled={isReadOnly}
                            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-muted"
                          />
                          <textarea
                            value={feature.description}
                            onChange={(e) => updateFeature(feature.id, 'description', e.target.value)}
                            placeholder="功能描述"
                            disabled={isReadOnly}
                            rows={3}
                            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-muted resize-none"
                          />
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </section>

        {/* AI助手弹窗 */}
        {showAIAssistant && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-2xl mx-4">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" />
                    <CardTitle>AI助手</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAIAssistant(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>
                  基于需求自动生成PRD内容，或输入自定义提示词
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isGenerating ? (
                  <div className="py-8">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                      <span className="text-sm text-muted-foreground">AI正在生成内容...</span>
                    </div>
                    {aiStreamContent && (
                      <ScrollArea className="h-64 border rounded-md p-4 bg-muted">
                        <pre className="text-xs whitespace-pre-wrap">{aiStreamContent}</pre>
                      </ScrollArea>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        提示词（可选）
                      </label>
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder={requirement?.description || '输入提示词指导AI生成...'}
                        rows={4}
                        className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setShowAIAssistant(false)}
                      >
                        取消
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleAIGenerate}
                        disabled={isGenerating}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        开始生成
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
};

export default PRDEditPage;
