import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import JSZip from 'jszip';
import { buildZipContentDisposition } from './rd-download-header';

import {
  RdService,
  type IAcceptanceRecordRow,
  type IBountyTaskRow,
  type IPrdRow,
  type IPipelineTaskRow,
  type IProductRow,
  type IRequirementRow,
  type ISpecRow,
} from './rd.service';

@Controller(['rd', 'api/rd'])
export class RdController {
  constructor(private readonly rd: RdService) {}

  private timestamp() {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  @Get('requirements')
  listRequirements(): Promise<IRequirementRow[]> {
    return this.rd.listRequirements();
  }

  @Get('requirements/:id')
  getRequirement(@Param('id') id: string) {
    return this.rd.getRequirement(id);
  }

  @Put('requirements')
  upsertRequirement(@Body() body: Partial<IRequirementRow> & { id: string }) {
    return this.rd.upsertRequirement(body);
  }

  @Post('requirements/:id/accept-task')
  acceptRequirementTask(
    @Param('id') id: string,
    @Body() body: { role: 'pm' | 'tm'; userId: string; userName?: string },
  ) {
    return this.rd.acceptRequirementTask(id, body);
  }

  @Delete('requirements/:id')
  deleteRequirement(@Param('id') id: string) {
    return this.rd.deleteRequirement(id);
  }

  @Get('prds')
  listPrds(): Promise<IPrdRow[]> {
    return this.rd.listPrds();
  }

  @Get('prds/:id')
  getPrd(@Param('id') id: string) {
    return this.rd.getPrd(id);
  }

  @Put('prds')
  upsertPrd(@Body() body: Partial<IPrdRow> & { id: string; requirementId: string }) {
    return this.rd.upsertPrd(body);
  }

  @Delete('prds/:id')
  deletePrd(@Param('id') id: string) {
    return this.rd.deletePrd(id);
  }

  @Post('prds/:id/submit-review')
  submitPrdReview(
    @Param('id') id: string,
    @Body() body: { reviewer?: string; comment?: string; actorUserId?: string }
  ) {
    return this.rd.submitPrdForReview(id, body?.reviewer, body?.comment, body?.actorUserId);
  }

  @Post('prds/:id/review')
  reviewPrd(
    @Param('id') id: string,
    @Body() body: { status: 'approved' | 'rejected'; reviewer?: string; comment?: string; actorUserId?: string }
  ) {
    return this.rd.reviewPrd(id, body.status, body.reviewer, body.comment, body.actorUserId);
  }

  @Get('specs')
  listSpecs(): Promise<ISpecRow[]> {
    return this.rd.listSpecs();
  }

  @Get('specs/:id')
  getSpec(@Param('id') id: string) {
    return this.rd.getSpec(id);
  }

  @Put('specs')
  upsertSpec(@Body() body: Partial<ISpecRow> & { id: string; prdId: string }) {
    return this.rd.upsertSpec(body);
  }

  @Delete('specs/:id')
  deleteSpec(@Param('id') id: string) {
    return this.rd.deleteSpec(id);
  }

  @Post('specs/:id/submit-review')
  submitSpecReview(
    @Param('id') id: string,
    @Body() body: { reviewer?: string; comment?: string; actorUserId?: string }
  ) {
    return this.rd.submitSpecForReview(id, body?.reviewer, body?.comment, body?.actorUserId);
  }

  @Post('specs/:id/approve')
  approveSpec(
    @Param('id') id: string,
    @Body() body: { reviewer?: string; comment?: string; actorUserId?: string }
  ) {
    return this.rd.approveSpec(id, body?.reviewer, body?.comment, body?.actorUserId);
  }

  @Post('specs/:id/reject')
  rejectSpec(
    @Param('id') id: string,
    @Body() body: { reviewer?: string; comment?: string; actorUserId?: string }
  ) {
    return this.rd.rejectSpec(id, body?.reviewer, body?.comment, body?.actorUserId);
  }

  @Get('org-spec')
  getOrgSpec() {
    return this.rd.getOrgSpecConfig();
  }

  @Put('org-spec')
  saveOrgSpec(@Body() body: unknown) {
    return this.rd.saveOrgSpecConfig(body);
  }

  @Get('ai-skills')
  listAiSkills() {
    return this.rd.listAiSkills();
  }

  @Get('ai-skills/:id')
  getAiSkill(@Param('id') id: string) {
    return this.rd.getAiSkill(id);
  }

  @Put('ai-skills/:id')
  upsertAiSkill(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.rd.upsertAiSkill(id, body);
  }

  @Delete('ai-skills/:id')
  async resetAiSkill(@Param('id') id: string) {
    await this.rd.resetAiSkill(id);
    return { ok: true };
  }

  @Get('acceptance')
  listAcceptance(): Promise<IAcceptanceRecordRow[]> {
    return this.rd.listAcceptanceRecords();
  }

  @Post('acceptance')
  addAcceptance(@Body() body: IAcceptanceRecordRow) {
    return this.rd.addAcceptanceRecord(body);
  }

  @Get('pipeline-tasks')
  listPipelineTasks(): Promise<IPipelineTaskRow[]> {
    return this.rd.listPipelineTasks();
  }

  @Put('pipeline-tasks')
  upsertPipelineTask(@Body() body: Partial<IPipelineTaskRow> & { id: string; requirementId: string }) {
    return this.rd.upsertPipelineTask(body);
  }

  @Delete('pipeline-tasks/:id')
  deletePipelineTask(@Param('id') id: string) {
    return this.rd.deletePipelineTask(id);
  }

  @Get('pipeline-docs/download')
  async downloadPipelineDocs(
    @Query('requirementId') requirementId: string,
    @Res() res: Response,
  ) {
    const docs = await this.rd.buildPipelineDocsExport(requirementId);
    const requirement = await this.rd.getRequirement(requirementId);
    const zip = new JSZip();
    docs.forEach((doc) => {
      zip.file(doc.fileName, doc.content);
    });
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const zipBaseName = `${requirement?.title || requirementId || '未命名需求'}-${this.timestamp()}`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', buildZipContentDisposition(zipBaseName));
    res.send(buffer);
  }

  @Get('products')
  listProducts(): Promise<IProductRow[]> {
    return this.rd.listProducts();
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.rd.getProduct(id);
  }

  @Put('products')
  upsertProduct(@Body() body: Partial<IProductRow> & { id: string }) {
    return this.rd.upsertProduct(body);
  }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    return this.rd.deleteProduct(id);
  }

  @Get('bounty-tasks')
  listBountyTasks(): Promise<IBountyTaskRow[]> {
    return this.rd.listBountyTasks(false);
  }

  @Get('bounty-tasks/hunt')
  listHuntBountyTasks(): Promise<IBountyTaskRow[]> {
    return this.rd.listBountyTasks(true);
  }

  @Post('bounty-tasks')
  createBountyTask(@Body() body: Partial<IBountyTaskRow> & { requirementId: string; publisherId: string; title: string }) {
    return this.rd.createBountyTask(body);
  }

  @Post('bounty-tasks/:id/accept')
  acceptBountyTask(
    @Param('id') id: string,
    @Body() body: { role: 'pm' | 'tm'; hunterUserId: string; hunterUserName?: string }
  ) {
    return this.rd.acceptBountyTask(id, body);
  }

  @Post('bounty-tasks/:id/deliver')
  deliverBountyTask(@Param('id') id: string, @Body() body: { actorUserId: string }) {
    return this.rd.deliverBountyTask(id, body.actorUserId);
  }

  @Post('bounty-tasks/:id/settle')
  settleBountyTask(@Param('id') id: string) {
    return this.rd.settleBountyTask(id);
  }

  @Post('bounty-tasks/:id/reject')
  rejectBountyTask(@Param('id') id: string) {
    return this.rd.rejectBountyTask(id);
  }
}
