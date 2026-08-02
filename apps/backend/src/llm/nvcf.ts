import type { AnalyzeContext, LLMProvider } from './provider';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import { parseScorecardJson } from './json';

const API = 'https://integrate.api.nvidia.com/v1/chat/completions';

export class NvcfProvider implements LLMProvider {
  id = 'nvcf' as const;
  displayName = 'NVIDIA NVCF';
  async analyze(ctx: AnalyzeContext): Promise<ReturnType<typeof parseScorecardJson>> {
    ctx.onProgress(20);
    const key = process.env.NVCF_API_KEY;
    if (!key) throw new Error('NVCF_API_KEY is not set');
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'meta/llama-3.1-8b-instruct',
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(ctx.snapshot) },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`NVIDIA API ${res.status}`);
    ctx.onProgress(70);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('NVIDIA returned empty response');
    const scorecard = parseScorecardJson(text, this.id);
    ctx.onProgress(100);
    return scorecard;
  }
}
