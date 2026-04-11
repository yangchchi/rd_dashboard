import { Injectable } from '@nestjs/common';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface IPipelinePrdDocInput {
  id: string;
  title: string;
  requirementId: string;
  status: string;
  version?: number;
  updatedAt?: string;
  background?: string;
  objectives?: string;
  flowchart?: string;
  nonFunctional?: string;
  featureList?: Array<{
    id: string;
    name: string;
    description: string;
    acceptanceCriteria: string[];
  }>;
}

export interface IPipelineSpecDocInput {
  id: string;
  prdId: string;
  status: string;
  updatedAt?: string;
  machineReadableJson?: string | boolean;
  functionalSpec?: {
    apis?: Array<{
      path: string;
      method: string;
      description: string;
      requestParams: object;
      response: object;
    }>;
    uiComponents?: Array<{
      name: string;
      type: string;
      props: object;
      events: string[];
    }>;
    interactions?: Array<{
      trigger: string;
      action: string;
      condition?: string;
    }>;
  };
  technicalSpec?: {
    databaseSchema?: object | boolean;
    architecture?: string | boolean;
    thirdPartyIntegrations?: string[] | number;
  };
}

export interface IPublishPipelineDocsPayload {
  pipelineName: string;
  gitUrl: string;
  branch: string;
  remarks?: string;
  operator?: string;
  prds: IPipelinePrdDocInput[];
  specs: IPipelineSpecDocInput[];
}

export interface IPublishPipelineDocsResult {
  branch: string;
  commitHash: string;
  commitMessage: string;
  files: string[];
}

export interface IFetchPipelineCommitsPayload {
  gitUrl: string;
  branch: string;
  limit?: number;
}

export interface IPipelineCommitRecord {
  hash: string;
  author: string;
  date: string;
  message: string;
}

@Injectable()
export class PipelineGitService {
  async fetchPipelineCommits(payload: IFetchPipelineCommitsPayload): Promise<IPipelineCommitRecord[]> {
    const gitUrl = (payload.gitUrl || '').trim();
    const branch = (payload.branch || '').trim();
    const limit = Number.isFinite(payload.limit) ? Number(payload.limit) : 20;
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    if (!gitUrl) throw new Error('gitUrl 不能为空');
    if (!branch) throw new Error('branch 不能为空');

    const tempRoot = await mkdtemp(join(tmpdir(), 'rd-pipeline-commits-'));
    const repoDir = join(tempRoot, 'repo');
    try {
      await this.runGit(['clone', '--depth', String(safeLimit), '--branch', branch, gitUrl, repoDir], tempRoot);
      const { stdout } = await this.runGit(
        ['log', `-${safeLimit}`, '--pretty=format:%h%x1f%an%x1f%ad%x1f%s', '--date=iso-strict'],
        repoDir
      );
      return stdout
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const [hash = '', author = '', date = '', message = ''] = line.split('\x1f');
          return { hash, author, date, message };
        })
        .filter((item) => item.hash);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  async publishPipelineDocs(payload: IPublishPipelineDocsPayload): Promise<IPublishPipelineDocsResult> {
    const gitUrl = (payload.gitUrl || '').trim();
    const branch = (payload.branch || '').trim();
    const pipelineName = (payload.pipelineName || '').trim();
    if (!gitUrl) throw new Error('gitUrl 不能为空');
    if (!branch) throw new Error('branch 不能为空');
    if (!pipelineName) throw new Error('pipelineName 不能为空');
    if (!payload.prds?.length) throw new Error('至少提交一个 PRD');
    if (!payload.specs?.length) throw new Error('至少提交一个规格');

    const tempRoot = await mkdtemp(join(tmpdir(), 'rd-pipeline-'));
    const repoDir = join(tempRoot, 'repo');
    try {
      await this.runGit(['clone', '--depth', '1', gitUrl, repoDir], tempRoot);
      await this.runGit(['checkout', '-B', branch], repoDir);

      const docsDirName = `${this.slugify(pipelineName)}-${this.timestamp()}`;
      const docsBaseDir = join(repoDir, 'docs', 'ai-pipeline', docsDirName);
      await mkdir(docsBaseDir, { recursive: true });

      const files: string[] = [];

      for (const prd of payload.prds) {
        const fileName = `prd-${this.slugify(prd.id)}.md`;
        const relativePath = join('docs', 'ai-pipeline', docsDirName, fileName);
        await writeFile(join(docsBaseDir, fileName), this.renderPrdMarkdown(prd, payload), 'utf8');
        files.push(relativePath.replace(/\\/g, '/'));
      }

      for (const spec of payload.specs) {
        const fileName = `spec-${this.slugify(spec.id)}.md`;
        const relativePath = join('docs', 'ai-pipeline', docsDirName, fileName);
        await writeFile(join(docsBaseDir, fileName), this.renderSpecMarkdown(spec, payload), 'utf8');
        files.push(relativePath.replace(/\\/g, '/'));
      }

      await this.runGit(['add', '.'], repoDir);

      const commitMessage = `docs: 同步流水线 ${pipelineName} 的PRD和规格`;
      await this.runGit(['commit', '-m', commitMessage], repoDir);
      await this.runGit(['push', 'origin', `HEAD:${branch}`], repoDir);
      const { stdout } = await this.runGit(['rev-parse', '--short', 'HEAD'], repoDir);
      return {
        branch,
        commitHash: stdout.trim(),
        commitMessage,
        files,
      };
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  private async runGit(args: string[], cwd: string) {
    return execFileAsync('git', args, { cwd, timeout: 120000 });
  }

  private slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled';
  }

  private timestamp() {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  private renderPrdMarkdown(prd: IPipelinePrdDocInput, payload: IPublishPipelineDocsPayload) {
    const featureList = Array.isArray(prd.featureList) ? prd.featureList : [];
    const features = featureList.length
      ? featureList
          .map((feature, idx) => {
            const criteriaList = Array.isArray(feature.acceptanceCriteria) ? feature.acceptanceCriteria : [];
            const criteria = criteriaList.length
              ? criteriaList.map((item) => `  - ${item}`).join('\n')
              : '  - 无';
            return `### ${idx + 1}. ${feature.name}\n\n- ID: ${feature.id}\n- 描述: ${feature.description || '无'}\n- 验收标准:\n${criteria}\n`;
          })
          .join('\n')
      : '无功能项';

    return `# PRD 文档：${prd.title || prd.id}

## 元信息

- 流水线：${payload.pipelineName}
- PRD ID：${prd.id}
- 关联需求：${prd.requirementId}
- 状态：${prd.status}
- 版本：v${prd.version ?? 1}
- 更新时间：${prd.updatedAt || new Date().toISOString()}

## 背景

${prd.background || '无（当前仅同步基础元信息）'}

## 目标

${prd.objectives || '无'}

## 业务流程图说明

${prd.flowchart || '无'}

## 功能列表

${features}

## 非功能需求

${prd.nonFunctional || '无'}

## 附加说明

${payload.remarks || '无'}
`;
  }

  private renderSpecMarkdown(spec: IPipelineSpecDocInput, payload: IPublishPipelineDocsPayload) {
    const functionalSpec = spec.functionalSpec || {};
    const technicalSpec = spec.technicalSpec || {};
    const apisList = Array.isArray(functionalSpec.apis) ? functionalSpec.apis : [];
    const uiList = Array.isArray(functionalSpec.uiComponents) ? functionalSpec.uiComponents : [];
    const interactionsList = Array.isArray(functionalSpec.interactions) ? functionalSpec.interactions : [];
    const integrations = Array.isArray(technicalSpec.thirdPartyIntegrations)
      ? technicalSpec.thirdPartyIntegrations
      : [];

    const apis = apisList.length
      ? apisList
          .map((api, idx) => {
            return `### API ${idx + 1}
- 路径：\`${api.path}\`
- 方法：\`${api.method}\`
- 描述：${api.description || '无'}
- 请求参数：
\`\`\`json
${JSON.stringify(api.requestParams || {}, null, 2)}
\`\`\`
- 响应：
\`\`\`json
${JSON.stringify(api.response || {}, null, 2)}
\`\`\`
`;
          })
          .join('\n')
      : '无 API 定义';

    const components = uiList.length
      ? uiList
          .map((item, idx) => {
            return `### 组件 ${idx + 1}
- 名称：${item.name}
- 类型：${item.type}
- 事件：${item.events.join(', ') || '无'}
- Props：
\`\`\`json
${JSON.stringify(item.props || {}, null, 2)}
\`\`\`
`;
          })
          .join('\n')
      : '无 UI 组件定义';

    const interactions = interactionsList.length
      ? interactionsList
          .map((item, idx) => `- ${idx + 1}. 触发：${item.trigger}；动作：${item.action}${item.condition ? `；条件：${item.condition}` : ''}`)
          .join('\n')
      : '无交互定义';

    return `# 规格文档：${spec.id}

## 元信息

- 流水线：${payload.pipelineName}
- 规格 ID：${spec.id}
- 关联 PRD：${spec.prdId}
- 状态：${spec.status}
- 更新时间：${spec.updatedAt || new Date().toISOString()}

## 功能规格（FS）

### API 规范

${apis}

### UI 组件规范

${components}

### 交互逻辑

${interactions}

## 技术规格（TS）

### 数据库 Schema
\`\`\`json
${JSON.stringify(typeof technicalSpec.databaseSchema === 'object' ? technicalSpec.databaseSchema : { raw: technicalSpec.databaseSchema ?? null }, null, 2)}
\`\`\`

### 系统架构

${typeof technicalSpec.architecture === 'string' ? technicalSpec.architecture : '无'}

### 第三方集成

${integrations.length ? integrations.map((item) => `- ${item}`).join('\n') : '无'}

## Machine-Readable JSON
\`\`\`json
${typeof spec.machineReadableJson === 'string' ? spec.machineReadableJson : JSON.stringify({ machineReadableJson: spec.machineReadableJson ?? null }, null, 2)}
\`\`\`
`;
  }
}
