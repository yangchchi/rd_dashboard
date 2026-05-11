import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { IAuthenticatedUser } from './auth-context';
import { AuthService } from './auth.service';
import { IS_PUBLIC_ROUTE } from './public.decorator';

type RequestWithAuthUser = Request & { user?: IAuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuthUser>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('未登录或登录已过期');
    }

    request.user = await this.authService.authenticateToken(token);
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const raw = request.headers.authorization;
    if (!raw) return null;
    const [scheme, token] = raw.split(' ');
    if (!/^bearer$/i.test(scheme || '') || !token?.trim()) return null;
    return token.trim();
  }
}
