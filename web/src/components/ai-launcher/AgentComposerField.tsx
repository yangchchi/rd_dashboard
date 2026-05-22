'use client';

import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { File } from 'lucide-react';
import { toast } from 'sonner';

import {
  listAttachmentAtPaths,
  readLocalFilesAsAttachments,
  type AppGenLocalAttachment,
} from '@/lib/app-gen-attachments';
import { loadAppGenSlashRows, type AppGenSlashRow } from '@/lib/app-gen-composer-skills';
import {
  findComposerAtomicBackspaceRange,
  findComposerAtomicForwardDeleteRange,
  parseAtTrigger,
  parseSlashTrigger,
  reconcileComposerMentions,
} from '@/lib/composer-mentions';
import { cn } from '@/lib/utils';

import { AgentPromptToolbar, type AgentChatMode } from './AgentPromptToolbar';

interface AgentComposerFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  rows?: number;
  textareaClassName?: string;
  disabled?: boolean;
  isStreaming?: boolean;
  onAbort?: () => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  chatMode: AgentChatMode;
  onChatModeChange: (mode: AgentChatMode) => void;
  attachments: AppGenLocalAttachment[];
  onAttachmentsChange: (next: AppGenLocalAttachment[]) => void;
  size?: 'default' | 'compact';
  /** 首页输入卡顶栏（最近应用菜单等） */
  headerSlot?: ReactNode;
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

type ComposerMenuPlacement = 'above' | 'below';

function measureComposerMenuPlacement(anchor: HTMLElement): ComposerMenuPlacement {
  const rect = anchor.getBoundingClientRect();
  const maxMenuH = Math.min(280, window.innerHeight * 0.42);
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceAbove >= maxMenuH) return 'above';
  if (spaceBelow >= maxMenuH) return 'below';
  return spaceAbove >= spaceBelow ? 'above' : 'below';
}

function composerMenuFixedStyle(
  anchor: HTMLElement,
  placement: ComposerMenuPlacement
): { top?: number; left: number; width: number; maxHeight: number; bottom?: number } {
  const rect = anchor.getBoundingClientRect();
  const gap = 6;
  const maxHeight = Math.min(
    280,
    window.innerHeight * 0.42,
    placement === 'above' ? Math.max(120, rect.top - gap - 8) : Math.max(120, window.innerHeight - rect.bottom - gap - 8)
  );
  if (placement === 'above') {
    return {
      left: rect.left,
      width: rect.width,
      bottom: window.innerHeight - rect.top + gap,
      maxHeight,
    };
  }
  return {
    left: rect.left,
    width: rect.width,
    top: rect.bottom + gap,
    maxHeight,
  };
}

/** 统一对话输入：/ 技能、@ 文件、+ 本地上传、底栏工具条 */
export function AgentComposerField({
  value,
  onChange,
  onSend,
  placeholder = '描述你想要的应用…',
  rows = 3,
  textareaClassName,
  disabled = false,
  isStreaming = false,
  onAbort,
  textareaRef: externalTextareaRef,
  chatMode,
  onChatModeChange,
  attachments,
  onAttachmentsChange,
  size = 'default',
  headerSlot,
  className,
  onKeyDown: onKeyDownProp,
}: AgentComposerFieldProps) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const menuAnchorRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = externalTextareaRef ?? internalRef;

  const [slashRows, setSlashRows] = useState<AppGenSlashRow[]>([]);
  const [slashMenu, setSlashMenu] = useState<{ start: number; filter: string } | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [atMenu, setAtMenu] = useState<{ start: number; filter: string } | null>(null);
  const [atActiveIndex, setAtActiveIndex] = useState(0);
  const [menuPlacement, setMenuPlacement] = useState<ComposerMenuPlacement>('above');
  const [menuFixedStyle, setMenuFixedStyle] = useState<ReturnType<typeof composerMenuFixedStyle> | null>(
    null
  );

  const updateMenuPlacement = useCallback(() => {
    const anchor = menuAnchorRef.current;
    if (!anchor) return;
    const placement = measureComposerMenuPlacement(anchor);
    setMenuPlacement(placement);
    setMenuFixedStyle(composerMenuFixedStyle(anchor, placement));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadAppGenSlashRows().then((rows) => {
      if (!cancelled) setSlashRows(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const atFileIndex = useMemo(() => listAttachmentAtPaths(attachments), [attachments]);

  const slashFiltered = useMemo(() => {
    if (!slashMenu) return [];
    const q = slashMenu.filter.trim().toLowerCase();
    if (!q) return slashRows;
    return slashRows.filter(
      (r) =>
        r.key.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
    );
  }, [slashRows, slashMenu]);

  const menuOpen = Boolean(atMenu) || Boolean(slashMenu);

  const atFiltered = useMemo(() => {
    if (!atMenu) return [];
    const q = atMenu.filter.trim().toLowerCase();
    const base = !q
      ? atFileIndex
      : atFileIndex.filter((p) => {
          const pl = p.toLowerCase();
          return pl.includes(q) || pl.split('/').pop()?.toLowerCase().includes(q);
        });
    return base.slice(0, 80);
  }, [atFileIndex, atMenu]);

  useEffect(() => {
    if (!slashMenu) return;
    setSlashActiveIndex(0);
  }, [slashMenu?.start, slashMenu?.filter]);

  useEffect(() => {
    if (!atMenu) return;
    setAtActiveIndex(0);
  }, [atMenu?.start, atMenu?.filter]);

  useEffect(() => {
    if (!menuOpen) {
      setMenuFixedStyle(null);
      return;
    }
    const run = () => updateMenuPlacement();
    const raf = requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    window.addEventListener('resize', run);
    window.addEventListener('scroll', run, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', run);
      window.removeEventListener('scroll', run, true);
    };
  }, [menuOpen, slashMenu, atMenu, slashFiltered.length, updateMenuPlacement]);

  const syncMenus = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    let c = ta.selectionStart ?? ta.value.length;
    const v = ta.value;
    const normS = v.replace(/／/g, '/');
    const normA = v.replace(/＠/g, '@');
    if (normS === '/' && c === 0) c = 1;
    if (normA === '@' && c === 0) c = 1;
    const { slash, at } = reconcileComposerMentions(v, c);
    setSlashMenu(slash);
    setAtMenu(at);
  }, [textareaRef]);

  const applySlashSelection = useCallback(
    (row: AppGenSlashRow) => {
      const sm = slashMenu;
      if (!sm) return;
      const ta = textareaRef.current;
      const end = ta?.selectionStart ?? value.length;
      const insert = row.buildInsert();
      const next = value.slice(0, sm.start) + insert + value.slice(end);
      onChange(next);
      setSlashMenu(null);
      setAtMenu(null);
      requestAnimationFrame(() => {
        if (!ta) return;
        const pos = sm.start + insert.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
    },
    [slashMenu, value, onChange, textareaRef]
  );

  const applyAtSelection = useCallback(
    (path: string) => {
      const am = atMenu;
      if (!am) return;
      const ta = textareaRef.current;
      const end = ta?.selectionStart ?? value.length;
      const insert = `@${path}`;
      const next = value.slice(0, am.start) + insert + value.slice(end);
      onChange(next);
      setAtMenu(null);
      setSlashMenu(null);
      requestAnimationFrame(() => {
        if (!ta) return;
        const pos = am.start + insert.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
    },
    [atMenu, value, onChange, textareaRef]
  );

  const openSkillPalette = useCallback(() => {
    if (disabled) return;
    const ta = textareaRef.current;
    const next = value.length === 0 || value.endsWith('\n') ? `${value}/` : `${value}\n/`;
    onChange(next);
    setAtMenu(null);
    setSlashMenu(parseSlashTrigger(next, next.length));
    requestAnimationFrame(() => {
      ta?.focus();
      const pos = next.length;
      ta?.setSelectionRange(pos, pos);
    });
  }, [disabled, value, onChange, textareaRef]);

  const openFilePalette = useCallback(() => {
    if (disabled) return;
    const ta = textareaRef.current;
    const next = value.length === 0 || value.endsWith('\n') ? `${value}@` : `${value}\n@`;
    onChange(next);
    setSlashMenu(null);
    setAtMenu(parseAtTrigger(next, next.length));
    requestAnimationFrame(() => {
      ta?.focus();
      const pos = next.length;
      ta?.setSelectionRange(pos, pos);
    });
  }, [disabled, value, onChange, textareaRef]);

  const handleFileInput = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = '';
    if (!files?.length) return;
    const { added, skipped } = await readLocalFilesAsAttachments(files, attachments);
    if (added.length) {
      onAttachmentsChange([...attachments, ...added]);
      toast.success(`已添加 ${added.length} 个附件，可用 @ 引用`);
    }
    if (skipped.length) {
      toast.message(skipped.slice(0, 3).join('；') + (skipped.length > 3 ? '…' : ''));
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    let c = e.target.selectionStart ?? v.length;
    const normS = v.replace(/／/g, '/');
    const normA = v.replace(/＠/g, '@');
    if (normS === '/' && c === 0) c = 1;
    if (normA === '@' && c === 0) c = 1;
    onChange(v);
    const { slash, at } = reconcileComposerMentions(v, c);
    setSlashMenu(slash);
    setAtMenu(at);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      (e.key === 'Backspace' || e.key === 'Delete') &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.nativeEvent.isComposing
    ) {
      const ta = textareaRef.current;
      if (ta && ta.selectionStart === ta.selectionEnd) {
        const selStart = ta.selectionStart ?? 0;
        let range: { start: number; end: number } | null = null;
        if (e.key === 'Backspace' && selStart > 0) {
          range = findComposerAtomicBackspaceRange(value, selStart - 1);
        } else if (e.key === 'Delete' && selStart < value.length) {
          range = findComposerAtomicForwardDeleteRange(value, selStart);
        }
        if (range && range.end > range.start) {
          e.preventDefault();
          const next = value.slice(0, range.start) + value.slice(range.end);
          const pos = range.start;
          onChange(next);
          setSlashMenu(null);
          setAtMenu(null);
          requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(pos, pos);
            const { slash, at } = reconcileComposerMentions(next, pos);
            setSlashMenu(slash);
            setAtMenu(at);
          });
          return;
        }
      }
    }

    if (atMenu) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setAtMenu(null);
        return;
      }
      if (atFiltered.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setAtActiveIndex((i) => Math.min(atFiltered.length - 1, i + 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setAtActiveIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const path = atFiltered[atActiveIndex] ?? atFiltered[0];
          if (path) applyAtSelection(path);
          return;
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        setAtMenu(null);
        return;
      }
    }

    if (slashMenu) {
      if (slashFiltered.length === 0 && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        setSlashMenu(null);
        return;
      }
      if (slashFiltered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashActiveIndex((i) => Math.min(slashFiltered.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenu(null);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const row = slashFiltered[slashActiveIndex] ?? slashFiltered[0];
        if (row) applySlashSelection(row);
        return;
      }
      }
    }

    onKeyDownProp?.(e);
  };

  const menuShellClass =
    'fixed z-[200] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-card shadow-lg';

  const menuPanel =
    menuOpen && menuFixedStyle ? (
      <>
        {atMenu ? (
          <div
            role="listbox"
            aria-label="选择文件"
            className={menuShellClass}
            style={{
              left: menuFixedStyle.left,
              width: menuFixedStyle.width,
              maxHeight: menuFixedStyle.maxHeight,
              ...(menuPlacement === 'above'
                ? { bottom: menuFixedStyle.bottom }
                : { top: menuFixedStyle.top }),
            }}
          >
          {atFiltered.length > 0 ? (
            atFiltered.map((path, idx) => (
              <button
                key={path}
                type="button"
                role="option"
                aria-selected={idx === atActiveIndex}
                className={cn(
                  'flex w-full gap-2.5 px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent',
                  idx === atActiveIndex && 'bg-accent'
                )}
                onMouseEnter={() => setAtActiveIndex(idx)}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => applyAtSelection(path)}
              >
                <File className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 font-mono text-xs leading-snug">{path}</span>
              </button>
            ))
          ) : (
            <div className="px-2.5 py-2.5 text-xs text-muted-foreground">
              {atFileIndex.length === 0
                ? '暂无附件。点击左侧 + 上传本地文本文件，或按 Esc 关闭'
                : '没有匹配的路径，请调整关键词'}
            </div>
          )}
        </div>
        ) : slashMenu ? (
          <div
            role="listbox"
            aria-label="技能与快捷提示"
            className={menuShellClass}
            style={{
              left: menuFixedStyle.left,
              width: menuFixedStyle.width,
              maxHeight: menuFixedStyle.maxHeight,
              ...(menuPlacement === 'above'
                ? { bottom: menuFixedStyle.bottom }
                : { top: menuFixedStyle.top }),
            }}
          >
          {slashFiltered.length > 0 ? (
          slashFiltered.map((row, idx) => {
            const Icon = row.Icon;
            return (
              <button
                key={row.key}
                type="button"
                role="option"
                aria-selected={idx === slashActiveIndex}
                className={cn(
                  'flex w-full gap-2.5 px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent',
                  idx === slashActiveIndex && 'bg-accent'
                )}
                onMouseEnter={() => setSlashActiveIndex(idx)}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => applySlashSelection(row)}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{row.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{row.description}</span>
                </span>
              </button>
            );
          })
          ) : (
            <div className="px-2.5 py-2.5 text-xs text-muted-foreground">没有匹配的技能，请调整关键词</div>
          )}
        </div>
        ) : null}
      </>
    ) : null;

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card shadow-sm',
        menuOpen ? 'overflow-visible' : 'overflow-hidden',
        className
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.markdown,.json,.html,.htm,.css,.js,.ts,.tsx,.jsx,.vue,.xml,.yaml,.yml,.csv,.log,.svg,text/*,application/json"
        className="hidden"
        onChange={(e) => void handleFileInput(e)}
      />
      {headerSlot ? (
        <div className="border-b border-border">{headerSlot}</div>
      ) : null}
      <div ref={menuAnchorRef} className="relative overflow-visible">
        {menuPanel}
        <textarea
          ref={(el) => {
            internalRef.current = el;
            if (externalTextareaRef && 'current' in externalTextareaRef) {
              (externalTextareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current =
                el;
            }
          }}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={syncMenus}
          onClick={syncMenus}
          onKeyUp={syncMenus}
          disabled={disabled}
          rows={rows}
          placeholder={placeholder}
          className={cn(
            'w-full resize-none border-0 bg-transparent px-4 pt-3 pb-2 text-[15px] leading-relaxed focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60',
            size === 'compact' ? 'min-h-[52px] text-sm' : 'min-h-[72px]',
            textareaClassName
          )}
        />
      </div>
      <AgentPromptToolbar
        mode={chatMode}
        onModeChange={onChatModeChange}
        canSend={!!value.trim()}
        onSend={onSend}
        disabled={disabled}
        isStreaming={isStreaming}
        onAbort={onAbort}
        onUpload={() => fileInputRef.current?.click()}
        onOpenSkills={openSkillPalette}
        onOpenFiles={openFilePalette}
        size={size}
        className="border-t border-border"
      />
    </div>
  );
}
