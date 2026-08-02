import type { NextApiRequest, NextApiResponse } from 'next';
import { sendJson } from '../../../../src/api/helpers';
import { getAnalysis } from '../../../../src/db/analyses';
import { getProviderRows } from '../../../../src/db/providers';
import { toAnalysisSummary } from '../../../../src/api/summary';

export async function reportHandler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;
  const analysis = getAnalysis(id);
  if (!analysis) return sendJson(res, 404, { error: 'analysis not found' });
  if (analysis.status === 'running') return sendJson(res, 425, { error: 'analysis still running' });
  const summary = toAnalysisSummary(analysis, getProviderRows(id));
  const scorecards = summary.providers.filter((p) => p.status === 'succeeded');
  sendJson(res, 200, { analysis: summary, scorecards });
}

export default reportHandler;
