/**
 * 「一句话生成应用」（One-Shot App Generator）共享类型与常量。
 * MVP（M1）阶段会话只在前端内存中持有；M2 起持久化到 app_gen_sessions/versions 两张表。
 */

export type AppGenStatus = 'idle' | 'streaming' | 'applying' | 'ready' | 'error' | 'aborted';

export type AppGenDevice = 'desktop' | 'tablet' | 'mobile';

export type AppGenTheme = 'light' | 'dark';

export interface AppGenMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  /** 用户消息为用户输入；助手消息在 MVP 仅显示「已生成 v{N}」之类简短摘要，避免与 HTML 混杂。 */
  text: string;
  /** 关联的版本 id；助手消息固定指向其产出的版本，便于在对话流中跳回某版预览。 */
  versionId?: string;
  createdAt: number;
}

export interface AppGenVersion {
  id: string;
  /** 第几轮，从 1 开始。 */
  seq: number;
  /** 用户该轮的「一句话」。 */
  userIntent: string;
  /** 这一版完整代码（截至当前已接收的流式 chunk）。 */
  code: string;
  /** 这一版的字节数（粗略 = code.length）。 */
  bytes: number;
  /** 状态：streaming / done / aborted / error；MVP 不持久化。 */
  status: 'streaming' | 'done' | 'aborted' | 'error';
  /** 失败时的简要原因。 */
  errorMessage?: string;
  createdAt: number;
  completedAt?: number;
}

export interface AppGenContextChip {
  /** 标签类型：路由 / 需求 / PRD / 自定义文本。 */
  kind: 'route' | 'requirement' | 'prd' | 'text';
  label: string;
  /** 注入到 platform_context 的内容；过长时调用方应预先截断。 */
  value: string;
}

export interface AppGenStarterPrompt {
  id: string;
  title: string;
  prompt: string;
  /** 用于卡片左侧的小色块（来自平台 6 阶段状态色，仅作识别）。 */
  accent?: 'slate' | 'blue' | 'indigo' | 'purple' | 'orange' | 'green';
}

/** 平台预置的推荐入门 prompt（首屏卡片），保持中文、克制、具象。 */
export const APP_GEN_STARTER_PROMPTS: AppGenStarterPrompt[] = [
  {
    id: 'todo',
    title: '待办应用',
    prompt: '做一个待办应用：支持新增、勾选完成、按完成状态过滤、显示统计计数，深色主题。',
    accent: 'slate',
  },
  {
    id: 'calendar',
    title: '会议室预订日历',
    prompt:
      '做一个会议室预订小工具：左侧 7 天日历，右侧时段（9-18 点），点击格子切换可订/已订，底部显示已选时段。',
    accent: 'blue',
  },
  {
    id: 'table',
    title: '数据筛选表格',
    prompt:
      '做一个带搜索 + 列筛选 + 分页（10 行/页）的订单表格，10 列内必要字段，附带状态 Badge。',
    accent: 'indigo',
  },
  {
    id: 'wizard',
    title: '三步引导向导',
    prompt: '做一个三步表单向导：步骤指示器在顶部，可上下步切换，最后一步展示填写摘要。',
    accent: 'purple',
  },
  {
    id: 'dashboard',
    title: '简易仪表盘',
    prompt:
      '做一个仪表盘：顶部 3 个数字指标卡 + 1 个折线图区域（用纯 SVG 或 Canvas 绘制 mock 数据），整体卡片化布局。',
    accent: 'orange',
  },
  {
    id: 'login',
    title: '登录注册页',
    prompt: '做一个登录注册页：左侧品牌区，右侧 Tab 切换登录/注册表单，含基础校验与错误提示。',
    accent: 'green',
  },
];

/** 设备宽度（用于沙箱 iframe viewport 切换）。 */
export const APP_GEN_DEVICE_WIDTH: Record<AppGenDevice, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 375,
};

/** Capability 网关插件 id（与 server/capabilities/one_shot_app_generator_1.json 保持一致）。 */
export const ONE_SHOT_APP_CAPABILITY_ID = 'one_shot_app_generator_1';

/** 调用 Capability 网关使用的 action 与 PRD/规格保持一致：textGenerate。 */
export const ONE_SHOT_APP_ACTION = 'textGenerate';

/** localStorage 存储 key（MVP 仅暂存最近一次会话）。 */
export const APP_GEN_LOCAL_STORAGE_KEY = '__hai_app_gen_session_v1';
