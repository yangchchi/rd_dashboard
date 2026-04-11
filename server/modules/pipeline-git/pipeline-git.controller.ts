import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  PipelineGitService,
  type IFetchPipelineCommitsPayload,
  type IPipelineCommitRecord,
  type IPublishPipelineDocsPayload,
  type IPublishPipelineDocsResult,
} from './pipeline-git.service';

@Controller(['pipeline-git', 'api/pipeline-git'])
export class PipelineGitController {
  constructor(private readonly pipelineGitService: PipelineGitService) {}

  @Get('commits')
  async commits(
    @Query('gitUrl') gitUrl?: string,
    @Query('branch') branch?: string,
    @Query('limit') limit?: string
  ): Promise<IPipelineCommitRecord[]> {
    const payload: IFetchPipelineCommitsPayload = {
      gitUrl: gitUrl || '',
      branch: branch || '',
      limit: limit ? Number(limit) : undefined,
    };
    return this.pipelineGitService.fetchPipelineCommits(payload);
  }

  @Post('publish')
  async publish(
    @Body() payload: IPublishPipelineDocsPayload
  ): Promise<IPublishPipelineDocsResult> {
    return this.pipelineGitService.publishPipelineDocs(payload);
  }
}
