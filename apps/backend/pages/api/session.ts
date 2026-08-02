import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { createSession } from '../../src/db/sessions';
import { sendJson } from '../../src/api/helpers';

export async function sessionHandler(_req: NextApiRequest, res: NextApiResponse) {
  const sessionId = randomUUID();
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  createSession(sessionId, expiresAt);
  sendJson(res, 201, { sessionId, expiresAt });
}

export default sessionHandler;
