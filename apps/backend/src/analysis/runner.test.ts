import { faker } from '@faker-js/faker';
import { runProviders } from './runner';
import type { GitHubSnapshot } from '../github/types';
import type { LLMProvider } from '../llm/provider';
import type { Scorecard } from '@repo/shared';
import { createSession } from '../db/sessions';
import { createAnalysis } from '../db/analyses';
import { createProviderRows, getProviderRows } from '../db/providers';
import { resetDbForTests } from '../db/database';

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

function makeScorecard(provider: 'gemini' | 'groq' | 'openrouter' | 'nvcf'): Scorecard {
  const dims = ['code_quality', 'languages', 'contribution', 'project_depth', 'oss_experience'].map(
    (key, i) => ({ key, label: key, score: 10 - i }) as Scorecard['dimensions'][number]
  );
  return {
    provider,
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
    id: id as 'gemini' | 'groq' | 'openrouter' | 'nvcf',
    displayName: id,
    async analyze(ctx) {
      ctx.onProgress(50);
      if (fail) throw new Error('boom');
      return makeScorecard(id as 'gemini' | 'groq' | 'openrouter' | 'nvcf');
    },
  };
}

beforeEach(() => resetDbForTests());

describe('runProviders', () => {
  it('marks each provider succeeded and emits final', async () => {
    createSession(sessionId, 1_700_000_000_000 + 43_200_000);
    createAnalysis(analysisId, sessionId, username);
    createProviderRows(analysisId, ['gemini', 'groq', 'openrouter', 'nvcf']);

    const events: unknown[] = [];
    await runProviders(analysisId, snapshot, ['gemini', 'groq', 'openrouter', 'nvcf'], makeProvider, (e) =>
      events.push(e)
    );

    const rows = getProviderRows(analysisId);
    expect(rows.every((r) => r.status === 'succeeded')).toBe(true);
    expect(events.some((e) => (e as { type: string }).type === 'final')).toBe(true);
  });

  it('marks a failing provider failed without failing others', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    createSession(sessionId, 1_700_000_000_000 + 43_200_000);
    createAnalysis(analysisId, sessionId, username);
    createProviderRows(analysisId, ['gemini', 'groq', 'openrouter', 'nvcf']);

    await runProviders(
      analysisId,
      snapshot,
      ['gemini', 'groq', 'openrouter', 'nvcf'],
      (id) => makeProvider(id, id === 'gemini'),
      () => {}
    );

    errorSpy.mockRestore();

    const rows = getProviderRows(analysisId);
    expect(rows.find((r) => r.provider === 'gemini')?.status).toBe('failed');
    expect(rows.filter((r) => r.status === 'succeeded')).toHaveLength(3);
  });
});
