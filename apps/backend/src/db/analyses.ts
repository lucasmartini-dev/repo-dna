import { getDb, type AnalysisRow } from './database';

export function createAnalysis(id: string, sessionId: string, username: string): void {
  getDb()
    .prepare(
      "INSERT INTO analyses (id, session_id, username, status, error, created_at) VALUES (?, ?, ?, 'running', NULL, ?)"
    )
    .run(id, sessionId, username, Date.now());
}

export function getAnalysis(id: string): AnalysisRow | undefined {
  const row = getDb()
    .prepare(
      'SELECT id, session_id AS sessionId, username, status, error, created_at AS createdAt FROM analyses WHERE id = ?'
    )
    .get(id);
  return row as AnalysisRow | undefined;
}

export function getLatestAnalysisForSession(sessionId: string): AnalysisRow | undefined {
  const row = getDb()
    .prepare(
      'SELECT id, session_id AS sessionId, username, status, error, created_at AS createdAt FROM analyses WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
    )
    .get(sessionId);
  return row as AnalysisRow | undefined;
}

export function getRunningAnalysisForUsername(username: string, excludeSessionId?: string): AnalysisRow | undefined {
  const row = getDb()
    .prepare(
      "SELECT id, session_id AS sessionId, username, status, error, created_at AS createdAt FROM analyses WHERE username = ? AND status = 'running'" +
        (excludeSessionId ? ' AND session_id != ?' : '')
    )
    .get(...(excludeSessionId ? [username, excludeSessionId] : [username]));
  return row as AnalysisRow | undefined;
}

export function hasRunningAnalysisForSession(sessionId: string): boolean {
  const row = getDb()
    .prepare("SELECT id FROM analyses WHERE session_id = ? AND status = 'running' LIMIT 1")
    .get(sessionId);
  return !!row;
}

export function updateAnalysisStatus(id: string, status: AnalysisRow['status'], error: string | null = null): void {
  getDb().prepare('UPDATE analyses SET status = ?, error = ? WHERE id = ?').run(status, error, id);
}
