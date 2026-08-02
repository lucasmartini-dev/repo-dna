import { describe, expect, it } from 'vitest';
import { faker } from '@faker-js/faker';
import { parseGithubUrl } from './githubUrl';

faker.seed(0);
const username = faker.internet.userName();

describe('parseGithubUrl', () => {
  it('accepts a plain profile link', () => {
    expect(parseGithubUrl(`https://github.com/${username}`)).toEqual({ username });
    expect(parseGithubUrl(`github.com/${username}`)).toEqual({ username });
  });
  it('rejects non-profile paths', () => {
    expect(parseGithubUrl(`https://github.com/${username}/repo`)).toBeNull();
    expect(parseGithubUrl('https://github.com/login')).toBeNull();
    expect(parseGithubUrl('https://github.com/orgs/octo')).toBeNull();
    expect(parseGithubUrl(`https://github.com/repos/${username}/repo`)).toBeNull();
  });
  it('rejects garbage', () => {
    expect(parseGithubUrl('not a url')).toBeNull();
    expect(parseGithubUrl(`https://example.com/${username}`)).toBeNull();
    expect(parseGithubUrl('')).toBeNull();
  });
});
