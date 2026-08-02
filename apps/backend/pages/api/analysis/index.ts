import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession, sendJson, getHeader } from '../../../src/api/helpers';
import { getLatestAnalysisForSession } from '../../../src/db/analyses';
import { getProviderRows } from '../../../src/db/providers';
import { toAnalysisSummary } from '../../../src/api/summary';

export async function latestAnalysisHandler(req: NextApiRequest, res: NextApiResponse) {
  const sessionId = getHeader(req, 'x-session-id');
  if (!sessionId || !requireSession(sessionId)) return sendJson(res, 401, { error: 'invalid session' });
  const analysis = getLatestAnalysisForSession(sessionId);
  if (!analysis) return sendJson(res, 200, { analysis: null });
  sendJson(res, 200, { analysis: toAnalysisSummary(analysis, getProviderRows(analysis.id)) });
}

export default latestAnalysisHandler;
