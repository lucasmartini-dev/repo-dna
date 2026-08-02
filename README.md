# GitHub Profile Analyzer

Analyze a candidate's GitHub profile with free LLM providers (Gemini, Groq, OpenRouter, NVIDIA) and get a recruiter-friendly scorecard report.

Built for a tech recruiter screening a candidate's GitHub presence: paste a profile link, confirm the target username, and receive a structured, per-provider scorecard evaluating skills, project depth, contribution activity, and open-source experience — delivered with live progress over WebSocket and resilient to page reloads.

## Project Goals

- **Turn raw GitHub history into a hiring signal.** The backend fetches a candidate's public profile, repositories, language mix, popularity, and contribution activity, then compresses it into one compact snapshot so providers evaluate the same evidence consistently.
- **Zero-cost, multi-model analysis.** At least two free LLM providers (Gemini, Groq, OpenRouter) analyze the same snapshot against a fixed recruiter scoring rubric; their results are shown side-by-side in tabs.
- **Structured, validated output.** Every provider must return strict JSON matching the shared `Scorecard` schema (5 dimension scores 1–10, top repos, strengths, gaps, verdict). Responses are validated with zod; malformed output is treated as that provider's retryable failure, not a request failure.
- **Live progress with shared runtime.** A single WebSocket channel streams per-provider progress to every connected viewer. Multiple sessions watching the same profile share one running analysis (deduplicated retries, no duplicate work).
- **Recoverable UX.** Only the `sessionId` lives in localStorage; everything else is re-fetched. Reload mid-analysis (F5) restores the Analysis screen and reconnects the stream.

## How This Project Was Built (AI-Driven Development)

This repository is also a demonstration of AI-driven development: the product was designed and implemented collaboratively with AI agents following a disciplined workflow.

1. **Spec first.** A written design document (`docs/superpowers/specs/2026-08-01-github-profile-analyzer-design.md`) captures purpose, success criteria, architecture, API surface, flows (session, analysis, retry), schema, and error handling.
2. **Planned in a worktree.** A 17-task implementation plan (`docs/superpowers/plans/2026-08-01-github-profile-analyzer.md`) breaks the work into reviewable increments. All work happens on an isolated branch in a git worktree.
3. **Subagent-driven execution.** Each task is implemented by an AI agent under test-driven development (RED → GREEN → commit), reviewed by a separate reviewer agent against the plan, with an AI orchestrator adjudicating findings with the human before each task is closed.
4. **Guardrails everywhere.** Conventional commits, lint-staged hooks (eslint + prettier), type-checking gates (`tsc --noEmit`, `vue-tsc --noEmit`), and a running ledger (`docs/…/.superpowers/sdd/`) record every task result, deviation, and adjudicated decision.

The result: an auditable, plan-first codebase where every feature traces back to the spec, and every deviation is a deliberate, human-approved decision.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 + TypeScript + Vite + Pinia + vue-router |
| Frontend tests | Vitest + Vue Test Utils (jsdom) |
| Backend | Node.js + TypeScript + Next.js (Pages Router API routes) |
| Real-time | `ws` WebSocket on a custom Node HTTP server |
| Backend tests | Jest + ts-jest |
| Runtime | `tsx` (dev and production both run the TypeScript server directly) |
| Persistence | SQLite (`better-sqlite3`) |
| Validation | zod (shared scorecard contract) |
| Container | Docker (multi-stage Ubuntu image) |
| Quality gates | ESLint (flat config) + Prettier + Commitlint + Husky + lint-staged |
| Providers | Google Gemini, Groq, OpenRouter, NVIDIA NVCF (free tiers) |

## Repository Layout

```
repo-dna/
├── apps/
│   ├── frontend/            # Vue 3 + Vite recruiter UI
│   │   └── src/
│   │       ├── pages/       # Home, Analysis, Report
│   │       ├── components/  # ConfirmModal, ProviderCard, ScorecardTable, VerdictBox
│   │       ├── api/         # REST + WebSocket client for the backend
│   │       ├── stores/      # session + analysis state (Pinia)
│   │       └── utils/       # GitHub URL validation + username extraction
│   └── backend/             # Next.js + TS API server (Dockerized)
│       ├── pages/api/       # REST + WebSocket routes
│       ├── src/
│       │   ├── api/         # route helpers, run-analysis wiring, summaries
│       │   ├── github/      # GitHub REST API client + data snapshot
│       │   ├── llm/         # provider abstraction (Gemini, Groq, OpenRouter)
│       │   ├── analysis/    # orchestration runner + event sink
│       │   ├── ws/          # WebSocket hub
│       │   ├── db/          # SQLite access layer (sessions, analyses, providers)
│       │   └── ...
│       └── server.ts        # custom server: mounts Next.js + /ws
├── packages/
│   └── shared/              # shared types + zod scorecard/analysis schemas
├── docs/
│   └── superpowers/         # design spec + implementation plan + SDD ledger
└── package.json             # npm workspaces; root dev/test/docker scripts
```

## Architecture

The backend follows **clean architecture**: API routes (adapters) depend on use-case/domain modules (`analysis/`, `llm/`, `github/`, `db/`), never the reverse; each module has one clear responsibility.

```
Vue frontend (Vite, :5173)
      │  REST /api/*            WS /ws?sessionId=…
      ▼
Next.js Pages Router API        ┌─ custom HTTP server (server.ts)
      │                         │  ├─ mounts Next.js app
      ▼                         │  └─ WebSocketServer @ /ws
Backend domain ────────────────▶┘
  ├─ github/    fetch profile + repos + languages + activity → GitHubSnapshot
  ├─ llm/       LLMProvider interface; Gemini/Groq/OpenRouter impls
  ├─ analysis/  runner orchestrates providers in parallel, emits events
  ├─ ws/        hub fans out provider-update/final events to subscribers
  └─ db/        SQLite persistence (sessions, analyses, provider rows)
```

- **Contract package.** `@repo/shared` defines the `Scorecard` schema (zod) that is the contract between LLM output, backend validation, and frontend rendering.
- **Single source of truth.** The backend orchestrates session management, GitHub data fetching, parallel LLM calls, persistence, retry handling, and shared-runtime coordination; the frontend is a thin client.
- **Session model.** Sessions live in SQLite with a 12h expiry. One active (running) analysis per session is enforced server-side (`409` for a second concurrent start), which holds across tabs sharing a session.
- **Shared runtime.** When a username already has a `running` analysis in a *different* session, a new start returns `200 { shared: true }` — the new viewer subscribes to the same stream and can retry failed providers (deduplicated), but never duplicates the work.
- **WebSocket lifecycle.** The WS is a live-progress channel for an in-flight analysis only. It opens on a new analysis or on F5 recovery of a `running` analysis, closes when the backend sends the final message, and rejects connections with no running analysis (with a state-snapshot replay on reconnect).

## API Surface

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/session` | Create a session; returns `sessionId` + `expiresAt` (12h) |
| POST | `/api/analyze` | Start an analysis for a username; `201` new, `200 {shared:true}` if already running elsewhere, `409` if this session already has a running analysis |
| GET | `/api/analysis` | Latest analysis for a session (used on F5 recovery); `null` if none |
| GET | `/api/analysis/:id` | Analysis state (per-provider status/progress/timestamps) |
| GET | `/api/analysis/:id/report` | Full report (scorecards) for a completed analysis |
| POST | `/api/analysis/:id/retry` | Retry a single failed provider; `201` new retry, `200 {shared:true}` if already being retried, `429` inside 45s cooldown |
| WS | `/ws?sessionId=...` | Live progress stream; opened only while an analysis is running (bound to the requesting session) |

The frontend sends the `sessionId` via the `x-session-id` header for REST calls and as a query param for the WebSocket upgrade.

## Scorecard Schema

Each provider returns a validated scorecard:

```
{
  provider: "gemini" | "groq" | "openrouter" | "nvcf",
  dimensions: [ { key, label, score: 1-10 } ×5 ],   // code_quality, languages,
                                                     // contribution, project_depth, oss_experience
  top_repos: [ { name, stars, description, reason } ],
  strengths: [string],
  gaps: [string],
  verdict: { leaning: "hire" | "no_hire" | "uncertain", summary: string }
}
```

## Prerequisites

- Node 20+ (installed via nvm)
- LLM API keys in a local `.env` file (see below): `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `NVCF_API_KEY` (at least two for a useful report)
- Optional `GITHUB_TOKEN` to raise GitHub API rate limits

## Run locally

```bash
nvm use 20
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

## Run with Docker Compose

```bash
cp .env.example .env   # fill in your API keys
docker compose up --build
```

- Backend (with SQLite in the `backend-data` volume): http://localhost:3000
- Stop: `docker compose down`
- Note: the frontend runs outside Docker; the Docker backend listens on port 3000, which the Vite dev proxy already targets.

## Tests

```bash
npm run test:shared
npm run test:backend
npm run test:frontend
```

Run all suites with `npm test` (workspace-scoped, so each workspace uses its own runner — Vitest for shared/frontend, Jest for backend).

## Development Conventions

- Conventional commits enforced by Commitlint; staged files are auto-formatted by lint-staged (ESLint + Prettier).
- The backend and frontend both type-check cleanly (`tsc --noEmit` / `vue-tsc --noEmit`); never merge code that fails a type-check gate.
- Node 20 is required: the `better-sqlite3` native module is compiled for Node 20.
