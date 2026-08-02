# GitHub Profile Analyzer — Design

Date: 2026-08-01

## Purpose

A local web app that takes a GitHub profile link, analyzes the account with at least two free LLM providers (Gemini, Groq, OpenRouter), and presents a structured scorecard evaluating the account's skills and qualifications. The user persona is a tech recruiter screening a candidate's GitHub presence.

## Success Criteria

- A recruiter pastes a GitHub profile link, confirms the target username, and receives a structured scorecard report evaluating the candidate's skills.
- The report is produced by at least two free LLM providers, shown side-by-side in tabs.
- The user can follow live progress of an analysis via WebSocket, recover their UI state after a page reload (F5), and retry a failed provider (subject to a 45-second cooldown).
- Multiple sessions may watch the same running analysis of the same profile (shared runtime), with deduplicated shared retries.

## Tech Stack

- **Frontend:** Vue.js + TypeScript + Vite + Vitest
- **Backend:** Node.js + TypeScript + Next.js (API routes) + Jest + Docker
- **Shared package:** TypeScript types + zod validation for the scorecard schema
- **Persistence:** SQLite

## Repository Layout

```
repo-dna/
├── apps/
│   ├── frontend/          # Vue.js + TS + Vite (recruiter UI)
│   │   └── src/
│   │       ├── pages/      # Home, Analysis, Report
│   │       ├── components/ # ConfirmModal, ProviderCard, ScorecardTable, VerdictBox, ...
│   │       ├── api/        # client for backend (REST + WebSocket)
│   │       └── stores/     # session + analysis state (Pinia)
│   └── backend/           # Next.js + TS API server (Dockerized)
│       ├── pages/api/      # REST + WebSocket routes
│       ├── src/
│       │   ├── github/     # GitHub REST API client + data shaping
│       │   ├── llm/        # provider abstraction (Gemini, Groq, OpenRouter)
│       │   ├── analysis/   # prompt building + scorecard parsing
│       │   ├── db/         # SQLite access layer
│       │   └── types/
├── packages/
│   └── shared/            # shared types & scorecard schema (zod)
└── package.json           # root scripts to run both apps
```

## Architecture

- The frontend communicates with the backend via a small REST API plus one WebSocket channel for live progress.
- The backend orchestrates: session management, GitHub data fetching, LLM calls (in parallel), persistence in SQLite, retry handling, and shared-runtime coordination.
- The shared package defines the scorecard schema that is the contract between the LLM output, backend validation, and frontend rendering.
- The WebSocket `/ws` requires a custom Next.js server (API routes cannot hold WebSocket connections natively); the custom server mounts both the WS handler and the Next.js app.

## API Surface

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/session` | Create a session; returns `sessionId` + `expiresAt` (12h) |
| POST | `/api/analyze` | Start an analysis for a username; `201` new, `200 {shared:true}` if already running elsewhere, `409` if this session already has a running analysis |
| GET | `/api/analysis?sessionId=...` | Latest analysis for a session (used on F5 recovery); `null` if none |
| GET | `/api/analysis/:id` | Analysis state (per-provider status/progress/timestamps) |
| GET | `/api/analysis/:id/report` | Full report (scorecards) for a completed analysis |
| POST | `/api/analysis/:id/retry` | Retry a single failed provider; `201` new retry, `200 {shared:true}` if already being retried, `429` inside 45s cooldown |
| WS | `/ws?sessionId=...` | Live progress stream; only opened while an analysis is running |

## Session Lifecycle

1. Frontend loads → looks for a stored `sessionId` in localStorage. None found → `POST /api/session` creates one (12h expiry).
2. Sessions are stored in SQLite, keyed by `sessionId`, with a periodic sweep removing expired sessions.
3. Many analyses per session are allowed, but only **one active (running)** at a time. A new `POST /api/analyze` while one is `running` → `409 Conflict`. Enforced server-side, so it holds across tabs sharing the same session (same browser).
4. A different browser has a different session and can start its own analysis (MVP behavior), subject to the cross-session sharing rule below.

## Analysis Flow

1. `POST /api/analyze { sessionId, username }` → validate session and username; check concurrency rules; create an `analysis` record in SQLite marked `running`; return `201`.
2. Fetch GitHub data (parallel, cached): profile basics, repos list, language stats, popularity (stars/forks/watchers), contribution activity. Build a compact data snapshot.
3. Run providers in parallel (Gemini, Groq, OpenRouter). Each transitions `pending → running → succeeded | failed`, storing result, `startedAt`, `completedAt`.
4. WebSocket `/ws?sessionId=...` streams live progress events (status, progress %, `lastUpdated`) for the active analysis to all connected viewers.
5. On completion, the WS delivers a final success message (or failure summary) and closes. The user clicks "View report" → `GET /api/analysis/:id/report`.

## Retry Flow

1. Anyone viewing the shared analysis (owner or shared viewer) may retry a failed provider.
2. On `POST /api/analysis/:id/retry { sessionId, provider }`:
   - If a retry for `(analysisId, provider)` is already `running` → return `200 { shared: true }`; the viewer opens the WS and watches the same progress with a "another user already retried this provider" banner.
   - Otherwise, enforce the 45-second cooldown from that provider's last attempt → `429` with remaining time if not yet elapsed.
   - Start the retry, mark the provider `running`, broadcast via the shared WS stream, return `201`.
3. On success the provider flips to `succeeded` with updated `completedAt`; on failure it stays retryable.
4. Progress/status/timestamps for the retry are one shared stream keyed by `(analysisId, provider)` — every connected viewer sees identical updates. The final WS message closes that provider's stream.

## Concurrency & Shared Runtime

- **Per-session rule:** one active analysis per session → `409` for a second concurrent start from the same session.
- **Cross-session rule:** when a username already has a `running` analysis in a *different* session, a new `POST /api/analyze` returns `200 { shared: true, analysisId, username }` (no duplicate created). The frontend navigates to the Analysis screen, subscribes via the WS, and shows:
  > "This GitHub profile is already being analyzed right now — you're watching the live session."
- The WS subscription is **username-keyed**, not session-keyed: any connected tab whose session requests the running analysis for that username receives its live events.
- A shared viewer is read-only for the analysis record itself but **can** retry a failed provider (deduplicated/shared as described above). When the analysis finishes, the shared viewer can fetch the report.
- SQLite writes are serialized through a single worker to avoid write contention.

## WebSocket Connection Lifecycle

The WS is a live-progress channel for an in-flight analysis; it is never held open idle.

**Opens only when:**
1. A new analysis starts (`POST /api/analyze` → `201`) — frontend then opens `ws://.../ws?sessionId=...`.
2. F5 recovery finds a `running` analysis — frontend opens the WS after restoring state.

**Closes or never opens when:**
- The backend sends the final message (success or failure summary) for the active analysis, then closes the connection.
- A recovered state from SQLite is `succeeded` or `failed` → do not open the WS; render stored final state.
- No analysis running → no WS connection exists.

**Server-side enforcement:** the WS endpoint rejects connections when there is no `running` analysis for the session. Reconnect only happens while the analysis is `running`; the backend replays the current state snapshot on reconnect.

## Session/UI Restore on Reload (F5)

1. Frontend reads `sessionId` from localStorage.
2. Calls `GET /api/analysis?sessionId=...` → returns the latest analysis (including `username`, per-provider `status`/`progress`/`lastUpdated`).
3. UI restores the Analysis screen showing the profile being analyzed and per-provider cards in their saved state:
   - `running` → reconnect WS and resume live progress.
   - `succeeded`/`failed` → show final scorecard or failure state with retry button.
4. If no analysis exists → show the Home screen (paste-link form).

`username` is stored on the analysis record so the profile can be redisplayed without re-prompting.

## Scorecard Schema (per provider)

```
{
  provider: "gemini" | "groq" | "openrouter",
  status: "pending" | "running" | "succeeded" | "failed",
  progress: 0-100,            // live % pushed via WebSocket
  startedAt: ISO timestamp,   // when this provider's run began
  lastUpdated: ISO timestamp, // last time progress/status changed
  completedAt: ISO timestamp | null,
  dimensions: [
    { key: "code_quality",    label: "Code Quality",           score: 1-10 },
    { key: "languages",       label: "Languages",              score: 1-10 },
    { key: "contribution",    label: "Contribution Activity",  score: 1-10 },
    { key: "project_depth",   label: "Project Depth",          score: 1-10 },
    { key: "oss_experience",  label: "Open Source Experience", score: 1-10 }
  ],
  top_repos: [ { name, stars, description, reason } ],
  strengths: [string],
  gaps: [string],
  verdict: {
    leaning: "hire" | "no_hire" | "uncertain",
    summary: string
  }
}
```

## GitHub Data Snapshot

The backend builds one compact snapshot used by all providers:
- Profile basics (bio, followers, following, orgs, creation date, pinned repos)
- Repo list (names, descriptions, topics, primary language)
- Language stats (aggregated across repos)
- Popularity (stars, forks, watchers)
- Contribution activity (recent commit frequency, recency)

Raw API dumps are not sent to the LLMs; the snapshot is compact and consistent.

## LLM Provider Abstraction

```
interface LLMProvider {
  id: "gemini" | "groq" | "openrouter";
  displayName: string;
  analyze(snapshot: GitHubSnapshot): Scorecard;
}
```

- Each provider receives the same snapshot + a fixed scoring rubric, and is instructed to return strict JSON matching the schema.
- Responses are validated with `zod`; malformed responses count as that provider's failure (retryable), not a request failure.
- Adding a provider = one new file implementing the interface.

## Frontend UI

**1. Home screen**
- Input for a GitHub profile link (`https://github.com/<username>`).
- On "Analyze" click → client-side validation: must match a GitHub profile URL pattern (single path segment, no `login`/`orgs`/`repos` suffixes). Invalid → inline error.
- Valid → extract `<username>`, show a confirmation modal:
  > "Do you really want to analyze the GitHub account of **{username}**?"
  - **No** → abort, close modal, return to form (input preserved).
  - **Yes** → `POST /api/analyze`; on `201` open WS and go to Analysis screen. On `200 {shared:true}` go to Analysis screen in shared-watch mode. On `409` show "an analysis is already running — wait for it to finish."

**2. Analysis screen** (live)
- Header: username/avatar being analyzed + overall progress bar (aggregate %).
- One card per provider:
  - `pending`/`running`: spinner + provider progress % + `lastUpdated` timestamp.
  - `succeeded`: collapsed summary ("View scorecard").
  - `failed`: "Analysis failed" + Retry button + remaining cooldown countdown (45s) + timestamp.
- Shared-watch banner when viewing an analysis owned by another session, or a retry started by another user.
- On final WS message → success shows "View report"; failure shows per-provider retry UI.

**3. Report screen**
- Fetched via `GET /api/analysis/:id/report`.
- Side-by-side tabs, one per provider:
  - Dimension scores (5 bars / 1-10).
  - Top repos, strengths, gaps.
  - Verdict box: leaning + summary.
- Copyable text of the report.

**Cross-cutting:** localStorage stores `sessionId` only; everything else is fetched. F5 recovery wired per the restore flow above.

## Error Handling

- **Invalid/expired session** → `401`; frontend creates a fresh session and retries once.
- **409 active analysis** → friendly message on Home screen.
- **429 retry cooldown** → countdown on the failed provider card; button disabled until 0.
- **LLM failure** → isolated per provider; states persisted in SQLite; failed cards retryable.
- **GitHub fetch failure** (user not found, rate-limited) → analysis marked `failed` for all providers with a clear reason; report screen shows the error.
- **Malformed LLM response** → that provider's failure (retryable).
- **WS drop mid-run** → reconnect loop only while `running`; backend replays state snapshot on reconnect.

## Testing

- **Unit (Vitest):** GitHub URL validation, username extraction, prompt building, scorecard zod validation, provider abstraction (mocked LLM responses).
- **Backend (Jest):** session create → analyze (`201`) → WS events → final message → report endpoint; F5 recovery; retry cooldown (`429` then success); shared-runtime (`200 {shared:true}`) and deduplicated retry.
- **Frontend (Vitest + Vue Test Utils):** modal flow, per-provider card states, WS reconnect, report rendering (mocked backend).
- **Manual:** two tabs same browser (`409`); two browsers (shared runtime); F5 mid-analysis.
