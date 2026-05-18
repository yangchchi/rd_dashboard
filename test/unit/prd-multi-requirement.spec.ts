import { describe, expect, it } from 'vitest';
import {
  buildMultiPrdStoredTitle,
  buildMultiRequirementOriginalBlock,
  getPrdCoveredRequirementIds,
  isRequirementCoveredByAnyPrd,
  requirementsMatchProduct,
} from '../../web/src/lib/prd-multi-requirement';
import type { IRequirement } from '../../web/src/lib/rd-types';

const req = (partial: Partial<IRequirement> & Pick<IRequirement, 'id' | 'title'>): IRequirement => ({
  description: '',
  priority: 'P1',
  expectedDate: '2026-06-01',
  status: 'backlog',
  submitter: 'u1',
  createdAt: '',
  updatedAt: '',
  ...partial,
});

describe('prd-multi-requirement', () => {
  it('getPrdCoveredRequirementIds merges primary and linked', () => {
    expect(
      getPrdCoveredRequirementIds({
        requirementId: 'r1',
        linkedRequirementIds: ['r2', 'r1'],
      })
    ).toEqual(['r1', 'r2']);
  });

  it('isRequirementCoveredByAnyPrd checks linked ids', () => {
    const prds = [{ requirementId: 'r1', linkedRequirementIds: ['r2'] }];
    expect(isRequirementCoveredByAnyPrd('r2', prds)).toBe(true);
    expect(isRequirementCoveredByAnyPrd('r3', prds)).toBe(false);
  });

  it('requirementsMatchProduct uses product field', () => {
    const a = req({ id: 'a', title: 'A', product: 'p1' });
    const b = req({ id: 'b', title: 'B', product: 'p1' });
    const c = req({ id: 'c', title: 'C', product: 'p2' });
    expect(requirementsMatchProduct(a, b)).toBe(true);
    expect(requirementsMatchProduct(a, c)).toBe(false);
  });

  it('buildMultiRequirementOriginalBlock lists each requirement', () => {
    const block = buildMultiRequirementOriginalBlock(
      [
        req({ id: 'r1', title: '需求甲', description: '描述甲' }),
        req({ id: 'r2', title: '需求乙', description: '描述乙' }),
      ],
      ['所属产品：测试产品']
    );
    expect(block).toContain('需求 1：需求甲');
    expect(block).toContain('需求 2：需求乙');
    expect(block).toContain('产品公共设计');
  });

  it('buildMultiPrdStoredTitle formats merge title', () => {
    const title = buildMultiPrdStoredTitle(
      [
        req({ id: 'r1', title: '功能A', product: 'p1' }),
        req({ id: 'r2', title: '功能B', product: 'p1' }),
      ],
      [{ id: 'p1', name: 'AIGC平台', identifier: 'aigc', code: 'aigc', description: '', createdAt: '', updatedAt: '' }]
    );
    expect(title).toContain('合并PRD');
    expect(title).toContain('功能A');
    expect(title).toContain('AIGC平台');
  });
});
