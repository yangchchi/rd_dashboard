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

export type AppGenShowcasePreview =
  | 'todo'
  | 'calendar'
  | 'table'
  | 'wizard'
  | 'dashboard'
  | 'login';

export type AppGenShowcaseAccent = 'slate' | 'blue' | 'indigo' | 'purple' | 'orange' | 'green';

export interface AppGenShowcaseItem {
  id: string;
  title: string;
  prompt: string;
  preview: AppGenShowcasePreview;
  accent: AppGenShowcaseAccent;
}

/** @deprecated 使用 APP_GEN_SHOWCASE_ITEMS；保留类型兼容旧引用 */
export interface AppGenStarterPrompt {
  id: string;
  title: string;
  prompt: string;
  accent?: 'slate' | 'blue' | 'indigo' | 'purple' | 'orange' | 'green';
}

/** 妙搭风格展示卡片（6 个固定尺寸入门案例，与平台状态色一致） */
export const APP_GEN_SHOWCASE_ITEMS: AppGenShowcaseItem[] = [
  {
    id: 'todo',
    title: '待办应用',
    prompt: '做一个待办应用：支持新增、勾选完成、按完成状态过滤、显示统计计数，深色主题。',
    preview: 'todo',
    accent: 'slate',
  },
  {
    id: 'calendar',
    title: '会议室预订日历',
    prompt:
      '做一个会议室预订小工具：左侧 7 天日历，右侧时段（9-18 点），点击格子切换可订/已订，底部显示已选时段。',
    preview: 'calendar',
    accent: 'blue',
  },
  {
    id: 'table',
    title: '数据筛选表格',
    prompt:
      '做一个带搜索 + 列筛选 + 分页（10 行/页）的订单表格，10 列内必要字段，附带状态 Badge。',
    preview: 'table',
    accent: 'indigo',
  },
  {
    id: 'wizard',
    title: '三步引导向导',
    prompt: '做一个三步表单向导：步骤指示器在顶部，可上下步切换，最后一步展示填写摘要。',
    preview: 'wizard',
    accent: 'purple',
  },
  {
    id: 'dashboard',
    title: '简易仪表盘',
    prompt:
      '做一个仪表盘：顶部 3 个数字指标卡 + 1 个折线图区域（用纯 SVG 或 Canvas 绘制 mock 数据），整体卡片化布局。',
    preview: 'dashboard',
    accent: 'orange',
  },
  {
    id: 'login',
    title: '登录注册页',
    prompt: '做一个登录注册页：左侧品牌区，右侧 Tab 切换登录/注册表单，含基础校验与错误提示。',
    preview: 'login',
    accent: 'green',
  },
];

/** 快捷入口 pill（妙搭「你可以试试」） */
export const APP_GEN_QUICK_PILLS: Array<{ id: string; label: string; prompt: string }> = [
  { id: 'landing', label: '官网落地页', prompt: '做一个产品官网落地页：Hero、特性三列、CTA 按钮，浅色专业风格。' },
  { id: 'prototype', label: '应用原型', prompt: '做一个后台管理应用原型：侧栏导航 + 列表页 + 详情抽屉。' },
  { id: 'marketing', label: '营销推广页', prompt: '做一个营销活动页：倒计时、权益卡片、报名表单。' },
  { id: 'interactive', label: '互动网页', prompt: '做一个可交互的数据可视化小页：筛选器 + 柱状图 + 明细表。' },
  { id: 'portal', label: '门户网站', prompt: '做一个企业门户首页：顶栏、轮播、新闻列表、页脚链接。' },
  { id: 'tool', label: '小工具', prompt: '做一个 JSON 格式化小工具：输入框、格式化/压缩、复制按钮。' },
];

/** @deprecated 使用 APP_GEN_SHOWCASE_ITEMS */
export const APP_GEN_STARTER_PROMPTS: AppGenStarterPrompt[] = APP_GEN_SHOWCASE_ITEMS.map(
  ({ id, title, prompt, accent }) => ({ id, title, prompt, accent })
);

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

/** 最近应用列表（多会话切换） */
export const APP_GEN_RECENT_STORAGE_KEY = '__hai_app_gen_recent_v1';

export type AppGenRecentIconTone = 'orange' | 'slate' | 'amber' | 'blue' | 'green' | 'purple';

export interface AppGenPersistedSession {
  appId: string;
  messages: AppGenMessage[];
  versions: AppGenVersion[];
  currentVersionId: string | null;
  device: AppGenDevice;
  theme: AppGenTheme;
}

export interface AppGenRecentApp {
  id: string;
  title: string;
  updatedAt: number;
  iconTone: AppGenRecentIconTone;
  snapshot: AppGenPersistedSession;
}
