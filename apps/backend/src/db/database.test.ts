import { faker } from '@faker-js/faker';
import { resetDbForTests } from './database';
import { createSession, getSession, deleteExpiredSessions } from './sessions';
import {
  createAnalysis,
  getAnalysis,
  getLatestAnalysisForSession,
  getRunningAnalysisForUsername,
  hasRunningAnalysisForSession,
  updateAnalysisStatus,
} from './analyses';
import { createProviderRows, getProviderRows, updateProvider, getProviderRow, touchProviderAttempt } from './providers';
import { PROVIDER_IDS } from '@repo/shared';

const s1 = faker.string.uuid();
const s2 = faker.string.uuid();
const a1 = faker.string.uuid();
const username = faker.internet.userName();

beforeEach(() => resetDbForTests());

describe('sessions', () => {
  it('creates, reads and sweeps sessions', () => {
    const now = 1_700_000_000_000;
    createSession(s1, now + 43_200_000);
    expect(getSession(s1)).toMatchObject({ id: s1 });
    expect(getSession('missing')).toBeUndefined();
    createSession(s2, now - 1_000);
    expect(deleteExpiredSessions(now)).toBe(1);
    expect(getSession(s2)).toBeUndefined();
  });
});

describe('analyses', () => {
  it('creates and reads an analysis', () => {
    createSession(s1, 1_700_000_000_000 + 43_200_000);
    createAnalysis(a1, s1, username);
    expect(getAnalysis(a1)).toMatchObject({ username });
    expect(getLatestAnalysisForSession(s1)?.id).toBe(a1);
    expect(hasRunningAnalysisForSession(s1)).toBe(true);
  });

  it('finds a running analysis for a username in another session', () => {
    createSession(s1, 1_700_000_000_000 + 43_200_000);
    createSession(s2, 1_700_000_000_000 + 43_200_000);
    createAnalysis(a1, s1, username);
    const found = getRunningAnalysisForUsername(username, s2);
    expect(found?.id).toBe(a1);
    expect(getRunningAnalysisForUsername(username, s1)).toBeUndefined();
  });

  it('updates status', () => {
    createSession(s1, 1_700_000_000_000 + 43_200_000);
    createAnalysis(a1, s1, username);
    updateAnalysisStatus(a1, 'failed', 'github 404');
    expect(getAnalysis(a1)).toMatchObject({ status: 'failed', error: 'github 404' });
  });
});

describe('providers', () => {
  it('creates and updates provider rows', () => {
    createSession(s1, 1_700_000_000_000 + 43_200_000);
    createAnalysis(a1, s1, username);
    createProviderRows(a1, PROVIDER_IDS);
    const rows = getProviderRows(a1);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);

    updateProvider(a1, 'gemini', {
      status: 'succeeded',
      progress: 100,
      scorecard: JSON.stringify({ provider: 'gemini' }),
    });
    expect(getProviderRow(a1, 'gemini')).toMatchObject({ status: 'succeeded' });

    touchProviderAttempt(a1, 'groq', 1_700_000_000_000);
    expect(getProviderRow(a1, 'groq')?.lastAttemptAt).toBe(1_700_000_000_000);
  });
});
