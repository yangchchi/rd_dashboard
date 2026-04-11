'use client';

export interface UploadFileData {
  id: string;
  filePath: string;
  bucketId: string;
  url: string;
}

/** 本地预览：使用 blob URL，不依赖飞书对象存储 */
export async function uploadFile(file: File): Promise<UploadFileData> {
  const url = URL.createObjectURL(file);
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `file-${Date.now()}`,
    filePath: file.name,
    bucketId: 'local',
    url,
  };
}
