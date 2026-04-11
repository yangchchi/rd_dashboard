'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { capabilityClient } from '@/lib/capability-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Zap,
  Download,
  Wand2,
  X,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Sparkles,
  Loader2
} from 'lucide-react';
import { Streamdown } from '@/components/ui/streamdown';
import { logger } from '@/lib/logger';
import type { IPrd } from '@/lib/mock-data-store';
import { createDefaultOrgSpecConfig } from '@/lib/org-spec-defaults';
import {
  useOrgSpecConfig,
  usePrdsList,
  useRequirementsList,
  usePrd,
  useRequirement,
  useSpec,
  useSubmitSpecReview,
  useUpsertSpec,
} from '@/lib/rd-hooks';
import { toast } from 'sonner';
import { runAiSkillStream } from '@/lib/ai-skill-engine';
import { getAiSkill } from '@/lib/ai-skills';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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

function buildOrgSpecText(cfg: IOrganizationSpecConfig | null, lang: OrgSpecLanguage): string {
  if (!cfg) return '（未配置组织编码约束，请先在组织侧完成配置）';
  const l = cfg.languages[lang];
  return [
    `组织: ${cfg.orgName}`,
    `选用语言: ${l.displayName} (${lang})`,
    `编码风格:\n${l.styleGuide.map((x) => `- ${x}`).join('\n')}`,
    `必须遵循:\n${l.mustFollow.map((x) => `- ${x}`).join('\n')}`,
    `禁止项:\n${l.forbidden.map((x) => `- ${x}`).join('\n')}`,
    `工具链:\n${l.toolchain.map((x) => `- ${x}`).join('\n')}`,
    `测试要求:\n${l.testing.map((x) => `- ${x}`).join('\n')}`,
  ].join('\n\n');
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

  // API编辑状态
  const [editingApi, setEditingApi] = useState<Partial<IApiDef> | null>(null);
  const [showApiDialog, setShowApiDialog] = useState(false);

  // UI组件编辑状态
  const [editingComponent, setEditingComponent] = useState<Partial<IUIComponent> | null>(null);
  const [showComponentDialog, setShowComponentDialog] = useState(false);

  // 交互编辑状态
  const [editingInteraction, setEditingInteraction] = useState<Partial<IInteraction> | null>(null);
  const [showInteractionDialog, setShowInteractionDialog] = useState(false);
  const [orgSpecConfig, setOrgSpecConfig] = useState<IOrganizationSpecConfig | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<OrgSpecLanguage>('typescript');
  const [generatingFs, setGeneratingFs] = useState(false);
  const [generatingTs, setGeneratingTs] = useState(false);
  const [fsStreamText, setFsStreamText] = useState('');
  const [tsStreamText, setTsStreamText] = useState('');
  const [legacyFsOpen, setLegacyFsOpen] = useState(false);
  const [legacyTsOpen, setLegacyTsOpen] = useState(false);
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
      setOrgSpecConfig(loadedOrg as IOrganizationSpecConfig);
      setSelectedLanguage((loadedOrg as IOrganizationSpecConfig).defaultLanguage);
    } else {
      const def = createDefaultOrgSpecConfig();
      setOrgSpecConfig(def);
      setSelectedLanguage(def.defaultLanguage);
    }
  }, [loadedOrg]);

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
      void upsertSpecMutation.mutateAsync(
        spec as Parameters<typeof upsertSpecMutation.mutateAsync>[0]
      );
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

  const updateFunctionalSpec = useCallback((updates: Partial<ISpecification['functionalSpec']>) => {
    setSpec(prev => ({
      ...prev,
      functionalSpec: { ...prev.functionalSpec, ...updates },
      updatedAt: new Date().toISOString()
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateTechnicalSpec = useCallback((updates: Partial<ISpecification['technicalSpec']>) => {
    setSpec(prev => ({
      ...prev,
      technicalSpec: { ...prev.technicalSpec, ...updates },
      updatedAt: new Date().toISOString()
    }));
    setHasUnsavedChanges(true);
  }, []);

  const validateJson = useCallback(() => {
    setIsValidating(true);
    setJsonError(null);
    
    try {
      const machineJson = JSON.stringify({
        fsMarkdown: spec.fsMarkdown ?? '',
        tsMarkdown: spec.tsMarkdown ?? '',
        functionalSpec: spec.functionalSpec,
        technicalSpec: spec.technicalSpec,
        organizationCodingSpec: orgSpecConfig
          ? {
              orgName: orgSpecConfig.orgName,
              language: selectedLanguage,
              constraints: orgSpecConfig.languages[selectedLanguage],
            }
          : null,
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
  }, [spec.fsMarkdown, spec.tsMarkdown, spec.functionalSpec, spec.technicalSpec, orgSpecConfig, selectedLanguage, updateSpec]);

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
      const skill = getAiSkill('fs_auto_generation');
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
      const skill = getAiSkill('ts_auto_generation');
      const orgText = buildOrgSpecText(orgSpecConfig, selectedLanguage);
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
  }, [orgSpecConfig, selectedLanguage, spec.fsMarkdown, updateSpec]);

  const handleSave = useCallback(() => {
    validateJson();
    updateSpec({ status: 'draft' });
    setHasUnsavedChanges(false);
    void upsertSpecMutation.mutateAsync({ ...spec, status: 'draft' } as Parameters<typeof upsertSpecMutation.mutateAsync>[0]);
  }, [spec, validateJson, updateSpec, upsertSpecMutation]);

  const handleSubmit = useCallback(() => {
    validateJson();
    updateSpec({ status: 'reviewing' });
    setHasUnsavedChanges(false);
    void submitSpecReviewMutation.mutateAsync({ specId: spec.id, reviewer: '技术经理' });
  }, [spec, validateJson, updateSpec, submitSpecReviewMutation]);

  const handleExport = useCallback(() => {
    const exportData = {
      version: '1.0',
      exportTime: new Date().toISOString(),
      specification: spec,
      requirement: requirement,
      organizationCodingSpec: orgSpecConfig
        ? {
            orgName: orgSpecConfig.orgName,
            language: selectedLanguage,
            constraints: orgSpecConfig.languages[selectedLanguage],
          }
        : null,
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
  }, [orgSpecConfig, requirement, selectedLanguage, spec]);

  // API管理
  const addApi = useCallback(() => {
    setEditingApi({ path: '', method: 'GET', description: '', requestParams: {}, response: {} });
    setShowApiDialog(true);
  }, []);

  const editApi = useCallback((api: IApiDef, index: number) => {
    setEditingApi({ ...api, _index: index });
    setShowApiDialog(true);
  }, []);

  const saveApi = useCallback(() => {
    if (!editingApi || !editingApi.path) return;
    
    const { _index, ...apiData } = editingApi as IApiDef & { _index?: number };
    const newApis = [...spec.functionalSpec.apis];
    
    if (typeof _index === 'number') {
      newApis[_index] = apiData as IApiDef;
    } else {
      newApis.push(apiData as IApiDef);
    }
    
    updateFunctionalSpec({ apis: newApis });
    setShowApiDialog(false);
    setEditingApi(null);
  }, [editingApi, spec.functionalSpec.apis, updateFunctionalSpec]);

  const deleteApi = useCallback((index: number) => {
    const newApis = spec.functionalSpec.apis.filter((_, i) => i !== index);
    updateFunctionalSpec({ apis: newApis });
  }, [spec.functionalSpec.apis, updateFunctionalSpec]);

  // UI组件管理
  const addComponent = useCallback(() => {
    setEditingComponent({ name: '', type: '', props: {}, events: [] });
    setShowComponentDialog(true);
  }, []);

  const editComponent = useCallback((component: IUIComponent, index: number) => {
    setEditingComponent({ ...component, _index: index });
    setShowComponentDialog(true);
  }, []);

  const saveComponent = useCallback(() => {
    if (!editingComponent || !editingComponent.name) return;
    
    const { _index, ...compData } = editingComponent as IUIComponent & { _index?: number };
    const newComponents = [...spec.functionalSpec.uiComponents];
    
    if (typeof _index === 'number') {
      newComponents[_index] = compData as IUIComponent;
    } else {
      newComponents.push(compData as IUIComponent);
    }
    
    updateFunctionalSpec({ uiComponents: newComponents });
    setShowComponentDialog(false);
    setEditingComponent(null);
  }, [editingComponent, spec.functionalSpec.uiComponents, updateFunctionalSpec]);

  const deleteComponent = useCallback((index: number) => {
    const newComponents = spec.functionalSpec.uiComponents.filter((_, i) => i !== index);
    updateFunctionalSpec({ uiComponents: newComponents });
  }, [spec.functionalSpec.uiComponents, updateFunctionalSpec]);

  // 交互管理
  const addInteraction = useCallback(() => {
    setEditingInteraction({ trigger: '', action: '' });
    setShowInteractionDialog(true);
  }, []);

  const editInteraction = useCallback((interaction: IInteraction, index: number) => {
    setEditingInteraction({ ...interaction, _index: index });
    setShowInteractionDialog(true);
  }, []);

  const saveInteraction = useCallback(() => {
    if (!editingInteraction || !editingInteraction.trigger || !editingInteraction.action) return;
    
    const { _index, ...intData } = editingInteraction as IInteraction & { _index?: number };
    const newInteractions = [...spec.functionalSpec.interactions];
    
    if (typeof _index === 'number') {
      newInteractions[_index] = intData as IInteraction;
    } else {
      newInteractions.push(intData as IInteraction);
    }
    
    updateFunctionalSpec({ interactions: newInteractions });
    setShowInteractionDialog(false);
    setEditingInteraction(null);
  }, [editingInteraction, spec.functionalSpec.interactions, updateFunctionalSpec]);

  const deleteInteraction = useCallback((index: number) => {
    const newInteractions = spec.functionalSpec.interactions.filter((_, i) => i !== index);
    updateFunctionalSpec({ interactions: newInteractions });
  }, [spec.functionalSpec.interactions, updateFunctionalSpec]);

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
    const now = new Date().toISOString();
    const newId = `spec-${Date.now()}`;
    const payload = {
      ...defaultSpec,
      id: newId,
      prdId: selectedPrdId,
      createdAt: now,
      updatedAt: now,
    };
    await upsertSpecMutation.mutateAsync(payload);
    toast.success('规格已创建，请继续完善 FS/TS');
    router.push(`/specification/${newId}/edit`);
  }, [selectedPrdId, selectedRequirementId, upsertSpecMutation, router]);

  if (isCreateMode) {
    const candidateRequirements = allRequirements.filter((r) =>
      ['backlog', 'prd_writing', 'spec_defining'].includes(r.status)
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
                      : '建议流程：组织编码约束 → FS（参考 PRD）→ TS（参考 FS + 约束）'}
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
                保存草稿
              </Button>
              <Button onClick={handleSubmit}>
                <CheckCircle className="mr-2 size-4" />
                提交审核
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
            <TabsList className="grid w-full grid-cols-4">
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
                    请先确认语言与约束；生成 TS 时会将本节作为 org_spec 一并交给模型。规范来源于组织配置。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>组织名称</Label>
                      <Input value={orgSpecConfig?.orgName ?? '默认组织'} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>语言</Label>
                      <select
                        className="w-full p-2 border rounded-md bg-card"
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value as OrgSpecLanguage)}
                      >
                        {(orgSpecConfig ? Object.values(orgSpecConfig.languages) : []).map((languageSpec) => (
                          <option
                            key={languageSpec.language}
                            value={languageSpec.language}
                            disabled={!languageSpec.enabled}
                          >
                            {languageSpec.displayName} {!languageSpec.enabled ? '(停用)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {orgSpecConfig && (
                    <div className="space-y-4">
                      <div>
                        <Label>编码风格</Label>
                        <pre className="mt-2 p-3 border rounded-md text-xs font-mono whitespace-pre-wrap">
                          {orgSpecConfig.languages[selectedLanguage].styleGuide.map((item) => `- ${item}`).join('\n')}
                        </pre>
                      </div>
                      <div>
                        <Label>必须遵循</Label>
                        <pre className="mt-2 p-3 border rounded-md text-xs font-mono whitespace-pre-wrap">
                          {orgSpecConfig.languages[selectedLanguage].mustFollow.map((item) => `- ${item}`).join('\n')}
                        </pre>
                      </div>
                      <div>
                        <Label>禁止项</Label>
                        <pre className="mt-2 p-3 border rounded-md text-xs font-mono whitespace-pre-wrap">
                          {orgSpecConfig.languages[selectedLanguage].forbidden.map((item) => `- ${item}`).join('\n')}
                        </pre>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Functional Spec */}
            <TabsContent value="functional" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>功能规格（FS）文档</CardTitle>
                      <CardDescription>
                        基于关联 PRD 使用 Skill「功能规格（FS）自动生成」生成；格式为强结构化 Markdown，可直接修订。
                      </CardDescription>
                      {linkedPrd && (
                        <p className="text-xs text-muted-foreground mt-2 font-mono">
                          PRD ID: {linkedPrd.id}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
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
                <CardContent className="space-y-3">
                  <Textarea
                    value={generatingFs ? fsStreamText : (spec.fsMarkdown ?? '')}
                    onChange={(e) => updateSpec({ fsMarkdown: e.target.value })}
                    readOnly={generatingFs}
                    placeholder="在此编辑 FS，或点击「AI 生成 FS」基于 PRD 自动生成…"
                    className="min-h-[280px] font-mono text-sm"
                  />
                  {generatingFs && fsStreamText === '' && (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="size-3 animate-spin" /> 正在流式输出…
                    </p>
                  )}
                </CardContent>
              </Card>

              <Collapsible open={legacyFsOpen} onOpenChange={setLegacyFsOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between p-6 text-left hover:bg-accent/30 rounded-t-lg border-b"
                    >
                      <div>
                        <CardTitle className="text-base">结构化条目（可选）</CardTitle>
                        <CardDescription>API / UI / 交互列表，与 Machine-Readable 导出兼容</CardDescription>
                      </div>
                      <ChevronDown className={`size-5 shrink-0 transition-transform ${legacyFsOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="space-y-4 pt-0">
              <Card className="border-0 shadow-none">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>API接口定义</CardTitle>
                      <CardDescription>定义系统对外暴露的API接口规范</CardDescription>
                    </div>
                    <Button onClick={addApi} size="sm">
                      <Plus className="mr-2 size-4" />
                      添加API
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {spec.functionalSpec.apis.length === 0 ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Layers className="size-6 text-muted-foreground" />
                        </EmptyMedia>
                        <EmptyTitle>暂无API定义</EmptyTitle>
                        <EmptyDescription>点击上方按钮添加API接口</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="space-y-3">
                      {spec.functionalSpec.apis.map((api, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 cursor-pointer"
                          onClick={() => editApi(api, index)}
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant={api.method === 'GET' ? 'default' : api.method === 'POST' ? 'secondary' : 'outline'}>
                              {api.method}
                            </Badge>
                            <code className="text-sm font-mono">{api.path}</code>
                            <span className="text-sm text-muted-foreground">{api.description}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteApi(index);
                            }}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>UI组件规范</CardTitle>
                      <CardDescription>定义前端UI组件及其属性</CardDescription>
                    </div>
                    <Button onClick={addComponent} size="sm">
                      <Plus className="mr-2 size-4" />
                      添加组件
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {spec.functionalSpec.uiComponents.length === 0 ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Layers className="size-6 text-muted-foreground" />
                        </EmptyMedia>
                        <EmptyTitle>暂无组件定义</EmptyTitle>
                        <EmptyDescription>点击上方按钮添加UI组件</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {spec.functionalSpec.uiComponents.map((comp, index) => (
                        <div
                          key={index}
                          className="p-4 border rounded-lg hover:bg-accent/50 cursor-pointer"
                          onClick={() => editComponent(comp, index)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{comp.name}</span>
                            <Badge variant="outline">{comp.type}</Badge>
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            事件: {comp.events?.join(', ') || '无'}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteComponent(index);
                            }}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>交互逻辑</CardTitle>
                      <CardDescription>定义用户交互触发的事件响应</CardDescription>
                    </div>
                    <Button onClick={addInteraction} size="sm">
                      <Plus className="mr-2 size-4" />
                      添加交互
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {spec.functionalSpec.interactions.length === 0 ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Zap className="size-6 text-muted-foreground" />
                        </EmptyMedia>
                        <EmptyTitle>暂无交互定义</EmptyTitle>
                        <EmptyDescription>点击上方按钮添加交互逻辑</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="space-y-3">
                      {spec.functionalSpec.interactions.map((int, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 cursor-pointer"
                          onClick={() => editInteraction(int, index)}
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary">{int.trigger}</Badge>
                            <ChevronRight className="size-4 text-muted-foreground" />
                            <span>{int.action}</span>
                            {int.condition && (
                              <Badge variant="outline">条件: {int.condition}</Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteInteraction(index);
                            }}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </TabsContent>

            {/* Technical Spec */}
            <TabsContent value="technical" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>技术规格（TS）文档</CardTitle>
                      <CardDescription>
                        在「组织编码约束」中选定语言后，使用 Skill「技术规格（TS）自动生成」基于 FS + org_spec 生成。
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
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
                <CardContent className="space-y-3">
                  <Textarea
                    value={generatingTs ? tsStreamText : (spec.tsMarkdown ?? '')}
                    onChange={(e) => updateSpec({ tsMarkdown: e.target.value })}
                    readOnly={generatingTs}
                    placeholder="在此编辑 TS，需先完成 FS 正文，再点击「AI 生成 TS」…"
                    className="min-h-[280px] font-mono text-sm"
                  />
                  {generatingTs && tsStreamText === '' && (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="size-3 animate-spin" /> 正在流式输出…
                    </p>
                  )}
                </CardContent>
              </Card>

              <Collapsible open={legacyTsOpen} onOpenChange={setLegacyTsOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between p-6 text-left hover:bg-accent/30 rounded-t-lg border-b"
                    >
                      <div>
                        <CardTitle className="text-base">结构化条目（可选）</CardTitle>
                        <CardDescription>架构说明、数据库 Schema、第三方集成，与导出 JSON 兼容</CardDescription>
                      </div>
                      <ChevronDown className={`size-5 shrink-0 transition-transform ${legacyTsOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="space-y-4 pt-0">
              <Card className="border-0 shadow-none">
                <CardHeader>
                  <CardTitle>系统架构</CardTitle>
                  <CardDescription>描述整体系统架构设计方案</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={spec.technicalSpec.architecture}
                    onChange={(e) => updateTechnicalSpec({ architecture: e.target.value })}
                    placeholder="描述系统架构，包括技术栈、部署方案、服务划分等..."
                    className="min-h-[200px] font-mono"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>数据库Schema</CardTitle>
                  <CardDescription>定义数据表结构和关系（JSON格式）</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={JSON.stringify(spec.technicalSpec.databaseSchema, null, 2)}
                    onChange={(e) => {
                      try {
                        const schema = JSON.parse(e.target.value);
                        updateTechnicalSpec({ databaseSchema: schema });
                        setJsonError(null);
                      } catch {
                        // 允许编辑过程中的语法错误
                        setJsonError('数据库Schema JSON格式错误');
                      }
                    }}
                    placeholder='{"tables": [{"name": "users", "fields": [...]}]}'
                    className="min-h-[300px] font-mono"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>第三方集成</CardTitle>
                  <CardDescription>列出需要集成的第三方服务</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {spec.technicalSpec.thirdPartyIntegrations.map((integration, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={integration}
                          onChange={(e) => {
                            const newIntegrations = [...spec.technicalSpec.thirdPartyIntegrations];
                            newIntegrations[index] = e.target.value;
                            updateTechnicalSpec({ thirdPartyIntegrations: newIntegrations });
                          }}
                          placeholder="第三方服务名称和用途"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const newIntegrations = spec.technicalSpec.thirdPartyIntegrations.filter((_, i) => i !== index);
                            updateTechnicalSpec({ thirdPartyIntegrations: newIntegrations });
                          }}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      onClick={() => {
                        updateTechnicalSpec({
                          thirdPartyIntegrations: [...spec.technicalSpec.thirdPartyIntegrations, '']
                        });
                      }}
                    >
                      <Plus className="mr-2 size-4" />
                      添加集成
                    </Button>
                  </div>
                </CardContent>
              </Card>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
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
                        functionalSpec: spec.functionalSpec,
                        technicalSpec: spec.technicalSpec,
                        organizationCodingSpec: orgSpecConfig
                          ? {
                              orgName: orgSpecConfig.orgName,
                              language: selectedLanguage,
                              constraints: orgSpecConfig.languages[selectedLanguage],
                            }
                          : null,
                      }, null, 2)}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        {/* API Edit Dialog */}
        <Dialog open={showApiDialog} onOpenChange={setShowApiDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{(editingApi as unknown as { _index?: number })?._index !== undefined ? '编辑API' : '添加API'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>请求方法</Label>
                <select
                  className="w-full p-2 border rounded-md"
                  value={editingApi?.method || 'GET'}
                  onChange={(e) => setEditingApi(prev => ({ ...prev, method: e.target.value }))}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>接口路径</Label>
                <Input
                  value={editingApi?.path || ''}
                  onChange={(e) => setEditingApi(prev => ({ ...prev, path: e.target.value }))}
                  placeholder="/api/v1/users"
                />
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Textarea
                  value={editingApi?.description || ''}
                  onChange={(e) => setEditingApi(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="接口功能描述..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowApiDialog(false)}>取消</Button>
              <Button onClick={saveApi}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Component Edit Dialog */}
        <Dialog open={showComponentDialog} onOpenChange={setShowComponentDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{(editingComponent as unknown as { _index?: number })?._index !== undefined ? '编辑组件' : '添加组件'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>组件名称</Label>
                <Input
                  value={editingComponent?.name || ''}
                  onChange={(e) => setEditingComponent(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="UserCard"
                />
              </div>
              <div className="space-y-2">
                <Label>组件类型</Label>
                <Input
                  value={editingComponent?.type || ''}
                  onChange={(e) => setEditingComponent(prev => ({ ...prev, type: e.target.value }))}
                  placeholder="Card / Form / Table"
                />
              </div>
              <div className="space-y-2">
                <Label>事件列表（逗号分隔）</Label>
                <Input
                  value={editingComponent?.events?.join(', ') || ''}
                  onChange={(e) => setEditingComponent(prev => ({ 
                    ...prev, 
                    events: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  }))}
                  placeholder="onClick, onChange, onSubmit"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowComponentDialog(false)}>取消</Button>
              <Button onClick={saveComponent}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Interaction Edit Dialog */}
        <Dialog open={showInteractionDialog} onOpenChange={setShowInteractionDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{(editingInteraction as unknown as { _index?: number })?._index !== undefined ? '编辑交互' : '添加交互'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>触发条件</Label>
                <Input
                  value={editingInteraction?.trigger || ''}
                  onChange={(e) => setEditingInteraction(prev => ({ ...prev, trigger: e.target.value }))}
                  placeholder="点击提交按钮"
                />
              </div>
              <div className="space-y-2">
                <Label>执行动作</Label>
                <Input
                  value={editingInteraction?.action || ''}
                  onChange={(e) => setEditingInteraction(prev => ({ ...prev, action: e.target.value }))}
                  placeholder="调用API提交表单"
                />
              </div>
              <div className="space-y-2">
                <Label>条件（可选）</Label>
                <Input
                  value={editingInteraction?.condition || ''}
                  onChange={(e) => setEditingInteraction(prev => ({ ...prev, condition: e.target.value }))}
                  placeholder="表单验证通过"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowInteractionDialog(false)}>取消</Button>
              <Button onClick={saveInteraction}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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