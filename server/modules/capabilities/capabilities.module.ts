import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RdModule } from '../rd/rd.module';
import { CapabilitiesController } from './capabilities.controller';
import { CapabilitiesService } from './capabilities.service';

@Module({
  imports: [RdModule, AuthModule],
  controllers: [CapabilitiesController],
  providers: [CapabilitiesService],
})
export class CapabilitiesModule {}
