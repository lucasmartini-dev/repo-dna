export interface GitHubProfile {
  login: string;
  name: string | null;
  bio: string | null;
  followers: number;
  following: number;
  public_repos: number;
  created_at: string;
  location: string | null;
  company: string | null;
  avatar_url: string;
  html_url: string;
}

export interface GitHubRepo {
  name: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  updated_at: string;
  fork: boolean;
}

export interface GitHubSnapshot {
  profile: {
    username: string;
    name: string | null;
    bio: string | null;
    followers: number;
    following: number;
    repoCount: number;
    createdAt: string;
    location: string | null;
    company: string | null;
    avatarUrl: string;
  };
  repos: Array<{
    name: string;
    description: string | null;
    language: string | null;
    topics: string[];
    stars: number;
    forks: number;
    watchers: number;
    updatedAt: string;
  }>;
  languages: Array<{ language: string; count: number }>;
  activity: { recentCommits: number; lastPush: string | null; repoCount: number };
}

export class GitHubFetchError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'GitHubFetchError';
  }
}
