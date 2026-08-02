const GITHUB_PROFILE_RE = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})[A-Za-z0-9])\/?$/;
const RESERVED = new Set([
  'login',
  'orgs',
  'repos',
  'topics',
  'explore',
  'settings',
  'features',
  'sponsors',
  'marketplace',
  'enterprise',
  'search',
  'about',
  'collections',
  'trending',
  'events',
]);

export function parseGithubUrl(input: string): { username: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(GITHUB_PROFILE_RE);
  if (!match) return null;
  const username = match[1];
  if (RESERVED.has(username.toLowerCase())) return null;
  return { username };
}
