/** Agent 工作区根目录默认值（与 agent-workspace-manager 一致） */
export const DEFAULT_WORKSPACE_ROOT = '/tmp/rd-agent-workspaces';

export interface IGlobalConfig {
  /** Agent 工作区、缓存、worktree 等文件的根目录 */
  workspacesDir: string;
  updatedAt?: string;
}

export function createDefaultGlobalConfig(): IGlobalConfig {
  return {
    workspacesDir: DEFAULT_WORKSPACE_ROOT,
    updatedAt: new Date().toISOString(),
  };
}

/** 规范化工作区根路径：去首尾空白与末尾斜杠 */
export function normalizeWorkspacesDir(dir?: string | null): string {
  const normalized = String(dir || DEFAULT_WORKSPACE_ROOT).trim().replace(/\/+$/, '');
  return normalized || DEFAULT_WORKSPACE_ROOT;
}

export function validateWorkspacesDir(dir: string): string | null {
  const value = String(dir || '').trim();
  if (!value) return '工作区目录不能为空';
  if (!value.startsWith('/')) return '请填写绝对路径（以 / 开头）';
  if (value.includes('\0')) return '路径包含非法字符';
  return null;
}
