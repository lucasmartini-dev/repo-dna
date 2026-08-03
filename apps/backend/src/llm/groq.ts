import type { AnalyzeContext, LLMProvider } from './provider';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import { parseScorecardJson } from './json';

const API = 'https://api.groq.com/openai/v1/chat/completions';

export class GroqProvider implements LLMProvider {
  id = 'groq' as const;
  displayName = 'Groq';
  async analyze(ctx: AnalyzeContext, model: string): Promise<ReturnType<typeof parseScorecardJson>> {
    ctx.onProgress(20);
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('GROQ_API_KEY is not set');
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(ctx.snapshot) },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`Groq API ${res.status}`);
    ctx.onProgress(70);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('Groq returned empty response');
    const scorecard = parseScorecardJson(text, this.id);
    ctx.onProgress(100);
    return scorecard;
  }
  async analyzeCustomPrompt(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('GROQ_API_KEY is not set');
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`Groq API ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? '';
  }
}
