import { faker } from '@faker-js/faker';
import { requireSession } from './helpers';
import { getSession, createSession } from '../db/sessions';
import { resetDbForTests } from '../db/database';

beforeEach(() => resetDbForTests());

describe('requireSession', () => {
  it('creates a session when the ID is unknown', () => {
    const id = faker.string.uuid();
    expect(getSession(id)).toBeUndefined();
    const result = requireSession(id);
    expect(result).toBe(id);
    const session = getSession(id);
    expect(session).toBeDefined();
    expect(session!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('extends an expired session', () => {
    const id = faker.string.uuid();
    createSession(id, Date.now() - 1000);
    const before = getSession(id);
    expect(before).toBeDefined();
    expect(before!.expiresAt).toBeLessThan(Date.now());
    const result = requireSession(id);
    expect(result).toBe(id);
    const after = getSession(id);
    expect(after!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('returns existing valid session without changing expiry', () => {
    const id = faker.string.uuid();
    const expiry = Date.now() + 12 * 60 * 60 * 1000;
    createSession(id, expiry);
    const before = getSession(id);
    const result = requireSession(id);
    expect(result).toBe(id);
    const after = getSession(id);
    expect(after!.expiresAt).toBe(before!.expiresAt);
  });
});
