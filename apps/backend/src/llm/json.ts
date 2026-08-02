import { ScorecardSchema, type ProviderId, type Scorecard } from '@repo/shared';

export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) return candidate;
  return candidate.slice(start, end + 1);
}

export class ScorecardParseError extends Error {
  constructor(
    message: string,
    public raw: string
  ) {
    super(message);
    this.name = 'ScorecardParseError';
  }
}

export function parseScorecardJson(raw: string, provider: ProviderId): Scorecard {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new ScorecardParseError('Invalid JSON from provider', raw);
  }
  const result = ScorecardSchema.safeParse({
    ...(parsed as Record<string, unknown>),
    provider,
    status: 'succeeded',
    progress: 100,
  });
  if (!result.success) {
    throw new ScorecardParseError(`Schema validation failed: ${result.error.message}`, raw);
  }
  return result.data;
}
