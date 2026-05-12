# AI 研发提效平台优化执行计划

> 来源：`docs/optimize.md`  
> 当前执行策略：先完成 P0 可信底座，再进入 Agent 自动编码流水线。每完成一个任务，更新本文件状态并反馈整体进度。

## 状态说明

- `DONE`：已实现并完成验证。
- `IN_PROGRESS`：正在执行。
- `NEXT`：下一优先执行。
- `TODO`：待执行。
- `BLOCKED`：被外部依赖阻塞。

## 总体进度

| 指标 | 当前 |
| --- | --- |
| 总任务数 | 18 |
| 已完成 | 18 |
| 进行中 | 0 |
| 完成率 | 100% |
| 当前阶段 | 全部任务已完成 |
| 下一任务 | 无 |

## 阶段 A：可信平台底座

目标：先把内部可用版本的安全、数据和质量边界打稳。

| ID | 状态 | 优先级 | 任务 | 验收标准 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| O-001 | DONE | P0 | 实现 Nest JWT Guard 与 Permissions Guard | 未登录业务接口返回 401；缺权限返回 403；测试覆盖 Guard 主路径 | 无 |
| O-002 | DONE | P0 | 为 Auth/RD/Pipeline/Capabilities 接口补权限装饰器 | 关键 Controller 接入权限点；前端 API 自动携带 Bearer token；测试覆盖 header | O-001 |
| O-003 | DONE | P0 | 引入 Drizzle migrations，迁出 `ensureTables` | 有迁移目录、迁移 runner、npm 脚本、迁移状态表；可执行空迁移/基础迁移检查 | O-001 |
| O-004 | DONE | P0 | 移除生产前端 Ark Key 调用路径 | 生产不读取 `NEXT_PUBLIC_ARK_API_KEY`；AI 调用统一走服务端 capability | O-001/O-002 |
| O-005 | DONE | P0 | CI 增加 typecheck/eslint/test 必过 | 新增或修复校验脚本；至少服务端 typecheck 和聚焦测试可一键执行 | O-003 |
| O-006 | DONE | P0 | mock AI 输出生产环境禁止静默回退 | `NODE_ENV=production` 且无模型配置时返回明确错误，不返回演示内容 | O-004 |

## 阶段 B：研发主链路固化

目标：需求、PRD、规格、验收流程可控、可追溯。

| ID | 状态 | 优先级 | 任务 | 验收标准 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| O-012 | DONE | P1 | 新增需求状态机和流转事件表 | 非法跳转被拒绝；状态变化落事件表；详情页可读真实时间线 | O-003 |
| O-013 | DONE | P1 | Spec JSON Schema 校验 | 不合格 FS/TS/CP 不能提交审核；错误信息可定位字段 | O-003 |
| O-014 | DONE | P1 | 拆分 `AIPipelinePage` 与 `RdService` | 页面/Service 降低单文件复杂度；行为测试不回退 | O-012/O-013 |
| O-017 | DONE | P1 | 用 Dialog 替换 confirm/prompt | 删除/审核/回滚等确认交互统一，避免浏览器原生弹窗 | 无 |

## 阶段 C：可执行 AI 交付引擎

目标：形成 Codex Agent Client 式的自动编码工作台。

| ID | 状态 | 优先级 | 任务 | 验收标准 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| O-015 | DONE | P1 | PipelineRun/StepRun 最小模型落库 | 能创建 run/step；能查询步骤状态；现有 pipeline task 不破坏 | O-003 |
| O-007 | DONE | P0 | 设计 AgentSession/AgentTask/AgentToolCall/AgentWorkspace 数据表 | 数据表/类型/接口草案完整；与 PipelineRun 关系清楚 | O-015 |
| O-008 | DONE | P0 | 实现 ContextPack | 能将需求/PRD/FS/TS/CP/规范打成版本化上下文包 | O-007/O-013 |
| O-009 | DONE | P0 | 实现 Workspace Manager | 支持隔离 clone/worktree/branch/cleanup；日志可追溯 | O-007 |
| O-010 | DONE | P0 | 实现 Tool Gateway | shell/git/file/test/deploy 工具调用有审计、超时和审批元数据 | O-009 |
| O-011 | DONE | P0 | 在流水线页新增 Agent Thread + Plan 审核 MVP | 用户可对话生成计划；计划可批准；事件可追踪 | O-008/O-010 |
| O-016 | DONE | P1 | 实现 Agent Diff Review 和测试报告面板 | 可查看 diff、测试结果、风险提示并人工批准 | O-011 |

## 阶段 D：指标与治理

目标：让平台能证明“AI 研发提效”的效果。

| ID | 状态 | 优先级 | 任务 | 验收标准 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| O-018 | DONE | P2 | 智研看板增加提效/质量/成本指标 | 展示吞吐、周期、测试通过率、AI 调用成本等核心指标 | O-012/O-015 |

## 最近执行记录

### 2026-05-09

- DONE O-001：新增 `JwtAuthGuard`、`PermissionsGuard`、`@Public()`、`@RequirePermissions()`，业务接口默认鉴权。
- DONE O-002：为 Auth/RD/Capabilities/PipelineGit 接入权限点，前端 API 自动携带 Bearer token，补充 Guard 与 API header 测试。
- DONE O-003：新增 `scripts/db-migrate.js`、`server/database/migrations/`、`db:migrate` / `db:migrate:status` 脚本与迁移说明。
- DONE O-004：规格编辑页 FS/TS/CP 生成改为走服务端 capability；服务端使用私有 `ARK_API_KEY` + AI Skill 配置请求 Ark；浏览器端直连 Ark 路径禁用。
- DONE O-005：新增 `npm run ci:check`、`npm run test:p0`、`npm run eslint:server` 与 GitHub Actions P0 quality gate，覆盖服务端 typecheck、服务端/shared ESLint、P0 聚焦测试。
- DONE O-006：生产环境无 `ARK_API_KEY` 或 Ark 调用失败时返回明确错误；只有 `AI_DEMO_MODE=true` 才允许演示输出；前端 stream client 对非成功 SSE 抛错。
- DONE O-012：新增需求状态机、`rd_requirement_flow_events` 迁移/启动兼容 DDL、流转事件查询接口与详情页真实时间线；非法状态跳转在服务端拒绝。
- DONE O-013：新增共享 Spec Machine-Readable 校验器；服务端提交规格审核前强校验 FS/TS/CP；前端校验面板展示可定位字段错误。
- DONE O-014：抽离 `AIPipelinePage` 纯工具逻辑到 `pipeline-page-utils`，页面减少约 67 行；新增工具单测并纳入 P0 门禁。
- DONE O-017：新增可复用 `ConfirmActionDialog` / `PromptActionDialog`；流水线删除/重命名与智研看板删除不再使用原生 confirm/prompt。
- DONE O-015：新增 `rd_pipeline_runs` / `rd_pipeline_step_runs` 迁移、启动兼容 DDL、服务端 CRUD、前端 API/Hook 与 PipelineRun 聚焦单测，并纳入 P0 门禁。
- DONE O-007：新增 `rd_agent_sessions` / `rd_agent_tasks` / `rd_agent_tool_calls` / `rd_agent_workspaces` 迁移、启动兼容 DDL、服务端最小接口、前端类型/API/Hook 与 Agent 账本聚焦单测，并纳入 P0 门禁。
- DONE O-008：新增 `rd_context_packs` 迁移、启动兼容 DDL、版本化 ContextPack 生成/查询接口与前端 API/Hook；上下文包包含 requirement/prd/fs/ts/cp/org-spec/repo-summary 文件清单、manifest 与 checksum，并纳入 P0 门禁。
- DONE O-009：新增 Workspace Manager 纯计划器与 RD provision/ready/cleanup 接口；支持生成隔离 clone/worktree/agent branch/cleanup 生命周期计划，并将 Git 生命周期动作写入 `rd_agent_tool_calls` 审计表；新增服务端与共享工具单测并纳入 P0 门禁。
- DONE O-010：新增 Tool Gateway 风险策略与 RD prepare/approval/start/finish 接口；高风险 shell/git/deploy 命令默认进入审批，工具调用记录超时、审批、状态、退出码与结果摘要；新增服务端与共享策略单测并纳入 P0 门禁。
- DONE O-011：流水线详情新增 `AgentWorkbenchPanel`；支持创建 Agent Thread、生成 ContextPack、创建计划任务、批准计划后 provision workspace，并展示 Plan Board / Tool Timeline / Workspace 信息。
- DONE O-016：Agent 工作台新增 Diff Review / 测试报告面板；从工具调用审计聚合变更文件、测试命令、失败项和风险提示，并支持写入人工批准记录；新增 review 汇总单测并纳入 P0 门禁。
- DONE O-018：智研看板新增提效/质量/成本指标卡，展示自动化覆盖率、平均质量分、测试通过率与估算 AI 成本；新增指标计算工具与单测并纳入 P0 门禁。

## 每个任务完成后的反馈格式

```text
已完成：O-xxx <任务名>
整体进度：n/18，完成率 xx.x%
本次验证：<命令与结果>
风险/遗留：<如无则写无>
下一任务：O-xxx <任务名>
```
