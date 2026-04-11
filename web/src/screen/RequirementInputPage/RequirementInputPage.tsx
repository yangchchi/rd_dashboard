'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { capabilityClient } from '@/lib/capability-client';
import { toast } from 'sonner';
import { format, addDays, startOfDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { TiptapEditorComplete } from '@/components/business-ui/tiptap-editor';
import { CalendarIcon, Save, Send, Sparkles, Loader2, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IRequirement, IUser, IProduct } from '@/lib/rd-types';
import { authApi } from '@/lib/auth-api';
import { useUpsertRequirement } from '@/lib/rd-hooks';
import { rdApi } from '@/lib/rd-api';

interface IRequirementInputPageProps {}

const PRIORITY_OPTIONS = [
  { value: 'P0', label: 'P0 - 最高优先级', color: 'bg-red-500' },
  { value: 'P1', label: 'P1 - 高优先级', color: 'bg-orange-500' },
  { value: 'P2', label: 'P2 - 中优先级', color: 'bg-blue-500' },
  { value: 'P3', label: 'P3 - 低优先级', color: 'bg-slate-500' },
];

const STORAGE_KEY = '__global_rd_requirement_draft';

const defaultExpectedDate = () => addDays(startOfDay(new Date()), 7);

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function plainTextToTipTapHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const t = text.trim();
  if (!t) return '<p></p>';
  return `<p>${esc(t)}</p>`;
}

function newProductId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `prod_${crypto.randomUUID()}`;
  }
  return `prod_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

type RequirementOptimizeStreamChunk = { content?: string };

const RequirementInputPage: React.FC<IRequirementInputPageProps> = () => {
  const router = useRouter();
  const userInfo = useCurrentUserProfile();
  const upsertRequirement = useUpsertRequirement();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expectedDate, setExpectedDate] = useState<Date>(() => defaultExpectedDate());
  const [priority, setPriority] = useState<string>('P1');
  const [product, setProduct] = useState('');
  const [bountyPoints, setBountyPoints] = useState<number>(0);
  const [pmCandidateUserId, setPmCandidateUserId] = useState<string>('');
  const [tmCandidateUserId, setTmCandidateUserId] = useState<string>('');
  const [users, setUsers] = useState<IUser[]>([]);
  const [products, setProducts] = useState<IProduct[]>([]);
  const [productComboOpen, setProductComboOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  useEffect(() => {
    void authApi
      .listUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    void rdApi
      .listProducts()
      .then(setProducts)
      .catch(() => setProducts([]));
  }, []);

  const handleAiOptimize = async () => {
    const plain = stripHtmlTags(description);
    if (!plain) {
      toast.error('请先填写需求描述');
      return;
    }

    setIsAnalyzing(true);
    try {
      const stream = capabilityClient
        .load('requirement_optimizer_1')
        .callStream<RequirementOptimizeStreamChunk>('textGenerate', {
          requirement_text: plain,
        });

      let full = '';
      for await (const chunk of stream) {
        if (chunk?.content) {
          full += chunk.content;
        }
      }

      const optimized = full.trim();
      if (!optimized) {
        toast.error('未获得优化结果', { description: '请稍后重试' });
        return;
      }

      setDescription(plainTextToTipTapHtml(optimized));
      toast.success('AI 优化完成', { description: '已用优化后的描述替换编辑器内容' });
    } catch {
      toast.error('AI 优化失败', { description: '请稍后重试' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveDraft = () => {
    const draft = {
      title,
      description,
      expectedDate: expectedDate?.toISOString(),
      priority,
      product,
      bountyPoints,
      savedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    toast.success('草稿已保存');
  };

  const handleLoadDraft = () => {
    const draftStr = sessionStorage.getItem(STORAGE_KEY);
    if (draftStr) {
      const draft = JSON.parse(draftStr);
      setTitle(draft.title || '');
      setDescription(draft.description || '');
      setExpectedDate(
        draft.expectedDate ? new Date(draft.expectedDate) : defaultExpectedDate()
      );
      setPriority(draft.priority || 'P1');
      setProduct(draft.product || '');
      setBountyPoints(
        typeof draft.bountyPoints === 'number' && Number.isFinite(draft.bountyPoints)
          ? Math.max(0, Math.floor(draft.bountyPoints))
          : 0
      );
      toast.success('草稿已恢复');
    }
  };

  const resolveProductNameForSave = async (): Promise<string | undefined> => {
    const raw = product.trim();
    if (!raw) return undefined;
    let list = products;
    if (list.length === 0) {
      try {
        list = await rdApi.listProducts();
        setProducts(list);
      } catch {
        list = [];
      }
    }
    const hit = list.find((p) => p.name.trim().toLowerCase() === raw.toLowerCase());
    if (hit) return hit.name;
    await rdApi.upsertProduct({
      id: newProductId(),
      name: raw,
      description: '',
    });
    try {
      const refreshed = await rdApi.listProducts();
      setProducts(refreshed);
    } catch {
      /* ignore */
    }
    return raw;
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('请填写需求标题');
      return;
    }
    if (!stripHtmlTags(description)) {
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

    setIsSubmitting(true);

    try {
      const productResolved = await resolveProductNameForSave();

      const requirement: IRequirement = {
        id: `req_${Date.now()}`,
        title: title.trim(),
        description: description.trim(),
        product: productResolved,
        bountyPoints: bounty,
        pmCandidateUserId: pmCandidateUserId.trim() || undefined,
        tmCandidateUserId: tmCandidateUserId.trim() || undefined,
        priority: priority as 'P0' | 'P1' | 'P2' | 'P3',
        expectedDate: expectedDate.toISOString().split('T')[0],
        status: 'backlog',
        submitter: userInfo.user_id || 'unknown',
        submitterName: userInfo.name || '未知用户',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await upsertRequirement.mutateAsync(requirement);

      sessionStorage.removeItem(STORAGE_KEY);

      toast.success('需求提交成功');
      router.push('/requirements');
    } catch (error) {
      toast.error('提交失败', { description: '请稍后重试' });
    } finally {
      setIsSubmitting(false);
    }
  };

  React.useEffect(() => {
    const draftStr = sessionStorage.getItem(STORAGE_KEY);
    if (draftStr) {
      toast.info('检测到未保存的草稿', {
        action: {
          label: '恢复',
          onClick: handleLoadDraft,
        },
      });
    }
  }, []);

  const showCreateFromSearch =
    productSearch.trim().length > 0 &&
    !products.some((p) => p.name.trim().toLowerCase() === productSearch.trim().toLowerCase());

  return (
    <>
      <style jsx>{`
        .requirement-input-page {
          animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="requirement-input-page w-full max-w-4xl mx-auto">
        <section className="w-full mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="rd-page-title">需求采集</h1>
              <p className="rd-page-desc mt-1">
                提交业务需求；可使用 AI 将描述优化为更清晰的执行级表述
              </p>
            </div>
            <Button variant="outline" onClick={handleSaveDraft} disabled={!title && !description}>
              <Save className="mr-2 h-4 w-4" />
              保存草稿
            </Button>
          </div>
        </section>

        <section className="w-full space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
              <CardDescription>填写需求的基本信息，带 * 为必填项</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>所属产品</Label>
                <Popover
                  open={productComboOpen}
                  onOpenChange={(open) => {
                    setProductComboOpen(open);
                    if (open) setProductSearch('');
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={productComboOpen}
                      className="h-10 w-full justify-between px-3 font-normal"
                    >
                      <span className={cn('truncate', !product && 'text-muted-foreground')}>
                        {product || '搜索或选择已有产品，或直接输入新名称'}
                      </span>
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="搜索产品名称..."
                        value={productSearch}
                        onValueChange={setProductSearch}
                      />
                      <CommandList>
                        <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                          {products.length === 0 && !showCreateFromSearch
                            ? '暂无产品，请在下方输入名称后选用'
                            : '无匹配项'}
                        </CommandEmpty>
                        <CommandGroup heading="产品列表">
                          {filteredProducts.map((p) => (
                            <CommandItem
                              key={p.id}
                              value={p.id}
                              onSelect={() => {
                                setProduct(p.name);
                                setProductComboOpen(false);
                                setProductSearch('');
                              }}
                            >
                              <Check
                                className={cn('mr-2 size-4 shrink-0', product === p.name ? 'opacity-100' : 'opacity-0')}
                              />
                              <span className="truncate">{p.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        {showCreateFromSearch && (
                          <CommandGroup heading="未找到匹配产品">
                            <CommandItem
                              value={`__new__:${productSearch}`}
                              onSelect={() => {
                                setProduct(productSearch.trim());
                                setProductComboOpen(false);
                                setProductSearch('');
                              }}
                            >
                              使用「{productSearch.trim()}」作为产品名称
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  从列表选择或检索；若无匹配项可选用输入的名称，提交需求时将自动创建对应产品。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">
                  需求标题 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="请输入需求标题，简明扼要地描述需求核心"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    需求描述 <span className="text-destructive">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAiOptimize}
                    disabled={isAnalyzing || !stripHtmlTags(description)}
                  >
                    {isAnalyzing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    {isAnalyzing ? 'AI 优化中...' : 'AI优化'}
                  </Button>
                </div>
                <TiptapEditorComplete
                  value={description}
                  onValueChange={setDescription}
                  placeholder="请详细描述您的需求背景、业务场景、期望解决的问题等..."
                />
              </div>

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
                      disabled={(date) => date < startOfDay(new Date())}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bounty">金币</Label>
                <Input
                  id="bounty"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="0"
                  value={Number.isFinite(bountyPoints) ? bountyPoints : 0}
                  onChange={(e) => {
                    const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                    setBountyPoints(Number.isFinite(v) && v >= 0 ? v : 0);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  提交人设定的总金币；产品经理与技术经理各得一半（奇数时 PM 略少）。验收通过并发布后金币才对领取人生效。
                </p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>产品经理（可选，来源于用户）</Label>
                  <Select
                    value={pmCandidateUserId || '__none__'}
                    onValueChange={(v) => setPmCandidateUserId(v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="不指定则任意 PM 可领取" />
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
                      <SelectValue placeholder="不指定则任意 TM 可领取" />
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

              <div className="space-y-2">
                <Label>提交人</Label>
                <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
                    {(userInfo.name || 'U')[0].toUpperCase()}
                  </div>
                  <span className="text-sm">{userInfo.name || '当前用户'}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-3 border-t pt-6">
              <Button variant="outline" onClick={() => router.push('/requirements')}>
                取消
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {isSubmitting ? '提交中...' : '提交需求'}
              </Button>
            </CardFooter>
          </Card>
        </section>
      </div>
    </>
  );
};

export default RequirementInputPage;
