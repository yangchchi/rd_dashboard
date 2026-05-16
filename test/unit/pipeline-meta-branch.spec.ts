import {
  resolvePipelineExplicitAgentBranch,
  resolvePipelineGitBaseBranch,
  resolvePipelineWorkspaceBranchLabel,
} from '../../shared/pipeline-meta-branch';

describe('pipeline-meta-branch', () => {
  it('legacy: only branch → used as git base; agent branch not explicit', () => {
    expect(resolvePipelineGitBaseBranch({ branch: 'develop' })).toBe('develop');
    expect(resolvePipelineExplicitAgentBranch({ branch: 'develop' }, 'req_1')).toBeUndefined();
    expect(resolvePipelineWorkspaceBranchLabel({ branch: 'develop' }, 'req_1')).toBe('develop');
  });

  it('new: gitBaseBranch + branch → base vs workspace', () => {
    expect(resolvePipelineGitBaseBranch({ gitBaseBranch: 'main', branch: 'req_99' })).toBe('main');
    expect(resolvePipelineExplicitAgentBranch({ gitBaseBranch: 'main', branch: 'req_99' }, 'req_1')).toBe('req_99');
    expect(resolvePipelineWorkspaceBranchLabel({ gitBaseBranch: 'main', branch: 'req_99' }, 'req_1')).toBe('req_99');
  });

  it('new: empty branch falls back to requirement id', () => {
    expect(resolvePipelineExplicitAgentBranch({ gitBaseBranch: 'main', branch: '  ' }, 'req_abc')).toBe('req_abc');
    expect(resolvePipelineWorkspaceBranchLabel({ gitBaseBranch: 'main', branch: '' }, 'req_abc')).toBe('req_abc');
  });
});
