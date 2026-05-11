import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import JSZip from 'jszip';
import { buildZipContentDisposition } from './rd-download-header';
import { RequireAnyPermission, RequirePermissions } from '../auth/permissions.decorator';

import {
  RdService,
  type IAcceptanceRecordRow,
  type IAgentSessionRow,
  type IAgentTaskRow,
  type IAgentToolCallRow,
  type IAgentWorkspaceRow,
  type IAgentWorkspaceProvisionResult,
  type AgentTaskRole,
  type IContextPackRow,
  type IBountyTaskRow,
  type IPrdRow,
  type IPipelineTaskRow,
  type IPipelineRunRow,
  type IPipelineStepRunRow,
  type IProductRow,
  type IRequirementFlowEventRow,
  type IRequirementRow,
  type ISiteMessageRow,
  type ISpecRow,
} from './rd.service';

function writeSse(res: Response, event: unknown): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

@Controller(['rd', 'api/rd'])
export class RdController {
  constructor(private readonly rd: RdService) {}

  private timestamp() {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  @Get('requirements')
  @RequirePermissions('page.requirements')
  listRequirements(): Promise<IRequirementRow[]> {
    return this.rd.listRequirements();
  }

  @Get('requirements/:id')
  @RequirePermissions('page.requirements')
  getRequirement(@Param('id') id: string) {
    return this.rd.getRequirement(id);
  }

  @Get('requirements/:id/flow-events')
  @RequirePermissions('page.requirements')
  listRequirementFlowEvents(@Param('id') id: string): Promise<IRequirementFlowEventRow[]> {
    return this.rd.listRequirementFlowEvents(id);
  }

  @Put('requirements')
  @RequirePermissions('page.requirements')
  upsertRequirement(@Body() body: Partial<IRequirementRow> & { id: string }) {
    return this.rd.upsertRequirement(body);
  }

  @Post('requirements/:id/accept-task')
  @RequirePermissions('page.requirements')
  acceptRequirementTask(
    @Param('id') id: string,
    @Body() body: { role: 'pm' | 'tm'; userId: string; userName?: string },
  ) {
    return this.rd.acceptRequirementTask(id, body);
  }

  @Delete('requirements/:id')
  @RequirePermissions('page.requirements')
  deleteRequirement(@Param('id') id: string) {
    return this.rd.deleteRequirement(id);
  }

  @Get('prds')
  @RequirePermissions('page.prd')
  listPrds(): Promise<IPrdRow[]> {
    return this.rd.listPrds();
  }

  @Get('prds/:id')
  @RequirePermissions('page.prd')
  getPrd(@Param('id') id: string) {
    return this.rd.getPrd(id);
  }

  @Put('prds')
  @RequirePermissions('page.prd')
  upsertPrd(@Body() body: Partial<IPrdRow> & { id: string; requirementId: string }) {
    return this.rd.upsertPrd(body);
  }

  @Delete('prds/:id')
  @RequirePermissions('page.prd')
  deletePrd(@Param('id') id: string) {
    return this.rd.deletePrd(id);
  }

  @Post('prds/:id/submit-review')
  @RequirePermissions('page.prd')
  submitPrdReview(
    @Param('id') id: string,
    @Body() body: { reviewer?: string; comment?: string; actorUserId?: string }
  ) {
    return this.rd.submitPrdForReview(id, body?.reviewer, body?.comment, body?.actorUserId);
  }

  @Post('prds/:id/review')
  @RequirePermissions('page.prd')
  reviewPrd(
    @Param('id') id: string,
    @Body() body: { status: 'approved' | 'rejected'; reviewer?: string; comment?: string; actorUserId?: string }
  ) {
    return this.rd.reviewPrd(id, body.status, body.reviewer, body.comment, body.actorUserId);
  }

  @Get('specs')
  @RequirePermissions('page.spec')
  listSpecs(): Promise<ISpecRow[]> {
    return this.rd.listSpecs();
  }

  @Get('specs/:id')
  @RequirePermissions('page.spec')
  getSpec(@Param('id') id: string) {
    return this.rd.getSpec(id);
  }

  @Put('specs')
  @RequirePermissions('page.spec')
  upsertSpec(@Body() body: Partial<ISpecRow> & { id: string; prdId: string }) {
    return this.rd.upsertSpec(body);
  }

  @Delete('specs/:id')
  @RequirePermissions('page.spec')
  deleteSpec(@Param('id') id: string) {
    return this.rd.deleteSpec(id);
  }

  @Post('specs/:id/submit-review')
  @RequirePermissions('page.spec')
  submitSpecReview(
    @Param('id') id: string,
    @Body() body: { reviewer?: string; comment?: string; actorUserId?: string }
  ) {
    return this.rd.submitSpecForReview(id, body?.reviewer, body?.comment, body?.actorUserId);
  }

  @Post('specs/:id/approve')
  @RequirePermissions('page.spec')
  approveSpec(
    @Param('id') id: string,
    @Body() body: { reviewer?: string; comment?: string; actorUserId?: string }
  ) {
    return this.rd.approveSpec(id, body?.reviewer, body?.comment, body?.actorUserId);
  }

  @Post('specs/:id/reject')
  @RequirePermissions('page.spec')
  rejectSpec(
    @Param('id') id: string,
    @Body() body: { reviewer?: string; comment?: string; actorUserId?: string }
  ) {
    return this.rd.rejectSpec(id, body?.reviewer, body?.comment, body?.actorUserId);
  }

  @Get('org-spec')
  @RequirePermissions('page.org_spec')
  getOrgSpec() {
    return this.rd.getOrgSpecConfig();
  }

  @Put('org-spec')
  @RequirePermissions('page.org_spec')
  saveOrgSpec(@Body() body: unknown) {
    return this.rd.saveOrgSpecConfig(body);
  }

  @Get('context-packs')
  @RequirePermissions('page.pipeline')
  listContextPacks(@Query('requirementId') requirementId?: string): Promise<IContextPackRow[]> {
    return this.rd.listContextPacks(requirementId);
  }

  @Get('context-packs/:id')
  @RequirePermissions('page.pipeline')
  getContextPack(@Param('id') id: string) {
    return this.rd.getContextPack(id);
  }

  @Post('context-packs')
  @RequirePermissions('page.pipeline')
  createContextPack(
    @Body()
    body: {
      id?: string;
      requirementId: string;
      prdId?: string | null;
      specId?: string | null;
      pipelineRunId?: string | null;
      createdBy?: string | null;
    },
  ) {
    return this.rd.createContextPack(body);
  }

  @Get('ai-skills')
  @RequireAnyPermission('page.plugins', 'page.pipeline')
  listAiSkills() {
    return this.rd.listAiSkills();
  }

  @Get('ai-skills/:id')
  @RequireAnyPermission('page.plugins', 'page.pipeline')
  getAiSkill(@Param('id') id: string) {
    return this.rd.getAiSkill(id);
  }

  @Put('ai-skills/:id')
  @RequirePermissions('page.plugins')
  upsertAiSkill(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.rd.upsertAiSkill(id, body);
  }

  @Delete('ai-skills/:id')
  @RequirePermissions('page.plugins')
  async resetAiSkill(@Param('id') id: string) {
    await this.rd.resetAiSkill(id);
    return { ok: true };
  }

  @Get('acceptance')
  @RequirePermissions('page.acceptance')
  listAcceptance(): Promise<IAcceptanceRecordRow[]> {
    return this.rd.listAcceptanceRecords();
  }

  @Post('acceptance')
  @RequirePermissions('page.acceptance')
  addAcceptance(@Body() body: IAcceptanceRecordRow) {
    return this.rd.addAcceptanceRecord(body);
  }

  @Get('pipeline-tasks')
  @RequirePermissions('page.pipeline')
  listPipelineTasks(): Promise<IPipelineTaskRow[]> {
    return this.rd.listPipelineTasks();
  }

  @Put('pipeline-tasks')
  @RequirePermissions('page.pipeline')
  upsertPipelineTask(@Body() body: Partial<IPipelineTaskRow> & { id: string; requirementId: string }) {
    return this.rd.upsertPipelineTask(body);
  }

  @Delete('pipeline-tasks/:id')
  @RequirePermissions('page.pipeline')
  deletePipelineTask(@Param('id') id: string) {
    return this.rd.deletePipelineTask(id);
  }

  @Get('pipeline-runs')
  @RequirePermissions('page.pipeline')
  listPipelineRuns(@Query('requirementId') requirementId?: string): Promise<IPipelineRunRow[]> {
    return this.rd.listPipelineRuns(requirementId);
  }

  @Get('pipeline-runs/:id')
  @RequirePermissions('page.pipeline')
  getPipelineRun(@Param('id') id: string) {
    return this.rd.getPipelineRun(id);
  }

  @Post('pipeline-runs')
  @RequirePermissions('page.pipeline')
  createPipelineRun(@Body() body: Partial<IPipelineRunRow> & { id?: string; requirementId: string }) {
    return this.rd.createPipelineRun(body);
  }

  @Get('pipeline-runs/:id/steps')
  @RequirePermissions('page.pipeline')
  listPipelineStepRuns(@Param('id') id: string): Promise<IPipelineStepRunRow[]> {
    return this.rd.listPipelineStepRuns(id);
  }

  @Put('pipeline-step-runs')
  @RequirePermissions('page.pipeline')
  upsertPipelineStepRun(
    @Body()
    body: Partial<IPipelineStepRunRow> & { id?: string; pipelineRunId: string; stepKey: string; name: string }
  ) {
    return this.rd.upsertPipelineStepRun(body);
  }

  @Get('agent-sessions')
  @RequirePermissions('page.pipeline')
  listAgentSessions(
    @Query('pipelineRunId') pipelineRunId?: string,
    @Query('requirementId') requirementId?: string,
  ): Promise<IAgentSessionRow[]> {
    return this.rd.listAgentSessions({ pipelineRunId, requirementId });
  }

  @Get('agent-sessions/:id')
  @RequirePermissions('page.pipeline')
  getAgentSession(@Param('id') id: string) {
    return this.rd.getAgentSession(id);
  }

  @Post('agent-sessions')
  @RequirePermissions('page.pipeline')
  createAgentSession(
    @Body() body: Partial<IAgentSessionRow> & { id?: string; requirementId: string; title: string },
  ) {
    return this.rd.createAgentSession(body);
  }

  @Get('agent-sessions/:id/tasks')
  @RequirePermissions('page.pipeline')
  listAgentTasks(@Param('id') id: string): Promise<IAgentTaskRow[]> {
    return this.rd.listAgentTasks(id);
  }

  @Put('agent-tasks')
  @RequirePermissions('page.pipeline')
  upsertAgentTask(
    @Body()
    body: Partial<IAgentTaskRow> & { id?: string; sessionId: string; role: AgentTaskRole; title: string },
  ) {
    return this.rd.upsertAgentTask(body);
  }

  @Get('agent-sessions/:id/tool-calls')
  @RequirePermissions('page.pipeline')
  listAgentToolCalls(
    @Param('id') id: string,
    @Query('taskId') taskId?: string,
  ): Promise<IAgentToolCallRow[]> {
    return this.rd.listAgentToolCalls({ sessionId: id, taskId });
  }

  @Put('agent-tool-calls')
  @RequirePermissions('page.pipeline')
  upsertAgentToolCall(
    @Body() body: Partial<IAgentToolCallRow> & { id?: string; sessionId: string; toolName: string },
  ) {
    return this.rd.upsertAgentToolCall(body);
  }

  @Post('agent-tool-calls/prepare')
  @RequirePermissions('page.pipeline')
  prepareAgentToolCall(
    @Body()
    body: Partial<IAgentToolCallRow> & {
      id?: string;
      sessionId: string;
      toolName: string;
      toolCategory: IAgentToolCallRow['toolCategory'];
      timeoutMs?: number | null;
    },
  ) {
    return this.rd.prepareAgentToolCall(body);
  }

  @Post('agent-tool-calls/:id/approval')
  @RequirePermissions('page.pipeline')
  approveAgentToolCall(
    @Param('id') id: string,
    @Body() body: { approved: boolean; approver?: string | null; reason?: string | null },
  ) {
    return this.rd.approveAgentToolCall(id, body);
  }

  @Post('agent-tool-calls/:id/start')
  @RequirePermissions('page.pipeline')
  startAgentToolCall(@Param('id') id: string) {
    return this.rd.startAgentToolCall(id);
  }

  @Post('agent-tool-calls/:id/run-codex')
  @RequirePermissions('page.pipeline')
  async runAgentToolCallWithCodex(
    @Param('id') id: string,
    @Body() body: { prompt?: string | null; model?: string | null },
    @Res({ passthrough: false }) res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    try {
      for await (const event of this.rd.runAgentToolCallStream(id, body)) {
        writeSse(res, { status_code: '0', data: event });
      }
    } catch (error) {
      writeSse(res, {
        status_code: '1',
        error_msg: error instanceof Error ? error.message : String(error),
      });
    } finally {
      res.end();
    }
  }

  @Post('agent-tool-calls/:id/cancel-execution')
  @RequirePermissions('page.pipeline')
  cancelAgentToolCallExecution(@Param('id') id: string) {
    return this.rd.cancelAgentToolCallExecution(id);
  }

  @Post('agent-tool-calls/:id/finish')
  @RequirePermissions('page.pipeline')
  finishAgentToolCall(
    @Param('id') id: string,
    @Body()
    body: {
      exitCode?: number | null;
      outputSummary?: string | null;
      errorMessage?: string | null;
      durationMs?: number | null;
    },
  ) {
    return this.rd.finishAgentToolCall(id, body);
  }

  @Get('agent-sessions/:id/workspaces')
  @RequirePermissions('page.pipeline')
  listAgentWorkspaces(@Param('id') id: string): Promise<IAgentWorkspaceRow[]> {
    return this.rd.listAgentWorkspaces(id);
  }

  @Put('agent-workspaces')
  @RequirePermissions('page.pipeline')
  upsertAgentWorkspace(
    @Body()
    body: Partial<IAgentWorkspaceRow> & {
      id?: string;
      sessionId: string;
      repoUrl: string;
      baseBranch: string;
      agentBranch: string;
    },
  ) {
    return this.rd.upsertAgentWorkspace(body);
  }

  @Post('agent-workspaces/provision')
  @RequirePermissions('page.pipeline')
  provisionAgentWorkspace(
    @Body()
    body: {
      sessionId: string;
      repoUrl: string;
      baseBranch?: string | null;
      agentBranch?: string | null;
      workspaceRoot?: string | null;
      kind?: IAgentWorkspaceRow['kind'];
      createdBy?: string | null;
      productSlug?: string | null;
      sessionFolderName?: string | null;
    },
  ): Promise<IAgentWorkspaceProvisionResult> {
    return this.rd.provisionAgentWorkspace(body);
  }

  @Post('agent-workspaces/:id/ready')
  @RequirePermissions('page.pipeline')
  markAgentWorkspaceReady(
    @Param('id') id: string,
    @Body() body?: { baseCommit?: string | null; headCommit?: string | null; lockOwnerTaskId?: string | null },
  ) {
    return this.rd.markAgentWorkspaceReady(id, body);
  }

  @Post('agent-workspaces/:id/execute-lifecycle')
  @RequirePermissions('page.pipeline')
  executeAgentWorkspaceLifecycle(@Param('id') id: string): Promise<IAgentWorkspaceProvisionResult> {
    return this.rd.executeAgentWorkspaceLifecycle(id);
  }

  @Post('agent-workspaces/:id/cleanup')
  @RequirePermissions('page.pipeline')
  cleanupAgentWorkspace(@Param('id') id: string): Promise<IAgentWorkspaceProvisionResult> {
    return this.rd.cleanupAgentWorkspace(id);
  }

  @Get('pipeline-docs/download')
  @RequirePermissions('page.pipeline')
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
  @RequirePermissions('page.products')
  listProducts(): Promise<IProductRow[]> {
    return this.rd.listProducts();
  }

  @Get('products/:id')
  @RequirePermissions('page.products')
  getProduct(@Param('id') id: string) {
    return this.rd.getProduct(id);
  }

  @Put('products')
  @RequirePermissions('page.products')
  upsertProduct(@Body() body: Partial<IProductRow> & { id: string }) {
    return this.rd.upsertProduct(body);
  }

  @Delete('products/:id')
  @RequirePermissions('page.products')
  deleteProduct(@Param('id') id: string) {
    return this.rd.deleteProduct(id);
  }

  @Get('bounty-tasks')
  @RequirePermissions('page.bounty_hunt')
  listBountyTasks(): Promise<IBountyTaskRow[]> {
    return this.rd.listBountyTasks(false);
  }

  @Get('bounty-tasks/hunt')
  @RequirePermissions('page.bounty_hunt')
  listHuntBountyTasks(): Promise<IBountyTaskRow[]> {
    return this.rd.listBountyTasks(true);
  }

  @Get('site-messages')
  @RequirePermissions('page.bounty_hunt')
  listSiteMessages(@Query('userId') userId: string): Promise<ISiteMessageRow[]> {
    return this.rd.listSiteMessages(userId || '');
  }

  @Post('site-messages/:id/read')
  @RequirePermissions('page.bounty_hunt')
  markSiteMessageRead(
    @Param('id') id: string,
    @Body() body: { userId: string },
  ): Promise<ISiteMessageRow> {
    return this.rd.markSiteMessageRead(id, body?.userId || '');
  }

  @Post('bounty-tasks')
  @RequirePermissions('page.bounty_hunt')
  createBountyTask(@Body() body: Partial<IBountyTaskRow> & { requirementId: string; publisherId: string; title: string }) {
    return this.rd.createBountyTask(body);
  }

  @Post('bounty-tasks/:id/accept')
  @RequirePermissions('page.bounty_hunt')
  acceptBountyTask(
    @Param('id') id: string,
    @Body() body: { role: 'pm' | 'tm'; hunterUserId: string; hunterUserName?: string }
  ) {
    return this.rd.acceptBountyTask(id, body);
  }

  @Post('bounty-tasks/:id/deliver')
  @RequirePermissions('page.bounty_hunt')
  deliverBountyTask(@Param('id') id: string, @Body() body: { actorUserId: string }) {
    return this.rd.deliverBountyTask(id, body.actorUserId);
  }

  @Post('bounty-tasks/:id/settle')
  @RequirePermissions('page.bounty_hunt')
  settleBountyTask(@Param('id') id: string) {
    return this.rd.settleBountyTask(id);
  }

  @Post('bounty-tasks/:id/reject')
  @RequirePermissions('page.bounty_hunt')
  rejectBountyTask(@Param('id') id: string) {
    return this.rd.rejectBountyTask(id);
  }
}
