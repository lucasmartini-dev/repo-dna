import { describe, expect, it, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSessionStore } from './session';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('session store', () => {
  it('reuses a stored session id', () => {
    localStorage.setItem('github-analyzer.session', 'abc');
    const store = useSessionStore();
    expect(store.sessionId).toBe('abc');
  });
  it('creates a new session id when none stored', () => {
    const store = useSessionStore();
    store.ensureSession();
    expect(store.sessionId).toMatch(/^[a-z0-9-]{36}$/);
    expect(localStorage.getItem('github-analyzer.session')).toBe(store.sessionId);
  });
  it('resetSession clears storage', () => {
    const store = useSessionStore();
    store.ensureSession();
    store.resetSession();
    expect(store.sessionId).toBeNull();
    expect(localStorage.getItem('github-analyzer.session')).toBeNull();
  });
});
