import { faker } from '@faker-js/faker';
import { buildSnapshot, fetchRepoReadme, GitHubTimeoutError } from './client';
import type { GitHubProfile, GitHubRepo } from './types';

const username = faker.internet.userName();

const profile: GitHubProfile = {
  login: username,
  name: faker.person.fullName(),
  bio: faker.lorem.sentence(),
  followers: faker.number.int({ min: 1, max: 1000 }),
  following: faker.number.int({ min: 0, max: 100 }),
  public_repos: 2,
  created_at: '2011-01-01T00:00:00Z',
  location: null,
  company: null,
  avatar_url: `https://avatars.githubusercontent.com/${username}?v=4`,
  html_url: `https://github.com/${username}`,
};

const repos: GitHubRepo[] = [
  {
    name: 'tslib',
    description: 'TS lib',
    language: 'TypeScript',
    topics: ['ts'],
    stargazers_count: 5,
    forks_count: 1,
    watchers_count: 5,
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    fork: false,
  },
  {
    name: 'hello',
    description: null,
    language: 'JavaScript',
    topics: [],
    stargazers_count: 3,
    forks_count: 0,
    watchers_count: 3,
    updated_at: '2024-05-01T00:00:00Z',
    fork: false,
  },
];

describe('buildSnapshot', () => {
  it('aggregates language counts', () => {
    const snapshot = buildSnapshot(profile, repos);
    expect(snapshot.languages).toEqual([
      { language: 'TypeScript', count: 1 },
      { language: 'JavaScript', count: 1 },
    ]);
  });
  it('exposes repo popularity and activity', () => {
    const snapshot = buildSnapshot(profile, repos);
    expect(snapshot.profile.username).toBe(username);
    expect(snapshot.repos[0].stars).toBe(5);
    expect(snapshot.activity.repoCount).toBe(2);
    expect(snapshot.activity.recentCommits).toBe(1);
  });
});

describe('GitHubTimeoutError', () => {
  it('has correct name and message', () => {
    const err = new GitHubTimeoutError('timed out');
    expect(err.name).toBe('GitHubTimeoutError');
    expect(err.message).toBe('timed out');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('fetchRepoReadme', () => {
  it('decodes base64 content', async () => {
    const b64 = Buffer.from('hello world').toString('base64');
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ content: b64, encoding: 'base64' }) })
    ) as jest.Mock;
    const result = await fetchRepoReadme('test', 'repo');
    expect(result).toBe('hello world');
  });

  it('returns null on error', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('fail'))) as jest.Mock;
    const result = await fetchRepoReadme('test', 'repo');
    expect(result).toBeNull();
  });
});
