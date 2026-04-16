import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';

import { AuthService } from './auth.service';

@Controller(['auth', 'api/auth'])
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: { username: string; password: string }) {
    return this.authService.register(body.username, body.password);
  }

  @Post('login')
  login(@Body() body: { username: string; password: string }) {
    return this.authService.login(body.username, body.password);
  }

  @Get('users')
  listUsers() {
    return this.authService.listUsers();
  }

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
    }
  ) {
    return this.authService.createUser(body.username, body.password, {
      name: body.name,
      email: body.email,
      phone: body.phone,
      accessRoleId: body.accessRoleId,
    });
  }

  @Patch('users/:id')
  patchUser(
    @Param('id') id: string,
    @Body() body: { accessRoleId?: string | null }
  ) {
    return this.authService.updateUserAccessRole(id, body.accessRoleId ?? null);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.authService.deleteUser(id);
  }

  @Get('access-roles')
  listAccessRoles() {
    return this.authService.listAccessRoles();
  }

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

  @Delete('access-roles/:id')
  deleteAccessRole(@Param('id') id: string) {
    return this.authService.deleteAccessRole(id);
  }

  @Post('access-roles/reset')
  resetAccessRoles() {
    return this.authService.resetAccessRoles();
  }
}
