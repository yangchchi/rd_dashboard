import { Module } from '@nestjs/common';

import { RdController } from './rd.controller';
import { RdService } from './rd.service';

@Module({
  controllers: [RdController],
  providers: [RdService],
  exports: [RdService],
})
export class RdModule {}
