# Provider Models, Navigation & UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-provider model selection, new OpenCode provider, staggered analysis start, semantic color palette, breadcrumb navigation, and model/timestamp display on provider cards.

**Architecture:** Shared types define model options; backend accepts `models` map in analyze payload, stores `model` in DB, passes it to each provider's `analyze()` call. Runner starts providers staggered (3000ms + 1000ms increments) for animated WebSocket UX. Frontend renders model dropdowns per provider, breadcrumb header, and enhanced provider cards with semantic colors.

**Tech Stack:** TypeScript, Vue 3 + Pinia, Next.js, better-sqlite3, Vitest, Jest

## Global Constraints

- Node >=20.0.0 (enforced by `engines`, `.nvmrc`, `engine-strict=true`)
- Provider models live in `packages/shared/src/types.ts` as `PROVIDER_MODELS`
- Free tier models: `gemini-2.0-flash`, `meta-llama/llama-3.1-8b-instruct:free` (OpenRouter), `deepseek-v4-flash` (OpenCode)
- Paid models kept for Groq and NVCF (user provides own key)
- Staggered start: 3000ms before first provider, +1000ms per subsequent provider
- Semantic colors via CSS custom properties in `apps/frontend/src/styles/colors.css`
- `startedAt` formatted as `MMM DD, YYYY at HH:mm:ss`
- All new files: no emojis, no comments, follow existing patterns

---

### Task 1: Shared types — ProviderId, ModelOption, PROVIDER_MODELS, Scorecard.model

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/schema.ts`

**Interfaces:**
- Produces: `ProviderId` includes `'opencode'`, `ModelOption` interface, `PROVIDER_MODELS: Record<ProviderId, ModelOption[]>`, `PROVIDER_IDS` includes `'opencode'`, `Scorecard.model: string | null`
- Produces: `ScorecardSchema` gains `model: z.string().nullable()`

- [ ] **Step 1: Update types.ts**

Edit `packages/shared/src/types.ts` — replace the `ProviderId` type, add `ModelOption`, add `PROVIDER_MODELS`, update `PROVIDER_IDS`, add `model` to `Scorecard`:

```ts
export type ProviderId = 'gemini' | 'groq' | 'openrouter' | 'nvcf' | 'opencode';
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
    { id: 'meta-llama/llama-3.1-8b-instruct:free', displayName: 'Llama 3.1 8B (free)', free: true },
    { id: 'google/gemini-2.0-flash-001:free', displayName: 'Gemini 2.0 Flash (free)', free: true },
  ],
  nvcf: [{ id: 'meta/llama-3.1-8b-instruct', displayName: 'Llama 3.1 8B Instruct', free: false }],
  opencode: [{ id: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash (free)', free: true }],
};

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

export const PROVIDER_IDS = ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'] as const;

export const DIMENSION_DEFS: Array<{ key: Dimension['key']; label: string }> = [
  { key: 'code_quality', label: 'Code Quality' },
  { key: 'languages', label: 'Languages' },
  { key: 'contribution', label: 'Contribution Activity' },
  { key: 'project_depth', label: 'Project Depth' },
  { key: 'oss_experience', label: 'Open Source Experience' },
];
```

- [ ] **Step 2: Update schema.ts**

Edit `packages/shared/src/schema.ts` — add `model` to `ScorecardSchema`:

```ts
export const ScorecardSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  model: z.string().nullable(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed']),
  progress: z.number().int().min(0).max(100),
  startedAt: z.string().nullable(),
  lastUpdated: z.string(),
  completedAt: z.string().nullable(),
  dimensions: z.array(DimensionSchema).length(5),
  top_repos: z.array(TopRepoSchema),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  verdict: VerdictSchema,
});
```

- [ ] **Step 3: Run shared tests to verify types compile**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run test:shared
```

Expected: 3 tests pass (schema test updated if needed — check `shared/src/schema.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/schema.ts
git commit -m "feat: add model selection types, OpenCode provider id, and model field to Scorecard"
```

---

### Task 2: Database — add `model` column to providers table

**Files:**
- Modify: `apps/backend/src/db/database.ts`

**Interfaces:**
- Consumes: `ProviderId` from shared types (Task 1)
- Produces: `ProviderRow.model: string | null`, `providers` table has `model TEXT` column

- [ ] **Step 1: Add `model` column migration logic**

Edit `apps/backend/src/db/database.ts` — add migration code in `getDb()` before the `return db;` line (after the `CREATE INDEX` statements). Also add `model` to `ProviderRow`:

In the `ProviderRow` interface, add:

```ts
export interface ProviderRow {
  analysisId: string;
  provider: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  progress: number;
  startedAt: number | null;
  lastUpdated: number;
  completedAt: number | null;
  lastAttemptAt: number | null;
  scorecard: string | null;
  model: string | null;
}
```

In `getDb()`, after the `CREATE INDEX` statements, add migration logic:

```ts
const columns = db.pragma('table_info(providers)') as Array<{ name: string }>;
if (!columns.some((c) => c.name === 'model')) {
  db.exec('ALTER TABLE providers ADD COLUMN model TEXT');
}
```

- [ ] **Step 2: Run backend tests**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run test:backend
```

Expected: 33 tests pass (database migration adds column, tests unaffected since `model` defaults to NULL).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/db/database.ts
git commit -m "feat: add model column to providers table with migration"
```

---

### Task 3: Provider DB functions — accept and return `model`

**Files:**
- Modify: `apps/backend/src/db/providers.ts`

**Interfaces:**
- Consumes: `ProviderRow` with `model` (Task 2)
- Produces: `createProviderRows` accepts `models` map, `updateProvider` accepts `model` in patch, `getProviderRows`/`getProviderRow` return `model`

- [ ] **Step 1: Update createProviderRows**

Edit `apps/backend/src/db/providers.ts` — change `createProviderRows` to accept a `models: Record<string, string>` parameter and insert `model`:

```ts
export function createProviderRows(analysisId: string, providerIds: readonly string[], models: Record<string, string>): void {
  const insert = getDb().prepare(
    "INSERT INTO providers (analysis_id, provider, status, progress, last_updated, model) VALUES (?, ?, 'pending', 0, ?, ?)"
  );
  const now = Date.now();
  const tx = getDb().transaction(() => {
    for (const p of providerIds) insert.run(analysisId, p, now, models[p] ?? null);
  });
  tx();
}
```

- [ ] **Step 2: Update getProviderRows and getProviderRow**

Add `model` to the SELECT in both functions:

In `getProviderRows`:
```ts
'SELECT analysis_id AS analysisId, provider, status, progress, started_at AS startedAt, last_updated AS lastUpdated, completed_at AS completedAt, last_attempt_at AS lastAttemptAt, scorecard, model FROM providers WHERE analysis_id = ? ORDER BY provider'
```

In `getProviderRow`:
```ts
'SELECT analysis_id AS analysisId, provider, status, progress, started_at AS startedAt, last_updated AS lastUpdated, completed_at AS completedAt, last_attempt_at AS lastAttemptAt, scorecard, model FROM providers WHERE analysis_id = ? AND provider = ?'
```

- [ ] **Step 3: Update updateProvider**

Add `model` to the patch type and update logic:

```ts
export function updateProvider(
  analysisId: string,
  provider: string,
  patch: Partial<Pick<ProviderRow, 'status' | 'progress' | 'startedAt' | 'completedAt' | 'scorecard' | 'model'>>
): void {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.status !== undefined) { sets.push('status = ?'); values.push(patch.status); }
  if (patch.progress !== undefined) { sets.push('progress = ?'); values.push(patch.progress); }
  if (patch.startedAt !== undefined) { sets.push('started_at = ?'); values.push(patch.startedAt); }
  if (patch.completedAt !== undefined) { sets.push('completed_at = ?'); values.push(patch.completedAt); }
  if (patch.scorecard !== undefined) { sets.push('scorecard = ?'); values.push(patch.scorecard); }
  if (patch.model !== undefined) { sets.push('model = ?'); values.push(patch.model); }
  sets.push('last_updated = ?');
  values.push(Date.now(), analysisId, provider);
  getDb()
    .prepare(`UPDATE providers SET ${sets.join(', ')} WHERE analysis_id = ? AND provider = ?`)
    .run(...values);
}
```

- [ ] **Step 4: Update DB test**

Edit `apps/backend/src/db/database.test.ts` — update `createProviderRows` calls to pass `models`, and add assertions for `model`:

In the `providers` describe block, update `createProviderRows(a1, PROVIDER_IDS)` to `createProviderRows(a1, PROVIDER_IDS as unknown as string[], { gemini: 'gemini-2.0-flash', groq: 'llama-3.1-8b-instant', openrouter: 'meta-llama/llama-3.1-8b-instruct:free', nvcf: 'meta/llama-3.1-8b-instruct', opencode: 'deepseek-v4-flash' })`.

Add after the first test's `expect(rows).toHaveLength(4)`:
```ts
expect(rows[0].model).toBe('gemini-2.0-flash');
```

Add after the `updateProvider` call, a test for setting model:
```ts
updateProvider(a1, 'gemini', { model: 'gemini-2.5-flash' });
expect(getProviderRow(a1, 'gemini')?.model).toBe('gemini-2.5-flash');
```

- [ ] **Step 5: Run backend tests**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run test:backend
```

Expected: 33 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/providers.ts apps/backend/src/db/database.test.ts
git commit -m "feat: store and expose model column in provider db functions"
```

---

### Task 4: LLMProvider interface — add `model` parameter

**Files:**
- Modify: `apps/backend/src/llm/provider.ts`

**Interfaces:**
- Produces: `AnalyzeContext` unchanged, `LLMProvider.analyze(ctx, model)` with `model: string` parameter

- [ ] **Step 1: Update interface**

Edit `apps/backend/src/llm/provider.ts`:

```ts
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
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/llm/provider.ts
git commit -m "feat: add model parameter to LLMProvider.analyze interface"
```

---

### Task 5: Create OpenCode provider

**Files:**
- Create: `apps/backend/src/llm/opencode.ts`

**Interfaces:**
- Consumes: `LLMProvider` interface (Task 4)
- Produces: `OpenCodeProvider` class implementing `LLMProvider`

- [ ] **Step 1: Write OpenCode provider**

Create `apps/backend/src/llm/opencode.ts`:

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/llm/opencode.ts
git commit -m "feat: add OpenCode LLM provider"
```

---

### Task 6: Register OpenCode + update all providers to use `model` parameter

**Files:**
- Modify: `apps/backend/src/llm/index.ts`
- Modify: `apps/backend/src/llm/gemini.ts`
- Modify: `apps/backend/src/llm/groq.ts`
- Modify: `apps/backend/src/llm/openrouter.ts`
- Modify: `apps/backend/src/llm/nvcf.ts`

**Interfaces:**
- Consumes: `OpenCodeProvider` (Task 5), `LLMProvider.analyze` with `model` (Task 4)
- Produces: All providers accept `model` parameter and use it in API body; `getProvider` returns `LLMProvider` for `'opencode'`

- [ ] **Step 1: Update index.ts**

Edit `apps/backend/src/llm/index.ts` — add import and array entry:

```ts
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
```

- [ ] **Step 2: Update gemini.ts**

Edit `apps/backend/src/llm/gemini.ts` — change `const API = '...'` to use dynamic model in URL, and change `analyze` signature:

```ts
import type { AnalyzeContext, LLMProvider } from './provider';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import { parseScorecardJson } from './json';

export class GeminiProvider implements LLMProvider {
  id = 'gemini' as const;
  displayName = 'Gemini';
  async analyze(ctx: AnalyzeContext, model: string): Promise<ReturnType<typeof parseScorecardJson>> {
    ctx.onProgress(20);
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY is not set');
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
          contents: [{ parts: [{ text: buildUserPrompt(ctx.snapshot) }] }],
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini API ${res.status}`);
    ctx.onProgress(70);
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) throw new Error('Gemini returned empty response');
    const scorecard = parseScorecardJson(text, this.id);
    ctx.onProgress(100);
    return scorecard;
  }
}
```

- [ ] **Step 3: Update groq.ts**

Edit `apps/backend/src/llm/groq.ts` — change `model: 'llama-3.1-8b-instant'` to `model`:

```ts
async analyze(ctx: AnalyzeContext, model: string): Promise<ReturnType<typeof parseScorecardJson>> {
  // ...
  body: JSON.stringify({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(ctx.snapshot) },
    ],
    temperature: 0.2,
  }),
  // ...
}
```

- [ ] **Step 4: Update openrouter.ts**

Edit `apps/backend/src/llm/openrouter.ts` — same pattern, use `model` parameter:

```ts
async analyze(ctx: AnalyzeContext, model: string): Promise<ReturnType<typeof parseScorecardJson>> {
  // ...
  body: JSON.stringify({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(ctx.snapshot) },
    ],
    temperature: 0.2,
  }),
  // ...
}
```

- [ ] **Step 5: Update nvcf.ts**

Edit `apps/backend/src/llm/nvcf.ts` — same pattern:

```ts
async analyze(ctx: AnalyzeContext, model: string): Promise<ReturnType<typeof parseScorecardJson>> {
  // ...
  body: JSON.stringify({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(ctx.snapshot) },
    ],
    temperature: 0.2,
  }),
  // ...
}
```

- [ ] **Step 6: Update providers.test.ts**

Edit `apps/backend/src/llm/providers.test.ts`:

```ts
import { providers, getProvider } from './index';

describe('providers', () => {
  it('exposes exactly the five providers', () => {
    expect(providers.map((p) => p.id).sort()).toEqual(['gemini', 'groq', 'nvcf', 'opencode', 'openrouter']);
  });
  it('getProvider returns a provider by id', () => {
    expect(getProvider('gemini').id).toBe('gemini');
    expect(() => getProvider('x' as never)).toThrow();
  });
});
```

- [ ] **Step 7: Run backend tests**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run test:backend
```

Expected: 33 tests pass (providers test now checks 5 providers).

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/llm/
git commit -m "feat: add model param to all providers, register OpenCode"
```

---

### Task 7: Runner — staggered start and model passing

**Files:**
- Modify: `apps/backend/src/analysis/runner.ts`
- Modify: `apps/backend/src/api/router.ts`

**Interfaces:**
- Consumes: `LLMProvider.analyze(ctx, model)` (Task 4), provider DB functions (Task 3)
- Produces: `runProviders` accepts `models: Record<string, string>`, starts providers staggered, sets `model` on DB row at start

- [ ] **Step 1: Update runner.ts**

Edit `apps/backend/src/analysis/runner.ts` — complete rewrite of `runProviders` and update `runAnalysis`:

```ts
import { getProviderRows, updateProvider, touchProviderAttempt } from '../db/providers';
import { updateAnalysisStatus } from '../db/analyses';
import { fetchGitHubData } from '../github/client';
import { GitHubFetchError } from '../github/types';
import type { GitHubSnapshot } from '../github/types';
import type { LLMProvider } from '../llm/provider';
import { getProvider } from '../llm';
import type { EventSink } from './types';

type ProviderFactory = (id: string) => LLMProvider;

async function runSingleProvider(
  analysisId: string,
  snapshot: GitHubSnapshot,
  pid: string,
  modelId: string,
  factory: ProviderFactory,
  sink: EventSink
): Promise<void> {
  try {
    const now = Date.now();
    touchProviderAttempt(analysisId, pid, now);
    updateProvider(analysisId, pid, { status: 'running', startedAt: now, model: modelId });
    sink({
      type: 'provider-update',
      analysisId,
      provider: pid as never,
      status: 'running',
      progress: 0,
      lastUpdated: new Date().toISOString(),
    });
    const provider = factory(pid);
    const scorecard = await provider.analyze(
      { snapshot, onProgress: (progress) => {
        updateProvider(analysisId, pid, { progress });
        sink({
          type: 'provider-update',
          analysisId,
          provider: pid as never,
          status: 'running',
          progress,
          lastUpdated: new Date().toISOString(),
        });
      }},
      modelId,
    );
    updateProvider(analysisId, pid, {
      status: 'succeeded',
      progress: 100,
      completedAt: Date.now(),
      scorecard: JSON.stringify(scorecard),
    });
    sink({
      type: 'provider-update',
      analysisId,
      provider: pid as never,
      status: 'succeeded',
      progress: 100,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[provider ${pid}] failed for analysis ${analysisId}: ${msg}`);
    updateProvider(analysisId, pid, { status: 'failed', completedAt: Date.now() });
    sink({
      type: 'provider-update',
      analysisId,
      provider: pid as never,
      status: 'failed',
      progress: getProviderRows(analysisId).find((r) => r.provider === pid)?.progress ?? 0,
      lastUpdated: new Date().toISOString(),
    });
  }
}

export async function runProviders(
  analysisId: string,
  snapshot: GitHubSnapshot,
  providerIds: string[],
  models: Record<string, string>,
  factory: ProviderFactory,
  sink: EventSink
): Promise<void> {
  const FIRST_START_DELAY = 3000;
  const INTER_START_DELAY = 1000;

  const promises = providerIds.map((pid, i) => {
    const delay = FIRST_START_DELAY + i * INTER_START_DELAY;
    const modelId = models[pid] ?? PROVIDER_MODELS[pid as ProviderId]?.[0]?.id ?? '';
    return new Promise<void>((resolve) => setTimeout(resolve, delay)).then(() =>
      runSingleProvider(analysisId, snapshot, pid, modelId, factory, sink)
    );
  });

  await Promise.all(promises);

  const rows = getProviderRows(analysisId);
  const anySucceeded = rows.some((r) => r.status === 'succeeded');
  const anyFailed = rows.some((r) => r.status === 'failed');
  const status = anySucceeded && !anyFailed ? 'succeeded' : 'failed';
  const error = status === 'failed' ? (rows.find((r) => r.status === 'failed')?.provider ?? 'unknown') : null;
  updateAnalysisStatus(analysisId, status, error ? `Provider ${error} failed` : null);
  sink({ type: 'final', analysisId, status, error: error ? `Provider ${error} failed` : undefined });
}

export async function runAnalysis(analysisId: string, username: string, models: Record<string, string>, sink: EventSink): Promise<void> {
  try {
    const snapshot = await fetchGitHubData(username);
    sink({
      type: 'provider-update',
      analysisId,
      provider: 'gemini',
      status: 'running',
      progress: 5,
      lastUpdated: new Date().toISOString(),
    });
    await runProviders(
      analysisId,
      snapshot,
      ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'],
      models,
      (id) => getProvider(id as never),
      sink
    );
  } catch (err) {
    const msg =
      err instanceof GitHubFetchError ? `GitHub error ${err.status}: ${err.message}` : `Analysis error: ${String(err)}`;
    updateAnalysisStatus(analysisId, 'failed', msg);
    for (const pid of ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode']) {
      updateProvider(analysisId, pid, { status: 'failed', completedAt: Date.now() });
    }
    sink({ type: 'final', analysisId, status: 'failed', error: msg });
  }
}
```

Note: Add import for `ProviderId` and `PROVIDER_MODELS` from `@repo/shared` at the top:

```ts
import type { ProviderId } from '@repo/shared';
import { PROVIDER_MODELS } from '@repo/shared';
```

- [ ] **Step 2: Update router.ts**

Edit `apps/backend/src/api/router.ts`:

```ts
import { wsHub } from '../ws/hub';
import { runAnalysis } from '../analysis/runner';

export function startAnalysisAsync(analysisId: string, username: string, models: Record<string, string>): void {
  runAnalysis(analysisId, username, models, (event) => {
    if (event.type === 'provider-update') wsHub.publish(event.analysisId, event);
    if (event.type === 'final') wsHub.publish(event.analysisId, event);
  });
}
```

- [ ] **Step 3: Update runner.test.ts**

Edit `apps/backend/src/analysis/runner.test.ts` — update all `runProviders` calls to pass `models` dict, update `makeScorecard` to include `model`, update `makeProvider` signature, add staggered test:

In `makeScorecard`:
```ts
function makeScorecard(provider: ProviderId): Scorecard {
  const dims = ['code_quality', 'languages', 'contribution', 'project_depth', 'oss_experience'].map(
    (key, i) => ({ key, label: key, score: 10 - i }) as Scorecard['dimensions'][number]
  );
  return {
    provider,
    model: 'test-model',
    status: 'succeeded',
    progress: 100,
    startedAt: null,
    lastUpdated: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    dimensions: dims,
    top_repos: [],
    strengths: [faker.lorem.word()],
    gaps: [],
    verdict: { leaning: 'hire', summary: faker.lorem.sentence() },
  };
}
```

In `makeProvider`:
```ts
function makeProvider(id: string, fail = false): LLMProvider {
  return {
    id: id as ProviderId,
    displayName: id,
    async analyze(ctx, _model) {
      ctx.onProgress(50);
      if (fail) throw new Error('boom');
      return makeScorecard(id as ProviderId);
    },
  };
}
```

Add import for `ProviderId`:
```ts
import type { ProviderId } from '@repo/shared';
```

Update the `runProviders` call in the first test (`'marks each provider succeeded'`):
```ts
await runProviders(analysisId, snapshot, ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'], {
  gemini: 'gemini-2.0-flash', groq: 'llama-3.1-8b-instant', openrouter: 'meta-llama/llama-3.1-8b-instruct:free', nvcf: 'meta/llama-3.1-8b-instruct', opencode: 'deepseek-v4-flash',
}, makeProvider, (e) => events.push(e));
```

Update `createProviderRows` call to pass `models`:
```ts
createProviderRows(analysisId, ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'], {
  gemini: 'gemini-2.0-flash', groq: 'llama-3.1-8b-instant', openrouter: 'meta-llama/llama-3.1-8b-instruct:free', nvcf: 'meta/llama-3.1-8b-instruct', opencode: 'deepseek-v4-flash',
});
```

Update the second test similarly with the `models` dict.

Add a new test for staggered start:
```ts
it('starts providers with staggered delays', async () => {
  vi.useFakeTimers();
  try {
    createSession(sessionId, 1_700_000_000_000 + 43_200_000);
    createAnalysis(analysisId, sessionId, username);
    createProviderRows(analysisId, ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'], {
      gemini: 'g1', groq: 'g2', openrouter: 'g3', nvcf: 'g4', opencode: 'g5',
    });

    const events: unknown[] = [];
    const promise = runProviders(analysisId, snapshot, ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'], {
      gemini: 'g1', groq: 'g2', openrouter: 'g3', nvcf: 'g4', opencode: 'g5',
    }, makeProvider, (e) => events.push(e));

    const runningUpdates = () => events.filter((e) => (e as { status: string }).status === 'running');
    expect(runningUpdates()).toHaveLength(0);
    vi.advanceTimersByTime(3000);
    expect(runningUpdates()).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(runningUpdates()).toHaveLength(2);
    vi.advanceTimersByTime(4000);
    await vi.runAllTimersAsync();
    await promise;
    expect(events.some((e) => (e as { type: string }).type === 'final')).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
```

Add `vi` import:
```ts
import { vi } from 'vitest';
```

Wait — the backend uses Jest, not Vitest. Use `jest.useFakeTimers()` and `jest.advanceTimersByTime` instead. And use `jest` global:

```ts
it('starts providers with staggered delays', async () => {
  jest.useFakeTimers();
  try {
    createSession(sessionId, 1_700_000_000_000 + 43_200_000);
    createAnalysis(analysisId, sessionId, username);
    createProviderRows(analysisId, ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'], {
      gemini: 'g1', groq: 'g2', openrouter: 'g3', nvcf: 'g4', opencode: 'g5',
    });

    const events: unknown[] = [];
    const promise = runProviders(analysisId, snapshot, ['gemini', 'groq', 'openrouter', 'nvcf', 'opencode'], {
      gemini: 'g1', groq: 'g2', openrouter: 'g3', nvcf: 'g4', opencode: 'g5',
    }, makeProvider, (e) => events.push(e));

    const runningUpdates = () => events.filter((e) => (e as { status: string }).status === 'running');
    expect(runningUpdates()).toHaveLength(0);
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    expect(runningUpdates()).toHaveLength(1);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(runningUpdates()).toHaveLength(2);
    jest.advanceTimersByTime(4000);
    await jest.runAllTimersAsync();
    await promise;
    expect(events.some((e) => (e as { type: string }).type === 'final')).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});
```

- [ ] **Step 4: Run backend tests**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run test:backend
```

Expected: 34 tests pass (one new staggered test).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/analysis/runner.ts apps/backend/src/api/router.ts apps/backend/src/analysis/runner.test.ts
git commit -m "feat: staggered provider start with model passing in runner"
```

---

### Task 8: Analyze route — accept `models` in request body

**Files:**
- Modify: `apps/backend/pages/api/analyze.ts`
- Modify: `apps/backend/src/api/routes.test.ts`

**Interfaces:**
- Consumes: `createProviderRows` with `models` (Task 3), `startAnalysisAsync` with `models` (Task 7)
- Produces: `POST /api/analyze` accepts `{ username, models }`, passes to DB and runner

- [ ] **Step 1: Update analyze.ts**

Edit `apps/backend/pages/api/analyze.ts`:

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { requireSession, sendJson, getHeader } from '../../src/api/helpers';
import { createAnalysis, getRunningAnalysisForUsername, hasRunningAnalysisForSession } from '../../src/db/analyses';
import { createProviderRows } from '../../src/db/providers';
import { PROVIDER_IDS } from '@repo/shared';
import { startAnalysisAsync } from '../../src/api/router';

export async function analyzeHandler(req: NextApiRequest, res: NextApiResponse) {
  const sessionId = getHeader(req, 'x-session-id');
  const username = req.body?.username as string | undefined;
  const models = (req.body?.models as Record<string, string>) ?? {};
  if (!sessionId) return sendJson(res, 401, { error: 'missing session' });
  if (!requireSession(sessionId)) return sendJson(res, 401, { error: 'invalid or expired session' });
  if (!username) return sendJson(res, 400, { error: 'username is required' });

  if (hasRunningAnalysisForSession(sessionId)) {
    return sendJson(res, 409, { error: 'an analysis is already running for this session' });
  }

  const existing = getRunningAnalysisForUsername(username, sessionId);
  if (existing) {
    return sendJson(res, 200, { analysisId: existing.id, username, shared: true });
  }

  const analysisId = randomUUID();
  createAnalysis(analysisId, sessionId, username);
  createProviderRows(analysisId, PROVIDER_IDS as unknown as string[], models);
  startAnalysisAsync(analysisId, username, models);
  sendJson(res, 201, { analysisId, username, shared: false });
}

export default analyzeHandler;
```

- [ ] **Step 2: Update routes.test.ts**

Edit `apps/backend/src/api/routes.test.ts` — update the `analyze` tests to pass `models` in body:

In the `'creates session and starts analysis for unknown session'` test:
```ts
req.body = { username, models: {} };
```

In the `'returns 201 for a new analysis'` test:
```ts
req.body = { username, models: { gemini: 'gemini-2.0-flash' } };
```

In the `'returns 409'` test:
```ts
req.body = { username, models: {} };
```

Add a new test:
```ts
it('passes models to createProviderRows and startAnalysisAsync', async () => {
  const { startAnalysisAsync: mockStart } = jest.requireMock('../../src/api/router');
  createSession(sessionId, Date.now() + 43_200_000);
  const { req, res } = createMockReqRes();
  const models = { gemini: 'gemini-2.0-flash', groq: 'llama-3.1-8b-instant' };
  req.body = { username, models };
  req.headers = { 'x-session-id': sessionId };
  await analyzeHandler(req, res);
  expect(res.statusCode).toBe(201);
  const body = res._getJSON() as { analysisId: string };
  expect(mockStart).toHaveBeenCalledWith(body.analysisId, username, models);
});
```

- [ ] **Step 3: Run backend tests**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run test:backend
```

Expected: 35 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/pages/api/analyze.ts apps/backend/src/api/routes.test.ts
git commit -m "feat: accept models in POST /api/analyze body"
```

---

### Task 9: Summary — map `model` field in API responses

**Files:**
- Modify: `apps/backend/src/api/summary.ts`
- Modify: `apps/backend/server.ts`

**Interfaces:**
- Consumes: `ProviderRow.model` from Task 2
- Produces: `toAnalysisSummary` returns `model` on each provider scorecard

- [ ] **Step 1: Update summary.ts**

Edit `apps/backend/src/api/summary.ts` — add `model` to both scorecard construction paths:

In the `ScorecardSchema.parse` branch, the parsed scorecard should include `model` from the row. In the fallback branch:

```ts
import { ScorecardSchema, type AnalysisSummary } from '@repo/shared';
import type { AnalysisRow } from '../db/database';
import type { ProviderRow } from '../db/database';

export function toAnalysisSummary(analysis: AnalysisRow, rows: ProviderRow[]): AnalysisSummary {
  return {
    id: analysis.id,
    sessionId: analysis.sessionId,
    username: analysis.username,
    status: analysis.status,
    error: analysis.error,
    createdAt: new Date(analysis.createdAt).toISOString(),
    providers: rows.map((r) => {
      if (r.scorecard) {
        try {
          return ScorecardSchema.parse({
            ...JSON.parse(r.scorecard),
            model: r.model,
            status: r.status,
            progress: r.progress,
            lastUpdated: new Date(r.lastUpdated).toISOString(),
          });
        } catch {
          // fall through to blank
        }
      }
      return {
        provider: r.provider as never,
        model: r.model,
        status: r.status,
        progress: r.progress,
        startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
        lastUpdated: new Date(r.lastUpdated).toISOString(),
        completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
        dimensions: [],
        top_repos: [],
        strengths: [],
        gaps: [],
        verdict: { leaning: 'uncertain' as const, summary: '' },
      };
    }),
  };
}
```

- [ ] **Step 2: Update server.ts**

Edit `apps/backend/server.ts` — in `buildStateSnapshot`, add `model` to the mapped provider:

```ts
function buildStateSnapshot(analysisId: string) {
  const analysis = getAnalysis(analysisId);
  if (!analysis) return { providers: [], status: 'failed' };
  const providers = getProviderRows(analysisId).map((row) => {
    const scorecard = row.scorecard ? JSON.parse(row.scorecard) : null;
    return {
      provider: row.provider,
      model: row.model,
      status: row.status,
      progress: row.progress,
      lastUpdated: new Date(row.lastUpdated).toISOString(),
      scorecard: scorecard ? ScorecardSchema.parse(scorecard) : null,
    };
  });
  return { status: analysis.status, error: analysis.error, username: analysis.username, providers };
}
```

- [ ] **Step 3: Run backend tests**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run test:backend
```

Expected: 35 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/api/summary.ts apps/backend/server.ts
git commit -m "feat: expose model field in analysis summary and ws state snapshot"
```

---

### Task 10: Frontend — semantic color palette

**Files:**
- Create: `apps/frontend/src/styles/colors.css`
- Modify: `apps/frontend/src/main.ts` (or wherever global CSS is imported)

**Interfaces:**
- Produces: CSS custom properties for semantic colors, imported globally

- [ ] **Step 1: Find global CSS entry point**

Check if there's a `main.ts` or `main.js` and how styles are imported.

- [ ] **Step 2: Create colors.css**

Create `apps/frontend/src/styles/colors.css`:

```css
:root {
  --color-primary: #8B5CF6;
  --color-secondary: #FF6B81;
  --color-positive: #44D7A8;
  --color-information: #3F51B5;
  --color-ai: #38BDF8;
  --color-warning: #FBBF24;
  --color-destructive: #E67C73;
  --color-bg: #f5f5f5;
  --color-surface: #ffffff;
  --color-text: #1a1a1a;
  --color-text-muted: #666666;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
}
```

- [ ] **Step 3: Import in main.ts**

Edit `apps/frontend/src/main.ts` — add import at top:

```ts
import './styles/colors.css';
```

- [ ] **Step 4: Run frontend tests**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run test:frontend
```

Expected: 30 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/styles/colors.css apps/frontend/src/main.ts
git commit -m "feat: add semantic color palette as CSS custom properties"
```

---

### Task 11: Frontend — SiteHeader breadcrumb component

**Files:**
- Create: `apps/frontend/src/components/SiteHeader.vue`
- Create: `apps/frontend/src/components/SiteHeader.test.ts`
- Modify: `apps/frontend/src/App.vue`

**Interfaces:**
- Consumes: `vue-router` route, `useAnalysisStore` for username
- Produces: Breadcrumb navigation bar at top of every page

- [ ] **Step 1: Create SiteHeader.vue**

Create `apps/frontend/src/components/SiteHeader.vue`:

```vue
<template>
  <header class="site-header">
    <div class="header-inner">
      <span class="logo">GH Analyzer</span>
      <nav class="breadcrumbs">
        <router-link to="/">Home</router-link>
        <template v-if="showAnalysis">
          <span class="sep">></span>
          <router-link to="/analysis">Analysis: {{ username }}</router-link>
        </template>
        <template v-if="showReport">
          <span class="sep">></span>
          <span class="current">Report</span>
        </template>
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAnalysisStore } from '../stores/analysis';

const route = useRoute();
const store = useAnalysisStore();

const showAnalysis = computed(() => route.path.startsWith('/analysis') || route.path.startsWith('/report'));
const showReport = computed(() => route.path.startsWith('/report'));
const username = computed(() => store.username ?? '');
</script>

<style scoped>
.site-header {
  background: var(--color-primary);
  color: #fff;
  padding: 12px 24px;
}

.header-inner {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo {
  font-weight: 700;
  font-size: 16px;
}

.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.breadcrumbs a {
  color: var(--color-ai);
  text-decoration: none;
}

.breadcrumbs a:hover {
  text-decoration: underline;
}

.sep {
  color: rgba(255, 255, 255, 0.5);
}

.current {
  color: rgba(255, 255, 255, 0.7);
}
</style>
```

- [ ] **Step 2: Update App.vue**

Edit `apps/frontend/src/App.vue`:

```vue
<template>
  <SiteHeader />
  <router-view />
</template>

<script setup lang="ts">
import SiteHeader from './components/SiteHeader.vue';
</script>
```

- [ ] **Step 3: Create SiteHeader.test.ts**

Create `apps/frontend/src/components/SiteHeader.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SiteHeader from './SiteHeader.vue';
import { useAnalysisStore } from '../stores/analysis';

let mockPath = '/';

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: mockPath }),
  RouterLink: { template: '<a><slot /></a>' },
}));

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  mockPath = '/';
});

describe('SiteHeader', () => {
  it('shows only Home on root path', () => {
    const wrapper = mount(SiteHeader);
    expect(wrapper.text()).toContain('Home');
    expect(wrapper.text()).not.toContain('Analysis');
  });

  it('shows Home > Analysis: username on analysis path', () => {
    mockPath = '/analysis';
    const store = useAnalysisStore();
    store.username = 'octocat';
    const wrapper = mount(SiteHeader);
    expect(wrapper.text()).toContain('Analysis: octocat');
  });

  it('shows Home > Analysis > Report on report path', () => {
    mockPath = '/report/123';
    const store = useAnalysisStore();
    store.username = 'octocat';
    const wrapper = mount(SiteHeader);
    expect(wrapper.text()).toContain('Report');
  });
});
```

- [ ] **Step 4: Run frontend tests**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run test:frontend
```

Expected: 33 tests pass (30 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/SiteHeader.vue apps/frontend/src/components/SiteHeader.test.ts apps/frontend/src/App.vue
git commit -m "feat: add breadcrumb header navigation"
```

---

### Task 12: Frontend — HomeView model dropdowns

**Files:**
- Modify: `apps/frontend/src/pages/HomeView.vue`
- Modify: `apps/frontend/src/pages/HomeView.test.ts`

**Interfaces:**
- Consumes: `PROVIDER_MODELS` from shared, `useAnalysisStore.start(username, models)`
- Produces: Per-provider dropdowns before analyzing, defaulting to first model

- [ ] **Step 1: Update store to accept models**

Edit `apps/frontend/src/stores/analysis.ts` — update `start` signature:

```ts
async function start(input: string, models: Record<string, string> = {}): Promise<'started' | 'shared' | 'conflict' | 'error'> {
  const session = useSessionStore();
  const sessionId = session.ensureSession();
  const result = await startAnalysis(input, sessionId, models);
  // ... rest unchanged
```
*(Only the function signature and the `startAnalysis` call need the `models` param added.)*

- [ ] **Step 2: Update client.ts**

Edit `apps/frontend/src/api/client.ts` — update `startAnalysis`:

```ts
export async function startAnalysis(username: string, sessionId: string, models: Record<string, string> = {}): Promise<StartAnalysisResult> {
  const { status, body } = await request<StartAnalysisResult>('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
    body: JSON.stringify({ username, models }),
  });
  return { ...body, status };
}
```

- [ ] **Step 3: Update HomeView.vue**

Edit `apps/frontend/src/pages/HomeView.vue` — add model dropdowns:

```vue
<template>
  <div class="home">
    <h1>GitHub Profile Analyzer</h1>
    <input v-model="link" data-test="link-input" placeholder="https://github.com/username" @keyup.enter="onAnalyze" />
    <button class="primary" data-test="analyze" :disabled="busy" @click="onAnalyze">Analyze</button>

    <div v-if="candidate" class="model-select">
      <h3>Choose models for {{ candidate }}</h3>
      <div v-for="pid in providerIds" :key="pid" class="model-row">
        <label>{{ pid }}</label>
        <select v-model="selectedModels[pid]" data-test="model-select">
          <option v-for="m in PROVIDER_MODELS[pid]" :key="m.id" :value="m.id">
            {{ m.displayName }}
          </option>
        </select>
      </div>
      <button class="primary" data-test="confirm-models" @click="onConfirm">Start Analysis</button>
    </div>

    <p v-if="error" class="error" data-test="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { parseGithubUrl } from '../utils/githubUrl';
import { useAnalysisStore } from '../stores/analysis';
import { PROVIDER_MODELS, PROVIDER_IDS, type ProviderId } from '@repo/shared';

const router = useRouter();
const store = useAnalysisStore();
const link = ref('');
const candidate = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);
const providerIds = PROVIDER_IDS as unknown as ProviderId[];
const selectedModels = reactive<Record<string, string>>(
  Object.fromEntries(providerIds.map((pid) => [pid, PROVIDER_MODELS[pid][0]?.id ?? '']))
);

function onAnalyze(): void {
  const parsed = parseGithubUrl(link.value);
  if (!parsed) {
    error.value = 'That link looks invalid. Enter a GitHub profile URL like https://github.com/username';
    candidate.value = null;
    return;
  }
  error.value = null;
  candidate.value = parsed.username;
}

async function onConfirm(): Promise<void> {
  const username = candidate.value;
  candidate.value = null;
  if (!username) return;
  busy.value = true;
  const result = await store.start(username, { ...selectedModels });
  busy.value = false;
  if (result === 'conflict') {
    error.value = 'An analysis is already running — wait for it to finish before starting another.';
    return;
  }
  if (result === 'error') {
    error.value = 'Your session expired. Please reload the page.';
    return;
  }
  router.push('/analysis');
}
</script>

<style scoped>
.home {
  max-width: 640px;
  margin: 80px auto;
  text-align: center;
}
input {
  width: 100%;
  padding: 12px;
  font-size: 16px;
}
button.primary {
  margin-top: 12px;
  padding: 12px 24px;
}
.error {
  color: var(--color-destructive);
}
.model-select {
  margin-top: 24px;
}
.model-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 8px 0;
}
.model-row select {
  padding: 6px 12px;
  font-size: 14px;
}
</style>
```

- [ ] **Step 4: Update HomeView.test.ts**

Edit `apps/frontend/src/pages/HomeView.test.ts` — update the third test to select models and confirm:

```ts
it('shows model dropdowns after valid link and starts analysis', async () => {
  vi.spyOn(client, 'startAnalysis').mockResolvedValue({ status: 201, analysisId, username, shared: false });
  vi.spyOn(client, 'fetchAnalysis').mockResolvedValue({
    id: analysisId,
    sessionId,
    username,
    status: 'running',
    error: null,
    createdAt: new Date().toISOString(),
    providers: [],
  } as never);
  const store = useAnalysisStore();
  const wrapper = mount(HomeView);
  await wrapper.find('input').setValue(`https://github.com/${username}`);
  await wrapper.find('button.primary').trigger('click');
  expect(wrapper.text()).toContain('Choose models');
  const selects = wrapper.findAll('select');
  expect(selects.length).toBeGreaterThanOrEqual(4);
  await wrapper.find('[data-test="confirm-models"]').trigger('click');
  await vi.waitFor(() => expect(store.analysisId).toBe(analysisId));
});
```

- [ ] **Step 5: Run frontend tests**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run test:frontend
```

Expected: 33 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/HomeView.vue apps/frontend/src/pages/HomeView.test.ts apps/frontend/src/api/client.ts apps/frontend/src/stores/analysis.ts
git commit -m "feat: add per-provider model dropdowns on HomeView"
```

---

### Task 13: Frontend — ProviderCard enhancements (startedAt, model, semantic colors)

**Files:**
- Modify: `apps/frontend/src/components/ProviderCard.vue`
- Create: `apps/frontend/src/components/ProviderCard.test.ts`

**Interfaces:**
- Consumes: `Scorecard.model`, `Scorecard.startedAt`, `PROVIDER_MODELS` from shared
- Produces: Enhanced card showing model name, formatted startedAt, status-based colors

- [ ] **Step 1: Create ProviderCard.test.ts**

Create `apps/frontend/src/components/ProviderCard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ProviderCard from './ProviderCard.vue';

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    status: 'running',
    progress: 50,
    startedAt: '2026-01-15T14:30:22.000Z',
    lastUpdated: '2026-01-15T14:30:30.000Z',
    completedAt: null,
    dimensions: [],
    top_repos: [],
    strengths: [],
    gaps: [],
    verdict: { leaning: 'uncertain', summary: '' },
    ...overrides,
  };
}

describe('ProviderCard', () => {
  it('shows model display name when model is set', () => {
    const wrapper = mount(ProviderCard, { props: { card: makeCard(), cooldownRemaining: 0 } });
    expect(wrapper.text()).toContain('Gemini 2.0 Flash (free)');
  });

  it('shows startedAt formatted', () => {
    const wrapper = mount(ProviderCard, { props: { card: makeCard(), cooldownRemaining: 0 } });
    expect(wrapper.text()).toContain('Jan 15, 2026 at 14:30:22');
  });

  it('hides model and startedAt when null', () => {
    const wrapper = mount(ProviderCard, {
      props: { card: makeCard({ model: null, startedAt: null }), cooldownRemaining: 0 },
    });
    expect(wrapper.text()).not.toContain('Model:');
    expect(wrapper.text()).not.toContain('Started:');
  });

  it('uses pending color for pending status', () => {
    const wrapper = mount(ProviderCard, {
      props: { card: makeCard({ status: 'pending' }), cooldownRemaining: 0 },
    });
    expect(wrapper.find('.provider-card').attributes('data-status')).toBe('pending');
  });

  it('emits retry on retry button click', async () => {
    const wrapper = mount(ProviderCard, {
      props: { card: makeCard({ status: 'failed' }), cooldownRemaining: 0 },
    });
    await wrapper.find('button.retry').trigger('click');
    expect(wrapper.emitted('retry')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Update ProviderCard.vue**

Edit `apps/frontend/src/components/ProviderCard.vue`:

```vue
<template>
  <div class="provider-card" :data-status="card.status">
    <div class="provider-header">
      <div>
        <span class="provider-name">{{ card.provider }}</span>
        <span v-if="card.model" class="model-badge">{{ modelDisplayName }}</span>
      </div>
      <span class="provider-status">{{ card.status }}</span>
    </div>
    <div v-if="card.startedAt" class="meta-row">Started: {{ formattedStartedAt }}</div>
    <template v-if="card.status === 'pending' || card.status === 'running'">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: card.progress + '%' }" />
      </div>
      <span class="meta">progress: {{ card.progress }}% · updated {{ card.lastUpdated }}</span>
    </template>
    <template v-else-if="card.status === 'failed'">
      <span class="meta">Analysis failed</span>
      <button class="retry" data-test="retry" :disabled="cooldownRemaining > 0" @click="$emit('retry')">
        Retry{{ cooldownRemaining > 0 ? ` (${cooldownRemaining}s)` : '' }}
      </button>
    </template>
    <template v-else>
      <button class="view-scorecard" data-test="view-scorecard" @click="$emit('view-scorecard')">View scorecard</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Scorecard } from '@repo/shared';
import { PROVIDER_MODELS } from '@repo/shared';

const props = defineProps<{ card: Scorecard; cooldownRemaining: number }>();
defineEmits<{ (e: 'retry'): void; (e: 'view-scorecard'): void }>();

const modelDisplayName = computed(() => {
  if (!props.card.model || !props.card.provider) return null;
  const models = PROVIDER_MODELS[props.card.provider];
  if (!models) return props.card.model;
  return models.find((m) => m.id === props.card.model)?.displayName ?? props.card.model;
});

const formattedStartedAt = computed(() => {
  if (!props.card.startedAt) return null;
  const d = new Date(props.card.startedAt);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const mins = String(d.getUTCMinutes()).padStart(2, '0');
  const secs = String(d.getUTCSeconds()).padStart(2, '0');
  return `${month} ${day}, ${year} at ${hours}:${mins}:${secs}`;
});
</script>

<style scoped>
.provider-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
  background: var(--color-surface);
}

.provider-card[data-status="running"] {
  border-color: var(--color-primary);
}

.provider-card[data-status="succeeded"] {
  border-color: var(--color-positive);
}

.provider-card[data-status="failed"] {
  border-color: var(--color-destructive);
}

.provider-card[data-status="pending"] {
  border-color: var(--color-warning);
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.provider-name {
  font-weight: 600;
  text-transform: capitalize;
}

.model-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 11px;
  background: var(--color-ai);
  color: #fff;
  border-radius: 10px;
}

.meta-row {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 4px;
}

.progress-bar {
  height: 8px;
  background: #eee;
  border-radius: 4px;
  margin: 8px 0;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 4px;
  transition: width 0.3s;
}

.meta {
  color: var(--color-text-muted);
  font-size: 12px;
}

.retry {
  margin-top: 8px;
  padding: 6px 16px;
  background: var(--color-destructive);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.view-scorecard {
  margin-top: 8px;
  padding: 6px 16px;
  background: var(--color-information);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>
```

- [ ] **Step 3: Run frontend tests**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run test:frontend
```

Expected: 38 tests pass (33 + 5 new ProviderCard tests).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/ProviderCard.vue apps/frontend/src/components/ProviderCard.test.ts
git commit -m "feat: show model, startedAt, and semantic colors on provider cards"
```

---

### Task 14: Frontend — Update analysis store test for models

**Files:**
- Modify: `apps/frontend/src/stores/analysis.test.ts`

**Interfaces:**
- Consumes: `startAnalysis` with `models` param (Task 12)
- Produces: Tests pass with new signature

- [ ] **Step 1: Update tests for models signature**

Edit `apps/frontend/src/stores/analysis.test.ts` — update `mockResolvedValue` calls to include `startAnalysis` with 3 args. Since vi.mock overrides the function signature, the mock should accept any args:

The mock is: `vi.spyOn(client, 'startAnalysis').mockResolvedValue(...)` — this already returns the value regardless of args, so no change needed. Just verify tests pass.

- [ ] **Step 2: Run frontend tests**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run test:frontend
```

Expected: 38 tests pass.

- [ ] **Step 3: Commit (if changes needed, otherwise skip)**

```bash
git add apps/frontend/src/stores/analysis.test.ts && git commit -m "test: verify model parameter in analysis store" || echo "no changes"
```

---

### Task 15: Final integration — run full test suite

**Files:**
- (verification only, no changes)

- [ ] **Step 1: Run all tests**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm test
```

Expected: All tests pass (3 shared + 38 frontend + 35 backend = 76 total).

- [ ] **Step 2: Manual smoke test**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run dev &
sleep 5
# In browser: open http://localhost:5173
# Submit a username, verify model dropdowns appear
# Verify breadcrumb header shows path
# Verify provider cards show model names and startedAt
# Kill servers: pkill -f "tsx server.ts"; pkill -f "vite"
```

- [ ] **Step 3: Commit any remaining cleanup**

```bash
git add -A && git commit -m "chore: final integration cleanup" || echo "clean"
```
