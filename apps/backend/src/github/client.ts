import { GitHubFetchError, type GitHubProfile, type GitHubRepo, type GitHubSnapshot } from './types';

const BASE = 'https://api.github.com';
const FETCH_TIMEOUT_MS = 10_000;

export class GitHubTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubTimeoutError';
  }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function get<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: headers(), signal: controller.signal });
    if (!res.ok) throw new GitHubFetchError(`GitHub API ${res.status}`, res.status);
    return (await res.json()) as T;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new GitHubTimeoutError(`GitHub API request timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGitHubData(username: string): Promise<GitHubSnapshot> {
  const profile = await get<GitHubProfile>(`${BASE}/users/${encodeURIComponent(username)}`);
  const repos = await get<GitHubRepo[]>(
    `${BASE}/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`
  );
  return buildSnapshot(profile, repos);
}

export function buildSnapshot(profile: GitHubProfile, repos: GitHubRepo[]): GitHubSnapshot {
  const languageCounts = new Map<string, number>();
  for (const repo of repos) {
    if (repo.language) languageCounts.set(repo.language, (languageCounts.get(repo.language) ?? 0) + 1);
  }
  const languages = Array.from(languageCounts.entries())
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count);

  const recentWindow = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recentCommits = repos.filter((r) => new Date(r.updated_at).getTime() >= recentWindow).length;
  const lastPush = repos.length
    ? [...repos].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0].updated_at
    : null;

  return {
    profile: {
      username: profile.login,
      name: profile.name,
      bio: profile.bio,
      followers: profile.followers,
      following: profile.following,
      repoCount: profile.public_repos,
      createdAt: profile.created_at,
      location: profile.location,
      company: profile.company,
      avatarUrl: profile.avatar_url,
    },
    repos: repos
      .filter((r) => !r.fork)
      .map((r) => ({
        name: r.name,
        description: r.description,
        language: r.language,
        topics: r.topics,
        stars: r.stargazers_count,
        forks: r.forks_count,
        watchers: r.watchers_count,
        updatedAt: r.updated_at,
      })),
    languages,
    activity: { recentCommits, lastPush, repoCount: repos.length },
  };
}
