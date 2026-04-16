import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE } from '../../database/database.constants';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

import { hashPassword, signAuthToken, verifyPassword } from './auth.utils';

export interface IUserRow {
  id: string;
  username: string;
  passwordHash: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  accessRoleId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IUserView {
  id: string;
  username: string;
  /** 姓名（展示用） */
  name?: string;
  email?: string;
  phone?: string;
  /** 前端 RBAC 角色 id（存于 localStorage 策略中的角色定义） */
  accessRoleId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IAccessRoleRecord {
  id: string;
  name: string;
  description?: string;
  permissionIds: string[];
  builtIn?: boolean;
  updatedAt: string;
}

const DEFAULT_PERMISSION_IDS = [
  'page.dashboard',
  'page.requirements',
  'page.prd',
  'page.spec',
  'page.pipeline',
  'page.acceptance',
  'page.bounty_hunt',
  'page.products',
  'page.org_spec',
  'page.plugins',
  'page.users',
  'page.roles',
  'page.permissions',
  'action.users.create',
  'action.users.delete',
  'action.users.assign_role',
];

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  private getJwtSecret(): string {
    return process.env.JWT_SECRET || 'rd-dashboard-dev-secret';
  }

  private getJwtExpireSec(): number {
    return Number(process.env.JWT_EXPIRES_IN_SEC || 60 * 60 * 24);
  }

  private rowsFromExecute<T extends Record<string, unknown>>(result: unknown): T[] {
    if (Array.isArray(result)) {
      return result as T[];
    }
    const r = result as { rows?: T[] };
    return r.rows ?? [];
  }

  private toIso(value: unknown): string {
    const d = new Date(String(value || ''));
    if (Number.isNaN(d.getTime())) {
      return new Date().toISOString();
    }
    return d.toISOString();
  }

  private rowToUserView(row: Record<string, unknown>): IUserView {
    const fullName = row.full_name ?? row.fullName;
    const email = row.email;
    const phone = row.phone;
    const accessRoleId = row.access_role_id ?? row.accessRoleId;
    return {
      id: row.id as string,
      username: row.username as string,
      name:
        typeof fullName === 'string' && fullName.trim() !== ''
          ? fullName.trim()
          : undefined,
      email:
        typeof email === 'string' && email.trim() !== '' ? email.trim() : undefined,
      phone:
        typeof phone === 'string' && phone.trim() !== '' ? phone.trim() : undefined,
      accessRoleId:
        typeof accessRoleId === 'string' && accessRoleId.trim() !== ''
          ? accessRoleId.trim()
          : null,
      createdAt: this.toIso(row.created_at ?? row.createdAt),
      updatedAt: this.toIso(row.updated_at ?? row.updatedAt),
    };
  }

  private rowToUser(row: Record<string, unknown>): IUserRow {
    const v = this.rowToUserView(row);
    return {
      id: v.id,
      username: v.username,
      passwordHash: row.password_hash as string,
      fullName: (row.full_name as string | null | undefined) ?? null,
      email: (row.email as string | null | undefined) ?? null,
      phone: (row.phone as string | null | undefined) ?? null,
      accessRoleId:
        typeof row.access_role_id === 'string'
          ? row.access_role_id.trim() || null
          : typeof row.accessRoleId === 'string'
            ? row.accessRoleId.trim() || null
            : null,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    };
  }

  async onModuleInit(): Promise<void> {
    await this.ensureUsersTable();
    await this.ensureAccessRolesTable();
    await this.seedDefaultAccessRolesIfEmpty();
    await this.ensureDefaultAdmin();
  }

  async ensureUsersTable(): Promise<void> {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.ensureUserProfileColumns();
  }

  /** 为已有库增量添加资料字段 */
  private async ensureUserProfileColumns(): Promise<void> {
    await this.db.execute(sql`
      ALTER TABLE rd_users ADD COLUMN IF NOT EXISTS full_name TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_users ADD COLUMN IF NOT EXISTS email TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_users ADD COLUMN IF NOT EXISTS phone TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_users ADD COLUMN IF NOT EXISTS access_role_id TEXT;
    `);
    await this.db.execute(sql`
      ALTER TABLE rd_users ADD COLUMN IF NOT EXISTS feishu_open_id TEXT;
    `);
    await this.db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS rd_users_feishu_open_id_uidx
      ON rd_users (feishu_open_id)
      WHERE feishu_open_id IS NOT NULL;
    `);
  }

  private getFeishuAppId(): string {
    return (process.env.FEISHU_APP_ID || '').trim();
  }

  private getFeishuAppSecret(): string {
    return (process.env.FEISHU_APP_SECRET || '').trim();
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private roleRowToView(row: Record<string, unknown>): IAccessRoleRecord {
    const permissionIds = Array.isArray(row.permission_ids)
      ? row.permission_ids
      : Array.isArray(row.permissionIds)
        ? row.permissionIds
        : [];
    return {
      id: String(row.id || ''),
      name: String(row.name || ''),
      description:
        typeof row.description === 'string' && row.description.trim() !== ''
          ? row.description.trim()
          : undefined,
      permissionIds: permissionIds
        .filter((v) => typeof v === 'string' && v.trim() !== '')
        .map((v) => String(v).trim()),
      builtIn: Boolean(row.built_in ?? row.builtIn),
      updatedAt: this.toIso(row.updated_at ?? row.updatedAt),
    };
  }

  private defaultAccessRoles(): IAccessRoleRecord[] {
    const t = this.nowIso();
    return [
      {
        id: 'role_admin',
        name: '系统管理员',
        description: '用户、角色与权限治理',
        builtIn: true,
        updatedAt: t,
        permissionIds: [...DEFAULT_PERMISSION_IDS],
      },
      {
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
      },
      {
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
      },
      {
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
      },
    ];
  }

  private normalizePermissionIds(ids: string[]): string[] {
    const seen = new Set<string>();
    for (const raw of ids) {
      if (typeof raw !== 'string') continue;
      const v = raw.trim();
      if (!v) continue;
      seen.add(v);
    }
    return [...seen];
  }

  private async ensureAccessRolesTable(): Promise<void> {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS rd_access_roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        permission_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        built_in BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  private async seedDefaultAccessRolesIfEmpty(): Promise<void> {
    const result = await this.db.execute(sql`SELECT COUNT(1)::int AS count FROM rd_access_roles;`);
    const rows = this.rowsFromExecute<{ count?: number | string }>(result);
    const count = Number(rows[0]?.count || 0);
    if (count > 0) return;
    for (const role of this.defaultAccessRoles()) {
      await this.db.execute(sql`
        INSERT INTO rd_access_roles (id, name, description, permission_ids, built_in, updated_at)
        VALUES (
          ${role.id},
          ${role.name},
          ${role.description ?? null},
          ${JSON.stringify(role.permissionIds)}::jsonb,
          ${Boolean(role.builtIn)},
          ${role.updatedAt}::timestamptz
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          permission_ids = EXCLUDED.permission_ids,
          built_in = EXCLUDED.built_in,
          updated_at = EXCLUDED.updated_at;
      `);
    }
  }

  async ensureDefaultAdmin(): Promise<void> {
    const existing = await this.getUserByUsername('admin');
    if (existing) return;
    await this.createUser('admin', '123456');
  }

  async getUserByUsername(username: string): Promise<IUserRow | null> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_users WHERE username = ${username} LIMIT 1;
    `);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToUser(rows[0]) : null;
  }

  async listUsers(): Promise<IUserView[]> {
    const result = await this.db.execute(sql`
      SELECT id, username, full_name, email, phone, access_role_id, created_at, updated_at
      FROM rd_users ORDER BY created_at DESC;
    `);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.rowToUserView(row));
  }

  async createUser(
    username: string,
    password: string,
    profile?: { name?: string; email?: string; phone?: string; accessRoleId?: string | null }
  ): Promise<IUserView> {
    const now = new Date().toISOString();
    const userId = `usr_${Date.now()}`;
    const passwordHash = hashPassword(password);
    const fullName = profile?.name?.trim() || null;
    const email = profile?.email?.trim() || null;
    const phone = profile?.phone?.trim() || null;
    const accessRoleId =
      typeof profile?.accessRoleId === 'string' && profile.accessRoleId.trim() !== ''
        ? profile.accessRoleId.trim()
        : null;
    await this.db.execute(sql`
      INSERT INTO rd_users (id, username, password_hash, full_name, email, phone, access_role_id, created_at, updated_at)
      VALUES (
        ${userId},
        ${username},
        ${passwordHash},
        ${fullName},
        ${email},
        ${phone},
        ${accessRoleId},
        ${now}::timestamptz,
        ${now}::timestamptz
      )
      ON CONFLICT (username) DO NOTHING;
    `);
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new Error('创建用户失败');
    }
    return this.rowToUserView(user as unknown as Record<string, unknown>);
  }

  async deleteUser(id: string): Promise<void> {
    await this.db.execute(sql`DELETE FROM rd_users WHERE id = ${id};`);
  }

  async listAccessRoles(): Promise<IAccessRoleRecord[]> {
    const result = await this.db.execute(sql`
      SELECT id, name, description, permission_ids, built_in, updated_at
      FROM rd_access_roles
      ORDER BY built_in DESC, updated_at DESC, id ASC;
    `);
    const rows = this.rowsFromExecute(result);
    return rows.map((row) => this.roleRowToView(row));
  }

  async upsertAccessRole(
    id: string,
    body: { name: string; description?: string; permissionIds?: string[]; builtIn?: boolean }
  ): Promise<IAccessRoleRecord> {
    const roleId = id.trim();
    const roleName = body.name.trim();
    if (!roleId) throw new BadRequestException('角色 id 不能为空');
    if (!roleName) throw new BadRequestException('角色名称不能为空');
    const permissionIds = this.normalizePermissionIds(body.permissionIds ?? []);
    const now = this.nowIso();

    await this.db.execute(sql`
      INSERT INTO rd_access_roles (id, name, description, permission_ids, built_in, updated_at)
      VALUES (
        ${roleId},
        ${roleName},
        ${body.description?.trim() || null},
        ${JSON.stringify(permissionIds)}::jsonb,
        ${Boolean(body.builtIn)},
        ${now}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        permission_ids = EXCLUDED.permission_ids,
        built_in = CASE
          WHEN rd_access_roles.built_in = TRUE THEN TRUE
          ELSE EXCLUDED.built_in
        END,
        updated_at = EXCLUDED.updated_at;
    `);

    const result = await this.db.execute(sql`
      SELECT id, name, description, permission_ids, built_in, updated_at
      FROM rd_access_roles
      WHERE id = ${roleId}
      LIMIT 1;
    `);
    const rows = this.rowsFromExecute(result);
    if (!rows[0]) {
      throw new BadRequestException('保存角色失败');
    }
    return this.roleRowToView(rows[0]);
  }

  async deleteAccessRole(id: string): Promise<void> {
    const roleId = id.trim();
    if (!roleId) throw new BadRequestException('角色 id 不能为空');
    const existed = await this.db.execute(sql`
      SELECT id, built_in
      FROM rd_access_roles
      WHERE id = ${roleId}
      LIMIT 1;
    `);
    const rows = this.rowsFromExecute<{ id?: string; built_in?: boolean }>(existed);
    if (!rows[0]?.id) throw new BadRequestException('角色不存在');
    if (rows[0].built_in) throw new BadRequestException('内置角色不可删除');
    await this.db.execute(sql`DELETE FROM rd_access_roles WHERE id = ${roleId};`);
  }

  async resetAccessRoles(): Promise<IAccessRoleRecord[]> {
    await this.db.execute(sql`DELETE FROM rd_access_roles;`);
    await this.seedDefaultAccessRolesIfEmpty();
    return this.listAccessRoles();
  }

  async updateUserAccessRole(id: string, accessRoleId: string | null): Promise<IUserView> {
    await this.db.execute(sql`
      UPDATE rd_users
      SET access_role_id = ${accessRoleId}, updated_at = NOW()
      WHERE id = ${id};
    `);
    const result = await this.db.execute(sql`
      SELECT id, username, full_name, email, phone, access_role_id, created_at, updated_at
      FROM rd_users WHERE id = ${id} LIMIT 1;
    `);
    const rows = this.rowsFromExecute(result);
    if (!rows[0]) {
      throw new Error('用户不存在');
    }
    return this.rowToUserView(rows[0]);
  }

  async register(username: string, password: string) {
    await this.createUser(username, password);
    return this.login(username, password);
  }

  async login(username: string, password: string) {
    const user = await this.getUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const token = signAuthToken(
      {
        userId: user.id,
        username: user.username,
      },
      {
        secret: this.getJwtSecret(),
        expiresInSec: this.getJwtExpireSec(),
      }
    );

    return {
      token,
      user: this.rowToUserView(user as unknown as Record<string, unknown>),
    };
  }

  async getUserByFeishuOpenId(openId: string): Promise<IUserRow | null> {
    const result = await this.db.execute(sql`
      SELECT * FROM rd_users WHERE feishu_open_id = ${openId} LIMIT 1;
    `);
    const rows = this.rowsFromExecute(result);
    return rows[0] ? this.rowToUser(rows[0]) : null;
  }

  /**
   * 飞书网页应用 OAuth：用授权码换 user_access_token，拉取用户身份并签发本站 JWT。
   * @see https://open.feishu.cn/document/sso/web-application-sso/login-overview
   */
  async loginWithFeishu(code: string, redirectUri: string) {
    const appId = this.getFeishuAppId();
    const appSecret = this.getFeishuAppSecret();
    if (!appId || !appSecret) {
      throw new ServiceUnavailableException('未配置飞书应用凭证（FEISHU_APP_ID / FEISHU_APP_SECRET）');
    }
    const trimmedCode = code.trim();
    const trimmedRedirect = redirectUri.trim();
    if (!trimmedCode || !trimmedRedirect) {
      throw new BadRequestException('缺少 code 或 redirect_uri');
    }

    const tokenRes = await fetch('https://open.feishu.cn/open-apis/authen/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: appId,
        client_secret: appSecret,
        code: trimmedCode,
        redirect_uri: trimmedRedirect,
      }),
    });
    const tokenJson = (await tokenRes.json()) as {
      code?: number;
      access_token?: string;
      msg?: string;
      error?: string;
      error_description?: string;
    };
    if (tokenJson.code !== 0 || !tokenJson.access_token) {
      const detail =
        tokenJson.msg ||
        tokenJson.error_description ||
        tokenJson.error ||
        `飞书换取 access_token 失败（HTTP ${tokenRes.status}）`;
      throw new UnauthorizedException(detail);
    }

    const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const userJson = (await userRes.json()) as {
      code?: number;
      msg?: string;
      data?: { open_id?: string; name?: string; email?: string; enterprise_email?: string };
    };
    if (userJson.code !== 0 || !userJson.data?.open_id) {
      throw new UnauthorizedException(userJson.msg || '获取飞书用户信息失败');
    }

    const { open_id: openId, name, email, enterprise_email: enterpriseEmail } = userJson.data;
    const displayName =
      typeof name === 'string' && name.trim() !== '' ? name.trim() : '飞书用户';
    const emailNorm =
      typeof email === 'string' && email.trim() !== ''
        ? email.trim()
        : typeof enterpriseEmail === 'string' && enterpriseEmail.trim() !== ''
          ? enterpriseEmail.trim()
          : null;

    let user = await this.getUserByFeishuOpenId(openId);
    if (!user) {
      const username = `feishu_${openId}`;
      const existing = await this.getUserByUsername(username);
      if (existing) {
        await this.db.execute(sql`
          UPDATE rd_users
          SET feishu_open_id = ${openId},
              full_name = COALESCE(full_name, ${displayName}),
              email = COALESCE(email, ${emailNorm}),
              updated_at = NOW()
          WHERE id = ${existing.id};
        `);
        user = await this.getUserByFeishuOpenId(openId);
      } else {
        await this.createUser(username, randomBytes(32).toString('hex'), {
          name: displayName,
          email: emailNorm ?? undefined,
          accessRoleId: null,
        });
        await this.db.execute(sql`
          UPDATE rd_users SET feishu_open_id = ${openId} WHERE username = ${username};
        `);
        user = await this.getUserByFeishuOpenId(openId);
      }
    }
    if (!user) {
      throw new UnauthorizedException('创建或关联飞书用户失败');
    }

    const token = signAuthToken(
      {
        userId: user.id,
        username: user.username,
      },
      {
        secret: this.getJwtSecret(),
        expiresInSec: this.getJwtExpireSec(),
      }
    );

    return {
      token,
      user: this.rowToUserView(user as unknown as Record<string, unknown>),
    };
  }
}
