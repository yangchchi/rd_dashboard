# AI 研发流水线架构设计文档

## 1. 背景与目标

当前系统已具备以下能力：
- 需求、PRD、规格（FS/TS）全链路数据管理。
- 在流水线创建时，将 PRD/FS/TS 文档推送到 Git 仓库。
- 在前端页面展示流水线任务、日志、测试报告、质量指标、提交记录。

但现阶段“流水线执行”仍以任务记录为主，缺少真正的执行编排能力（代码生成、构建、测试、质量门禁、部署、回滚等）。本方案目标是把流水线升级为可持续运行、可审计、可扩展的工程化平台。

核心目标：
- 从“文档同步 + 任务展示”升级为“可执行流水线引擎”。
- 支持多阶段执行、失败重试、人工干预、质量门禁。
- 实现步骤级实时状态与日志可观测性。
- 形成可沉淀、可追踪、可复盘的研发交付闭环。

## 2. 架构原则

- **状态机驱动**：所有执行动作必须有明确状态转移规则。
- **事件驱动**：流水线阶段通过事件解耦，便于扩展新工具。
- **可回放可审计**：每一步保留输入、输出、日志、错误码、操作者。
- **隔离执行环境**：代码生成与构建测试应运行在受控隔离环境（Runner）。
- **质量优先**：通过质量门禁（Quality Gate）控制流转与发布。

## 3. 总体架构

建议采用“四层架构”：

1) 编排层（Orchestrator）
- 负责任务编排、状态机、重试、超时、补偿、并发控制。
- 统一定义 Pipeline Run 与 Step Run 生命周期。

2) 执行层（Runners）
- Codegen Runner：调用代码代理（如 OpenClaw）生成代码并提交分支。
- Build Runner：执行编译、打包。
- Test Runner：执行单测/集成/e2e。
- Quality Runner：执行 lint、覆盖率、SAST/SCA 等。
- Deploy Runner：执行部署与回滚。

3) 集成层（Adapters）
- Git Adapter：分支、commit、PR、diff、评论。
- CI/CD Adapter：GitHub Actions / GitLab CI / Jenkins 等。
- Notification Adapter：飞书/钉钉消息、Webhook。

4) 展示与治理层（Portal + Policy）
- 流水线看板、步骤实时日志、质量门禁、失败诊断。
- 权限、审批、策略配置（如阈值、强制人工审批）。

## 4. 关键领域模型

### 4.1 PipelineRun（流水线运行实例）
- runId
- pipelineId
- requirementId
- triggerType（manual/push/schedule/retry）
- status（queued/running/succeeded/failed/cancelled）
- currentStep
- startedAt/endedAt/duration
- operator

### 4.2 PipelineStepRun（步骤实例）
- stepRunId
- runId
- stepType（plan/codegen/build/test/quality/deploy）
- status（pending/running/succeeded/failed/skipped）
- attempt
- startedAt/endedAt
- inputRef/outputRef（工件引用）
- errorCode/errorMessage

### 4.3 Artifact（工件）
- artifactId
- runId/stepRunId
- type（source_patch/test_report/coverage/sbom/image/deploy_manifest）
- storageUri
- checksum
- createdAt

### 4.4 QualityGateResult（质量门禁）
- runId
- ruleId
- metricName（coverage/security/lint 等）
- threshold
- actualValue
- pass（true/false）
- reason

## 5. 状态机与标准流程

推荐标准流程：

1. `RUN_CREATED`
2. `PLAN_GENERATED`
3. `CODE_GENERATING`
4. `CODE_COMMITTED`
5. `BUILD_RUNNING`
6. `TEST_RUNNING`
7. `QUALITY_GATE_CHECKING`
8. `DEPLOY_RUNNING`（可选）
9. `RUN_COMPLETED` / `RUN_FAILED`

失败路径：
- 可重试步骤：build/test/quality 检查。
- 不可自动重试步骤：代码生成逻辑冲突、策略校验失败。
- 若 deploy 失败，执行自动回滚并记录 rollback step。

## 6. 后端能力清单（当前缺口）

### 6.1 必需新增模块
- `pipeline-orchestrator`：状态机 + 任务调度。
- `pipeline-runner-gateway`：统一调用不同 Runner。
- `pipeline-quality-gate`：指标判定与阻断。
- `pipeline-events`：事件总线（可先基于 DB + queue，后续升级 MQ）。
- `pipeline-observability`：日志与指标聚合。

### 6.2 Runner 与工具能力
- Codegen（OpenClaw 或其他代理）
  - 输入：PRD/FS/TS、组织编码规范、历史上下文。
  - 输出：代码补丁、提交记录、变更摘要。
- Build/Test
  - 执行命令、收集测试报告、覆盖率、失败堆栈。
- Security/Quality
  - lint、SAST、依赖漏洞、许可证合规检查。
- Deploy
  - 环境选择（dev/staging/prod）、灰度、回滚。

### 6.3 API 建议
- `POST /api/pipeline-runs`：创建运行实例。
- `GET /api/pipeline-runs/:id`：运行详情。
- `GET /api/pipeline-runs/:id/steps`：步骤列表。
- `GET /api/pipeline-runs/:id/logs?stepId=...`：步骤日志。
- `POST /api/pipeline-runs/:id/actions`：pause/retry/cancel/rollback。
- `GET /api/pipeline-runs/:id/artifacts`：工件清单。
- `GET /api/pipeline-runs/:id/quality-gates`：门禁结果。

## 7. 前端平台能力演进

### 7.1 P0（必须）
- 步骤级进度视图（替代单任务状态）。
- 实时日志流（SSE/WebSocket）+ 断线重连。
- 失败定位面板（步骤、错误码、建议动作）。
- 质量门禁面板（阈值、实际值、是否阻断）。

### 7.2 P1（增强）
- 代码变更审查中心（diff、风险热点文件）。
- 测试资产中心（失败历史、波动用例）。
- 环境管理与回滚入口（版本对比、一键回滚）。

### 7.3 P2（治理）
- 流水线 SLA 与成本看板（时长、失败率、MTTR、token/算力成本）。
- 审批策略可配置（高风险变更强制审批）。

## 8. 数据与可观测性设计

建议新增数据表（示意）：
- `rd_pipeline_runs`
- `rd_pipeline_step_runs`
- `rd_pipeline_step_logs`
- `rd_pipeline_artifacts`
- `rd_pipeline_quality_gates`
- `rd_pipeline_events`

日志与指标：
- 统一 traceId（runId + stepRunId）。
- 指标：步骤耗时、重试次数、成功率、测试通过率、门禁通过率。

## 9. 安全与权限

- Runner 使用最小权限 Token（只授予必要 repo/environment 权限）。
- 关键动作（deploy/rollback/override gate）必须审计。
- 代码代理执行环境应隔离（容器/沙箱），避免主机污染。

## 10. 技术选型建议（分阶段）

- **阶段 1（快速落地）**：Nest + Redis + BullMQ + Postgres（现有体系增量改造）。
- **阶段 2（规模化）**：Temporal/Argo + 对象存储（工件）+ 专用日志系统。
- **阶段 3（企业级）**：策略引擎（OPA）、多租户隔离、细粒度审批与合规。

## 11. 验收标准

- 能创建并执行真实步骤流水线（非仅记录）。
- 任一步骤失败可定位、可重试、可回滚。
- 质量门禁可阻断发布并给出明确原因。
- 平台可实时展示步骤状态与日志。
- 完整审计链条可追溯到 run/step/operator/artifact。

