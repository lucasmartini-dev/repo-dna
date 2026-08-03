import type { NextApiRequest, NextApiResponse } from 'next';
import { getAnalysis, updateAnalysisStatus } from '../../../../src/db/analyses';
import { getProviderRow, updateProvider } from '../../../../src/db/providers';
import { requireSession, sendJson } from '../../../../src/api/helpers';
import { getProvider } from '../../../../src/llm';
import { fetchGitHubData } from '../../../../src/github/client';
import { runProviders } from '../../../../src/analysis/runner';
import { wsHub } from '../../../../src/ws/hub';
import { PROVIDER_MODELS, type ProviderId } from '@repo/shared';

const COOLDOWN_MS = 45_000;

export async function retryHandler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;
  const sessionId = (req.body?.sessionId as string) ?? (req.query.sessionId as string);
  const provider = req.body?.provider as string;

  if (!sessionId || !requireSession(sessionId)) return sendJson(res, 401, { error: 'invalid session' });
  const analysis = getAnalysis(id);
  if (!analysis) return sendJson(res, 404, { error: 'analysis not found' });

  const row = getProviderRow(id, provider);
  if (!row) return sendJson(res, 400, { error: 'unknown provider' });

  if (row.status === 'running') {
    return sendJson(res, 200, { shared: true });
  }

  const now = Date.now();
  if (row.lastAttemptAt && now - row.lastAttemptAt < COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil((COOLDOWN_MS - (now - row.lastAttemptAt)) / 1000);
    return sendJson(res, 429, { retryAfterSeconds });
  }

  getProvider(provider as never);
  const analysisId = id;
  updateAnalysisStatus(analysisId, 'running');
  try {
    const snapshot = await fetchGitHubData(analysis.username);
    const modelId = PROVIDER_MODELS[provider as ProviderId]?.[0]?.id ?? provider;
    await runProviders(
      analysisId,
      snapshot,
      [provider],
      { [provider]: modelId },
      (pid) => getProvider(pid as never),
      (event) => wsHub.publish(event.analysisId, event)
    );
    const updated = getProviderRow(analysisId, provider);
    sendJson(res, updated?.status === 'succeeded' ? 201 : 200, { shared: false, status: updated?.status });
  } catch (err) {
    updateAnalysisStatus(analysisId, 'failed', err instanceof Error ? err.message : String(err));
    updateProvider(analysisId, provider, { status: 'failed', completedAt: Date.now() });
    sendJson(res, 200, { shared: false, status: 'failed' });
  }
}

export default retryHandler;
