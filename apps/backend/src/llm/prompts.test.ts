import { extractJson, parseScorecardJson } from './json';

describe('extractJson', () => {
  it('strips markdown fences', () => {
    const text = '```json\n{"a": 1}\n```';
    expect(extractJson(text)).toBe('{"a": 1}');
  });
});

describe('parseScorecardJson', () => {
  it('parses and validates a full scorecard', () => {
    const raw = JSON.stringify({
      provider: 'gemini',
      status: 'succeeded',
      progress: 100,
      startedAt: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:00.000Z',
      dimensions: [
        { key: 'code_quality', label: 'Code Quality', score: 8 },
        { key: 'languages', label: 'Languages', score: 7 },
        { key: 'contribution', label: 'Contribution Activity', score: 6 },
        { key: 'project_depth', label: 'Project Depth', score: 9 },
        { key: 'oss_experience', label: 'Open Source Experience', score: 7 },
      ],
      top_repos: [],
      strengths: ['x'],
      gaps: ['y'],
      verdict: { leaning: 'hire', summary: 'ok' },
    });
    const scorecard = parseScorecardJson(raw, 'gemini');
    expect(scorecard.provider).toBe('gemini');
    expect(scorecard.dimensions).toHaveLength(5);
  });

  it('throws on invalid input', () => {
    expect(() => parseScorecardJson('{"provider":"gemini"}', 'gemini')).toThrow();
  });
});
