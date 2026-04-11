// ---- plugin:acceptance_feedback_analyzer_1 ----
// ============================================================
// 插件 acceptance_feedback_analyzer_1 (验收反馈分析器) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface AcceptanceFeedbackAnalyzer1Input {
  /** 待分析的验收反馈完整文本 */
  acceptance_feedback: string;
}

export interface AcceptanceFeedbackAnalyzer1Output {
  /** AI 生成的总结内容 */
  summary: string;
}
// ---- end:acceptance_feedback_analyzer_1 ----

// ---- plugin:code_review_assistant_1 ----
// ============================================================
// 插件 code_review_assistant_1 (代码审查助手) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface CodeReviewAssistant1Input {
  /** 待审查的代码内容 */
  code_content: string;
  /** 额外的代码审查要求（可选） */
  additional_requirements?: string;
}

export interface CodeReviewAssistant1Output {
  /** AI 生成的总结内容 */
  summary: string;
}
// ---- end:code_review_assistant_1 ----

// ---- plugin:conflict_detector_tech_spec_1 ----
// ============================================================
// 插件 conflict_detector_tech_spec_1 (技术规格冲突检测器) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================
// ---- end:conflict_detector_tech_spec_1 ----

// ---- plugin:prd_to_tech_spec_generator_1 ----
// ============================================================
// 插件 prd_to_tech_spec_generator_1 (PRD转技术规格说明书生成器) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface PrdToTechSpecGenerator1Input {
  /** 产品需求文档(PRD)完整内容 */
  prd_content: string;
  /** 额外生成要求（可选） */
  additional_requirements?: string;
}

export interface PrdToTechSpecGenerator1Output {
  /** 生成的增量文本内容 */
  content: string;
  /** (已弃用,请使用 content)生成的文本内容 */
  response?: string;
}
// ---- end:prd_to_tech_spec_generator_1 ----

// ---- plugin:prd_generator_1 ----
// ============================================================
// 插件 prd_generator_1 (PRD文档自动生成器) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface PrdGenerator1Input {
  /** 产品原始需求描述 */
  original_requirement: string;
  /** PRD生成的额外定制要求（可选） */
  additional_requirements?: string;
}

export interface PrdGenerator1Output {
  /** 生成的增量文本内容 */
  content: string;
  /** (已弃用,请使用 content)生成的文本内容 */
  response?: string;
}
// ---- end:prd_generator_1 ----