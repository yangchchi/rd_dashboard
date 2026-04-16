'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Search, Plus, Filter, FileDown, List, LayoutGrid } from 'lucide-react';
import { UserDisplay } from '@/components/business-ui/user-display';
import { ListRowActionsMenu } from '@/components/business-ui/list-row-actions-menu';
import { RequirementsKanban } from '@/components/business-ui/requirements-kanban';
import { logger } from '@/lib/logger';
import { useDeleteRequirement, useRequirementsList } from '@/lib/rd-hooks';
import type { IRequirement } from '@/lib/rd-types';

// Glassmorphism Dark style status map with crimson red accent
const statusMap: Record<string, { label: string; color: string; textColor: string; bg: string }> = {
  backlog: { label: '需求池', color: '#9CA3AF', textColor: 'text-gray-400', bg: 'bg-gray-500/10' },
  prd_writing: { label: 'PRD编写中', color: '#60A5FA', textColor: 'text-blue-400', bg: 'bg-blue-500/10' },
  spec_defining: { label: '规格说明书', color: '#22D3EE', textColor: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  ai_developing: { label: 'AI开发中', color: '#A78BFA', textColor: 'text-purple-400', bg: 'bg-purple-500/10' },
  pending_acceptance: { label: '待验收', color: '#FB923C', textColor: 'text-orange-400', bg: 'bg-orange-500/10' },
  released: { label: '已发布', color: '#4ADE80', textColor: 'text-green-400', bg: 'bg-green-500/10' },
};

const priorityMap: Record<string, { label: string; color: string; textColor: string; bg: string }> = {
  P0: { label: 'P0', color: '#FF4D4D', textColor: 'text-red-400', bg: 'bg-red-500/10' },
  P1: { label: 'P1', color: '#FB923C', textColor: 'text-orange-400', bg: 'bg-orange-500/10' },
  P2: { label: 'P2', color: '#60A5FA', textColor: 'text-blue-400', bg: 'bg-blue-500/10' },
  P3: { label: 'P3', color: '#9CA3AF', textColor: 'text-gray-400', bg: 'bg-gray-500/10' },
};

type ViewMode = 'kanban' | 'list';

const RequirementsPage: React.FC = () => {
  const router = useRouter();
  const { data: requirements = [], isLoading: loading } = useRequirementsList();
  const deleteRequirement = useDeleteRequirement();
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const filteredRequirements = useMemo(() => {
    return requirements.filter((req) => {
      const matchSearch = searchText
        ? req.title.toLowerCase().includes(searchText.toLowerCase()) ||
          req.description.toLowerCase().includes(searchText.toLowerCase()) ||
          (req.product || '').toLowerCase().includes(searchText.toLowerCase())
        : true;
      const matchStatus = statusFilter !== 'all' ? req.status === statusFilter : true;
      const matchPriority = priorityFilter !== 'all' ? req.priority === priorityFilter : true;
      return matchSearch && matchStatus && matchPriority;
    });
  }, [requirements, searchText, statusFilter, priorityFilter]);

  const handleView = (record: IRequirement) => {
    router.push(`/requirements/${record.id}`);
  };

  const handleEdit = (record: IRequirement) => {
    router.push(`/requirements/${record.id}/edit`);
  };

  const handleDelete = (record: IRequirement) => {
    void deleteRequirement.mutateAsync(record.id);
  };

  const handleBatchExport = () => {
    const selectedData = requirements.filter((item) =>
      selectedRowKeys.includes(item.id)
    );
    logger.info('Export:', selectedData);
  };

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredRequirements.length / pageSize));
  const paginatedRequirements = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRequirements.slice(start, start + pageSize);
  }, [filteredRequirements, page, pageSize]);

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedRowKeys((prev) =>
      checked ? [...prev, id] : prev.filter((k) => k !== id)
    );
  };

  const togglePageRows = (checked: boolean) => {
    const ids = paginatedRequirements.map((r) => r.id);
    setSelectedRowKeys((prev) => {
      if (!checked) {
        return prev.filter((k) => !ids.includes(String(k)));
      }
      const set = new Set([...prev.map(String), ...ids]);
      return Array.from(set);
    });
  };

  const pageAllSelected =
    paginatedRequirements.length > 0 &&
    paginatedRequirements.every((r) => selectedRowKeys.includes(r.id));

  useEffect(() => {
    setPage(1);
  }, [searchText, statusFilter, priorityFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <>
      <div className="flex w-full flex-col gap-6">
        {/* 页头 — 与 PRD 管理页同一结构 */}
        <section className="w-full">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="rd-page-title">需求清单</h1>
              <p className="rd-page-desc mt-1">管理所有需求，支持看板/列表视图、搜索与筛选</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-1">
                <Button
                  type="button"
                  variant={viewMode === 'kanban' ? 'default' : 'ghost'}
                  size="sm"
                  className="rounded-md gap-1.5"
                  onClick={() => setViewMode('kanban')}
                >
                  <LayoutGrid className="h-4 w-4" />
                  看板
                </Button>
                <Button
                  type="button"
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  className="rounded-md gap-1.5"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                  列表
                </Button>
              </div>
              <Button
                onClick={() => router.push('/requirements/new')}
                className="shrink-0 shadow-sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                新建需求
              </Button>
            </div>
          </div>
        </section>

        {/* Filter Card */}
        <section className="w-full">
          <div className="rd-surface-card rd-surface-card-hover px-4 py-4 sm:px-5 sm:py-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex min-w-[280px] flex-1 items-center gap-2">
                <Search className="pointer-events-none absolute left-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索标题、描述或所属产品..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="rd-input-glass h-12 rounded-xl pl-11"
                />
              </div>
              <div className="flex items-center gap-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="rd-select-glass h-12 w-[150px] rounded-xl">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent className="rd-select-content">
                    <SelectItem value="all" className="rd-select-item">全部状态</SelectItem>
                    <SelectItem value="backlog" className="rd-select-item">需求池</SelectItem>
                    <SelectItem value="prd_writing" className="rd-select-item">PRD编写中</SelectItem>
                    <SelectItem value="spec_defining" className="rd-select-item">规格说明书</SelectItem>
                    <SelectItem value="ai_developing" className="rd-select-item">AI开发中</SelectItem>
                    <SelectItem value="pending_acceptance" className="rd-select-item">待验收</SelectItem>
                    <SelectItem value="released" className="rd-select-item">已发布</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="rd-select-glass h-12 w-[130px] rounded-xl">
                    <SelectValue placeholder="全部优先级" />
                  </SelectTrigger>
                  <SelectContent className="rd-select-content">
                    <SelectItem value="all" className="rd-select-item">全部优先级</SelectItem>
                    <SelectItem value="P0" className="rd-select-item">P0 - 最高</SelectItem>
                    <SelectItem value="P1" className="rd-select-item">P1 - 高</SelectItem>
                    <SelectItem value="P2" className="rd-select-item">P2 - 中</SelectItem>
                    <SelectItem value="P3" className="rd-select-item">P3 - 低</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </section>

        {/* 看板 / 列表 */}
        {viewMode === 'kanban' ? (
          <section className="w-full">
            <RequirementsKanban
              filteredRequirements={filteredRequirements}
              isLoading={loading}
              hidePageHeading
            />
          </section>
        ) : null}

        {viewMode === 'list' ? (
        <section className="w-full">
          <div className="rd-surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="rd-list-section-icon">
                  <List className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">需求列表</h2>
                  <p className="text-sm text-muted-foreground">
                    共 <span className="font-bold text-primary">{filteredRequirements.length}</span> 条记录
                  </p>
                </div>
              </div>
              {selectedRowKeys.length > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    已选择 <span className="font-bold text-foreground">{selectedRowKeys.length}</span> 项
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBatchExport}
                    className="rounded-xl border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    批量导出
                  </Button>
                </div>
              )}
            </div>
            <div className="p-0">
              {filteredRequirements.length === 0 && !loading ? (
                <div className="p-12">
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>暂无数据</EmptyTitle>
                      <EmptyDescription>
                        没有找到符合条件的需求，请调整筛选条件或新建需求
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        onClick={() => router.push('/requirements/new')}
                        className="shadow-sm"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        新建需求
                      </Button>
                    </EmptyContent>
                  </Empty>
                </div>
              ) : (
                <div className="overflow-x-auto px-4 pb-5 pt-2 sm:px-5">
                  {loading ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
                  ) : (
                    <>
                      <Table className="min-w-[1280px]">
                        <TableHeader>
                          <TableRow className="border-white/10 hover:bg-transparent">
                            <TableHead className="w-10">
                              <Checkbox
                                checked={pageAllSelected}
                                onCheckedChange={(v) => togglePageRows(!!v)}
                                aria-label="全选当前页"
                              />
                            </TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              需求标题
                            </TableHead>
                            <TableHead className="w-[120px] text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              所属产品
                            </TableHead>
                            <TableHead className="w-[72px] text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              金币
                            </TableHead>
                            <TableHead className="w-[140px] text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              状态
                            </TableHead>
                            <TableHead className="w-[100px] text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              优先级
                            </TableHead>
                            <TableHead className="w-[140px] text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              提交人
                            </TableHead>
                            <TableHead className="w-[140px] text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              产品经理
                            </TableHead>
                            <TableHead className="w-[140px] text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              技术经理
                            </TableHead>
                            <TableHead className="w-[120px] text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              期望时间
                            </TableHead>
                            <TableHead className="w-[120px] text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              操作
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedRequirements.map((record) => {
                            const st = statusMap[record.status];
                            const pr = priorityMap[record.priority];
                            return (
                              <TableRow key={record.id} className="border-white/[0.06]">
                                <TableCell>
                                  <Checkbox
                                    checked={selectedRowKeys.includes(record.id)}
                                    onCheckedChange={(v) => toggleRow(record.id, !!v)}
                                    aria-label="选择行"
                                  />
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <button
                                      type="button"
                                      className="text-left text-sm font-bold text-foreground hover:underline"
                                      onClick={() => handleView(record)}
                                    >
                                      {record.title}
                                    </button>
                                    <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                      {record.description}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm text-muted-foreground">
                                    {record.product || '—'}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className="font-mono text-sm tabular-nums text-foreground">
                                    {record.bountyPoints != null && record.bountyPoints > 0
                                      ? record.bountyPoints
                                      : '—'}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div
                                    className={`inline-flex items-center gap-2 rounded-xl border border-white/5 px-3 py-1.5 ${st.bg}`}
                                  >
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: st.color }}
                                    />
                                    <span className={`text-xs font-bold ${st.textColor}`}>{st.label}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    className={`${pr.bg} ${pr.textColor} rounded-xl border-0 px-3 py-1 text-xs font-bold`}
                                  >
                                    {pr.label}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <UserDisplay value={[record.submitter]} size="small" />
                                </TableCell>
                                <TableCell>
                                  {record.pm ? (
                                    <UserDisplay value={[record.pm]} size="small" />
                                  ) : (
                                    <span className="text-sm text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {record.tm ? (
                                    <UserDisplay value={[record.tm]} size="small" />
                                  ) : (
                                    <span className="text-sm text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm text-muted-foreground">{record.expectedDate}</span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <ListRowActionsMenu
                                    triggerClassName="text-muted-foreground hover:bg-white/10 hover:text-foreground"
                                    onView={() => handleView(record)}
                                    onEdit={() => handleEdit(record)}
                                    onDelete={() => handleDelete(record)}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                        <span>共 {filteredRequirements.length} 条</span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                          >
                            上一页
                          </Button>
                          <span>
                            {page} / {pageCount}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={page >= pageCount}
                            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                          >
                            下一页
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
        ) : null}
      </div>
    </>
  );
};

export default RequirementsPage;
