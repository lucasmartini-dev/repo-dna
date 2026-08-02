import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export interface SessionRow {
  id: string;
  createdAt: number;
  expiresAt: number;
}

export interface AnalysisRow {
  id: string;
  sessionId: string;
  username: string;
  status: 'running' | 'succeeded' | 'failed';
  error: string | null;
  createdAt: number;
}

export interface ProviderRow {
  analysisId: string;
  provider: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  progress: number;
  startedAt: number | null;
  lastUpdated: number;
  completedAt: number | null;
  lastAttemptAt: number | null;
  scorecard: string | null;
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const path = process.env.DB_PATH || 'data/app.db';
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      username TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE TABLE IF NOT EXISTS providers (
      analysis_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER,
      last_updated INTEGER NOT NULL,
      completed_at INTEGER,
      last_attempt_at INTEGER,
      scorecard TEXT,
      PRIMARY KEY (analysis_id, provider)
    );
    CREATE INDEX IF NOT EXISTS idx_analyses_session ON analyses(session_id);
    CREATE INDEX IF NOT EXISTS idx_analyses_username ON analyses(username);
  `);
  return db;
}

export function resetDbForTests(): void {
  if (process.env.DB_PATH !== ':memory:') return;
  const d = getDb();
  d.exec('DROP TABLE IF EXISTS providers; DROP TABLE IF EXISTS analyses; DROP TABLE IF EXISTS sessions;');
  db = null;
}
