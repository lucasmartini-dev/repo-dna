import type { NextApiRequest, NextApiResponse } from 'next';
import { sendJson } from '../../../src/api/helpers';
import { getAnalysis } from '../../../src/db/analyses';
import { getLatestRepoAnalysis } from '../../../src/db/repo-analyses';
import { runRepoAnalysis } from '../../../src/api/repo-runner';

async function repoHandler(req: NextApiRequest, res: NextApiResponse) {
  const analysisId = req.query.id as string;
  const repoName = req.query.repo as string;

  if (req.method === 'GET') {
    if (!repoName) return sendJson(res, 400, { error: 'repo query param required' });
    const ra = getLatestRepoAnalysis(analysisId, repoName);
    if (!ra) return sendJson(res, 404, { error: 'repo analysis not found' });
    const sc = ra.scorecard ? JSON.parse(ra.scorecard) : null;
    return sendJson(res, 200, {
      repoAnalysis: {
        id: ra.id,
        repoName: ra.repoName,
        provider: ra.provider,
        model: ra.model,
        status: ra.status,
        error: ra.error,
        dimensions: sc?.dimensions ?? [],
        strengths: sc?.strengths ?? [],
        gaps: sc?.gaps ?? [],
        verdict: sc?.verdict ?? null,
        startedAt: sc?.startedAt ?? null,
        completedAt: sc?.completedAt ?? null,
      },
    });
  }

  if (req.method === 'POST') {
    const analysis = getAnalysis(analysisId);
    if (!analysis) return sendJson(res, 404, { error: 'analysis not found' });
    const repo = (req.body?.repo as string) || repoName;
    const provider = req.body?.provider as string;
    const model = (req.body?.model as string) || '';
    if (!repo || !provider) return sendJson(res, 400, { error: 'repo and provider are required' });

    runRepoAnalysis(analysisId, repo, analysis.username, provider, model, {
      description: req.body?.description ?? null,
      language: req.body?.language ?? null,
      stargazers_count: req.body?.stars ?? 0,
      topics: req.body?.topics ?? [],
    });
    return sendJson(res, 200, { status: 'started' });
  }

  return sendJson(res, 405, { error: 'method not allowed' });
}

export default repoHandler;
