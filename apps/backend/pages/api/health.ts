import type { NextApiRequest, NextApiResponse } from 'next';

export async function healthHandler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ ok: true });
}

export default healthHandler;
