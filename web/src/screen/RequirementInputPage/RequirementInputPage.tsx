'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { capabilityClient } from '@/lib/capability-client';
import { toast } from 'sonner';
import { format, addDays, startOfDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label, RequiredMark } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Bot,
  CalendarIcon,
  Save,
  Send,
  Sparkles,
  Loader2,
  ChevronsUpDown,
  Check,
  Coins,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IRequirement, IUser, IProduct } from '@/lib/rd-types';
import { authApi } from '@/lib/auth-api';
import { useUpsertRequirement } from '@/lib/rd-hooks';
import { rdAuditCreate } from '@/lib/rd-actor';
import { rdApi } from '@/lib/rd-api';
import {
  ACCESS_ROLE_PM,
  ACCESS_ROLE_TM,
  userHasBuiltinAccessRole,
} from '@/lib/requirement-claim';

const PRIORITY_OPTIONS = [
  { value: 'P0', label: 'P0 - 最高优先级', color: 'bg-red-500' },
  { value: 'P1', label: 'P1 - 高优先级', color: 'bg-orange-500' },
  { value: 'P2', label: 'P2 - 中优先级', color: 'bg-blue-500' },
  { value: 'P3', label: 'P3 - 低优先级', color: 'bg-slate-500' },
];

const PRIORITY_BOUNTY_MAP: Record<string, number> = {
  P0: 200,
  P1: 88,
  P2: 48,
  P3: 20,
};

const STORAGE_KEY = '__global_rd_requirement_draft';

const defaultExpectedDate = () => addDays(startOfDay(new Date()), 7);

function newProductId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `prod_${crypto.randomUUID()}`;
  }
  return `prod_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

type RequirementOptimizeStreamChunk = { content?: string };

function difficultyFromCoins(coins: number): 'normal' | 'hard' | 'epic' {
  if (coins >= 201) return 'epic';
  if (coins >= 81) return 'hard';
  return 'normal';
}

const RequirementInputPage: React.FC = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const userInfo = useCurrentUserProfile();
  const upsertRequirement = useUpsertRequirement();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expectedDate, setExpectedDate] = useState<Date>(() => defaultExpectedDate());
  const [priority, setPriority] = useState<string>('P1');
  const [product, setProduct] = useState('');
  const [pmCandidateUserId, setPmCandidateUserId] = useState<string>('');
  const [tmCandidateUserId, setTmCandidateUserId] = useState<string>('');
  const [users, setUsers] = useState<IUser[]>([]);
  const [products, setProducts] = useState<IProduct[]>([]);
  const [productComboOpen, setProductComboOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [rewardCoins, setRewardCoins] = useState<number[]>([PRIORITY_BOUNTY_MAP.P1]);
  const [syncBounty, setSyncBounty] = useState(true);
  const [bountyEdited, setBountyEdited] = useState(false);

  const recommendedBounty = PRIORITY_BOUNTY_MAP[priority] ?? PRIORITY_BOUNTY_MAP.P1;
  const bountyPoints = rewardCoins[0] || 0;
  const difficultyLabel =
    bountyPoints >= 201
      ? '史诗（推荐 201+）'
      : bountyPoints >= 81
        ? '困难（推荐 81-200）'
        : '普通（推荐 20-80）';

  useEffect(() => {
    if (!bountyEdited) {
      setRewardCoins([recommendedBounty]);
    }
  }, [recommendedBounty, bountyEdited]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  const pmUsers = useMemo(() => {
    const seen = new Set<string>();
    return users.filter((u) => {
      if (!userHasBuiltinAccessRole(ACCESS_ROLE_PM, u.accessRoleIds, u.accessRoleId)) return false;
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
  }, [users]);

  const tmUsers = useMemo(() => {
    const seen = new Set<string>();
    return users.filter((u) => {
      if (!userHasBuiltinAccessRole(ACCESS_ROLE_TM, u.accessRoleIds, u.accessRoleId)) return false;
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
  }, [users]);

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
    const plain = description.trim();
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

      setDescription(optimized);
      toast.success('AI 优化完成', { description: '已用优化后的描述替换编辑器内容' });
      setShowAiAssistant(false);
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
      syncBounty,
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
      const draftBounty = Number(draft.bountyPoints);
      if (Number.isFinite(draftBounty) && draftBounty >= 20) {
        setRewardCoins([Math.floor(draftBounty)]);
        setBountyEdited(true);
      } else {
        setRewardCoins([PRIORITY_BOUNTY_MAP[draft.priority || 'P1'] ?? PRIORITY_BOUNTY_MAP.P1]);
        setBountyEdited(false);
      }
      setSyncBounty(draft.syncBounty !== false);
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
      status: 'active',
      ...rdAuditCreate(),
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
    const bounty = syncBounty ? bountyPoints : 0;

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
        ...rdAuditCreate(),
      };

      await upsertRequirement.mutateAsync(requirement);

      if (syncBounty && bounty > 0) {
        try {
          const actor = userInfo.user_id?.trim() || requirement.submitter;
          await rdApi.createBountyTask({
            requirementId: requirement.id,
            publisherId: actor,
            publisherName: userInfo.name || userInfo.userName || actor,
            title: requirement.title,
            description: requirement.description,
            rewardCoins: bounty,
            difficultyTag: difficultyFromCoins(bounty),
            deadlineAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
          });
          void queryClient.invalidateQueries({ queryKey: ['rd', 'site-messages'] });
        } catch {
          toast.warning('需求已提交，但同步发布悬赏失败', {
            description: '你可以稍后前往「赏金猎场」手动发布悬赏任务',
          });
        }
      }

      sessionStorage.removeItem(STORAGE_KEY);

      toast.success('需求提交成功');
      router.push('/requirements');
    } catch {
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

      <div className="requirement-input-page w-full space-y-6">
        <section className="w-full">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="rd-page-title">需求采集</h1>
              <p className="rd-page-desc mt-1">
                提交业务需求；可使用 AI 将描述优化为更清晰的执行级表述
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 h-auto px-0 text-muted-foreground hover:text-foreground"
                onClick={() => router.push('/requirements')}
              >
                返回需求列表
              </Button>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {/* <Button type="button" variant="outline" onClick={() => setShowAiAssistant(true)}>
                <Sparkles className="mr-2 h-4 w-4" />
                AI助手
              </Button> */}
              <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={!title && !description}>
                <Save className="mr-2 h-4 w-4" />
                保存
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {isSubmitting ? '提交中...' : '提交需求'}
              </Button>
            </div>
          </div>
        </section>

        <Dialog open={showAiAssistant} onOpenChange={setShowAiAssistant}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                AI助手
              </DialogTitle>
              <DialogDescription>
                基于已填写的需求描述，将其优化为更清晰、可执行的表述（与「需求描述」旁的「AI优化」相同）。请先写好需求描述再开始。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setShowAiAssistant(false)}>
                关闭
              </Button>
              <Button
                type="button"
                onClick={() => void handleAiOptimize()}
                disabled={isAnalyzing || !description.trim()}
              >
                {isAnalyzing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {isAnalyzing ? '优化中...' : '开始优化'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <section className="w-full">
          <Card>
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
              <CardDescription>
                填写需求的基本信息，带 <RequiredMark /> 为必填项
              </CardDescription>
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
                        <CommandGroup heading="产品列表">
                          {filteredProducts.length === 0 ? (
                            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                              {products.length === 0
                                ? '暂无产品，可在下方「未找到匹配产品」中选用输入的名称'
                                : '无匹配结果，请调整搜索或选用新名称'}
                            </div>
                          ) : (
                            filteredProducts.map((p) => (
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
                                  className={cn(
                                    'mr-2 size-4 shrink-0',
                                    product === p.name ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <span className="truncate">{p.name}</span>
                              </CommandItem>
                            ))
                          )}
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
                  需求标题 <RequiredMark />
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
                    需求描述 <RequiredMark />
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAiOptimize}
                    disabled={isAnalyzing || !description.trim()}
                  >
                    {isAnalyzing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    {isAnalyzing ? 'AI 优化中...' : 'AI优化'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">支持 Markdown 格式（标题、列表、表格等）</p>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="请详细描述需求背景、业务场景、期望解决的问题等（支持 Markdown）…"
                  className="min-h-[280px] resize-none font-mono text-sm leading-relaxed md:min-h-[320px]"
                  spellCheck={false}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  期望上线时间 <RequiredMark />
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
                      {pmUsers.map((u) => (
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
                      {tmUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name?.trim() || u.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>
                    业务优先级 <RequiredMark />
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
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                      {(userInfo.name || 'U')[0].toUpperCase()}
                    </div>
                    <span className="text-sm">{userInfo.name || '当前用户'}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5">
                        <Coins className="h-4 w-4 text-amber-500" />
                        金币奖励 <span className="font-mono tabular-nums text-amber-600">{bountyPoints}</span>
                      </span>
                    </div>
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    
                    <Slider
                      min={20}
                      max={300}
                      step={1}
                      value={rewardCoins}
                      onValueChange={(next) => {
                        setRewardCoins(next);
                        setBountyEdited(true);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">难度等级：{difficultyLabel}</p>
                    <p></p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sync-bounty">同步悬赏</Label>
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                    <label htmlFor="sync-bounty" className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        id="sync-bounty"
                        checked={syncBounty}
                        onCheckedChange={(checked) => setSyncBounty(checked === true)}
                      />
                      <span className="text-sm text-foreground">
                        {syncBounty ? '勾选同步发布悬赏令' : '暂不发布悬赏令'}
                      </span>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      勾选同步发布悬赏令，你可以在
                      <span className="mx-1 font-medium text-foreground">[赏金猎场]</span>
                      进行查看
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
};

export default RequirementInputPage;
