'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label, RequiredMark } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { ExternalLink, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { RdPageModuleHeading } from '@/components/rd-page-module-heading';
import { cn } from '@/lib/utils';

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
      toast.error(e instanceof Error ? e.message : '加载产品列表失败');
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
      toast.error(e instanceof Error ? e.message : '保存失败');
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
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const UrlCell = ({ url }: { url?: string }) => {
    const t = (url || '').trim();
    if (!t) return <span className="text-muted-foreground">—</span>;
    const href = hrefWithProtocol(t);
    const display = t.length > 32 ? `${t.slice(0, 30)}…` : t;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-[200px] items-center gap-1 truncate font-mono text-sm text-primary hover:underline"
        title={t}
      >
        <span className="truncate">{display}</span>
        <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </a>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="rd-page-header-lead">
          <RdPageModuleHeading
            icon={Package}
            title="产品主数据"
            description="维护产品线与部署、仓库等元数据"
          />
        </div>
        <Button type="button" className="shrink-0 gap-2" onClick={openCreate}>
          <Plus className="size-4" />
          新增产品
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/40">
            <Package className="size-5 text-primary" />
          </div>
          <CardTitle className="text-base">产品列表</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无产品，点击「新增产品」创建。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    产品编码
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    产品标识
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    产品名称
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    产品负责人
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    技术经理
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    产品类型
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    沙箱
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    生产
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Git
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    更新于
                  </TableHead>
                  <TableHead className="w-[100px] text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id} className="border-border">
                    <TableCell className="max-w-[120px] font-mono text-sm">
                      {p.code?.trim() ? (
                        <span title={p.code}>{p.code}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[140px] font-mono text-sm">
                      {p.identifier?.trim() ? (
                        <span title={p.identifier}>{p.identifier}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <div className="font-medium text-foreground">{p.name}</div>
                      {p.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{p.owner?.trim() || '—'}</TableCell>
                    <TableCell className="text-sm">{p.technicalManager?.trim() || '—'}</TableCell>
                    <TableCell className="text-sm">{p.productType?.trim() || '—'}</TableCell>
                    <TableCell>
                      <UrlCell url={p.sandboxUrl} />
                    </TableCell>
                    <TableCell>
                      <UrlCell url={p.productionUrl} />
                    </TableCell>
                    <TableCell>
                      <UrlCell url={p.gitUrl} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(p.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEdit(p)}
                          aria-label="编辑"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(p)}
                          aria-label="删除"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
        <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 pt-6 pb-4 text-left">
            <DialogTitle>{editingId ? '编辑产品' : '新增产品'}</DialogTitle>
            <DialogDescription>
              填写基础标识、职责分工与类型，并维护沙箱、生产与 Git 仓库地址，便于流水线一键带入。
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-5">
            <section
              className={cn(
                'space-y-4 rounded-lg border border-border bg-muted/20 p-4',
                'shadow-sm',
              )}
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
                    className="rd-input-glass font-mono text-sm"
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
                    className="rd-input-glass font-mono text-sm"
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
                    className="rd-input-glass"
                  />
                </div>
              </div>
            </section>

            <section
              className="space-y-4 rounded-lg border border-border bg-muted/20 p-4 shadow-sm"
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
                    className="rd-input-glass"
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
                    className="rd-input-glass"
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
                    className="rd-input-glass"
                  />
                </div>
              </div>
            </section>

            <section
              className="space-y-3 rounded-lg border border-border bg-muted/20 p-4 shadow-sm"
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
                  className="min-h-[88px] rd-input-glass"
                />
              </div>
            </section>

            <section
              className="space-y-4 rounded-lg border border-border bg-muted/20 p-4 shadow-sm"
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
                    className="rd-input-glass font-mono text-sm"
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
                    className="rd-input-glass font-mono text-sm"
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
                    className="rd-input-glass font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    与流水线默认 PAT 认证一致时，请填写以 <code className="font-mono text-[11px]">https://</code> 开头的克隆地址。
                  </p>
                </div>
              </div>
            </section>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background px-6 py-4 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? '保存中…' : editingId ? '保存更改' : '创建产品'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除产品？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除「{deleteTarget?.name}」，此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
