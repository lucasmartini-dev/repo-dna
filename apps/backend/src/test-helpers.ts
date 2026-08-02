import type { NextApiRequest, NextApiResponse } from 'next';

type MockRes = NextApiResponse & { _getJSON: () => unknown; _payload?: unknown };

export function createMockReqRes(): {
  req: NextApiRequest;
  res: NextApiResponse & { _getJSON: () => unknown };
} {
  const res = {
    statusCode: 200,
    _payload: undefined,
    status(this: MockRes, code: number) {
      this.statusCode = code;
      return this;
    },
    json(this: MockRes, payload: unknown) {
      this._payload = payload;
      return this;
    },
    end(this: MockRes) {
      return this;
    },
    _getJSON(this: MockRes) {
      return this._payload;
    },
  } as unknown as MockRes;
  return { req: {} as NextApiRequest, res };
}
