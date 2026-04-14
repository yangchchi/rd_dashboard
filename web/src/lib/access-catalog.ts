/**
 * 权限点目录：菜单/路由与页面按钮共用同一套 id。
 * 角色在「角色定义」中勾选权限子集；用户通过 accessRoleId 绑定角色。
 */

export type AccessPermissionKind = 'route' | 'action';

export type AccessPermissionGroup =
  | 'overview'
  | 'requirements'
  | 'prd_spec'
  | 'delivery'
  | 'product'
  | 'settings'
  | 'actions';

export interface AccessPermissionDef {
  id: string;
  label: string;
  description?: string;
  group: AccessPermissionGroup;
  kind: AccessPermissionKind;
  /** 拥有该权限时，侧栏对应菜单是否可见（与路由权限 id 可相同） */
  menuKey?: AccessMenuKey;
}

export type AccessMenuKey =
  | 'dashboard'
  | 'requirements'
  | 'prd'
  | 'spec'
  | 'pipeline'
  | 'acceptance'
  | 'products'
  | 'settings_org_spec'
  | 'settings_plugins'
  | 'settings_users'
  | 'settings_roles'
  | 'settings_permissions';

const g = (x: AccessPermissionGroup) => x;

export const ACCESS_PERMISSION_LIST: AccessPermissionDef[] = [
  {
    id: 'page.dashboard',
    label: '仪表板',
    group: g('overview'),
    kind: 'route',
    menuKey: 'dashboard',
  },
  {
    id: 'page.requirements',
    label: '需求（列表 / 采集 / 详情 / 编辑）',
    group: g('requirements'),
    kind: 'route',
    menuKey: 'requirements',
  },
  {
    id: 'page.prd',
    label: 'PRD 文档',
    group: g('prd_spec'),
    kind: 'route',
    menuKey: 'prd',
  },
  {
    id: 'page.spec',
    label: '规格说明书',
    group: g('prd_spec'),
    kind: 'route',
    menuKey: 'spec',
  },
  {
    id: 'page.pipeline',
    label: 'AI 流水线',
    group: g('delivery'),
    kind: 'route',
    menuKey: 'pipeline',
  },
  {
    id: 'page.acceptance',
    label: '验收中心',
    group: g('delivery'),
    kind: 'route',
    menuKey: 'acceptance',
  },
  {
    id: 'page.products',
    label: '产品管理',
    group: g('product'),
    kind: 'route',
    menuKey: 'products',
  },
  {
    id: 'page.org_spec',
    label: '组织规格',
    group: g('settings'),
    kind: 'route',
    menuKey: 'settings_org_spec',
  },
  {
    id: 'page.plugins',
    label: '插件与技能',
    group: g('settings'),
    kind: 'route',
    menuKey: 'settings_plugins',
  },
  {
    id: 'page.users',
    label: '用户管理',
    group: g('settings'),
    kind: 'route',
    menuKey: 'settings_users',
  },
  {
    id: 'page.roles',
    label: '角色定义',
    group: g('settings'),
    kind: 'route',
    menuKey: 'settings_roles',
  },
  {
    id: 'page.permissions',
    label: '权限管理',
    group: g('settings'),
    kind: 'route',
    menuKey: 'settings_permissions',
  },
  {
    id: 'action.users.create',
    label: '用户：新建账号',
    description: '用户管理页「新建用户」',
    group: g('actions'),
    kind: 'action',
  },
  {
    id: 'action.users.delete',
    label: '用户：删除账号',
    description: '用户管理页「删除」',
    group: g('actions'),
    kind: 'action',
  },
  {
    id: 'action.users.assign_role',
    label: '用户：分配角色',
    description: '用户管理页角色下拉',
    group: g('actions'),
    kind: 'action',
  },
];

export const ACCESS_PERMISSION_IDS: string[] = ACCESS_PERMISSION_LIST.map((p) => p.id);

export const ACCESS_PERMISSION_MAP: ReadonlyMap<string, AccessPermissionDef> = new Map(
  ACCESS_PERMISSION_LIST.map((p) => [p.id, p])
);

export const ACCESS_GROUP_LABEL: Record<AccessPermissionGroup, string> = {
  overview: '总览',
  requirements: '需求',
  prd_spec: 'PRD 与规格',
  delivery: '交付与验收',
  product: '产品',
  settings: '设置与治理',
  actions: '页面操作（按钮）',
};

function normPath(pathname: string): string {
  const p = pathname.split('?')[0] || '/';
  if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1);
  return p;
}

/** 登录即可访问，不校验权限点 */
export function isAuthOnlyPath(pathname: string): boolean {
  const p = normPath(pathname);
  return p === '/settings';
}

/**
 * 返回进入该路径所需的 route 类权限 id；未匹配的路径返回 null 表示需在守卫中放行或单独处理。
 */
export function requiredRoutePermission(pathname: string): string | null {
  const p = normPath(pathname);
  if (isAuthOnlyPath(p)) return null;
  if (p === '/' || p === '/dashboard') return 'page.dashboard';
  if (p.startsWith('/requirements')) return 'page.requirements';
  if (p.startsWith('/prd')) return 'page.prd';
  if (p.startsWith('/specification')) return 'page.spec';
  if (p.startsWith('/ai-pipeline')) return 'page.pipeline';
  if (p.startsWith('/acceptance')) return 'page.acceptance';
  if (p.startsWith('/products')) return 'page.products';
  if (p.startsWith('/org-spec-config')) return 'page.org_spec';
  if (p === '/plugins' || p.startsWith('/plugins/') || p === '/skills' || p.startsWith('/skills/'))
    return 'page.plugins';
  if (p.startsWith('/users')) return 'page.users';
  if (p.startsWith('/settings/roles')) return 'page.roles';
  if (p.startsWith('/settings/permissions')) return 'page.permissions';
  return null;
}

export function menuKeyAllowed(menuKey: AccessMenuKey, allowed: ReadonlySet<string>): boolean {
  const keys = ACCESS_PERMISSION_LIST.filter((d) => d.menuKey === menuKey).map((d) => d.id);
  return keys.some((id) => allowed.has(id));
}
