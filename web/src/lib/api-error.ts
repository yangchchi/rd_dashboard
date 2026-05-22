import { toast } from 'sonner';

import { isAuthSessionExpiredError } from './auth';

/** 展示 API 错误；登录过期/未登录时已跳转登录页，不再弹 toast */
export function toastApiError(error: unknown, fallbackMessage: string): void {
  if (isAuthSessionExpiredError(error)) return;
  toast.error(error instanceof Error ? error.message : fallbackMessage);
}
