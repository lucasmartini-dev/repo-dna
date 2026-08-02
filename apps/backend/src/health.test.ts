import { healthHandler } from '../pages/api/health';
import { createMockReqRes } from './test-helpers';

describe('healthHandler', () => {
  it('returns ok true', async () => {
    const { req, res } = createMockReqRes();
    await healthHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res._getJSON()).toEqual({ ok: true });
  });
});
