export const MODEL_CONFIG_REQUIRED_EVENT = 'rd:model-config-required';

/** 触发全局引导：由 Layout 监听并展示跳转个人设置的 Toast */
export function dispatchModelConfigRequired(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MODEL_CONFIG_REQUIRED_EVENT));
}
