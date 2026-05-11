import { formatSpecValidationIssues, validateSpecForReview } from '../../../shared/spec-validation';
import { RdService, type ISpecRow } from './rd.service';

const VALID_SPEC: ISpecRow = {
  id: 'spec-1',
  prdId: 'prd-1',
  fsMarkdown: '# FS',
  tsMarkdown: '# TS',
  cpMarkdown: [
    '# Implementation Plan',
    'Files: `server/app.ts`',
    'Run: npm test',
    'Rollback: revert the change',
  ].join('\n'),
  functionalSpec: {
    apis: [
      {
        path: '/api/demo',
        method: 'POST',
        description: '创建演示资源',
        requestParams: { name: 'string' },
        response: { id: 'string' },
      },
    ],
    uiComponents: [
      {
        name: 'DemoForm',
        type: 'form',
        props: { title: 'string' },
        events: ['submit'],
      },
    ],
    interactions: [
      {
        trigger: 'submit',
        action: 'call /api/demo',
      },
    ],
  },
  technicalSpec: {
    databaseSchema: { demo: { id: 'text' } },
    architecture: 'NestJS API + React UI',
    thirdPartyIntegrations: [],
  },
  machineReadableJson: '{}',
  status: 'draft',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
  createdBy: 'tm-1',
  updatedBy: 'tm-1',
};

function specToRow(spec: ISpecRow): Record<string, unknown> {
  return {
    id: spec.id,
    prd_id: spec.prdId,
    fs_markdown: spec.fsMarkdown,
    ts_markdown: spec.tsMarkdown,
    cp_markdown: spec.cpMarkdown,
    functional_spec: spec.functionalSpec,
    technical_spec: spec.technicalSpec,
    machine_readable_json: spec.machineReadableJson,
    status: spec.status,
    reviews: spec.reviews ?? [],
    created_at: spec.createdAt,
    updated_at: spec.updatedAt,
    created_by: spec.createdBy,
    updated_by: spec.updatedBy,
  };
}

const PRD_ROW = {
  id: 'prd-1',
  requirement_id: 'req-1',
  title: 'PRD',
  background: '',
  objectives: '',
  flowchart: null,
  feature_list: [],
  non_functional: '',
  status: 'approved',
  version: 1,
  author: 'pm-1',
  reviews: [],
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
};

describe('RdService spec validation', () => {
  it('allows spec review submission when machine-readable fields have warnings', async () => {
    const invalidSpec: ISpecRow = {
      ...VALID_SPEC,
      fsMarkdown: '',
      functionalSpec: {
        ...VALID_SPEC.functionalSpec,
        apis: [],
      },
    };
    const reviewingSpec = { ...invalidSpec, status: 'reviewing' as const };
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([specToRow(invalidSpec)])
        .mockResolvedValueOnce([PRD_ROW])
        .mockResolvedValueOnce([specToRow(invalidSpec)])
        .mockResolvedValueOnce([specToRow(invalidSpec)])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([specToRow(reviewingSpec)]),
    };
    const service = new RdService(db as never);

    const validation = validateSpecForReview(invalidSpec);
    const result = await service.submitSpecForReview('spec-1', '技术经理');

    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'fsMarkdown' }),
        expect.objectContaining({ path: 'functionalSpec.apis' }),
      ]),
    );
    expect(result?.status).toBe('reviewing');
    expect(db.execute).toHaveBeenCalledTimes(6);
  });

  it('formats incomplete machine-readable fields as non-blocking suggestions', () => {
    const validation = validateSpecForReview({
      fsMarkdown: '# FS',
      tsMarkdown: '# TS',
      cpMarkdown: 'Run: npm test',
      functionalSpec: { apis: [], uiComponents: [], interactions: [] },
      technicalSpec: { databaseSchema: {}, architecture: '', thirdPartyIntegrations: [] },
      machineReadableJson: '{}',
    });
    const message = formatSpecValidationIssues(validation.issues);

    expect(validation.valid).toBe(false);
    expect(message).toContain('functionalSpec.apis: 建议补充至少一个 API');
    expect(message).toContain('cpMarkdown: 建议补充 CP 回滚方案');
    expect(message).not.toMatch(/校验未通过|必须|不能为空|至少定义/);
  });

  it('allows spec review submission when schema requirements are satisfied', async () => {
    const reviewingSpec = { ...VALID_SPEC, status: 'reviewing' as const };
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([specToRow(VALID_SPEC)])
        .mockResolvedValueOnce([PRD_ROW])
        .mockResolvedValueOnce([specToRow(VALID_SPEC)])
        .mockResolvedValueOnce([specToRow(VALID_SPEC)])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([specToRow(reviewingSpec)]),
    };
    const service = new RdService(db as never);

    const result = await service.submitSpecForReview('spec-1', '技术经理');

    expect(result?.status).toBe('reviewing');
    expect(db.execute).toHaveBeenCalledTimes(6);
  });
});
