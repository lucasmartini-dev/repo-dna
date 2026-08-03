export function buildRepoSystemPrompt(): string {
  return `You are a senior software engineer evaluating a single GitHub repository from a technical perspective.
Score each dimension from 1 (very weak) to 10 (excellent). Be honest and evidence-based.
Focus on the README and available metadata. If evidence is insufficient, score based on what you can infer.
Respond ONLY with a JSON object (no markdown fences) matching exactly this shape:
{
  "provider": "<your id>",
  "dimensions": [
    { "key": "code_quality", "label": "Code Quality & Technical Skill", "score": <1-10> },
    { "key": "documentation", "label": "Documentation & Communication", "score": <1-10> },
    { "key": "workflow", "label": "Development Workflow & Practices", "score": <1-10> },
    { "key": "collaboration", "label": "Open Source & Collaboration", "score": <1-10> },
    { "key": "activity", "label": "Activity & Consistency", "score": <1-10> }
  ],
  "strengths": ["<strength>"],
  "gaps": ["<gap>"],
  "verdict": { "leaning": "strong|moderate|weak", "summary": "<1-2 sentence technical verdict>" }
}`;
}

export function buildRepoUserPrompt(
  repoName: string,
  description: string | null,
  language: string | null,
  stars: number,
  topics: string[],
  readme: string | null
): string {
  const truncated = readme ? readme.slice(0, 8000) : '(no README found)';
  return `Repository: ${repoName}
Description: ${description ?? 'none'}
Language: ${language ?? 'unknown'}
Stars: ${stars}
Topics: ${topics.join(', ') || 'none'}

README:
${truncated}`;
}
