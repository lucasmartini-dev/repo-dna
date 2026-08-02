import { getProviderRows, updateProvider, touchProviderAttempt } from '../db/providers';
import { updateAnalysisStatus } from '../db/analyses';
import { fetchGitHubData } from '../github/client';
import { GitHubFetchError } from '../github/types';
import type { GitHubSnapshot } from '../github/types';
import type { LLMProvider } from '../llm/provider';
import { getProvider } from '../llm';
import type { EventSink } from './types';

type ProviderFactory = (id: string) => LLMProvider;

export async function runProviders(
  analysisId: string,
  snapshot: GitHubSnapshot,
  providerIds: string[],
  factory: ProviderFactory,
  sink: EventSink
): Promise<void> {
  await Promise.all(
    providerIds.map(async (pid) => {
      const now = Date.now();
      touchProviderAttempt(analysisId, pid, now);
      updateProvider(analysisId, pid, { status: 'running', startedAt: now });
      sink({
        type: 'provider-update',
        analysisId,
        provider: pid as never,
        status: 'running',
        progress: 0,
        lastUpdated: new Date().toISOString(),
      });
      try {
        const provider = factory(pid);
        const scorecard = await provider.analyze({
          snapshot,
          onProgress: (progress) => {
            updateProvider(analysisId, pid, { progress });
            sink({
              type: 'provider-update',
              analysisId,
              provider: pid as never,
              status: 'running',
              progress,
              lastUpdated: new Date().toISOString(),
            });
          },
        });
        updateProvider(analysisId, pid, {
          status: 'succeeded',
          progress: 100,
          completedAt: Date.now(),
          scorecard: JSON.stringify(scorecard),
        });
        sink({
          type: 'provider-update',
          analysisId,
          provider: pid as never,
          status: 'succeeded',
          progress: 100,
          lastUpdated: new Date().toISOString(),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[provider ${pid}] failed for analysis ${analysisId}: ${msg}`);
        updateProvider(analysisId, pid, { status: 'failed', completedAt: Date.now() });
        sink({
          type: 'provider-update',
          analysisId,
          provider: pid as never,
          status: 'failed',
          progress: getProviderRows(analysisId).find((r) => r.provider === pid)?.progress ?? 0,
          lastUpdated: new Date().toISOString(),
        });
      }
    })
  );

  const rows = getProviderRows(analysisId);
  const anySucceeded = rows.some((r) => r.status === 'succeeded');
  const anyFailed = rows.some((r) => r.status === 'failed');
  const status = anySucceeded && !anyFailed ? 'succeeded' : 'failed';
  const error = status === 'failed' ? (rows.find((r) => r.status === 'failed')?.provider ?? 'unknown') : null;
  updateAnalysisStatus(analysisId, status, error ? `Provider ${error} failed` : null);
  sink({ type: 'final', analysisId, status, error: error ? `Provider ${error} failed` : undefined });
}

export async function runAnalysis(analysisId: string, username: string, sink: EventSink): Promise<void> {
  try {
    const snapshot = await fetchGitHubData(username);
    sink({
      type: 'provider-update',
      analysisId,
      provider: 'gemini',
      status: 'running',
      progress: 5,
      lastUpdated: new Date().toISOString(),
    });
    await runProviders(
      analysisId,
      snapshot,
      ['gemini', 'groq', 'openrouter', 'nvcf'],
      (id) => getProvider(id as never),
      sink
    );
  } catch (err) {
    const msg =
      err instanceof GitHubFetchError ? `GitHub error ${err.status}: ${err.message}` : `Analysis error: ${String(err)}`;
    updateAnalysisStatus(analysisId, 'failed', msg);
    for (const pid of ['gemini', 'groq', 'openrouter', 'nvcf']) {
      updateProvider(analysisId, pid, { status: 'failed', completedAt: Date.now() });
    }
    sink({ type: 'final', analysisId, status: 'failed', error: msg });
  }
}
