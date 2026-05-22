import { nanoid } from 'nanoid';

export interface AppGenLocalAttachment {
  id: string;
  /** @ 引用路径（通常为上传文件名） */
  atPath: string;
  name: string;
  content: string;
  size: number;
}

const MAX_FILES = 8;
const MAX_BYTES_PER_FILE = 80_000;

const TEXT_EXT = /\.(txt|md|markdown|json|html|htm|css|js|ts|tsx|jsx|vue|xml|yaml|yml|csv|log|svg)$/i;

export function sanitizeAttachmentName(raw: string): string {
  const base = raw.replace(/[/\\]/g, '_').trim() || 'file';
  return base.length > 64 ? `${base.slice(0, 61)}…` : base;
}

export async function readLocalFilesAsAttachments(
  files: FileList | File[],
  existing: AppGenLocalAttachment[]
): Promise<{ added: AppGenLocalAttachment[]; skipped: string[] }> {
  const list = Array.from(files);
  const skipped: string[] = [];
  const added: AppGenLocalAttachment[] = [];
  const usedNames = new Set(existing.map((a) => a.atPath.toLowerCase()));

  if (existing.length >= MAX_FILES) {
    return { added: [], skipped: ['已达附件上限（8 个）'] };
  }

  for (const file of list) {
    if (existing.length + added.length >= MAX_FILES) {
      skipped.push(`${file.name}：已达上限`);
      continue;
    }
    if (file.size > MAX_BYTES_PER_FILE) {
      skipped.push(`${file.name}：超过 80KB`);
      continue;
    }
    const atPath = sanitizeAttachmentName(file.name);
    if (usedNames.has(atPath.toLowerCase())) {
      skipped.push(`${file.name}：名称已存在`);
      continue;
    }
    const isText =
      file.type.startsWith('text/') ||
      TEXT_EXT.test(file.name) ||
      file.type === 'application/json' ||
      file.type === '';
    if (!isText) {
      skipped.push(`${file.name}：仅支持文本类文件`);
      continue;
    }
    try {
      const content = await file.text();
      added.push({
        id: nanoid(8),
        atPath,
        name: file.name,
        content,
        size: content.length,
      });
      usedNames.add(atPath.toLowerCase());
    } catch {
      skipped.push(`${file.name}：读取失败`);
    }
  }
  return { added, skipped };
}

export function buildAttachmentsContextBlock(attachments: AppGenLocalAttachment[]): string {
  if (!attachments.length) return '';
  return attachments
    .map(
      (a) =>
        `[附件 @${a.atPath}]\n文件名：${a.name}\n---\n${a.content.slice(0, 12_000)}${a.content.length > 12_000 ? '\n…(已截断)' : ''}`
    )
    .join('\n\n');
}

export function listAttachmentAtPaths(attachments: AppGenLocalAttachment[]): string[] {
  return attachments.map((a) => a.atPath).sort((a, b) => a.localeCompare(b, 'en'));
}
