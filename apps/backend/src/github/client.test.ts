import { faker } from '@faker-js/faker';
import { buildSnapshot } from './client';
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
