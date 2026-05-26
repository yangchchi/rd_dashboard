'use client';

import * as React from 'react';
import axios from 'axios';
import { ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  applyMarkdownImagePaste,
  readClipboardImageFiles,
  uploadMarkdownImage,
} from '@/lib/markdown-image-upload';

export interface MarkdownPasteImageTextareaProps
  extends Omit<React.ComponentProps<typeof Textarea>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  /** 上传中占位 alt */
  uploadingAlt?: string;
}

export function MarkdownPasteImageTextarea({
  value,
  onChange,
  readOnly,
  disabled,
  className,
  uploadingAlt = '图片',
  ...props
}: MarkdownPasteImageTextareaProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  const insertImageFile = React.useCallback(
    async (file: File) => {
      const el = textareaRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? start;

      setUploading(true);
      const toastId = toast.loading('图片上传中…');
      try {
        const { url } = await uploadMarkdownImage(file);
        const alt = file.name?.replace(/\.[^.]+$/, '') || uploadingAlt;
        const { nextMarkdown, nextCursor } = applyMarkdownImagePaste({
          markdown: value,
          url,
          selectionStart: start,
          selectionEnd: end,
          alt,
        });
        onChange(nextMarkdown);
        toast.success('图片已插入', { id: toastId });
        requestAnimationFrame(() => {
          const node = textareaRef.current;
          if (!node) return;
          node.focus();
          node.setSelectionRange(nextCursor, nextCursor);
        });
      } catch (err) {
        const message = axios.isAxiosError(err)
          ? (() => {
              const data = err.response?.data as
                | { message?: string | string[]; error?: { message?: string | string[] } }
                | undefined;
              const raw = data?.error?.message ?? data?.message ?? err.message;
              return Array.isArray(raw) ? raw.join('；') : String(raw);
            })()
          : err instanceof Error
            ? err.message
            : '图片上传失败';
        toast.error(message, { id: toastId });
      } finally {
        setUploading(false);
      }
    },
    [onChange, uploadingAlt, value],
  );

  const handlePaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (readOnly || disabled || uploading) return;
      const images = readClipboardImageFiles(event.clipboardData);
      if (images.length === 0) return;
      event.preventDefault();
      void insertImageFile(images[0]);
    },
    [disabled, insertImageFile, readOnly, uploading],
  );

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLTextAreaElement>) => {
      if (readOnly || disabled || uploading) return;
      const file = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      void insertImageFile(file);
    },
    [disabled, insertImageFile, readOnly, uploading],
  );

  const handleFileInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void insertImageFile(file);
      event.target.value = '';
    },
    [insertImageFile],
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-2">
      {!readOnly && !disabled ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ImagePlus className="size-3.5" />
            )}
            插入图片
          </Button>
          <span className="text-xs text-muted-foreground">支持粘贴截图、拖拽或选择文件（上传至 OSS）</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>
      ) : null}
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(e) => {
          if (!readOnly && !disabled && Array.from(e.dataTransfer.types).includes('Files')) {
            e.preventDefault();
          }
        }}
        readOnly={readOnly}
        disabled={disabled || uploading}
        className={cn(className)}
        {...props}
      />
    </div>
  );
}
