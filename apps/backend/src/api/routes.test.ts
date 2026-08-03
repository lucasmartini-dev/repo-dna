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

jest.mock('../../src/github/client', () => ({
  fetchGitHubData: jest.fn().mockResolvedValue({
    profile: {
      username: 'test',
      name: null,
      bio: null,
      followers: 0,
      following: 0,
      repoCount: 0,
      createdAt: '',
      location: null,
      company: null,
      avatarUrl: '',
    },
    repos: [],
    languages: [],
    activity: {},
  }),
}));

jest.mock('../../src/analysis/runner', () => ({
  runProviders: jest.fn().mockResolvedValue(undefined),
}));

const mockRunProviders = jest.requireMock('../../src/analysis/runner').runProviders as jest.Mock;

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
  it('creates session and starts analysis for unknown session', async () => {
    const { req, res } = createMockReqRes();
    req.body = { username, models: {} };
    req.headers = { 'x-session-id': 'nope' };
    await analyzeHandler(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('returns 201 for a new analysis', async () => {
    createSession(sessionId, Date.now() + 43_200_000);
    const { req, res } = createMockReqRes();
    req.body = { username, models: { gemini: 'gemini-2.0-flash' } };
    req.headers = { 'x-session-id': sessionId };
    await analyzeHandler(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('returns 409 when the session already has a running analysis', async () => {
    createSession(sessionId, Date.now() + 43_200_000);
    createAnalysis(analysisId, sessionId, faker.internet.userName());
    const { req, res } = createMockReqRes();
    req.body = { username, models: {} };
    req.headers = { 'x-session-id': sessionId };
    await analyzeHandler(req, res);
    expect(res.statusCode).toBe(409);
  });

  it('passes models to createProviderRows and startAnalysisAsync', async () => {
    const { startAnalysisAsync: mockStart } = jest.requireMock('../../src/api/router');
    createSession(sessionId, Date.now() + 43_200_000);
    const { req, res } = createMockReqRes();
    const models = { gemini: 'gemini-2.0-flash', groq: 'llama-3.1-8b-instant' };
    req.body = { username, models };
    req.headers = { 'x-session-id': sessionId };
    await analyzeHandler(req, res);
    expect(res.statusCode).toBe(201);
    const body = res._getJSON() as { analysisId: string };
    expect(mockStart).toHaveBeenCalledWith(
      body.analysisId,
      username,
      expect.objectContaining({
        gemini: 'gemini-2.0-flash',
        groq: 'llama-3.1-8b-instant',
      })
    );
  });
});

describe('retry', () => {
  it('returns 429 inside the 45s cooldown', async () => {
    createSession(sessionId, Date.now() + 43_200_000);
    createAnalysis(analysisId, sessionId, username);
    createProviderRows(analysisId, ['gemini', 'groq', 'openrouter', 'nvcf'], {
      gemini: 'g1',
      groq: 'g2',
      openrouter: 'g3',
      nvcf: 'g4',
    });
    touchProviderAttempt(analysisId, 'gemini', Date.now() - 10_000);
    const { req, res } = createMockReqRes();
    req.body = { sessionId, provider: 'gemini' };
    req.query = { id: analysisId };
    await retryHandler(req, res);
    expect(res.statusCode).toBe(429);
  });

  it('passes models to runProviders on retry', async () => {
    mockRunProviders.mockClear();
    createSession(sessionId, Date.now() + 43_200_000);
    createAnalysis(analysisId, sessionId, username);
    createProviderRows(analysisId, ['gemini'], { gemini: 'g1' });
    const { req, res } = createMockReqRes();
    req.body = { sessionId, provider: 'gemini' };
    req.query = { id: analysisId };
    await retryHandler(req, res);
    expect(mockRunProviders).toHaveBeenCalledWith(
      analysisId,
      expect.any(Object),
      ['gemini'],
      expect.objectContaining({ gemini: expect.any(String) }),
      expect.any(Function),
      expect.any(Function)
    );
  });
});
