# AI驱动型研发管理看板 - 需求拆解文档

## 产品概述

- **产品类型**: AI驱动型研发管理系统 (R&D Management System)
- **场景类型**: prototype - app
- **目标用户**: 干系人(Stakeholder)、产品经理(PM)、技术经理(TM)
- **核心价值**: 消除需求传递断层，实现从原始想法到代码产出的标准化路径，透明化研发全生命周期
- **界面语言**: 中文
- **主题偏好**: light
- **导航模式**: 路径导航
- **导航布局**: Sidebar

---

## 页面结构总览

| 页面名称 | 文件名 | 路由 | 页面类型 | 入口来源 |
|---------|-------|------|---------|---------|
| 需求看板 | `DashboardPage.tsx` | `/` | 一级 | 导航 |
| 需求采集 | `RequirementInputPage.tsx` | `/requirements/new` | 一级 | 导航 |
| 需求列表 | `RequirementsPage.tsx` | `/requirements` | 一级 | 导航 |
| PRD管理 | `PRDPage.tsx` | `/prd` | 一级 | 导航 |
| PRD编辑 | `PRDEditPage.tsx` | `/prd/:id/edit` | 二级 | PRD管理页 → 编辑按钮 |
| 规格定义 | `SpecPage.tsx` | `/specification` | 一级 | 导航 |
| 规格编辑 | `SpecEditPage.tsx` | `/specification/:id/edit` | 二级 | 规格定义页 → 编辑按钮 |
| AI开发监控 | `AIPipelinePage.tsx` | `/ai-pipeline` | 一级 | 导航 |
| 验收中心 | `AcceptancePage.tsx` | `/acceptance` | 一级 | 导航 |
| 需求详情 | `RequirementDetailPage.tsx` | `/requirements/:id` | 二级 | 需求看板/列表 → 卡片点击 |

---

## 插件规划

| 插件实例名称 | 基于官方插件 | 业务用途 | 输出模式 | 所属页面 |
|------------|-----------|---------|---------|---------|
| prd_generator | ai-text-generate | 根据原始需求自动生成结构化PRD文档 | stream | PRD管理页 |
| spec_generator | ai-text-generate | 根据PRD生成技术规格说明书草稿 | stream | 规格定义页 |
| requirement_classifier | ai-categorization | 对需求进行自动分类和优先级识别 | unary | 需求采集页 |
| code_review_assistant | ai-text-summary | 分析代码生成结果，提供质量评估摘要 | stream | AI开发监控页 |
| conflict_detector | ai-text-to-json | 检测技术规格与现有系统的逻辑冲突 | unary | 规格定义页 |
| acceptance_analyzer | ai-text-summary | 分析验收反馈，生成改进建议 | stream | 验收中心页 |

---

## 导航配置

- **导航布局**: Sidebar（左侧固定导航）
- **导航项**:

| 导航文字 | 路由 | 图标 |
|---------|------|------|
| 需求看板 | `/` | LayoutDashboard |
| 需求采集 | `/requirements/new` | PlusCircle |
| 需求列表 | `/requirements` | List |
| PRD管理 | `/prd` | FileText |
| 规格定义 | `/specification` | Settings2 |
| AI开发监控 | `/ai-pipeline` | Cpu |
| 验收中心 | `/acceptance` | CheckCircle |

---

## 功能列表

- **页面**: 需求看板 (`DashboardPage.tsx`)
  - **页面目标**: 可视化展示需求在6个阶段的流转状态，提供全局视图
  - **功能点**:
    - **泳道视图**: 6列泳道布局（需求池→PRD编写中→规格定义→AI开发中→待验收→已发布），支持拖拽变更状态
    - **需求卡片**: 展示需求标题、优先级、期望上线时间、负责人，支持点击查看详情
    - **阶段统计**: 每个泳道顶部显示该阶段的需求数量
    - **快速筛选**: 按角色（我提交的/我负责的/全部）快速筛选需求
    - **状态流转**: 符合流转规则的状态变更（如"待验收"需干系人操作才能到"已发布"）

- **页面**: 需求采集 (`RequirementInputPage.tsx`)
  - **页面目标**: 为干系人提供标准化的需求提交入口
  - **功能点**:
    - **需求描述**: 富文本输入框，支持文本描述需求背景和内容
    - **草图上传**: 支持图片上传（草图、原型图等），AI辅助识别图中文字
    - **元信息录入**: 必填字段：期望上线时间、业务优先级（P0/P1/P2/P3）
    - **AI智能分类**: 提交时AI自动分析需求类型，推荐标签和分类
    - **保存草稿**: 支持保存为草稿，后续继续编辑

- **页面**: 需求列表 (`RequirementsPage.tsx`)
  - **页面目标**: 管理所有需求，支持搜索和批量操作
  - **功能点**:
    - **列表视图**: 表格展示需求ID、标题、状态、优先级、提交人、期望时间
    - **高级筛选**: 按状态、优先级、提交时间、提交人筛选
    - **搜索功能**: 按关键词搜索需求标题和描述
    - **批量操作**: 批量导出、批量变更优先级（需权限）
    - **新建入口**: 跳转至需求采集页

- **页面**: PRD管理 (`PRDPage.tsx`)
  - **页面目标**: 管理产品需求文档，支持AI辅助生成
  - **功能点**:
    - **PRD列表**: 展示所有PRD及其关联需求、编写状态、最后更新时间
    - **AI生成PRD**: 选择需求池中的需求，一键生成PRD草稿（含业务流程图、功能列表、非功能性需求）
    - **流程图绘制**: 集成可视化工具，支持绘制业务流程图（基于Konva.js或类似库）
    - **PRD评审**: 标记PRD评审状态，关联相关干系人
    - **版本管理**: 查看PRD历史版本，支持版本对比

- **页面**: PRD编辑 (`PRDEditPage.tsx`)
  - **页面目标**: 编辑PRD详细内容
  - **功能点**:
    - **结构化编辑**: 分区块编辑（背景、目标、业务流程、功能列表、非功能性需求）
    - **AI辅助写作**: 选中段落使用AI扩写、精简或优化表达
    - **关联需求**: 显示关联的原始需求，支持对比查看
    - **协作编辑**: 显示当前编辑者，避免冲突（基础提示）
    - **提交审核**: 完成后提交给技术经理进入规格定义阶段

- **页面**: 规格定义 (`SpecPage.tsx`)
  - **页面目标**: 管理技术规格说明书，确保Machine-Readable输出
  - **功能点**:
    - **规格列表**: 按PRD维度展示功能规格(FS)和技术规格(TS)的完成状态
    - **FS编辑**: 定义API接口规范、UI组件规范、交互逻辑，结构化JSON格式输出
    - **TS编辑**: 定义数据库Schema、系统架构图、第三方集成方案
    - **AI预评审**: 提交规格后，AI自动检测与现有系统架构的逻辑冲突
    - **格式校验**: 校验规格是否符合Machine-Readable标准（JSON Schema验证）
    - **导出规格**: 导出为AI可读取的标准化文件格式

- **页面**: AI开发监控 (`AIPipelinePage.tsx`)
  - **页面目标**: 监控AI代码生成与部署全流程
  - **功能点**:
    - **流水线看板**: 展示各需求的AI开发状态（代码生成中→自测中→构建中→部署中）
    - **代码生成日志**: 实时查看AI生成代码的过程和输出
    - **测试报告**: 展示单元测试和集成测试的执行结果与覆盖率
    - **质量指标面板**: 展示规格一致性（API覆盖度）、测试通过率等关键指标
    - **人工干预**: 技术经理可暂停/重试/回滚某个AI开发任务
    - **沙箱环境链接**: 一键跳转至部署后的测试环境

- **页面**: 验收中心 (`AcceptancePage.tsx`)
  - **页面目标**: 支持干系人进行最终验收，形成反馈闭环
  - **功能点**:
    - **待验收列表**: 展示当前用户需要验收的需求及其沙箱环境链接
    - **对比视图**: 并排对比"原始需求描述"与"实际实现功能"
    - **验收评分**: 多维度评分（功能完整性、业务价值匹配度、体验满意度）
    - **反馈录入**: 文字描述问题，支持截图标注
    - **一键RFC**: 验收不通过时，一键发起变更申请(RFC)，自动回退至PRD阶段并通知PM
    - **验收历史**: 查看历次验收记录和修改轨迹

- **页面**: 需求详情 (`RequirementDetailPage.tsx`)
  - **页面目标**: 展示需求全生命周期轨迹与关联信息
  - **功能点**:
    - **基础信息**: 需求描述、草图、优先级、期望时间等
    - **关联文档**: 快捷链接至对应的PRD、规格说明书、代码分支
    - **流转历史**: 时间轴展示需求在各阶段的流转记录和操作人
    - **当前状态**: 高亮显示当前所处阶段和待办事项
    - **操作按钮**: 根据当前状态和用户角色显示可操作按钮（如"进入PRD编写"、"提交验收"等）

---

## 数据共享配置

| 存储键名 | 数据说明 | 使用页面 |
|---------|---------|---------|
| `__global_rd_currentRequirement` | 当前选中的需求详情，类型为 `IRequirement` | 需求看板、需求详情、PRD编辑、规格编辑、验收中心 |
| `__global_rd_requirementList` | 需求列表缓存，类型为 `IRequirement[]` | 需求看板、需求列表 |
| `__global_rd_currentPRD` | 当前编辑的PRD内容，类型为 `IPRD` | PRD管理、PRD编辑 |
| `__global_rd_currentSpec` | 当前编辑的规格说明书，类型为 `ISpecification` | 规格定义、AI开发监控 |
| `__global_rd_userRole` | 当前用户角色，类型为 `'stakeholder' \| 'pm' \| 'tm'` | 全局（控制功能权限和可见性） |

```ts
interface IRequirement {
  id: string;
  title: string;
  description: string;
  sketchUrl?: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  expectedDate: string;
  status: 'backlog' | 'prd_writing' | 'spec_defining' | 'ai_developing' | 'pending_acceptance' | 'released';
  submitter: string;
  pm?: string;
  tm?: string;
  createdAt: string;
  updatedAt: string;
}

interface IPRD {
  id: string;
  requirementId: string;
  background: string;
  objectives: string;
  flowchart?: string;
  featureList: IFeature[];
  nonFunctional: string;
  status: 'draft' | 'reviewing' | 'approved' | 'rejected';
  version: number;
}

interface IFeature {
  id: string;
  name: string;
  description: string;
  acceptanceCriteria: string[];
}

interface ISpecification {
  id: string;
  prdId: string;
  functionalSpec: {
    apis: IApiDef[];
    uiComponents: IUIComponent[];
    interactions: IInteraction[];
  };
  technicalSpec: {
    databaseSchema: object;
    architecture: string;
    thirdPartyIntegrations: string[];
  };
  machineReadableJson: string;
  status: 'draft' | 'reviewing' | 'approved';
}

interface IApiDef {
  path: string;
  method: string;
  description: string;
  requestParams: object;
  response: object;
}

interface IUIComponent {
  name: string;
  type: string;
  props: object;
  events: string[];
}

interface IInteraction {
  trigger: string;
  action: string;
  condition?: string;
}

-------

# UI 设计指南

> **场景类型**: `prototype - app`（应用架构设计）
> **子场景确认**: 多页面研发管理系统，含 Sidebar 导航，10+ 功能页面
> **确认检查**: 本指南适用于 SaaS 类后台管理系统。如为单页数据看板请使用 `dashboard` 模板，如为静态报告请使用 `info_viz` 模板。

> ℹ️ Section 1-2 为设计意图与决策上下文。Code agent 实现时以 Section 3 及之后的具体参数为准。

## 1. Design Archetype (设计原型)

### 1.1 内容理解
- **目标用户**: 干系人(业务方，非技术背景)、产品经理(半技术，流程设计者)、技术经理(技术背景，架构决策者) — 混合专业背景，需在统一界面高效协作
- **核心目的**: 消除需求传递中的信息断层，建立从"需求构思→PRD→技术规格→AI生成→验收"的标准化链路，实现研发全生命周期透明化
- **期望情绪**: 专业可信(建立对AI生成质量的信任)、高效专注(高信息密度，减少页面跳转)、清晰可控(6阶段状态一目了然)
- **需避免的感受**: 混乱(多角色协作易产生的信息过载)、焦虑(对AI不确定性的担忧)、廉价感(影响对系统专业度的信任)
- **应用类型**: SaaS / 研发管理系统（Complex Web App）
- **交互复杂度**: 高 — 多页面系统(10页)、复杂表单(需求采集/PRD编辑)、可视化看板(泳道拖拽)、AI交互流(生成/监控/反馈)

### 1.2 设计语言
- **Aesthetic Direction**: 技术专业主义 + 数据秩序感，通过网格化信息架构和精确的状态色编码系统，建立"机器般精确"的可控感，缓解用户对AI黑盒的不确定焦虑
- **Visual Signature**: 
  1. 网格化信息架构（Grid-based layout with hairline borders）
  2. 六阶段状态色编码系统（6-State Color Coding）
  3. 几何角标装饰（Geometric corner accents for status）
  4. 高对比度数据展示（High-contrast data visualization）
  5. 微边框分层（Micro-border hierarchy）
- **Emotional Tone**: 专业可信、高效专注、精密可控
- **Design Style**: **Grid 网格** — 研发管理工具需要强烈的数据感和秩序感，网格线+角块+强调色条符合技术工具的理性审美；辅助 **Soft Blocks 柔色块** 用于需求卡片的状态区分，增加现代感
- **Application Type**: Complex Web App (SaaS/管理系统) — Sidebar Layout，视口利用率高，支持多模块持久导航

## 2. Design Principles (设计理念)

1. **状态即信息**: 6个研发阶段必须通过颜色+形状+位置三重编码，让用户在3秒内定位任意需求的当前状态，无需阅读文字。

2. **渐进式披露**: AI生成过程是黑盒，必须通过实时日志、进度条、质量指标面板将其"白盒化"，建立用户信任。

3. **角色语境适配**: 同一界面需根据 `userRole` (stakeholder/pm/tm) 动态调整功能可见性和操作权限，减少非相关信息的干扰。

4. **机器可读的可视化**: 技术规格(Spec)是AI的输入，其展示必须兼顾人类可读(结构化表单)和机器可读(JSON源码切换)，明确提示"Machine-Readable"状态。

5. **反馈即时性**: AI生成、状态流转、验收评分等操作必须提供即时的视觉反馈（加载态、成功态、错误态），避免用户在等待中产生焦虑。

## 3. Color System (色彩系统)

> **⚠️ App 场景配色规则**：本场景为 `prototype - app`，根据规则**禁止使用**共用预设配色方案库中的7个方案。以下配色基于产品定位（AI驱动、研发管理、专业工具）自主推导。
> 
> **配色推导逻辑**：
> - 主色相选择 217°（蓝-靛蓝区间）：传递技术感、专业度、可信度，符合开发者工具心智模型
> - 背景使用冷灰白（210° 20% 98%）：减少长时间使用的视觉疲劳，保持中性不干扰状态色
> - Header/Sidebar 使用深蓝黑（222° 47% 11%）：建立强烈的视觉锚点，区分导航区与内容区
> - 六阶段状态色围绕主色相声学分布，确保色盲友好（灰→蓝→靛→紫→橙→绿，明度递进）

### 3.1 主题颜色

| 角色 | CSS 变量 | Tailwind Class | HSL 值 | 设计说明 |
|-----|---------|----------------|--------|---------|
| bg | `--background` | `bg-background` | `hsl(210 20% 98%)` | 冷灰白，减少视觉疲劳，突出内容区 |
| surface | `--card` | `bg-card` | `hsl(0 0% 100%)` | 纯白卡片，与背景形成微妙层次 |
| header | `--header` | `bg-[hsl(222_47%_11%)]` | `hsl(222 47% 11%)` | 深蓝黑，Sidebar和Topbar背景，建立专业权威感 |
| text | `--foreground` | `text-foreground` | `hsl(222 47% 11%)` | 近黑，高对比度确保长文本可读性 |
| textMuted | `--muted-foreground` | `text-muted-foreground` | `hsl(215 16% 47%)` | 中灰蓝，用于次要信息、时间戳、占位符 |
| primary | `--primary` | `bg-primary` | `hsl(217 91% 60%)` | 亮蓝，主交互按钮、链接、关键操作 |
| primary-foreground | `--primary-foreground` | `text-primary-foreground` | `hsl(210 40% 98%)` | 纯白，primary按钮上的文字 |
| accent | `--accent` | `bg-accent` | `hsl(210 40% 96%)` | 极浅蓝灰，hover状态、次级按钮、选中背景 |
| accent-foreground | `--accent-foreground` | `text-accent-foreground` | `hsl(222 47% 11%)` | 深色，accent区域上的文字 |
| border | `--border` | `border-border` | `hsl(214 32% 91%)` | 冷灰蓝，微边框，建立Grid风格的层次 |
| input | `--input` | `border-input` | `hsl(214 32% 91%)` | 输入框边框，与border一致 |
| ring | `--ring` | `ring-ring` | `hsl(217 91% 60%)` | 焦点环，与primary一致 |

### 3.2 Sidebar 颜色（Navigation）

| 角色 | CSS 变量 | Tailwind Class | HSL 值 | 设计说明 |
|-----|---------|----------------|--------|---------|
| sidebar | `--sidebar` | `bg-sidebar` | `hsl(222 47% 11%)` | 与header一致，深蓝黑基底 |
| sidebar-foreground | `--sidebar-foreground` | `text-sidebar-foreground` | `hsl(210 40% 98%)` | 近白，确保在深色Sidebar上对比度≥7:1 |
| sidebar-primary | `--sidebar-primary` | `bg-sidebar-primary` | `hsl(217 91% 60%)` | 激活态背景，使用primary蓝 |
| sidebar-primary-foreground | `--sidebar-primary-foreground` | `text-sidebar-primary-foreground` | `hsl(0 0% 100%)` | 激活态文字，纯白 |
| sidebar-accent | `--sidebar-accent` | `bg-sidebar-accent` | `hsl(222 47% 16%)` | Hover态背景，比sidebar稍亮5% |
| sidebar-accent-foreground | `--sidebar-accent-foreground` | `text-sidebar-accent-foreground` | `hsl(210 40% 98%)` | Hover态文字，近白 |
| sidebar-border | `--sidebar-border` | `border-sidebar-border` | `hsl(222 30% 20%)` | Sidebar边框，比背景稍亮，微妙分隔 |
| sidebar-ring | `--sidebar-ring` | `ring-sidebar-ring` | `hsl(217 91% 60%)` | 聚焦环，与primary一致 |

### 3.3 研发阶段状态色（Six-State Status Colors）

> **核心记忆点**：6个阶段对应6种颜色，必须在所有页面保持一致，建立用户肌肉记忆。

| 阶段 | 标识符 | CSS Class | HSL 值 | 颜色名称 | 设计说明 |
|-----|-------|-----------|--------|---------|---------|
| 需求池 | `backlog` | `bg-status-backlog` | `hsl(220 9% 46%)` |  slate | 灰色，表示待处理、未激活 |
| PRD编写中 | `prd_writing` | `bg-status-prd` | `hsl(217 91% 60%)` | blue | 蓝色，产品阶段，与primary一致 |
| 规格定义 | `spec_defining` | `bg-status-spec` | `hsl(243 75% 59%)` | indigo | 靛蓝，技术设计阶段，比prd更深 |
| AI开发中 | `ai_developing` | `bg-status-ai` | `hsl(270 60% 55%)` | purple | 紫色，AI特色阶段，突出智能化 |
| 待验收 | `pending_acceptance` | `bg-status-pending` | `hsl(25 95% 53%)` | orange | 橙色，需要干系人行动，醒目 |
| 已发布 | `released` | `bg-status-released` | `hsl(142 71% 45%)` | green | 绿色，完成闭环，正向反馈 |

**状态色使用规范**：
- **Badge/Tag**: 使用对应颜色 + 10%透明度背景（如 `bg-blue-500/10`）+ 深色文字
- **左侧边框**: 卡片左侧3-4px色条标识当前阶段
- **图标颜色**: 状态图标使用对应纯色
- **禁止**: 同一页面使用超过2种状态色，避免彩虹效应（看板页面除外）

### 3.4 语义颜色（Semantic Colors）

| 用途 | 颜色 | HSL 值 | 使用场景 |
|-----|-----|--------|---------|
| 成功/通过 | green | `hsl(142 71% 45%)` | 验收通过、测试100%、正向趋势 |
| 警告/风险 | amber | `hsl(38 92% 50%)` | 即将逾期、低优先级提醒 |
| 错误/拒绝 | red | `hsl(0 72% 51%)` | 验收不通过、AI生成失败、RFC |
| 信息/提示 | blue | `hsl(217 91% 60%)` | 提示消息、AI建议、帮助引导 |

## 4. Typography (字体排版)

**字体选择逻辑**：
- 研发管理工具需要兼顾**可读性**（长文本PRD）和**数据感**（代码/规格展示）
- 中文环境优先使用系统字体确保加载速度和渲染质量
- 等宽字体用于代码片段、API定义、JSON展示，强化技术属性

**字体栈**：
- **Heading**: `'Inter', 'SF Pro Display', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`
- **Body**: `'Inter', 'SF Pro Text', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`
- **Mono (代码/数据)**: `'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', monospace`

**字体导入**（使用系统字体栈，无需引入 Google Fonts，确保多终端兼容）

**字号层级**：

| 层级 | 尺寸 | 字重 | 行高 | 用途 |
|-----|-----|-----|-----|-----|
| Page Title | `text-2xl` (24px) | `font-semibold` (600) | `leading-tight` | 页面标题（需求看板、PRD管理等） |
| Section Title | `text-lg` (18px) | `font-semibold` (600) | `leading-7` | 区块标题（泳道名称、表单分组） |
| Card Title | `text-base` (16px) | `font-medium` (500) | `leading-6` | 卡片标题（需求标题、PRD名称） |
| Body | `text-sm` (14px) | `font-normal` (400) | `leading-relaxed` | 正文、描述、PRD内容 |
| Caption | `text-xs` (12px) | `font-medium` (500) | `leading-4` | 标签、时间戳、元数据 |
| Data/Mono | `text-sm` (14px) | `font-mono` | `leading-6` | API路径、代码片段、JSON |

## 5. Global Layout Structure (全局布局结构)

### 5.1 Navigation Strategy (导航策略)

**导航布局**: **Sidebar (左侧固定导航)**

**结构**:
- **Sidebar**: 固定左侧，宽 `w-64` (256px)，背景 `hsl(222 47% 11%)` (深蓝黑)
- **主内容区**: 左侧留白 `ml-64`，内部内容区居中
- **Topbar**: 可选，仅在需要全局搜索/通知/用户菜单时显示，高度 `h-14`，背景与Sidebar一致或白色

**导航项配置**（7个主要入口）:

| 导航文字 | 路由 | 图标 | 角色可见性 |
|---------|------|-----|-----------|
| 需求看板 | `/` | LayoutDashboard | 全部 |
| 需求采集 | `/requirements/new` | PlusCircle | Stakeholder, PM |
| 需求列表 | `/requirements` | List | 全部 |
| PRD管理 | `/prd` | FileText | PM, TM |
| 规格定义 | `/specification` | Settings2 | TM, AI相关 |
| AI开发监控 | `/ai-pipeline` | Cpu | TM, Stakeholder(只读) |
| 验收中心 | `/acceptance` | CheckCircle | Stakeholder, PM |

**Sidebar 交互状态**:
- **默认态**: 文字 `text-sidebar-foreground` (近白)，图标透明度 70%
- **Hover态**: 背景 `bg-sidebar-accent` (稍亮深蓝)，文字纯白
- **激活态**: 背景 `bg-sidebar-primary` (亮蓝)，文字 `text-sidebar-primary-foreground` (纯白)，左侧3px白色边框指示器

### 5.2 Page Content Zones (页面区块配置)

**Standard Content Zone（全页面统一）**:
- **Maximum Width**: `max-w-[1400px]`（后台系统，需展示宽表格和看板，避免过窄导致信息折叠）
- **Padding**: `px-6 py-8`（桌面端），`px-4 py-6`（移动端，Sidebar收起时）
- **Alignment**: `mx-auto`（居中）
- **Vertical Spacing**: `space-y-8`（主要区块间距，保持8px倍数一致性）

**宽内容溢出策略**:
- 看板泳道、宽表格等组件外层使用 `overflow-x-auto` 实现横向滚动
- 禁止为此放大容器 max-w（保持设计一致性）

**页面特定布局模式**:

| 页面 | 布局模式 | 特殊配置 |
|-----|---------|---------|
| DashboardPage (需求看板) | 全宽流式 | 6列泳道，水平滚动，卡片固定宽度 `w-72` |
| RequirementInputPage (需求采集) | 居中窄栏 | `max-w-2xl`，分节表单，渐进式展示 |
| RequirementsPage (需求列表) | 全宽表格 | 可横向滚动表格，固定操作列 |
| PRDEditPage (PRD编辑) | 双栏自适应 | 左侧编辑区 `flex-1`，右侧AI助手 `w-80`（可选） |
| AIPipelinePage (AI监控) | 仪表盘布局 | 顶部指标卡片，中部日志流，底部操作区 |

## 6. Visual Effects & Motion (视觉效果与动效)

### 6.1 视觉效果

**Header/Hero 视觉方案**: 
- **Sidebar 背景**: 纯色深蓝黑 `hsl(222 47% 11%)`，无渐变（保持专业稳重）
- **顶部装饰**: Sidebar顶部可添加品牌Logo区，高度 `h-16`，底部1px边框 `sidebar-border`
- **网格纹理**: 内容区背景可选极低透明度网格线 `bg-[linear-gradient(to_right,hsl(214_32%_91%/0.5)_1px,transparent_1px),linear-gradient(to_bottom,hsl(214_32%_91%/0.5)_1px,transparent_1px)] bg-[size:24px_24px]`（仅在看板页面使用，增强Grid风格）

**装饰手法**:
- **角标方块**: 需求卡片左上角或右上角使用4px圆角的小方块标识优先级（P0红色、P1橙色、P2蓝色、P3灰色）
- **左侧色条**: 卡片、列表项左侧3-4px圆角色条标识状态（使用六阶段状态色）
- **微边框**: 所有卡片、输入框使用1px `border` 色，营造精密感

**圆角**:
- 容器/页面: `rounded-none`（Grid风格，锐利边缘）
- 卡片: `rounded-lg` (8px)（现代感与Grid的平衡）
- 按钮: `rounded-md` (6px)（微妙圆角）
- 标签/Badge: `rounded-full` ( Pill 形状，高识别度)
- 输入框: `rounded-md` (6px)
- Sidebar: `rounded-none`（固定边缘）

**阴影**:
- 卡片: `shadow-sm`（极浅阴影，依靠边框而非阴影分层）
- 下拉菜单/浮层: `shadow-md`（中等阴影，确保浮起感）
- Modal/Dialog: `shadow-lg`（强阴影，聚焦注意力）
- **禁止**: 大面积阴影、彩色阴影、弥散阴影（与Grid风格冲突）

### 6.2 复杂背景文字处理

**Sidebar 深色背景**:
- 文字颜色: `hsl(210 40% 98%)`（近白）
- 对比度: 与 `hsl(222 47% 11%)` 对比度 ≥ 12:1，远超4.5:1标准

**状态色背景上的文字**:
- 橙色(`hsl(25 95% 53%)`)、绿色(`hsl(142 71% 45%)`)等彩色背景上使用 **深色文字** (`hsl(222 47% 11%)`)，而非白色，确保可读性
- 实现方式: 状态Badge使用 `bg-opacity-10` 背景 + 纯色文字

### 6.3 动效设计

**缓动函数**: 
- 默认: `cubic-bezier(0.4, 0, 0.2, 1)`（ease-out，自然流畅）
- 弹性: `cubic-bezier(0.34, 1.56, 0.64, 1)`（轻微弹性，用于拖拽释放）

**关键动效**:

1. **状态流转动画** (看板拖拽):
   - 拖拽中: `scale-105 shadow-lg rotate-2`，0.2s ease-out
   - 落入新列: `scale-100 shadow-sm`，0.15s elastic
   - 列计数变化: 数字 `count-up` 动画，0.3s

2. **AI生成脉冲**:
   - AI开发中的卡片顶部蓝色渐变条 `animate-pulse`，表示进行中
   - 日志流自动滚动到底部，平滑滚动 `scroll-behavior: smooth`

3. **Hover反馈**:
   - 卡片Hover: `translateY(-2px) shadow-md`，0.15s ease-out
   - 按钮Hover: `brightness(1.1)`，0.1s
   - Sidebar项Hover: 背景色从左滑入 `translateX(-100%) → translateX(0)`，0.2s

4. **页面切换**:
   - 内容区淡入 `opacity-0 → opacity-1` + 轻微上移 `translateY(4px) → translateY(0)`，0.2s ease-out

## 7. Components (组件指南)

> **必须引用 Color System 中的颜色角色**（如 `primary`、`accent`、`border`、`status-*`）
> 每个组件需定义 Default/Hover/Active/Focus/Disabled 状态

### 7.1 Buttons

**Primary Button**:
- 背景: `bg-primary` (`hsl(217 91% 60%)`)
- 文字: `text-primary-foreground` (白色)
- 边框: 无
- Hover: `bg-primary/90` (透明度90%) + `shadow-sm`
- Active: `scale-95` (轻微缩小)
- Focus: `ring-2 ring-ring ring-offset-2`
- Disabled: `opacity-50 cursor-not-allowed`

**Secondary Button**:
- 背景: `bg-card` (白色)
- 文字: `text-foreground`
- 边框: `border border-border`
- Hover: `bg-accent` (`hsl(210 40% 96%)`)
- Active: `bg-accent/80`

**Ghost Button**:
- 背景: 透明
- 文字: `text-foreground`
- Hover: `bg-accent` + `text-accent-foreground`
- 用于: 图标按钮、次级操作

**Danger Button** (删除/拒绝):
- 背景: `bg-red-600` (`hsl(0 72% 51%)`)
- 文字: 白色
- Hover: `bg-red-700`

### 7.2 Status Badges (状态标签)

**六阶段状态Badge**:
```jsx
// 基础结构
<span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-${color}/10 text-${color}">
  <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-${color}" />
  状态文字
</span>
```

| 状态 | 颜色类 | 文字颜色 |
|-----|-------|---------|
| 需求池 | `bg-slate-500/10 text-slate-700` | `text-slate-700` |
| PRD编写中 | `bg-blue-500/10 text-blue-700` | `text-blue-700` |
| 规格定义 | `bg-indigo-500/10 text-indigo-700` | `text-indigo-700` |
| AI开发中 | `bg-purple-500/10 text-purple-700` + `animate-pulse` (点) | `text-purple-700` |
| 待验收 | `bg-orange-500/10 text-orange-700` | `text-orange-700` |
| 已发布 | `bg-green-500/10 text-green-700` | `text-green-700` |

### 7.3 Requirement Card (需求卡片)

**结构**:
- 容器: `bg-card rounded-lg border border-border p-4 shadow-sm`
- 左侧色条: `absolute left-0 top-4 bottom-4 w-1 rounded-r` (颜色对应状态)
- 内容区:
  - 顶部: 优先级角标 + 截止日期
  - 中部: 标题 (`font-medium text-base`) + 描述截断 (`text-sm text-muted-foreground line-clamp-2`)
  - 底部: 负责人头像 + 状态Badge

**Hover态**: `hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`

### 7.4 Form Elements

**Input**:
- 背景: `bg-card`
- 边框: `border border-input rounded-md`
- Focus: `ring-2 ring-ring border-primary`
- Placeholder: `text-muted-foreground`

**Textarea (富文本)**:
- 最小高度: `min-h-[120px]`
- 字体: 正文字体，非等宽（除代码块外）

**Select/Dropdown**:
- 触发器: 同Input样式
- 下拉菜单: `bg-card border border-border shadow-md rounded-md`
- 选项Hover: `bg-accent text-accent-foreground`
- 选中项: `bg-primary/10 text-primary`

### 7.5 Kanban Column (泳道列)

**结构**:
- 容器: `flex flex-col w-72 shrink-0`
- 头部: 
  - 标题区: `flex items-center justify-between pb-3 border-b-2` (边框颜色对应状态色)
  - 计数: `rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium`
- 内容区: `flex-1 space-y-3 pt-3 overflow-y-auto` (卡片垂直排列)

**拖拽状态**:
- 列激活(拖拽经过): `bg-accent/50 ring-2 ring-primary ring-inset`
- 列内卡片拖拽中: `opacity-50 rotate-2 scale-105`

### 7.6 AI Log Stream (AI日志流)

**结构**:
- 容器: `bg-slate-950 rounded-lg p-4 font-mono text-sm h-96 overflow-y-auto`
- 日志项: 
  - 时间戳: `text-slate-500` (`[2024-01-15 10:23:45]`)
  - 级别: `text-blue-400` (INFO), `text-yellow-400` (WARN), `text-green-400` (SUCCESS)
  - 消息: `text-slate-300`
- 自动滚动到底部，显示最新日志

### 7.7 Data Table (数据表格)

**结构**:
- 表头: `bg-muted/50 border-b border-border`
- 表头文字: `text-xs font-medium text-muted-foreground uppercase tracking-wider`
- 行: `border-b border-border last:border-0`
- 行Hover: `bg-muted/30`
- 单元格: `px-6 py-4 text-sm text-foreground`
- 状态列: 使用Status Badge

## 8. Flexibility Note (灵活性说明)

> **一致性优先原则**：本系统为多页面应用（10页），所有页面必须使用相同的核心参数（最大宽度 `max-w-[1400px]`、圆角策略、阴影风格、状态色定义），确保整体设计语言统一。

**允许的微调范围**（code agent 可自行判断）:
- **响应式适配**: 移动端Sidebar收起为汉堡菜单，内容区 `px-4`；桌面端 `px-6` 或 `px-8`
- **页面内部间距**: 看板页面内容区可能需要 `py-4` 以最大化垂直空间；表单页面保持 `py-8` 增加呼吸感
- **卡片尺寸**: 看板卡片固定宽度 `w-72`；列表页卡片全宽
- **Modal宽度**: 根据内容选择 `max-w-lg` (确认框) / `max-w-2xl` (表单) / `max-w-4xl` (详情)

**禁止的随意变更**:
- ❌ 不同页面使用不同的最大宽度（如首页用 `max-w-7xl`，内页用 `max-w-5xl`）
- ❌ 不同页面使用不同的圆角风格（如卡片A用 `rounded-xl`，卡片B用 `rounded-sm`）
- ❌ 不同页面使用不同的主色调或状态色定义
- ❌ 六阶段状态色在不同页面使用不同映射

## 9. Signature & Constraints (设计签名与禁区)

### DO (视觉签名)
1. **六阶段色条标识**: 每个需求相关卡片/列表项左侧必须有3-4px圆角色条，颜色严格对应状态（灰→蓝→靛→紫→橙→绿）
2. **Grid微边框**: 内容区使用1px `border-border` 分隔，避免大阴影，营造精密工业感
3. **Sidebar深蓝锚点**: 左侧导航使用 `hsl(222 47% 11%)` 深蓝黑，与白色内容区形成强烈对比，建立专业工具心智
4. **等宽字体数据**: API路径、代码片段、JSON规格必须使用 JetBrains Mono 等宽字体展示
5. **AI脉冲指示**: AI开发中的状态必须使用蓝色脉冲动画（`animate-pulse`），明确提示"机器正在工作"

### DON'T (禁止做法)
> 通用约束参见「通用约束」。以下为 Prototype - App 特有：
- ❌ 使用 `max-w-full` 或 `w-full` 作为内容区最大宽度（大屏溢出，违反全局布局契约）
- ❌ 不同角色看到完全不同的界面配色（应保持视觉一致，仅功能可见性不同）
- ❌ AI生成过程无视觉反馈（必须有日志流、进度条或脉冲指示）
- ❌ 六阶段状态使用相近颜色（如PRD编写中和规格定义都使用蓝色系，必须明确区分蓝vs靛蓝）