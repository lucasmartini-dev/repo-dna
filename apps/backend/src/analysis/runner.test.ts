import { faker } from '@faker-js/faker';
import { runProviders } from './runner';
import type { GitHubSnapshot } from '../github/types';
import type { LLMProvider } from '../llm/provider';
import type { Scorecard, ProviderId } from '@repo/shared';
import { createSession } from '../db/sessions';
import { createAnalysis } from '../db/analyses';
import { createProviderRows, getProviderRows } from '../db/providers';
import { getAnalysis } from '../db/analyses';
import { resetDbForTests } from '../db/database';

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

function makeScorecard(provider: ProviderId): Scorecard {
  const dims = ['code_quality', 'languages', 'contribution', 'project_depth', 'oss_experience'].map(
    (key, i) => ({ key, label: key, score: 10 - i }) as Scorecard['dimensions'][number]
  );
  return {
    provider,
    model: 'test-model',
    status: 'succeeded',
    progress: 100,
    startedAt: null,
    lastUpdated: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    dimensions: dims,
    top_repos: [],
    strengths: [faker.lorem.word()],
    gaps: [],
    verdict: { leaning: 'hire', summary: faker.lorem.sentence() },
  };
}

const snapshot: GitHubSnapshot = {
  profile: {
    username,
    name: null,
    bio: null,
    followers: 1,
    following: 0,
    repoCount: 1,
    createdAt: '2020-01-01T00:00:00Z',
    location: null,
    company: null,
    avatarUrl: '',
  },
  repos: [
    {
      name: faker.internet.domainWord(),
      description: null,
      language: 'TS',
      topics: [],
      stars: 1,
      forks: 0,
      watchers: 1,
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  languages: [{ language: 'TS', count: 1 }],
  activity: { recentCommits: 1, lastPush: '2026-01-01T00:00:00Z', repoCount: 1 },
};

function makeProvider(id: string, fail = false): LLMProvider {
  return {
    id: id as ProviderId,
    displayName: id,
    async analyze(ctx, _model: string) {
      void _model;
      ctx.onProgress(50);
      if (fail) throw new Error('boom');
      return makeScorecard(id as ProviderId);
    },
  };
}

beforeEach(() => resetDbForTests());

describe('runProviders', () => {
  it('marks each provider succeeded and emits final', async () => {
    jest.useFakeTimers();
    try {
      createSession(sessionId, 1_700_000_000_000 + 43_200_000);
      createAnalysis(analysisId, sessionId, username);
      createProviderRows(analysisId, ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'], {
        gemini: 'gemini-2.0-flash',
        groq: 'llama-3.1-8b-instant',
        openrouter: 'meta-llama/llama-3.1-8b-instruct:free',
        nvcf: 'meta/llama-3.1-8b-instruct',
        opencode: 'deepseek-v4-flash',
      });

      const events: unknown[] = [];
      const promise = runProviders(
        analysisId,
        snapshot,
        ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'],
        {
          gemini: 'gemini-2.0-flash',
          groq: 'llama-3.1-8b-instant',
          openrouter: 'meta-llama/llama-3.1-8b-instruct:free',
          nvcf: 'meta/llama-3.1-8b-instruct',
          opencode: 'deepseek-v4-flash',
        },
        makeProvider,
        (e) => events.push(e)
      );

      await jest.runAllTimersAsync();
      await promise;

      const rows = getProviderRows(analysisId);
      expect(rows.every((r) => r.status === 'succeeded')).toBe(true);
      expect(events.some((e) => (e as { type: string }).type === 'final')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('marks a failing provider failed without failing others and logs the error', async () => {
    jest.useFakeTimers();
    try {
      const errorSpy = jest.spyOn(global.console, 'error').mockImplementation(() => {});
      createSession(sessionId, 1_700_000_000_000 + 43_200_000);
      createAnalysis(analysisId, sessionId, username);
      createProviderRows(analysisId, ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'], {
        gemini: 'gemini-2.0-flash',
        groq: 'llama-3.1-8b-instant',
        openrouter: 'meta-llama/llama-3.1-8b-instruct:free',
        nvcf: 'meta/llama-3.1-8b-instruct',
        opencode: 'deepseek-v4-flash',
      });

      const promise = runProviders(
        analysisId,
        snapshot,
        ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'],
        {
          gemini: 'gemini-2.0-flash',
          groq: 'llama-3.1-8b-instant',
          openrouter: 'meta-llama/llama-3.1-8b-instruct:free',
          nvcf: 'meta/llama-3.1-8b-instruct',
          opencode: 'deepseek-v4-flash',
        },
        (id) => makeProvider(id, id === 'gemini'),
        () => {}
      );

      await jest.runAllTimersAsync();
      await promise;

      const rows = getProviderRows(analysisId);
      expect(rows.find((r) => r.provider === 'gemini')?.status).toBe('failed');
      expect(rows.filter((r) => r.status === 'succeeded')).toHaveLength(4);

      const analysis = getAnalysis(analysisId);
      expect(analysis?.status).toBe('failed');
      expect(analysis?.error).toContain('gemini');

      errorSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts providers with staggered delays', async () => {
    jest.useFakeTimers();
    try {
      createSession(sessionId, 1_700_000_000_000 + 43_200_000);
      createAnalysis(analysisId, sessionId, username);
      createProviderRows(analysisId, ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'], {
        gemini: 'g1',
        groq: 'g2',
        openrouter: 'g3',
        nvcf: 'g4',
        opencode: 'g5',
      });

      const events: unknown[] = [];
      const promise = runProviders(
        analysisId,
        snapshot,
        ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'],
        {
          gemini: 'g1',
          groq: 'g2',
          openrouter: 'g3',
          nvcf: 'g4',
          opencode: 'g5',
        },
        makeProvider,
        (e) => events.push(e)
      );

      const runningUpdates = () => events.filter((e) => (e as { status: string }).status === 'running');
      expect(runningUpdates()).toHaveLength(0);
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      expect(runningUpdates()).toHaveLength(2);
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(runningUpdates()).toHaveLength(4);
      jest.advanceTimersByTime(4000);
      await jest.runAllTimersAsync();
      await promise;
      expect(events.some((e) => (e as { type: string }).type === 'final')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
