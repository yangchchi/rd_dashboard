/** 允许上传的 Markdown 插图 MIME */
export const MARKDOWN_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export function extensionForImageMime(mime: string): string | null {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  return EXT_BY_MIME[normalized] ?? null;
}

export function isAllowedMarkdownImageMime(mime: string): boolean {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  return MARKDOWN_IMAGE_MIME_TYPES.has(normalized);
}

/** 从 OSS endpoint 解析 region，如 https://oss-cn-shenzhen.aliyuncs.com → oss-cn-shenzhen */
export function parseOssRegionFromEndpoint(endpoint: string): string {
  const host = endpoint.replace(/^https?:\/\//i, '').split('/')[0] ?? '';
  const match = host.match(/^([^.]+)\.aliyuncs\.com$/i);
  return match?.[1] ?? host.split('.')[0] ?? 'oss-cn-hangzhou';
}

export function buildOssObjectKey(params: {
  prefix: string;
  ext: string;
  now?: Date;
  id?: string;
}): string {
  const prefix = params.prefix.replace(/^\/+|\/+$/g, '') || 'file';
  const d = params.now ?? new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePath = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const id = params.id ?? `img-${Date.now()}`;
  const ext = params.ext.startsWith('.') ? params.ext : `.${params.ext}`;
  return `${prefix}/${datePath}/${id}${ext}`;
}

export function buildOssPublicUrl(accessUrl: string, objectKey: string): string {
  const base = accessUrl.replace(/\/+$/, '');
  const key = objectKey.replace(/^\/+/, '');
  return `${base}/${key}`;
}

export function insertMarkdownImageAt(
  markdown: string,
  url: string,
  selectionStart: number,
  selectionEnd: number,
  alt = '图片',
): string {
  const start = Math.max(0, Math.min(selectionStart, markdown.length));
  const end = Math.max(start, Math.min(selectionEnd, markdown.length));
  const before = markdown.slice(0, start);
  const after = markdown.slice(end);
  const line = `![${alt}](${url})`;
  const needsLead = before.length > 0 && !before.endsWith('\n');
  const needsTrail = after.length > 0 && !after.startsWith('\n');
  const snippet = `${needsLead ? '\n' : ''}${line}${needsTrail ? '\n' : ''}`;
  return before + snippet + after;
}

export function insertMarkdownImageAtCursor(
  markdown: string,
  url: string,
  cursor: number,
  alt = '图片',
): string {
  return insertMarkdownImageAt(markdown, url, cursor, cursor, alt);
}
