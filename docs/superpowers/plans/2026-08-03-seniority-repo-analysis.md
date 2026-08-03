# Seniority Dimension & Repo Analysis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 6th seniority dimension to profile analysis and build on-demand single-provider repo analysis with tech dimensions.

**Architecture:** Seniority extends existing types/schema/prompts by one dimension key. Repo analysis is parallel — new DB table, GitHub README fetch, custom-prompt LLM method, dedicated API endpoints (no WS), new frontend page.

**Tech Stack:** TypeScript, Vue 3 + Pinia, Next.js, better-sqlite3, Vitest, Jest

## Global Constraints

- Node >=20.0.0
- No emojis, no added comments, follow existing patterns
- Seniority: 1-3=Junior, 4-7=Mid, 8-10=Senior
- Repo analysis: single provider only, no WebSocket
- Repo README truncated to 8000 chars
- Repo dimensions: code_quality, documentation, workflow, collaboration, activity (5 keys)
- Repo veredict leaning: strong|moderate|weak

---

### Task 1: Seniority — shared types

**Files:** Modify `packages/shared/src/types.ts`

- [ ] Add `'seniority'` to `Dimension['key']` union
- [ ] Add `{ key: 'seniority', label: 'Seniority Level' }` to `DIMENSION_DEFS`
- [ ] Run `npm run test:shared`
- [ ] Commit: `feat: add seniority dimension to profile analysis types`

---

### Task 2: Seniority — schema

**Files:** Modify `packages/shared/src/schema.ts`

- [ ] Add `'seniority'` to `DimensionSchema.key.enum`
- [ ] Change `ScorecardSchema.dimensions.length(5)` to `.length(6)`
- [ ] Run `npm run test:shared` (3 pass)
- [ ] Commit: `feat: add seniority dimension to ScorecardSchema`

---

### Task 3: Seniority — LLM prompts

**Files:** Modify `apps/backend/src/llm/prompts.ts`

- [ ] Add seniority dimension to `buildSystemPrompt()` JSON example:
```ts
{ "key": "seniority", "label": "Seniority Level", "score": <1-10, where 1-3=Junior, 4-7=Mid, 8-10=Senior> }
```
- [ ] Commit: `feat: add seniority dimension to LLM system prompt`

---

### Task 4: Fix all tests for 6 dimensions

**Files:** Modify `packages/shared/src/schema.test.ts`, `apps/backend/src/llm/prompts.test.ts`, `apps/backend/src/llm/json.test.ts`, `apps/backend/src/analysis/runner.test.ts`, all frontend test files that reference `dimensions: [...]`

- [ ] Update `schema.test.ts`: add test that 6 dimensions pass validation
- [ ] Update `prompts.test.ts`: assert `seniority` and `1-3=Junior` in system prompt
- [ ] Update `json.test.ts`: add `{ "key": "seniority", ... }` to expected JSON
- [ ] Update `runner.test.ts` `makeScorecard`: 6 dimensions instead of 5
- [ ] Update all other test files where mock scorecards have 5-dimension arrays → 6
- [ ] Run `npm test` — all tests pass
- [ ] Commit: `test: update all tests for 6-dimension seniority scorecard`

---

### Task 5: Repo types and schema

**Files:** Modify `packages/shared/src/types.ts`, `packages/shared/src/schema.ts`

- [ ] Add to types.ts:
```ts
export type RepoDimensionKey = 'code_quality' | 'documentation' | 'workflow' | 'collaboration' | 'activity';

export interface RepoScorecard {
  id: string;
  repoName: string;
  provider: ProviderId;
  model: string | null;
  status: ProviderStatus;
  error: string | null;
  dimensions: { key: RepoDimensionKey; label: string; score: number }[];
  strengths: string[];
  gaps: string[];
  verdict: { leaning: 'strong' | 'moderate' | 'weak'; summary: string };
  startedAt: string | null;
  completedAt: string | null;
}
```
- [ ] Add to schema.ts: `RepoDimensionSchema` (enum of 5 keys) and `RepoScorecardSchema`
- [ ] Run `npm run test:shared`
- [ ] Commit: `feat: add RepoScorecard types and schema`

---

### Task 6: DB — repo_analyses table and CRUD

**Files:** Modify `apps/backend/src/db/database.ts`, Create `apps/backend/src/db/repo-analyses.ts`

- [ ] In `database.ts`, add `CREATE TABLE IF NOT EXISTS repo_analyses (...)` to `getDb()` and add `RepoAnalysisRow` interface
- [ ] Create `repo-analyses.ts` with: `createRepoAnalysis`, `getRepoAnalysis`, `getLatestRepoAnalysis`, `updateRepoAnalysis`
- [ ] Run `npm run test:backend`
- [ ] Commit: `feat: add repo_analyses table and CRUD functions`

---

### Task 7: GitHub client — fetchRepoReadme

**Files:** Modify `apps/backend/src/github/client.ts`

- [ ] Add `fetchRepoReadme(owner: string, repo: string): Promise<string | null>` — fetches `GET /repos/{owner}/{repo}/readme`, base64-decodes, returns text or null on error
- [ ] Commit: `feat: add fetchRepoReadme to GitHub client`

---

### Task 8: LLM — custom prompt method on providers

**Files:** Modify `apps/backend/src/llm/provider.ts`, `apps/backend/src/llm/gemini.ts`, `apps/backend/src/llm/groq.ts`, `apps/backend/src/llm/openrouter.ts`, `apps/backend/src/llm/nvcf.ts`

- [ ] Add to `LLMProvider` interface:
```ts
analyzeCustomPrompt(systemPrompt: string, userPrompt: string, model: string): Promise<string>;
```
- [ ] Implement in each provider. Example for groq.ts:
```ts
async analyzeCustomPrompt(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set');
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.2 }),
  });
  if (!res.ok) throw new Error(`Groq API ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}
```
- [ ] Gemini: uses fetch to Gemini endpoint with systemInstruction + contents format
- [ ] OpenRouter: same as groq but OpenRouter URL and key
- [ ] NVCF: same as groq but NVCF URL and key
- [ ] Run `npm run test:backend`
- [ ] Commit: `feat: add analyzeCustomPrompt method to all LLM providers`

---

### Task 9: Repo LLM prompts

**Files:** Create `apps/backend/src/llm/repo-prompts.ts`

- [ ] `buildRepoSystemPrompt()` — returns system prompt with 5 tech dimensions (code_quality, documentation, workflow, collaboration, activity) and verdict leaning (strong|moderate|weak)
- [ ] `buildRepoUserPrompt(repoName, description, language, stars, topics, readme)` — returns user prompt with repo metadata and README (truncated to 8000 chars)
- [ ] Commit: `feat: add repo analysis LLM prompts`

---

### Task 10: Repo runner

**Files:** Create `apps/backend/src/api/repo-runner.ts`

- [ ] `runRepoAnalysis(analysisId, repoName, username, providerId, modelId, repoMeta)` — fetches README, calls provider.analyzeCustomPrompt, parses with parseScorecardJson, maps dimensions to RepoScorecard, stores result via repo-analyses CRUD
- [ ] On error: updates repo_analyses row with status=failed and error message
- [ ] Commit: `feat: add repo analysis runner`

---

### Task 11: API endpoints

**Files:** Create `apps/backend/pages/api/analysis/[id]/repo.ts`

- [ ] `POST /api/analysis/:id/repo` — accepts `{ repo, provider, model }`, creates repo_analyses row, starts runner async, returns `{ status: "started", id }`
- [ ] `GET /api/analysis/:id/repo?repo=name` — returns latest `repoAnalysis` for that analysis+repo pair
- [ ] Commit: `feat: add repo analysis API endpoints`

---

### Task 12: Frontend client

**Files:** Modify `apps/frontend/src/api/client.ts`

- [ ] Add `startRepoAnalysis(analysisId, repo, provider, model)` — POSTs to `/api/analysis/:id/repo`
- [ ] Add `fetchRepoAnalysis(analysisId, repo)` — GETs `/api/analysis/:id/repo?repo=...`
- [ ] Commit: `feat: add repo analysis client functions`

---

### Task 13: Frontend — RepoAnalyzeRow component

**Files:** Create `apps/frontend/src/components/RepoAnalyzeRow.vue`

- [ ] Props: `{ repo: TopRepo; analysisId: string }`
- [ ] Template: inline row showing repo name + stars + provider dropdown + "Analyze Repo" button
- [ ] Dropdown uses `PROVIDER_MODELS`, defaults to first free model
- [ ] On click: calls `startRepoAnalysis`, transitions to loading, then "View report →" link
- [ ] Commit: `feat: add RepoAnalyzeRow component`

---

### Task 14: Frontend — ReportView update

**Files:** Modify `apps/frontend/src/components/ScorecardTable.vue`

- [ ] In the Top repos `<ul>`, wrap each repo item with `<RepoAnalyzeRow>` component instead of plain `<li>`
- [ ] No changes to the ScorecardTable template beyond replacing repo items
- [ ] Commit: `feat: add repo analyze buttons to ScorecardTable`

---

### Task 15: Frontend — RepoReportView page and route

**Files:** Create `apps/frontend/src/pages/RepoReportView.vue`, Modify `apps/frontend/src/router.ts`

- [ ] Create `RepoReportView.vue` — receives `analysisId` and `repoName` as props, fetches repo analysis, displays dimensions bar chart, verdict box, strengths/gaps
- [ ] Add route: `{ path: '/report/:analysisId/repo/:repoName', component: RepoReportView, props: true }`
- [ ] Commit: `feat: add repo report page and route`

---

### Task 16: Tests

**Files:** Modify multiple test files

- [ ] `apps/backend/src/db/database.test.ts` — test repo_analyses CRUD
- [ ] `apps/backend/src/github/client.test.ts` — test fetchRepoReadme
- [ ] `apps/backend/src/llm/prompts.test.ts` — test repo prompts
- [ ] New `apps/backend/src/api/repo-routes.test.ts` — test POST/GET endpoints
- [ ] `apps/frontend/src/components/RepoAnalyzeRow.test.ts` — test button/dropdown
- [ ] `apps/frontend/src/pages/ReportView.test.ts` — verify analyze button renders
- [ ] `apps/frontend/src/pages/RepoReportView.test.ts` — test report display
- [ ] Run `npm test`
- [ ] Commit: `test: add coverage for repo analysis feature`

---

### Task 17: Final integration

- [ ] Run `npm test` — all tests pass
- [ ] Commit any remaining changes
