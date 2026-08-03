import type { ProviderId } from '@repo/shared';
import type { LLMProvider } from './provider';
import { GeminiProvider } from './gemini';
import { GroqProvider } from './groq';
import { OpenRouterProvider } from './openrouter';
import { NvcfProvider } from './nvcf';
import { OpenCodeProvider } from './opencode';

export const providers: LLMProvider[] = [
  new GeminiProvider(),
  new GroqProvider(),
  new OpenRouterProvider(),
  new NvcfProvider(),
  new OpenCodeProvider(),
];

export function getProvider(id: ProviderId): LLMProvider {
  const found = providers.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown provider: ${id}`);
  return found;
}
