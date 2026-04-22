import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
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
    try {
      return await this.pipelineGitService.fetchPipelineCommits(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取 commit 记录失败';
      throw new BadRequestException(message);
    }
  }

  @Post('commits')
  async commitsPost(
    @Body() payload: IFetchPipelineCommitsPayload
  ): Promise<IPipelineCommitRecord[]> {
    try {
      return await this.pipelineGitService.fetchPipelineCommits(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取 commit 记录失败';
      throw new BadRequestException(message);
    }
  }

  @Post('publish')
  async publish(
    @Body() payload: IPublishPipelineDocsPayload
  ): Promise<IPublishPipelineDocsResult> {
    try {
      return await this.pipelineGitService.publishPipelineDocs(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : '提交流水线文档失败';
      throw new BadRequestException(message);
    }
  }
}
