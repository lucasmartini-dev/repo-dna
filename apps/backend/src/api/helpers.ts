import type { NextApiResponse } from 'next';
import { getSession } from '../db/sessions';

export function sendJson(res: NextApiResponse, status: number, payload: unknown): void {
  res.status(status).json(payload);
}

export function requireSession(sessionId: string): string | null {
  const session = getSession(sessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) return null;
  return session.id;
}

export function getHeader(
  req: { headers: Record<string, string | string[] | undefined> },
  name: string
): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}
