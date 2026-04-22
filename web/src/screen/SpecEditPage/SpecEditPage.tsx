'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { capabilityClient } from '@/lib/capability-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Save,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  FileCode,
  Database,
  Layers,
  Download,
  Wand2,
  Sparkles,
  Loader2,
  PencilLine,
  BookOpen,
  ClipboardList,
} from 'lucide-react';
import { Streamdown } from '@/components/ui/streamdown';
import { logger } from '@/lib/logger';
import { getCurrentUser } from '@/lib/auth';
import { rdAuditCreate, rdAuditUpdate } from '@/lib/rd-actor';
import type { IPrd } from '@/lib/mock-data-store';
import { createDefaultOrgSpecConfig } from '@/lib/org-spec-defaults';
import {
  useOrgSpecConfig,
  usePrdsList,
  useRequirementsList,
  usePrd,
  useRequirement,
  useSpecsList,
  useSpec,
  useSubmitSpecReview,
  useUpsertSpec,
} from '@/lib/rd-hooks';
import { toast } from 'sonner';
import { runAiSkillStream } from '@/lib/ai-skill-engine';
import { getAiSkill } from '@/lib/ai-skills';
interface IApiDef {
  path: string;
  method: string;
  description: string;
  requestParams: object;
  response: object;
  _index?: number;
}

interface IUIComponent {
  name: string;
  type: string;
  props: object;
  events: string[];
  _index?: number;
}

interface IInteraction {
  trigger: string;
  action: string;
  condition?: string;
  _index?: number;
}

type OrgSpecLanguage = 'java' | 'python' | 'go' | 'node' | 'react' | 'vue' | 'typescript';

interface IOrgLanguageSpec {
  language: OrgSpecLanguage;
  displayName: string;
  enabled: boolean;
  styleGuide: string[];
  mustFollow: string[];
  forbidden: string[];
  toolchain: string[];
  testing: string[];
}

interface IOrganizationSpecConfig {
  id: string;
  orgName: string;
  version: number;
  defaultLanguage: OrgSpecLanguage;
  updatedAt: string;
  languages: Record<OrgSpecLanguage, IOrgLanguageSpec>;
}

interface ISpecification {
  id: string;
  prdId: string;
  fsMarkdown?: string;
  tsMarkdown?: string;
  cpMarkdown?: string;
  functionalSpec: {
    apis: IApiDef[];
    uiComponents: IUIComponent[];
    interactions: IInteraction[];
  };
  technicalSpec: {
    databaseSchema: object;
    architecture: string;
    thirdPartyIntegrations: string[];
  };
  machineReadableJson: string;
  status: 'draft' | 'reviewing' | 'approved';
  createdAt: string;
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

const STORAGE_KEY_SPEC = '__global_rd_currentSpec';
const STORAGE_KEY_REQ = '__global_rd_currentRequirement';

const defaultSpec: ISpecification = {
  id: '',
  prdId: '',
  fsMarkdown: '',
  tsMarkdown: '',
  cpMarkdown: '',
  functionalSpec: {
    apis: [],
    uiComponents: [],
    interactions: []
  },
  technicalSpec: {
    databaseSchema: {},
    architecture: '',
    thirdPartyIntegrations: []
  },
  machineReadableJson: '',
  status: 'draft',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const FS_TEMPLATE = `# FS

## 1. 目标
一句话说明要解决什么问题 + 成功标准

## 2. 角色与场景
- 用户：
- 使用场景：

## 3. 功能
### 功能点1：
- 输入：
- 规则：
- 输出：
- 验收标准：

## 4. 规则补充
- 全局业务规则（if-then）

## 5. 示例（必须）
### 正常：
Input:
Output:

### 异常：
Input:
Output:
`;

const TS_TEMPLATE = `# TS

## 1. 技术栈
- 语言：
- 框架：

## 2. 数据模型
（结构化定义）

## 3. API
- 路径：
- 请求：
- 响应：
- 错误码：

## 4. 核心流程
（步骤 or 伪代码）

## 5. 异常处理
- 错误规则

## 6. 测试用例
- 输入：
- 输出：
`;

const CP_TEMPLATE = `# <主题> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 按 Task 顺序执行，每步完成后勾选 \`- [ ]\`。

**Goal:** （从 FS 概括业务目标与成功标准）

**Architecture:** （从 TS 概括模块与数据流）

**Tech Stack:** （从 TS 技术栈一节摘录）

---

## 0. 执行约定（必须先完成）

**Files:**
- Create: \`plan.md\`（本文件）
- Modify: \`README.md\`（若存在，补充启动与测试命令）

- [ ] **Step 1: 明确仓库结构与启动命令**

Run: \`ls\`
Expected: 可识别前后端或单体目录。

---

### Task 1: （示例：领域模型）

**Files:**
- Create: \`src/domain/Example.ts\`
- Test: \`tests/example.test.ts\`

- [ ] **Step 1: 写失败测试**

Run: \`npm test\`
Expected: FAIL

---

## 全局验收标准（完成本计划前必须全部满足）

- [ ] 主用户故事可演示
- [ ] 单元测试与关键接口测试通过
`;

function stripHtml(html: string): string {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

function buildPrdDocument(prd: IPrd): string {
  const features =
    prd.featureList?.map((f) => {
      const ac = (f.acceptanceCriteria || []).join('; ');
      return `- ${f.name}: ${f.description}${ac ? `\n  验收标准: ${ac}` : ''}`;
    }).join('\n') || '（无）';
  return [
    `标题: ${prd.title || '（未命名）'}`,
    `背景:\n${stripHtml(prd.background)}`,
    `目标:\n${stripHtml(prd.objectives)}`,
    `流程图: ${prd.flowchart?.trim() ? stripHtml(prd.flowchart) : '无'}`,
    `功能列表:\n${features}`,
    `非功能性需求:\n${stripHtml(prd.nonFunctional)}`,
  ].join('\n\n');
}

function resolveOrgSpecLanguages(cfg: IOrganizationSpecConfig, selected: OrgSpecLanguage[]): OrgSpecLanguage[] {
  const picked = [...new Set(selected)].filter((l) => cfg.languages[l]?.enabled);
  if (picked.length) return picked;
  if (cfg.languages[cfg.defaultLanguage]?.enabled) return [cfg.defaultLanguage];
  const firstEnabled = (Object.values(cfg.languages) as IOrgLanguageSpec[]).find((x) => x.enabled);
  return firstEnabled ? [firstEnabled.language] : ['typescript'];
}

function buildOrgSpecText(cfg: IOrganizationSpecConfig | null, langs: OrgSpecLanguage[]): string {
  if (!cfg) return '（未配置组织编码约束，请先在组织侧完成配置）';
  const resolved = resolveOrgSpecLanguages(cfg, langs);
  const blocks = resolved.map((lang) => {
    const l = cfg.languages[lang];
    return [
      `### ${l.displayName} (${lang})`,
      `编码风格:\n${l.styleGuide.map((x) => `- ${x}`).join('\n')}`,
      `必须遵循:\n${l.mustFollow.map((x) => `- ${x}`).join('\n')}`,
      `禁止项:\n${l.forbidden.map((x) => `- ${x}`).join('\n')}`,
      `工具链:\n${l.toolchain.map((x) => `- ${x}`).join('\n')}`,
      `测试要求:\n${l.testing.map((x) => `- ${x}`).join('\n')}`,
    ].join('\n\n');
  });
  return [`组织: ${cfg.orgName}`, `选用语言: ${resolved.map((l) => `${cfg.languages[l].displayName} (${l})`).join('、')}`, ...blocks].join('\n\n');
}

const SpecEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const userInfo = useCurrentUserProfile();
  const isCreateMode = !id || id === 'new';

  const { data: loadedSpec, isLoading: specLoading } = useSpec(isCreateMode ? undefined : id);
  const { data: loadedOrg } = useOrgSpecConfig();
  const { data: allRequirements = [] } = useRequirementsList();
  const { data: allPrds = [] } = usePrdsList();
  const { data: allSpecs = [] } = useSpecsList();
  const upsertSpecMutation = useUpsertSpec();
  const submitSpecReviewMutation = useSubmitSpecReview();

  const [spec, setSpec] = useState<ISpecification>(defaultSpec);
  const { data: linkedPrdApi } = usePrd(spec.prdId || undefined);
  const { data: linkedReq } = useRequirement(linkedPrdApi?.requirementId);
  const [linkedPrd, setLinkedPrd] = useState<IPrd | null>(null);
  const [requirement, setRequirement] = useState<IRequirement | null>(null);
  const [activeTab, setActiveTab] = useState('org-constraints');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [conflictResult, setConflictResult] = useState<string>('');
  const [isDetectingConflict, setIsDetectingConflict] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [orgSpecConfig, setOrgSpecConfig] = useState<IOrganizationSpecConfig | null>(null);
  const [selectedLanguages, setSelectedLanguages] = useState<OrgSpecLanguage[]>(['typescript']);
  const [generatingFs, setGeneratingFs] = useState(false);
  const [generatingTs, setGeneratingTs] = useState(false);
  const [generatingCp, setGeneratingCp] = useState(false);
  const [fsStreamText, setFsStreamText] = useState('');
  const [tsStreamText, setTsStreamText] = useState('');
  const [cpStreamText, setCpStreamText] = useState('');
  const [fsMdMode, setFsMdMode] = useState<'edit' | 'preview'>('preview');
  const [tsMdMode, setTsMdMode] = useState<'edit' | 'preview'>('preview');
  const [cpMdMode, setCpMdMode] = useState<'edit' | 'preview'>('preview');
  const [selectedRequirementId, setSelectedRequirementId] = useState('');
  const [selectedPrdId, setSelectedPrdId] = useState('');

  useEffect(() => {
    if (isCreateMode) return;
    if (!id) return;
    if (specLoading) return;
    if (loadedSpec) {
      const s = loadedSpec as unknown as ISpecification;
      setSpec({
        ...defaultSpec,
        ...s,
        functionalSpec: { ...defaultSpec.functionalSpec, ...s.functionalSpec },
        technicalSpec: { ...defaultSpec.technicalSpec, ...s.technicalSpec },
        fsMarkdown: s.fsMarkdown ?? '',
        tsMarkdown: s.tsMarkdown ?? '',
        cpMarkdown: s.cpMarkdown ?? '',
      });
    } else {
      toast.error('未找到规格');
      router.push('/specification');
    }
  }, [id, isCreateMode, loadedSpec, specLoading, router]);

  useEffect(() => {
    if (!isCreateMode) return;
    if (!selectedRequirementId) {
      setSelectedPrdId('');
      return;
    }
    const prds = allPrds.filter((p) => p.requirementId === selectedRequirementId);
    if (!prds.length) {
      setSelectedPrdId('');
      return;
    }
    const preferred = prds.find((p) => p.status === 'approved') || prds[0];
    setSelectedPrdId(preferred.id);
  }, [isCreateMode, selectedRequirementId, allPrds]);

  useEffect(() => {
    if (loadedOrg) {
      const cfg = loadedOrg as IOrganizationSpecConfig;
      setOrgSpecConfig(cfg);
      setSelectedLanguages([cfg.defaultLanguage]);
    } else {
      const def = createDefaultOrgSpecConfig();
      setOrgSpecConfig(def);
      setSelectedLanguages([def.defaultLanguage]);
    }
  }, [loadedOrg]);

  const resolvedOrgLanguages = useMemo(
    () => (orgSpecConfig ? resolveOrgSpecLanguages(orgSpecConfig, selectedLanguages) : []),
    [orgSpecConfig, selectedLanguages],
  );

  const organizationCodingSpecPayload = useMemo(() => {
    if (!orgSpecConfig) return null;
    return {
      orgName: orgSpecConfig.orgName,
      languages: resolvedOrgLanguages.map((language) => ({
        language,
        constraints: orgSpecConfig.languages[language],
      })),
    };
  }, [orgSpecConfig, resolvedOrgLanguages]);

  useEffect(() => {
    if (linkedPrdApi) {
      setLinkedPrd(linkedPrdApi as unknown as IPrd);
    } else {
      setLinkedPrd(null);
    }
  }, [linkedPrdApi]);

  useEffect(() => {
    if (linkedReq) {
      setRequirement(linkedReq as unknown as IRequirement);
    }
  }, [linkedReq]);

  useEffect(() => {
    if (!spec.id || !spec.prdId) return;
    const h = window.setTimeout(() => {
      void upsertSpecMutation.mutateAsync({
        ...(spec as Parameters<typeof upsertSpecMutation.mutateAsync>[0]),
        ...rdAuditUpdate(),
      });
    }, 800);
    return () => window.clearTimeout(h);
  }, [spec, upsertSpecMutation]);

  const updateSpec = useCallback((updates: Partial<ISpecification>) => {
    setSpec(prev => ({
      ...prev,
      ...updates,
      updatedAt: new Date().toISOString()
    }));
    setHasUnsavedChanges(true);
  }, []);

  const toggleOrgLanguage = useCallback(
    (lang: OrgSpecLanguage, checked: boolean) => {
      if (!orgSpecConfig?.languages[lang]?.enabled) return;
      setSelectedLanguages((prev) => {
        if (checked) {
          return [...new Set([...prev, lang])];
        }
        const next = prev.filter((l) => l !== lang);
        const stillEnabled = next.filter((l) => orgSpecConfig.languages[l]?.enabled);
        if (stillEnabled.length === 0) {
          toast.message('至少保留一种已启用的语言');
          return prev;
        }
        return stillEnabled;
      });
    },
    [orgSpecConfig],
  );

  const validateJson = useCallback(() => {
    setIsValidating(true);
    setJsonError(null);
    
    try {
      const machineJson = JSON.stringify({
        fsMarkdown: spec.fsMarkdown ?? '',
        tsMarkdown: spec.tsMarkdown ?? '',
        cpMarkdown: spec.cpMarkdown ?? '',
        functionalSpec: spec.functionalSpec,
        technicalSpec: spec.technicalSpec,
        organizationCodingSpec: organizationCodingSpecPayload,
      }, null, 2);
      
      // 尝试解析验证JSON格式
      JSON.parse(machineJson);
      
      updateSpec({ machineReadableJson: machineJson });
      
      // 模拟验证延迟
      setTimeout(() => {
        setIsValidating(false);
      }, 500);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'JSON格式错误');
      setIsValidating(false);
    }
  }, [spec.fsMarkdown, spec.tsMarkdown, spec.cpMarkdown, spec.functionalSpec, spec.technicalSpec, organizationCodingSpecPayload, updateSpec]);

  const detectConflict = useCallback(async () => {
    setIsDetectingConflict(true);
    setConflictResult('');
    
    try {
      const stream = capabilityClient
        .load('conflict_detector_tech_spec_1')
        .callStream('textToJson', {
          tech_spec_content: JSON.stringify(spec, null, 2),
          existing_system_logic: '现有系统架构基于微服务设计，使用REST API通信，数据库采用主从架构，支持水平扩展。'
        });

      let result = '';
      for await (const chunk of stream as AsyncIterable<{ content?: string }>) {
        if (chunk.content) {
          result += chunk.content;
          setConflictResult(result);
        }
      }
      
      setShowConflictDialog(true);
    } catch (error) {
      logger.error('Conflict detection failed:', error);
      setConflictResult('冲突检测失败，请稍后重试');
      setShowConflictDialog(true);
    } finally {
      setIsDetectingConflict(false);
    }
  }, [spec]);

  const handleGenerateFs = useCallback(async () => {
    const prd = linkedPrd ?? (spec.prdId ? ((linkedPrdApi as unknown as IPrd | null) ?? null) : null);
    if (!prd) {
      toast.error('未找到关联 PRD。请从「PRD 管理」进入或确保当前规格的 prdId 已关联有效 PRD。');
      return;
    }
    setGeneratingFs(true);
    setFsStreamText('');
    try {
      const skill = await getAiSkill('fs_auto_generation');
      const prdDoc = buildPrdDocument(prd);
      const full = await runAiSkillStream(skill, {
        variables: { prd_document: prdDoc },
        onChunk: (chunk) => {
          setFsStreamText((prev) => prev + chunk);
        },
      });
      updateSpec({ fsMarkdown: full });
      setFsStreamText('');
      toast.success('功能规格（FS）已生成');
    } catch (e) {
      logger.error('FS generation failed:', e);
      toast.error(e instanceof Error ? e.message : 'FS 生成失败');
    } finally {
      setGeneratingFs(false);
    }
  }, [linkedPrd, linkedPrdApi, spec.prdId, updateSpec]);

  const handleGenerateTs = useCallback(async () => {
    const fsBody = (spec.fsMarkdown ?? '').trim();
    if (!fsBody) {
      toast.error('请先生成功能规格（FS），或粘贴 FS 正文后再生成 TS');
      return;
    }
    if (!orgSpecConfig) {
      toast.error('未加载组织编码约束');
      return;
    }
    setGeneratingTs(true);
    setTsStreamText('');
    try {
      const skill = await getAiSkill('ts_auto_generation');
      const orgText = buildOrgSpecText(orgSpecConfig, selectedLanguages);
      const full = await runAiSkillStream(skill, {
        variables: {
          functional_spec: fsBody,
          org_spec: orgText,
        },
        onChunk: (chunk) => {
          setTsStreamText((prev) => prev + chunk);
        },
      });
      updateSpec({ tsMarkdown: full });
      setTsStreamText('');
      toast.success('技术规格（TS）已生成');
    } catch (e) {
      logger.error('TS generation failed:', e);
      toast.error(e instanceof Error ? e.message : 'TS 生成失败');
    } finally {
      setGeneratingTs(false);
    }
  }, [orgSpecConfig, selectedLanguages, spec.fsMarkdown, updateSpec]);

  const handleGenerateCp = useCallback(async () => {
    const fsBody = (spec.fsMarkdown ?? '').trim();
    const tsBody = (spec.tsMarkdown ?? '').trim();
    if (!fsBody) {
      toast.error('请先生成或填写功能规格（FS）后再生成编程计划（CP）');
      return;
    }
    if (!tsBody) {
      toast.error('请先生成或填写技术规格（TS）后再生成编程计划（CP）');
      return;
    }
    setGeneratingCp(true);
    setCpStreamText('');
    try {
      const skill = await getAiSkill('cp_auto_generation');
      const full = await runAiSkillStream(skill, {
        variables: {
          fs_document: fsBody,
          ts_document: tsBody,
        },
        onChunk: (chunk) => {
          setCpStreamText((prev) => prev + chunk);
        },
      });
      updateSpec({ cpMarkdown: full });
      setCpStreamText('');
      toast.success('编程计划（CP）已生成');
    } catch (e) {
      logger.error('CP generation failed:', e);
      toast.error(e instanceof Error ? e.message : 'CP 生成失败');
    } finally {
      setGeneratingCp(false);
    }
  }, [spec.fsMarkdown, spec.tsMarkdown, updateSpec]);

  const handleSave = useCallback(() => {
    validateJson();
    updateSpec({ status: 'draft' });
    setHasUnsavedChanges(false);
    void upsertSpecMutation.mutateAsync({
      ...spec,
      status: 'draft',
      ...rdAuditUpdate(),
    } as Parameters<typeof upsertSpecMutation.mutateAsync>[0]);
  }, [spec, validateJson, updateSpec, upsertSpecMutation]);

  const handleSubmit = useCallback(async () => {
    if (!spec.id) {
      toast.error('当前规格尚未创建完成，请先保存后再提交审核');
      return;
    }
    validateJson();
    updateSpec({ status: 'reviewing' });
    setHasUnsavedChanges(false);
    try {
      await submitSpecReviewMutation.mutateAsync({
        specId: spec.id,
        reviewer: '技术经理',
        actorUserId: getCurrentUser()?.id,
      });
      toast.success('规格说明书已提交审核');
    } catch (error) {
      logger.error('Spec submit review failed:', error);
      toast.error(error instanceof Error ? error.message : '提交审核失败，请稍后重试');
    }
  }, [spec.id, validateJson, updateSpec, submitSpecReviewMutation]);

  const handleExport = useCallback(() => {
    const exportData = {
      version: '1.0',
      exportTime: new Date().toISOString(),
      specification: spec,
      requirement: requirement,
      organizationCodingSpec: organizationCodingSpecPayload,
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spec_${spec.id}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportDialog(false);
  }, [orgSpecConfig, requirement, organizationCodingSpecPayload, spec]);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
      draft: { label: '草稿', variant: 'secondary' },
      reviewing: { label: '审核中', variant: 'outline' },
      approved: { label: '已批准', variant: 'default', className: 'bg-green-500 text-white hover:bg-green-600' }
    };
    const { label, variant, className } = statusMap[status] || { label: status, variant: 'default' };
    return <Badge variant={variant} className={className}>{label}</Badge>;
  };

  const createSpecFromRequirement = useCallback(async () => {
    if (!selectedRequirementId) {
      toast.error('请先选择需求');
      return;
    }
    if (!selectedPrdId) {
      toast.error('该需求尚未关联 PRD，请先在 PRD 管理中创建/关联 PRD');
      return;
    }
    const existingSpec = allSpecs.find((s) => s.prdId === selectedPrdId);
    if (existingSpec) {
      toast.error('该需求已存在规格说明书，不允许重复创建');
      return;
    }
    const now = new Date().toISOString();
    const newId = `spec-${Date.now()}`;
    const payload = {
      ...defaultSpec,
      id: newId,
      prdId: selectedPrdId,
      createdAt: now,
      updatedAt: now,
      ...rdAuditCreate(),
    };
    await upsertSpecMutation.mutateAsync(payload);
    toast.success('规格已创建，请继续完善 FS/TS');
    router.push(`/specification/${newId}/edit`);
  }, [allSpecs, selectedPrdId, selectedRequirementId, upsertSpecMutation, router]);

  if (isCreateMode) {
    const prdRequirementMap = new Map(allPrds.map((p) => [p.id, p.requirementId]));
    const requirementIdsWithSpec = new Set(
      allSpecs
        .map((s) => prdRequirementMap.get(s.prdId))
        .filter((id): id is string => Boolean(id)),
    );
    const candidateRequirements = allRequirements.filter((r) =>
      ['backlog', 'prd_writing', 'spec_defining'].includes(r.status) &&
      !requirementIdsWithSpec.has(r.id)
    );
    const candidatePrds = allPrds.filter((p) => p.requirementId === selectedRequirementId);
    return (
      <div className="w-full space-y-6">
        <section className="w-full">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/specification')}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">新建规格说明书</h1>
              <p className="text-sm text-muted-foreground mt-1">按需求主线创建：需求 → PRD → 规格</p>
            </div>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>选择需求并创建规格</CardTitle>
            <CardDescription>先选需求，再选择该需求下的 PRD，系统将创建对应规格草稿。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>需求</Label>
              <select
                className="w-full p-2 border rounded-md bg-card"
                value={selectedRequirementId}
                onChange={(e) => setSelectedRequirementId(e.target.value)}
              >
                <option value="">请选择需求</option>
                {candidateRequirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.id})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>关联 PRD</Label>
              <select
                className="w-full p-2 border rounded-md bg-card"
                value={selectedPrdId}
                onChange={(e) => setSelectedPrdId(e.target.value)}
                disabled={!selectedRequirementId}
              >
                <option value="">{selectedRequirementId ? '请选择 PRD' : '请先选择需求'}</option>
                {candidatePrds.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.title || p.id)} ({p.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="pt-2">
              <Button onClick={() => void createSpecFromRequirement()} disabled={!selectedRequirementId || !selectedPrdId}>
                创建规格
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        .spec-edit-page {
          animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="w-full space-y-6 spec-edit-page">
        {/* Header */}
        <section className="w-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/specification')}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold">编辑规格说明书</h1>
                <p className="text-sm text-muted-foreground">
                  {linkedPrd
                    ? `关联 PRD: ${linkedPrd.title || linkedPrd.id}`
                    : requirement
                      ? `关联需求: ${requirement.title}`
                      : '建议流程：组织编码约束 → FS（参考 PRD）→ TS（参考 FS + 约束）→ CP（参考 FS + TS）'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {getStatusBadge(spec.status)}
              {hasUnsavedChanges && (
                <Badge variant="outline" className="text-amber-600">未保存</Badge>
              )}
              <Button
                variant="outline"
                onClick={() => setShowExportDialog(true)}
              >
                <Download className="mr-2 size-4" />
                导出
              </Button>
              <Button
                variant="secondary"
                onClick={handleSave}
              >
                <Save className="mr-2 size-4" />
                保存
              </Button>
              <Button onClick={() => void handleSubmit()} disabled={submitSpecReviewMutation.isPending}>
                {submitSpecReviewMutation.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 size-4" />
                )}
                {submitSpecReviewMutation.isPending ? '提交中…' : '提交审核'}
              </Button>
            </div>
          </div>
        </section>

        {/* Validation Alert */}
        {jsonError && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>JSON格式错误</AlertTitle>
            <AlertDescription>{jsonError}</AlertDescription>
          </Alert>
        )}

        {/* Main Content */}
        <section className="w-full">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
              <TabsTrigger value="org-constraints" className="flex items-center gap-2">
                <CheckCircle className="size-4" />
                组织编码约束
              </TabsTrigger>
              <TabsTrigger value="functional" className="flex items-center gap-2">
                <Layers className="size-4" />
                功能规格(FS)
              </TabsTrigger>
              <TabsTrigger value="technical" className="flex items-center gap-2">
                <Database className="size-4" />
                技术规格(TS)
              </TabsTrigger>
              <TabsTrigger value="coding-plan" className="flex items-center gap-2">
                <ClipboardList className="size-4" />
                编程计划(CP)
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex items-center gap-2">
                <FileCode className="size-4" />
                Machine-Readable
              </TabsTrigger>
            </TabsList>

            <TabsContent value="org-constraints" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>组织级编码规范</CardTitle>
                  <CardDescription>
                    可勾选多种已启用语言；生成 TS 时会将所选语言的组织约束合并为 org_spec 交给模型。规范来源于组织配置。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>组织名称</Label>
                      <Input value={orgSpecConfig?.orgName ?? '默认组织'} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>语言（可多选）</Label>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-input bg-card p-3">
                        {(orgSpecConfig ? Object.values(orgSpecConfig.languages) : []).map((languageSpec) => (
                          <div key={languageSpec.language} className="flex items-center gap-2">
                            <Checkbox
                              id={`org-lang-${languageSpec.language}`}
                              checked={selectedLanguages.includes(languageSpec.language)}
                              disabled={!languageSpec.enabled}
                              onCheckedChange={(c) =>
                                toggleOrgLanguage(languageSpec.language, c === true)
                              }
                            />
                            <label
                              htmlFor={`org-lang-${languageSpec.language}`}
                              className={`text-sm leading-none ${
                                languageSpec.enabled ? 'cursor-pointer' : 'cursor-not-allowed text-muted-foreground'
                              }`}
                            >
                              {languageSpec.displayName}
                              {!languageSpec.enabled ? '（停用）' : ''}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {orgSpecConfig && resolvedOrgLanguages.length > 0 && (
                    <div className="space-y-6">
                      {resolvedOrgLanguages.map((lang) => {
                        const l = orgSpecConfig.languages[lang];
                        return (
                          <div key={lang} className="space-y-4 rounded-lg border border-border p-4">
                            <p className="text-sm font-medium text-foreground">
                              {l.displayName}
                              <span className="ml-2 font-mono text-xs text-muted-foreground">({lang})</span>
                            </p>
                            <div>
                              <Label>编码风格</Label>
                              <pre className="mt-2 p-3 border rounded-md text-xs font-mono whitespace-pre-wrap">
                                {l.styleGuide.map((item) => `- ${item}`).join('\n')}
                              </pre>
                            </div>
                            <div>
                              <Label>必须遵循</Label>
                              <pre className="mt-2 p-3 border rounded-md text-xs font-mono whitespace-pre-wrap">
                                {l.mustFollow.map((item) => `- ${item}`).join('\n')}
                              </pre>
                            </div>
                            <div>
                              <Label>禁止项</Label>
                              <pre className="mt-2 p-3 border rounded-md text-xs font-mono whitespace-pre-wrap">
                                {l.forbidden.map((item) => `- ${item}`).join('\n')}
                              </pre>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Functional Spec */}
            <TabsContent value="functional" className="mt-6 flex min-h-0 flex-col">
              <Card className="flex min-h-0 flex-1 flex-col border-border shadow-sm">
                <CardHeader className="shrink-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>功能规格（FS）文档</CardTitle>
                      <CardDescription>
                        基于关联 PRD 可一键「AI 生成 FS」；正文为 Markdown，使用「编辑」「预览」切换。
                      </CardDescription>
                      {linkedPrd && (
                        <p className="mt-2 font-mono text-xs text-muted-foreground">
                          PRD ID: {linkedPrd.id}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateSpec({ fsMarkdown: FS_TEMPLATE })}
                      >
                        插入模板
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleGenerateFs}
                        disabled={generatingFs}
                      >
                        {generatingFs ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 size-4" />
                        )}
                        {generatingFs ? '生成中…' : 'AI 生成 FS'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col space-y-3">
                  <Tabs
                    value={fsMdMode}
                    onValueChange={(v) => setFsMdMode(v as 'edit' | 'preview')}
                    className="flex min-h-0 flex-1 flex-col gap-0"
                  >
                    <TabsList className="grid w-full max-w-md shrink-0 grid-cols-2">
                      <TabsTrigger value="edit" className="gap-2">
                        <PencilLine className="size-4 shrink-0" />
                        编辑
                      </TabsTrigger>
                      <TabsTrigger value="preview" className="gap-2">
                        <BookOpen className="size-4 shrink-0" />
                        预览
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent
                      value="edit"
                      className="mt-3 flex min-h-0 flex-1 flex-col space-y-2 data-[state=inactive]:hidden"
                    >
                      <p className="shrink-0 text-xs text-muted-foreground">
                        源码编辑（Markdown）；AI 流式生成时内容会实时出现在此框。
                      </p>
                      <Textarea
                        value={generatingFs ? fsStreamText : (spec.fsMarkdown ?? '')}
                        onChange={(e) => updateSpec({ fsMarkdown: e.target.value })}
                        readOnly={generatingFs}
                        placeholder="在此编辑 FS，或点击「AI 生成 FS」基于 PRD 自动生成…"
                        className="min-h-0 flex-1 resize-none font-mono text-sm leading-relaxed md:min-h-[calc(100svh-22rem)]"
                        spellCheck={false}
                      />
                      {generatingFs && fsStreamText === '' && (
                        <p className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" /> 正在流式输出…
                        </p>
                      )}
                    </TabsContent>
                    <TabsContent
                      value="preview"
                      className="mt-3 flex min-h-0 flex-1 flex-col space-y-2 data-[state=inactive]:hidden"
                    >
                      <p className="shrink-0 text-xs text-muted-foreground">渲染预览（只读）；修订请切回「编辑」</p>
                      <ScrollArea className="min-h-[280px] w-full flex-1 rounded-md border border-border bg-card md:min-h-[calc(100svh-22rem)]">
                        <div className="p-4 pr-5 text-sm text-foreground [&_.streamdown]:max-w-none">
                          {(generatingFs ? fsStreamText : (spec.fsMarkdown ?? ''))?.trim() ? (
                            <Streamdown className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-headings:scroll-mt-4 prose-p:leading-relaxed prose-li:my-0.5 prose-table:text-sm">
                              {generatingFs ? fsStreamText : (spec.fsMarkdown ?? '')}
                            </Streamdown>
                          ) : (
                            <p className="py-8 text-center text-sm text-muted-foreground">暂无内容</p>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Technical Spec */}
            <TabsContent value="technical" className="mt-6 flex min-h-0 flex-col">
              <Card className="flex min-h-0 flex-1 flex-col border-border shadow-sm">
                <CardHeader className="shrink-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>技术规格（TS）文档</CardTitle>
                      <CardDescription>
                        在「组织编码约束」中选定语言后，可「AI 生成 TS」；正文为 Markdown，使用「编辑」「预览」切换。
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateSpec({ tsMarkdown: TS_TEMPLATE })}
                      >
                        插入模板
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleGenerateTs}
                        disabled={generatingTs}
                      >
                        {generatingTs ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 size-4" />
                        )}
                        {generatingTs ? '生成中…' : 'AI 生成 TS'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col space-y-3">
                  <Tabs
                    value={tsMdMode}
                    onValueChange={(v) => setTsMdMode(v as 'edit' | 'preview')}
                    className="flex min-h-0 flex-1 flex-col gap-0"
                  >
                    <TabsList className="grid w-full max-w-md shrink-0 grid-cols-2">
                      <TabsTrigger value="edit" className="gap-2">
                        <PencilLine className="size-4 shrink-0" />
                        编辑
                      </TabsTrigger>
                      <TabsTrigger value="preview" className="gap-2">
                        <BookOpen className="size-4 shrink-0" />
                        预览
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent
                      value="edit"
                      className="mt-3 flex min-h-0 flex-1 flex-col space-y-2 data-[state=inactive]:hidden"
                    >
                      <p className="shrink-0 text-xs text-muted-foreground">
                        源码编辑（Markdown）；需先完成 FS 正文再生成 TS；流式生成时内容实时出现在此框。
                      </p>
                      <Textarea
                        value={generatingTs ? tsStreamText : (spec.tsMarkdown ?? '')}
                        onChange={(e) => updateSpec({ tsMarkdown: e.target.value })}
                        readOnly={generatingTs}
                        placeholder="在此编辑 TS，需先完成 FS 正文，再点击「AI 生成 TS」…"
                        className="min-h-0 flex-1 resize-none font-mono text-sm leading-relaxed md:min-h-[calc(100svh-22rem)]"
                        spellCheck={false}
                      />
                      {generatingTs && tsStreamText === '' && (
                        <p className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" /> 正在流式输出…
                        </p>
                      )}
                    </TabsContent>
                    <TabsContent
                      value="preview"
                      className="mt-3 flex min-h-0 flex-1 flex-col space-y-2 data-[state=inactive]:hidden"
                    >
                      <p className="shrink-0 text-xs text-muted-foreground">渲染预览（只读）；修订请切回「编辑」</p>
                      <ScrollArea className="min-h-[280px] w-full flex-1 rounded-md border border-border bg-card md:min-h-[calc(100svh-22rem)]">
                        <div className="p-4 pr-5 text-sm text-foreground [&_.streamdown]:max-w-none">
                          {(generatingTs ? tsStreamText : (spec.tsMarkdown ?? ''))?.trim() ? (
                            <Streamdown className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-headings:scroll-mt-4 prose-p:leading-relaxed prose-li:my-0.5 prose-table:text-sm">
                              {generatingTs ? tsStreamText : (spec.tsMarkdown ?? '')}
                            </Streamdown>
                          ) : (
                            <p className="py-8 text-center text-sm text-muted-foreground">暂无内容</p>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="coding-plan" className="mt-6 flex min-h-0 flex-col">
              <Card className="flex min-h-0 flex-1 flex-col border-border shadow-sm">
                <CardHeader className="shrink-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>编程计划（CP）</CardTitle>
                      <CardDescription>
                        基于 FS 与 TS 生成可交给 Cursor、Claude Code 等工具按任务执行的 Markdown 计划（风格同仓库根{' '}
                        <span className="font-mono">plan.md</span>）；亦可插入模板后手工调整。
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateSpec({ cpMarkdown: CP_TEMPLATE })}
                      >
                        插入模板
                      </Button>
                      <Button type="button" size="sm" onClick={handleGenerateCp} disabled={generatingCp}>
                        {generatingCp ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 size-4" />
                        )}
                        {generatingCp ? '生成中…' : 'AI 生成 CP'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col space-y-3">
                  <Tabs
                    value={cpMdMode}
                    onValueChange={(v) => setCpMdMode(v as 'edit' | 'preview')}
                    className="flex min-h-0 flex-1 flex-col gap-0"
                  >
                    <TabsList className="grid w-full max-w-md shrink-0 grid-cols-2">
                      <TabsTrigger value="edit" className="gap-2">
                        <PencilLine className="size-4 shrink-0" />
                        编辑
                      </TabsTrigger>
                      <TabsTrigger value="preview" className="gap-2">
                        <BookOpen className="size-4 shrink-0" />
                        预览
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent
                      value="edit"
                      className="mt-3 flex min-h-0 flex-1 flex-col space-y-2 data-[state=inactive]:hidden"
                    >
                      <p className="shrink-0 text-xs text-muted-foreground">
                        与流水线的「生成下载包」「上传到 Git」中的 <span className="font-mono">plan.md</span> 对应；需已具备 FS、TS 正文。
                      </p>
                      <Textarea
                        value={generatingCp ? cpStreamText : (spec.cpMarkdown ?? '')}
                        onChange={(e) => updateSpec({ cpMarkdown: e.target.value })}
                        readOnly={generatingCp}
                        placeholder="在此编辑编程计划（Markdown），或点击「AI 生成 CP」…"
                        className="min-h-0 flex-1 resize-none font-mono text-sm leading-relaxed md:min-h-[calc(100svh-22rem)]"
                        spellCheck={false}
                      />
                      {generatingCp && cpStreamText === '' && (
                        <p className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" /> 正在流式输出…
                        </p>
                      )}
                    </TabsContent>
                    <TabsContent
                      value="preview"
                      className="mt-3 flex min-h-0 flex-1 flex-col space-y-2 data-[state=inactive]:hidden"
                    >
                      <p className="shrink-0 text-xs text-muted-foreground">渲染预览（只读）；修订请切回「编辑」</p>
                      <ScrollArea className="min-h-[280px] w-full flex-1 rounded-md border border-border bg-card md:min-h-[calc(100svh-22rem)]">
                        <div className="p-4 pr-5 text-sm text-foreground [&_.streamdown]:max-w-none">
                          {(generatingCp ? cpStreamText : (spec.cpMarkdown ?? ''))?.trim() ? (
                            <Streamdown className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-headings:scroll-mt-4 prose-p:leading-relaxed prose-li:my-0.5 prose-table:text-sm">
                              {generatingCp ? cpStreamText : (spec.cpMarkdown ?? '')}
                            </Streamdown>
                          ) : (
                            <p className="py-8 text-center text-sm text-muted-foreground">暂无内容</p>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Machine-Readable Preview */}
            <TabsContent value="preview" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Machine-Readable JSON</CardTitle>
                      <CardDescription>AI可读取的标准化规格格式</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={validateJson}
                        disabled={isValidating}
                      >
                        {isValidating ? '验证中...' : '验证格式'}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={detectConflict}
                        disabled={isDetectingConflict}
                      >
                        <Wand2 className="mr-2 size-4" />
                        {isDetectingConflict ? '检测中...' : 'AI预评审'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px] w-full rounded-md border">
                    <pre className="p-4 text-sm font-mono">
                      {spec.machineReadableJson || JSON.stringify({
                        fsMarkdown: spec.fsMarkdown ?? '',
                        tsMarkdown: spec.tsMarkdown ?? '',
                        cpMarkdown: spec.cpMarkdown ?? '',
                        functionalSpec: spec.functionalSpec,
                        technicalSpec: spec.technicalSpec,
                        organizationCodingSpec: organizationCodingSpecPayload,
                      }, null, 2)}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        {/* Conflict Detection Dialog */}
        <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>AI预评审结果</DialogTitle>
              <DialogDescription>检测技术规格与现有系统的逻辑冲突</DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[400px] w-full mt-4">
              <div className="prose prose-sm max-w-none">
                {conflictResult ? (
                  <Streamdown>{conflictResult}</Streamdown>
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CheckCircle className="size-6 text-green-500" />
                      </EmptyMedia>
                      <EmptyTitle>未检测到冲突</EmptyTitle>
                      <EmptyDescription>技术规格与现有系统架构兼容</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button onClick={() => setShowConflictDialog(false)}>关闭</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Export Dialog */}
        <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>导出规格说明书</DialogTitle>
              <DialogDescription>将规格导出为Machine-Readable JSON格式</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                导出的文件包含完整的功能规格和技术规格，可直接用于AI代码生成。
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowExportDialog(false)}>取消</Button>
              <Button onClick={handleExport}>
                <Download className="mr-2 size-4" />
                下载JSON
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default SpecEditPage;