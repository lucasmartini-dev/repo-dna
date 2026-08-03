import type { ProviderId, Scorecard } from '@repo/shared';
import type { GitHubSnapshot } from '../github/types';

export interface AnalyzeContext {
  snapshot: GitHubSnapshot;
  onProgress: (progress: number) => void;
}

export interface LLMProvider {
  id: ProviderId;
  displayName: string;
  analyze(ctx: AnalyzeContext, model: string): Promise<Scorecard>;
  analyzeCustomPrompt(systemPrompt: string, userPrompt: string, model: string): Promise<string>;
}
