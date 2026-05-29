'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error';
import {
  ArrowLeft,
  ExternalLink,
  Layers,
  ListTodo,
  Package,
  Plus,
  Sparkles,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label, RequiredMark } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { rdApi } from '@/lib/rd-api';
import { useCreateProductBaseline, useProductBaselinesList, useRequirementsList } from '@/lib/rd-hooks';
import type { IProduct, IProductBaseline, IRequirement } from '@/lib/rd-types';
import { getCurrentUser } from '@/lib/auth';
import { formatRequirementChangeBadge } from '@/lib/requirement-change-present';
import { getRequirementStatusPresentation } from '@/lib/requirement-status-present';
import { diffBaselineCapabilities } from '@shared/baseline-capability-diff';

const PRODUCT_PRIMARY_BUTTON =
  'bg-[#6750a4] text-white shadow-none hover:bg-[#5b4694] focus-visible:ring-[#6750a4]/35';

function hrefWithProtocol(u: string): string {
  const t = u.trim();
  if (!t) return '#';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function sortBaselinesNewestFirst(items: IProductBaseline[]): IProductBaseline[] {
  return [...items].sort((a, b) => String(b.frozenAt).localeCompare(String(a.frozenAt)));
}

const ProductDetailPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const productId = typeof params.id === 'string' ? params.id : '';

  const [product, setProduct] = useState<IProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState('');
  const [gitRef, setGitRef] = useState('main');
  const [asBuiltMarkdown, setAsBuiltMarkdown] = useState('');
  const [capDomain, setCapDomain] = useState('');
  const [capName, setCapName] = useState('');
  const [capDescription, setCapDescription] = useState('');
  const [compareBaseId, setCompareBaseId] = useState('');
  const [compareTargetId, setCompareTargetId] = useState('');

  const { data: baselines = [], isLoading: baselinesLoading } = useProductBaselinesList(productId);
  const { data: allRequirements = [] } = useRequirementsList();
  const createBaseline = useCreateProductBaseline(productId);

  const sortedBaselines = useMemo(() => sortBaselinesNewestFirst(baselines), [baselines]);
  const latestBaseline = sortedBaselines[0];

  const productRequirements = useMemo(() => {
    if (!productId) return [];
    return allRequirements.filter(
      (r) =>
        r.productId === productId ||
        (!r.productId && product?.name && r.product?.trim() === product.name.trim()),
    );
  }, [allRequirements, productId, product?.name]);

  const activeRequirements = useMemo(
    () => productRequirements.filter((r) => r.status !== 'released'),
    [productRequirements],
  );

  const latestCapabilities = latestBaseline?.capabilities ?? [];

  const compareDiff = useMemo(() => {
    if (!compareBaseId || !compareTargetId || compareBaseId === compareTargetId) return null;
    const base = sortedBaselines.find((b) => b.id === compareBaseId);
    const target = sortedBaselines.find((b) => b.id === compareTargetId);
    if (!base || !target) return null;
    return diffBaselineCapabilities(base, target);
  }, [compareBaseId, compareTargetId, sortedBaselines]);

  const enhancementHref = useMemo(() => {
    const q = new URLSearchParams({
      productId,
      changeType: 'enhancement',
    });
    if (latestBaseline?.id) q.set('baselineId', latestBaseline.id);
    return `/requirements/new?${q.toString()}`;
  }, [productId, latestBaseline?.id]);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const p = await rdApi.getProduct(productId);
      setProduct(p);
    } catch (e) {
      toastApiError(e, '加载产品失败');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (sortedBaselines.length >= 2 && !compareBaseId && !compareTargetId) {
      setCompareBaseId(sortedBaselines[1].id);
      setCompareTargetId(sortedBaselines[0].id);
    }
  }, [sortedBaselines, compareBaseId, compareTargetId]);

  const handleFreezeBaseline = async () => {
    if (!version.trim() || !gitRef.trim()) {
      toast.error('请填写基线版本与 Git 引用');
      return;
    }
    const capabilities = capName.trim()
      ? [{ domain: capDomain.trim(), name: capName.trim(), description: capDescription.trim() }]
      : [];
    try {
      const user = getCurrentUser();
      await createBaseline.mutateAsync({
        version: version.trim(),
        gitRef: gitRef.trim(),
        gitUrl: product?.gitUrl ?? null,
        asBuiltMarkdown: asBuiltMarkdown.trim(),
        frozenBy: user?.id ?? user?.name ?? null,
        capabilities,
      });
      toast.success('产品基线已冻结');
      setVersion('');
      setCapDomain('');
      setCapName('');
      setCapDescription('');
    } catch (e) {
      toastApiError(e, '冻结基线失败');
    }
  };

  if (!productId) {
    return <p className="w-full text-sm text-muted-foreground">无效的产品 ID</p>;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-[20px] bg-[#f5eff7] text-muted-foreground shadow-none hover:bg-[#f1eaf4] hover:text-foreground dark:bg-muted"
            onClick={() => router.push('/products')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.09em] text-muted-foreground">
              Product Hub
            </p>
            <h1 className="mt-1 truncate text-[34px] font-medium leading-tight tracking-normal text-foreground">
              {product?.name ?? '产品 Hub'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              以产品为锚点查看基线、能力与进行中需求。
            </p>
          </div>
        </div>
        <Button
          type="button"
          className={`h-10 shrink-0 rounded-[20px] px-[18px] text-sm font-bold ${PRODUCT_PRIMARY_BUTTON}`}
          asChild
          disabled={!product}
        >
          <Link href={enhancementHref}>
            <Sparkles className="mr-2 h-4 w-4" />
            新建增强需求
          </Link>
        </Button>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : !product ? (
        <p className="text-sm text-muted-foreground">产品不存在</p>
      ) : (
        <Tabs defaultValue="overview" className="w-full space-y-6">
          <div className="overflow-x-auto rounded-[24px] bg-[#f5eff7] p-1.5 shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
            <TabsList className="inline-flex h-auto min-w-max gap-1.5 bg-transparent p-0">
              {[
                ['overview', '概览'],
                ['capabilities', '能力目录'],
                ['requirements', '产品需求'],
                ['baselines', '基线历史'],
              ].map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-10 rounded-[20px] px-4 text-muted-foreground transition-colors hover:bg-[#fffbff] hover:text-foreground data-[state=active]:bg-[#6750a4] data-[state=active]:text-white data-[state=active]:shadow-[0_6px_14px_rgba(103,80,164,0.22)]"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-4">
            <Card className="overflow-hidden rounded-[24px] border-0 bg-[#fffbff] shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
              <CardHeader className="border-b border-[#e8def8]/70 px-5 py-4 dark:border-border/25">
                <CardTitle className="text-xl font-semibold tracking-normal">产品概览</CardTitle>
                <CardDescription>环境链接与当前默认基线</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 p-5 md:grid-cols-2">
                <OverviewRow label="产品编码" value={product.code || '—'} />
                <OverviewRow label="产品标识" value={product.identifier || '—'} mono />
                <OverviewRow label="产品负责人" value={product.owner || '—'} />
                <OverviewRow label="技术经理" value={product.technicalManager || '—'} />
                <OverviewRow label="产品类型" value={product.productType || '—'} />
                <OverviewRow
                  label="当前基线"
                  value={
                    latestBaseline
                      ? `${latestBaseline.version} (${latestBaseline.gitRef.slice(0, 10)})`
                      : '尚未冻结'
                  }
                  mono={Boolean(latestBaseline)}
                />
                <OverviewLink label="Git 仓库" url={product.gitUrl} />
                <OverviewLink label="沙箱环境" url={product.sandboxUrl} />
                <OverviewLink label="生产环境" url={product.productionUrl} />
                <div className="md:col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">产品描述</p>
                  <p className="text-sm text-foreground">{product.description?.trim() || '—'}</p>
                </div>
              </CardContent>
            </Card>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="基线版本数" value={String(sortedBaselines.length)} />
              <StatCard label="进行中需求" value={String(activeRequirements.length)} />
              <StatCard label="能力条目（最新基线）" value={String(latestCapabilities.length)} />
            </div>
          </TabsContent>

          <TabsContent value="capabilities" className="space-y-4">
            <Card className="overflow-hidden rounded-[24px] border-0 bg-[#fffbff] shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
              <CardHeader className="border-b border-[#e8def8]/70 px-5 py-4 dark:border-border/25">
                <CardTitle className="text-xl font-semibold tracking-normal">能力目录</CardTitle>
                <CardDescription>
                  {latestBaseline
                    ? `来自基线 ${latestBaseline.version}（冻结于 ${new Date(latestBaseline.frozenAt).toLocaleString('zh-CN')}）`
                    : '请先冻结产品基线'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                {latestCapabilities.length === 0 ? (
                  <p className="rounded-[22px] bg-[#f5eff7] px-4 py-10 text-center text-sm text-muted-foreground dark:bg-muted">暂无结构化能力条目</p>
                ) : (
                  <div className="overflow-hidden rounded-[22px] bg-[#f5eff7] dark:bg-muted">
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-[#fffbff]/70 dark:bg-card/70">
                      <TableRow>
                        <TableHead>功能域</TableHead>
                        <TableHead>能力名</TableHead>
                        <TableHead>描述</TableHead>
                        <TableHead>接口引用</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {latestCapabilities.map((c, i) => (
                        <TableRow key={`${c.domain}-${c.name}-${i}`} className="border-[#e8def8]/70 hover:bg-[#fffbff]/70 dark:border-border/25">
                          <TableCell>{c.domain || '—'}</TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="max-w-md text-sm text-muted-foreground">
                            {c.description || '—'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {c.interfaces?.map((x) => x.ref).filter(Boolean).join(', ') || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                  </div>
                )}
                {latestBaseline?.asBuiltMarkdown?.trim() ? (
                  <div className="rounded-[22px] bg-[#f5eff7] p-4 dark:bg-muted">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">As-Built 备注</p>
                    <pre className="whitespace-pre-wrap text-sm font-mono">{latestBaseline.asBuiltMarkdown}</pre>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requirements" className="space-y-4">
            <Card className="overflow-hidden rounded-[24px] border-0 bg-[#fffbff] shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-[#e8def8]/70 px-5 py-4 dark:border-border/25">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl font-semibold tracking-normal">
                    <ListTodo className="h-5 w-5 text-[#6750a4]" />
                    产品需求
                  </CardTitle>
                  <CardDescription>共 {productRequirements.length} 条，其中 {activeRequirements.length} 条进行中</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" className="rounded-[18px] border-0 bg-[#f5eff7] shadow-none hover:bg-[#f1eaf4] dark:bg-muted" asChild>
                  <Link href={enhancementHref}>新建增强需求</Link>
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto p-5">
                {productRequirements.length === 0 ? (
                  <p className="rounded-[22px] bg-[#f5eff7] px-4 py-10 text-center text-sm text-muted-foreground dark:bg-muted">暂无关联需求</p>
                ) : (
                  <div className="overflow-hidden rounded-[22px] bg-[#f5eff7] dark:bg-muted">
                  <Table>
                    <TableHeader className="bg-[#fffbff]/70 dark:bg-card/70">
                      <TableRow>
                        <TableHead>标题</TableHead>
                        <TableHead>变更类型</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>优先级</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productRequirements.map((r) => (
                        <RequirementRow key={r.id} requirement={r} baselines={sortedBaselines} />
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="baselines" className="space-y-6">
            <div className="grid gap-8 lg:grid-cols-2">
              <Card className="overflow-hidden rounded-[24px] border-0 bg-[#fffbff] shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
                <CardHeader className="border-b border-[#e8def8]/70 px-5 py-4 dark:border-border/25">
                  <CardTitle className="flex items-center gap-2 text-xl font-semibold tracking-normal">
                    <Layers className="h-5 w-5 text-[#6750a4]" />
                    冻结新基线
                  </CardTitle>
                  <CardDescription>记录当前能力与 Git 锚点</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>
                        基线版本 <RequiredMark />
                      </Label>
                      <Input className="h-11 rounded-[22px] border-0 bg-[#f5eff7] shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-muted" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="如 v1.2" />
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Git 引用 <RequiredMark />
                      </Label>
                      <Input className="h-11 rounded-[22px] border-0 bg-[#f5eff7] shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-muted" value={gitRef} onChange={(e) => setGitRef(e.target.value)} placeholder="tag 或 commit" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>能力清单备注（Markdown）</Label>
                    <Textarea
                      value={asBuiltMarkdown}
                      onChange={(e) => setAsBuiltMarkdown(e.target.value)}
                      placeholder="如：已有登录、权限、报表等能力…"
                      className="min-h-[100px] rounded-[22px] border-0 bg-[#f5eff7] shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-muted"
                    />
                  </div>
                  <div className="space-y-3 rounded-[22px] bg-[#f5eff7] p-4 dark:bg-muted">
                    <p className="text-xs font-medium text-muted-foreground">可选：添加一条结构化能力</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input className="h-11 rounded-[22px] border-0 bg-[#fffbff] shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-card/90" value={capDomain} onChange={(e) => setCapDomain(e.target.value)} placeholder="功能域" />
                      <Input className="h-11 rounded-[22px] border-0 bg-[#fffbff] shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-card/90" value={capName} onChange={(e) => setCapName(e.target.value)} placeholder="能力名" />
                    </div>
                    <Textarea
                      value={capDescription}
                      onChange={(e) => setCapDescription(e.target.value)}
                      placeholder="能力描述"
                      className="rounded-[22px] border-0 bg-[#fffbff] shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-card/90"
                      rows={2}
                    />
                  </div>
                  <Button type="button" className={`rounded-[20px] px-4 font-bold ${PRODUCT_PRIMARY_BUTTON}`} onClick={() => void handleFreezeBaseline()} disabled={createBaseline.isPending}>
                    <Plus className="mr-2 h-4 w-4" />
                    {createBaseline.isPending ? '冻结中…' : '冻结基线'}
                  </Button>
                </CardContent>
              </Card>

              <Card className="overflow-hidden rounded-[24px] border-0 bg-[#fffbff] shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
                <CardHeader className="border-b border-[#e8def8]/70 px-5 py-4 dark:border-border/25">
                  <CardTitle className="text-xl font-semibold tracking-normal">基线历史</CardTitle>
                  <CardDescription>Brownfield 需求须选择其一</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-5">
                  {baselinesLoading ? (
                    <p className="text-sm text-muted-foreground">加载中…</p>
                  ) : sortedBaselines.length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无基线，请先冻结一版</p>
                  ) : (
                    sortedBaselines.map((bl) => (
                      <div key={bl.id} className="space-y-1 rounded-[20px] bg-[#f5eff7] p-4 dark:bg-muted">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{bl.version}</span>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {bl.gitRef.slice(0, 12)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          冻结于 {new Date(bl.frozenAt).toLocaleString('zh-CN')}
                          {bl.capabilities?.length ? ` · ${bl.capabilities.length} 项能力` : ''}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {sortedBaselines.length >= 2 ? (
              <Card className="overflow-hidden rounded-[24px] border-0 bg-[#fffbff] shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
                <CardHeader className="border-b border-[#e8def8]/70 px-5 py-4 dark:border-border/25">
                  <CardTitle className="text-xl font-semibold tracking-normal">基线版本对比</CardTitle>
                  <CardDescription>对比结构化能力条目的新增与移除</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>基准版本（旧）</Label>
                      <Select value={compareBaseId} onValueChange={setCompareBaseId}>
                        <SelectTrigger className="h-11 rounded-[22px] border-0 bg-[#f5eff7] shadow-none focus:ring-1 focus:ring-[#6750a4] dark:bg-muted">
                          <SelectValue placeholder="选择基线" />
                        </SelectTrigger>
                        <SelectContent>
                          {sortedBaselines.map((bl) => (
                            <SelectItem key={bl.id} value={bl.id}>
                              {bl.version}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>对比版本（新）</Label>
                      <Select value={compareTargetId} onValueChange={setCompareTargetId}>
                        <SelectTrigger className="h-11 rounded-[22px] border-0 bg-[#f5eff7] shadow-none focus:ring-1 focus:ring-[#6750a4] dark:bg-muted">
                          <SelectValue placeholder="选择基线" />
                        </SelectTrigger>
                        <SelectContent>
                          {sortedBaselines.map((bl) => (
                            <SelectItem key={bl.id} value={bl.id}>
                              {bl.version}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {compareDiff ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <DiffList title="新增能力" items={compareDiff.added} emptyText="无新增" tone="added" />
                      <DiffList title="移除能力" items={compareDiff.removed} emptyText="无移除" tone="removed" />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">请选择两个不同版本进行对比</p>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

function OverviewRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[20px] bg-[#f5eff7] p-4 dark:bg-muted">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={mono ? 'text-sm font-mono text-foreground' : 'text-sm text-foreground'}>{value}</p>
    </div>
  );
}

function OverviewLink({ label, url }: { label: string; url?: string }) {
  const href = url?.trim() ? hrefWithProtocol(url) : '';
  return (
    <div className="rounded-[20px] bg-[#f5eff7] p-4 dark:bg-muted">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {href && href !== '#' ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 break-all text-sm text-[#6750a4] hover:underline"
        >
          {url}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">未配置</p>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-[24px] border-0 bg-[#fffbff] shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-[#6750a4]">{value}</p>
      </CardContent>
    </Card>
  );
}

function RequirementRow({
  requirement: r,
  baselines,
}: {
  requirement: IRequirement;
  baselines: IProductBaseline[];
}) {
  const baseline = baselines.find((b) => b.id === r.baselineId);
  const st = getRequirementStatusPresentation(r.status);
  return (
    <TableRow className="border-[#e8def8]/70 hover:bg-[#fffbff]/70 dark:border-border/25">
      <TableCell>
        <Link href={`/requirements/${r.id}`} className="font-medium hover:text-[#6750a4]">
          {r.title}
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {formatRequirementChangeBadge(r, baseline)}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge className={`${st.badgeBg} ${st.textColor} border-0`}>{st.label}</Badge>
      </TableCell>
      <TableCell>{r.priority}</TableCell>
      <TableCell className="text-right">
        <Button type="button" variant="ghost" size="sm" className="rounded-[16px] hover:bg-[#fffbff] dark:hover:bg-card/90" asChild>
          <Link href={`/requirements/${r.id}`}>查看</Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

function DiffList({
  title,
  items,
  emptyText,
  tone,
}: {
  title: string;
  items: { domain?: string; name: string; description?: string }[];
  emptyText: string;
  tone: 'added' | 'removed';
}) {
  return (
    <div className="rounded-[22px] bg-[#f5eff7] p-4 dark:bg-muted">
      <p className="mb-2 text-sm font-medium">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c, i) => (
            <li
              key={`${c.name}-${i}`}
              className={`rounded-md px-2 py-1.5 text-sm ${
                tone === 'added' ? 'bg-green-500/10 text-green-800' : 'bg-red-500/10 text-red-800'
              }`}
            >
              <span className="font-medium">{c.domain ? `${c.domain} / ` : ''}{c.name}</span>
              {c.description ? (
                <p className="mt-0.5 text-xs opacity-80">{c.description}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ProductDetailPage;
