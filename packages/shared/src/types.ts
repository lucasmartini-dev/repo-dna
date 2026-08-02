export type ProviderId = 'gemini' | 'groq' | 'openrouter';
export type ProviderStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type VerdictLeaning = 'hire' | 'no_hire' | 'uncertain';
export type AnalysisStatus = 'running' | 'succeeded' | 'failed';

export interface Dimension {
  key: 'code_quality' | 'languages' | 'contribution' | 'project_depth' | 'oss_experience';
  label: string;
  score: number;
}

export interface TopRepo {
  name: string;
  stars: number;
  description: string;
  reason: string;
}

export interface Verdict {
  leaning: VerdictLeaning;
  summary: string;
}

export interface Scorecard {
  provider: ProviderId;
  status: ProviderStatus;
  progress: number;
  startedAt: string | null;
  lastUpdated: string;
  completedAt: string | null;
  dimensions: Dimension[];
  top_repos: TopRepo[];
  strengths: string[];
  gaps: string[];
  verdict: Verdict;
}

export interface AnalysisSummary {
  id: string;
  sessionId: string;
  username: string;
  status: AnalysisStatus;
  error: string | null;
  createdAt: string;
  providers: Scorecard[];
}

export const PROVIDER_IDS = ['gemini', 'groq', 'openrouter'] as const;

export const DIMENSION_DEFS: Array<{ key: Dimension['key']; label: string }> = [
  { key: 'code_quality', label: 'Code Quality' },
  { key: 'languages', label: 'Languages' },
  { key: 'contribution', label: 'Contribution Activity' },
  { key: 'project_depth', label: 'Project Depth' },
  { key: 'oss_experience', label: 'Open Source Experience' },
];
