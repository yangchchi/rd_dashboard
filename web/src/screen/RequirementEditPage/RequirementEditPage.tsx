'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { capabilityClient } from '@/lib/capability-client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TiptapEditorComplete } from '@/components/business-ui/tiptap-editor';
import { CalendarIcon, Save, Sparkles, Loader2, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRequirement, useUpsertRequirement } from '@/lib/rd-hooks';
import type { IRequirement, IUser } from '@/lib/rd-types';
import { authApi } from '@/lib/auth-api';

const PRIORITY_OPTIONS = [
  { value: 'P0', label: 'P0 - 最高优先级', color: 'bg-red-500' },
  { value: 'P1', label: 'P1 - 高优先级', color: 'bg-orange-500' },
  { value: 'P2', label: 'P2 - 中优先级', color: 'bg-blue-500' },
  { value: 'P3', label: 'P3 - 低优先级', color: 'bg-slate-500' },
];

const STATUS_OPTIONS = [
  { value: 'backlog', label: '需求池' },
  { value: 'prd_writing', label: 'PRD编写中' },
  { value: 'spec_defining', label: '规格说明书' },
  { value: 'ai_developing', label: 'AI开发中' },
  { value: 'pending_acceptance', label: '待验收' },
  { value: 'released', label: '已发布' },
];

const getDefaultExpectedDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
};

const RequirementEditPage: React.FC = () => {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const userInfo = useCurrentUserProfile();
  const { data: loadedRequirement, isLoading: isQueryLoading } = useRequirement(id);
  const upsertRequirement = useUpsertRequirement();

  const [requirement, setRequirement] = useState<IRequirement | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expectedDate, setExpectedDate] = useState<Date>(getDefaultExpectedDate());
  const [priority, setPriority] = useState<string>('P1');
  const [status, setStatus] = useState<string>('');
  const [product, setProduct] = useState('');
  const [bountyPoints, setBountyPoints] = useState(0);
  const [pmCandidateUserId, setPmCandidateUserId] = useState('');
  const [tmCandidateUserId, setTmCandidateUserId] = useState('');
  const [users, setUsers] = useState<IUser[]>([]);
  const [aiCategory, setAiCategory] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      toast.error('需求ID不存在');
      router.push('/requirements');
      return;
    }
    if (isQueryLoading) return;
    if (!loadedRequirement) {
      toast.error('未找到该需求');
      router.push('/requirements');
      setIsLoading(false);
      return;
    }
    const found = loadedRequirement;
    setRequirement(found);
    setTitle(found.title);
    setDescription(found.description);
    const parsedExpectedDate = found.expectedDate ? new Date(found.expectedDate) : null;
    setExpectedDate(
      parsedExpectedDate && !Number.isNaN(parsedExpectedDate.getTime())
        ? parsedExpectedDate
        : getDefaultExpectedDate()
    );
    setPriority(found.priority || 'P1');
    setStatus(found.status);
    setProduct(found.product || '');
    setBountyPoints(
      typeof found.bountyPoints === 'number' && Number.isFinite(found.bountyPoints)
        ? Math.max(0, Math.floor(found.bountyPoints))
        : 0
    );
    setAiCategory(found.aiCategory || '');
    setPmCandidateUserId(found.pmCandidateUserId || '');
    setTmCandidateUserId(found.tmCandidateUserId || '');
    setIsLoading(false);
  }, [id, router, loadedRequirement, isQueryLoading]);

  useEffect(() => {
    void authApi
      .listUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  const handleAiClassify = async () => {
    if (!description.trim()) {
      toast.error('请先填写需求描述');
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await capabilityClient
        .load('requirement_classifier_1')
        .call('aiCategorize', { requirement_text: description }) as { categories: string[] };
      
      if (result?.categories && result.categories.length > 0) {
        const category = result.categories[0];
        setAiCategory(category);
        
        const priorityMatch = category.match(/P[0-3]/);
        if (priorityMatch) {
          setPriority(priorityMatch[0]);
        }
        
        toast.success('AI分析完成', { description: `识别为: ${category}` });
      }
    } catch (error) {
      toast.error('AI分析失败', { description: '请稍后重试' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('请填写需求标题');
      return;
    }
    if (!description.trim()) {
      toast.error('请填写需求描述');
      return;
    }
    if (!expectedDate) {
      toast.error('请选择期望上线时间');
      return;
    }
    if (!priority) {
      toast.error('请选择业务优先级');
      return;
    }
    const bounty = Math.max(0, Math.floor(Number(bountyPoints) || 0));

    setIsSaving(true);
    
    try {
      const updatedRequirement: IRequirement = {
        ...requirement!,
        title: title.trim(),
        description: description.trim(),
        product: product.trim() || undefined,
        bountyPoints: bounty,
        pmCandidateUserId: pmCandidateUserId.trim() || undefined,
        tmCandidateUserId: tmCandidateUserId.trim() || undefined,
        priority: priority as 'P0' | 'P1' | 'P2' | 'P3',
        expectedDate: expectedDate.toISOString().split('T')[0],
        status: status as IRequirement['status'],
        aiCategory,
        updatedAt: new Date().toISOString(),
      };

      await upsertRequirement.mutateAsync(updatedRequirement);

      toast.success('需求更新成功');
      router.push(`/requirements/${id}`);
    } catch (error) {
      toast.error('保存失败', { description: '请稍后重试' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!requirement) {
    return null;
  }

  return (
    <>
      <style jsx>{`
        .requirement-edit-page {
          animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="requirement-edit-page w-full max-w-4xl mx-auto">
        <section className="w-full mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">编辑需求</h1>
                <p className="text-muted-foreground mt-1">编辑需求 #{requirement.id}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push(`/requirements/${id}`)}>
                取消
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {isSaving ? '保存中...' : '保存修改'}
              </Button>
            </div>
          </div>
        </section>

        <section className="w-full space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
              <CardDescription>编辑需求的基本信息，带 * 为必填项</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="edit-product">所属产品</Label>
                <Input
                  id="edit-product"
                  placeholder="如：核心平台、数据中台"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                />
              </div>
              {/* 需求标题 */}
              <div className="space-y-2">
                <Label htmlFor="title">
                  需求标题 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="请输入需求标题"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* 需求描述 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    需求描述 <span className="text-destructive">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAiClassify}
                    disabled={isAnalyzing || !description.trim()}
                  >
                    {isAnalyzing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    {isAnalyzing ? 'AI分析中...' : 'AI智能分类'}
                  </Button>
                </div>
                <TiptapEditorComplete
                  value={description}
                  onValueChange={setDescription}
                  placeholder="请详细描述需求背景、业务场景..."
                />
              </div>

              {/* AI分类结果 */}
              {aiCategory && (
                <div className="flex items-center gap-2 p-3 bg-accent rounded-lg">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">AI识别分类:</span>
                  <Badge variant="secondary">{aiCategory}</Badge>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-bounty">金币</Label>
                <Input
                  id="edit-bounty"
                  type="number"
                  min={0}
                  step={1}
                  value={Number.isFinite(bountyPoints) ? bountyPoints : 0}
                  onChange={(e) => {
                    const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                    setBountyPoints(Number.isFinite(v) && v >= 0 ? v : 0);
                  }}
                />
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>产品经理（可选，来源于用户）</Label>
                  <Select
                    value={pmCandidateUserId || '__none__'}
                    onValueChange={(v) => setPmCandidateUserId(v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="不指定" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">不指定（任意产品经理可领取）</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name?.trim() || u.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>技术经理（可选，来源于用户）</Label>
                  <Select
                    value={tmCandidateUserId || '__none__'}
                    onValueChange={(v) => setTmCandidateUserId(v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="不指定" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">不指定（任意技术经理可领取）</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name?.trim() || u.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 期望上线时间 */}
              <div className="space-y-2">
                <Label>
                  期望上线时间 <span className="text-destructive">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !expectedDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {expectedDate ? (
                        format(expectedDate, 'yyyy年MM月dd日', { locale: zhCN })
                      ) : (
                        '选择期望上线时间'
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={expectedDate}
                      onSelect={setExpectedDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* 业务优先级 */}
              <div className="space-y-2">
                <Label>
                  业务优先级 <span className="text-destructive">*</span>
                </Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择业务优先级" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <span className={cn('w-2 h-2 rounded-full', option.color)} />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 需求状态 */}
              <div className="space-y-2">
                <Label>需求状态</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择需求状态" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* 元信息 */}
          <Card>
            <CardHeader>
              <CardTitle>元信息</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">创建时间:</span>
                <span className="ml-2">{format(new Date(requirement.createdAt), 'yyyy-MM-dd HH:mm')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">最后更新:</span>
                <span className="ml-2">{format(new Date(requirement.updatedAt), 'yyyy-MM-dd HH:mm')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">提交人:</span>
                <span className="ml-2">{requirement.submitterName || requirement.submitter}</span>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
};

export default RequirementEditPage;
