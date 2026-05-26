import { Body, Controller, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { CapabilitiesService } from './capabilities.service';
import { RequirePermissions } from '../auth/permissions.decorator';
import type { IAuthenticatedUser } from '../auth/auth-context';

type RequestWithAuthUser = Request & { user?: IAuthenticatedUser };

interface CapabilityBody {
  action: string;
  params?: unknown;
  /** 浏览器个人设置中的模型凭据，优先于服务端 ARK_* 环境变量 */
  modelOverride?: {
    provider?: string;
    apiBaseUrl?: string;
    apiKey?: string;
    modelName?: string;
  };
}

@Controller('api/capability')
export class CapabilitiesController {
  constructor(private readonly capabilities: CapabilitiesService) {}

  @Post(':capabilityId')
  @RequirePermissions('action.ai.invoke')
  invoke(
    @Param('capabilityId') capabilityId: string,
    @Body() body: CapabilityBody,
    @Req() req: RequestWithAuthUser
  ) {
    return this.capabilities.invoke(
      capabilityId,
      body.action,
      body.params,
      body.modelOverride,
      req.user?.userId
    );
  }

  @Post(':capabilityId/stream')
  @RequirePermissions('action.ai.invoke')
  async stream(
    @Param('capabilityId') capabilityId: string,
    @Body() body: CapabilityBody,
    @Req() req: RequestWithAuthUser,
    @Res({ passthrough: false }) res: Response
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    for await (const line of this.capabilities.stream(
      capabilityId,
      body.action,
      body.params,
      body.modelOverride,
      req.user?.userId
    )) {
      res.write(line);
    }
    res.end();
  }
}
