import { describe, expect, it, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import { createSession, startAnalysis, fetchReport, retryProvider } from './client';

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createSession', () => {
  it('posts and returns the session', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ sessionId, expiresAt: 1 }), { status: 201 }));
    const session = await createSession();
    expect(session.sessionId).toBe(sessionId);
  });
});

describe('startAnalysis', () => {
  it('returns 201 payload', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ analysisId, username, shared: false }), { status: 201 }));
    const result = await startAnalysis(username, sessionId);
    expect(result.status).toBe(201);
    expect(result.analysisId).toBe(analysisId);
  });
  it('returns shared payload on 200', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ analysisId, username, shared: true }), { status: 200 }));
    const result = await startAnalysis(username, sessionId);
    expect(result.status).toBe(200);
    expect(result.shared).toBe(true);
  });
});

describe('retryProvider', () => {
  it('returns retryAfterSeconds on 429', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ retryAfterSeconds: 30 }), { status: 429 }));
    const result = await retryProvider(analysisId, sessionId, 'gemini');
    expect(result.status).toBe(429);
    expect(result.retryAfterSeconds).toBe(30);
  });
});

describe('fetchReport', () => {
  it('throws ApiError on 425', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'running' }), { status: 425 }));
    await expect(fetchReport(analysisId)).rejects.toThrow();
  });
});
