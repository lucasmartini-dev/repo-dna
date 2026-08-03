import { extractJson, parseScorecardJson, ScorecardParseError } from './json';

const minimalScorecard = {
  dimensions: [
    { key: 'code_quality', label: 'Code Quality', score: 5 },
    { key: 'languages', label: 'Languages', score: 5 },
    { key: 'contribution', label: 'Contribution', score: 5 },
    { key: 'project_depth', label: 'Project Depth', score: 5 },
    { key: 'oss_experience', label: 'Open Source Experience', score: 5 },
    { key: 'seniority', label: 'Seniority Level', score: 5 },
  ],
  top_repos: [{ name: 'repo', stars: 1, description: 'desc', reason: 'reason' }],
  strengths: ['strength'],
  gaps: ['gap'],
  verdict: { leaning: 'hire', summary: 'summary' },
};

describe('extractJson', () => {
  it('strips markdown fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('returns plain JSON as-is', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
});

describe('parseScorecardJson', () => {
  it('adds tracking fields to provider output', () => {
    const result = parseScorecardJson(JSON.stringify(minimalScorecard), 'groq');
    expect(result.provider).toBe('groq');
    expect(result.status).toBe('succeeded');
    expect(result.progress).toBe(100);
    expect(result.startedAt).toBeNull();
    expect(result.completedAt).not.toBeNull();
    expect(result.lastUpdated).not.toBeNull();
    expect(result.dimensions).toHaveLength(6);
  });

  it('overwrites provider/status/progress from parsed json', () => {
    const raw = JSON.stringify({ ...minimalScorecard, provider: 'openrouter', status: 'failed', progress: 50 });
    const result = parseScorecardJson(raw, 'groq');
    expect(result.provider).toBe('groq');
    expect(result.status).toBe('succeeded');
    expect(result.progress).toBe(100);
  });

  it('throws ScorecardParseError for invalid JSON', () => {
    expect(() => parseScorecardJson('not json', 'groq')).toThrow(ScorecardParseError);
  });

  it('throws ScorecardParseError for schema validation failure', () => {
    expect(() => parseScorecardJson(JSON.stringify({ dimensions: [] }), 'groq')).toThrow(ScorecardParseError);
  });
});
