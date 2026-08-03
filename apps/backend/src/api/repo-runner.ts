import { randomUUID } from 'crypto';
import { fetchRepoReadme } from '../github/client';
import { buildRepoSystemPrompt, buildRepoUserPrompt } from '../llm/repo-prompts';
import { getProvider } from '../llm';
import { createRepoAnalysis, updateRepoAnalysis } from '../db/repo-analyses';
import type { ProviderId, RepoScorecard } from '@repo/shared';
import type { GitHubRepo } from '../github/types';

export async function runRepoAnalysis(
  analysisId: string,
  repoName: string,
  username: string,
  providerId: string,
  modelId: string,
  repoMeta: Pick<GitHubRepo, 'description' | 'language' | 'stargazers_count' | 'topics'>
): Promise<void> {
  const id = randomUUID();
  createRepoAnalysis(id, analysisId, repoName, username, providerId, modelId || null);
  updateRepoAnalysis(id, { status: 'running' });
  try {
    const readme = await fetchRepoReadme(username, repoName);
    const provider = getProvider(providerId as ProviderId);
    const response = await provider.analyzeCustomPrompt(
      buildRepoSystemPrompt(),
      buildRepoUserPrompt(
        repoName,
        repoMeta.description,
        repoMeta.language,
        repoMeta.stargazers_count,
        repoMeta.topics,
        readme
      ),
      modelId
    );
    const parsed = JSON.parse(response) as Record<string, unknown>;
    const dims = (parsed.dimensions as Array<{ key: string; label: string; score: number }>) ?? [];
    const scorecard: RepoScorecard = {
      id,
      repoName,
      provider: providerId as ProviderId,
      model: modelId,
      status: 'succeeded',
      error: null,
      dimensions: dims.map((d) => ({
        key: d.key as RepoScorecard['dimensions'][number]['key'],
        label: d.label,
        score: d.score,
      })),
      strengths: (parsed.strengths as string[]) ?? [],
      gaps: (parsed.gaps as string[]) ?? [],
      verdict: {
        leaning: ((parsed.verdict as Record<string, string>)?.leaning ?? 'moderate') as 'strong' | 'moderate' | 'weak',
        summary: (parsed.verdict as Record<string, string>)?.summary ?? '',
      },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    updateRepoAnalysis(id, { status: 'succeeded', scorecard: JSON.stringify(scorecard) });
  } catch (err) {
    updateRepoAnalysis(id, { status: 'failed', error: err instanceof Error ? err.message : String(err) });
  }
}
