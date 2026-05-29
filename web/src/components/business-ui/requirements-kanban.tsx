'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Calendar } from 'lucide-react';
import { rdAuditUpdate } from '@/lib/rd-actor';
import { useUpsertRequirement, useDeleteRequirement } from '@/lib/rd-hooks';
import type { IRequirement } from '@/lib/rd-types';
import { REQUIREMENT_KANBAN_COLUMNS } from '@/lib/requirement-status-present';
import { ListRowActionsMenu } from '@/components/business-ui/list-row-actions-menu';
import {
  ConfirmActionDialog,
  type ConfirmActionState,
} from '@/components/business-ui/confirm-action-dialog';

const priorityConfig: Record<string, { bg: string; text: string; dot: string }> = {
  P0: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
  P1: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-500' },
  P2: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-500' },
  P3: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: 'bg-zinc-500' },
};

export interface RequirementsKanbanProps {
  /** 已按筛选条件过滤后的需求 */
  filteredRequirements: IRequirement[];
  isLoading?: boolean;
  allowDragStatusChange?: boolean;
}

export const RequirementsKanban: React.FC<RequirementsKanbanProps> = ({
  filteredRequirements,
  isLoading = false,
  allowDragStatusChange = false,
}) => {
  const router = useRouter();
  const upsertRequirement = useUpsertRequirement();
  const deleteRequirement = useDeleteRequirement();
  const [draggedItem, setDraggedItem] = useState<IRequirement | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);

  const getColumnRequirements = (status: IRequirement['status']) =>
    filteredRequirements.filter((r) => r.status === status);

  const handleDragStart = (req: IRequirement) => {
    if (!allowDragStatusChange) return;
    setDraggedItem(req);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    if (!allowDragStatusChange) return;
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, status: IRequirement['status']) => {
    if (!allowDragStatusChange) return;
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
    const target = filteredRequirements.find((req) => req.id === reqId);
    setConfirmAction({
      title: '删除需求',
      description: target
        ? `确认删除「${target.title}」吗？删除后关联流程数据将不可恢复。`
        : '确认删除该需求吗？删除后关联流程数据将不可恢复。',
      confirmLabel: '删除',
      destructive: true,
      onConfirm: () => {
        setConfirmAction(null);
        void deleteRequirement.mutateAsync(reqId);
      },
    });
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
          background-color: hsl(268 100% 94% / 0.72);
          box-shadow: inset 0 0 0 1px hsl(259 34% 48% / 0.32);
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
        .card-hover {
          transition: background-color 0.2s ease, box-shadow 0.2s ease;
        }
        .card-hover:hover {
          background-color: hsl(268 100% 94% / 0.36);
        }
      `}</style>

      <div className="w-full kanban-container relative">
        <ConfirmActionDialog
          state={confirmAction}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
        />
        <section className="mb-2 w-full">
          <div className="grid grid-cols-1 gap-5 pb-4 lg:grid-cols-2 2xl:grid-cols-3">
            {REQUIREMENT_KANBAN_COLUMNS.map((column) => {
              const columnReqs = getColumnRequirements(column.status);
              const isDropTarget = dragOverColumn === column.id;

              return (
                <div
                  key={column.id}
                  className={`flex min-w-0 flex-col overflow-hidden rounded-[24px] bg-card/90 p-4 shadow-[0_8px_22px_rgba(29,27,32,0.045)] transition-colors duration-200 hover:bg-secondary/35 ${
                    isDropTarget ? 'column-drop-active' : ''
                  }`}
                  onDragOver={(e) => handleDragOver(e, column.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, column.status)}
                >
                  <div className="mb-3 flex items-center justify-between border-b border-border/35 px-0.5 pb-3">
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
                      className="rounded-xl border-0 bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground"
                    >
                      {columnReqs.length}
                    </Badge>
                  </div>

                  <div className="flex min-h-[320px] flex-col gap-4">
                    {columnReqs.map((req, cardIndex) => (
                      <div
                        key={req.id}
                        draggable={allowDragStatusChange}
                        onDragStart={() => handleDragStart(req)}
                        onClick={() => handleCardClick(req.id)}
                        className={`
                          relative overflow-hidden rounded-2xl border-0 bg-card p-5 
                          cursor-pointer card-hover group kanban-card shadow-sm
                          ${draggedItem?.id === req.id ? 'card-dragging' : ''}
                        `}
                        style={{
                          animationDelay: `${cardIndex * 50}ms`,
                        }}
                      >
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
                              <div className="flex items-center gap-1.5 text-xs text-primary">
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
                            <Avatar className="h-6 w-6 border-0">
                              <AvatarFallback className="text-[10px] font-bold bg-primary/15 text-primary">
                                {req.pm?.charAt(0) || req.submitter?.charAt(0) || '?'}
                              </AvatarFallback>
                            </Avatar>
                          </div>

                          <div className="mt-4 flex items-center justify-end border-t border-border/35 pt-3">
                            <ListRowActionsMenu
                              stopPropagation
                              triggerClassName="text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                              onView={() => router.push(`/requirements/${req.id}`)}
                              onEdit={() => router.push(`/requirements/${req.id}/edit`)}
                              onDelete={() => handleDeleteRequirement(req.id)}
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {columnReqs.length === 0 && (
                      <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-border/45 text-muted-foreground">
                        <p className="text-xs uppercase tracking-widest font-medium">暂无需求</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
};
