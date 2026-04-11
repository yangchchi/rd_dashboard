import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';

import {
  RdService,
  type IAcceptanceRecordRow,
  type IPrdRow,
  type IPipelineTaskRow,
  type IProductRow,
  type IRequirementRow,
  type ISpecRow,
} from './rd.service';

@Controller(['rd', 'api/rd'])
export class RdController {
  constructor(private readonly rd: RdService) {}

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
    @Body() body: { reviewer?: string; comment?: string }
  ) {
    return this.rd.submitPrdForReview(id, body?.reviewer, body?.comment);
  }

  @Post('prds/:id/review')
  reviewPrd(
    @Param('id') id: string,
    @Body() body: { status: 'approved' | 'rejected'; reviewer?: string; comment?: string }
  ) {
    return this.rd.reviewPrd(id, body.status, body.reviewer, body.comment);
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
    @Body() body: { reviewer?: string; comment?: string }
  ) {
    return this.rd.submitSpecForReview(id, body?.reviewer, body?.comment);
  }

  @Post('specs/:id/approve')
  approveSpec(
    @Param('id') id: string,
    @Body() body: { reviewer?: string; comment?: string }
  ) {
    return this.rd.approveSpec(id, body?.reviewer, body?.comment);
  }

  @Post('specs/:id/reject')
  rejectSpec(
    @Param('id') id: string,
    @Body() body: { reviewer?: string; comment?: string }
  ) {
    return this.rd.rejectSpec(id, body?.reviewer, body?.comment);
  }

  @Get('org-spec')
  getOrgSpec() {
    return this.rd.getOrgSpecConfig();
  }

  @Put('org-spec')
  saveOrgSpec(@Body() body: unknown) {
    return this.rd.saveOrgSpecConfig(body);
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
}
