import type { AnalyzeContext, LLMProvider } from './provider';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import { parseScorecardJson } from './json';

const API = 'https://api.opencode.ai/v1/chat/completions';

export class OpenCodeProvider implements LLMProvider {
  id = 'opencode' as const;
  displayName = 'OpenCode';
  async analyze(ctx: AnalyzeContext, model: string): Promise<ReturnType<typeof parseScorecardJson>> {
    ctx.onProgress(20);
    const key = process.env.OPENCODE_API_KEY;
    if (!key) throw new Error('OPENCODE_API_KEY is not set');
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(ctx.snapshot) },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`OpenCode API ${res.status}`);
    ctx.onProgress(70);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('OpenCode returned empty response');
    const scorecard = parseScorecardJson(text, this.id);
    ctx.onProgress(100);
    return scorecard;
  }
}
