import { Module } from '@nestjs/common';
import { PipelineGitController } from './pipeline-git.controller';
import { PipelineGitService } from './pipeline-git.service';

@Module({
  controllers: [PipelineGitController],
  providers: [PipelineGitService],
})
export class PipelineGitModule {}
