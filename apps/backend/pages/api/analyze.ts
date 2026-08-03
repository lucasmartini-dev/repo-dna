import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { requireSession, sendJson, getHeader } from '../../src/api/helpers';
import { createAnalysis, getRunningAnalysisForUsername, hasRunningAnalysisForSession } from '../../src/db/analyses';
import { createProviderRows } from '../../src/db/providers';
import { PROVIDER_IDS, PROVIDER_MODELS } from '@repo/shared';
import { startAnalysisAsync } from '../../src/api/router';

export async function analyzeHandler(req: NextApiRequest, res: NextApiResponse) {
  const sessionId = getHeader(req, 'x-session-id');
  const username = req.body?.username as string | undefined;
  const bodyModels = (req.body?.models as Record<string, string>) ?? {};
  if (!sessionId) return sendJson(res, 401, { error: 'missing session' });
  if (!requireSession(sessionId)) return sendJson(res, 401, { error: 'invalid or expired session' });
  if (!username) return sendJson(res, 400, { error: 'username is required' });

  if (hasRunningAnalysisForSession(sessionId)) {
    return sendJson(res, 409, { error: 'an analysis is already running for this session' });
  }

  const existing = getRunningAnalysisForUsername(username, sessionId);
  if (existing) {
    return sendJson(res, 200, { analysisId: existing.id, username, shared: true });
  }

  const analysisId = randomUUID();
  createAnalysis(analysisId, sessionId, username);
  const models: Record<string, string> = {};
  for (const id of PROVIDER_IDS) {
    models[id] = bodyModels[id] || PROVIDER_MODELS[id]?.[0]?.id || '';
  }
  createProviderRows(analysisId, PROVIDER_IDS, models);
  startAnalysisAsync(analysisId, username, models);
  sendJson(res, 201, { analysisId, username, shared: false });
}

export default analyzeHandler;
