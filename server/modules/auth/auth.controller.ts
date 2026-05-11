import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';

import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { RequirePermissions } from './permissions.decorator';

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
}
