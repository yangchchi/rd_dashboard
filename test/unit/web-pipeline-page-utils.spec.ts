import {
  canStartAgentToolCall,
  extractPipelineErrorMessage,
  findProductForRequirement,
  formatPipelineFileTimestamp,
  isValidPipelineGitUrl,
  publishedDocsFromPublishResult,
  shouldCreateAgentToolCallRetry,
} from '../../web/src/lib/pipeline-page-utils';
import type { IProduct, IRequirement } from '../../web/src/lib/rd-types';

const requirement = {
  id: 'req-1',
  title: '需求',
  description: '',
  product: '研发平台',
  bountyPoints: 0,
  priority: 'P1',
  expectedDate: '2026-05-10',
  status: 'backlog',
  submitter: 'u1',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
} satisfies IRequirement;

const products: IProduct[] = [
  {
    id: 'prod-1',
    name: '研发平台',
    description: '',
    gitUrl: 'git@example.com:rd/platform.git',
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
  },
];

describe('pipeline page utils', () => {
  it('validates supported git urls', () => {
    expect(isValidPipelineGitUrl('https://example.com/team/repo.git')).toBe(true);
    expect(isValidPipelineGitUrl('git@example.com:team/repo.git')).toBe(true);
    expect(isValidPipelineGitUrl('https://example.com/team/repo')).toBe(false);
  });

  it('matches product by requirement product name or id', () => {
    expect(findProductForRequirement(requirement, products)?.id).toBe('prod-1');
    expect(
      findProductForRequirement({ ...requirement, product: 'prod-1' }, products)?.name
    ).toBe('研发平台');
  });

  it('extracts nested error messages and publish documents', () => {
    expect(extractPipelineErrorMessage({ error: { message: '失败原因' } }, '默认')).toBe('失败原因');
    expect(publishedDocsFromPublishResult({ documents: [{ type: 'prd', path: 'prd.md' }] })).toEqual([
      { type: 'prd', path: 'prd.md' },
    ]);
  });

  it('formats file timestamps deterministically', () => {
    expect(formatPipelineFileTimestamp(new Date('2026-05-09T06:07:08.000Z'))).toMatch(
      /^\d{14}$/
    );
  });

  it('separates runnable agent tool call statuses from retry-only terminal statuses', () => {
    expect(canStartAgentToolCall('pending', 'not_required')).toBe(true);
    expect(canStartAgentToolCall('pending', 'approved')).toBe(true);
    expect(canStartAgentToolCall('pending')).toBe(true);
    expect(canStartAgentToolCall('awaiting_approval', 'pending')).toBe(false);
    expect(canStartAgentToolCall('awaiting_approval')).toBe(false);
    expect(canStartAgentToolCall('pending', 'pending')).toBe(false);
    expect(canStartAgentToolCall('pending', 'rejected')).toBe(false);
    expect(canStartAgentToolCall('failed')).toBe(false);
    expect(canStartAgentToolCall('succeeded')).toBe(false);
    expect(canStartAgentToolCall('cancelled')).toBe(false);

    expect(shouldCreateAgentToolCallRetry('failed')).toBe(true);
    expect(shouldCreateAgentToolCallRetry('succeeded')).toBe(true);
    expect(shouldCreateAgentToolCallRetry('cancelled')).toBe(true);
    expect(shouldCreateAgentToolCallRetry('running')).toBe(false);
  });
});
