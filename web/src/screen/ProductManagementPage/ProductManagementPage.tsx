'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  name: '',
  description: '',
  owner: '',
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
      name: p.name,
      description: p.description,
      owner: p.owner || '',
      sandboxUrl: p.sandboxUrl || '',
      productionUrl: p.productionUrl || '',
      gitUrl: p.gitUrl || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
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
        name,
        description: form.description.trim(),
        owner: form.owner.trim() || undefined,
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
        <div>
          <h1 className="rd-page-title">产品管理</h1>
          <p className="rd-page-desc mt-1">维护产品线与部署、仓库等元数据</p>
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
                    产品名称
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    负责人
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
                    <TableCell className="max-w-[220px]">
                      <div className="font-medium text-foreground">{p.name}</div>
                      {p.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{p.owner?.trim() || '—'}</TableCell>
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
        <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑产品' : '新增产品'}</DialogTitle>
            <DialogDescription>填写产品名称、描述、负责人及各环境地址。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label htmlFor="pm-name">产品名称 *</Label>
              <Input
                id="pm-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如：核心交易平台"
                className="rd-input-glass"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pm-desc">描述</Label>
              <Textarea
                id="pm-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="产品定位、边界说明等"
                className="min-h-[88px] rd-input-glass"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pm-owner">负责人</Label>
              <Input
                id="pm-owner"
                value={form.owner}
                onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                placeholder="姓名或账号"
                className="rd-input-glass"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pm-sandbox">沙箱地址</Label>
              <Input
                id="pm-sandbox"
                value={form.sandboxUrl}
                onChange={(e) => setForm((f) => ({ ...f, sandboxUrl: e.target.value }))}
                placeholder="https://sandbox.example.com"
                className="rd-input-glass font-mono text-sm"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pm-prod">生产地址</Label>
              <Input
                id="pm-prod"
                value={form.productionUrl}
                onChange={(e) => setForm((f) => ({ ...f, productionUrl: e.target.value }))}
                placeholder="https://app.example.com"
                className="rd-input-glass font-mono text-sm"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pm-git">Git 仓库地址</Label>
              <Input
                id="pm-git"
                value={form.gitUrl}
                onChange={(e) => setForm((f) => ({ ...f, gitUrl: e.target.value }))}
                placeholder="https://github.com/org/repo"
                className="rd-input-glass font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? '保存中…' : '保存'}
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
