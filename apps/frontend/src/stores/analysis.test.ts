import { describe, expect, it, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { faker } from '@faker-js/faker';
import { useAnalysisStore } from './analysis';
import { useSessionStore } from './session';
import * as client from '../api/client';

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe('analysis store', () => {
  it('start sets running state from 201', async () => {
    vi.spyOn(client, 'startAnalysis').mockResolvedValue({ status: 201, analysisId, username, shared: false });
    vi.spyOn(client, 'fetchAnalysis').mockResolvedValue({
      id: analysisId,
      sessionId,
      username,
      status: 'running',
      error: null,
      createdAt: new Date().toISOString(),
      providers: [],
    } as never);
    const session = useSessionStore();
    session.ensureSession();
    const store = useAnalysisStore();
    await store.start(username);
    expect(store.username).toBe(username);
    expect(store.analysisId).toBe(analysisId);
    expect(store.shared).toBe(false);
  });

  it('marks shared when server returns 200', async () => {
    vi.spyOn(client, 'startAnalysis').mockResolvedValue({ status: 200, analysisId, username, shared: true });
    vi.spyOn(client, 'fetchAnalysis').mockResolvedValue({
      id: analysisId,
      sessionId,
      username,
      status: 'running',
      error: null,
      createdAt: new Date().toISOString(),
      providers: [],
    } as never);
    const session = useSessionStore();
    session.ensureSession();
    const store = useAnalysisStore();
    await store.start(username);
    expect(store.shared).toBe(true);
    expect(store.banner).toContain('already being analyzed');
  });

  it('exposes cooldown state', () => {
    vi.useFakeTimers();
    try {
      const store = useAnalysisStore();
      store.setCooldown('gemini', 30);
      expect(store.cooldownRemaining('gemini')).toBe(30);
      vi.advanceTimersByTime(1000);
      expect(store.cooldownRemaining('gemini')).toBe(29);
    } finally {
      vi.useRealTimers();
    }
  });
});
