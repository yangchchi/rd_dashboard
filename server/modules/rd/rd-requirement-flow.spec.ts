import { BadRequestException } from '@nestjs/common';

import { RdService, type IRequirementRow } from './rd.service';

const BASE_REQUIREMENT: IRequirementRow = {
  id: 'req-1',
  title: '需求',
  description: '描述',
  bountyPoints: 0,
  pmCoins: 0,
  tmCoins: 0,
  taskAcceptances: [],
  priority: 'P1',
  expectedDate: '2026-05-10',
  status: 'backlog',
  submitter: 'u1',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
  createdBy: 'u1',
  updatedBy: 'u1',
};

function createService(existing: IRequirementRow | null) {
  const db = {
    execute: jest
      .fn()
      .mockResolvedValueOnce(existing ? [existing] : [])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([existing ?? BASE_REQUIREMENT]),
  };
  return { service: new RdService(db as never), db };
}

describe('RdService requirement flow', () => {
  it('rejects illegal status jumps', async () => {
    const { service, db } = createService(BASE_REQUIREMENT);

    await expect(
      service.upsertRequirement({
        id: 'req-1',
        status: 'ai_developing',
        updatedBy: 'tm-1',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('records a flow event when status changes', async () => {
    const { service, db } = createService(BASE_REQUIREMENT);

    await service.upsertRequirement({
      id: 'req-1',
      status: 'prd_writing',
      updatedBy: 'pm-1',
    });

    expect(db.execute).toHaveBeenCalledTimes(4);
  });
});
