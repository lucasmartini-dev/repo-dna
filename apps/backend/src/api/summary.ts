import { ScorecardSchema, type AnalysisSummary } from '@repo/shared';
import type { AnalysisRow } from '../db/database';
import type { ProviderRow } from '../db/database';

export function toAnalysisSummary(analysis: AnalysisRow, rows: ProviderRow[]): AnalysisSummary {
  return {
    id: analysis.id,
    sessionId: analysis.sessionId,
    username: analysis.username,
    status: analysis.status,
    error: analysis.error,
    createdAt: new Date(analysis.createdAt).toISOString(),
    providers: rows.map((r) => {
      if (r.scorecard) {
        try {
          return ScorecardSchema.parse({
            ...JSON.parse(r.scorecard),
            model: r.model,
            status: r.status,
            progress: r.progress,
            lastUpdated: new Date(r.lastUpdated).toISOString(),
          });
        } catch {
          // fall through to blank
        }
      }
      return {
        provider: r.provider as never,
        model: r.model,
        status: r.status,
        progress: r.progress,
        startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
        lastUpdated: new Date(r.lastUpdated).toISOString(),
        completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
        dimensions: [],
        top_repos: [],
        strengths: [],
        gaps: [],
        verdict: { leaning: 'uncertain' as const, summary: '' },
      };
    }),
  };
}
