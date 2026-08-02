import { getDb, type ProviderRow } from './database';

export function createProviderRows(analysisId: string, providerIds: readonly string[]): void {
  const insert = getDb().prepare(
    "INSERT INTO providers (analysis_id, provider, status, progress, last_updated) VALUES (?, ?, 'pending', 0, ?)"
  );
  const now = Date.now();
  const tx = getDb().transaction(() => {
    for (const p of providerIds) insert.run(analysisId, p, now);
  });
  tx();
}

export function getProviderRows(analysisId: string): ProviderRow[] {
  return getDb()
    .prepare(
      'SELECT analysis_id AS analysisId, provider, status, progress, started_at AS startedAt, last_updated AS lastUpdated, completed_at AS completedAt, last_attempt_at AS lastAttemptAt, scorecard FROM providers WHERE analysis_id = ? ORDER BY provider'
    )
    .all(analysisId) as ProviderRow[];
}

export function getProviderRow(analysisId: string, provider: string): ProviderRow | undefined {
  return getDb()
    .prepare(
      'SELECT analysis_id AS analysisId, provider, status, progress, started_at AS startedAt, last_updated AS lastUpdated, completed_at AS completedAt, last_attempt_at AS lastAttemptAt, scorecard FROM providers WHERE analysis_id = ? AND provider = ?'
    )
    .get(analysisId, provider) as ProviderRow | undefined;
}

export function updateProvider(
  analysisId: string,
  provider: string,
  patch: Partial<Pick<ProviderRow, 'status' | 'progress' | 'startedAt' | 'completedAt' | 'scorecard'>>
): void {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.status !== undefined) {
    sets.push('status = ?');
    values.push(patch.status);
  }
  if (patch.progress !== undefined) {
    sets.push('progress = ?');
    values.push(patch.progress);
  }
  if (patch.startedAt !== undefined) {
    sets.push('started_at = ?');
    values.push(patch.startedAt);
  }
  if (patch.completedAt !== undefined) {
    sets.push('completed_at = ?');
    values.push(patch.completedAt);
  }
  if (patch.scorecard !== undefined) {
    sets.push('scorecard = ?');
    values.push(patch.scorecard);
  }
  sets.push('last_updated = ?');
  values.push(Date.now(), analysisId, provider);
  getDb()
    .prepare(`UPDATE providers SET ${sets.join(', ')} WHERE analysis_id = ? AND provider = ?`)
    .run(...values);
}

export function touchProviderAttempt(analysisId: string, provider: string, now: number): void {
  getDb()
    .prepare('UPDATE providers SET last_attempt_at = ?, last_updated = ? WHERE analysis_id = ? AND provider = ?')
    .run(now, now, analysisId, provider);
}
