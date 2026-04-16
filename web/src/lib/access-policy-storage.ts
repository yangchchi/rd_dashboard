import { ACCESS_PERMISSION_IDS } from './access-catalog';
import { authApi } from './auth-api';

export const ACCESS_POLICY_STORAGE_KEY = '__rd_access_roles_v1';
export const ACCESS_POLICY_UPDATED_EVENT = 'rd-access-policy-updated';

export interface AccessRoleRecord {
  id: string;
  name: string;
  description?: string;
  permissionIds: string[];
  builtIn?: boolean;
  updatedAt: string;
}

function nowIso() {
  return new Date().toISOString();
}

function validPermissionSubset(ids: string[]): string[] {
  const allowed = new Set(ACCESS_PERMISSION_IDS);
  return ids.filter((id) => allowed.has(id));
}

export function readAccessRoles(): AccessRoleRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(ACCESS_POLICY_STORAGE_KEY);
    if (!raw) return seedDefaultRoles();
    const parsed = JSON.parse(raw) as AccessRoleRecord[];
    if (!Array.isArray(parsed) || parsed.length === 0) return seedDefaultRoles();
    return parsed.map((r) => ({
      ...r,
      permissionIds: validPermissionSubset(r.permissionIds || []),
    }));
  } catch {
    return seedDefaultRoles();
  }
}

export function writeAccessRoles(roles: AccessRoleRecord[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_POLICY_STORAGE_KEY, JSON.stringify(roles));
  window.dispatchEvent(new CustomEvent(ACCESS_POLICY_UPDATED_EVENT));
}

async function fetchAndCacheRolesFromServer(): Promise<AccessRoleRecord[]> {
  const roles = await authApi.listAccessRoles();
  writeAccessRoles(
    roles.map((r) => ({
      ...r,
      permissionIds: validPermissionSubset(r.permissionIds || []),
    }))
  );
  return readAccessRoles();
}

export function getAccessRoleById(id: string | null | undefined): AccessRoleRecord | null {
  if (!id) return null;
  const roles = readAccessRoles();
  const raw = id.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const normalizedId =
    lower === 'admin' || lower === 'role_admin'
      ? 'role_admin'
      : lower === 'pm' || lower === 'role_pm' || lower === '产品经理'
        ? 'role_pm'
        : lower === 'tm' || lower === 'role_tm' || lower === '技术经理'
          ? 'role_tm'
          : lower === 'stakeholder' || lower === 'role_stakeholder' || lower === '干系人'
            ? 'role_stakeholder'
            : raw;

  const byId =
    roles.find((r) => r.id === normalizedId) ??
    roles.find((r) => r.id.toLowerCase() === lower);
  if (byId) return byId;

  return (
    roles.find((r) => r.name.trim() === raw) ??
    roles.find((r) => r.name.trim().toLowerCase() === lower) ??
    null
  );
}

export function upsertAccessRole(role: Omit<AccessRoleRecord, 'updatedAt'> & { updatedAt?: string }): void {
  const roles = readAccessRoles();
  const next: AccessRoleRecord = {
    ...role,
    permissionIds: validPermissionSubset(role.permissionIds),
    updatedAt: role.updatedAt ?? nowIso(),
  };
  const idx = roles.findIndex((r) => r.id === next.id);
  if (idx >= 0) {
    const prev = roles[idx];
    if (prev.builtIn && next.id === prev.id) {
      next.builtIn = true;
    }
    roles[idx] = next;
  } else {
    roles.push(next);
  }
  writeAccessRoles(roles);
}

export function deleteAccessRole(id: string): { ok: true } | { ok: false; reason: string } {
  const roles = readAccessRoles();
  const target = roles.find((r) => r.id === id);
  if (!target) return { ok: false, reason: '角色不存在' };
  if (target.builtIn) return { ok: false, reason: '内置角色不可删除' };
  writeAccessRoles(roles.filter((r) => r.id !== id));
  return { ok: true };
}

export async function refreshAccessRolesFromServer(): Promise<AccessRoleRecord[]> {
  if (typeof window === 'undefined') return [];
  try {
    return await fetchAndCacheRolesFromServer();
  } catch {
    return readAccessRoles();
  }
}

export async function upsertAccessRoleRemote(
  role: Omit<AccessRoleRecord, 'updatedAt'> & { updatedAt?: string }
): Promise<AccessRoleRecord[]> {
  await authApi.upsertAccessRole(role.id, {
    name: role.name,
    description: role.description,
    permissionIds: validPermissionSubset(role.permissionIds),
    builtIn: role.builtIn,
  });
  return fetchAndCacheRolesFromServer();
}

export async function deleteAccessRoleRemote(
  id: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await authApi.deleteAccessRole(id);
    await fetchAndCacheRolesFromServer();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : '删除失败' };
  }
}

export async function resetAccessRolesRemote(): Promise<AccessRoleRecord[]> {
  const roles = await authApi.resetAccessRoles();
  writeAccessRoles(
    roles.map((r) => ({
      ...r,
      permissionIds: validPermissionSubset(r.permissionIds || []),
    }))
  );
  return readAccessRoles();
}

export function seedDefaultRoles(): AccessRoleRecord[] {
  const t = nowIso();
  const all = [...ACCESS_PERMISSION_IDS];
  const stakeholder: AccessRoleRecord = {
    id: 'role_stakeholder',
    name: '干系人',
    description: '提交与验收为主，可看需求与流水线只读入口',
    builtIn: true,
    updatedAt: t,
    permissionIds: [
      'page.dashboard',
      'page.requirements',
      'page.pipeline',
      'page.acceptance',
      'page.products',
    ],
  };
  const pm: AccessRoleRecord = {
    id: 'role_pm',
    name: '产品经理',
    description: '需求与 PRD、验收协同',
    builtIn: true,
    updatedAt: t,
    permissionIds: [
      'page.dashboard',
      'page.requirements',
      'page.prd',
      'page.pipeline',
      'page.acceptance',
      'page.products',
      'page.org_spec',
    ],
  };
  const tm: AccessRoleRecord = {
    id: 'role_tm',
    name: '技术经理',
    description: '规格、流水线与插件配置',
    builtIn: true,
    updatedAt: t,
    permissionIds: [
      'page.dashboard',
      'page.requirements',
      'page.prd',
      'page.spec',
      'page.pipeline',
      'page.acceptance',
      'page.products',
      'page.org_spec',
      'page.plugins',
    ],
  };
  const admin: AccessRoleRecord = {
    id: 'role_admin',
    name: '系统管理员',
    description: '用户、角色与权限治理',
    builtIn: true,
    updatedAt: t,
    permissionIds: all,
  };
  const defaults = [admin, stakeholder, pm, tm];
  if (typeof window !== 'undefined') {
    localStorage.setItem(ACCESS_POLICY_STORAGE_KEY, JSON.stringify(defaults));
  }
  return defaults;
}
