import { faker } from '@faker-js/faker';
import { createMockReqRes } from '../test-helpers';
import { sessionHandler } from '../../pages/api/session';
import { analyzeHandler } from '../../pages/api/analyze';
import { retryHandler } from '../../pages/api/analysis/[id]/retry';
import { resetDbForTests } from '../db/database';
import { createSession } from '../db/sessions';
import { createAnalysis } from '../db/analyses';
import { createProviderRows, touchProviderAttempt } from '../db/providers';

jest.mock('../../src/api/router', () => ({
  startAnalysisAsync: jest.fn(),
}));

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

beforeEach(() => {
  resetDbForTests();
  jest.clearAllMocks();
});

describe('session', () => {
  it('creates a session', async () => {
    const { req, res } = createMockReqRes();
    await sessionHandler(req, res);
    expect(res.statusCode).toBe(201);
    const body = res._getJSON() as { sessionId: string; expiresAt: number };
    expect(body.sessionId).toBeTruthy();
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe('analyze', () => {
  it('returns 401 for unknown session', async () => {
    const { req, res } = createMockReqRes();
    req.body = { username };
    req.headers = { 'x-session-id': 'nope' };
    await analyzeHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 201 for a new analysis', async () => {
    createSession(sessionId, Date.now() + 43_200_000);
    const { req, res } = createMockReqRes();
    req.body = { username };
    req.headers = { 'x-session-id': sessionId };
    await analyzeHandler(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('returns 409 when the session already has a running analysis', async () => {
    createSession(sessionId, Date.now() + 43_200_000);
    createAnalysis(analysisId, sessionId, faker.internet.userName());
    const { req, res } = createMockReqRes();
    req.body = { username };
    req.headers = { 'x-session-id': sessionId };
    await analyzeHandler(req, res);
    expect(res.statusCode).toBe(409);
  });
});

describe('retry', () => {
  it('returns 429 inside the 45s cooldown', async () => {
    createSession(sessionId, Date.now() + 43_200_000);
    createAnalysis(analysisId, sessionId, username);
    createProviderRows(analysisId, ['gemini', 'groq', 'openrouter']);
    touchProviderAttempt(analysisId, 'gemini', Date.now() - 10_000);
    const { req, res } = createMockReqRes();
    req.body = { sessionId, provider: 'gemini' };
    req.query = { id: analysisId };
    await retryHandler(req, res);
    expect(res.statusCode).toBe(429);
  });
});
