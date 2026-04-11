import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { DatabaseModule } from './database/database.module';
import { RdModule } from './modules/rd/rd.module';
import { PipelineGitModule } from './modules/pipeline-git/pipeline-git.module';
import { AuthModule } from './modules/auth/auth.module';
import { CapabilitiesModule } from './modules/capabilities/capabilities.module';

@Module({
  imports: [
    DatabaseModule,
    RdModule,
    PipelineGitModule,
    AuthModule,
    CapabilitiesModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
