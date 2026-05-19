# HAI 智研平台 优化建议（v1.0 → v1.1+）

> **适用版本**：v1.0（已上线基础功能）
> **目标版本**：v1.1（短期 1-3 个月）/ v1.2-v2.0（中长期 3-12 个月）
> **文档定位**：作为产品 Roadmap 的输入材料，覆盖 7 个核心维度 + 4 个高频模块的 AI 原生深化方案
> **当前用户**：产品经理（PM）、研发工程师（RD/TM）、测试工程师（QA）、项目负责人
> **核心痛点（背景）**：需求对齐成本高、文档维护效率低、交付过程黑盒化、验收标准难统一

---

## 0. 总览：优化全景图

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                       HAI 智研平台 v1.1+ 优化全景                          │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────┤
│ 产品体验      │ 用户效率      │ AI 赋能       │ 数据闭环      │ 流程协同    │
│ • 全局指挥官  │ • Inline AI  │ • Agent 化    │ • 指标驾驶舱  │ • 任务路由 │
│ • 状态零跳转  │ • 快捷操作    │ • 多轮上下文  │ • 链路埋点    │ • 协同 IM  │
│ • 视觉一致性  │ • 命令面板    │ • 评测中心    │ • 全文检索    │ • 站内通告 │
├──────────────┴──────────────┼──────────────┴──────────────┴────────────┤
│ 架构扩展性                    │ 安全合规                                    │
│ • rd.service 拆分             │ • Key 治理 / 前端去敏感                    │
│ • Runner / Adapter 接口化     │ • PII 红线 / 数据脱敏                      │
│ • Event Bus / Outbox          │ • 审计日志 / 操作可回放                    │
│ • 能力插件版本治理            │ • 模型分级 / 内外网隔离                    │
└──────────────────────────────┴────────────────────────────────────────────┘
```

**优先级图例**（在每条建议右侧标注）：

- `P0`：必须做，影响主线可用性 / 合规底线
- `P1`：强烈推荐，明显提升效率或体验
- `P2`：可在 v1.2+ 视资源情况推进

---

## 一、【产品体验】

### 现状分析

- 模块覆盖完整：智研看板、赏金猎场、需求中心、智能文档、技术基准、交付引擎、验收中心、产品主数据、设置共 9 大区域。
- 视觉层有强约束的设计系统（`AGENTS.md`：6 阶段状态色、Grid 网格、`max-w-[1400px]`、Sidebar 深蓝黑），整体专业感够。
- 路由层基于 Next.js App Router，按 `(auth)/(main)` 划分，配合 `Layout.tsx` + `RequireRouteAccess` 做权限收敛。

### 核心痛点

1. **信息分散**：一个需求要在「看板 / 详情 / PRD / 规格 / 流水线 / 验收」之间反复跳转，缺一个"全链路时间轴"统一视图。
2. **状态语义不直观**：6 个阶段对干系人（非技术）来说仍偏抽象，缺"我现在该做什么"的明确 CTA。
3. **空状态/异常态薄弱**：列表/看板的空状态、AI 调用失败、网络中断等边界场景文案与引导不统一。
4. **移动端体验**：Sidebar 在移动端虽可抽屉，但表单 / 看板拖拽在小屏几乎不可用。
5. **多角色界面冗余**：同一界面对所有角色展示全部入口，仅靠权限收敛，存在视觉噪音。

### 优化方向

#### 短期（1-3 个月）

- **`P0` 全链路时间轴视图**：在需求详情页引入"时间线 + 阶段卡片 + 关键产物链接 + 下一步 CTA"的统一组件，复用 `requirement_flow_events`，让所有角色一屏看懂状态。
- **`P0` 个人工作台首页**：将 `/` 默认页升级为"我的待办 / 我的产出 / 我领取的赏金 / 待我验收"四象限，替代纯看板首屏，降低跳转。
- **`P1` 角色化首屏**：根据 `userRole`（stakeholder / pm / tm）在 `Layout.tsx` 之上加 `RoleScopedShell`，对应展示精简菜单与首屏布局，仍共用同一设计语言。
- **`P1` 空状态 & 错误态组件库**：基于现有 shadcn UI 抽 `EmptyState` / `ErrorState` / `AILoading` / `AIError`，统一文案与 CTA。
- **`P1` 命令面板（⌘K）**：用 `cmdk`（已在依赖中）做全局搜索 + 跳转 + 快速创建（新建需求、跳转 PRD、运行 AI 技能等）。

#### 中长期（3-12 个月）

- **`P1` 移动端 PWA 版**：聚焦干系人验收 / 通知 / 赏金领取 3 个场景做移动端独立路由（`/m/*`），看板与编辑保持桌面端。
- **`P2` 主题与品牌定制**：增加企业级主题 token（logo、色彩 override），支持多产品线接入时的轻量白标。
- **`P2` 全局键盘操作**：看板拖拽、PRD 编辑、验收评分等高频操作配备快捷键 + Cheatsheet。

### 预期收益

- 关键路径（需求 → 验收）平均点击数 ↓ 40%。
- 首屏停留时长 ↑（从 5s 内跳转下降到 30s+），用户对"系统主导工作流"的认知建立。
- 新用户上手时间 ↓（从 ~30 分钟到 ~10 分钟）。

---

## 二、【用户效率】

### 现状分析

- 已有 9 个 AI 能力插件（PRD 生成、TS 生成、需求分类、需求优化、冲突检测、代码评审、用例生成、测试执行报告、验收反馈分析），覆盖主流程。
- 编辑器使用 Tiptap，列表 / 看板使用 dnd-kit、TanStack Query 已就位。

### 核心痛点

1. **AI 入口分散**：每个页面有独立"AI 生成"按钮，缺乏 **Inline AI**（在文本中选中→改写/总结/扩写）的体验。
2. **重复操作多**：例如同一需求改一次 PRD 要再到规格页手动重生成 TS；批量需求处理（导入、批量分类、批量分配 PM）缺失。
3. **流式输出体验**：当前部分插件已 stream，但缺 **可中断 / 可重试 / 可分段保存** 的标准化交互。
4. **缺少模板复用**：PRD/规格/验收报告没有团队级模板库与"基于历史最相似项生成"的能力。

### 优化方向

#### 短期（1-3 个月）

- **`P0` 统一 Inline AI 组件**：抽 `<InlineAiMenu>`（基于 Tiptap 选区），所有富文本字段（需求描述、PRD 段落、规格说明、验收反馈）都接入"改写 / 精简 / 扩写 / 翻译 / 总结 / 转 JSON"6 个标准动作。
- **`P0` AI 输出标准化框架**：升级 `ai-skill-engine.ts`，统一支持：
  - 流式 + 可中断（`AbortController`）
  - 失败重试（指数退避）
  - 局部提交（每 N 个 token 入库一次草稿）
  - 引用证据（让模型回传 `citations`，前端高亮原文）
- **`P1` 批量操作**：需求列表支持「批量分类 / 批量改优先级 / 批量分配负责人 / 批量生成 PRD」，复用 `requirement_classifier`。
- **`P1` 模板中心**：在 `/org-spec-config` 下增加 PRD / FS / TS / 验收报告模板管理，AI 生成时自动注入团队模板，保证产物风格统一。

#### 中长期（3-12 个月）

- **`P1` 个人快捷工作台**：每位用户可固定常用 AI 动作（如 PM 固定"需求优化 + 一键生成 PRD"），形成"AI Macro"。
- **`P2` 离线/导出工作流**：PRD/规格/报告一键导出 Word/PDF/Markdown bundle，方便对外交付。
- **`P2` 语音输入**：在需求采集与验收反馈场景接入语音转写（接 Whisper / 第三方），降低录入成本。

### 预期收益

- PM 单条需求编写 PRD 的平均耗时 ↓ 50%+（30min → 15min 量级）。
- 文档手工编辑量 ↓ 60%，AI 直接产物可用率 ↑。
- 批量场景（导入 50+ 需求）从不可用变为分钟级完成。

---

## 三、【AI 赋能】

### 现状分析

- 服务端能力网关已具备（`/api/capability/*` + `server/capabilities/*.json`），9 个插件覆盖文档生成、检测、评审、报告。
- AI Skill 配置可在数据库中覆盖（`IAiSkillConfig`），具备模型与 prompt 的多环境替换。

### 核心痛点

1. **单轮无记忆**：当前调用多为一次性 prompt，缺多轮对话与上下文累计（如"基于上一版 PRD 仅改 X"的增量场景）。
2. **缺乏 Agent 编排**：从需求 → PRD → TS → 代码 → 测试的链路实际是"用户手动驱动一连串单次 AI 调用"，没有 Plan/Act/Observe 编排。
3. **无效果评测**：插件上线后没有质量指标（采纳率、回滚率、人工修改幅度），无法回归与对比模型。
4. **Prompt 治理弱**：Prompt 散落在数据库和 JSON 配置，无版本、无 A/B、无差异回滚。
5. **检索能力缺失**：跨需求、跨 PRD、跨规格的相似性检索 / RAG 没有底座，AI 生成无法引用历史经验。

### 优化方向

#### 短期（1-3 个月）

- **`P0` 能力插件版本治理**：`server/capabilities/*.json` 升级为 `{id, version, promptTemplate, modelDefaults, schema}`，数据库 `ai_skill_configs` 增 `version` / `parentVersion` / `enabled`，前后端按 `pluginId@version` 调用，支持灰度。
- **`P0` AI 行为埋点**：在 `capabilities.service` 上加统一埋点（`pluginId`、`requirementId`、`inputTokens`、`outputTokens`、`latency`、`status`、`userId`、`adoptedRate`），写入 `ai_invocation_log` 表，作为 v1.2 评测中心数据底座。
- **`P1` 多轮上下文管理**：抽 `ConversationContext` 实体（绑定 `requirementId`），所有 AI 插件支持注入"对话历史 + 选区上下文 + 关联文档摘要"，让"基于上一版只改 X"成为可能。
- **`P1` 引用 / 证据回传**：约定每个 stream 插件的 `events` 中携带 `citations: [{docId, anchor, snippet}]`，前端在产物中渲染锚点并支持跳回原文。

#### 中长期（3-12 个月）

- **`P0` Agent 编排层**：在 `server/modules/rd` 上层抽 `agent-orchestrator`（已部分存在 `agent-workspace-manager` / `agent-tool-gateway`），引入"Plan → Tool Call → Critic → Retry"标准循环；将"需求 → PRD → TS → 代码生成"封装为可暂停/可回放的 Workflow。
- **`P1` RAG / 向量检索底座**：选型 pgvector（与现有 Postgres 一致最低成本）或独立向量库；建立"需求 / PRD / 规格 / 历史代码 PR / 验收记录"四个索引，AI 生成时自动召回 Top-K 注入。
- **`P1` AI 评测中心 `/ai-evaluation`**：基于 `ai_invocation_log` + 人工标注，提供「采纳率 / 修改幅度 / 平均轮次 / 模型对比 / Prompt 版本对比」面板，作为 Prompt & 模型迭代的依据。
- **`P1` 模型路由 & 降级**：根据任务类型（短文本分类 / 长文档生成 / 代码评审）动态选模（小模型/大模型/思考模型），含可用性自动降级。
- **`P2` 用户级长期记忆**：以 `userId + productId` 维度沉淀"团队术语 / 写作偏好 / 验收口径"，作为系统级 prompt 注入。

### 预期收益

- AI 产物采纳率（不经人工大改即可用）≥ 70%。
- 模型迭代周期从"凭感觉换"到"基于数据 1 周内决策"。
- Agent 化后，单需求从录入到生成 PR 草稿的全程操作步骤 ↓ 60%。

---

## 四、【数据闭环】

### 现状分析

- 数据模型扎实：`requirements / requirement_flow_events / prd / spec / pipeline_runs / pipeline_step_runs / agent_*` / `context_packs` / `acceptance_records` 等，Drizzle schema + 迁移版本受控。
- 状态机有 `requirement_flow_events` 追踪，流水线有 `pipeline_runs/steps`。

### 核心痛点

1. **指标无沉淀**：研发吞吐、交付时长、AI 调用、验收通过率等关键 KPI 没有聚合表 / BI 视图。
2. **跨实体检索弱**：搜索仅基于标题 / 描述精确匹配，缺全文与语义检索。
3. **离线分析缺失**：缺一个数据仓 / OLAP 分层，分析查询都落在线上业务表。
4. **数据治理标签**：缺产品/部门维度的归属字段一致性校验，跨产品看数据时口径不一。
5. **数据回流断裂**：验收反馈 / 缺陷 / RFC 没有结构化回写到 PRD/规格，AI 看不到"哪些规格曾经被推翻"。

### 优化方向

#### 短期（1-3 个月）

- **`P0` 指标驾驶舱（Cockpit）**：新增 `/cockpit` 页面（或并入 `/dashboard` 第二 Tab），核心卡片：
  - 需求吞吐（创建 / 完成 / 阻塞数）
  - 各阶段平均停留时长（基于 `flow_events`）
  - AI 调用次数 / 采纳率 / 失败率
  - 验收通过率与 RFC 回退率
  - 赏金兑付分布
- **`P0` 数据埋点统一**：在前端封 `useTrack(eventName, payload)`，服务端落 `analytics_events` 表，覆盖关键动作（创建、状态流转、AI 触发、验收提交）。
- **`P1` 验收反馈结构化**：在 `acceptance_records` 上增加 `failedCriteria[]`、`affectedPrdSections[]`、`affectedSpecApis[]`，与 PRD/规格做反向链接，闭环回到下游 AI。
- **`P1` 全文检索**：先用 Postgres `tsvector` + GIN 索引覆盖需求 / PRD / 规格的中文分词（jieba 或 zhparser），无需引入 ES。

#### 中长期（3-12 个月）

- **`P1` pgvector 向量检索**：在 `requirements / prd / spec / acceptance` 上建 embedding 列，与 RAG 层串联（见维度三）。
- **`P1` 数据仓分层**：ODS（业务原表副本）→ DWD（明细）→ DWS（主题宽表）→ ADS（指标聚合），CDC 或定时任务搬运，BI 直接查 ADS。
- **`P2` 数据质量基线**：定时跑数据质量任务（孤立 PRD、状态机非法回退、负载不均的 PM），出报告到站内消息。
- **`P2` 对外开放 API**：把指标层以只读 REST/GraphQL 暴露，方便接入飞书机器人、企业大屏、Power BI。

### 预期收益

- 项目负责人例会准备时间 ↓ 80%（直接看板）。
- 数据驱动决策（哪些规格反复改、哪些 PM 任务积压）从"靠感觉"变为"看数"。
- 为 v2.0 智能调度 / 自动派单提供数据底座。

---

## 五、【流程协同】

### 现状分析

- 角色权限齐：`auth` 模块 + 飞书 OAuth + `RequirePermissions` 装饰器 + 前端 `access-catalog`。
- 站内消息已有（`site_messages`、`useSiteMessagesList`）。
- 赏金猎场（`bounty_tasks`）已支持双角色（PM/TM）领取、押金、奖励、交付、结算、返工。

### 核心痛点

1. **跨系统通知薄弱**：站内消息已有，但飞书 / 邮件等外部触达 / 提醒 / 关键事件订阅未成体系。
2. **任务流转人工**：阶段切换仍靠手点按钮，缺"满足条件自动推进"或"超时自动提醒"。
3. **协同编辑弱**：PRD/规格当前是单人编辑（基础冲突提示），多人并发场景容易覆盖。
4. **评审流程未形成闭环**：PRD 评审、规格评审、上线评审等没有标准化"提交 → 指定评审人 → 评论 → 通过/驳回"的轻流程。
5. **角色识别不清**：`Role` 仅 3 类（stakeholder/pm/tm），实际还有 QA、安全、运维、数据等参与方未建模。

### 优化方向

#### 短期（1-3 个月）

- **`P0` 飞书消息适配器**：复用 `feishu-oauth` 的 App Secret，加 `FeishuNotifier`，关键事件（待你验收 / 你被指派为 PM / 流水线失败）同步推飞书；可在用户设置中按事件类型订阅。
- **`P0` 轻量评审流**：抽象 `Review`（target=prd|spec|acceptance, reviewers[], status, comments[]），所有评审场景复用；评审通过自动推进状态机。
- **`P1` 角色体系扩展**：`Role` 升级为可配置的"角色 + 权限组 + 业务标签"，新增 QA / Security / Ops / Data 等，配合 `permissionGuard` 细化。
- **`P1` 智能提醒**：基于 `expectedDate + status` 跑定时任务，对"即将逾期 / 已停滞 N 天 / 验收超时"自动发提醒到站内 + 飞书。

#### 中长期（3-12 个月）

- **`P1` 协同编辑**：PRD/规格引入 Y.js / Liveblocks 实现 CRDT 多人协同；至少先做"段落级锁 + 实时光标提示"。
- **`P1` 自动流转规则引擎**：可视化配置"满足条件自动推进"（如 PRD 已 approved & TS 已 approved 自动进入 ai_developing）。
- **`P2` 工单系统对接**：与 Jira / 禅道 / TAPD 等双向同步，方便外部团队协作。

### 预期收益

- 关键节点漏接 / 漏验 ↓ 80%（飞书直达 + 智能提醒）。
- 评审通过-平均反馈时长 ↓ 50%。
- 协同编辑冲突事件归零。

---

## 六、【架构扩展性】

### 现状分析

- 后端 NestJS 模块化清晰（`rd / auth / capabilities / pipeline-git / hello`）。
- 但 `server/modules/rd/rd.service.ts` 单文件 **5700+ 行**，承担了需求、PRD、规格、流水线、Agent、Bounty、验收、上下文包等几乎全部业务。
- 已有 `agent-workspace-manager`、`agent-tool-gateway` 等子领域，但仍由 `RdService` 聚合调用。
- AI 能力插件以 JSON 配置驱动，扩展点存在但不够规范化。

### 核心痛点

1. **巨型 Service**：单文件 5700+ 行带来：测试隔离差、并发改动冲突、单测心智成本高、新人 Onboarding 难。
2. **跨模块耦合**：很多业务逻辑通过直接调用 `RdService` 方法实现，缺事件 / 消息解耦。
3. **流水线引擎尚未完全工程化**：现有 `docs/ai-pipeline-architecture-design.md` 已明确"四层架构"目标，但当前执行层（Runner）实现单一，未抽出 Adapter 接口。
4. **能力插件版本与契约**：插件输入/输出契约仅通过 `shared/plugin-types.ts` 静态声明，运行期没有 JSON Schema 校验与版本协商。
5. **前端业务层混杂**：`web/src/lib/` 目录下既有 API 客户端，也有大量业务逻辑（`rd-actor.ts` / `prd-multi-requirement.ts` / `pipeline-page-utils.ts`），缺分层。

### 优化方向

#### 短期（1-3 个月）

- **`P0` `RdService` 拆分**：按业务边界拆为 6 个子 Service，全部由现有 `RdService` 委托（保持外部接口不变）：
  - `RequirementService`
  - `PrdService`
  - `SpecService`（含 FS/TS、冲突检测）
  - `PipelineService`（含 step run / task）
  - `AgentService`（已有 manager 升级为 Service）
  - `BountyService`、`AcceptanceService`
  - 配套：`rd.module.ts` 把它们都 `provide` 出来，老测试不动；新测试针对子 Service 写。
- **`P0` 能力插件运行期校验**：每个 capability JSON 增 `inputSchema` / `outputSchema`（JSON Schema），`CapabilitiesService` 在调用前后做 Ajv 校验，校验失败统一报错，不污染上游业务。
- **`P1` Event Bus + Outbox**：引入 `@nestjs/event-emitter` + 数据库 `events_outbox` 表，关键域事件（`RequirementStatusChanged`、`PipelineRunCompleted`、`AcceptanceSubmitted`）通过事件广播，让通知、AI、统计模块订阅而非串行调用。
- **`P1` 前端业务层重组**：`web/src/lib/` 拆分为 `api/` / `domain/` / `hooks/` 三层；纯展示工具下沉到 `utils/`，复用 `shared/` 类型。

#### 中长期（3-12 个月）

- **`P0` 流水线引擎落地**：按 `docs/ai-pipeline-architecture-design.md` 推进：
  - 抽 `Runner` 接口（CodegenRunner / BuildRunner / TestRunner / QualityRunner / DeployRunner）
  - `Adapter` 接口（GitAdapter / CIAdapter / NotificationAdapter）
  - 状态机以 XState 或自研声明式描述，所有运行轨迹（输入/输出/日志）入 `pipeline_step_runs.payload`，可回放。
- **`P1` 插件 SDK**：把"能力插件 + Runner + Adapter"抽成统一的 `@hai/plugin-sdk`，第三方按 SDK 上传插件包（含 schema + 元数据 + 入口），平台校验后接入；为开放生态打基础。
- **`P1` Monorepo 工程化**：使用 npm workspaces / pnpm workspaces / Turborepo 显式管理 `server`、`web`、`shared`、`scripts`，统一构建缓存与依赖。
- **`P2` 多租户能力**：以 `tenant_id` 灰度引入到核心表，为后续对外多组织提供能力。

### 预期收益

- `rd.service.ts` 单文件 ↓ 至 < 800 行；新需求平均改动文件数 ↓ 50%。
- 流水线接入新 CI / 新代码 Agent 周期从"周"级 ↓ 至"天"级。
- 单测覆盖率 ↑（P0 套件外，模块单测 ≥ 60%）。

---

## 七、【安全合规】

### 现状分析

- 后端用 JWT + Permissions Guard 做 RBAC，路由级与方法级权限齐备。
- 能力网关已明确"Key 仅服务端持有，走 `/api/capability/*`"。
- 但仓库当前 `.env` 中存在 `NEXT_PUBLIC_ARK_API_KEY` / `VITE_ARK_API_KEY` 两个会下发到前端的 Ark 密钥变量，与 README 中"统一经能力网关"原则相悖；同时 `.env.example` 缺失，新人易复制错。

### 核心痛点

1. **AI Key 泄露面**：前端注入了 `NEXT_PUBLIC_ARK_API_KEY` / `VITE_ARK_API_KEY`，编译产物会带出 Key（构建到 `dist/web/` 或 `.next/` 中），任何能拿到打包文件的人都拿到了模型 Key。
2. **PII / 敏感数据无识别**：用户在需求 / PRD / 验收反馈里随手贴的客户姓名、电话、合同号、内部代号会被原文发到外部模型。
3. **审计与可回放缺失**：高敏操作（删除需求、改权限、跑流水线发布）没有结构化审计日志。
4. **依赖安全**：`package.json` 锁定不严，缺自动化的 SCA / 漏洞扫描。
5. **模型分级管控**：未对"内部 / 公共云 / 私有云"模型做策略路由（如包含机密数据的请求必须走私有云）。

### 优化方向

#### 短期（1-3 个月）

- **`P0` AI Key 清零行动**：
  1. 立即从 `.env` 移除 `NEXT_PUBLIC_ARK_API_KEY` 与 `VITE_ARK_API_KEY`，前端只保留 `API_ORIGIN`。
  2. 提交 `.env.example`（不含真实 Key），新人按需复制并自行填入。
  3. 用 `git-secrets` / `trufflehog` 加 pre-commit 校验。
  4. 检查 `dist/web/` 或历史镜像是否带出 Key，必要时轮换 Ark Key。
  5. 前端所有 AI 调用强制走 `/api/capability/*`，CI 加 lint 规则禁止 `process.env.NEXT_PUBLIC_*ARK*`。
- **`P0` 审计日志**：新增 `audit_logs` 表（`actor / action / target / before / after / ip / at`），通过 NestJS Interceptor 统一拦截带 `@RequirePermissions` 的写操作落库。
- **`P1` PII 红线扫描**：在 `capabilities.service` 调用模型前加 `pii-redactor`（基于正则 + 命名实体识别）替换姓名、手机号、身份证、邮箱、内部代号；高风险词命中可拒绝并提示用户。
- **`P1` 速率与配额**：能力网关增加 `rate-limit`（IP + userId + pluginId），防止恶意刷调用与失控成本。
- **`P1` 依赖 SCA**：CI 接 `npm audit --omit=dev` + `osv-scanner`，输出基线报告。

#### 中长期（3-12 个月）

- **`P0` 模型分级与策略路由**：在数据库的 AI Skill 配置上加 `dataClass`（public/internal/restricted），调用前根据请求内容标签 + 用户角色，自动路由到合规模型（如 restricted 强制走自建大模型）。
- **`P1` 数据保留与脱敏**：审计日志、AI 调用日志按数据分级设置 TTL（如 30/90/365 天），过期自动归档/匿名化。
- **`P1` 合规导出**：支持按需求/产品维度一键导出"全链路数据 + 审计 + AI 调用"作为合规审查报告。
- **`P2` SSO/SCIM**：除飞书外，接入企业 IdP（OIDC），用户生命周期与 HR 系统对齐。

### 预期收益

- 模型 Key 暴露面归零，合规审计通过率 ↑。
- 关键操作可追溯，事故定位时间 ↓ 80%。
- 敏感数据不出域，满足内部数据红线要求。

---

## 八、【高频四大模块】AI 赋能细化方案

> 以下针对「需求中心 / 智能文档 / 交付引擎 / 验收中心」给出更具体的 AI 原生设计。

### 8.1 需求中心

#### 现状

- 已具备：需求采集 / 列表 / 详情 / 编辑、`requirement_classifier`、`requirement_optimizer`、草图上传、优先级、`flow_events` 时间轴。

#### AI 赋能短板

- 需求描述质量参差（业务方语言 vs PM 语言），重复需求难识别，跨产品/跨需求依赖关系不可见。

#### 优化方案

| 序号 | 能力 | 描述 | 优先级 | 实现要点 |
|----|----|----|----|----|
| 1 | **需求质量评分** | 录入即时给出"完整性 / 可测试性 / 业务价值"3 维评分 + 待补充清单 | P0 短期 | 复用 `requirement_optimizer`，新增 `requirement_quality_scorer` 插件（输出 JSON：score+missingFields[]+suggestions[]） |
| 2 | **重复需求检测** | 提交时基于向量检索给出 Top-3 相似已存在需求，避免重复立项 | P0 中长期 | pgvector + nightly embedding；提交前调用 `/api/rd/requirements/similar` |
| 3 | **草图智能解析** | 上传草图自动 OCR + 元素识别，回填到字段（功能列表草案） | P1 短期 | 接入多模态模型（Ark vision / GPT-4o），新增 `sketch_to_outline` 插件 |
| 4 | **需求依赖图谱** | 在详情页展示「依赖 / 被依赖 / 同主题」需求关系图 | P1 中长期 | 基于 AI 抽取 + 人工确认；Edge 写入 `requirement_relations` 表 |
| 5 | **AI 需求助理** | 详情页右侧抽屉常驻 Chat，能调用工具（查 PRD/规格/历史验收）回答业务方问题 | P1 中长期 | 接 `agent-orchestrator` + 工具网关（已有 `agent-tool-gateway`） |
| 6 | **批量录入** | 支持 Excel / 飞书表格批量导入 + 一键分类、一键分配 | P1 短期 | 后端流式处理 + 队列 + `requirement_classifier` 批跑 |

### 8.2 智能文档（PRD）

#### 现状

- 已有 `prd_generator`、Tiptap 编辑器、多需求合并能力（`prd-multi-requirement.ts`）。

#### AI 赋能短板

- PRD 改动后下游（规格 / 流水线）不自动联动；写作风格不统一；评审痛点缺辅助；缺组织级术语库。

#### 优化方案

| 序号 | 能力 | 描述 | 优先级 | 实现要点 |
|----|----|----|----|----|
| 1 | **段落级 Inline AI** | Tiptap 选区上下文菜单：改写 / 精简 / 扩写 / 转 JSON / 翻译 / 总结 | P0 短期 | 复用 `prd_generator` + 新通用 `text_transform` 插件 |
| 2 | **PRD 一致性检查** | 每次保存自动检查"功能列表 vs 业务流程 vs 非功能"是否自洽 | P0 短期 | 新增 `prd_consistency_checker` 插件（输出 JSON：issues[]+severity） |
| 3 | **变更影响分析** | PRD 改动后高亮"会影响哪些规格 / 哪些验收标准" | P0 中长期 | Diff + 依赖追踪 + 模型分析；写到一个浮层 |
| 4 | **组织级术语库 / 写作规范** | 设置中维护术语 + 模板，AI 生成自动遵从 | P1 短期 | `/org-spec-config` 增加术语 tab；prompt 注入 |
| 5 | **AI 评审助手** | 评审视图提供"差异摘要 / 风险提示 / 历史类似项对比" | P1 中长期 | RAG 召回历史 PRD + 评审记录 |
| 6 | **多模态生成** | 自动生成业务流程图 / 组件草图（Mermaid / 简易线框） | P1 中长期 | 模型输出 Mermaid，前端用现有 Tiptap 渲染或专用画布 |

### 8.3 交付引擎（AI 流水线）

#### 现状

- 已有 `pipeline_runs / step_runs`、`pipeline_git`、`code_review_assistant`、`pipeline_test_case_generator`、`pipeline_test_runner`、Agent 工作区与工具网关。

#### AI 赋能短板

- 流水线对用户而言仍像黑盒；自测失败定位慢；质量门禁不可配；多个 Agent 模型横向对比缺。

#### 优化方案

| 序号 | 能力 | 描述 | 优先级 | 实现要点 |
|----|----|----|----|----|
| 1 | **运行可视化** | 每个 step 节点展示输入 / 输出 / 关键指标 / Agent 决策树，与日志双视图联动 | P0 短期 | 升级 `AIPipelinePage`，新增 `RunGraph` 组件 |
| 2 | **失败根因分析** | step 失败时自动生成"根因摘要 + 建议修复 + 一键重试参数" | P0 短期 | 新增 `pipeline_failure_analyzer` 插件；接入到 `pipeline_step_runs.errorContext` |
| 3 | **质量门禁可配** | 可视化配置「单测覆盖率 / lint / SAST / API 规格一致性」阈值，未通过自动阻断 | P0 中长期 | 落地 `docs/ai-pipeline-architecture-design.md` 的 Quality Runner |
| 4 | **多模型 Codegen 对比** | 同一规格触发多个 Agent（Claude/GPT/自研）并行生成，自动跑测试取胜者 | P1 中长期 | `agent-orchestrator` 支持并行候选；评测中心展示对比 |
| 5 | **PR 摘要与变更解读** | 自动生成 PR 描述 + 影响域 + 风险点；评审人可问答式追问 | P1 短期 | 复用 `code_review_assistant` + 多轮对话上下文 |
| 6 | **沙箱预览 & 自动回归** | 部署后自动跑端到端冒烟（基于 PRD/FS 生成用例），失败截图 + 复现步骤回传 | P1 中长期 | 接 Playwright，结果落 `pipeline_step_runs` |

### 8.4 验收中心

#### 现状

- 已有 `acceptance_records`、`acceptance_feedback_analyzer`、对比视图、RFC 回退。

#### AI 赋能短板

- 验收标准散落在 PRD/规格的文本里，无显式 acceptanceCriteria；评分缺标准；干系人写反馈成本高。

#### 优化方案

| 序号 | 能力 | 描述 | 优先级 | 实现要点 |
|----|----|----|----|----|
| 1 | **结构化验收清单** | 从 PRD/规格自动抽取"验收用例 + 通过条件"，干系人逐条勾选 | P0 短期 | 新增 `acceptance_checklist_generator` 插件；落 `acceptance_criteria` 表 |
| 2 | **AI 预验收** | 提交验收前 AI 先跑一遍清单，把"明显不符"的项前置标红，节省干系人时间 | P0 短期 | 调用沙箱 / API 跑用例 + 多模态截图对比 |
| 3 | **语音 / 截图反馈** | 验收反馈支持语音转写 + 截图标注，自动结构化到失败标准 | P1 短期 | 接 Whisper / 浏览器原生 Speech API；截图工具基于现成 `html2canvas` |
| 4 | **反馈自动归类与派单** | AI 把反馈拆分到 PRD/规格/代码三类，自动派回对应责任人 | P1 中长期 | 升级 `acceptance_feedback_analyzer` 输出 `category + targetEntity + suggestedOwner` |
| 5 | **历史验收画像** | 给每位 PM/TM 形成"被驳回热区"画像，反哺培训与流程 | P2 中长期 | 数据仓 + 评测中心 |
| 6 | **RFC 智能助手** | 一键发起 RFC 时自动生成"变更说明 + 影响域 + 排期建议" | P1 短期 | 复用 `prd_generator` + 上下文 |

---

## 九、v1.1 短期 Roadmap 建议（3 个月内）

> 按价值/成本权衡挑选 12 项形成 v1.1 主线，可分两个 Sprint 推进。

### Sprint 1（前 6 周）— 安全底线 + 数据闭环

| 主题 | 任务 | 维度 | 优先级 |
|----|----|----|----|
| AI Key 治理 | 移除前端 Ark Key、添加 `.env.example`、CI lint 拦截、轮换 Key | 安全 | P0 |
| 能力网关治理 | `audit_logs`、PII 红线、rate-limit、ai 调用埋点 | 安全 / AI / 数据 | P0 |
| 指标驾驶舱 v1 | `/cockpit` 5 张核心卡片 + 数据埋点 | 数据 / 体验 | P0 |
| 时间轴视图 | 需求详情页统一时间轴 + 下一步 CTA | 体验 | P0 |
| 评审流抽象 | `Review` 实体 + PRD/规格通用评审组件 | 协同 | P0 |
| RdService 拆分 | 拆 6 个子 Service（保接口） | 架构 | P0 |

### Sprint 2（后 6 周）— AI 原生体验升级

| 主题 | 任务 | 维度 | 优先级 |
|----|----|----|----|
| Inline AI 框架 | `<InlineAiMenu>` + Tiptap 6 动作 | 效率 / AI | P0 |
| 需求质量评分 | `requirement_quality_scorer` 插件 + 提交弹窗 | 需求中心 | P0 |
| PRD 一致性检查 | `prd_consistency_checker` + 保存触发 | 智能文档 | P0 |
| 结构化验收清单 | `acceptance_checklist_generator` + 干系人勾选 | 验收 | P0 |
| 失败根因分析 | `pipeline_failure_analyzer` + 步骤面板 | 交付 | P0 |
| 飞书消息适配 | 关键事件订阅 + 推送 | 协同 | P1 |

---

## 十、中长期 Roadmap（3-12 个月）

| 阶段 | 主题 | 关键交付 |
|----|----|----|
| v1.2（M3-M6） | **AI 编排底座** | Agent Orchestrator、RAG (pgvector)、能力插件版本治理、Event Bus + Outbox |
| v1.3（M5-M8） | **流水线工程化** | Runner/Adapter 接口、质量门禁配置、多模型 Codegen 对比、PR 摘要 |
| v1.4（M7-M10） | **协同与移动端** | CRDT 协同编辑、PWA 移动端、智能提醒、自动流转规则引擎 |
| v2.0（M9-M12） | **生态与开放** | 插件 SDK、多租户、SSO/SCIM、对外 API、模型分级路由 |

---

## 十一、风险与依赖

| 风险 | 影响 | 缓解 |
|----|----|----|
| 模型可用性与成本波动 | AI 体验不稳定 / 成本失控 | 模型路由 + 降级 + rate-limit + 评测对比 |
| 数据安全合规要求收紧 | 阻塞外部模型使用 | 优先落地 PII 红线 + 私有云模型路由 |
| 巨型 Service 拆分回归风险 | 业务受影响 | 保留外部接口、子 Service 配单测、灰度上线 |
| 多角色权限模型变更 | 兼容老用户 | `Role` 改造保留旧值映射，迁移脚本 + 灰度 |
| 协同编辑引入新基建 | 周期长 | 先做段落锁 + 光标提示，后续再上 CRDT |

---

## 十二、附录：与现有代码资产的映射

| 优化项 | 对应代码位置 |
|----|----|
| 能力网关 / 插件 | `server/modules/capabilities/`、`server/capabilities/*.json` |
| AI Skill 配置 | `web/src/lib/ai-skills.ts`、`web/src/lib/ai-skill-engine.ts` |
| 业务主线（Requirement/PRD/Spec/Pipeline/Agent） | `server/modules/rd/rd.service.ts`、`web/src/lib/rd-types.ts`、`web/src/lib/rd-api.ts` |
| 权限与认证 | `server/modules/auth/*`、`web/src/lib/access-catalog.ts`、`web/src/components/require-route-access.tsx` |
| 流水线 | `server/modules/rd/rd-pipeline-*.spec.ts`、`server/modules/pipeline-git/*`、`docs/ai-pipeline-architecture-design.md` |
| Agent 工作区与工具 | `shared/agent-workspace-manager.ts`、`shared/agent-tool-gateway.ts` |
| 共享类型与校验 | `shared/plugin-types.ts`、`shared/spec-validation.ts`、`shared/org-spec-defaults.ts` |
| 数据库迁移 | `server/database/migrations/` |
| 设计系统 | `AGENTS.md`、`web/tailwind.config.ts`、`web/src/components/ui/*` |

---

> 本文档建议每个 Sprint 结束后更新一次"完成项"勾选与新增风险，作为产品 Roadmap 的活文档。
