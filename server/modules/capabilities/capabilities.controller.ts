import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import { CapabilitiesService } from './capabilities.service';

interface CapabilityBody {
  action: string;
  params?: unknown;
}

@Controller('api/capability')
export class CapabilitiesController {
  constructor(private readonly capabilities: CapabilitiesService) {}

  @Post(':capabilityId')
  invoke(@Param('capabilityId') capabilityId: string, @Body() body: CapabilityBody) {
    return this.capabilities.invoke(capabilityId, body.action, body.params);
  }

  @Post(':capabilityId/stream')
  async stream(
    @Param('capabilityId') capabilityId: string,
    @Body() body: CapabilityBody,
    @Res({ passthrough: false }) res: Response
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    for await (const line of this.capabilities.stream(capabilityId, body.action, body.params)) {
      res.write(line);
    }
    res.end();
  }
}
