import type { GitHubSnapshot } from '../github/types';

export function buildSystemPrompt(): string {
  return `You are a technical recruiter evaluating a candidate's GitHub profile.
Score each dimension from 1 (very weak) to 10 (excellent). Be honest and evidence-based.
Respond ONLY with a JSON object (no markdown fences) matching exactly this shape:
{
  "provider": "<your id>",
  "dimensions": [
    { "key": "code_quality", "label": "Code Quality", "score": <1-10> },
    { "key": "languages", "label": "Languages", "score": <1-10> },
    { "key": "contribution", "label": "Contribution Activity", "score": <1-10> },
    { "key": "project_depth", "label": "Project Depth", "score": <1-10> },
    { "key": "oss_experience", "label": "Open Source Experience", "score": <1-10> },
    { "key": "seniority", "label": "Seniority Level", "score": <1-10, where 1-3=Junior, 4-7=Mid, 8-10=Senior> }
  ],
  "top_repos": [{ "name": "<repo name>", "stars": <int>, "description": "<short>", "reason": "<why this repo stands out>" }],
  "strengths": ["<strength>"],
  "gaps": ["<gap>"],
  "verdict": { "leaning": "hire|no_hire|uncertain", "summary": "<1-2 sentence verdict>" }
}`;
}

export function buildUserPrompt(snapshot: GitHubSnapshot): string {
  const repoLines = snapshot.repos
    .map(
      (r) =>
        `- ${r.name} (${r.language ?? 'n/a'}) ⭐${r.stars} forks:${r.forks} updated:${r.updatedAt} topics:[${r.topics.join(', ')}] desc:${r.description ?? 'none'}`
    )
    .slice(0, 30)
    .join('\n');

  return `Candidate GitHub profile:
- username: ${snapshot.profile.username}
- name: ${snapshot.profile.name ?? 'n/a'}
- bio: ${snapshot.profile.bio ?? 'n/a'}
- followers: ${snapshot.profile.followers}, following: ${snapshot.profile.following}
- account created: ${snapshot.profile.createdAt}
- location: ${snapshot.profile.location ?? 'n/a'}
- company: ${snapshot.profile.company ?? 'n/a'}

Languages:
${snapshot.languages.map((l) => `- ${l.language}: ${l.count} repo(s)`).join('\n')}

Activity:
- repos: ${snapshot.activity.repoCount}
- repos updated in last 90 days: ${snapshot.activity.recentCommits}
- last push: ${snapshot.activity.lastPush ?? 'n/a'}

Top repos:
${repoLines}`;
}
