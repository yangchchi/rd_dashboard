# HAI 智研平台产品设计与实现评审

> **评审日期**：2026-05-19  
> **评审范围**：`AGENTS.md`、`docs/HAI智研平台.md`、现有 `docs/*` 设计文档、前端 `web/src`、后端 `server/modules`、能力插件 `server/capabilities`  
> **对标产品**：**Cursor**（AI 原生编码环境）、**飞书妙搭**（企业 AI 原生应用搭建平台）

---

## 1. 执行摘要

HAI 智研平台（`rd_dashboard`）的定位是 **AI 驱动型研发全生命周期管理系统**，覆盖需求 → PRD → 规格 → 流水线 → 验收的协作链路，并在交付引擎中集成 **Agent 工作台**（支持 Codex CLI / Cursor CLI / Claude Code 等编码工具）。这与 Cursor、妙搭在赛道上有本质差异：

| 维度 | Cursor | 飞书妙搭 | HAI 智研平台 |
|------|--------|----------|--------------|
| 核心对象 | 代码库 / 工作区 | 业务应用 / 页面 | 需求与交付工件（PRD、FS/TS/CP、流水线 Run） |
| 主要用户 | 工程师 | 业务人员、轻开发者 | PM / TM / 干系人（多角色协同） |
| AI 形态 | 编辑器内 Agent、补全、多文件改写 | 对话生成应用、局部选中调整 | 文档流式生成 + 流水线 Agent 派活 |
| 成功标准 | 可合并的 PR、通过测试 | 可上线业务系统 | 阶段状态推进、验收通过、质量门禁 |

**总体判断**：项目在 **流程编排、角色权限、文档结构化、Git 工件同步** 上已明显超出「静态原型」，尤其在 PRD 多需求合并生成、规格 FS/TS/CP 分层、流水线任务与 Agent Session 模型上投入较深；但与 Cursor 相比，**编码体验的深度与实时性** 仍属「外挂集成」层级；与妙搭相比，**从自然语言到可运行产物的闭环** 仍偏工程向，非业务人员「立等可取」。

**战略建议**：不要试图做成「又一个 Cursor」或「又一个妙搭」，而应强化 **「规格驱动的可信 AI 交付编排台」**——把 PRD/FS/TS/CP 作为 Agent 的唯一权威输入，把 Run/Step/Artifact/Quality Gate 做成可审计的执行真相源，再用 Cursor/妙搭 作为下游执行器或业务侧补充。

**关于「需求驱动 vs 产品驱动」**（详见第 6 章）：二者不是二选一。长期存在的 **产品（应用）** 应作为「杯子长什么样、已具备哪些特性」的锚点；每一次 **需求** 应作为「在这一版杯子上要改什么」的变更单元。当前实现以需求为主键编排，产品主数据偏弱——在存量系统上做增量（加把手）时，Agent 与评审容易「不知道原杯子」。

---

## 2. 对标产品能力画像（用于评审标尺）

### 2.1 Cursor

**强项（用户心智中的「不可替代」）**

- **代码库级上下文**：索引、语义检索、`@file` / `@folder` / `@code` 引用，跨文件一致改写。
- **Agent 闭环**：Plan → 改代码 → 跑终端 → 看报错 → 再改；Background Agent、Rules、MCP 扩展生态。
- **低摩擦执行面**：diff 审阅、多文件 patch、与 Git 工作流天然贴合。
- **体验密度**：单屏完成「问 → 看变更 → 接受/拒绝」，延迟与反馈极快。

**对 HAI 的启示**：用户评判「AI 能不能干活」时，首先看 **上下文是否准、执行是否可验证、失败是否可定位**——而非菜单是否齐全。

### 2.2 飞书妙搭

**强项**

- **多 Agent 分工**：需求分析 → 功能设计 → 开发 → 修复，对非技术用户包装成「对话即系统」。
- **所见即所得**：生成即可点选调整；PC/移动双端；一键发布与权限。
- **企业落地**：与飞书身份、审批、消息天然集成；强调「业务系统小时级上线」。

**对 HAI 的启示**：干系人与部分 PM 需要的是 **「看得见的成品」** 和 **「说人话就能改」**，而不是 Markdown 与 JSON Schema。

---

## 3. 产品设计评审（按业务模块）

### 3.1 智研看板与需求中心 —— **完成度较高，协同逻辑清晰**

**已实现亮点**

- 六阶段泳道（`requirements-kanban.tsx`）支持拖拽变更状态，与 `AGENTS.md` 状态色体系一致。
- 看板叠加 **效率指标、排行榜、赏金金币** 等运营化元素（`DashboardPage.tsx`），有利于 TM/PM 参与感。
- 需求采集支持产品维度、PM/TM 定向领取、Markdown 描述、赏金份额等企业场景字段。

**与对标差距**

| 能力 | Cursor | 妙搭 | HAI 现状 | 建议 |
|------|--------|------|----------|------|
| 需求 → 可运行预览 | 无（非其范畴） | 强：对话出页面 | 弱：需走完 PRD/规格/流水线 | 在「待验收」前增加 **沙箱预览摘要卡**（截图/URL/核心路径），减少干系人空等 |
| 自然语言改需求 | 无 | 强 | 中：编辑页为主 | 需求详情增加 **「用一句话补充/变更」** AI 助手，自动 diff 描述并生成 RFC 草稿 |
| 跨角色视图 | 无 | 按应用 | 有角色筛选 | 增加 **「我只关心阻塞项」** 视图（逾期、验收失败、流水线 failed） |

**建设性建议**

1. **状态机显式化**：将「允许流转矩阵」从隐式校验提升为产品可见规则（悬停提示为何不能拖入某列），减少 TM 与 PM 反复确认。
2. **需求 ↔ 工件一键溯源**：详情页应默认展示「当前阻塞在哪一环」：缺 PRD / 规格未审 / 无流水线 Run / 验收打回——对标妙搭的「进度可读性」。

### 3.2 智能文档（PRD）—— **AI 能力突出，是平台差异化资产**

**已实现亮点**

- PRD 列表 + 流式生成（`prd_generator`）、多需求合并生成、参考文档上传与粘贴（`PRDPage.tsx` 体量大但功能完整）。
- 评审流（提交/通过/驳回）、与需求状态联动、审计字段（`rdAuditCreate` 等）。
- PRD 编辑页 Markdown + AI 扩写入口（`PRDEditPage.tsx`）。

**与对标差距**

| 能力 | Cursor | 妙搭 | HAI | 建议 |
|------|--------|------|-----|------|
| 结构化 ↔ 可视化 | 代码视图 | 页面/组件视图 | 以 Markdown 为主 | 增加 **功能列表/验收标准** 的结构化表格视图，并可导出为 Agent 消费的 YAML |
| 版本对比 | Git diff | 轻量历史 | 有 version 字段 | 做 **PRD 版本 diff**（章节级），评审会场景刚需 |
| 流程图 | 无 | 内置 | 规划有 flowchart | 优先 **Mermaid 嵌入 + 渲染**，比 Konva 更重但迭代快 |

**建设性建议**

1. **PRD 作为「单一事实源」契约**：生成 FS/TS 时强制引用 PRD 版本号；变更 PRD 后提示「下游规格/流水线需重跑」——这是相对妙搭「改对话即改系统」的工程化优势。
2. **降低 PM 认知负担**：流式生成时增加 **大纲预览 → 确认 → 全文生成** 两步，避免长文流式刷屏（妙搭式「先结构后细节」）。

### 3.3 技术基准（规格 FS/TS/CP）—— **深度足够，需强化「机器可读」可信度**

**已实现亮点**

- FS / TS / **编程计划 CP** 三层（`SpecEditPage.tsx` 约 1400 行），AI 生成 FS/TS/CP、组织级规范（`OrgSpecConfigPage`）。
- `conflict_detector` 插件、规格校验相关单测（`rd-spec-validation.spec.ts`）。
- Machine-Readable JSON 视图与 Git 同步能力（架构文档已描述）。

**与对标差距**

- **Cursor**：不管理 FS/TS，但 **代码与规格一致性** 靠开发者自觉；HAI 若能把「API 覆盖度、用例覆盖」量化，可形成壁垒。
- **妙搭**：规格隐含在生成应用内；HAI 的 FS/TS 对业务用户 **过重**。

**建设性建议**

1. **规格质量分（Spec Health Score）**：在规格页展示 API 完整度、必填字段、与 PRD 功能点映射率——对标 Cursor 的「index 覆盖率」心智。
2. **CP（编程计划）产品化**：将 CP 明确为 Agent 的 **执行剧本**（步骤、约束、禁止改动目录），并在 Agent 工作台只读展示当前 CP 版本。
3. **冲突检测从演示到阻断**：`conflict_detector` 在 CI/提交规格审核时 **failed 则不可 approve**（与 `docs/optimize.md` P0 一致）。

### 3.4 交付引擎（AI 流水线 + Agent 工作台）—— **投入最大，是关键战场**

**已实现亮点**

- 流水线任务 CRUD、Git 仓库配置（SSH/PAT）、沙箱 URL、发布结果、提交记录、代码评审与测试报告 UI（`AIPipelinePage.tsx` ~2355 行）。
- **Agent 工作台**（`AgentWorkbenchPanel.tsx` ~3248 行）：Session 历史、Ask/Agent 模式、`/` 技能与 `@` 文件引用、对接 Codex/Cursor CLI/Claude Code、工作区代码面板。
- 后端已有 `PipelineRun` / `StepRun` 表结构与 API（`rd-pipeline-runs.spec.ts` 等），Agent Session/Task/ToolCall 模型完整。
- 测试用例生成/执行报告插件（含启发式兜底 `heuristicGeneratedCasesFromSpecs`）。

**与 Cursor 的核心差距**

| 维度 | Cursor | HAI 现状 | 建议 |
|------|--------|----------|------|
| 上下文装配 | 自动索引全库 | 依赖 FS/TS/CP + 工作区 excerpt + 手动 `@` | 实现 **Context Pack 自动装配**（按任务关联 PRD/Spec/CP/最近 diff），减少 TM 手工 @ |
| 执行反馈 | 终端/问题面板实时 | 部分 runtime 输出 + 任务状态轮询 | **SSE 日志流** + 步骤级状态（架构文档 P0 已列） |
| 变更审阅 | 内置 diff、逐 hunk 接受 | `AgentWorkspaceCodePanel` | 增加 **与 main 的 PR 式 diff**、风险文件高亮、一键「仅测试受影响模块」 |
| 工具生态 | MCP、Rules | AI Skill 配置页 | 将 **组织 Rules**（编码规范、目录约束）注入每次 Agent 派活 |
| 可靠性 | 本地/云 Agent | 调用外部 CLI | 明确 **Runner 隔离**（容器/沙箱）与超时、重试、取消语义 |

**与妙搭的差距**

- 妙搭：**对话 → 可点选的应用 → 发布**；HAI：**对话 → 代码仓库变更 → 需 TM 看懂 Git**。
- 建议：对干系人提供 **「交付摘要页」**（自然语言 + 核心截图 + 沙箱链接），隐藏 Git/CLI 细节；TM 仍用工作台深度操作。

**建设性建议（流水线 P0，与 `docs/ai-pipeline-architecture-design.md` 对齐）**

1. **编排真相源**：UI 主展示 `PipelineRun` + `StepRun`，而非仅 `PipelineTask` 单状态；任务卡片显示「当前步骤 / 失败步骤 / 重试次数」。
2. **质量门禁产品化**：覆盖率、lint、评审分数阈值 **未通过则不可进入待验收**——把「AI 可信度」从文案变成规则。
3. **人工干预标准化**：暂停/重试/回滚/取消 对应后端 `POST .../actions`，并写审计日志（谁、何时、为何）。
4. **Workbench 瘦身**：`AgentWorkbenchPanel` 已超 3000 行，应按 **Session 列表 / 对话区 / 运行时 / 工具栏** 拆组件，否则难以达到 Cursor 级迭代速度。

### 3.5 验收中心 —— **流程完整，可加强「对比闭环」**

**已实现**：待验收列表、评分、反馈、RFC 意图、`acceptance_analyzer` 插件。

**建议**

1. **并排对比视图强化**：原始需求（含草图）vs 沙箱能力清单 vs 实际 PR diff 摘要——对标妙搭「生成即所见」的验收心智。
2. **验收 → RFC → PRD 回退** 做成向导（一步选原因、一步指派 PM、一步带上下文打开 PRD），减少干系人不知「打回后去哪改」。

### 3.6 赏金猎场 —— **差异化运营模块，注意与主线融合**

**已实现**：独立领域模型、抢单并发、动效设计文档（`docs/superpowers/specs/2026-04-14-bounty-hunt-design.md`）、狩猎场页面。

**建议**

1. 明确 **赏金任务与需求状态机** 的映射（何时自动创建悬赏、何时结算金币），避免「双轨状态」让用户困惑。
2. 排行榜与看板指标统一 **金币口径**（已发布才生效等规则应在 UI  Tooltip 说清）。

### 3.7 平台治理（认证、权限、插件）—— **基础已补，需持续硬化**

**进展**：`JwtAuthGuard`、`PermissionsGuard` 全局注册（`auth.module.ts`），飞书 OAuth，插件/技能配置页，P0 单测覆盖鉴权与能力网关。

**建议**

1. 权限从「菜单可见」扩展到 **动作级**（发布 Git、删除需求、回滚流水线、管理 Skill）并在 UI 禁用 + 服务端 403 双保险。
2. **AI 调用审计**：记录 skillId、token 估算、操作者、关联 requirementId——对标企业采购 Cursor/妙搭 时的合规诉求。

---

## 4. 实现成熟度评估

### 4.1 成熟度矩阵（主观分级：★ 规划 / ★★ 原型 / ★★★ 可用 / ★★★★ 生产级）

| 模块 | 前端 | 后端 | 数据持久化 | 说明 |
|------|------|------|------------|------|
| 需求看板与列表 | ★★★★ | ★★★ | ★★★ | 拖拽、筛选、赏金字段齐全 |
| PRD 管理与 AI 生成 | ★★★★ | ★★★ | ★★★ | 流式体验完整；版本 diff 待补 |
| 规格 FS/TS/CP | ★★★★ | ★★★ | ★★★ | 编辑重；校验与门禁待硬化 |
| 流水线任务展示 | ★★★ | ★★★ | ★★★ | Run/Step 已有；编排执行仍弱 |
| Agent 工作台 | ★★★ | ★★★ | ★★★ | 功能集中单体过大；CLI 集成依赖环境 |
| 验收中心 | ★★★ | ★★★ | ★★★ | 主流程可用 |
| 赏金猎场 | ★★★ | ★★★ | ★★★ | 玩法完整，与主线需更紧耦合 |
| 能力插件网关 | ★★★ | ★★★★ | ★★★ | 服务端流式；部分能力仍 demo |
| 鉴权与权限 | ★★★ | ★★★★ | ★★★ | Guard 已有；全接口覆盖需核查 |

### 4.2 工程与可维护性

- **页面体量风险**：`AgentWorkbenchPanel.tsx`（3248 行）、`AIPipelinePage.tsx`（2355 行）、`SpecEditPage.tsx`（1425 行）、`PRDPage.tsx`（1311 行）——功能集中但 **变更成本高、测试困难**，与 Cursor 团队「小组件快速迭代」相反。
- **双轨 AI 调用**：历史上有前端直连 Ark 路径；当前 README 已强调经 `/api/capability/*`，应 **彻底下线前端 Key 路径**（`docs/optimize.md` P0）。
- **Schema 治理**：业务表仍在 `rd.service.ts` 启动时自愈建表；已有 `npm run db:migrate`，应完成 **Drizzle 迁移与启动解耦**。
- **测试资产**：P0 聚焦单测覆盖鉴权、流水线 Run、Agent 执行器、规格校验——方向正确；UI 层仍缺关键路径 e2e。

---

## 5. 战略定位建议：三条「不要做」与三条「必须做」

### 5.1 不要做

1. **不要** 在平台内复刻完整 IDE（语法高亮、LSP、多 tab 编辑）——交给 Cursor/VS Code，HAI 做 **编排与审计**。
2. **不要** 用妙搭方式弱化 FS/TS——那是 TM 与 Agent 的 **质量护栏**；可做视图简化，不可删模型。
3. **不要** 在无 Run/Step/Artifact 的情况下堆砌更多「任务状态文案」——用户会当成假进度。

### 5.2 必须做

1. **规格驱动的 Context Pack**：每次 Agent/插件调用自动打包 PRD vN + Spec + CP + 组织规范 + 最近失败日志。
2. **可执行流水线 + 质量门禁**：与架构文档一致，让「待验收」= 门禁已通过 + 沙箱可访问 + 交付摘要已生成。
3. **角色分层体验**：干系人看「结果与对比」；PM 看「文档与评审」；TM 看「工作台与 Run」——同一数据，三种密度。

---

## 6. 产品锚点与需求变更单元：「杯子模型」与优化方案

> 本章回应一个核心产品命题：**应以需求为驱动，还是以产品（应用）为驱动？**  
> 结论先行：**产品定义「世界现状」，需求定义「本次要改什么」**——编排主键可以仍是需求，但缺少产品级「现状锚点」时，存量改造必然失真。

### 6.1 问题陈述：两种杯子场景

| 场景 | 业务描述 | 对规格的要求 | 典型失败模式 |
|------|----------|--------------|--------------|
| **从零造杯**（Greenfield） | 要一个钛合金杯：密封圈杯盖、塑料把手、防滑杯底… | 完整 PRD + 全量 FS/TS/CP 即可 | 规格冗长但可自洽 |
| **在现有杯上改**（Brownfield） | 已有钛合金杯，**只加塑料把手** | 必须知道：现有结构、已有特性、把手安装位、与密封圈/防滑垫的约束 | Agent 按「新杯」重做一遍；或漏掉与杯盖的干涉；评审无法判断「只改了把手」 |

软件产品与杯子同构：

- **产品（应用）** = 长期存在的「杯子」+ 其 Git 仓库、运行环境、已发布版本。
- **需求** = 一次有边界的变更意图（加把手 / 改密封圈 / 修漏水 bug）。
- **规格（FS/TS/CP）** 在 Greenfield 下是 **全集**；在 Brownfield 下应是 **相对现状的增量（Delta）**，且增量必须 **显式引用现状基线（Baseline）**。

若平台只积累「每个需求自己的 PRD/Spec」，而不积累「这个产品此刻已经有什么」，就会出现：

1. PM 写 PRD 时重复描述已有功能，或遗漏已有约束；  
2. TM 生成 FS/TS 时把存量 API 再设计一遍；  
3. Agent 在工作区里缺少「只允许改把手相关模块」的边界；  
4. 验收时无法回答：「本次交付相对上一版到底变了什么？」

### 6.2 现状诊断：当前模型偏「需求单线程」

结合代码与数据模型，当前平台状态可概括为：

| 层级 | 现状 | 对 Brownfield 的支撑 |
|------|------|----------------------|
| **产品 `IProduct`** | 有独立主数据（`gitUrl`、`sandboxUrl`、`productionUrl`、负责人等） | 有「杯子属于哪条产品线」的锚，但 **未承载能力清单与版本基线** |
| **需求 `IRequirement`** | 泳道、赏金、全流程主键；`product` 多为 **字符串对齐** 产品名，非强 FK | 适合作为变更单元，但 **未区分 Greenfield / Brownfield** |
| **PRD / Spec** | 按需求（及 PRD）生成，版本在文档内 | 默认按 **全量描述** 生成，缺 **Delta 模式** |
| **Context Pack** | 已实现：按 `requirement_id` 冻结 PRD+FS+TS+CP+组织规范（`rd_context_packs`） | 是 **单次执行的 Delta 包**，但 **未合并产品级 Baseline**；`repo-summary.md` 仅有 Git URL/分支元数据，无「已具备特性」语义 |
| **流水线 / Agent** | 工作区按任务/需求建分支，可 `@` 文件 | 依赖 TM 手工补上下文，等同要求用户「记得原杯子长啥样」 |

因此：**不是「需求驱动错了」，而是「只有需求、没有产品现状」时，存量优化必然吃力。** 妙搭/Cursor 在 Brownfield 上分别靠「应用实例即现状」和「代码库索引即现状」解决；HAI 作为 SDLC 编排台，必须用 **「产品基线 + 需求增量」** 显式建模。

### 6.3 推荐原则：双轴模型，而非二选一

```text
                    ┌─────────────────────────────────────┐
                    │  产品 Product（长期锚点）              │
                    │  · 身份：git / 环境 / 负责人           │
                    │  · 基线：已发布版本 + 能力目录 As-Built │
                    │  · 规范：组织级 OrgSpec（材质/工艺标准）  │
                    └──────────────┬──────────────────────┘
                                   │ 1:N
                    ┌──────────────▼──────────────────────┐
                    │  需求 Requirement（变更单元）         │
                    │  · changeType: greenfield | enhance … │
                    │  · baselineRef: 产品版本 @ commit/tag  │
                    │  · 增量 PRD / Delta Spec / CP         │
                    └──────────────┬──────────────────────┘
                                   │ 1:1..N
                    ┌──────────────▼──────────────────────┐
                    │  交付 Run（一次可审计的执行）          │
                    │  · ContextPack = Baseline ⊕ Delta      │
                    └─────────────────────────────────────┘
```

**编排主键**：仍可保持 **需求** 驱动看板与赏金（一次改动、一次验收），避免把产品对象拉进泳道造成混乱。  
**上下文主键**：Agent 与 AI 插件必须以 **产品 Baseline + 需求 Delta** 为输入，否则 Brownfield 不可信。

### 6.4 解决方案（分能力层）

#### 6.4.1 需求类型（Change Type）——采集页第一问

在需求采集/编辑增加必填 **变更类型**（示例枚举）：

| 类型 | 含义 | PRD/Spec 策略 | Context Pack |
|------|------|---------------|--------------|
| `greenfield` | 新产品或大范围重写 | 全量 PRD + 全量 FS/TS | 可无 Baseline，或引用空基线 |
| `enhancement` | 存量上加能力（加把手） | **Delta PRD**（仅写变更+影响面） | Baseline + Delta |
| `defect` | 修缺陷 | 现象/根因/回归范围 | Baseline + 最小 Delta |
| `refactor` | 不改外部行为 | 约束「行为不变」+ 度量 | Baseline + 技术 Delta |

UI 文案可对 PM 友好：「这是新做一个杯子，还是在现有杯子上改？」——与业务语言一致。

#### 6.4.2 产品基线（Product Baseline / As-Built Catalog）——「原杯子长啥样」

为每个 `IProduct` 维护 **可版本化的现状目录**（不必一次做全，可分阶段）：

**内容建议（能力条目 Capability Item）**

- 功能域 / 模块名（如「杯盖·密封圈」）  
- 对外接口（API path、事件、页面路由）  
- 数据实体（表/字段摘要）  
- 依赖与集成点  
- 来源：`released` 需求汇总 | Git 扫描 | 人工维护 | 上次验收快照  

**版本锚点（Baseline Version）**

- `baselineVersion`：语义化版本或 `release-2026.04`  
- `gitRef`：tag / commit SHA（与产品 `gitUrl`、流水线 `gitBaseBranch` 对齐）  
- `capturedAt`：冻结时间  
- 可选：`sandboxUrl` / `productionUrl` 在该版本的快照说明  

**与「杯子」的对应**

- 密封圈、防滑垫、钛合金杯体 = Baseline 中的 **已有 Capability**（只读展示）。  
- 塑料把手 = 本需求 Delta 中 **新增 Capability**，并声明 `dependsOn: ['杯体']`、`conflictsWith: []`。

**建设路径（由易到难）**

1. **MVP**：产品详情页「能力清单」Markdown + 手动维护；发布需求时将已 `released` 的需求功能列表 **合并进清单**。  
2. **P1**：从 Git `main` 扫描 OpenAPI / 路由 / 目录结构生成草案，TM 确认后入库。  
3. **P2**：每次验收通过自动生成 `As-Built` 快照版本，作为下一需求的默认 Baseline。

#### 6.4.3 Delta 文档（增量 PRD / 增量 Spec）——「只描述把手」

当 `changeType !== greenfield` 时：

**PRD 模板强制区块**

- `## 基线引用`：`产品 X @ baseline v1.2 (commit abc123)`  
- `## 本次变更`：仅描述新增/修改/删除  
- `## 不变更声明`：明确不动的部分（避免 Agent 重写杯底）  
- `## 影响面`：模块、API、数据、回归范围  

**FS/TS 生成策略**

- AI 提示词改为：**在 Baseline FS/TS 上生成 patch**，输出 `delta-fs.json` / `delta-ts.json`（JSON Merge Patch 或章节级 diff），而非整份覆盖。  
- `conflict_detector` 输入改为：**Baseline + Delta**，检测「把手」是否与「密封圈」接口冲突。

**CP（编程计划）**

- 步骤显式：`[ ] 阅读 baseline/context/as-built.md` → `[ ] 仅修改 packages/handle/*` → `[ ] 回归杯盖密封测试`。

#### 6.4.4 分层 Context Pack——Agent 的「原杯 + 变更说明」

在现有 `createContextPack`（需求级）之上，扩展为 **两层打包**：

```text
Agent 最终上下文 =
  Layer A  ProductBaselinePack（产品级，变更频率低）
    · context/product/manifest.json
    · context/product/as-built.md          # 能力目录人类可读
    · context/product/apis.snapshot.json   # 可选：OpenAPI 摘要
    · context/product/architecture.md      # 最近发布版架构摘要
  ⊕
  Layer B  RequirementDeltaPack（需求级，现有逻辑）
    · context/requirement.md
    · context/prd.delta.md                 # 或 prd.md 但标注 scope=delta
    · context/fs.delta.json / ts.delta.json
    · context/cp.md
    · context/org-spec.md
```

**规则**

- Brownfield：**创建 Run 前校验** `baselineRef` 存在且 `gitRef` 可检出；否则阻断并提示「请先冻结产品基线」。  
- Greenfield：Layer A 可为空或仅含 OrgSpec。  
- checksum / version：**Baseline 与 Delta 分别版本化**，避免一次小改动手动重扫全库。

这与 Cursor「索引全库」等价物是：**Baseline = 产品级索引快照，Delta = 本次任务说明**；HAI 的优势是可审计、可评审、可跨需求复用。

#### 6.4.5 产品主页（Product Hub）——导航从「需求列表」升级为「产品 → 需求」

建议新增或强化 **产品详情 Hub**（可在 `ProductManagementPage` 上扩展）：

| 区块 | 内容 |
|------|------|
| 概览 | 负责人、Git、沙箱/生产链接、当前 Baseline 版本 |
| 能力目录 | As-Built 树状/表格，支持搜索 |
| 进行中需求 | 按阶段泳道 **过滤该产品** |
| 已发布历史 | released 需求 + 对应 tag/commit |
| 快捷操作 | 「新建增强需求」「冻结基线」「对比两版 Baseline」 |

看板仍可全局按需求展示，但 TM/PM 日常应从 **「打开 HAI 智研平台 → 选产品 → 看存量与本次改动」** 进入，而不是只记得需求 ID。

#### 6.4.6 验收与 RFC——回答「相对原杯子变了什么」

- 验收页增加 **Baseline vs 本次交付** 三列：原能力 | 变更 | 验证结果。  
- 一键生成 **变更摘要**（给干系人，妙搭式可读）：「在 v1.2 钛合金杯上新增可拆卸塑料把手，未改动密封圈与防滑垫」。  
- RFC 打回时携带 `baselineRef`，回到 PRD 阶段不会丢失「原杯子」上下文。

#### 6.4.7 数据模型与 API 草案（与现有表衔接）

**新增（建议）**

```ts
// 产品能力条目（As-Built 的一条「特性」）
interface IProductCapability {
  id: string;
  productId: string;
  baselineVersion: string;
  domain: string;           // 如「杯盖」
  name: string;             // 如「密封圈」
  description: string;
  interfaces?: { kind: 'api' | 'route' | 'event'; ref: string }[];
  source: 'manual' | 'git_scan' | 'released_requirement' | 'acceptance_snapshot';
  sourceRef?: string;       // requirementId / commit / scan job id
}

interface IProductBaseline {
  id: string;
  productId: string;
  version: string;          // v1.2
  gitRef: string;           // commit / tag
  gitUrl: string;
  capabilities: IProductCapability[];
  frozenAt: string;
  frozenBy?: string;
}

// 需求侧扩展
interface IRequirement {
  // ...existing
  productId: string;        // 强 FK，替代仅字符串 product
  changeType: 'greenfield' | 'enhancement' | 'defect' | 'refactor';
  baselineId?: string;      // Brownfield 必填
}
```

**API（建议）**

- `GET /api/rd/products/:id/baselines` / `POST .../baselines`（冻结基线）  
- `GET /api/rd/products/:id/capabilities?baseline=...`  
- `POST /api/rd/context-packs` 增加 `baselineId`，服务端合并 Layer A+B  
- `GET /api/rd/requirements/:id/impact-preview`（变更影响面草案，供 TM 确认）

**迁移**：`requirement.product` 字符串逐步映射到 `productId`；历史需求可默认 `changeType=greenfield` 直至人工标注。

### 6.5 与 Cursor、妙搭的对照（为何 HAI 必须自建 Baseline）

| 产品 | 「原杯子」从哪来 | 对 HAI 的启示 |
|------|------------------|---------------|
| **Cursor** | 打开仓库即现状；索引 = As-Built | Runner 侧靠 Git；**编排台侧**仍要把「哪条产品、哪次发布」写进 Baseline 供 PM/干系人看 |
| **妙搭** | 应用实例 + 页面结构即现状 | 强调可视化 Baseline；HAI 可用 **能力目录 + 沙箱链接** 达到类似「点开就看到原杯」 |
| **HAI 智研** | 需显式建模 | **Product Baseline + Requirement Delta** 是 SDLC 场景下的核心竞争力 |

### 6.6 优化路线图（并入平台节奏）

在原有 90 天路线中，**Brownfield 能力应与前述 P0 Agent 上下文并列**，否则流水线越自动化，「改错杯子」的风险越大。

| 阶段 | 交付项 | 验收标准 |
|------|--------|----------|
| **P0** | 需求 `changeType` + `productId` 强关联；产品页展示 Git/环境 | 创建增强类需求时必须选产品 |
| **P0** | 产品 Baseline MVP（手动能力清单 + `gitRef`） | 能冻结一版 as-built.md |
| **P1** | Delta PRD 模板 + AI 生成提示词分支 | enhancement 不再生成整杯 PRD |
| **P1** | Context Pack 合并 Baseline 层 | Agent 工作区可见 `product/as-built.md` |
| **P1** | FS/TS Delta + conflict 对 Baseline | 冲突检测可报「与密封圈接口不一致」 |
| **P2** | 验收「相对基线变更」视图 + 发布自动回写 Baseline | 干系人可读变更摘要；下一需求默认上一 Baseline |
| **P2** | Git 扫描生成能力目录草案 | TM 确认率 > 人工从零维护 |

### 6.7 小结

- **产品驱动**：回答「这个软件/杯子 **现在** 是什么」。  
- **需求驱动**：回答「**这一次** 要改什么、如何验收」。  
- **规格驱动**：Greenfield 下描述全集；Brownfield 下描述 **相对 Baseline 的 Delta**。  
- **平台优化方向**：从「每条需求自带一套完整 PRD/Spec」演进为 **「产品 Baseline 复用 + 需求 Delta 编排 + 分层 Context Pack」**——这样「只加塑料把手」与「造一只新杯子」才能在同一套系统里都做对。

---

## 7. 分优先级建设路线图（建议 90 天）

### P0（0–4 周）：可信交付闭环 + 产品锚点 MVP

| 项 | 目标 | 验收 |
|----|------|------|
| PipelineRun 编排 MVP | 创建 Run 后按步骤推进 codegen → test → gate | UI 步骤条与 DB `step_runs` 一致 |
| SSE 日志 | 工作台与任务详情实时日志 | 断线可重连 |
| Quality Gate 阻断 | 未通过不可标「待验收」 | 有阈值配置与失败原因 |
| AI 网关统一 | 前端无模型 Key | 安全扫描通过 |
| Agent 工作台拆分 | 单文件 <800 行 | 无功能回退 |
| **需求 changeType + productId** | 区分新造杯 / 改把手 | 增强类需求必选产品与基线 |
| **产品 Baseline MVP** | 手动 as-built 能力清单 + gitRef | 可冻结并在 Context Pack 引用 |

### P1（5–8 周）：对标 Cursor 的「可用 Agent」+ Brownfield 文档

| 项 | 目标 |
|----|------|
| Context Pack 双层 | Baseline ⊕ Delta 自动合并进 Agent |
| Delta PRD / Delta FS·TS | enhancement 类不再全量生成 |
| PR 式 diff 审阅 | 关联 Git PR/分支，风险文件提示 |
| 组织 Rules | 与 `OrgSpecConfig` 联动注入 Agent |
| PRD/Spec 版本 diff | 评审与 RFC 场景 |
| conflict_detector + Baseline | 对存量接口做冲突检测 |

### P2（9–12 周）：对标妙搭的「干系人可读」+ 基线闭环

| 项 | 目标 |
|----|------|
| 交付摘要页 | 非技术语言 + **相对基线变更** 一句話 |
| 验收 Baseline vs 交付 | 三列对比 + 不变更声明勾选 |
| 发布回写 As-Built | 验收通过合并能力目录 |
| 需求一句话变更助手 | 降低 RFC 门槛 |
| 飞书消息通知 | 状态变更、验收结果、流水线失败 @ 责任人 |
| Git 扫描能力目录草案 | TM 确认后入库（可选） |

---

## 8. 与现有内部文档的关系

| 文档 | 关系 |
|------|------|
| `docs/optimize.md`（2026-05-09） | 本评审 **继承** 其 P0 工程项（鉴权、迁移、流水线引擎、构建门禁），并补充 **产品对标与角色体验** 视角 |
| `docs/ai-pipeline-architecture-design.md` | 技术路线 **一致**；本评审强调需尽快让用户感知 Run/Step，而非长期停留在任务列表 |
| `docs/HAI智研平台.md` | 功能清单 **准确**；实现上流水线执行与部分插件仍为「演示/半自动」 |
| `AGENTS.md` | 六阶段与插件规划 **清晰**；建议在 UI 全局贯彻状态色与阻塞溯源 |

---

## 9. 结论

HAI 智研平台已经具备 **「企业研发协同 + AI 文档 + Agent 派活」** 的完整骨架，PRD/规格/流水线/工作台的投资使其在 **Cursor（单点编码）** 与 **妙搭（单点搭应用）** 之间占据了有价值的 **「规格驱动交付编排」** 生态位。

下一阶段胜负手不在于再增加页面数量，而在于：

1. 让 **PipelineRun + Quality Gate** 成为用户信任的「真实进度」；  
2. 让 **产品 Baseline + 需求 Delta + 分层 Context Pack** 解决存量改造「不知道原杯子」的根因（第 6 章）；  
3. 让 **Context Pack + Rules** 缩小与 Cursor 的 Agent 差距；  
4. 让 **交付摘要与验收对比（相对基线）** 缩小与妙搭的业务可读性差距；  
5. 用 **工程拆分与迁移治理** 支撑团队持续迭代（尤其 Agent 工作台与流水线页）。

按上述 P0→P2 推进，平台可从「功能齐全的原型」升级为「TM 愿意日常打开、干系人愿意签字验收」的 AI 研发提效系统——且 **既能造新杯，也能在旧杯上只加把手而不弄丢密封圈**。

---

*本评审基于 2026-05-19 代码库静态分析与既有设计文档，未包含生产环境压测与用户访谈；实施前建议结合 2–3 名 PM/TM 做 30 分钟可用性走查以校准优先级。*
