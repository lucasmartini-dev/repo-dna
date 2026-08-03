import { getDb, type RepoAnalysisRow } from './database';

export function createRepoAnalysis(
  id: string,
  analysisId: string,
  repoName: string,
  username: string,
  provider: string,
  model: string | null
): void {
  getDb()
    .prepare(
      "INSERT INTO repo_analyses (id, analysis_id, repo_name, username, provider, model, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)"
    )
    .run(id, analysisId, repoName, username, provider, model, Date.now());
}

export function getLatestRepoAnalysis(analysisId: string, repoName: string): RepoAnalysisRow | undefined {
  return getDb()
    .prepare(
      'SELECT id, analysis_id AS analysisId, repo_name AS repoName, username, provider, model, status, error, scorecard, created_at AS createdAt FROM repo_analyses WHERE analysis_id = ? AND repo_name = ? ORDER BY created_at DESC LIMIT 1'
    )
    .get(analysisId, repoName) as RepoAnalysisRow | undefined;
}

export function updateRepoAnalysis(
  id: string,
  patch: Partial<Pick<RepoAnalysisRow, 'status' | 'error' | 'scorecard'>>
): void {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.status !== undefined) {
    sets.push('status = ?');
    values.push(patch.status);
  }
  if (patch.error !== undefined) {
    sets.push('error = ?');
    values.push(patch.error);
  }
  if (patch.scorecard !== undefined) {
    sets.push('scorecard = ?');
    values.push(patch.scorecard);
  }
  values.push(id);
  getDb()
    .prepare(`UPDATE repo_analyses SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);
}
