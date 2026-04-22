export interface IDefaultAiSkillConfig {
  id: string;
  name: string;
  description?: string;
  provider: 'ark';
  endpoint?: string;
  model: string;
  stream?: boolean;
  tools?: Array<Record<string, unknown>>;
  promptTemplate: string;
}

export const PRD_GENERATION_SKILL_ID = 'prd_auto_generation';

export const PLUGIN_SKILL_ORDER: string[] = [
  PRD_GENERATION_SKILL_ID,
  'prd_to_tech_spec',
  'fs_auto_generation',
  'ts_auto_generation',
  'cp_auto_generation',
  'requirement_classifier',
  'requirement_optimizer',
  'conflict_detector_tech_spec',
  'code_review_assistant',
  'acceptance_feedback_analyzer',
];

export const DEFAULT_AI_SKILLS: Record<string, IDefaultAiSkillConfig> = {
  [PRD_GENERATION_SKILL_ID]: {
    id: PRD_GENERATION_SKILL_ID,
    name: 'PRD文档自动生成器',
    description:
      '根据产品原始需求自动生成完整的结构化PRD文档，包含背景、目标、业务流程、功能列表、非功能性需求等，支持流式输出。',
    provider: 'ark',
    model: 'deepseek-v3-2-251201',
    stream: true,
    tools: [{ type: 'web_search', max_keyword: 3 }],
    promptTemplate: `你是一位资深产品经理，请基于以下需求生成一份 PRD 文档（必须使用中文）。

原始需求信息：
- 需求标题：{{title}}
- 需求描述：{{description}}
- 期望上线时间：{{expectedDate}}
- 业务优先级：{{priority}}

【硬性要求】
1. 禁止输出任何思考过程、推理步骤、草稿、分析说明或 XML/HTML 标签（如 think、redacted_reasoning 等）；只输出最终 PRD 正文。
2. 第一行必须是且仅为一级标题，格式严格为：# {{title}} 需求 PRD文档
3. 正文必须使用二级标题且带编号，从 1 到 6，格式为 ## 1. … ## 2. …（以此类推），共 6 节：
   ## 1. 文档背景（业务痛点、目标用户、问题定义）
   ## 2. 项目目标（业务目标、产品目标、衡量指标）
   ## 3. 业务流程（主流程、异常流程、角色分工）
   ## 4. 功能列表（功能点、功能描述、验收标准）
   ## 5. 非功能性需求（性能、安全、可用性、兼容性）
   ## 6. 风险与依赖（技术风险、外部依赖、里程碑建议）
4. 每节下用 Markdown 列表与短段落组织内容，结论可执行、指标尽量可量化，避免模糊表达。`,
  },
  prd_to_tech_spec: {
    id: 'prd_to_tech_spec',
    name: 'PRD转技术规格说明书生成器',
    description: '根据已确认的 PRD 生成技术规格（接口、数据模型、交互）草稿，便于研发落地。',
    provider: 'ark',
    model: 'deepseek-v3-2-251201',
    stream: true,
    promptTemplate: `你是资深技术负责人。请根据以下 PRD 摘要输出技术规格说明书草稿（中文、Markdown）。

PRD 摘要：
{{prd_summary}}

请包含：范围说明、术语、接口清单（路径/方法/说明）、核心数据模型、关键交互与错误处理、非功能约束（性能/安全）。`,
  },
  fs_auto_generation: {
    id: 'fs_auto_generation',
    name: '功能规格（FS）自动生成',
    description: '基于 PRD 生成极简但完整的功能规格（FS），强结构化、if-then 规则、含正常/异常示例。',
    provider: 'ark',
    model: 'deepseek-v3-2-251201',
    stream: true,
    promptTemplate: `你是一名资深产品经理 + AI系统设计专家。

请基于 PRD 文档，生成一份【极简但完整的功能规格（FS）】，要求适配大模型理解与代码生成。

【要求】
1. 使用强结构化表达（禁止长段落）
2. 所有功能必须包含：输入 / 规则 / 输出
3. 所有规则必须明确（使用 if-then）
4. 必须提供「正常 + 异常」示例
5. 禁止模糊词（如：合理处理、适当）

【输出格式】

# FS

## 1. 目标
一句话说明要解决什么问题 + 成功标准（可量化）

## 2. 角色与场景
- 用户：
- 使用场景：

## 3. 功能
### 功能点1：
- 输入：
- 规则：
- 输出：
- 验收标准：

（按需继续 功能点2、3…）

## 4. 规则补充
- 全局业务规则（if-then）

## 5. 示例（必须）
### 正常：
Input:
Output:

### 异常：
Input:
Output:

---
PRD 文档如下：
{{prd_document}}`,
  },
  ts_auto_generation: {
    id: 'ts_auto_generation',
    name: '技术规格（TS）自动生成',
    description: '基于 FS 与组织编码约束（org_spec）生成可直接用于编码的技术规格（TS）。',
    provider: 'ark',
    model: 'deepseek-v3-2-251201',
    stream: true,
    promptTemplate: `你是一名资深后端架构师 + AI代码生成专家。

请基于功能规格（FS）和 组织编码约束（org_spec），生成一份【极简但可直接用于编码的技术规格（TS）】。

【要求】
1. 所有内容必须结构化（JSON / 列表 / 伪代码）
2. 数据模型必须包含字段类型
3. API必须明确请求/响应结构
4. 核心流程必须可执行（类似伪代码）
5. 必须包含测试用例
6. 禁止解释性废话

【输出格式】

# TS

## 1. 技术栈
- 语言：
- 框架：

## 2. 数据模型
（结构化定义）

## 3. API
- 路径：
- 请求：
- 响应：
- 错误码：

## 4. 核心流程
（步骤 or 伪代码）

## 5. 异常处理
- 错误规则

## 6. 测试用例
- 输入：
- 输出：

---
功能规格（FS）：
{{functional_spec}}

---
组织编码约束（org_spec）：
{{org_spec}}`,
  },
  cp_auto_generation: {
    id: 'cp_auto_generation',
    name: '编程计划（CP）自动生成',
    description:
      '基于功能规格（FS）与技术规格（TS）生成可交给 Cursor、Claude Code 等智能体按任务拆解执行的编程计划（Markdown，含勾选步骤与验收标准）。',
    provider: 'ark',
    model: 'deepseek-v3-2-251201',
    stream: true,
    promptTemplate: `你是一名资深技术负责人 + AI 编程编排专家。请仅根据下列【功能规格 FS】与【技术规格 TS】，输出一份【编程计划（CP）】Markdown 文档，供智能体（如 Cursor Agent、Claude Code）按任务顺序执行实现与验证。

【硬性要求】
1. 使用中文；禁止输出思考过程、XML/HTML 标签、前言或后记；只输出最终 Markdown 正文。
2. 结构必须严格贴近下列模板（可增删 Task 数量，但层级与符号风格须一致）：
   - 一级标题：\`# <项目或主题名> Implementation Plan\`（主题名从 FS/TS 概括，勿用占位符「项目名」）
   - 引用块首行：\`> **For agentic workers:** REQUIRED SUB-SKILL: ...\`（沿用示例句式，说明须按 Task 勾选推进）
   - \`**Goal:**\`、\`**Architecture:**\`、\`**Tech Stack:**\` 各一段（从 TS 抽取栈与架构，从 FS 抽取目标）
   - \`---\` 分隔线
   - \`## 0. 执行约定（必须先完成）\` 下含 **Files:** 与若干 \`- [ ] **Step N: ...**\`，每步含 \`Run:\` 与 \`Expected:\`（与仓库探测、分支策略相关，勿虚构本仓库不存在的路径时可写「按实际仓库调整」）
   - 多个 \`### Task k: <标题>\`，每 Task 含 **Files:**（Create/Modify/Test）、多个 \`- [ ] **Step ...**\`（TDD 风格：先测后实现再验证），步骤中 \`Run:\` / \`Expected:\` 成对出现
   - 末尾 \`## 全局验收标准（完成本计划前必须全部满足）\` 下若干 \`- [ ]\` 条目，覆盖业务、规则、接口、测试、性能/运维等你从 FS/TS 能合理推断的项
3. 任务拆分须可执行、可验证；文件路径用反引号；命令用 Markdown 代码围栏或 \`Run:\` 行内写清。
4. 不要照抄 FS/TS 全文；应提炼为实施任务与验收点，必要时在 Task 内用短列表概括接口或模型要点。

---
【功能规格（FS）】

{{fs_document}}

---
【技术规格（TS）】

{{ts_document}}`,
  },
  requirement_classifier: {
    id: 'requirement_classifier',
    name: '需求分类与优先级识别器',
    description: '对原始需求文本做类型归类，并给出优先级与标签建议（ unary 场景可在业务侧组装提示变量 ）。',
    provider: 'ark',
    model: 'deepseek-v3-2-251201',
    stream: false,
    promptTemplate: `你是需求分析师。请阅读下列需求描述，输出 JSON：{ "category": "", "prioritySuggestion": "P0|P1|P2|P3", "tags": [] }

需求描述：
{{requirement_text}}`,
  },
  requirement_optimizer: {
    id: 'requirement_optimizer',
    name: '需求优化总结',
    description:
      '基于清晰、可落地、无歧义原则优化原始需求表述，提炼核心诉求与约束，输出不超过 200 字的可执行描述。',
    provider: 'ark',
    model: 'deepseek-v3-2-251201',
    stream: true,
    promptTemplate: `你是一名资深的产品经理，请你基于清晰、可落地、无歧义原则，对原始用户需求进行优化：
1.提炼核心诉求，剔除模糊、冗余表述
2.明确使用场景、目标对象、预期效果
3.补充关键约束条件（时间、风格、格式、平台、禁忌）
4.将模糊指令转化为具体、可执行的操作要求
5.优化后语言简洁专业，逻辑通顺，便于直接执行，字数不超过200字

请直接输出优化后的需求正文，不要输出标题、编号列表或任何前缀说明。

原始用户需求：
{{requirement_text}}`,
  },
  conflict_detector_tech_spec: {
    id: 'conflict_detector_tech_spec',
    name: '技术规格冲突检测器',
    description: '将新技术规格与现有系统约束对比，列出潜在逻辑或接口冲突。',
    provider: 'ark',
    model: 'deepseek-v3-2-251201',
    stream: false,
    promptTemplate: `你是架构评审专家。请对比「新规格」与「现有约束」，列出冲突点与建议（每条一行说明）。

新规格：
{{new_spec}}

现有系统约束摘要：
{{existing_constraints}}`,
  },
  code_review_assistant: {
    id: 'code_review_assistant',
    name: '代码审查助手',
    description: '对代码片段或差异做质量与风险摘要，辅助流水线环节。',
    provider: 'ark',
    model: 'deepseek-v3-2-251201',
    stream: true,
    promptTemplate: `你是资深代码审查员。请对下列代码变更做审查摘要：主要风险、风格问题、建议（中文条目列表）。

代码或 diff：
{{code_or_diff}}`,
  },
  acceptance_feedback_analyzer: {
    id: 'acceptance_feedback_analyzer',
    name: '验收反馈分析器',
    description: '汇总验收文字与截图说明中的问题，输出改进建议与是否需 RFC 的结论提示。',
    provider: 'ark',
    model: 'deepseek-v3-2-251201',
    stream: true,
    promptTemplate: `你是质量与产品协同专家。请根据验收反馈整理：问题列表、优先级、建议后续动作（中文）。

验收反馈：
{{acceptance_feedback}}`,
  },
};
