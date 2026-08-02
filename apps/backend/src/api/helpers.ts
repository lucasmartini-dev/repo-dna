import type { NextApiResponse } from 'next';
import { getSession, createSession } from '../db/sessions';

export function sendJson(res: NextApiResponse, status: number, payload: unknown): void {
  res.status(status).json(payload);
}

export function requireSession(sessionId: string): string | null {
  let session = getSession(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    createSession(sessionId, Date.now() + 12 * 60 * 60 * 1000);
    session = getSession(sessionId);
  }
  return session?.id ?? null;
}

export function getHeader(
  req: { headers: Record<string, string | string[] | undefined> },
  name: string
): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}
