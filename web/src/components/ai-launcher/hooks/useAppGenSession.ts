'use client';

import { nanoid } from 'nanoid';
import { useCallback, useMemo, useRef, useState } from 'react';

import { capabilityClient } from '@/lib/capability-client';
import {
  APP_GEN_LOCAL_STORAGE_KEY,
  ONE_SHOT_APP_ACTION,
  ONE_SHOT_APP_CAPABILITY_ID,
  type AppGenContextChip,
  type AppGenDevice,
  type AppGenMessage,
  type AppGenPersistedSession,
  type AppGenStatus,
  type AppGenTheme,
  type AppGenVersion,
} from '@/lib/app-gen-types';
import { findRecentApp, upsertRecentApp } from '@/lib/app-gen-recent';
import { extractHtmlDocument } from '@/lib/app-gen-sandbox';

/** capabilities `textGenerate` 流式协议：每个 chunk 形如 { content: string } */
interface AppGenStreamChunk {
  content?: string;
}

function readPersisted(): AppGenPersistedSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(APP_GEN_LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppGenPersistedSession & { appId?: string };
    if (!Array.isArray(parsed.messages) || !Array.isArray(parsed.versions)) return null;
    return {
      appId: parsed.appId ?? nanoid(8),
      messages: parsed.messages,
      versions: parsed.versions,
      currentVersionId: parsed.currentVersionId ?? null,
      device: parsed.device ?? 'desktop',
      theme: parsed.theme ?? 'light',
    };
  } catch {
    return null;
  }
}

function persistSession(snapshot: AppGenPersistedSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(APP_GEN_LOCAL_STORAGE_KEY, JSON.stringify(snapshot));
    if (snapshot.messages.length > 0) {
      upsertRecentApp(snapshot);
    }
  } catch {
    // 配额满 / 隐私模式失败时静默
  }
}

function buildConversationHistory(messages: AppGenMessage[]): string {
  return messages
    .map((m) => {
      const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : '系统';
      return `${role}: ${m.text.trim()}`;
    })
    .filter((line) => line.length > 4)
    .join('\n');
}

export interface UseAppGenSessionResult {
  status: AppGenStatus;
  messages: AppGenMessage[];
  versions: AppGenVersion[];
  currentVersion: AppGenVersion | null;
  device: AppGenDevice;
  theme: AppGenTheme;
  errorMessage: string | null;
  /** 当前是否有历史轮次（用于"重置会话"按钮显示） */
  hasHistory: boolean;
  setDevice: (d: AppGenDevice) => void;
  setTheme: (t: AppGenTheme) => void;
  generate: (intent: string, ctx?: AppGenContextChip[]) => Promise<void>;
  abort: () => void;
  retry: () => void;
  reset: () => void;
  pickVersion: (versionId: string) => void;
  appId: string | null;
  getSnapshot: () => AppGenPersistedSession;
  loadApp: (appId: string) => boolean;
  goHome: () => void;
}

/**
 * 「一句话生成应用」核心会话 hook：
 *   - 维护对话流 + 版本列表 + 当前预览版本
 *   - 通过 capability 网关 textGenerate 流式接收 HTML，边收边写入当前版本 code
 *   - 支持中断（AbortController.abort）/ 重试 / 重置
 *   - 仅在前端 localStorage 暂存（M1 MVP）
 */
export function useAppGenSession(): UseAppGenSessionResult {
  const restored = useRef<AppGenPersistedSession | null>(null);
  if (restored.current === null) {
    restored.current = readPersisted() ?? {
      appId: nanoid(8),
      messages: [],
      versions: [],
      currentVersionId: null,
      device: 'desktop',
      theme: 'light',
    };
  }

  const [appId, setAppId] = useState<string>(restored.current.appId);
  const [status, setStatus] = useState<AppGenStatus>('idle');
  const [messages, setMessages] = useState<AppGenMessage[]>(restored.current.messages);
  const [versions, setVersions] = useState<AppGenVersion[]>(restored.current.versions);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(restored.current.currentVersionId);
  const [device, setDeviceState] = useState<AppGenDevice>(restored.current.device);
  const [theme, setThemeState] = useState<AppGenTheme>(restored.current.theme);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastIntentRef = useRef<string>('');
  const lastContextRef = useRef<AppGenContextChip[] | undefined>(undefined);

  const buildSnapshot = useCallback(
    (overrides: Partial<AppGenPersistedSession> = {}): AppGenPersistedSession => ({
      appId: overrides.appId ?? appId,
      messages: overrides.messages ?? messages,
      versions: overrides.versions ?? versions,
      currentVersionId: overrides.currentVersionId ?? currentVersionId,
      device: overrides.device ?? device,
      theme: overrides.theme ?? theme,
    }),
    [appId, messages, versions, currentVersionId, device, theme]
  );

  const persist = useCallback(
    (snap: Partial<AppGenPersistedSession> = {}) => {
      persistSession(buildSnapshot(snap));
    },
    [buildSnapshot]
  );

  const applySnapshot = useCallback((snap: AppGenPersistedSession) => {
    setAppId(snap.appId);
    setMessages(snap.messages);
    setVersions(snap.versions);
    setCurrentVersionId(snap.currentVersionId);
    setDeviceState(snap.device);
    setThemeState(snap.theme);
    setErrorMessage(null);
    setStatus('idle');
    persistSession(snap);
  }, []);

  const setDevice = useCallback(
    (d: AppGenDevice) => {
      setDeviceState(d);
      persist({ device: d });
    },
    [persist]
  );
  const setTheme = useCallback(
    (t: AppGenTheme) => {
      setThemeState(t);
      persist({ theme: t });
    },
    [persist]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const freshId = nanoid(8);
    setAppId(freshId);
    setStatus('idle');
    setMessages([]);
    setVersions([]);
    setCurrentVersionId(null);
    setErrorMessage(null);
    lastIntentRef.current = '';
    lastContextRef.current = undefined;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(APP_GEN_LOCAL_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  const goHome = useCallback(() => {
    if (messages.length > 0) {
      upsertRecentApp(buildSnapshot());
    }
    reset();
  }, [messages.length, buildSnapshot, reset]);

  const loadApp = useCallback(
    (targetAppId: string): boolean => {
      if (targetAppId === appId) return true;
      if (messages.length > 0) {
        upsertRecentApp(buildSnapshot());
      }
      const found = findRecentApp(targetAppId);
      if (!found) return false;
      abortRef.current?.abort();
      abortRef.current = null;
      applySnapshot(found.snapshot);
      return true;
    },
    [appId, messages.length, buildSnapshot, applySnapshot]
  );

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const runGenerate = useCallback(
    async (intent: string, ctx?: AppGenContextChip[]) => {
      const trimmed = intent.trim();
      if (!trimmed) return;

      lastIntentRef.current = trimmed;
      lastContextRef.current = ctx;
      setErrorMessage(null);

      const seq = versions.length + 1;
      const versionId = nanoid(12);
      const userMessageId = nanoid(10);
      const assistantMessageId = nanoid(10);
      const now = Date.now();

      const newUserMessage: AppGenMessage = {
        id: userMessageId,
        role: 'user',
        text: trimmed,
        createdAt: now,
      };
      const newAssistantMessage: AppGenMessage = {
        id: assistantMessageId,
        role: 'assistant',
        text: `正在生成 v${seq} …`,
        versionId,
        createdAt: now + 1,
      };
      const newVersion: AppGenVersion = {
        id: versionId,
        seq,
        userIntent: trimmed,
        code: '',
        bytes: 0,
        status: 'streaming',
        createdAt: now,
      };

      const sessionAppId = messages.length === 0 ? nanoid(8) : appId;
      if (messages.length === 0) setAppId(sessionAppId);

      const nextMessages = [...messages, newUserMessage, newAssistantMessage];
      const nextVersions = [...versions, newVersion];
      setMessages(nextMessages);
      setVersions(nextVersions);
      setCurrentVersionId(versionId);
      setStatus('streaming');
      persist({
        appId: sessionAppId,
        messages: nextMessages,
        versions: nextVersions,
        currentVersionId: versionId,
      });

      const ac = new AbortController();
      abortRef.current = ac;

      const previousCode = nextVersions
        .slice(0, -1)
        .reverse()
        .find((v) => v.status === 'done')?.code;

      const platformContext = (ctx ?? [])
        .map((c) => `[${c.kind}] ${c.label}\n${c.value}`)
        .join('\n---\n');

      const conversationHistory = buildConversationHistory(
        messages.filter((m) => m.role !== 'system')
      );

      let accumulated = '';
      let lastFlush = 0;
      let chunkCount = 0;

      /**
       * 流式 chunk 写入节流：
       *  - 前 8 个 chunk 立即刷新（启动瞬间字节计就跳动，避免「无响应」错觉）
       *  - 之后按 200ms 节流（避免高频 setState 拖慢渲染）
       *  - force=true 时（完成/中断）必刷
       */
      const flush = (force: boolean) => {
        const nowTs = performance.now();
        const isWarmup = chunkCount < 8;
        if (!force && !isWarmup && nowTs - lastFlush < 200) return;
        lastFlush = nowTs;
        const html = extractHtmlDocument(accumulated) || accumulated;
        setVersions((prev) =>
          prev.map((v) => (v.id === versionId ? { ...v, code: html, bytes: html.length } : v))
        );
      };

      try {
        const stream = capabilityClient
          .load(ONE_SHOT_APP_CAPABILITY_ID)
          .callStream<AppGenStreamChunk>(
            ONE_SHOT_APP_ACTION,
            {
              user_intent: trimmed,
              previous_code: previousCode ?? '',
              conversation_history: conversationHistory,
              platform_context: platformContext,
              device_target: device,
              theme,
            },
            { signal: ac.signal }
          );

        for await (const chunk of stream) {
          if (ac.signal.aborted) break;
          if (chunk?.content) {
            accumulated += chunk.content;
            chunkCount += 1;
            flush(false);
          }
        }

        if (ac.signal.aborted) {
          const finalVersions = nextVersions.map((v) =>
            v.id === versionId
              ? { ...v, status: 'aborted' as const, completedAt: Date.now() }
              : v
          );
          const finalMessages = nextMessages.map((m) =>
            m.id === assistantMessageId ? { ...m, text: `v${seq} 已停止生成` } : m
          );
          setVersions(finalVersions);
          setMessages(finalMessages);
          setStatus('aborted');
          persist({ messages: finalMessages, versions: finalVersions });
          return;
        }

        flush(true);
        const finalCode = extractHtmlDocument(accumulated) || accumulated;
        const finalVersion: AppGenVersion = {
          ...newVersion,
          code: finalCode,
          bytes: finalCode.length,
          status: 'done',
          completedAt: Date.now(),
        };
        const finalVersions = nextVersions.map((v) => (v.id === versionId ? finalVersion : v));
        const finalMessages = nextMessages.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                text: `已生成 v${seq}，约 ${(finalCode.length / 1024).toFixed(1)} KB`,
              }
            : m
        );
        setVersions(finalVersions);
        setMessages(finalMessages);
        setStatus('ready');
        persist({ messages: finalMessages, versions: finalVersions });
      } catch (err) {
        const message = err instanceof Error ? err.message : '生成失败';
        const finalVersions = nextVersions.map((v) =>
          v.id === versionId
            ? { ...v, status: 'error' as const, errorMessage: message, completedAt: Date.now() }
            : v
        );
        const finalMessages = nextMessages.map((m) =>
          m.id === assistantMessageId ? { ...m, text: `v${seq} 生成失败：${message}` } : m
        );
        setVersions(finalVersions);
        setMessages(finalMessages);
        setStatus('error');
        setErrorMessage(message);
        persist({ messages: finalMessages, versions: finalVersions });
      } finally {
        abortRef.current = null;
      }
    },
    [messages, versions, persist, device, theme]
  );

  const generate = useCallback(
    async (intent: string, ctx?: AppGenContextChip[]) => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      await runGenerate(intent, ctx);
    },
    [runGenerate]
  );

  const retry = useCallback(() => {
    if (!lastIntentRef.current) return;
    void runGenerate(lastIntentRef.current, lastContextRef.current);
  }, [runGenerate]);

  const pickVersion = useCallback(
    (versionId: string) => {
      if (!versions.some((v) => v.id === versionId)) return;
      setCurrentVersionId(versionId);
      persist({ currentVersionId: versionId });
    },
    [versions, persist]
  );

  const currentVersion = useMemo(
    () => versions.find((v) => v.id === currentVersionId) ?? versions[versions.length - 1] ?? null,
    [versions, currentVersionId]
  );

  const hasHistory = messages.length > 0 || versions.length > 0;

  return {
    status,
    messages,
    versions,
    currentVersion,
    device,
    theme,
    errorMessage,
    hasHistory,
    setDevice,
    setTheme,
    generate,
    abort,
    retry,
    reset,
    pickVersion,
    appId: hasHistory ? appId : null,
    getSnapshot: buildSnapshot,
    loadApp,
    goHome,
  };
}
