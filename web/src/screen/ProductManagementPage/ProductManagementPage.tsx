'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label, RequiredMark } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { rdAuditCreate, rdAuditUpdate } from '@/lib/rd-actor';
import { rdApi } from '@/lib/rd-api';
import type { IProduct } from '@/lib/rd-types';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error';
import Link from 'next/link';
import { ExternalLink, Package, Pencil, Plus, Trash2 } from 'lucide-react';

const PRODUCT_PRIMARY_BUTTON =
  'bg-[#6750a4] text-white shadow-none hover:bg-[#5b4694] focus-visible:ring-[#6750a4]/35';

function newProductId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `prod_${crypto.randomUUID()}`;
  }
  return `prod_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function hrefWithProtocol(u: string): string {
  const t = u.trim();
  if (!t) return '#';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

const emptyForm = () => ({
  code: '',
  identifier: '',
  name: '',
  description: '',
  owner: '',
  technicalManager: '',
  productType: '',
  sandboxUrl: '',
  productionUrl: '',
  gitUrl: '',
});

const ProductManagementPage: React.FC = () => {
  const [products, setProducts] = useState<IProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IProduct | null>(null);

  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await rdApi.listProducts();
      setProducts(list);
    } catch (e) {
      toastApiError(e, '加载产品列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (p: IProduct) => {
    setEditingId(p.id);
    setForm({
      code: p.code || '',
      identifier: p.identifier || '',
      name: p.name,
      description: p.description,
      owner: p.owner || '',
      technicalManager: p.technicalManager || '',
      productType: p.productType || '',
      sandboxUrl: p.sandboxUrl || '',
      productionUrl: p.productionUrl || '',
      gitUrl: p.gitUrl || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const identifier = form.identifier.trim();
    if (!identifier) {
      toast.error('请填写产品标识');
      return;
    }
    const name = form.name.trim();
    if (!name) {
      toast.error('请填写产品名称');
      return;
    }
    setSubmitting(true);
    try {
      const id = editingId ?? newProductId();
      const audit = editingId ? rdAuditUpdate() : rdAuditCreate();
      const existing = products.find((p) => p.id === id);
      await rdApi.upsertProduct({
        id,
        code: form.code.trim() || undefined,
        identifier,
        name,
        description: form.description.trim(),
        owner: form.owner.trim() || undefined,
        technicalManager: form.technicalManager.trim() || undefined,
        productType: form.productType.trim() || undefined,
        sandboxUrl: form.sandboxUrl.trim() || undefined,
        productionUrl: form.productionUrl.trim() || undefined,
        gitUrl: form.gitUrl.trim() || undefined,
        status: existing?.status ?? 'active',
        ...audit,
      });
      toast.success(editingId ? '产品已更新' : '产品已创建');
      setDialogOpen(false);
      await load();
    } catch (e) {
      toastApiError(e, '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await rdApi.deleteProduct(deleteTarget.id);
      toast.success('已删除');
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toastApiError(e, '删除失败');
    }
  };

  const UrlCell = ({ label, url }: { label: string; url?: string }) => {
    const t = (url || '').trim();
    if (!t) {
      return (
        <span className="inline-flex h-8 items-center rounded-[16px] bg-[#fffbff] px-3 text-xs text-muted-foreground dark:bg-card/90">
          {label} 未配置
        </span>
      );
    }
    const href = hrefWithProtocol(t);
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 items-center gap-1 rounded-[16px] bg-[#fffbff] px-3 text-xs font-medium text-[#6750a4] hover:bg-[#f1eaf4] dark:bg-card/90"
        title={t}
      >
        <span>{label}</span>
        <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </a>
    );
  };

  return (
    <div className="flex w-full flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.09em] text-muted-foreground">
            Product Master Data
          </p>
          <h1 className="mt-1 text-[34px] font-medium leading-tight tracking-normal text-foreground">
            产品主数据
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            维护产品线、环境地址、仓库与责任人元数据。
          </p>
        </div>
        <Button
          type="button"
          className={`h-10 shrink-0 gap-2 rounded-[20px] px-[18px] text-sm font-bold ${PRODUCT_PRIMARY_BUTTON}`}
          onClick={openCreate}
        >
          <Plus className="size-4" />
          新增产品
        </Button>
      </header>

      <section className="overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,rgba(234,221,255,0.94),rgba(159,242,230,0.52))] p-6 text-[#21005d] shadow-[0_10px_28px_rgba(103,80,164,0.07)]">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { label: '产品总数', value: products.length, note: '当前纳入主数据的产品' },
            { label: '已配置 Git', value: products.filter((p) => p.gitUrl?.trim()).length, note: '可带入交付流水线' },
            { label: '已配置沙箱', value: products.filter((p) => p.sandboxUrl?.trim()).length, note: '可用于验收与联调' },
          ].map((item) => (
            <div key={item.label} className="min-h-24 rounded-2xl bg-white/60 p-4">
              <div className="text-[30px] font-semibold leading-none">{item.value}</div>
              <div className="mt-2 text-[13px] font-bold text-[#21005d]/75">{item.label}</div>
              <div className="mt-1 text-xs leading-snug text-[#21005d]/55">{item.note}</div>
            </div>
          ))}
        </div>
      </section>

      <Card className="overflow-hidden rounded-[24px] border-0 bg-[#fffbff] shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 border-b border-[#e8def8]/70 px-5 py-4 dark:border-border/25">
          <div className="flex size-10 items-center justify-center rounded-[20px] bg-[#eaddff]">
            <Package className="size-5 text-[#6750a4]" />
          </div>
          <div>
            <CardTitle className="text-xl font-semibold tracking-normal">产品列表</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">点击产品名称进入产品 Hub，维护基线与能力目录。</p>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {loading ? (
            <p className="rounded-[22px] bg-[#f5eff7] px-4 py-10 text-center text-sm text-muted-foreground dark:bg-muted">加载中…</p>
          ) : products.length === 0 ? (
            <p className="rounded-[22px] bg-[#f5eff7] px-4 py-10 text-center text-sm text-muted-foreground dark:bg-muted">暂无产品，点击「新增产品」创建。</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {products.map((p) => (
                <article
                  key={p.id}
                  className="flex min-h-[224px] flex-col rounded-[22px] bg-[#f5eff7] p-4 transition-colors hover:bg-[#f1eaf4] dark:bg-muted dark:hover:bg-secondary/35"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {p.code?.trim() || p.identifier?.trim() ? (
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          {p.code?.trim() ? (
                            <span className="rounded-full bg-[#fffbff] px-2.5 py-0.5 font-mono text-xs text-muted-foreground dark:bg-card/90">
                              {p.code}
                            </span>
                          ) : null}
                          {p.identifier?.trim() ? (
                            <span className="rounded-full bg-[#fffbff] px-2.5 py-0.5 font-mono text-xs text-muted-foreground dark:bg-card/90">
                              {p.identifier}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link
                          href={`/products/${encodeURIComponent(p.id)}`}
                          className="min-w-0 truncate text-lg font-semibold text-foreground hover:text-[#6750a4]"
                        >
                          {p.name}
                        </Link>
                        <span className="shrink-0 rounded-[14px] bg-[#eaddff] px-2.5 py-1 text-xs font-medium text-[#6750a4]">
                          {p.productType?.trim() || '未分类'}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-[18px] hover:bg-[#fffbff] dark:hover:bg-card/90"
                        onClick={() => openEdit(p)}
                        aria-label="编辑"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-[18px] text-destructive hover:bg-red-500/10 hover:text-destructive"
                        onClick={() => setDeleteTarget(p)}
                        aria-label="删除"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {p.description?.trim() || '暂无产品描述'}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-muted-foreground">
                    <span>产品负责人：{p.owner?.trim() || '未配置'}</span>
                    <span>技术经理：{p.technicalManager?.trim() || '未配置'}</span>
                    <span>更新：{new Date(p.updatedAt).toLocaleDateString()}</span>
                  </div>

                  <div className="mt-auto flex min-w-0 flex-wrap gap-2 pt-4">
                    <UrlCell label="沙箱" url={p.sandboxUrl} />
                    <UrlCell label="生产" url={p.productionUrl} />
                    <UrlCell label="Git" url={p.gitUrl} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-[24px] border-0 bg-[#fffbff] p-0 shadow-[0_18px_48px_rgba(29,27,32,0.14)] dark:bg-card">
          <DialogHeader className="shrink-0 space-y-2 border-b border-[#e8def8]/70 px-6 pt-6 pb-4 text-left dark:border-border/25">
            <DialogTitle>{editingId ? '编辑产品' : '新增产品'}</DialogTitle>
            <DialogDescription>
              填写基础标识、职责分工与类型，并维护沙箱、生产与 Git 仓库地址，便于流水线一键带入。
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-5">
            <section
              className="space-y-4 rounded-[22px] bg-[#f5eff7] p-4 dark:bg-muted"
              aria-labelledby="pm-section-identity"
            >
              <div className="space-y-1">
                <h3 id="pm-section-identity" className="text-sm font-semibold text-foreground">
                  基础标识
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  编码与标识用于系统内引用；标识创建后请谨慎修改。
                </p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pm-code" className="text-sm font-medium">
                    产品编码
                  </Label>
                  <Input
                    id="pm-code"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="例如：PRD-CORE-001"
                    className="h-11 rounded-[22px] border-0 bg-[#fffbff] font-mono text-sm shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-card/90"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pm-identifier" className="text-sm font-medium">
                    产品标识 <RequiredMark />
                  </Label>
                  <Input
                    id="pm-identifier"
                    value={form.identifier}
                    onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
                    placeholder="例如：core-trading、数据中台-dw"
                    className="h-11 rounded-[22px] border-0 bg-[#fffbff] font-mono text-sm shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-card/90"
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    系统内稳定引用，建议使用小写英文、数字与短横线；与「产品编码」可同时维护。
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pm-name" className="text-sm font-medium">
                    产品名称 <RequiredMark />
                  </Label>
                  <Input
                    id="pm-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="例如：核心交易平台"
                    className="h-11 rounded-[22px] border-0 bg-[#fffbff] shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-card/90"
                  />
                </div>
              </div>
            </section>

            <section
              className="space-y-4 rounded-[22px] bg-[#f5eff7] p-4 dark:bg-muted"
              aria-labelledby="pm-section-roles"
            >
              <div className="space-y-1">
                <h3 id="pm-section-roles" className="text-sm font-semibold text-foreground">
                  职责与分类
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  便于在需求与流水线中展示责任人与产品形态。
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pm-owner" className="text-sm font-medium">
                    产品负责人
                  </Label>
                  <Input
                    id="pm-owner"
                    value={form.owner}
                    onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                    placeholder="姓名或账号"
                    className="h-11 rounded-[22px] border-0 bg-[#fffbff] shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-card/90"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pm-tm" className="text-sm font-medium">
                    技术经理
                  </Label>
                  <Input
                    id="pm-tm"
                    value={form.technicalManager}
                    onChange={(e) => setForm((f) => ({ ...f, technicalManager: e.target.value }))}
                    placeholder="姓名或账号"
                    className="h-11 rounded-[22px] border-0 bg-[#fffbff] shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-card/90"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="pm-type" className="text-sm font-medium">
                    产品类型
                  </Label>
                  <Input
                    id="pm-type"
                    value={form.productType}
                    onChange={(e) => setForm((f) => ({ ...f, productType: e.target.value }))}
                    placeholder="例如：自研业务系统、平台型产品、商业套件"
                    className="h-11 rounded-[22px] border-0 bg-[#fffbff] shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-card/90"
                  />
                </div>
              </div>
            </section>

            <section
              className="space-y-3 rounded-[22px] bg-[#f5eff7] p-4 dark:bg-muted"
              aria-labelledby="pm-section-desc"
            >
              <h3 id="pm-section-desc" className="text-sm font-semibold text-foreground">
                说明
              </h3>
              <div className="space-y-2">
                <Label htmlFor="pm-desc" className="text-sm font-medium">
                  描述
                </Label>
                <Textarea
                  id="pm-desc"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="产品定位、边界说明等"
                  className="min-h-[88px] rounded-[22px] border-0 bg-[#fffbff] shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-card/90"
                />
              </div>
            </section>

            <section
              className="space-y-4 rounded-[22px] bg-[#f5eff7] p-4 dark:bg-muted"
              aria-labelledby="pm-section-env"
            >
              <div className="space-y-1">
                <h3 id="pm-section-env" className="text-sm font-semibold text-foreground">
                  环境与仓库
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  创建流水线时将优先从此处带入沙箱与 Git；建议使用 HTTPS 仓库地址以便 PAT 认证。
                </p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pm-sandbox" className="text-sm font-medium">
                    沙箱环境地址
                  </Label>
                  <Input
                    id="pm-sandbox"
                    value={form.sandboxUrl}
                    onChange={(e) => setForm((f) => ({ ...f, sandboxUrl: e.target.value }))}
                    placeholder="https://sandbox.example.com"
                    className="h-11 rounded-[22px] border-0 bg-[#fffbff] font-mono text-sm shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-card/90"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pm-prod" className="text-sm font-medium">
                    生产环境地址
                  </Label>
                  <Input
                    id="pm-prod"
                    value={form.productionUrl}
                    onChange={(e) => setForm((f) => ({ ...f, productionUrl: e.target.value }))}
                    placeholder="https://app.example.com"
                    className="h-11 rounded-[22px] border-0 bg-[#fffbff] font-mono text-sm shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-card/90"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pm-git" className="text-sm font-medium">
                    Git 仓库地址
                  </Label>
                  <Input
                    id="pm-git"
                    value={form.gitUrl}
                    onChange={(e) => setForm((f) => ({ ...f, gitUrl: e.target.value }))}
                    placeholder="https://github.com/org/repo.git"
                    className="h-11 rounded-[22px] border-0 bg-[#fffbff] font-mono text-sm shadow-none focus-visible:ring-1 focus-visible:ring-[#6750a4] dark:bg-card/90"
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    与流水线默认 PAT 认证一致时，请填写以 <code className="font-mono text-[11px]">https://</code> 开头的克隆地址。
                  </p>
                </div>
              </div>
            </section>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-[#e8def8]/70 bg-[#fffbff] px-6 py-4 sm:justify-end dark:border-border/25 dark:bg-card">
            <Button
              type="button"
              variant="outline"
              className="rounded-[20px] border-0 bg-[#f5eff7] shadow-none hover:bg-[#f1eaf4] dark:bg-muted"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              type="button"
              className={`rounded-[20px] px-4 font-bold ${PRODUCT_PRIMARY_BUTTON}`}
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting ? '保存中…' : editingId ? '保存更改' : '创建产品'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-[24px] border-0 bg-[#fffbff] shadow-[0_18px_48px_rgba(29,27,32,0.14)] dark:bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>删除产品？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除「{deleteTarget?.name}」，此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-[20px] border-0 bg-[#f5eff7] shadow-none hover:bg-[#f1eaf4] dark:bg-muted">取消</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-[20px] bg-destructive text-destructive-foreground shadow-none hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProductManagementPage;
