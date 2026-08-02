import { getDb } from './database';

export function createSession(id: string, expiresAt: number): void {
  getDb().prepare('INSERT INTO sessions (id, created_at, expires_at) VALUES (?, ?, ?)').run(id, Date.now(), expiresAt);
}

export function getSession(id: string) {
  return getDb()
    .prepare('SELECT id, created_at AS createdAt, expires_at AS expiresAt FROM sessions WHERE id = ?')
    .get(id) as { id: string; createdAt: number; expiresAt: number } | undefined;
}

export function deleteExpiredSessions(now: number): number {
  return getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(now).changes;
}
