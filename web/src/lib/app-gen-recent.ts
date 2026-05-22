import {
  APP_GEN_RECENT_STORAGE_KEY,
  type AppGenMessage,
  type AppGenPersistedSession,
  type AppGenRecentApp,
  type AppGenRecentIconTone,
} from '@/lib/app-gen-types';

const MAX_RECENT = 8;

const ICON_TONES: AppGenRecentIconTone[] = [
  'orange',
  'slate',
  'amber',
  'blue',
  'green',
  'purple',
];

export function deriveAppTitle(messages: AppGenMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return '未命名应用';
  const t = firstUser.text.trim();
  if (t.length <= 28) return t;
  return `${t.slice(0, 28)}…`;
}

function iconToneForId(id: string): AppGenRecentIconTone {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % ICON_TONES.length;
  return ICON_TONES[hash] ?? 'blue';
}

export function readRecentApps(): AppGenRecentApp[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(APP_GEN_RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppGenRecentApp[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a) => a?.id && a?.snapshot?.messages)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function writeRecentApps(apps: AppGenRecentApp[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(APP_GEN_RECENT_STORAGE_KEY, JSON.stringify(apps.slice(0, MAX_RECENT)));
  } catch {
    // ignore quota
  }
}

/** 将当前会话写入「最近应用」，同 id 则覆盖更新 */
export function upsertRecentApp(snapshot: AppGenPersistedSession): void {
  if (!snapshot.messages.length) return;

  const title = deriveAppTitle(snapshot.messages);
  const entry: AppGenRecentApp = {
    id: snapshot.appId,
    title,
    updatedAt: Date.now(),
    iconTone: iconToneForId(snapshot.appId),
    snapshot,
  };

  const list = readRecentApps().filter((a) => a.id !== snapshot.appId);
  writeRecentApps([entry, ...list]);
}

export function findRecentApp(appId: string): AppGenRecentApp | undefined {
  return readRecentApps().find((a) => a.id === appId);
}
