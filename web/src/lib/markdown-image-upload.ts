'use client';

import { insertMarkdownImageAt } from '@shared/oss-upload';

import { axiosForBackend } from '@/lib/axios-backend';

export interface MarkdownImageUploadResult {
  url: string;
  objectKey: string;
  mime: string;
  size: number;
}

/** 上传 Markdown 插图到 OSS（经后端 /api/files/upload-image） */
export async function uploadMarkdownImage(file: File): Promise<MarkdownImageUploadResult> {
  const form = new FormData();
  form.append('file', file, file.name || 'paste.png');

  const { data } = await axiosForBackend.post<MarkdownImageUploadResult>('/api/files/upload-image', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export function applyMarkdownImagePaste(params: {
  markdown: string;
  url: string;
  selectionStart: number;
  selectionEnd: number;
  alt?: string;
}): { nextMarkdown: string; nextCursor: number } {
  const nextMarkdown = insertMarkdownImageAt(
    params.markdown,
    params.url,
    params.selectionStart,
    params.selectionEnd,
    params.alt,
  );
  const nextCursor = params.selectionStart + (nextMarkdown.length - params.markdown.length);
  return { nextMarkdown, nextCursor };
}

export function readClipboardImageFiles(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return [];
  const files: File[] = [];
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}
