import { Injectable } from '@nestjs/common';
import { mkdtemp, mkdir, rm, writeFile, chmod } from 'node:fs/promises';
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
  /** 功能规格 Markdown 正文（优先作为 FS 独立文档） */
  fsMarkdown?: string;
  /** 技术规格 Markdown 正文（优先作为 TS 独立文档） */
  tsMarkdown?: string;
  /** 编程计划 Markdown（与下载包中 plan.md 一致） */
  cpMarkdown?: string;
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
  requirementTitle?: string;
  gitUrl: string;
  gitUsername?: string;
  gitPat?: string;
  branch: string;
  remarks?: string;
  operator?: string;
  prds: IPipelinePrdDocInput[];
  specs: IPipelineSpecDocInput[];
}

export interface IPublishedDocumentRef {
  path: string;
  kind: 'prd' | 'fs' | 'ts' | 'cp';
  id: string;
  title: string;
}

export interface IPublishPipelineDocsResult {
  branch: string;
  commitHash: string;
  commitMessage: string;
  files: string[];
  /** 本次写入的文档清单（用于前端拼 Git Web 链接） */
  documents: IPublishedDocumentRef[];
}

export interface IFetchPipelineCommitsPayload {
  gitUrl: string;
  branch: string;
  limit?: number;
  gitUsername?: string;
  gitPat?: string;
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
    const gitUsername = (payload.gitUsername || '').trim();
    const gitPat = (payload.gitPat || '').trim();
    const limit = Number.isFinite(payload.limit) ? Number(payload.limit) : 20;
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    if (!gitUrl) throw new Error('gitUrl 不能为空');
    if (!branch) throw new Error('branch 不能为空');

    const tempRoot = await mkdtemp(join(tmpdir(), 'rd-pipeline-commits-'));
    const repoDir = join(tempRoot, 'repo');
    try {
      const gitEnv = await this.buildGitCredentialEnv(tempRoot, gitUrl, gitUsername, gitPat);
      await this.runGitWithRetry(
        ['clone', '--depth', String(safeLimit), '--branch', branch, gitUrl, repoDir],
        tempRoot,
        gitEnv
      );
      const { stdout } = await this.runGit(
        ['log', `-${safeLimit}`, '--pretty=format:%h%x1f%an%x1f%ad%x1f%s', '--date=iso-strict'],
        repoDir,
        gitEnv
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
    const gitUsername = (payload.gitUsername || '').trim();
    const gitPat = (payload.gitPat || '').trim();
    if (!gitUrl) throw new Error('gitUrl 不能为空');
    if (!branch) throw new Error('branch 不能为空');
    if (!pipelineName) throw new Error('pipelineName 不能为空');
    if (!payload.prds?.length) throw new Error('至少提交一个 PRD');
    if (!payload.specs?.length) throw new Error('至少提交一个规格');

    const tempRoot = await mkdtemp(join(tmpdir(), 'rd-pipeline-'));
    const repoDir = join(tempRoot, 'repo');
    try {
      const gitEnv = await this.buildGitCredentialEnv(tempRoot, gitUrl, gitUsername, gitPat);
      await this.runGitWithRetry(['clone', '--depth', '1', gitUrl, repoDir], tempRoot, gitEnv);
      await this.runGit(['checkout', '-B', branch], repoDir, gitEnv);

      const docsDirName = `${this.slugify(payload.requirementTitle || pipelineName)}-${this.timestamp()}`;
      const docsBaseDir = join(repoDir, 'docs', 'ai-pipeline', docsDirName);
      await mkdir(docsBaseDir, { recursive: true });
      await this.runGit(['config', 'user.name', payload.operator || 'rd-pipeline-bot'], repoDir, gitEnv);
      await this.runGit(
        ['config', 'user.email', 'rd-pipeline-bot@users.noreply.local'],
        repoDir,
        gitEnv
      );

      const files: string[] = [];
      const documents: IPublishedDocumentRef[] = [];

      const latestPrd = payload.prds[0];
      const latestSpec = payload.specs[0];
      const prdFileName = 'prd.md';
      const fsFileName = 'fs-spec.md';
      const tsFileName = 'ts-spec.md';
      const cpFileName = 'plan.md';
      const prdRel = join('docs', 'ai-pipeline', docsDirName, prdFileName).replace(/\\/g, '/');
      const fsRel = join('docs', 'ai-pipeline', docsDirName, fsFileName).replace(/\\/g, '/');
      const tsRel = join('docs', 'ai-pipeline', docsDirName, tsFileName).replace(/\\/g, '/');
      const cpRel = join('docs', 'ai-pipeline', docsDirName, cpFileName).replace(/\\/g, '/');
      await writeFile(join(docsBaseDir, prdFileName), this.renderPrdMarkdown(latestPrd, payload), 'utf8');
      await writeFile(join(docsBaseDir, fsFileName), this.renderFsMarkdown(latestSpec, payload), 'utf8');
      await writeFile(join(docsBaseDir, tsFileName), this.renderTsMarkdown(latestSpec, payload), 'utf8');
      await writeFile(join(docsBaseDir, cpFileName), this.renderCpMarkdown(latestSpec, payload), 'utf8');
      files.push(prdRel, fsRel, tsRel, cpRel);
      documents.push(
        { path: prdRel, kind: 'prd', id: latestPrd.id, title: 'PRD' },
        { path: fsRel, kind: 'fs', id: latestSpec.id, title: 'FS' },
        { path: tsRel, kind: 'ts', id: latestSpec.id, title: 'TS' },
        { path: cpRel, kind: 'cp', id: latestSpec.id, title: 'CP' },
      );

      await this.runGit(['add', '.'], repoDir, gitEnv);

      const commitMessage = `docs: 同步流水线 ${pipelineName} 的 PRD / FS / TS / CP`;
      await this.runGit(['commit', '-m', commitMessage], repoDir, gitEnv);
      await this.runGitWithRetry(['push', 'origin', `HEAD:${branch}`], repoDir, gitEnv);
      const { stdout } = await this.runGit(['rev-parse', '--short', 'HEAD'], repoDir, gitEnv);
      return {
        branch,
        commitHash: stdout.trim(),
        commitMessage,
        files,
        documents,
      };
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  private async runGit(args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
    try {
      return await execFileAsync('git', args, { cwd, timeout: 120000, env });
    } catch (error) {
      const e = error as {
        stderr?: string;
        stdout?: string;
        message?: string;
        code?: string | number;
      };
      const detail = [e?.stderr, e?.stdout, e?.message]
        .map((item) => String(item || '').trim())
        .find((item) => item.length > 0);
      const cmd = `git ${args.join(' ')}`;
      throw new Error(detail ? `${cmd} 执行失败：${detail}` : `${cmd} 执行失败`);
    }
  }

  private async runGitWithRetry(
    args: string[],
    cwd: string,
    env?: NodeJS.ProcessEnv,
    maxAttempts = 3
  ) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.runGit(args, cwd, env);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const isTransientNetworkError =
          /couldn['’]t connect to server|timed out|timeout|econnreset|connection reset|tls|ssl/i.test(
            message
          );
        if (!isTransientNetworkError || attempt >= maxAttempts) {
          throw error;
        }
        await this.sleep(800 * attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private async buildGitCredentialEnv(
    tempRoot: string,
    gitUrl: string,
    gitUsername?: string,
    gitPat?: string
  ): Promise<NodeJS.ProcessEnv | undefined> {
    const token = (gitPat || '').trim();
    if (!token) return undefined;
    if (!/^https?:\/\//i.test(gitUrl)) {
      throw new Error('使用 PAT 认证时，gitUrl 必须为 HTTPS 地址');
    }
    const askPassFile = join(tempRoot, 'git-askpass.sh');
    const script = `#!/bin/sh
case "$1" in
  *sername*) printf '%s\n' "$RD_GIT_USERNAME" ;;
  *assword*) printf '%s\n' "$RD_GIT_PAT" ;;
  *) printf '\n' ;;
esac
`;
    await writeFile(askPassFile, script, 'utf8');
    await chmod(askPassFile, 0o700);
    return {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: askPassFile,
      RD_GIT_USERNAME: (gitUsername || '').trim() || 'git',
      RD_GIT_PAT: token,
    };
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
    const meta = `## 元信息

- 流水线：${payload.pipelineName}
- PRD ID：${prd.id}
- 关联需求：${prd.requirementId}
- 状态：${prd.status}
- 版本：v${prd.version ?? 1}
- 更新时间：${prd.updatedAt || new Date().toISOString()}
`;

    const bg = (prd.background || '').trim();
    if (bg) {
      return `# PRD：${prd.title || prd.id}

${meta}

---

# PRD 正文（Markdown）

${bg}

---

## 附加说明

${payload.remarks || '无'}
`;
    }

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

${meta}

## 背景

${prd.background || '无'}

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

  private renderFsMarkdown(spec: IPipelineSpecDocInput, payload: IPublishPipelineDocsPayload) {
    const meta = `## 元信息

- 流水线：${payload.pipelineName}
- 规格 ID：${spec.id}
- 关联 PRD：${spec.prdId}
- 状态：${spec.status}
- 更新时间：${spec.updatedAt || new Date().toISOString()}
`;
    const body = (spec.fsMarkdown || '').trim();
    if (body) {
      return `# 功能规格（FS）：${spec.id}

${meta}

---

# FS 正文（Markdown）

${body}
`;
    }
    return `# 功能规格（FS）：${spec.id}

${meta}

${this.renderFsStructuredSection(spec)}
`;
  }

  private renderTsMarkdown(spec: IPipelineSpecDocInput, payload: IPublishPipelineDocsPayload) {
    const meta = `## 元信息

- 流水线：${payload.pipelineName}
- 规格 ID：${spec.id}
- 关联 PRD：${spec.prdId}
- 状态：${spec.status}
- 更新时间：${spec.updatedAt || new Date().toISOString()}
`;
    const body = (spec.tsMarkdown || '').trim();
    if (body) {
      return `# 技术规格（TS）：${spec.id}

${meta}

---

# TS 正文（Markdown）

${body}

---

## Machine-Readable JSON（附录）

\`\`\`json
${typeof spec.machineReadableJson === 'string' ? spec.machineReadableJson : JSON.stringify({ machineReadableJson: spec.machineReadableJson ?? null }, null, 2)}
\`\`\`
`;
    }
    return `# 技术规格（TS）：${spec.id}

${meta}

${this.renderTsStructuredSection(spec)}

## Machine-Readable JSON
\`\`\`json
${typeof spec.machineReadableJson === 'string' ? spec.machineReadableJson : JSON.stringify({ machineReadableJson: spec.machineReadableJson ?? null }, null, 2)}
\`\`\`
`;
  }

  private renderCpMarkdown(spec: IPipelineSpecDocInput, payload: IPublishPipelineDocsPayload) {
    const meta = `## 元信息

- 流水线：${payload.pipelineName}
- 规格 ID：${spec.id}
- 关联 PRD：${spec.prdId}
- 状态：${spec.status}
- 更新时间：${spec.updatedAt || new Date().toISOString()}
`;
    const body = (spec.cpMarkdown || '').trim();
    if (body) {
      return body;
    }
    return `# 编程计划（CP）

${meta}

（尚未生成编程计划正文；请在规格编辑页使用「AI 生成 CP」或手工编写，内容与仓库根 \`plan.md\` 风格一致即可。）

## FS / TS 参考（自动生成占位）

### FS

${(spec.fsMarkdown || '').trim() || this.renderFsStructuredSection(spec)}

### TS

${(spec.tsMarkdown || '').trim() || this.renderTsStructuredSection(spec)}
`;
  }

  private renderFsStructuredSection(spec: IPipelineSpecDocInput) {
    const functionalSpec = spec.functionalSpec || {};
    const apisList = Array.isArray(functionalSpec.apis) ? functionalSpec.apis : [];
    const uiList = Array.isArray(functionalSpec.uiComponents) ? functionalSpec.uiComponents : [];
    const interactionsList = Array.isArray(functionalSpec.interactions) ? functionalSpec.interactions : [];

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
- 事件：${(item.events || []).join(', ') || '无'}
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

    return `## 功能规格（结构化导出）

### API 规范

${apis}

### UI 组件规范

${components}

### 交互逻辑

${interactions}
`;
  }

  private renderTsStructuredSection(spec: IPipelineSpecDocInput) {
    const technicalSpec = spec.technicalSpec || {};
    const integrations = Array.isArray(technicalSpec.thirdPartyIntegrations)
      ? technicalSpec.thirdPartyIntegrations
      : [];

    return `## 技术规格（结构化导出）

### 数据库 Schema
\`\`\`json
${JSON.stringify(typeof technicalSpec.databaseSchema === 'object' ? technicalSpec.databaseSchema : { raw: technicalSpec.databaseSchema ?? null }, null, 2)}
\`\`\`

### 系统架构

${typeof technicalSpec.architecture === 'string' ? technicalSpec.architecture : '无'}

### 第三方集成

${integrations.length ? integrations.map((item) => `- ${item}`).join('\n') : '无'}
`;
  }
}
