import assert from 'node:assert/strict';
import test from 'node:test';
import { createFeishuOauthState } from './feishu-oauth.ts';

test('createFeishuOauthState falls back when crypto.randomUUID is unavailable', () => {
  const originalCrypto = globalThis.crypto;

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues<T extends Uint8Array>(array: T): T {
        array.fill(7);
        return array;
      },
    },
  });

  try {
    const state = createFeishuOauthState();

    assert.match(state, /^state_[a-z0-9]+_[a-f0-9]{32}$/);
  } finally {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  }
});
