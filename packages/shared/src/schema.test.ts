import { describe, expect, it } from 'vitest';
import { faker } from '@faker-js/faker';
import { ScorecardSchema } from './index';

const validScorecard = {
  provider: 'gemini',
  status: 'succeeded',
  progress: 100,
  startedAt: '2026-01-01T00:00:00.000Z',
  lastUpdated: '2026-01-01T00:00:05.000Z',
  completedAt: '2026-01-01T00:00:05.000Z',
  dimensions: [
    { key: 'code_quality', label: 'Code Quality', score: 8 },
    { key: 'languages', label: 'Languages', score: 7 },
    { key: 'contribution', label: 'Contribution Activity', score: 6 },
    { key: 'project_depth', label: 'Project Depth', score: 9 },
    { key: 'oss_experience', label: 'Open Source Experience', score: 7 },
  ],
  top_repos: [
    {
      name: faker.internet.domainWord(),
      stars: faker.number.int({ min: 1, max: 999 }),
      description: faker.lorem.sentence(),
      reason: faker.lorem.sentence(),
    },
  ],
  strengths: [faker.lorem.word()],
  gaps: [faker.lorem.word()],
  verdict: { leaning: 'hire', summary: faker.lorem.sentence() },
};

describe('ScorecardSchema', () => {
  it('accepts a valid scorecard', () => {
    const parsed = ScorecardSchema.safeParse(validScorecard);
    expect(parsed.success).toBe(true);
  });

  it('rejects an out-of-range dimension score', () => {
    const bad = { ...validScorecard, dimensions: [{ ...validScorecard.dimensions[0], score: 11 }] };
    expect(ScorecardSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an invalid provider id', () => {
    const bad = { ...validScorecard, provider: 'anthropic' };
    expect(ScorecardSchema.safeParse(bad).success).toBe(false);
  });
});
