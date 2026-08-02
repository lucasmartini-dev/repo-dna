import type { ProviderId } from '@repo/shared';
import type { LLMProvider } from './provider';
import { GeminiProvider } from './gemini';
import { GroqProvider } from './groq';
import { OpenRouterProvider } from './openrouter';

export const providers: LLMProvider[] = [new GeminiProvider(), new GroqProvider(), new OpenRouterProvider()];

export function getProvider(id: ProviderId): LLMProvider {
  const found = providers.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown provider: ${id}`);
  return found;
}
