import { BadRequestException } from '@nestjs/common';
import { RdService } from './rd.service';

const PRODUCT_ROW = {
  id: 'prod-1',
  name: '钛合金杯',
  description: '',
  status: 'active',
  git_url: 'git@example.com:cup.git',
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
};

describe('RdService product baselines', () => {
  it('creates a product baseline with capabilities', async () => {
    const getProduct = jest.fn().mockResolvedValue({
      id: 'prod-1',
      name: '钛合金杯',
      description: '',
      status: 'active',
      gitUrl: 'git@example.com:cup.git',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z',
    });
    const getProductBaseline = jest.fn().mockResolvedValue({
      id: 'bl-1',
      productId: 'prod-1',
      version: 'v1.0',
      gitRef: 'abc123',
      gitUrl: 'git@example.com:cup.git',
      asBuiltMarkdown: '杯体、密封圈',
      frozenAt: '2026-05-09T00:00:00.000Z',
      capabilities: [
        {
          id: 'cap-1',
          productId: 'prod-1',
          baselineId: 'bl-1',
          baselineVersion: 'v1.0',
          domain: '杯盖',
          name: '密封圈',
          description: '已有密封',
          interfaces: [{ kind: 'api' as const, ref: '/api/lid/seal' }],
          source: 'manual' as const,
          sortOrder: 0,
          createdAt: '2026-05-09T00:00:00.000Z',
        },
      ],
      createdAt: '2026-05-09T00:00:00.000Z',
    });
    const db = {
      execute: jest.fn().mockResolvedValue([]),
    };
    const service = new RdService(db as never);
    jest.spyOn(service, 'getProduct').mockImplementation(getProduct);
    jest.spyOn(service, 'getProductBaseline').mockImplementation(getProductBaseline);

    const baseline = await service.createProductBaseline({
      id: 'bl-1',
      productId: 'prod-1',
      version: 'v1.0',
      gitRef: 'abc123',
      capabilities: [
        {
          domain: '杯盖',
          name: '密封圈',
          description: '已有密封',
          interfaces: [{ kind: 'api', ref: '/api/lid/seal' }],
        },
      ],
    });
    expect(baseline.version).toBe('v1.0');
    expect(baseline.capabilities?.length).toBe(1);
    expect(db.execute).toHaveBeenCalled();
  });

  it('rejects brownfield requirement without baseline', async () => {
    const db = {
      execute: jest.fn().mockResolvedValue([]),
    };
    const service = new RdService(db as never);
    await expect(
      service.upsertRequirement({
        id: 'req-new',
        title: '加把手',
        description: '在现有杯上加把手',
        productId: 'prod-1',
        changeType: 'enhancement',
        priority: 'P1',
        expectedDate: '2026-06-01',
        status: 'backlog',
        submitter: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
