# 产品锚点与 Brownfield 交付 — AI 编码执行计划

> **来源**：`docs/Review0519.md` 第 6 章（重点 **6.4 解决方案**）及第 7 章路线图  
> **目标**：实现「产品 Baseline + 需求 Delta + 分层 Context Pack」，使平台同时支持 Greenfield（造新杯）与 Brownfield（在现有杯上改）。  
> **前置**：`docs/optimize-execution-plan.md` 阶段 A–C（鉴权、ContextPack 单层、Agent 工作台）已完成。  
> **执行方式**：按阶段顺序推进；每完成一任务更新本文「状态」列并运行验收命令。

---

## 1. 状态与约定

### 1.1 状态说明

| 状态 | 含义 |
|------|------|
| `TODO` | 待开始 |
| `IN_PROGRESS` | 进行中 |
| `DONE` | 已实现且验收通过 |
| `BLOCKED` | 被依赖或环境阻塞 |

### 1.2 任务 ID 前缀

| 前缀 | 对应 Review 6.4 节 |
|------|-------------------|
| `B-0xx` | 6.4.7 数据模型与 API 基础 |
| `B-1xx` | 6.4.1 需求变更类型 |
| `B-2xx` | 6.4.2 产品基线 As-Built |
| `B-3xx` | 6.4.3 Delta 文档与 AI 提示词 |
| `B-4xx` | 6.4.4 分层 Context Pack |
| `B-5xx` | 6.4.5 产品 Hub |
| `B-6xx` | 6.4.6 验收与 RFC |

### 1.3 AI 编码通用守则

1. **最小改动**：只改任务列出的文件；不顺手重构无关页面（尤其 `AgentWorkbenchPanel.tsx` 仅在被 B-4xx 点名时修改）。
2. **类型先行**：先改 `shared/` 或 `web/src/lib/rd-types.ts`，再改 `server/modules/rd/rd.service.ts`，最后改 UI。
3. **迁移**：新表用 `server/database/migrations/YYYYMMDDHHMMSS_*.sql`；保留 `rd.service.ts` 内 `ensure*` 启动兼容（与现有 O-003 风格一致）。
4. **测试**：每个 `B-0xx`–`B-4xx` 任务至少补 1 个 Jest 用例；纳入 `npm run test:p0` 或新增 `test:p1-baseline` 脚本（见 B-099）。
5. **中文 UI**：用户可见文案用中文；枚举值用英文（`greenfield` 等）。
6. **Brownfield 阻断**：`changeType !== 'greenfield'` 时，无 `baselineId` 不得创建 PipelineRun / ContextPack（服务端强校验）。

### 1.4 总体进度（执行时更新）

| 指标 | 当前 |
|------|------|
| 总任务数 | 24 |
| 已完成 | 30 |
| 进行中 | 0 |
| 完成率 | 100%（B-306 为可选） |
| 当前阶段 | 阶段 7 — 工程收尾（已完成） |
| 下一任务 | — |

---

## 2. 架构目标（给 AI 的上下文）

```text
产品 Product
  └─ ProductBaseline (version, gitRef, as-built.md)
       └─ ProductCapability[] (能力条目)
需求 Requirement
  └─ changeType, productId, baselineId?
  └─ PRD/Spec (greenfield=全量 | brownfield=delta)
PipelineRun / ContextPack
  └─ Layer A: product baseline files
  └─ Layer B: requirement delta files (现有 createContextPack)
```

**关键现有文件（勿重复造轮子）**

| 领域 | 路径 |
|------|------|
| 需求/产品类型 | `web/src/lib/rd-types.ts` |
| RD 服务 | `server/modules/rd/rd.service.ts` |
| RD 控制器 | `server/modules/rd/rd.controller.ts` |
| Context Pack | `server/modules/rd/rd.service.ts` → `createContextPack`；`server/database/migrations/20260509000500_context_packs.sql` |
| 需求采集/编辑 | `web/src/screen/RequirementInputPage/RequirementInputPage.tsx`、`RequirementEditPage/RequirementEditPage.tsx` |
| 产品管理 | `web/src/screen/ProductManagementPage/ProductManagementPage.tsx` |
| PRD 生成 | `web/src/screen/PRDPage/PRDPage.tsx`、`server/capabilities/prd_generator.json`（或 capabilities 目录下对应配置） |
| 规格编辑/生成 | `web/src/screen/SpecEditPage/SpecEditPage.tsx` |
| Agent 工作台 | `web/src/screen/AIPipelinePage/AgentWorkbenchPanel.tsx` |
| 验收 | `web/src/screen/AcceptancePage/AcceptancePage.tsx` |
| 能力网关 | `server/modules/capabilities/capabilities.service.ts` |

---

## 阶段 0：数据模型与 API 基础（6.4.7）

**目标**：落库 Baseline/Capability；扩展 Requirement；暴露 REST；历史数据可迁移。

| ID | 状态 | 优先级 | 任务 | 实现要点 | 验收标准 | 依赖 |
|----|------|--------|------|----------|----------|------|
| B-001 | TODO | P0 | 新增 Drizzle/SQL 迁移：`rd_product_baselines`、`rd_product_capabilities` | 字段见 Review 6.4.7；`product_id` FK → `rd_products`；`capabilities` 可 JSONB 子表或独立表 | 迁移可 `npm run db:migrate`；启动不报错 | 无 |
| B-002 | TODO | P0 | 扩展 `rd_requirements`：`product_id`、`change_type`、`baseline_id` | `change_type` 默认 `greenfield`；`product_id` 可空过渡期 | 旧数据迁移脚本或启动时 `UPDATE` 将 `product` 字符串匹配到 `product_id` | B-001 |
| B-003 | TODO | P0 | 共享类型：`RequirementChangeType`、`IProductBaseline`、`IProductCapability` | `shared/` 新建 `product-baseline.ts` 或并入现有 shared 模块；`web/src/lib/rd-types.ts` re-export | `npm run type:check` 通过 | B-001 |
| B-004 | TODO | P0 | `RdService` CRUD：baselines / capabilities | `listProductBaselines(productId)`、`createProductBaseline`、`getProductBaseline`、`listCapabilities` | `server/modules/rd/rd-baseline.spec.ts` 覆盖创建与查询 | B-001–B-003 |
| B-005 | TODO | P0 | `RdController` 路由 | `GET/POST /api/rd/products/:id/baselines`、`GET .../baselines/:baselineId`、`GET .../capabilities` | 未登录 401；无权限 403（复用现有 Guard） | B-004 |
| B-006 | TODO | P0 | 前端 `rdApi` + hooks | `web/src/lib/rd-api.ts`、`web/src/lib/rd-hooks.ts` 增加 baseline 相关方法 | 产品页可 fetch baseline 列表（先不接 UI 也可单测 mock） | B-005 |
| B-007 | TODO | P1 | `GET /api/rd/requirements/:id/impact-preview` | 根据 requirement + baseline + PRD 草案返回影响模块列表（可先规则/模板，后接 AI） | 返回 JSON `{ modules, apis, risks[] }` | B-004 |

---

## 阶段 1：需求变更类型（6.4.1）

**目标**：采集/编辑第一问区分 Greenfield vs Brownfield；增强类强制产品与基线。

| ID | 状态 | 优先级 | 任务 | 实现要点 | 验收标准 | 依赖 |
|----|------|--------|------|----------|----------|------|
| B-101 | TODO | P0 | 需求采集页增加「变更类型」 | `RequirementInputPage`：Radio/Select 四项；文案：「新做一个产品/功能」vs「在现有产品上改动」 | 提交时 `changeType` 写入 API | B-002, B-006 |
| B-102 | DONE | P0 | 需求编辑页同步变更类型 | `RequirementEditPage` 同 B-101 | 编辑保存后类型持久化 | B-101 |
| B-103 | TODO | P0 | `productId` 强关联（替代纯字符串） | 产品下拉来自 `listProducts`；保存 `productId`；展示仍可用产品名 | 增强类未选产品 → 前端 toast + 后端 400 | B-002, B-006 |
| B-104 | TODO | P0 | Brownfield 必选基线 | `changeType` 为 `enhancement`/`defect`/`refactor` 时展示 baseline 下拉（该产品最新或指定版本） | 无 baseline 无法提交需求（或标为草稿） | B-101, B-004 |
| B-105 | TODO | P0 | 服务端校验 | `upsertRequirement`：非 greenfield 必须有 `productId` + `baselineId` | `rd-requirement-flow.spec.ts` 或新 spec 覆盖非法组合 | B-104 |
| B-106 | DONE | P1 | 需求详情/列表展示变更类型与基线 | `RequirementDetailPage`、`RequirementsPage` 增加 Badge | 可看到「增强 · 基线 v1.2」 | B-105 |

---

## 阶段 2：产品基线 MVP（6.4.2）

**目标**：TM 可手动维护「原杯子」并冻结 `gitRef` + `as-built.md`。

| ID | 状态 | 优先级 | 任务 | 实现要点 | 验收标准 | 依赖 |
|----|------|--------|------|----------|----------|------|
| B-201 | TODO | P0 | 产品详情路由 | `web/src/app/(main)/products/[id]/page.tsx` 或扩展 `ProductManagementPage` 为详情 Tab | 从列表点击进入详情 | B-006 |
| B-202 | TODO | P0 | 基线冻结表单 | 字段：`version`、`gitRef`、`gitUrl`（默认产品 git）、`notes`；能力清单先用 **Markdown 大文本** `asBuiltMarkdown` 存 baseline 表 | 点击「冻结基线」创建一条 baseline | B-201, B-004 |
| B-203 | TODO | P0 | 能力条目 CRUD（简化版） | 表格：domain、name、description、interfaceRef；或从 Markdown 解析（二选一，MVP 推荐表格） | 至少增删改 3 条 capability 并随 baseline 保存 | B-202 |
| B-204 | TODO | P1 | 从已发布需求合并能力（半自动） | 按钮「从 released 需求导入」：读该产品下 `status=released` 的需求与 PRD `featureList` 生成 capability 草案 | 导入后 TM 可编辑再冻结 | B-203 |
| B-205 | TODO | P2 | 渲染 `as-built.md` 供下载/预览 | 服务端 `renderAsBuiltMarkdown(baseline)` 生成标准结构 | Context Pack 与 UI 预览内容一致 | B-203, B-402 |

---

## 阶段 3：分层 Context Pack（6.4.4）

**目标**：Agent 上下文 = Layer A（产品基线）+ Layer B（需求 Delta）；Brownfield 创建 Run 前校验基线。

| ID | 状态 | 优先级 | 任务 | 实现要点 | 验收标准 | 依赖 |
|----|------|--------|------|----------|----------|------|
| B-401 | TODO | P0 | 扩展 `createContextPack` 入参 `baselineId?` | 加载 baseline；写入 `context/product/as-built.md`、`manifest.json`（含 baselineVersion、gitRef） | `rd-context-pack.spec.ts` 新增 brownfield 用例 | B-004, B-105 |
| B-402 | TODO | P0 | Layer 文件清单 | Layer A：`context/product/as-built.md`、`context/product/manifest.json`；Layer B：保留现有 `context/requirement.md` 等；manifest 标注 `scope: delta` | pack 的 `manifest.sources` 含 `baselineId` | B-401 |
| B-403 | TODO | P0 | Brownfield 阻断 | `createContextPack` / `createPipelineRun`：非 greenfield 无 baseline → `BadRequestException` | 单测覆盖 | B-401 |
| B-404 | TODO | P1 | 可选 `apis.snapshot.json` | 从 baseline capabilities 的 `api` 类型聚合 JSON | 文件存在且合法 JSON | B-203 |
| B-405 | DONE | P1 | Agent 工作台展示 Baseline 摘要 | `AgentWorkbenchPanel`：创建 ContextPack 前展示当前 baseline 版本与条目数 | TM 可见「基于 v1.2」 | B-401 |
| B-406 | DONE | P1 | 流水线创建任务默认带 baselineId | `AgentWorkbenchPanel` 创建 ContextPack 时从 requirement 继承 `baselineId` | 一键创建 pack 含双层 | B-403, B-405 |

---

## 阶段 4：Delta 文档与 AI（6.4.3）

**目标**：Brownfield 下 PRD/FS/TS/CP 只描述增量；AI 提示词分支。

| ID | 状态 | 优先级 | 任务 | 实现要点 | 验收标准 | 依赖 |
|----|------|--------|------|----------|----------|------|
| B-301 | DONE | P0 | Delta PRD Markdown 模板 | 新建 `shared/prd-delta-template.ts`：四段「基线引用/本次变更/不变更声明/影响面」 | 增强类创建 PRD 时预填模板 | B-104 |
| B-302 | DONE | P0 | PRD 生成提示词分支 | `PRDPage`：Brownfield 注入 baseline 摘要 + Delta 指令；缺结构时合并模板 | 生成内容含 `## 基线引用` | B-301, B-401 |
| B-303 | DONE | P1 | Spec 生成 Delta 模式 | `SpecEditPage` Brownfield 注入基线 + Delta FS/TS 提示；缺结构时合并模板 | enhancement 不会覆盖式重写整份 FS | B-302 |
| B-304 | DONE | P1 | CP 模板约束 | `buildCpDeltaPreamble` 注入 as-built 阅读与影响面回归 | CP markdown 含 checklist | B-402 |
| B-305 | DONE | P1 | `conflict_detector` 输入扩展 | 冲突检测传入 `baselineApis + deltaApis` JSON | 存量接口参与冲突分析 | B-404, B-303 |
| B-306 | TODO | P2 | `delta-fs.json` / `delta-ts.json` 结构化输出 | 可选：Spec 存 `deltaFunctionalSpec` 字段；完整 FS 由服务层 merge | merge 单测 round-trip | B-303 |

---

## 阶段 5：产品 Hub（6.4.5）

**目标**：以产品为入口查看基线、进行中需求、快捷创建增强需求。

| ID | 状态 | 优先级 | 任务 | 实现要点 | 验收标准 | 依赖 |
|----|------|--------|------|----------|----------|------|
| B-501 | DONE | P1 | 产品 Hub 布局 | 详情页 Tab：概览 / 能力目录 / 需求 / 基线历史 | 四 Tab 可切换 | B-201 |
| B-502 | DONE | P1 | 概览卡 | Git、沙箱、生产链接、当前默认 baseline 版本、负责人 | 信息来自 `IProduct` + 最新 baseline | B-501 |
| B-503 | DONE | P1 | 进行中需求列表 | `useRequirementsList` 按 `productId` 过滤 + 状态 Badge | 仅显示该产品需求 | B-103, B-501 |
| B-504 | DONE | P1 | 快捷「新建增强需求」 | 跳转带 `productId`/`changeType`/`baselineId` 预填 | 表单预填 | B-101, B-501 |
| B-505 | DONE | P2 | 基线版本对比 | `diffBaselineCapabilities` 双选对比新增/移除 | UI 展示 diff 列表 | B-203 |

---

## 阶段 6：验收与 RFC（6.4.6）

**目标**：验收回答「相对原杯子变了什么」；RFC 携带 baseline 上下文。

| ID | 状态 | 优先级 | 任务 | 实现要点 | 验收标准 | 依赖 |
|----|------|--------|------|----------|----------|------|
| B-601 | DONE | P2 | 验收页 Baseline vs 交付三列 | `BrownfieldAcceptancePanel` 三列对比 | 增强类需求可见对比表 | B-301, B-203 |
| B-602 | DONE | P2 | 变更摘要生成 | `acceptance_feedback_analyzer_1` + baseline/PRD 上下文 | 一键复制摘要 | B-601 |
| B-603 | DONE | P2 | RFC 携带 baselineRef | RFC 保留 `baselineId`；`PRDEditPage` 基线横幅 | RFC 后 PRD 仍显示基线 | B-104 |
| B-604 | DONE | P2 | 验收通过回写 As-Built | 验收通过可选合并能力并 `createProductBaseline` | 闭环冻结新基线 | B-202, B-601 |

---

## 阶段 7：工程收尾（跨阶段）

| ID | 状态 | 优先级 | 任务 | 实现要点 | 验收标准 | 依赖 |
|----|------|--------|------|----------|----------|------|
| B-099 | DONE | P0 | 测试脚本 `test:p1-baseline` | 在 `package.json` 聚合 baseline/context-pack spec | `npm run test:p1-baseline` 绿 | 各阶段 spec |
| B-098 | DONE | P1 | 更新 `docs/HAI智研平台.md` | 补充变更类型、产品 Hub、Delta PRD、验收 Brownfield | 文档与实现一致 | 阶段 1–4 DONE |
| B-097 | DONE | P1 | 更新 `AGENTS.md` 数据模型片段 | `IRequirement` / `IProductBaseline` 字段说明 | 与代码一致 | B-003 |

---

## 3. 推荐执行顺序（依赖图）

```text
B-001 → B-002 → B-003 → B-004 → B-005 → B-006
                    ↓
        B-101 → B-103 → B-104 → B-105
                    ↓
        B-201 → B-202 → B-203
                    ↓
        B-401 → B-402 → B-403 → B-405 → B-406
                    ↓
        B-301 → B-302 → B-303 → B-304 → B-305
                    ↓
        B-501 … B-504
                    ↓
        B-601 … B-604（P2）
```

**并行建议**：B-106 / B-098 可与 B-5xx 并行；B-306 / B-505 为可选增强。

---

## 4. 分阶段验收命令

```bash
# 每完成一个 P0 任务至少执行
npm run type:check
npm run test:p0

# 阶段 0–3 完成后
npm run test:p1-baseline   # B-099 添加后

# 涉及迁移
npm run db:migrate
npm run db:migrate:status
```

---

## 5. 单任务 AI 执行模板（复制到 Agent 会话）

```markdown
## 任务
执行 docs/plan.md 中的 <B-xxx>：<任务名>

## 约束
- 遵循 plan.md §1.3 AI 编码通用守则
- 不修改未列出的文件
- 中文 UI 文案

## 交付
1. 代码变更
2. 测试（新增或更新 spec 路径）
3. 验收命令输出摘要
4. 更新 docs/plan.md 中该任务状态为 DONE

## 参考
- Review 6.4.<节号>
- 关键文件：<从本计划表格「实现要点」列提取>
```

---

## 6. 任务完成反馈格式

```text
已完成：B-xxx <任务名>
阶段：<阶段名>
整体进度：n/24，完成率 xx.x%
本次验证：<命令与结果>
API/迁移：<是否需 db:migrate>
风险/遗留：<如无则写无>
下一任务：B-xxx
```

---

## 7. 与 Review 6.4 映射表

| Review 小节 | 计划阶段 | 核心任务 ID |
|-------------|----------|-------------|
| 6.4.1 需求类型 | 阶段 1 | B-101 – B-106 |
| 6.4.2 产品基线 | 阶段 2 | B-201 – B-205 |
| 6.4.3 Delta 文档 | 阶段 4 | B-301 – B-306 |
| 6.4.4 分层 Context Pack | 阶段 3 | B-401 – B-406 |
| 6.4.5 产品 Hub | 阶段 5 | B-501 – B-505 |
| 6.4.6 验收与 RFC | 阶段 6 | B-601 – B-604 |
| 6.4.7 数据模型与 API | 阶段 0 | B-001 – B-007 |

---

## 8. 风险与范围外

| 风险 | 缓解 |
|------|------|
| `requirement.product` 字符串与 `productId` 并存 | B-002 迁移 + 双写一段时间后只读 productId |
| `AgentWorkbenchPanel` 过大 | B-405 只加「基线摘要」区块，全量拆分另立任务（Review §3.4） |
| Git 扫描（Review P2） | 不在本计划 MVP；B-505 仅做基线 diff |

**范围外（本计划不包含）**：PipelineRun SSE、Quality Gate 阻断、工作台拆文件——见 `docs/Review0519.md` 第 7 章非 6.4 项；可与本计划并行由不同 Agent 负责。

---

*文档版本：2026-05-19 · 随实现更新「§1.4 总体进度」与各任务状态。*
