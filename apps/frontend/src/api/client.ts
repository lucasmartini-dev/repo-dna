import type { AnalysisSummary, Scorecard } from '@repo/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(path, init);
  const body = (await res.json().catch(() => null)) as T | null;
  return { status: res.status, body: body as T };
}

export async function createSession(): Promise<{ sessionId: string; expiresAt: number }> {
  const { status, body } = await request<{ sessionId: string; expiresAt: number }>('/api/session', { method: 'POST' });
  if (status !== 201) throw new ApiError('failed to create session', status);
  return body;
}

export interface StartAnalysisResult {
  status: number;
  analysisId?: string;
  username?: string;
  shared?: boolean;
  error?: string;
}

export async function startAnalysis(username: string, sessionId: string): Promise<StartAnalysisResult> {
  const { status, body } = await request<StartAnalysisResult>('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
    body: JSON.stringify({ username }),
  });
  return { ...body, status };
}

export async function fetchLatestAnalysis(sessionId: string): Promise<AnalysisSummary | null> {
  const { status, body } = await request<{ analysis: AnalysisSummary | null }>(
    `/api/analysis?sessionId=${encodeURIComponent(sessionId)}`,
    {
      headers: { 'X-Session-Id': sessionId },
    }
  );
  if (status === 401) return null;
  return body?.analysis ?? null;
}

export async function fetchAnalysis(id: string): Promise<AnalysisSummary | null> {
  const { status, body } = await request<{ analysis: AnalysisSummary | null }>(`/api/analysis/${id}`);
  if (status !== 200) return null;
  return body?.analysis ?? null;
}

export async function fetchReport(id: string): Promise<{ analysis: AnalysisSummary; scorecards: Scorecard[] }> {
  const { status, body } = await request<{ analysis: AnalysisSummary; scorecards: Scorecard[] }>(
    `/api/analysis/${id}/report`
  );
  if (status !== 200) throw new ApiError(body ? 'analysis still running' : 'failed to fetch report', status);
  return body;
}

export interface RetryResult {
  status: number;
  shared?: boolean;
  retryAfterSeconds?: number;
}

export async function retryProvider(id: string, sessionId: string, provider: string): Promise<RetryResult> {
  const { status, body } = await request<RetryResult>(`/api/analysis/${id}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
    body: JSON.stringify({ sessionId, provider }),
  });
  return { ...body, status };
}
