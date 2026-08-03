import { getProviderRows, updateProvider, touchProviderAttempt } from '../db/providers';
import { updateAnalysisStatus } from '../db/analyses';
import { fetchGitHubData } from '../github/client';
import { GitHubFetchError } from '../github/types';
import { GitHubTimeoutError } from '../github/client';
import type { GitHubSnapshot } from '../github/types';
import type { LLMProvider } from '../llm/provider';
import { getProvider } from '../llm';
import type { EventSink } from './types';
import type { ProviderId } from '@repo/shared';
import { PROVIDER_MODELS } from '@repo/shared';

type ProviderFactory = (id: string) => LLMProvider;

async function runSingleProvider(
  analysisId: string,
  snapshot: GitHubSnapshot,
  pid: string,
  modelId: string,
  factory: ProviderFactory,
  sink: EventSink
): Promise<void> {
  try {
    const now = Date.now();
    touchProviderAttempt(analysisId, pid, now);
    updateProvider(analysisId, pid, { status: 'running', startedAt: now, model: modelId });
    sink({
      type: 'provider-update',
      analysisId,
      provider: pid as never,
      status: 'running',
      progress: 0,
      lastUpdated: new Date().toISOString(),
    });
    const provider = factory(pid);
    const scorecard = await provider.analyze(
      {
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
      },
      modelId
    );
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
}

export async function runProviders(
  analysisId: string,
  snapshot: GitHubSnapshot,
  providerIds: string[],
  models: Record<string, string>,
  factory: ProviderFactory,
  sink: EventSink
): Promise<void> {
  const FIRST_START_DELAY = 3000;
  const INTER_START_DELAY = 1000;

  const promises = providerIds.map((pid, i) => {
    const delay = FIRST_START_DELAY + i * INTER_START_DELAY;
    const modelId = models[pid] ?? PROVIDER_MODELS[pid as ProviderId]?.[0]?.id ?? '';
    return new Promise<void>((resolve) => setTimeout(resolve, delay)).then(() =>
      runSingleProvider(analysisId, snapshot, pid, modelId, factory, sink)
    );
  });

  await Promise.all(promises);

  const rows = getProviderRows(analysisId);
  const anySucceeded = rows.some((r) => r.status === 'succeeded');
  const anyFailed = rows.some((r) => r.status === 'failed');
  const status = anySucceeded && !anyFailed ? 'succeeded' : 'failed';
  const error = status === 'failed' ? (rows.find((r) => r.status === 'failed')?.provider ?? 'unknown') : null;
  updateAnalysisStatus(analysisId, status, error ? `Provider ${error} failed` : null);
  sink({ type: 'final', analysisId, status, error: error ? `Provider ${error} failed` : undefined });
}

export async function runAnalysis(
  analysisId: string,
  username: string,
  models: Record<string, string>,
  sink: EventSink
): Promise<void> {
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
      models,
      (id) => getProvider(id as never),
      sink
    );
  } catch (err) {
    let msg: string;
    if (err instanceof GitHubFetchError) {
      msg = `GitHub error ${err.status}: ${err.message}`;
    } else if (err instanceof GitHubTimeoutError) {
      msg = err.message;
    } else {
      msg = `Analysis error: ${String(err)}`;
    }
    updateAnalysisStatus(analysisId, 'failed', msg);
    for (const pid of ['gemini', 'groq', 'openrouter', 'nvcf']) {
      updateProvider(analysisId, pid, { status: 'failed', completedAt: Date.now() });
    }
    sink({ type: 'final', analysisId, status: 'failed', error: msg });
  }
}
