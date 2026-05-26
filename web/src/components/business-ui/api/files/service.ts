'use client';

import { uploadMarkdownImage } from '@/lib/markdown-image-upload';

export interface UploadFileData {
  id: string;
  filePath: string;
  bucketId: string;
  url: string;
}

/** 上传至 OSS（经 /api/files/upload-image）；图片走 OSS，其它类型仍用本地 blob 预览 */
export async function uploadFile(file: File): Promise<UploadFileData> {
  if (file.type.startsWith('image/')) {
    const data = await uploadMarkdownImage(file);
    return {
      id: data.objectKey,
      filePath: data.objectKey,
      bucketId: 'oss',
      url: data.url,
    };
  }

  const url = URL.createObjectURL(file);
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `file-${Date.now()}`,
    filePath: file.name,
    bucketId: 'local',
    url,
  };
}
