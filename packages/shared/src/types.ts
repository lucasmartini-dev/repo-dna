export type ProviderId = 'gemini' | 'groq' | 'openrouter' | 'nvcf';
export type ProviderStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type VerdictLeaning = 'hire' | 'no_hire' | 'uncertain';
export type AnalysisStatus = 'running' | 'succeeded' | 'failed';

export interface ModelOption {
  id: string;
  displayName: string;
  free: boolean;
}

export const PROVIDER_MODELS: Record<ProviderId, ModelOption[]> = {
  gemini: [
    { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash (free)', free: true },
    { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', free: false },
  ],
  groq: [{ id: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B Instant', free: false }],
  openrouter: [
    { id: 'google/gemma-4-31b-it:free', displayName: 'Gemma 4 31B (free)', free: true },
    { id: 'google/gemini-2.0-flash-001:free', displayName: 'Gemini 2.0 Flash (free)', free: true },
  ],
  nvcf: [{ id: 'meta/llama-3.1-8b-instruct', displayName: 'Llama 3.1 8B Instruct', free: false }],
};

export interface Dimension {
  key: 'code_quality' | 'languages' | 'contribution' | 'project_depth' | 'oss_experience' | 'seniority';
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
  model: string | null;
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

export const PROVIDER_IDS = ['gemini', 'groq', 'openrouter', 'nvcf'] as const;

export const DIMENSION_DEFS: Array<{ key: Dimension['key']; label: string }> = [
  { key: 'code_quality', label: 'Code Quality' },
  { key: 'languages', label: 'Languages' },
  { key: 'contribution', label: 'Contribution Activity' },
  { key: 'project_depth', label: 'Project Depth' },
  { key: 'oss_experience', label: 'Open Source Experience' },
  { key: 'seniority', label: 'Seniority Level' },
];
