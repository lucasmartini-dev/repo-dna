import type { AnalysisStatus, ProviderId, ProviderStatus } from '@repo/shared';

export type AnalysisEvent =
  | {
      type: 'provider-update';
      analysisId: string;
      provider: ProviderId;
      status: ProviderStatus;
      progress: number;
      lastUpdated: string;
    }
  | { type: 'final'; analysisId: string; status: AnalysisStatus; error?: string };

export type EventSink = (event: AnalysisEvent) => void;
