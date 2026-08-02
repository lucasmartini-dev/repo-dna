import type { NextApiRequest, NextApiResponse } from 'next';
import { sendJson } from '../../../src/api/helpers';
import { getAnalysis } from '../../../src/db/analyses';
import { getProviderRows } from '../../../src/db/providers';
import { toAnalysisSummary } from '../../../src/api/summary';

export async function analysisByIdHandler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;
  const analysis = getAnalysis(id);
  if (!analysis) return sendJson(res, 404, { error: 'analysis not found' });
  sendJson(res, 200, { analysis: toAnalysisSummary(analysis, getProviderRows(id)) });
}

export default analysisByIdHandler;
