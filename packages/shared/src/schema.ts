import { z } from 'zod';
import { PROVIDER_IDS } from './types';

export const DimensionSchema = z.object({
  key: z.enum(['code_quality', 'languages', 'contribution', 'project_depth', 'oss_experience']),
  label: z.string(),
  score: z.number().int().min(1).max(10),
});

export const TopRepoSchema = z.object({
  name: z.string(),
  stars: z.number().int().min(0),
  description: z.string(),
  reason: z.string(),
});

export const VerdictSchema = z.object({
  leaning: z.enum(['hire', 'no_hire', 'uncertain']),
  summary: z.string(),
});

export const ScorecardSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  model: z.string().nullable().default(null),
  status: z.enum(['pending', 'running', 'succeeded', 'failed']),
  progress: z.number().int().min(0).max(100),
  startedAt: z.string().nullable(),
  lastUpdated: z.string(),
  completedAt: z.string().nullable(),
  dimensions: z.array(DimensionSchema).length(5),
  top_repos: z.array(TopRepoSchema),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  verdict: VerdictSchema,
});

export const AnalysisSummarySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  username: z.string(),
  status: z.enum(['running', 'succeeded', 'failed']),
  error: z.string().nullable(),
  createdAt: z.string(),
  providers: z.array(ScorecardSchema),
});
