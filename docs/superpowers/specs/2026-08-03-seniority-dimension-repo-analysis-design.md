# Seniority Dimension & Repo Analysis — Design Spec

## Overview

Two features: (1) add a seniority dimension to the profile analysis, (2) allow on-demand tech-focused analysis of individual repos with a single provider.

## 1. Seniority Dimension (Profile Analysis)

### 1.1 Types (`packages/shared/src/types.ts`)

```ts
export interface Dimension {
  key: 'code_quality' | 'languages' | 'contribution' | 'project_depth' | 'oss_experience' | 'seniority';
  label: string;
  score: number;
}

export const DIMENSION_DEFS: Array<{ key: Dimension['key']; label: string }> = [
  { key: 'code_quality', label: 'Code Quality' },
  { key: 'languages', label: 'Languages' },
  { key: 'contribution', label: 'Contribution Activity' },
  { key: 'project_depth', label: 'Project Depth' },
  { key: 'oss_experience', label: 'Open Source Experience' },
  { key: 'seniority', label: 'Seniority Level' },
];
```

### 1.2 Schema (`packages/shared/src/schema.ts`)

- `DimensionSchema.key` enum gains `'seniority'`
- `ScorecardSchema.dimensions.length(6)` (was 5)

### 1.3 LLM prompts

System prompt updated to include seniority dimension:

```
{ "key": "seniority", "label": "Seniority Level", "score": <1-10, where 1-3=Junior, 4-7=Mid, 8-10=Senior> }
```

### 1.4 Tests

- `schema.test.ts`: verify 6 dimensions enforced, includes seniority
- `prompts.test.ts`: verify system prompt includes seniority dimension
- All existing tests that create 5-dimension scorecards updated to 6

---

## 2. Repo Analysis Feature

### 2.1 New shared types

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

### 2.2 DB: new `repo_analyses` table

```sql
CREATE TABLE IF NOT EXISTS repo_analyses (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  username TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL,
  error TEXT,
  scorecard TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (analysis_id) REFERENCES analyses(id)
);
```

### 2.3 API endpoints

**`POST /api/analysis/:id/repo`**

Request:
```json
{ "repo": "repo-dna", "provider": "gemini", "model": "gemini-2.0-flash" }
```

Response:
```json
{ "status": "started", "id": "<repo-analysis-id>" }
```

Flow:
1. Fetch repo README from `GET /repos/{owner}/{repo}/readme` via GitHub API (base64 decode)
2. Build README context string (truncated to 8000 chars)
3. Run single provider with repo analysis prompt
4. Store `RepoScorecard` in DB
5. No WebSocket — client polls or checks on navigation

**`GET /api/analysis/:id/repo?repo=repo-dna`**

Returns the latest repo analysis for that repo:
```json
{ "repoAnalysis": { ...RepoScorecard } }
```

### 2.4 GitHub client: new `fetchRepoReadme` function

```ts
export async function fetchRepoReadme(owner: string, repo: string): Promise<string | null> {
  try {
    const data = await get<{ content: string; encoding: string }>(
      `${BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`
    );
    if (data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return data.content;
  } catch {
    return null;
  }
}
```

### 2.5 LLM: repo analysis prompt

New prompts in `apps/backend/src/llm/repo-prompts.ts`:

**System prompt** — evaluates a GitHub repository on tech-focused dimensions, responds with JSON matching `RepoScorecard`.

**User prompt** — includes repo name, description, language, stars, topics, README content.

### 2.6 Dimensions for repo analysis

| Key | Label | Description |
|---|---|---|
| `code_quality` | Code Quality & Technical Skill | Readability, architecture, modern tooling, testing |
| `documentation` | Documentation & Communication | README, comments, commit messages |
| `workflow` | Development Workflow & Practices | Version control, CI/CD, issue tracking |
| `collaboration` | Open Source & Collaboration | Contributions, code reviews, originality |
| `activity` | Activity & Consistency | Contribution graph, recency, project completion |

### 2.7 Frontend

**ReportView changes:**
- Top repos section in ScorecardTable gains provider dropdown + "Analyze Repo" button per repo
- Dropdown defaults to first free model for that provider
- On click, POSTs to `/api/analysis/:id/repo`
- Button shows loading state, then "View report →" link on completion

**New route:** `/report/:analysisId/repo/:repoName`
- Props: `{ analysisId: string, repoName: string }`

**New component `RepoReportView.vue`:**
- Fetches repo analysis via `GET /api/analysis/:id/repo?repo=...`
- Shows dimensions as bar chart (reuses ScorecardTable-style layout)
- VerdictBox with leaning (strong/moderate/weak)
- Strengths and gaps lists

### 2.8 Router update

```ts
{ path: '/report/:analysisId/repo/:repoName', component: RepoReportView, props: true },
```

### 2.9 WebSocket

Repo analysis does NOT use WebSocket — a single provider runs quickly. The frontend polls or refreshes on navigation. The "Analyze Repo" button transitions to "View report" after the API call completes.

---

## 3. File Change Summary

| File | Change |
|---|---|
| `packages/shared/src/types.ts` | Add `seniority` to `Dimension.key`, `DIMENSION_DEFS`; add `RepoDimensionKey`, `RepoScorecard` |
| `packages/shared/src/schema.ts` | Update `DimensionSchema`, `ScorecardSchema` length to 6; add `RepoScorecardSchema` |
| `apps/backend/src/db/database.ts` | Add `repo_analyses` table |
| `apps/backend/src/db/repo-analyses.ts` | **New**: CRUD for `repo_analyses` table |
| `apps/backend/src/github/client.ts` | Add `fetchRepoReadme` function |
| `apps/backend/src/llm/prompts.ts` | Update system prompt with seniority dimension |
| `apps/backend/src/llm/repo-prompts.ts` | **New**: repo analysis system and user prompts |
| `apps/backend/pages/api/analysis/[id]/repo.ts` | **New**: POST (start) and GET (read) handlers |
| `apps/backend/src/api/repo-runner.ts` | **New**: single-provider repo analysis runner |
| `apps/frontend/src/components/RepoAnalyzeRow.vue` | **New**: inline row with provider dropdown + analyze button |
| `apps/frontend/src/pages/ReportView.vue` | Add `<RepoAnalyzeRow>` for each repo |
| `apps/frontend/src/pages/RepoReportView.vue` | **New**: repo analysis report page |
| `apps/frontend/src/router.ts` | Add `/report/:analysisId/repo/:repoName` route |
| `apps/frontend/src/api/client.ts` | Add `startRepoAnalysis`, `fetchRepoAnalysis` functions |

## 4. Tests

### Backend
- `prompts.test.ts`: verify seniority in system prompt, new repo prompts
- `schema.test.ts`: verify 6 profile dimensions, repo scorecard schema
- `database.test.ts`: verify `repo_analyses` table
- `github/client.test.ts`: test `fetchRepoReadme`
- New `repo-runner.test.ts`: test single-provider repo analysis
- New `repo-routes.test.ts`: test POST/GET endpoints

### Frontend
- `ReportView.test.ts`: verify repo analyze button renders
- `RepoReportView.test.ts`: test repo report display
- `RepoAnalyzeRow.test.ts`: test dropdown and button behavior
