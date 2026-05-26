import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { RequirePermissions } from './permissions.decorator';
import type { IAuthenticatedUser } from './auth-context';
import type { IUserModelConfig } from '../../../shared/model-credentials';
import type { IUserGitCredentials, IUserProfileInput } from '../../../shared/user-settings';

type RequestWithAuthUser = Request & { user?: IAuthenticatedUser };

@Controller(['auth', 'api/auth'])
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() body: { username: string; password: string }) {
    return this.authService.register(body.username, body.password);
  }

  @Public()
  @Post('login')
  login(@Body() body: { username: string; password: string }) {
    return this.authService.login(body.username, body.password);
  }

  /** 飞书 OAuth 授权码换本站 JWT（App Secret 仅服务端使用） */
  @Public()
  @Post('feishu/login')
  feishuLogin(@Body() body: { code: string; redirect_uri: string }) {
    return this.authService.loginWithFeishu(body.code, body.redirect_uri);
  }

  @RequirePermissions('page.users')
  @Get('users')
  listUsers() {
    return this.authService.listUsers();
  }

  @RequirePermissions('action.users.create')
  @Post('users')
  createUser(
    @Body()
    body: {
      username: string;
      password: string;
      name?: string;
      email?: string;
      phone?: string;
      accessRoleId?: string | null;
      accessRoleIds?: string[];
    }
  ) {
    return this.authService.createUser(body.username, body.password, {
      name: body.name,
      email: body.email,
      phone: body.phone,
      accessRoleId: body.accessRoleId,
      accessRoleIds: body.accessRoleIds,
    });
  }

  @RequirePermissions('action.users.assign_role')
  @Patch('users/:id')
  patchUser(
    @Param('id') id: string,
    @Body() body: { accessRoleIds?: string[]; accessRoleId?: string | null },
  ) {
    return this.authService.patchUserAccessRoles(id, body);
  }

  @RequirePermissions('action.users.delete')
  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.authService.deleteUser(id);
  }

  @RequirePermissions('page.roles')
  @Get('access-roles')
  listAccessRoles() {
    return this.authService.listAccessRoles();
  }

  @RequirePermissions('page.roles')
  @Put('access-roles/:id')
  putAccessRole(
    @Param('id') id: string,
    @Body()
    body: {
      name: string;
      description?: string;
      permissionIds?: string[];
      builtIn?: boolean;
    }
  ) {
    return this.authService.upsertAccessRole(id, body);
  }

  @RequirePermissions('page.roles')
  @Delete('access-roles/:id')
  deleteAccessRole(@Param('id') id: string) {
    return this.authService.deleteAccessRole(id);
  }

  @RequirePermissions('page.roles')
  @Post('access-roles/reset')
  resetAccessRoles() {
    return this.authService.resetAccessRoles();
  }

  /** 当前登录用户的模型配置（登录即可访问） */
  @Get('me/model-config')
  getMyModelConfig(@Req() req: RequestWithAuthUser) {
    const userId = req.user?.userId;
    if (!userId) return null;
    return this.authService.getUserModelConfig(userId);
  }

  @Put('me/model-config')
  putMyModelConfig(@Req() req: RequestWithAuthUser, @Body() body: Partial<IUserModelConfig>) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('未登录');
    }
    return this.authService.upsertUserModelConfig(userId, body);
  }

  @Delete('me/model-config')
  async deleteMyModelConfig(@Req() req: RequestWithAuthUser) {
    const userId = req.user?.userId;
    if (userId) {
      await this.authService.deleteUserModelConfig(userId);
    }
  }

  /** 当前登录用户的基本信息与主题偏好 */
  @Get('me/profile')
  getMyProfile(@Req() req: RequestWithAuthUser) {
    const userId = req.user?.userId;
    if (!userId) return null;
    return this.authService.getUserProfile(userId);
  }

  @Put('me/profile')
  putMyProfile(@Req() req: RequestWithAuthUser, @Body() body: IUserProfileInput) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('未登录');
    }
    return this.authService.updateUserProfile(userId, body);
  }

  @Get('me/git-credentials')
  getMyGitCredentials(@Req() req: RequestWithAuthUser) {
    const userId = req.user?.userId;
    if (!userId) return null;
    return this.authService.getUserGitCredentials(userId);
  }

  @Put('me/git-credentials')
  putMyGitCredentials(@Req() req: RequestWithAuthUser, @Body() body: Partial<IUserGitCredentials>) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('未登录');
    }
    return this.authService.upsertUserGitCredentials(userId, body);
  }

  @Delete('me/git-credentials')
  async deleteMyGitCredentials(@Req() req: RequestWithAuthUser) {
    const userId = req.user?.userId;
    if (userId) {
      await this.authService.deleteUserGitCredentials(userId);
    }
  }
}
