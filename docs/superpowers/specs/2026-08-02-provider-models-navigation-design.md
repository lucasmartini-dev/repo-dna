# Provider Models, Navigation & UX Improvements

## Overview

Four changes to repo-dna: free-tier model enforcement per provider, storing model name and startedAt in the database, adding a new OpenCode provider, and improving the UI with breadcrumbs and timestamp display.

## 1. Provider Model Definitions

### 1.1 Shared types (`packages/shared/src/types.ts`)

```ts
export type ProviderId = 'gemini' | 'groq' | 'openrouter' | 'nvcf' | 'opencode';

export interface ModelOption {
  id: string;
  displayName: string;
  free: boolean;
}

export interface Scorecard {
  // ... existing fields ...
  model: string | null;  // the model id used for this run
}
```

### 1.2 Provider model lists

Defined in `packages/shared/src/types.ts` as `PROVIDER_MODELS`:

| Provider | Model ID | Display Name | Free |
|---|---|---|---|
| gemini | `gemini-2.0-flash` | Gemini 2.0 Flash (free) | yes |
| gemini | `gemini-2.5-flash` | Gemini 2.5 Flash | no |
| groq | `llama-3.1-8b-instant` | Llama 3.1 8B Instant | no |
| openrouter | `meta-llama/llama-3.1-8b-instruct:free` | Llama 3.1 8B (free) | yes |
| openrouter | `google/gemini-2.0-flash-001:free` | Gemini 2.0 Flash (free) | yes |
| nvcf | `meta/llama-3.1-8b-instruct` | Llama 3.1 8B Instruct | no |
| opencode | `deepseek-v4-flash` | DeepSeek V4 Flash (free) | yes |

`PROVIDER_IDS` is updated to include `'opencode'`.

### 1.3 Schema updates

`ScorecardSchema` in `packages/shared/src/schema.ts` gains `model: z.string().nullable()`.

## 2. Database Changes

### 2.1 New column

```sql
ALTER TABLE providers ADD COLUMN model TEXT;
```

### 2.2 Type changes

```ts
// database.ts
export interface ProviderRow {
  // ... existing fields ...
  model: string | null;
}
```

### 2.3 Migration

`getDb()` in `database.ts` adds the column with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`-style logic (SQLite does not support `IF NOT EXISTS`; run `PRAGMA table_info` first to check).

### 2.4 Data flow

- `createProviderRows()` accepts `model` per provider and inserts it.
- `updateProvider()` accepts `model` in its patch.
- When the runner starts a provider, it sets `startedAt` and `model` via `updateProvider()`.
- `getProviderRows()` and `getProviderRow()` return the `model` column.
- `toAnalysisSummary()` maps `model` onto the `Scorecard` object.

## 3. New OpenCode Provider

### 3.1 Provider class (`apps/backend/src/llm/opencode.ts`)

Implements `LLMProvider` with:
- `id = 'opencode'`
- `displayName = 'OpenCode'`
- `analyze(ctx, model)`: POST to `https://api.opencode.ai/v1/chat/completions` with `Authorization: Bearer <OPENCODE_API_KEY>`, same prompt structure as OpenRouter/Groq, parse JSON response.

### 3.2 Registration

- Added to `providers` array in `apps/backend/src/llm/index.ts`.
- Added to `PROVIDER_IDS` and `PROVIDER_MODELS` in shared types.
- Added to `createProviderRows` call in `apps/backend/pages/api/analyze.ts`.

### 3.3 Environment

Requires `OPENCODE_API_KEY` in `.env`.

## 4. API Changes

### 4.1 `POST /api/analyze`

Request body gains `models` field:

```json
{
  "username": "octocat",
  "models": {
    "gemini": "gemini-2.0-flash",
    "groq": "llama-3.1-8b-instant",
    "openrouter": "meta-llama/llama-3.1-8b-instruct:free",
    "nvcf": "meta/llama-3.1-8b-instruct",
    "opencode": "deepseek-v4-flash"
  }
}
```

The route passes models to `createProviderRows` and `startAnalysisAsync`.

### 4.2 Runner

- `runProviders()` receives a `Map<string, string>` of `providerId -> modelId`.
- Each provider's `analyze(ctx, modelId)` is called with the selected model.

### 4.3 Staggered provider start

`runProviders()` runs providers sequentially with a staggered delay so WebSocket updates animate one provider at a time in the UI:

```
Provider 1 starts after 3000ms delay
Provider 2 starts after +1000ms (4000ms total)
Provider 3 starts after +1000ms (5000ms total)
...
```

Implementation in `runProviders()`:

```ts
const FIRST_START_DELAY = 3000;
const INTER_START_DELAY = 1000;

for (let i = 0; i < providerIds.length; i++) {
  const delay = FIRST_START_DELAY + i * INTER_START_DELAY;
  const pid = providerIds[i];
  // Each provider runs concurrently after its delay,
  // so long-running providers overlap with later starters.
  promises.push(
    new Promise<void>((resolve) => setTimeout(resolve, delay)).then(() =>
      runSingleProvider(pid, ...)
    )
  );
}
await Promise.all(promises);
```

This replaces the current `Promise.all(providerIds.map(...))` which starts all providers at once.

### 4.4 `LLMProvider` interface

```ts
export interface LLMProvider {
  id: ProviderId;
  displayName: string;
  analyze(ctx: AnalyzeContext, model: string): Promise<Scorecard>;
}
```

Each provider uses `model` instead of a hardcoded model string in its API request body.

## 5. Frontend Changes

### 5.0 Semantic color palette

Applied globally via CSS custom properties:

| Semantic | Color | Hex | Usage |
|---|---|---|---|
| Primary | Aurora Purple | `#8B5CF6` | Buttons, links, breadcrumb highlights, progress bars |
| Secondary | Coral | `#FF6B81` | Accents, hover states |
| Positive | Eucalyptus | `#44D7A8` | Success status, succeeded provider cards |
| Information | Blueberry | `#3F51B5` | Info banners, report link |
| AI / Analytics | Sky Cyan | `#38BDF8` | Provider name badges, model labels |
| Warning | Amber | `#FBBF24` | Pending status, cooldown indicators |
| Destructive | Flamingo | `#E67C73` | Failed status, error text, retry buttons |

Provider cards use status-based colors: pending = Warning, running = Primary with progress bar in Primary, succeeded = Positive, failed = Destructive.

### 5.1 Header breadcrumb navigation

New `SiteHeader` component rendered in `App.vue` above `<router-view>`:

```
[GH Analyzer]  Home > Analysis: octocat > Report
```

- Breadcrumbs derived from `route.path` and store state (username from analysis store).
- Each breadcrumb is a `<router-link>` except the last (current page).
- Styled as a fixed top bar with dark background, white text.

**Routes:**
| Path | Breadcrumb |
|---|---|
| `/` | Home |
| `/analysis` | Home > Analysis: `<username>` |
| `/report/:id` | Home > Analysis: `<username>` > Report |

### 5.2 Model selection on HomeView

Before submitting the analysis form, show a per-provider dropdown:

```
[Username input]: [octocat]

Gemini:         [Gemini 2.0 Flash (free) ▼]
Groq:           [Llama 3.1 8B Instant ▼]
OpenRouter:     [Llama 3.1 8B (free) ▼]
NVCF:           [Llama 3.1 8B Instruct ▼]
OpenCode:       [DeepSeek V4 Flash (free) ▼]

[Analyze]
```

- Each dropdown lists `PROVIDER_MODELS[providerId]`.
- Default selection is the first model in the list (free one first when available).
- Selected models are sent as `models` in the `POST /api/analyze` body.

### 5.3 ProviderCard improvements

Show `startedAt` and `model` when available:

```
+--------------------------+
| Gemini · dev              |
| Model: Gemini 2.0 Flash   |
| Started: Jan 15, 2026 at 14:30:22 |
| Status: running           |
| [===========    ] 65%      |
+--------------------------+
```

- `startedAt` formatted as `MMM DD, YYYY at HH:mm:ss`.
- `model` shown as `displayName` from `PROVIDER_MODELS` lookup.
- Both only displayed when non-null.

### 5.4 Frontend client (`apps/frontend/src/api/client.ts`)

`startAnalysis()` signature gains `models: Record<string, string>` parameter.

### 5.5 Analysis store

`useAnalysisStore.start()` accepts `models` and passes them to `startAnalysis()`.

## 6. Tests

### 6.1 Backend

- `providers.test.ts`: update to include `opencode` in the list.
- `opencode.test.ts`: new file testing the OpenCode provider class (mock fetch).
- `groq.test.ts`, `gemini.test.ts`, `openrouter.test.ts`, `nvcf.test.ts`: update to test `model` parameter usage.
- `routes.test.ts`: test `models` in request body.
- `database.test.ts`: test new `model` column migration and CRUD.
- `runner.test.ts`: test model passing through runner.
- `summary.test.ts` (if it exists): test model in analysis summary.

### 6.2 Frontend

- `HomeView.test.ts`: test model dropdowns render and selection.
- `ProviderCard.test.ts`: test startedAt and model display.
- `SiteHeader.test.ts`: new file testing breadcrumb rendering.
- `analysis.test.ts`: test model passing through store.

## 7. File Change Summary

| File | Change |
|---|---|
| `packages/shared/src/types.ts` | Add `ModelOption`, `PROVIDER_MODELS`, update `ProviderId`, `PROVIDER_IDS`, `Scorecard.model` |
| `packages/shared/src/schema.ts` | Add `model` to `ScorecardSchema` |
| `apps/backend/src/db/database.ts` | Add `model` column to `providers` table, update `ProviderRow` |
| `apps/backend/src/db/providers.ts` | Update `createProviderRows` and `updateProvider` for `model` |
| `apps/backend/src/llm/provider.ts` | Add `model` param to `analyze()` |
| `apps/backend/src/llm/index.ts` | Add `OpenCodeProvider` |
| `apps/backend/src/llm/opencode.ts` | **New**: OpenCode provider |
| `apps/backend/src/llm/gemini.ts` | Use `model` parameter |
| `apps/backend/src/llm/groq.ts` | Use `model` parameter |
| `apps/backend/src/llm/openrouter.ts` | Use `model` parameter |
| `apps/backend/src/llm/nvcf.ts` | Use `model` parameter |
| `apps/backend/src/analysis/runner.ts` | Pass models map through `runProviders`; staggered sequential start with delays |
| `apps/backend/src/api/router.ts` | Accept and forward models |
| `apps/backend/pages/api/analyze.ts` | Accept `models` in body, pass to DB and runner |
| `apps/backend/src/api/summary.ts` | Map `model` field |
| `apps/frontend/src/App.vue` | Add `<SiteHeader>` |
| `apps/frontend/src/components/SiteHeader.vue` | **New**: Breadcrumb navigation |
| `apps/frontend/src/pages/HomeView.vue` | Add model dropdowns per provider |
| `apps/frontend/src/components/ProviderCard.vue` | Show startedAt and model; apply semantic colors per status |
| `apps/frontend/src/styles/colors.css` | **New**: CSS custom properties for semantic palette |
| `apps/frontend/src/api/client.ts` | Add `models` to `startAnalysis` |
| `apps/frontend/src/stores/analysis.ts` | Accept and forward `models` |
