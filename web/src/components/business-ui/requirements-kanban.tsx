'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Filter, Plus, Calendar, ChevronDown } from 'lucide-react';
import { rdAuditUpdate } from '@/lib/rd-actor';
import { useUpsertRequirement, useDeleteRequirement } from '@/lib/rd-hooks';
import type { IRequirement } from '@/lib/rd-types';
import { ListRowActionsMenu } from '@/components/business-ui/list-row-actions-menu';

interface IKanbanColumn {
  id: string;
  title: string;
  status: IRequirement['status'];
  color: string;
  dotColor: string;
}

const columns: IKanbanColumn[] = [
  { id: 'backlog', title: '需求池', status: 'backlog', color: 'text-zinc-400', dotColor: 'bg-zinc-500' },
  { id: 'prd_writing', title: 'PRD编写中', status: 'prd_writing', color: 'text-blue-400', dotColor: 'bg-blue-500' },
  { id: 'spec_defining', title: '规格说明书', status: 'spec_defining', color: 'text-indigo-400', dotColor: 'bg-indigo-500' },
  { id: 'ai_developing', title: 'AI开发中', status: 'ai_developing', color: 'text-purple-400', dotColor: 'bg-purple-500' },
  { id: 'pending_acceptance', title: '待验收', status: 'pending_acceptance', color: 'text-orange-400', dotColor: 'bg-orange-500' },
  { id: 'released', title: '已发布', status: 'released', color: 'text-green-400', dotColor: 'bg-green-500' },
];

const priorityConfig: Record<string, { bg: string; text: string; dot: string }> = {
  P0: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
  P1: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-500' },
  P2: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-500' },
  P3: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: 'bg-zinc-500' },
};

export type RequirementsKanbanFilter = 'all' | 'mine' | 'submitted';

export interface RequirementsKanbanProps {
  /** 已按筛选条件过滤后的需求 */
  filteredRequirements: IRequirement[];
  isLoading?: boolean;
  showToolbar?: boolean;
  /** 嵌入列表页时隐藏左侧大标题，仅保留筛选与新建 */
  hidePageHeading?: boolean;
  pageTitle?: string;
  pageIcon?: React.ReactNode;
}

export const RequirementsKanban: React.FC<RequirementsKanbanProps> = ({
  filteredRequirements,
  isLoading = false,
  showToolbar = true,
  hidePageHeading = false,
  pageTitle = '需求看板',
  pageIcon,
}) => {
  const router = useRouter();
  const currentProfile = useCurrentUserProfile();
  const upsertRequirement = useUpsertRequirement();
  const deleteRequirement = useDeleteRequirement();
  const [filter, setFilter] = useState<RequirementsKanbanFilter>('all');
  const [draggedItem, setDraggedItem] = useState<IRequirement | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const scoped = filteredRequirements.filter((req) => {
    if (filter === 'mine') {
      return req.pm === currentProfile.user_id || req.tm === currentProfile.user_id;
    }
    if (filter === 'submitted') {
      return req.submitter === currentProfile.user_id;
    }
    return true;
  });

  const getColumnRequirements = (status: IRequirement['status']) =>
    scoped.filter((r) => r.status === status);

  const handleDragStart = (req: IRequirement) => {
    setDraggedItem(req);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, status: IRequirement['status']) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (draggedItem && draggedItem.status !== status) {
      void upsertRequirement.mutateAsync({
        ...draggedItem,
        status,
        updatedAt: new Date().toISOString(),
        ...rdAuditUpdate(),
      });
    }
    setDraggedItem(null);
  };

  const handleCardClick = (reqId: string) => {
    router.push(`/requirements/${reqId}`);
  };

  const handleDeleteRequirement = (reqId: string) => {
    if (!window.confirm('确认删除该需求吗？')) return;
    void deleteRequirement.mutateAsync(reqId);
  };

  const filterLabels: Record<RequirementsKanbanFilter, string> = {
    all: '全部需求',
    mine: '我负责的',
    submitted: '我提交的',
  };

  if (isLoading) {
    return (
      <div className="w-full flex items-center justify-center min-h-[320px] text-muted-foreground text-sm">
        加载需求数据…
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        .kanban-container {
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .kanban-card {
          animation: cardAppear 0.4s ease-out forwards;
          opacity: 1;
        }
        @keyframes cardAppear {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .column-drop-active {
          background-color: hsl(217 91% 60% / 0.06);
          box-shadow: inset 0 0 0 2px hsl(217 91% 60% / 0.45);
        }
        .card-dragging {
          opacity: 0.5;
          transform: rotate(2deg) scale(1.02);
        }
        .pulse-indicator {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.9); }
        }
        .glow-orb {
          position: absolute;
          width: 256px;
          height: 256px;
          background: hsl(217 91% 60% / 0.12);
          filter: blur(100px);
          pointer-events: none;
        }
        .card-hover {
          transition: all 0.3s ease;
        }
        .card-hover:hover {
          border-color: hsl(217 91% 60% / 0.35);
          transform: translateY(-2px);
        }
      `}</style>

      <div className="w-full kanban-container relative">
        <div className="glow-orb top-0 right-0 opacity-50" />

        {showToolbar ? (
          <section
            className={`w-full flex items-center mb-8 ${hidePageHeading ? 'justify-end' : 'justify-between'}`}
          >
            {!hidePageHeading ? (
              <div className="flex items-center gap-4">
                {pageIcon ? (
                  <div className="flex items-center justify-center w-12 h-12 rounded-2xl border border-white/[0.08] bg-primary/10 backdrop-blur-sm">
                    {pageIcon}
                  </div>
                ) : null}
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-foreground">{pageTitle}</h1>
                  <p className="text-sm text-muted-foreground">
                    共 <span className="font-medium text-primary">{scoped.length}</span> 个需求
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-white/[0.1] bg-white/[0.05] text-muted-foreground backdrop-blur-sm transition-all duration-300 hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-foreground"
                  >
                    <Filter className="w-4 h-4" />
                    {filterLabels[filter]}
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="border-white/[0.1] bg-[hsl(222_47%_11%_/_0.92)] text-foreground backdrop-blur-xl">
                  <DropdownMenuItem
                    onClick={() => setFilter('all')}
                    className="focus:bg-white/[0.08] focus:text-foreground"
                  >
                    全部需求
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setFilter('mine')}
                    className="focus:bg-white/[0.08] focus:text-foreground"
                  >
                    我负责的
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setFilter('submitted')}
                    className="focus:bg-white/[0.08] focus:text-foreground"
                  >
                    我提交的
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </section>
        ) : null}

        <section className="w-full mb-2">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-5 pb-4">
              {columns.map((column) => {
                const columnReqs = getColumnRequirements(column.status);
                const isDropTarget = dragOverColumn === column.id;

                return (
                  <div
                    key={column.id}
                    className={`rd-surface-card rd-surface-card-hover flex flex-col w-80 shrink-0 p-4 transition-all duration-300 ${
                      isDropTarget ? 'column-drop-active' : ''
                    }`}
                    onDragOver={(e) => handleDragOver(e, column.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, column.status)}
                  >
                    <div className="flex items-center justify-between border-b border-border/80 pb-3 mb-3 px-0.5">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${column.dotColor} ${column.id === 'ai_developing' ? 'pulse-indicator' : ''}`}
                        />
                        <span className={`font-semibold text-sm uppercase tracking-wider ${column.color}`}>
                          {column.title}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-full border border-white/[0.08] bg-card/80 px-2.5 py-0.5 text-xs font-bold text-muted-foreground backdrop-blur-sm"
                      >
                        {columnReqs.length}
                      </Badge>
                    </div>

                    <div className="flex flex-col gap-4 min-h-[280px]">
                      {columnReqs.map((req, cardIndex) => (
                        <div
                          key={req.id}
                          draggable
                          onDragStart={() => handleDragStart(req)}
                          onClick={() => handleCardClick(req.id)}
                          className={`
                            relative overflow-hidden rounded-2xl border border-white/[0.08] bg-card/80 p-5 
                            cursor-pointer card-hover group kanban-card backdrop-blur-xl supports-[backdrop-filter]:bg-card/70
                            ${draggedItem?.id === req.id ? 'card-dragging' : ''}
                          `}
                          style={{
                            animationDelay: `${cardIndex * 50}ms`,
                          }}
                        >
                          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary/10 opacity-0 blur-[60px] transition-opacity duration-500 group-hover:opacity-100" />

                          <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full ${column.dotColor}`} />

                          <div className="pl-3">
                            <div className="flex items-center justify-between mb-3">
                              <Badge
                                className={`text-xs font-bold rounded-full px-2.5 py-0.5 ${priorityConfig[req.priority].bg} ${priorityConfig[req.priority].text} border-0`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full mr-1.5 ${priorityConfig[req.priority].dot}`}
                                />
                                {req.priority}
                              </Badge>
                              {req.status === 'ai_developing' && (
                                <div className="flex items-center gap-1.5 text-xs text-purple-400">
                                  <div className="w-2 h-2 rounded-full bg-purple-500 pulse-indicator" />
                                  <span>AI生成中</span>
                                </div>
                              )}
                            </div>

                            <h3 className="mb-2 line-clamp-2 text-sm font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                              {req.title}
                            </h3>
                            {req.product ? (
                              <p className="mb-1 line-clamp-1 text-[11px] font-medium uppercase tracking-wide text-primary/90">
                                {req.product}
                              </p>
                            ) : null}
                            <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                              {req.description}
                            </p>

                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5" />
                                  <span>{req.expectedDate}</span>
                                </div>
                                {req.bountyPoints != null && req.bountyPoints > 0 ? (
                                  <span className="font-mono text-[10px] tabular-nums text-amber-500/90">
                                    金币 {req.bountyPoints}
                                  </span>
                                ) : null}
                              </div>
                              <Avatar className="h-6 w-6 border border-white/[0.1]">
                                <AvatarFallback className="text-[10px] font-bold bg-primary/15 text-primary">
                                  {req.pm?.charAt(0) || req.submitter?.charAt(0) || '?'}
                                </AvatarFallback>
                              </Avatar>
                            </div>

                            <div className="mt-4 flex items-center justify-end border-t border-white/[0.08] pt-3">
                              <ListRowActionsMenu
                                stopPropagation
                                triggerClassName="text-muted-foreground hover:bg-white/10 hover:text-foreground"
                                onView={() => router.push(`/requirements/${req.id}`)}
                                onEdit={() => router.push(`/requirements/${req.id}/edit`)}
                                onDelete={() => handleDeleteRequirement(req.id)}
                              />
                            </div>
                          </div>
                        </div>
                      ))}

                      {columnReqs.length === 0 && (
                        <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.12] text-muted-foreground">
                          <p className="text-xs uppercase tracking-widest font-medium">暂无需求</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </section>
      </div>
    </>
  );
};
