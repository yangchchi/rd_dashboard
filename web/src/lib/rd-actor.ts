import { getCurrentUser } from '@/lib/auth';

/** 新建对象时写入创建者与更新者（需已登录） */
export function rdAuditCreate(): { createdBy?: string; updatedBy?: string } {
  const id = getCurrentUser()?.id?.trim();
  if (!id) return {};
  return { createdBy: id, updatedBy: id };
}

/** 更新对象时写入更新者 */
export function rdAuditUpdate(): { updatedBy?: string } {
  const id = getCurrentUser()?.id?.trim();
  if (!id) return {};
  return { updatedBy: id };
}
