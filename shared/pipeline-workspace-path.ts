/**
 * 流水线 Git 文档目录与 Agent Workspace 物理路径共用的命名规则。
 * worktree 根目录：{workspaceRoot}/{productSlug}/（产品代码生成根，含 backend、frontend、docs 等）。
 * 会话文档在仓库内：docs/{sessionFolder}/*.md；禁止再使用 docs/ai-pipeline/ 层级。
 */

export function slugifyRequirementTitleForPath(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}

export function formatWorkspaceDocTimestamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** 与 Git 中 docs 子目录名一致：{需求标题 slug}-{时间戳} */
export function buildWorkspaceSessionFolderName(requirementTitle: string, at?: Date): string {
  return `${slugifyRequirementTitleForPath(requirementTitle)}-${formatWorkspaceDocTimestamp(at)}`;
}

/** 产品目录段：优先 identifier / id，否则需求上的 product 字段，仅保留安全 ASCII 段 */
export function resolveWorkspaceProductSlug(input: {
  productIdentifier?: string | null;
  productId?: string | null;
  requirementProductKey?: string | null;
}): string {
  const raw =
    input.productIdentifier?.trim() ||
    input.productId?.trim() ||
    input.requirementProductKey?.trim() ||
    'default';
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'default';
}

/** worktree 路径下第二层目录名：允许中文等，禁止路径分隔符 */
export function sanitizeWorkspacePathFolder(value: string | null | undefined, fallback: string): string {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const cleaned = raw
    .replace(/[\u0000\\/]+/g, '-')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return cleaned || fallback;
}
