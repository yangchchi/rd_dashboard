# AI 研发提效平台项目优化建议

> Review 日期：2026-05-09  
> Review 范围：`README.md`、前端 `web/src`、后端 `server/modules`、共享类型 `shared`、现有 `docs`、工程脚本与配置。

## 1. 当前项目判断

本项目已经不是单纯静态原型，已经具备 AI 研发提效平台的基础骨架：

- 前端使用 Next.js App Router，覆盖需求、PRD、规格、流水线、验收、产品主数据、赏金猎场、插件配置、用户/角色/权限等页面。
- 后端使用 NestJS，已经有 `rd`、`auth`、`capabilities`、`pipeline-git` 等模块。
- 数据层已接入 PostgreSQL/Drizzle 运行时查询，需求、PRD、规格、流水线、产品、赏金、站内信、AI Skill 配置等核心表由后端启动时自动创建/升级。
- AI 能力已有两条路径：`server/capabilities/*.json` 能力配置 + `CapabilitiesService` 服务端流式调用；前端还有 `ai-skill-engine.ts` 可直接调用 Ark。
- 已有飞书 OAuth 登录、角色权限管理页面、PRD/FS/TS/CP 文档同步到 Git 的能力。
- 现有 `docs/ai-pipeline-architecture-design.md` 和 `docs/ai-pipeline-development-plan.md` 已明确“流水线需要从展示记录升级为可执行编排引擎”的方向。

因此，后续优化重点不应只停留在“补页面”，而应从原型平台升级为可信、可审计、可执行的 AI 研发提效系统。

## 2. 优先级总览

| 优先级 | 优化主题 | 目标 |
| --- | --- | --- |
| P0 | 服务端鉴权与权限闭环 | 防止绕过前端直接调用 API，建立平台可信边界 |
| P0 | 数据模型与迁移治理 | 从启动时自愈建表升级为可版本化迁移，降低生产风险 |
| P0 | AI 调用安全与服务端化 | 避免浏览器暴露模型 Key，统一 AI 能力网关、日志和成本控制 |
| P0 | 流水线真实执行引擎 | 从“任务记录/文档同步”升级为真实 codegen/build/test/gate/deploy |
| P0 | Codex Agent 式自动编码工作台 | 将“对话式派活、沙箱执行、diff 审核、自动测试、部署验收”搬入 AI 流水线 |
| P0 | 构建质量门禁 | 取消生产构建忽略类型/ESLint，避免缺陷进入部署 |
| P1 | 领域状态机与审计 | 固化需求到发布的状态流转规则，形成可追溯闭环 |
| P1 | 页面拆分与组件复用 | 降低大页面维护成本，提升迭代速度 |
| P1 | 结构化规格与校验 | 让 FS/TS/CP 真正 Machine-Readable，提升 AI 交付质量 |
| P1 | 可观测性与错误诊断 | 让 AI/流水线失败可解释、可重试、可复盘 |
| P2 | 产品化体验与指标体系 | 面向 PM/TM/干系人提供效率、质量、成本看板 |

## 3. P0 优化项

### 3.1 补齐服务端鉴权与权限控制

**现状**

- 前端 `RequireAuth` 只检查 localStorage 中的 `__rd_auth_token`。
- `useAccessControl` 和 `RequireRouteAccess` 主要控制前端菜单与页面可见性。
- 后端 `AuthController`、`RdController`、`PipelineGitController`、`CapabilitiesController` 未看到统一的 `JwtAuthGuard` / `PermissionsGuard`。
- `auth.utils.ts` 已具备 JWT 签发和校验能力，但没有形成 Nest 全局鉴权链路。

**风险**

- 用户可以绕过前端页面，直接请求 `/api/rd/*`、`/api/auth/users`、`/api/pipeline-git/*` 等接口。
- 角色权限可以被前端本地存储影响，无法作为服务端安全依据。
- Git 发布、用户管理、角色管理、删除需求等高风险操作缺少服务端强制校验。

**建议动作**

1. 新增 `JwtAuthGuard`，从 `Authorization: Bearer <token>` 校验 JWT，并注入 `request.user`。
2. 新增 `@RequirePermissions(...ids)` 装饰器和 `PermissionsGuard`，从数据库读取用户角色与权限做服务端校验。
3. 所有业务 Controller 默认要求登录，仅保留 `/api/auth/login`、`/api/auth/register`、`/api/auth/feishu/login` 等公开接口。
4. 对高风险接口增加动作级权限：
   - 用户创建/删除/分配角色：`action.users.*`
   - PRD 审核：`action.prd.review`
   - Spec 审核：`action.spec.review`
   - 流水线发布/回滚：`action.pipeline.publish`、`action.pipeline.rollback`
   - 插件配置：`action.plugins.manage`
5. 将 `created_by` / `updated_by` 从前端传入改为服务端根据 `request.user.userId` 写入。
6. 前端仍保留菜单隐藏，但只作为体验优化，不作为安全边界。

**验收标准**

- 未登录请求业务接口返回 401。
- 无权限用户访问敏感接口返回 403。
- 前端篡改 localStorage 角色后，服务端权限不受影响。
- 审计字段由服务端当前用户写入。

### 3.2 数据模型从“启动时建表”升级为“版本化迁移”

**现状**

- `server/database/schema.ts` 仍是模板/示例为主，没有承载真实业务表定义。
- `rd.service.ts` 和 `auth.service.ts` 在 `onModuleInit` 中执行大量 `CREATE TABLE IF NOT EXISTS`、`ALTER TABLE ADD COLUMN IF NOT EXISTS`、`UPDATE`、`GRANT`。
- 表结构、索引、默认数据、历史迁移逻辑混在业务 Service 中。

**风险**

- 生产启动与数据库变更耦合，启动慢或部分失败会影响服务可用性。
- 迁移不可审计，不易回滚，也无法清晰知道某个环境处于哪个 schema 版本。
- 业务 Service 文件过大，数据库治理和业务逻辑互相污染。
- 多人协作时容易发生“本地可跑、测试/生产不可迁移”的问题。

**建议动作**

1. 将真实表结构迁移到 Drizzle schema：
   - `rd_requirements`
   - `rd_prds`
   - `rd_specs`
   - `rd_pipeline_tasks`
   - `rd_pipeline_runs`
   - `rd_pipeline_step_runs`
   - `rd_pipeline_step_logs`
   - `rd_pipeline_artifacts`
   - `rd_pipeline_quality_gates`
   - `rd_products`
   - `rd_users`
   - `rd_access_roles`
   - `rd_user_access_roles`
   - `rd_ai_skill_configs`
2. 引入迁移目录，例如 `server/database/migrations/`，使用 `drizzle-kit generate` / `drizzle-kit migrate` 或项目内统一迁移脚本。
3. 将启动时 `ensureTables()` 缩减为轻量健康检查，不再承担 schema 演进。
4. 默认角色、默认 AI Skill、默认组织规范等初始化数据改成 seed 脚本，并保证幂等。
5. 给关键字段加数据库约束：
   - `status` 使用 enum/check constraint。
   - `priority` 使用 enum/check constraint。
   - 需求状态流转表或状态机约束。
   - 外键与唯一索引显式声明。
6. 建立环境迁移流程：开发、测试、生产均通过同一迁移命令升级。

**验收标准**

- 新环境可通过 `npm run db:migrate && npm run db:seed` 初始化。
- 服务启动不再执行大规模 DDL。
- 任意 schema 变更都有 migration 文件和 Review 记录。

### 3.3 AI 调用统一走服务端能力网关

**现状**

- `web/src/lib/ai-skill-engine.ts` 在浏览器端读取 `NEXT_PUBLIC_ARK_API_KEY` / `VITE_ARK_API_KEY` 并直接请求 Ark。
- `server/modules/capabilities/capabilities.service.ts` 也能读取 `ARK_API_KEY` 并服务端调用 Ark。
- `CapabilitiesService.invoke()` 对分类、冲突检测仍存在 mock/演示结果。
- AI 能力配置同时存在 `server/capabilities/*.json`、`shared/ai-skill-defaults.ts`、数据库 `rd_ai_skill_configs`，需要进一步收敛。

**风险**

- `NEXT_PUBLIC_*` 会进入前端 bundle，模型 Key 可能暴露给浏览器用户。
- 客户端直连模型无法统一权限、审计、限流、成本统计、失败重试。
- mock 回退容易让用户误以为已经完成真实 AI 分析。
- 多处配置来源容易出现能力名称、Prompt、模型、工具配置不一致。

**建议动作**

1. 禁止生产环境使用浏览器端模型 Key，移除或仅保留开发诊断开关。
2. 所有 AI 调用统一走后端 `/api/capability/:id` 和 `/stream`。
3. 建立 `AiGatewayService`：
   - provider 适配：Ark、OpenAI-compatible、自建模型。
   - 统一流式协议。
   - 统一错误码。
   - 超时、重试、熔断。
   - token/cost 统计。
   - Prompt 版本记录。
4. `rd_ai_skill_configs` 作为运行时唯一配置源，`shared/ai-skill-defaults.ts` 仅作为 seed 默认值。
5. 对 mock 能力增加明确环境保护：
   - `AI_DEMO_MODE=true` 时允许 mock。
   - 生产环境如果缺少模型 Key，应返回可诊断错误，而不是静默演示输出。
6. AI 输出入库前做结构化校验和敏感信息清洗。

**验收标准**

- 浏览器 Network 中看不到真实模型 Key。
- 每次 AI 调用都有 `skillId`、`model`、`promptVersion`、`operator`、`duration`、`token/cost`、`status` 记录。
- 生产环境不会返回“演示输出/占位文本”作为真实结果。

### 3.4 将流水线升级为真实执行引擎

**现状**

- `AIPipelinePage.tsx` 已展示任务、日志、测试报告、质量指标、Git commits。
- `pipeline-git.service.ts` 可以 clone 仓库、写入 PRD/FS/TS/CP 文档、commit 并 push。
- 现有文档已明确要建设 `PipelineRun`、`StepRun`、Runner、Quality Gate。
- 但当前 `rd_pipeline_tasks` 更像“流水线任务卡片”，缺少真正的执行编排与步骤级运行实例。

**风险**

- 平台展示“AI开发中/自测中/构建中/部署中”，但没有真实执行依据，会削弱用户信任。
- 失败无法定位到具体步骤、输入、输出、错误码和工件。
- 后续接入代码代理、CI/CD、部署系统时，现有单表模型难以承载。

**建议动作**

1. 按现有架构文档落地最小可执行版本：
   - `rd_pipeline_runs`
   - `rd_pipeline_step_runs`
   - `rd_pipeline_step_logs`
   - `rd_pipeline_artifacts`
   - `rd_pipeline_quality_gates`
   - `rd_pipeline_events`
2. 新增后端模块：
   - `pipeline-orchestrator`
   - `pipeline-runner-gateway`
   - `pipeline-quality-gate`
   - `pipeline-events`
3. 先实现标准步骤：
   - `plan`
   - `publish_docs`
   - `codegen`
   - `build`
   - `test`
   - `quality_gate`
   - `deploy`
4. 引入队列执行，建议第一阶段使用 Redis + BullMQ；后续规模化再考虑 Temporal/Argo。
5. 前端从“任务级进度条”升级为“Run + Step 双层视图”：
   - 当前步骤
   - 每步状态
   - attempt 次数
   - 日志尾随
   - 工件链接
   - 门禁结果
   - 可重试/取消/回滚动作
6. 所有外部工具接入走 Adapter：
   - Git Adapter
   - AI Codegen Adapter
   - CI Adapter
   - Deploy Adapter
   - Notification Adapter

**验收标准**

- 一条需求可以创建 PipelineRun，并自动推进多个 StepRun。
- 每个 StepRun 有日志、耗时、输入/输出引用、失败错误码。
- build/test/quality 任一步失败可重试，并保留 attempt 历史。
- 质量门禁失败能阻断发布。

### 3.5 搭建 Codex Agent Client 式自动编码工作台

**产品目标**

将 Codex Agent Client 的核心交互方式搬到本项目的“交付引擎/AI 流水线”中：用户不是只点一个“生成代码”按钮，而是像管理一个远程研发同事一样，通过对话派活、查看计划、观察执行、批准高风险操作、Review diff、触发测试与部署、最后验收上线。

这个方向可以借鉴两类公开产品形态：

- Codex App 的关键模式：多 Agent 并行、独立线程、隔离 worktree/sandbox、diff review、后台长任务、Skills 和 Automations。
- 飞书妙搭/OpenClaw 方向的关键模式：低门槛一键部署、对话即运维、多 Agent 协同、云端持续执行、与办公协作入口融合。

本项目不建议简单 iframe 或复制某个客户端，而应抽象为自己的 **Agentic Delivery Workbench（智能交付工作台）**：上层是研发管理业务闭环，下层可以适配 Codex CLI / Codex Cloud / OpenClaw / Claude Code / 自研 Runner 等不同执行后端。

**用户路径**

1. PM/TM 在通过审核的 Spec 或 CP 上点击“启动 AI 自动编码”。
2. 系统创建 `PipelineRun` 和 `AgentSession`，冻结本次上下文包：
   - 原始需求
   - PRD
   - FS/TS
   - CP 编程计划
   - 组织编码规范
   - 产品主数据
   - 仓库地址、目标分支、部署环境
   - 相关历史提交与已知问题
3. Planner Agent 先生成实现计划、影响文件清单、风险点、预期测试命令。
4. TM 审核计划，可以直接批准、修改指令，或要求 Agent 重新规划。
5. 系统为执行任务创建隔离 workspace：
   - clone 目标仓库
   - checkout base branch
   - 创建 agent branch / worktree
   - 安装依赖或复用缓存
   - 挂载只读上下文包
   - 注入最小权限密钥
6. Coder Agent 在沙箱中读写文件、运行命令、提交 patch。
7. Tester/Reviewer Agent 自动运行 lint、typecheck、unit/e2e、安全检查，并对 diff 做审查。
8. 工作台实时展示：
   - Agent 对话
   - 执行计划
   - 工具调用
   - 终端日志
   - 文件变更
   - diff
   - 测试报告
   - 质量门禁
   - 沙箱预览地址
9. TM 在 diff review 面板中批准生成 PR、继续修复、人工接管或终止任务。
10. 通过门禁后自动创建 PR / 合并到目标分支 / 部署沙箱，进入验收中心。

**核心交互设计**

| 区域 | 功能 | 设计要点 |
| --- | --- | --- |
| Agent Thread | 对话式派活、追问、纠偏 | 类似聊天，但每条消息必须关联 runId/stepId/contextVersion |
| Plan Board | 展示 Agent 的任务拆解 | 支持人工修改、锁定步骤、要求补充测试 |
| Tool Timeline | 展示工具调用和状态 | shell/git/file/test/deploy 均以事件流展示 |
| Approval Queue | 高风险动作审批 | 网络访问、安装依赖、写密钥、push、deploy、rollback 必须可配置审批 |
| Diff Review | 查看和评论文件变更 | 支持按文件、风险等级、测试覆盖跳转 |
| Terminal/Logs | 实时日志 | SSE/WebSocket 推送，支持暂停滚动、检索、下载 |
| Preview Panel | 沙箱环境预览 | 前端改动可打开预览，后端改动可展示 API smoke test |
| Checkpoints | 中间成果快照 | 每轮关键修改保存 patch/checkpoint，支持回退 |
| Handoff | 人工接管 | 可把 agent branch checkout 给开发者，也可把人工 commit 纳入 run |

**建议后端架构**

```text
交付引擎页面
  |
  | SSE/WebSocket + REST
  v
Agent Orchestrator
  |-- Context Builder          # 需求/PRD/FS/TS/CP/规范/仓库上下文打包
  |-- Task Planner             # 拆任务、估风险、生成执行 DAG
  |-- Workspace Manager        # git clone/worktree/branch/cache/cleanup
  |-- Agent Runtime Adapter    # Codex CLI / Codex Cloud / OpenClaw / Claude Code / 自研
  |-- Tool Gateway             # shell/git/file/test/browser/deploy/feishu
  |-- Approval Engine          # 高风险工具调用审批
  |-- Review Gate              # diff、测试、质量、安全、人工审核
  |-- Artifact Store           # patch、日志、报告、截图、构建产物
  |-- Event Bus                # run/step/tool/log/diff 事件
  v
Runner Sandbox
  |-- isolated container / VM / k8s job
  |-- non-root user
  |-- network policy
  |-- secret mount
  |-- resource quota
```

**关键模块拆分**

1. `agent-orchestrator`
   - 负责 `AgentSession` 生命周期、任务 DAG、状态流转、取消/暂停/恢复。
   - 不直接执行 shell，而是通过 `ToolGateway` 调用。

2. `context-builder`
   - 将需求链路文档打包成不可变 `ContextPack`。
   - 每次 run 记录 `contextVersion`，保证可复盘。
   - 输出建议结构：
     - `context/requirement.md`
     - `context/prd.md`
     - `context/fs.json`
     - `context/ts.json`
     - `context/cp.md`
     - `context/org-spec.md`
     - `context/repo-summary.md`

3. `workspace-manager`
   - 管理仓库 clone、worktree、branch、依赖缓存、清理策略。
   - 分支建议：`codex/rd-${requirementId}-${runId}`。
   - 多 Agent 并行时，每个写入型 Agent 使用独立 worktree；最后由 Integration Step 汇总 patch。

4. `agent-runtime-adapter`
   - 不把系统绑定到单一 Agent 实现。
   - 定义统一接口：
     - `startTask(input): taskId`
     - `sendMessage(taskId, message)`
     - `streamEvents(taskId)`
     - `cancel(taskId)`
     - `collectPatch(taskId)`
   - 第一阶段可先接本地/服务端 Codex CLI 或自研 OpenAI Responses API Runner；后续再接云端 Codex/OpenClaw。

5. `tool-gateway`
   - 对 Agent 暴露受控工具，而不是裸奔系统权限。
   - 工具类型：
     - `read_file`
     - `write_file`
     - `apply_patch`
     - `run_command`
     - `git_status`
     - `git_diff`
     - `run_tests`
     - `open_preview`
     - `create_pr`
     - `deploy_sandbox`
   - 每个工具都有权限级别、超时、输出截断、审计日志和审批策略。

6. `review-gate`
   - 汇总自动检查结果和人工审核结论。
   - 质量门禁包括：
     - typecheck
     - lint
     - unit tests
     - e2e smoke
     - build
     - dependency audit
     - secret scan
     - diff risk score

**建议数据模型**

| 表 | 说明 |
| --- | --- |
| `rd_agent_sessions` | 一次用户与 Agent 的交互会话，通常关联一个 requirement/spec/pipelineRun |
| `rd_agent_tasks` | Agent 任务，支持 planner/coder/tester/reviewer/deployer 等角色 |
| `rd_agent_steps` | Agent 内部步骤，记录计划、执行、检查、修复等阶段 |
| `rd_agent_messages` | 用户、系统、Agent 的对话消息 |
| `rd_agent_tool_calls` | 工具调用审计，含输入摘要、输出摘要、耗时、权限、审批状态 |
| `rd_agent_workspaces` | worktree/container/branch/baseCommit/headCommit 等 workspace 元信息 |
| `rd_agent_artifacts` | patch、diff、测试报告、截图、构建包、日志文件 |
| `rd_agent_approvals` | 高风险动作和人工门禁审批 |
| `rd_agent_checkpoints` | 中间 patch/checkpoint，可回滚 |
| `rd_agent_costs` | token、模型、运行时长、容器资源成本 |

这些表与现有 `rd_pipeline_runs` / `rd_pipeline_step_runs` 的关系建议为：

- 一个 `PipelineRun` 可以有一个或多个 `AgentSession`。
- 一个 `AgentSession` 可以驱动多个 `PipelineStepRun`。
- `PipelineStepRun` 面向研发流程展示，`AgentTask/AgentStep` 面向 Agent 执行细节。

**事件协议**

前端不要轮询大对象，建议统一事件流：

```ts
type AgentEvent =
  | { type: 'session.created'; sessionId: string }
  | { type: 'plan.created'; planMarkdown: string }
  | { type: 'approval.required'; approvalId: string; toolName: string; reason: string }
  | { type: 'tool.started'; toolCallId: string; toolName: string; summary: string }
  | { type: 'tool.output'; toolCallId: string; chunk: string }
  | { type: 'file.changed'; path: string; changeType: 'add' | 'modify' | 'delete' }
  | { type: 'diff.ready'; artifactId: string }
  | { type: 'test.started'; command: string }
  | { type: 'test.finished'; passed: boolean; reportArtifactId: string }
  | { type: 'gate.finished'; passed: boolean; failedRules: string[] }
  | { type: 'pr.created'; url: string }
  | { type: 'sandbox.deployed'; url: string }
  | { type: 'session.failed'; errorCode: string; message: string }
  | { type: 'session.completed'; result: 'pr_ready' | 'deployed' | 'needs_human' };
```

传输建议：

- 实时展示用 SSE，简单稳定，适合日志和事件。
- 需要双向实时控制时再补 WebSocket。
- 所有事件落库，前端断线后可按 `lastEventId` 续传。

**多 Agent 协作策略**

建议采用“少数强约束 Agent”，不要一开始做复杂群聊式多 Agent：

| Agent | 权限 | 产出 |
| --- | --- | --- |
| Planner | 只读仓库和上下文 | 实施计划、风险点、测试计划 |
| Coder | 读写 workspace、运行安全命令 | patch、commit、变更说明 |
| Tester | 运行测试、可写测试文件 | 测试报告、失败定位、补测建议 |
| Reviewer | 只读 diff 和报告 | Review 结论、风险评级、返工建议 |
| Deployer | 部署工具受控调用 | 沙箱地址、部署记录、回滚点 |

原则：

- 同一 workspace 同一时间只允许一个写入型 Agent。
- 多个实现方向可以并行跑在不同 worktree，但必须通过 Integration Step 选择或合并。
- Reviewer Agent 默认只读，避免“边审边改”导致审计混乱。
- 人工反馈必须进入 `AgentThread`，成为后续执行上下文。

**安全边界**

Agent 自动编码平台的最大风险不是“代码没写好”，而是“它真的能动手”。建议把安全设计放到 P0：

1. 沙箱隔离
   - Docker/Kubernetes Job/VM，非 root 用户。
   - workspace 只挂载当前仓库副本。
   - 默认无公网或仅 allowlist。
   - CPU/内存/磁盘/执行时长限额。

2. 工具权限
   - shell 命令白名单或风险分级。
   - `npm install`、外网访问、写环境变量、push、deploy 必须可审批。
   - 禁止 Agent 读取服务端 `.env`、生产密钥和宿主机敏感路径。

3. 凭证管理
   - Git token、部署 token、模型 key 统一从 Secret Manager 注入。
   - Agent 只能拿到短时、最小权限、作用域受限的凭证。
   - 凭证不进入 prompt、不进入日志、不进入 artifact。

4. 代码门禁
   - secret scan 必跑。
   - dependency audit 必跑。
   - PR 合并依赖 branch protection。
   - 发布生产必须人工审批。

5. 审计与追责
   - 每个工具调用记录 actor、agentRole、workspace、command、exitCode、duration。
   - 每个 patch 关联生成它的 task/step/toolCall。
   - 人工批准也要记录批准人、批准时间和批准理由。

**与现有页面的结合方式**

不建议新增一个完全割裂的“AI 编码页面”，而是在 `AIPipelinePage` 内升级为三个层级：

1. `Pipeline Overview`
   - 需求维度、run 状态、阶段进度、质量门禁。

2. `Agent Workbench`
   - 选中某个 run 后进入 Agent 对话、计划、工具时间线、diff、日志。

3. `Delivery Review`
   - PR 信息、测试报告、沙箱预览、验收入口、回滚入口。

导航上仍叫“交付引擎”，但页面内主 CTA 可以是：

- “启动 AI 自动编码”
- “让 Agent 修复失败”
- “让 Agent 补测试”
- “生成 PR”
- “部署沙箱”
- “进入验收”

**实现路线**

MVP 不要一口气实现完整 Codex App。建议四步走：

1. **MVP-1：对话式创建运行**
   - 在流水线页新增 Agent Thread。
   - 用户输入目标，系统生成 Plan。
   - Plan 可人工编辑和批准。
   - 先不自动改代码，只生成 CP/任务拆解。

2. **MVP-2：沙箱 worktree + 自动 patch**
   - 后端创建临时 workspace。
   - Agent 根据 CP 修改代码。
   - 自动运行 `git diff`、`npm test`/项目配置命令。
   - 前端展示 diff 和日志。

3. **MVP-3：PR + 沙箱部署**
   - 通过后端 Git Adapter push branch。
   - 创建 PR 或给出 PR 链接。
   - 通过 Deploy Adapter 部署测试环境。
   - 验收中心绑定 sandboxUrl。

4. **MVP-4：多 Agent + 自动修复循环**
   - Reviewer/Test Agent 对失败进行诊断。
   - Coder Agent 根据失败报告继续修复。
   - 设定最多循环次数和成本上限。
   - 产出最终可审查 PR。

**不要踩的坑**

- 不要让浏览器直接持有代码仓库 Token 或模型 Key。
- 不要让 Agent 直接操作主分支。
- 不要把 prompt 当作唯一上下文，必须使用版本化 ContextPack。
- 不要让多个 Agent 同时写同一个 worktree。
- 不要只展示“AI 正在思考”，必须展示可审计的工具调用、文件变更和测试结果。
- 不要把 mock 结果包装成真实执行结果。
- 不要把“自动合并/自动生产部署”作为早期默认能力；早期应以 PR 和沙箱为边界。

**验收标准**

- 用户能从一个已审核 Spec 启动 AI 自动编码 run。
- 系统能创建隔离 workspace 和 agent branch。
- Agent 能产出 patch/diff，并自动运行至少一组项目校验命令。
- 前端能实时展示对话、计划、工具调用、日志、diff 和测试结果。
- 高风险工具调用需要审批且有审计。
- 成功后能创建 PR 或推送分支，并把结果回写到流水线。

### 3.6 恢复构建质量门禁

**现状**

- `web/next.config.ts` 中配置了：
  - `eslint.ignoreDuringBuilds: true`
  - `typescript.ignoreBuildErrors: true`
- 根目录 ESLint 对 `no-explicit-any` 关闭，对未使用变量仅 warn。
- 测试数量较少，目前主要覆盖 auth utils、auth API/form、rd-ai-skills、download header。

**风险**

- 类型错误和 lint 问题不会阻断生产构建。
- AI 生成/辅助修改代码时，如果没有强门禁，容易把隐性错误带入部署。
- 大页面复杂度较高，缺少回归测试会让迭代成本快速上升。

**建议动作**

1. 将 CI 中的 `npm run type:check`、`npm run eslint`、`npm run test` 作为合并门禁。
2. 生产构建逐步恢复类型/ESLint 阻断：
   - 短期：保留 `next.config.ts` 忽略，但 CI 必须阻断。
   - 中期：修复存量问题后关闭 `ignoreBuildErrors` 和 `ignoreDuringBuilds`。
3. 提高关键规则等级：
   - 未使用变量从 warn 升为 error。
   - 禁止在业务代码中新增 `window.confirm/prompt`，统一使用 Dialog。
   - 限制新增大文件，超过阈值要求拆分。
4. 为核心链路补测试：
   - 需求提交、状态流转、PRD 审核、Spec 审核、验收通过/驳回。
   - AI Skill 配置读写和服务端流式调用。
   - Pipeline Git 发布失败/成功路径。
   - 权限 guard。
5. 增加 Playwright e2e，覆盖三类角色的主路径。

**验收标准**

- CI 中类型、lint、单测失败时不能合并。
- P0 主链路有自动化回归。
- 新增页面或核心逻辑有对应测试。

## 4. P1 优化项

### 4.1 建立需求全生命周期状态机

**现状**

- 需求状态包括 `backlog`、`prd_writing`、`spec_defining`、`ai_developing`、`pending_acceptance`、`released`。
- 看板支持拖拽变更状态，但服务端没有集中状态机校验。
- PRD/Spec 审核方法会间接影响需求状态，但规则分散在业务逻辑中。

**问题**

- 干系人、PM、TM 分别能做哪些状态变更不够明确。
- 拖拽或接口调用可能跳过必要步骤。
- 状态变更原因、操作者、关联文档版本未形成完整历史。

**建议动作**

1. 新增 `RequirementWorkflowService`，集中管理状态流转规则。
2. 新增 `rd_requirement_flow_events` 表，记录：
   - requirementId
   - fromStatus/toStatus
   - action
   - actorUserId
   - actorRoleIds
   - reason
   - relatedPrdId/specId/pipelineRunId/acceptanceId
   - createdAt
3. 所有状态修改只能通过 workflow service。
4. 前端拖拽时先调用“可流转动作”接口，禁用不合法目标列。
5. 需求详情页用事件表渲染真实时间线。

**验收标准**

- 不允许从 `backlog` 直接跳到 `released`。
- `pending_acceptance -> released` 必须由具备验收权限的用户触发。
- 每次状态变化都有事件记录。

### 4.2 拆分大页面与业务逻辑

**现状**

多个页面文件较大：

- `AIPipelinePage.tsx` 约 1400 行。
- `SpecEditPage.tsx` 约 1360 行。
- `BountyHuntPage.tsx` 约 930 行。
- `PRDPage.tsx`、`RequirementInputPage.tsx`、`AcceptancePage.tsx` 也超过 600 行。
- `server/modules/rd/rd.service.ts` 超过 2500 行。

**风险**

- 页面状态、表单、数据映射、权限判断、渲染混在一起，后续 AI 或人工修改容易误伤。
- 测试困难，复用困难，Review 成本高。
- 业务能力膨胀后，`RdService` 会继续变成上帝对象。

**建议动作**

1. 前端按页面拆成：
   - `components/`
   - `hooks/`
   - `utils/`
   - `types.ts`
   - `constants.ts`
2. 以 `AIPipelinePage` 为例拆分：
   - `PipelineRunList`
   - `PipelineRunDetail`
   - `PipelineStepTimeline`
   - `PipelineLogViewer`
   - `QualityGatePanel`
   - `CreatePipelineDialog`
   - `usePipelineCreateForm`
   - `usePipelineActions`
3. 后端 `RdService` 拆成领域服务：
   - `RequirementService`
   - `PrdService`
   - `SpecService`
   - `AcceptanceService`
   - `ProductService`
   - `BountyService`
   - `AiSkillConfigService`
4. Controller 也按资源拆分，避免 `RdController` 继续膨胀。

**验收标准**

- 单个页面组件建议控制在 300 行以内。
- 单个 service 建议聚焦一个聚合根。
- 核心 hook/utils 可单测。

### 4.3 强化 Machine-Readable 规格能力

**现状**

- `ISpecification` 同时有 Markdown 字段、结构化 `functionalSpec` / `technicalSpec`、`machineReadableJson` 字符串。
- 规格页有 FS/TS/CP 概念，但结构化校验还不够强。
- AI 冲突检测目前服务端存在演示回退。

**优化方向**

1. 定义版本化 JSON Schema：
   - `fs.schema.json`
   - `ts.schema.json`
   - `cp.schema.json`
2. Spec 保存时服务端强校验：
   - API path/method/params/response 完整性。
   - UI component props/events 完整性。
   - DB schema、架构图、第三方集成完整性。
   - CP 是否包含文件级任务、验收命令、回滚方案。
3. 将 Markdown 作为人类可读视图，JSON 作为 AI 执行输入，二者互相生成但要标记来源和版本。
4. Spec 编辑页增加“结构化校验面板”：
   - 缺失字段
   - schema 错误
   - 与组织规范冲突
   - 与现有产品技术栈冲突
5. 导出的流水线文档包中加入 `machine-readable/`：
   - `requirement.json`
   - `prd.json`
   - `fs.json`
   - `ts.json`
   - `cp.json`

**验收标准**

- 不符合 JSON Schema 的规格不能提交审核。
- Pipeline codegen 使用结构化 JSON，而不是只依赖 Markdown。
- 规格变更有版本号和 diff。

### 4.4 统一 API 契约与前后端类型

**现状**

- 前端 `rd-types.ts`、后端 `rd.service.ts`、`shared/api.interface.ts` 存在多份类型定义。
- `rd-api.ts` 需要手动 map snake_case / camelCase。
- Controller 入参大多是 `Partial<T>` 或原始 body，缺少 DTO 和 class-validator 约束。

**建议动作**

1. 将共享 DTO 放在 `shared/` 或生成 OpenAPI schema。
2. 后端 Controller 使用明确 DTO：
   - `CreateRequirementDto`
   - `UpdateRequirementDto`
   - `ReviewPrdDto`
   - `SubmitSpecReviewDto`
   - `CreatePipelineRunDto`
3. 使用 Zod 或 class-validator 做入参校验。
4. 前端 API Client 从 OpenAPI/类型定义生成，减少手写 mapper。
5. 统一时间字段格式，避免 `expectedDate` 文本日期与 ISO 时间混用。

**验收标准**

- 非法 body 返回 400 和清晰错误。
- 前后端字段不再靠手写容错 mapper 兜底。
- 类型修改能被编译器发现影响范围。

### 4.5 引入真实可观测性

**现状**

- 前端有日志展示、后端有 Nest Logger。
- AI 调用、Git 操作、流水线动作还缺少统一 trace。

**建议动作**

1. 引入 requestId/traceId：
   - HTTP 请求
   - AI skill run
   - pipeline run
   - git publish
2. 建立 `rd_operation_logs` 或接入日志系统，记录关键动作。
3. 为 AI 和流水线增加指标：
   - 调用次数
   - 成功率
   - 平均耗时
   - token/cost
   - 失败原因分布
   - 步骤耗时
4. 前端错误提示从“保存失败，请重试”升级为可操作诊断：
   - 错误码
   - 失败步骤
   - 建议动作
   - 关联日志链接

**验收标准**

- 一个失败的 AI 生成或流水线任务，可以用 traceId 查到完整链路。
- 平台能展示近 7/30 天成功率和主要失败原因。

## 5. P2 产品体验优化

### 5.1 重新定义信息架构命名

当前侧边栏已经从原始需求文档中的“需求看板/PRD管理/规格定义/流水线”演化为“仪表板/需求管理/智能文档/技术基准/交付引擎”。建议统一产品语言：

- 仪表板：平台总览、效率和质量指标。
- 需求管理：需求池、看板、列表、详情、编辑。
- 智能文档：PRD 生成、编辑、审核、版本。
- 技术基准：FS/TS/CP、组织规范、冲突检测。
- 交付引擎：Pipeline Run、Runner、质量门禁、部署。
- 验收中心：验收、反馈、RFC。
- 治理中心：用户、角色、权限、插件、组织规范。
- 产品主数据：产品、仓库、环境、负责人。

避免同一概念在页面、文档、代码中出现多套名称。

### 5.2 增加 AI 研发提效指标

建议仪表板从“阶段分布”升级为“提效结果”：

- 需求吞吐：新增需求数、完成需求数、平均流转时长。
- 文档提效：PRD 生成次数、人工修改比例、评审通过率。
- 规格质量：Schema 通过率、冲突检测数、返工次数。
- 交付效率：Pipeline 成功率、平均执行时长、失败重试次数。
- 质量指标：测试通过率、覆盖率、质量门禁通过率。
- 验收结果：一次验收通过率、RFC 数、满意度。
- AI 成本：token 消耗、模型费用、单需求平均成本。

### 5.3 优化交互一致性

**可优化点**

- 多处仍使用 `window.confirm` / `window.prompt`，建议统一替换为项目已有 Dialog/AlertDialog。
- 看板和部分页面存在装饰性 glow/orb，与项目设计指南中“后台工具克制、微边框、避免装饰光斑”的方向略有冲突。
- 部分页面标题和导航名称不完全一致，例如 Dashboard 页面展示“仪表板”，需求文档中叫“需求看板”。
- `RequirementsKanban` 中有大段注释掉的工具栏 JSX，建议清理或恢复为明确组件。

**建议动作**

1. 建立统一确认弹窗组件：
   - 删除确认
   - 审核通过/驳回
   - 回滚/重试
2. 统一页面头部组件：
   - 标题
   - 描述
   - 主操作
   - 筛选器
3. 看板列建议保留设计文档要求的横向 6 泳道，同时在小屏或列表页提供自适应版本。
4. 建立 `statusConfig`、`priorityConfig`、`roleConfig` 单一来源，避免页面内重复定义。

### 5.4 强化协作能力

面向 PM/TM/干系人的协作功能可以进一步补强：

- PRD/Spec 评论与 @ 人。
- 审核意见模板。
- 变更申请 RFC 的结构化流程。
- 需求、PRD、Spec、Pipeline、验收之间的关联图谱。
- 飞书通知：
  - 待审核
  - 待验收
  - 流水线失败
  - 质量门禁阻断
  - RFC 创建

## 6. 建议路线图

### 阶段 A：可信平台底座（2-3 周）

目标：先把“能不能安全上线内部试用”的基础补齐。

交付：

- 服务端 JWT 鉴权与权限 Guard。
- 高风险接口权限校验。
- 审计字段服务端写入。
- 迁移脚本框架。
- CI 类型/lint/test 门禁。
- 禁用生产浏览器端 AI Key。
- mock AI 能力生产保护。

### 阶段 B：研发主链路固化（3-5 周）

目标：让需求到 PRD/Spec/验收的流转可控、可追溯。

交付：

- 需求状态机。
- 流转事件表。
- PRD/Spec 审核流程服务化。
- Spec JSON Schema 校验。
- 需求详情真实生命周期时间线。
- 关键页面拆分。

### 阶段 C：可执行 AI 交付引擎（6-8 周）

目标：把流水线从展示系统升级为执行系统，并形成 Codex Agent Client 式的自动编码工作台。

交付：

- PipelineRun / StepRun 数据模型。
- BullMQ 执行队列。
- Git/Codegen/Build/Test/Quality Adapter。
- AgentSession / AgentTask / AgentToolCall 数据模型。
- ContextPack 上下文打包。
- Workspace Manager：隔离 worktree、agent branch、依赖缓存、清理。
- Agent Runtime Adapter：先接本地/服务端 Runner，后续兼容 Codex/OpenClaw 等后端。
- Agent Thread：对话式派活、计划审核、人工纠偏。
- Diff Review：文件变更、风险评级、测试结果、人工批准。
- 步骤级实时日志。
- 质量门禁。
- 失败重试/取消/回滚。
- 工件管理。

### 阶段 D：提效指标与企业化治理（持续）

目标：证明 AI 研发提效平台的业务价值。

交付：

- 提效指标仪表板。
- 成本与质量趋势。
- Prompt/模型版本治理。
- 多产品/多仓库配置。
- 通知与审批策略。
- 更细粒度的角色和动作权限。

## 7. 推荐近期 Backlog

| ID | 优先级 | 任务 | 产出 |
| --- | --- | --- | --- |
| O-001 | P0 | 实现 Nest JWT Guard 与 Permissions Guard | 服务端鉴权闭环 |
| O-002 | P0 | 为 Auth/RD/Pipeline/Capabilities 接口补权限装饰器 | API 访问控制 |
| O-003 | P0 | 引入 Drizzle migrations，迁出 `ensureTables` | 可版本化 schema |
| O-004 | P0 | 移除生产前端 Ark Key 调用路径 | AI Key 安全 |
| O-005 | P0 | CI 增加 typecheck/eslint/test 必过 | 工程质量门禁 |
| O-006 | P0 | mock AI 输出生产环境禁止静默回退 | AI 结果可信 |
| O-007 | P0 | 设计 AgentSession/AgentTask/AgentToolCall/AgentWorkspace 数据表 | Agent 自动编码底座 |
| O-008 | P0 | 实现 ContextPack，将需求/PRD/FS/TS/CP/规范打包成版本化上下文 | 可复盘执行输入 |
| O-009 | P0 | 实现 Workspace Manager，支持隔离 clone/worktree/branch/cleanup | 安全执行环境 |
| O-010 | P0 | 实现 Tool Gateway，统一 shell/git/file/test/deploy 工具审计和审批 | 受控工具调用 |
| O-011 | P0 | 在流水线页新增 Agent Thread + Plan 审核 MVP | Codex 式交互入口 |
| O-012 | P1 | 新增需求状态机和流转事件表 | 生命周期审计 |
| O-013 | P1 | Spec JSON Schema 校验 | Machine-Readable 标准 |
| O-014 | P1 | 拆分 `AIPipelinePage` 与 `RdService` | 可维护性提升 |
| O-015 | P1 | PipelineRun/StepRun 最小模型落库 | 流水线执行底座 |
| O-016 | P1 | 实现 Agent Diff Review 和测试报告面板 | 人工审核闭环 |
| O-017 | P1 | 用 Dialog 替换 confirm/prompt | 交互一致性 |
| O-018 | P2 | 仪表板增加提效/质量/成本指标 | 产品价值呈现 |

## 8. 结论

当前项目已经完成了 AI 研发管理平台的“业务版图”和不少原型能力，尤其是需求、文档、规格、流水线、验收、插件和权限页面都已经具备雏形。下一步最关键的不是继续堆页面，而是补齐四个可信闭环：

1. **权限可信**：服务端真正知道“谁能做什么”。
2. **数据可信**：schema、状态、审计和版本可追溯。
3. **AI 可信**：模型调用、Prompt、输出、成本、失败都可治理。
4. **交付可信**：流水线真正执行代码生成、构建、测试、门禁和部署。

把这四个闭环打稳后，本项目就可以从“AI 研发管理原型”进一步升级为“AI 研发提效平台”的内部可用版本。
