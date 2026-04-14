import { Inject, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
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
}
