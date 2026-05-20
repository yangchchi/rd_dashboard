import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { RdService, type IPrdRow, type IRequirementRow, type ISpecRow } from './rd.service';

const REQUIREMENT_ROW: IRequirementRow = {
  id: 'req-1',
  title: 'AI 需求',
  description: '实现自动编码',
  product: 'RD 平台',
  changeType: 'greenfield',
  bountyPoints: 0,
  pmCoins: 0,
  tmCoins: 0,
  taskAcceptances: [],
  priority: 'P0',
  expectedDate: '2026-05-10',
  status: 'ai_developing',
  submitter: 'u1',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
};

const PRD_ROW: IPrdRow = {
  id: 'prd-1',
  requirementId: 'req-1',
  title: '自动编码 PRD',
  background: '减少研发传递损耗',
  objectives: '让 Agent 能按 CP 执行',
  featureList: [
    {
      id: 'feat-1',
      name: '创建 ContextPack',
      description: '冻结执行输入',
      acceptanceCriteria: ['生成 manifest', '生成 checksum'],
    },
  ],
  nonFunctional: '可审计',
  status: 'approved',
  version: 1,
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
};

const SPEC_ROW: ISpecRow = {
  id: 'spec-1',
  prdId: 'prd-1',
  fsMarkdown: '# FS\n\n- API: /api/context-packs',
  tsMarkdown: '# TS\n\n- 表: rd_context_packs',
  cpMarkdown: '# CP\n\n- [ ] 编写代码\n- [ ] 运行测试',
  functionalSpec: {
    apis: [
      {
        path: '/api/context-packs',
        method: 'POST',
        description: '创建上下文包',
        requestParams: {},
        response: {},
      },
    ],
    uiComponents: [],
    interactions: [],
  },
  technicalSpec: {
    databaseSchema: { rd_context_packs: ['id', 'version'] },
    architecture: 'RdService 生成',
    thirdPartyIntegrations: [],
  },
  machineReadableJson: '{}',
  status: 'approved',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
};

const RUN_ROW = {
  id: 'run-1',
  pipeline_task_id: 'task-1',
  requirement_id: 'req-1',
  status: 'queued',
  trigger_mode: 'agent',
  context_snapshot: { gitUrl: 'git@example.com:demo/repo.git', branch: 'main' },
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
};

const ORG_SPEC = {
  id: 'org-spec-default',
  orgName: '研发平台',
  version: 3,
  defaultLanguage: 'typescript',
  languages: {},
};

describe('RdService context packs', () => {
  it('creates a versioned immutable context pack from requirement, PRD, spec, org spec, and pipeline run', async () => {
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([REQUIREMENT_ROW])
        .mockResolvedValueOnce([PRD_ROW])
        .mockResolvedValueOnce([SPEC_ROW])
        .mockResolvedValueOnce([RUN_ROW])
        .mockResolvedValueOnce([{ config: ORG_SPEC }])
        .mockResolvedValueOnce([{ max_version: 1 }])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([
          {
            id: 'ctx-req-1-2',
            requirement_id: 'req-1',
            prd_id: 'prd-1',
            spec_id: 'spec-1',
            pipeline_run_id: 'run-1',
            version: 2,
            checksum: 'checksum',
            manifest: {
              requirementId: 'req-1',
              prdId: 'prd-1',
              specId: 'spec-1',
              pipelineRunId: 'run-1',
              generatedAt: '2026-05-09T00:00:00.000Z',
              sources: { orgSpecVersion: 3 },
              files: [
                {
                  path: 'context/requirement.md',
                  kind: 'markdown',
                  bytes: 10,
                  sha256: createHash('sha256').update('x').digest('hex'),
                },
              ],
            },
            content: {
              'context/requirement.md': {
                path: 'context/requirement.md',
                kind: 'markdown',
                content: '# Requirement',
              },
            },
            created_at: '2026-05-09T00:00:00.000Z',
            created_by: 'tm-1',
          },
        ]),
    };
    const service = new RdService(db as never);

    const pack = await service.createContextPack({
      id: 'ctx-req-1-2',
      requirementId: 'req-1',
      prdId: 'prd-1',
      specId: 'spec-1',
      pipelineRunId: 'run-1',
      createdBy: 'tm-1',
    });

    expect(pack.id).toBe('ctx-req-1-2');
    expect(pack.version).toBe(2);
    expect(pack.manifest.requirementId).toBe('req-1');
    expect(pack.content['context/requirement.md'].kind).toBe('markdown');
    expect(db.execute).toHaveBeenCalledTimes(8);
  });

  it('rejects a context pack when the pipeline run points to a different requirement', async () => {
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([REQUIREMENT_ROW])
        .mockResolvedValueOnce([PRD_ROW])
        .mockResolvedValueOnce([SPEC_ROW])
        .mockResolvedValueOnce([{ ...RUN_ROW, requirement_id: 'req-other' }]),
    };
    const service = new RdService(db as never);

    await expect(
      service.createContextPack({
        requirementId: 'req-1',
        prdId: 'prd-1',
        specId: 'spec-1',
        pipelineRunId: 'run-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
