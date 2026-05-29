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
import { getRequirementStatusPresentation, REQUIREMENT_KANBAN_COLUMNS } from '@/lib/requirement-status-present';
import { formatRequirementChangeBadge } from '@/lib/requirement-change-present';

const priorityMap: Record<string, { label: string; textColor: string; bg: string; dotColor: string }> = {
  P0: { label: 'P0', textColor: 'text-red-700 dark:text-red-400', bg: 'bg-red-500/10', dotColor: 'bg-red-500' },
  P1: { label: 'P1', textColor: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-500/10', dotColor: 'bg-orange-500' },
  P2: { label: 'P2', textColor: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-500/10', dotColor: 'bg-blue-500' },
  P3: { label: 'P3', textColor: 'text-slate-700 dark:text-slate-400', bg: 'bg-slate-500/10', dotColor: 'bg-slate-500' },
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

  const statusCounts = useMemo(
    () => {
      const counts = REQUIREMENT_KANBAN_COLUMNS.reduce(
        (acc, column) => ({ ...acc, [column.status]: 0 }),
        {} as Record<IRequirement['status'], number>,
      );

      filteredRequirements.forEach((req) => {
        counts[req.status] = (counts[req.status] ?? 0) + 1;
      });

      return counts;
    },
    [filteredRequirements],
  );

  const summaryItems = [
    { label: '筛选结果', value: filteredRequirements.length, note: '当前视图范围' },
    { label: '文档阶段', value: statusCounts.prd_writing + statusCounts.spec_defining, note: 'PRD 与规格定义' },
    { label: 'AI交付', value: statusCounts.ai_developing + statusCounts.pending_acceptance, note: '开发与验收中' },
    { label: '已发布', value: statusCounts.released, note: '完成交付' },
  ];

  useEffect(() => {
    setPage(1);
  }, [searchText, statusFilter, priorityFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <>
      <div className="flex w-full flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.09em] text-muted-foreground">
              Requirement Center
            </p>
            <h1 className="mt-1 text-[34px] font-medium leading-tight tracking-normal text-foreground">
              需求中心
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
            <div className="flex rounded-[22px] bg-muted p-1">
              <Button
                type="button"
                variant={viewMode === 'kanban' ? 'default' : 'ghost'}
                size="sm"
                className="gap-1.5 rounded-[18px] px-4 shadow-none"
                onClick={() => setViewMode('kanban')}
              >
                <LayoutGrid className="h-4 w-4" />
                看板
              </Button>
              <Button
                type="button"
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                className="gap-1.5 rounded-[18px] px-4 shadow-none"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
                列表
              </Button>
            </div>
            <Button
              onClick={() => router.push('/requirements/new')}
              className="h-10 shrink-0 rounded-[20px] px-[18px] text-sm font-bold shadow-none"
            >
              <Plus className="mr-2 h-4 w-4" />
              新建需求
            </Button>
          </div>
        </header>

        <section className="overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,rgba(234,221,255,0.94),rgba(159,242,230,0.62))] p-6 text-[#21005d] shadow-[0_10px_28px_rgba(103,80,164,0.07)]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryItems.map((item) => (
              <div key={item.label} className="min-h-24 rounded-2xl bg-white/60 p-4">
                <div className="text-[30px] font-semibold leading-none">{item.value}</div>
                <div className="mt-2 text-[13px] font-bold text-[#21005d]/75">{item.label}</div>
                <div className="mt-1 text-xs leading-snug text-[#21005d]/55">{item.note}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Filter Card */}
        <section className="w-full">
          <div className="rounded-[24px] bg-card/90 px-4 py-4 shadow-[0_8px_22px_rgba(29,27,32,0.045)] sm:px-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex min-w-[280px] flex-1 items-center gap-2">
                <Search className="pointer-events-none absolute left-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索标题、描述或所属产品..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="h-12 rounded-[24px] border-0 bg-muted pl-11 shadow-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-12 w-[150px] rounded-[24px] border-0 bg-muted shadow-none">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent className="rd-select-content">
                    <SelectItem value="all" className="rd-select-item">全部状态</SelectItem>
                    {REQUIREMENT_KANBAN_COLUMNS.map((col) => (
                      <SelectItem key={col.status} value={col.status} className="rd-select-item">
                        {col.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="h-12 w-[130px] rounded-[24px] border-0 bg-muted shadow-none">
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
            />
          </section>
        ) : null}

        {viewMode === 'list' ? (
          <section className="w-full">
            <div className="overflow-hidden rounded-[24px] bg-card/90 shadow-[0_8px_22px_rgba(29,27,32,0.045)]">
              <div className="flex items-center justify-between border-b border-border/25 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="rd-list-section-icon">
                    <List className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold tracking-normal text-foreground">全部需求</h2>
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
                      className="rounded-[18px] border-0 bg-muted text-muted-foreground shadow-none hover:bg-secondary/70 hover:text-foreground"
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
                          className="rounded-[20px] shadow-none"
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
                            <TableRow className="border-border/25 hover:bg-transparent">
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
                              const st = getRequirementStatusPresentation(record.status);
                              const pr = priorityMap[record.priority];
                              return (
                                <TableRow key={record.id} className="border-border/25 transition-colors hover:bg-secondary/35">
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
                                        className="text-left text-sm font-semibold text-foreground hover:text-primary"
                                        onClick={() => handleView(record)}
                                      >
                                        {record.title}
                                      </button>
                                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
                                          {formatRequirementChangeBadge(record)}
                                        </Badge>
                                      </div>
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
                                      className={`inline-flex items-center gap-2 rounded-xl border-0 px-3 py-1.5 ${st.badgeBg}`}
                                    >
                                      <span className={`h-2 w-2 shrink-0 rounded-full ${st.dotColor}`} />
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
                                      triggerClassName="text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
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
                              className="rounded-[18px] border-0 bg-muted shadow-none"
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
                              className="rounded-[18px] border-0 bg-muted shadow-none"
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
