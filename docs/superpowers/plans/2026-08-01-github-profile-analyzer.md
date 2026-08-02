# GitHub Profile Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web app where a recruiter pastes a GitHub profile link and gets a structured scorecard report analyzing the account, produced by at least two free LLM providers with live progress, session/state recovery, and shared runtime across sessions.

**Architecture:** A TypeScript monorepo with three packages: `packages/shared` (scorecard schema + zod validation), `apps/backend` (Next.js Pages Router API + custom server for WebSocket, SQLite persistence, Docker), and `apps/frontend` (Vue 3 + Vite + Pinia). The backend orchestrates session management, GitHub data fetching, parallel LLM provider calls, retry handling, and shared-runtime coordination. The backend follows **clean architecture**: API routes (adapters) depend on use-case/domain modules (`analysis/`, `llm/`, `github/`, `db/`), never the reverse; each module has one clear responsibility. A single WebSocket channel streams live per-provider progress; localStorage holds only the session id so the UI can recover state after F5.

**Tech Stack:** Vue 3 + Pinia, TypeScript, Vite, Vitest, vue-router; Next.js (Pages Router API routes), Node.js, Jest, better-sqlite3, ws, zod, Docker. Developer experience: ESLint, Prettier, Husky, commitlint, Commitizen, lint-staged, @faker-js/faker.

## Global Constraints

- Local-only tool. Sessions expire 12 hours after creation; expired sessions are swept.
- One active (running) analysis per session → `409`. Same username running in a *different* session → `200 { shared: true }`, no duplicate created.
- LLM providers: exactly three — `gemini`, `groq`, `openrouter` — via the `LLMProvider` interface in `apps/backend/src/llm/provider.ts`.
- Provider retry cooldown: 45 seconds from that provider's last attempt → `429` with `retryAfterSeconds`.
- Retries are deduplicated across sessions: an already-running retry for `(analysisId, provider)` → `200 { shared: true }`.
- WebSocket opens ONLY while an analysis is running; it closes on the final message and never stays open idle.
- Scorecard schema is defined once in `packages/shared` and validated with zod in the backend.
- Only a session's `sessionId` is stored in localStorage. All other state is fetched.
- Environment variables (backend): `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, optional `GITHUB_TOKEN`, `DB_PATH` (default `data/app.db`).
- All Docker images MUST use nvm to install a fixed Node version (`20.15.0`) and use `npm` for all package operations — never the base `node` image and never raw `curl node` binaries.
- The backend runs in Docker via `docker-compose`; the SQLite database connection is a named volume (`backend-data` mounted at `/data`, `DB_PATH=/data/app.db`) so data persists across container restarts.
- **Clean architecture:** backend modules depend inward — `pages/api/*` (adapters) → `src/api/*` (use cases) → `src/{analysis,llm,github,db}` (domain/data). No imports from domain modules back into route/HTTP code. Each module has one responsibility; no god files.
- **Code quality gates (enforced by Husky pre-commit):** ESLint and Prettier must pass on staged files (`lint-staged`); commit messages must conform to Conventional Commits (`commitlint`); use Commitizen (`npm run commit`) to author commits. Every commit in this plan already follows conventional format.
- **faker-js:** use `@faker-js/faker` for all generated/fixture test data (usernames, summaries, names) instead of hardcoded literals.
- **TDD discipline:** every feature is test-first (red → green → commit), per each task's steps.
- Exact JSON response keys per the spec schema in `docs/superpowers/specs/2026-08-01-github-profile-analyzer-design.md`.
- Testing: Vitest for frontend/shared, Jest for backend. TDD: write the failing test first, verify it fails, implement, verify it passes, commit.

---

### Task 1: Monorepo Root + Code Quality Tooling + Shared Package (types & zod schema)

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`
- Create: `.commitlintrc.json`
- Create: `.lintstagedrc.json`
- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/schema.ts`
- Test: `packages/shared/src/schema.test.ts`

**Interfaces:**
- Consumes: nothing (project bootstrap).
- Produces: `ProviderId`, `ProviderStatus`, `VerdictLeaning`, `AnalysisStatus`, `Dimension`, `TopRepo`, `Verdict`, `Scorecard`, `AnalysisSummary` types and zod schemas `ScorecardSchema`, `AnalysisSummarySchema` exported from `packages/shared/src/index.ts`.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { faker } from "@faker-js/faker";
import { ScorecardSchema } from "./index";

const validScorecard = {
  provider: "gemini",
  status: "succeeded",
  progress: 100,
  startedAt: "2026-01-01T00:00:00.000Z",
  lastUpdated: "2026-01-01T00:00:05.000Z",
  completedAt: "2026-01-01T00:00:05.000Z",
  dimensions: [
    { key: "code_quality", label: "Code Quality", score: 8 },
    { key: "languages", label: "Languages", score: 7 },
    { key: "contribution", label: "Contribution Activity", score: 6 },
    { key: "project_depth", label: "Project Depth", score: 9 },
    { key: "oss_experience", label: "Open Source Experience", score: 7 },
  ],
  top_repos: [{ name: faker.internet.domainWord(), stars: faker.number.int({ min: 1, max: 999 }), description: faker.lorem.sentence(), reason: faker.lorem.sentence() }],
  strengths: [faker.lorem.word()],
  gaps: [faker.lorem.word()],
  verdict: { leaning: "hire", summary: faker.lorem.sentence() },
};

describe("ScorecardSchema", () => {
  it("accepts a valid scorecard", () => {
    const parsed = ScorecardSchema.safeParse(validScorecard);
    expect(parsed.success).toBe(true);
  });

  it("rejects an out-of-range dimension score", () => {
    const bad = { ...validScorecard, dimensions: [{ ...validScorecard.dimensions[0], score: 11 }] };
    expect(ScorecardSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an invalid provider id", () => {
    const bad = { ...validScorecard, provider: "anthropic" };
    expect(ScorecardSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run src/schema.test.ts`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Create the package files**

`package.json`:
```json
{
  "name": "repo-dna",
  "private": true,
  "workspaces": ["packages/shared", "apps/frontend", "apps/backend"],
  "scripts": {
    "dev": "npm run dev --workspace=apps/backend & npm run dev --workspace=apps/frontend",
    "test": "npm run test --workspaces --if-present",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "commit": "cz",
    "prepare": "husky"
  },
  "devDependencies": {
    "@commitlint/cli": "^19.4.0",
    "@commitlint/config-conventional": "^19.4.0",
    "@faker-js/faker": "^8.4.1",
    "commitizen": "^4.3.1",
    "cz-conventional-changelog": "^3.3.0",
    "eslint": "^9.9.0",
    "eslint-plugin-vue": "^9.27.0",
    "husky": "^9.1.0",
    "lint-staged": "^15.2.0",
    "prettier": "^3.3.0",
    "typescript-eslint": "^8.2.0"
  },
  "config": {
    "commitizen": {
      "path": "./node_modules/cz-conventional-changelog"
    }
  }
}
```

`eslint.config.mjs`:
```js
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/coverage/**"],
  },
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { "prefer": "type-imports" }],
      "vue/multi-word-component-names": "off",
    },
  }
);
```

`prettier.config.mjs`:
```js
export default {
  semi: true,
  singleQuote: true,
  trailingComma: "es5",
  printWidth: 120,
};
```

`.commitlintrc.json`:
```json
{
  "extends": ["@commitlint/config-conventional"]
}
```

`.lintstagedrc.json`:
```json
{
  "*.{ts,tsx,vue,js,mjs}": ["eslint --fix", "prettier --write"]
}
```

`.husky/pre-commit`:
```sh
npx lint-staged
```

`.husky/commit-msg`:
```sh
npx --no -- commitlint --edit "$1"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "resolveJsonModule": true
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.data/
*.log
.env
.env.*
data/
```

`packages/shared/package.json`:
```json
{
  "name": "@repo/shared",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@faker-js/faker": "^8.4.1",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist" },
  "include": ["src"]
}
```

`packages/shared/src/types.ts`:
```ts
export type ProviderId = "gemini" | "groq" | "openrouter";
export type ProviderStatus = "pending" | "running" | "succeeded" | "failed";
export type VerdictLeaning = "hire" | "no_hire" | "uncertain";
export type AnalysisStatus = "running" | "succeeded" | "failed";

export interface Dimension {
  key: "code_quality" | "languages" | "contribution" | "project_depth" | "oss_experience";
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

export const PROVIDER_IDS: ProviderId[] = ["gemini", "groq", "openrouter"];

export const DIMENSION_DEFS: Array<{ key: Dimension["key"]; label: string }> = [
  { key: "code_quality", label: "Code Quality" },
  { key: "languages", label: "Languages" },
  { key: "contribution", label: "Contribution Activity" },
  { key: "project_depth", label: "Project Depth" },
  { key: "oss_experience", label: "Open Source Experience" },
];
```

`packages/shared/src/schema.ts`:
```ts
import { z } from "zod";
import { PROVIDER_IDS } from "./types";

export const DimensionSchema = z.object({
  key: z.enum(["code_quality", "languages", "contribution", "project_depth", "oss_experience"]),
  label: z.string(),
  score: z.number().int().min(1).max(10),
});

export const TopRepoSchema = z.object({
  name: z.string(),
  stars: z.number().int().min(0),
  description: z.string(),
  reason: z.string(),
});

export const VerdictSchema = z.object({
  leaning: z.enum(["hire", "no_hire", "uncertain"]),
  summary: z.string(),
});

export const ScorecardSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  status: z.enum(["pending", "running", "succeeded", "failed"]),
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

export const AnalysisSummarySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  username: z.string(),
  status: z.enum(["running", "succeeded", "failed"]),
  error: z.string().nullable(),
  createdAt: z.string(),
  providers: z.array(ScorecardSchema),
});
```

`packages/shared/src/index.ts`:
```ts
export * from "./types";
export * from "./schema";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/shared && npx vitest run src/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Install tooling and verify the git workflow**

Run: `nvm use 20 && npm install`
Run: `npx lint-staged --no-stash` (or `npm run lint`) — expect no lint errors.
Run: `npx husky` (installs hooks via the `prepare` script already run by `npm install`).
Run: `git commit -m "test: verify hooks" --dry-run` (optional) or simply verify `.husky/pre-commit` and `.husky/commit-msg` exist and are executable.
Expected: ESLint passes on existing files; husky hooks installed; `cz` (commitizen) available via `npm run commit`.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.base.json .gitignore eslint.config.mjs prettier.config.mjs .commitlintrc.json .lintstagedrc.json .husky packages/shared
git commit -m "feat: bootstrap monorepo, tooling and shared scorecard schema"
```

---

### Task 2: Backend Scaffold (Next.js Pages Router + Jest + Docker)

**Files:**
- Create: `apps/backend/package.json`
- Create: `apps/backend/tsconfig.json`
- Create: `apps/backend/next.config.mjs`
- Create: `apps/backend/jest.config.js`
- Create: `apps/backend/Dockerfile`
- Create: `apps/backend/src/__mocks__/env.ts` (test-only)
- Create: `apps/backend/pages/api/health.ts`
- Test: `apps/backend/src/health.test.ts`

**Interfaces:**
- Consumes: `@repo/shared` from Task 1.
- Produces: a runnable Next.js backend with a `GET /api/health` route returning `{ ok: true }`.

- [ ] **Step 1: Write the failing test**

`apps/backend/src/health.test.ts`:
```ts
import { healthHandler } from "../pages/api/health";
import { createMockReqRes } from "./test-helpers";

describe("healthHandler", () => {
  it("returns ok true", async () => {
    const { req, res } = createMockReqRes();
    await healthHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res._getJSON()).toEqual({ ok: true });
  });
});
```

`apps/backend/src/test-helpers.ts`:
```ts
import type { NextApiRequest, NextApiResponse } from "next";

export function createMockReqRes(): {
  req: NextApiRequest;
  res: NextApiResponse & { _getJSON: () => unknown };
} {
  const res = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this._payload = payload; return this; },
    end() { return this; },
    _getJSON() { return this._payload; },
  } as unknown as NextApiResponse & { _getJSON: () => unknown };
  return { req: {} as NextApiRequest, res };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/health.test.ts`
Expected: FAIL — `Cannot find module '../pages/api/health'`.

- [ ] **Step 3: Create the scaffold files**

`apps/backend/package.json`:
```json
{
  "name": "@repo/backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx server.ts",
    "build": "tsc && next build",
    "start": "node server.js",
    "test": "jest"
  },
  "dependencies": {
    "@repo/shared": "*",
    "better-sqlite3": "^11.3.0",
    "next": "^14.2.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "ws": "^8.18.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@faker-js/faker": "^8.4.1",
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/ws": "^8.5.12",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0"
  }
}
```

`apps/backend/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist" },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]
}
```

`apps/backend/next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

`apps/backend/jest.config.js`:
```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/pages"],
  moduleNameMapper: {
    "^@repo/shared$": "<rootDir>/../../packages/shared/src/index.ts",
  },
  setupFilesAfterEnv: ["<rootDir>/src/test-setup.ts"],
};
```

`apps/backend/src/test-setup.ts`:
```ts
process.env.DB_PATH = ":memory:";
```

`apps/backend/pages/api/health.ts`:
```ts
import type { NextApiRequest, NextApiResponse } from "next";

export async function healthHandler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ ok: true });
}

export default healthHandler;
```

`apps/backend/Dockerfile`:
```dockerfile
FROM ubuntu:22.04 AS builder
ENV NODE_VERSION=20.15.0
ENV NVM_DIR=/root/.nvm

RUN apt-get update && apt-get install -y curl build-essential python3 && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && nvm install $NODE_VERSION && nvm use $NODE_VERSION && nvm alias default $NODE_VERSION && \
    npm install -g npm@10

ENV PATH="$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH"

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN npm ci
COPY packages/shared packages/shared
COPY apps/backend apps/backend
WORKDIR /app/apps/backend
RUN npm run build

FROM ubuntu:22.04
ENV NODE_VERSION=20.15.0
ENV NVM_DIR=/root/.nvm
ENV PATH="$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH"

RUN apt-get update && apt-get install -y curl build-essential python3 && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && nvm install $NODE_VERSION && nvm use $NODE_VERSION && nvm alias default $NODE_VERSION && \
    npm install -g npm@10

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/package.json ./package.json
COPY --from=builder /app/apps/backend/node_modules ./node_modules
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/.next ./.next
COPY --from=builder /app/apps/backend/next.config.mjs ./next.config.mjs
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

`docker-compose.yml` (repo root):
```yaml
services:
  backend:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DB_PATH=/data/app.db
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - GROQ_API_KEY=${GROQ_API_KEY}
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - GITHUB_TOKEN=${GITHUB_TOKEN}
    volumes:
      - backend-data:/data

volumes:
  backend-data:
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest src/health.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend
git commit -m "feat: scaffold next.js backend with jest and docker"
```

---

### Task 3: SQLite Data Layer (database + sessions + analyses + providers)

**Files:**
- Create: `apps/backend/src/db/database.ts`
- Create: `apps/backend/src/db/sessions.ts`
- Create: `apps/backend/src/db/analyses.ts`
- Create: `apps/backend/src/db/providers.ts`
- Test: `apps/backend/src/db/database.test.ts`

**Interfaces:**
- Consumes: `Scorecard` type from `@repo/shared`.
- Produces:
  - `getDb(): Database` — returns the singleton `better-sqlite3` connection (`:memory:` in tests via `DB_PATH`).
  - `resetDbForTests()` — drops tables (used by tests only).
  - `sessions.ts`: `createSession(id, expiresAt): void`, `getSession(id): SessionRow | undefined`, `deleteExpiredSessions(now): number`.
  - `analyses.ts`: `createAnalysis(id, sessionId, username): void`, `getAnalysis(id): AnalysisRow | undefined`, `getLatestAnalysisForSession(sessionId): AnalysisRow | undefined`, `getRunningAnalysisForUsername(username, excludeSessionId?): AnalysisRow | undefined`, `hasRunningAnalysisForSession(sessionId): boolean`, `updateAnalysisStatus(id, status, error?)`.
  - `providers.ts`: `createProviderRows(analysisId, providerIds): void`, `getProviderRows(analysisId): ProviderRow[]`, `updateProvider(analysisId, provider, patch): void`, `getProviderRow(analysisId, provider): ProviderRow | undefined`, `touchProviderAttempt(analysisId, provider, now): void`.
  - Types `SessionRow`, `AnalysisRow`, `ProviderRow` exported from `apps/backend/src/db/database.ts`.

- [ ] **Step 1: Write the failing test**

`apps/backend/src/db/database.test.ts`:
```ts
import { faker } from "@faker-js/faker";
import { resetDbForTests } from "./database";
import { createSession, getSession, deleteExpiredSessions } from "./sessions";
import { createAnalysis, getAnalysis, getLatestAnalysisForSession, getRunningAnalysisForUsername, hasRunningAnalysisForSession, updateAnalysisStatus } from "./analyses";
import { createProviderRows, getProviderRows, updateProvider, getProviderRow, touchProviderAttempt } from "./providers";
import { PROVIDER_IDS } from "@repo/shared";

const s1 = faker.string.uuid();
const s2 = faker.string.uuid();
const a1 = faker.string.uuid();
const username = faker.internet.userName();

beforeEach(() => resetDbForTests());

describe("sessions", () => {
  it("creates, reads and sweeps sessions", () => {
    const now = 1_700_000_000_000;
    createSession(s1, now + 43_200_000);
    expect(getSession(s1)).toMatchObject({ id: s1 });
    expect(getSession("missing")).toBeUndefined();
    createSession(s2, now - 1_000);
    expect(deleteExpiredSessions(now)).toBe(1);
    expect(getSession(s2)).toBeUndefined();
  });
});

describe("analyses", () => {
  it("creates and reads an analysis", () => {
    createSession(s1, 1_700_000_000_000 + 43_200_000);
    createAnalysis(a1, s1, username);
    expect(getAnalysis(a1)).toMatchObject({ username });
    expect(getLatestAnalysisForSession(s1)?.id).toBe(a1);
    expect(hasRunningAnalysisForSession(s1)).toBe(true);
  });

  it("finds a running analysis for a username in another session", () => {
    createSession(s1, 1_700_000_000_000 + 43_200_000);
    createSession(s2, 1_700_000_000_000 + 43_200_000);
    createAnalysis(a1, s1, username);
    const found = getRunningAnalysisForUsername(username, s2);
    expect(found?.id).toBe(a1);
    expect(getRunningAnalysisForUsername(username, s1)).toBeUndefined();
  });

  it("updates status", () => {
    createSession(s1, 1_700_000_000_000 + 43_200_000);
    createAnalysis(a1, s1, username);
    updateAnalysisStatus(a1, "failed", "github 404");
    expect(getAnalysis(a1)).toMatchObject({ status: "failed", error: "github 404" });
  });
});

describe("providers", () => {
  it("creates and updates provider rows", () => {
    createSession(s1, 1_700_000_000_000 + 43_200_000);
    createAnalysis(a1, s1, username);
    createProviderRows(a1, PROVIDER_IDS);
    const rows = getProviderRows(a1);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "pending")).toBe(true);

    updateProvider(a1, "gemini", { status: "succeeded", progress: 100, scorecard: JSON.stringify({ provider: "gemini" }) });
    expect(getProviderRow(a1, "gemini")).toMatchObject({ status: "succeeded" });

    touchProviderAttempt(a1, "groq", 1_700_000_000_000);
    expect(getProviderRow(a1, "groq")?.lastAttemptAt).toBe(1_700_000_000_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/db/database.test.ts`
Expected: FAIL — module resolution errors.

- [ ] **Step 3: Implement the data layer**

`apps/backend/src/db/database.ts`:
```ts
import Database from "better-sqlite3";

export interface SessionRow {
  id: string;
  createdAt: number;
  expiresAt: number;
}

export interface AnalysisRow {
  id: string;
  sessionId: string;
  username: string;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  createdAt: number;
}

export interface ProviderRow {
  analysisId: string;
  provider: string;
  status: "pending" | "running" | "succeeded" | "failed";
  progress: number;
  startedAt: number | null;
  lastUpdated: number;
  completedAt: number | null;
  lastAttemptAt: number | null;
  scorecard: string | null;
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const path = process.env.DB_PATH || "data/app.db";
  if (path !== ":memory:") {
    const fs = require("fs");
    fs.mkdirSync(require("path").dirname(path), { recursive: true });
  }
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      username TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE TABLE IF NOT EXISTS providers (
      analysis_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER,
      last_updated INTEGER NOT NULL,
      completed_at INTEGER,
      last_attempt_at INTEGER,
      scorecard TEXT,
      PRIMARY KEY (analysis_id, provider)
    );
    CREATE INDEX IF NOT EXISTS idx_analyses_session ON analyses(session_id);
    CREATE INDEX IF NOT EXISTS idx_analyses_username ON analyses(username);
  `);
  return db;
}

export function resetDbForTests(): void {
  if (process.env.DB_PATH !== ":memory:") return;
  const d = getDb();
  d.exec("DROP TABLE IF EXISTS providers; DROP TABLE IF EXISTS analyses; DROP TABLE IF EXISTS sessions;");
  db = null;
}
```

`apps/backend/src/db/sessions.ts`:
```ts
import { getDb } from "./database";

export function createSession(id: string, expiresAt: number): void {
  getDb()
    .prepare("INSERT INTO sessions (id, created_at, expires_at) VALUES (?, ?, ?)")
    .run(id, Date.now(), expiresAt);
}

export function getSession(id: string) {
  return getDb()
    .prepare("SELECT id, created_at AS createdAt, expires_at AS expiresAt FROM sessions WHERE id = ?")
    .get(id) as
    | { id: string; createdAt: number; expiresAt: number }
    | undefined;
}

export function deleteExpiredSessions(now: number): number {
  return getDb().prepare("DELETE FROM sessions WHERE expires_at < ?").run(now).changes;
}
```

`apps/backend/src/db/analyses.ts`:
```ts
import { getDb, type AnalysisRow } from "./database";

export function createAnalysis(id: string, sessionId: string, username: string): void {
  getDb()
    .prepare("INSERT INTO analyses (id, session_id, username, status, error, created_at) VALUES (?, ?, ?, 'running', NULL, ?)")
    .run(id, sessionId, username, Date.now());
}

export function getAnalysis(id: string): AnalysisRow | undefined {
  const row = getDb()
    .prepare("SELECT id, session_id AS sessionId, username, status, error, created_at AS createdAt FROM analyses WHERE id = ?")
    .get(id);
  return row as AnalysisRow | undefined;
}

export function getLatestAnalysisForSession(sessionId: string): AnalysisRow | undefined {
  const row = getDb()
    .prepare("SELECT id, session_id AS sessionId, username, status, error, created_at AS createdAt FROM analyses WHERE session_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(sessionId);
  return row as AnalysisRow | undefined;
}

export function getRunningAnalysisForUsername(username: string, excludeSessionId?: string): AnalysisRow | undefined {
  const row = getDb()
    .prepare(
      "SELECT id, session_id AS sessionId, username, status, error, created_at AS createdAt FROM analyses WHERE username = ? AND status = 'running'" +
        (excludeSessionId ? " AND session_id != ?" : "")
    )
    .get(...(excludeSessionId ? [username, excludeSessionId] : [username]));
  return row as AnalysisRow | undefined;
}

export function hasRunningAnalysisForSession(sessionId: string): boolean {
  const row = getDb().prepare("SELECT id FROM analyses WHERE session_id = ? AND status = 'running' LIMIT 1").get(sessionId);
  return !!row;
}

export function updateAnalysisStatus(id: string, status: AnalysisRow["status"], error: string | null = null): void {
  getDb().prepare("UPDATE analyses SET status = ?, error = ? WHERE id = ?").run(status, error, id);
}
```

`apps/backend/src/db/providers.ts`:
```ts
import { getDb, type ProviderRow } from "./database";

export function createProviderRows(analysisId: string, providerIds: readonly string[]): void {
  const insert = getDb().prepare(
    "INSERT INTO providers (analysis_id, provider, status, progress, last_updated) VALUES (?, ?, 'pending', 0, ?)"
  );
  const now = Date.now();
  const tx = getDb().transaction(() => {
    for (const p of providerIds) insert.run(analysisId, p, now);
  });
  tx();
}

export function getProviderRows(analysisId: string): ProviderRow[] {
  return getDb()
    .prepare(
      "SELECT analysis_id AS analysisId, provider, status, progress, started_at AS startedAt, last_updated AS lastUpdated, completed_at AS completedAt, last_attempt_at AS lastAttemptAt, scorecard FROM providers WHERE analysis_id = ? ORDER BY provider"
    )
    .all(analysisId) as ProviderRow[];
}

export function getProviderRow(analysisId: string, provider: string): ProviderRow | undefined {
  return getDb()
    .prepare(
      "SELECT analysis_id AS analysisId, provider, status, progress, started_at AS startedAt, last_updated AS lastUpdated, completed_at AS completedAt, last_attempt_at AS lastAttemptAt, scorecard FROM providers WHERE analysis_id = ? AND provider = ?"
    )
    .get(analysisId, provider) as ProviderRow | undefined;
}

export function updateProvider(
  analysisId: string,
  provider: string,
  patch: Partial<Pick<ProviderRow, "status" | "progress" | "startedAt" | "completedAt" | "scorecard">>
): void {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.status !== undefined) { sets.push("status = ?"); values.push(patch.status); }
  if (patch.progress !== undefined) { sets.push("progress = ?"); values.push(patch.progress); }
  if (patch.startedAt !== undefined) { sets.push("started_at = ?"); values.push(patch.startedAt); }
  if (patch.completedAt !== undefined) { sets.push("completed_at = ?"); values.push(patch.completedAt); }
  if (patch.scorecard !== undefined) { sets.push("scorecard = ?"); values.push(patch.scorecard); }
  sets.push("last_updated = ?");
  values.push(Date.now(), analysisId, provider);
  getDb().prepare(`UPDATE providers SET ${sets.join(", ")} WHERE analysis_id = ? AND provider = ?`).run(...values);
}

export function touchProviderAttempt(analysisId: string, provider: string, now: number): void {
  getDb().prepare("UPDATE providers SET last_attempt_at = ?, last_updated = ? WHERE analysis_id = ? AND provider = ?").run(now, now, analysisId, provider);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest src/db/database.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db apps/backend/src/test-setup.ts
git commit -m "feat: add sqlite data layer for sessions, analyses and providers"
```

---

### Task 4: GitHub URL Validation + Username Extraction

**Files:**
- Create: `apps/frontend/src/utils/githubUrl.ts`
- Test: `apps/frontend/src/utils/githubUrl.test.ts`

**Interfaces:**
- Produces: `parseGithubUrl(input: string): { username: string } | null` — returns `null` for anything that is not a profile URL (`https://github.com/<username>` with a single path segment, no `login`, `orgs`, `repos` prefixes).

- [ ] **Step 1: Write the failing test**

`apps/frontend/src/utils/githubUrl.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { faker } from "@faker-js/faker";
import { parseGithubUrl } from "./githubUrl";

const username = faker.internet.userName();

describe("parseGithubUrl", () => {
  it("accepts a plain profile link", () => {
    expect(parseGithubUrl(`https://github.com/${username}`)).toEqual({ username });
    expect(parseGithubUrl(`github.com/${username}`)).toEqual({ username });
  });
  it("rejects non-profile paths", () => {
    expect(parseGithubUrl(`https://github.com/${username}/repo`)).toBeNull();
    expect(parseGithubUrl("https://github.com/login")).toBeNull();
    expect(parseGithubUrl("https://github.com/orgs/octo")).toBeNull();
    expect(parseGithubUrl(`https://github.com/repos/${username}/repo`)).toBeNull();
  });
  it("rejects garbage", () => {
    expect(parseGithubUrl("not a url")).toBeNull();
    expect(parseGithubUrl(`https://example.com/${username}`)).toBeNull();
    expect(parseGithubUrl("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/utils/githubUrl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/frontend/src/utils/githubUrl.ts`:
```ts
const GITHUB_PROFILE_RE = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})[A-Za-z0-9])\/?$/;
const RESERVED = new Set(["login", "orgs", "repos", "topics", "explore", "settings", "features", "sponsors", "marketplace", "enterprise", "search", "about", "collections", "trending", "events"]);

export function parseGithubUrl(input: string): { username: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(GITHUB_PROFILE_RE);
  if (!match) return null;
  const username = match[1];
  if (RESERVED.has(username.toLowerCase())) return null;
  return { username };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/utils/githubUrl.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/utils/githubUrl.ts apps/frontend/src/utils/githubUrl.test.ts
git commit -m "feat: add github profile url validation"
```

---

### Task 5: Frontend Scaffold (Vue + Vite + Pinia + Vitest)

**Files:**
- Create: `apps/frontend/package.json`
- Create: `apps/frontend/tsconfig.json`
- Create: `apps/frontend/vite.config.ts`
- Create: `apps/frontend/index.html`
- Create: `apps/frontend/src/main.ts`
- Create: `apps/frontend/src/App.vue`
- Create: `apps/frontend/src/router.ts`
- Create: `apps/frontend/src/stores/session.ts`
- Test: `apps/frontend/src/stores/session.test.ts`

**Interfaces:**
- Consumes: `parseGithubUrl` from Task 4 (used later).
- Produces: runnable frontend with Pinia store `useSessionStore` exposing `sessionId: string | null`, `ensureSession(): string` (synchronous; `crypto.randomUUID()` is sync and all later tasks call it without await), `resetSession(): void` (writes/reads localStorage key `github-analyzer.session`).

- [ ] **Step 1: Write the failing test**

`apps/frontend/src/stores/session.test.ts`:
```ts
import { describe, expect, it, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useSessionStore } from "./session";

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe("session store", () => {
  it("reuses a stored session id", () => {
    localStorage.setItem("github-analyzer.session", "abc");
    const store = useSessionStore();
    expect(store.sessionId).toBe("abc");
  });
  it("creates a new session id when none stored", () => {
    const store = useSessionStore();
    store.ensureSession();
    expect(store.sessionId).toMatch(/^[a-z0-9-]{36}$/);
    expect(localStorage.getItem("github-analyzer.session")).toBe(store.sessionId);
  });
  it("resetSession clears storage", () => {
    const store = useSessionStore();
    store.ensureSession();
    store.resetSession();
    expect(store.sessionId).toBeNull();
    expect(localStorage.getItem("github-analyzer.session")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/stores/session.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the scaffold**

`apps/frontend/package.json`:
```json
{
  "name": "@repo/frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "pinia": "^2.2.0",
    "vue": "^3.4.0",
    "vue-router": "^4.4.0"
  },
  "devDependencies": {
    "@faker-js/faker": "^8.4.1",
    "@vitejs/plugin-vue": "^5.0.0",
    "@vue/test-utils": "^2.4.6",
    "eslint-plugin-vue": "^9.27.0",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^1.6.0",
    "vue-tsc": "^2.0.0"
  }
}
```

`apps/frontend/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "outDir": "./dist",
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "vite.config.ts"]
}
```

`apps/frontend/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

`apps/frontend/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GitHub Profile Analyzer</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`apps/frontend/src/main.ts`:
```ts
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";

createApp(App).use(createPinia()).use(router).mount("#app");
```

`apps/frontend/src/App.vue`:
```vue
<template>
  <router-view />
</template>
```

`apps/frontend/src/router.ts`:
```ts
import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./pages/HomeView.vue";
import AnalysisView from "./pages/AnalysisView.vue";
import ReportView from "./pages/ReportView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomeView },
    { path: "/analysis", component: AnalysisView },
    { path: "/report/:id", component: ReportView, props: true },
  ],
});
```

Create placeholder pages (empty `<template><div></div></template>`) `HomeView.vue`, `AnalysisView.vue`, `ReportView.vue`.

`apps/frontend/src/stores/session.ts`:
```ts
import { defineStore } from "pinia";
import { ref } from "vue";

const STORAGE_KEY = "github-analyzer.session";

export const useSessionStore = defineStore("session", () => {
  const sessionId = ref<string | null>(localStorage.getItem(STORAGE_KEY));

  function ensureSession(): string {
    if (sessionId.value) return sessionId.value;
    const id = crypto.randomUUID();
    sessionId.value = id;
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  }

  function resetSession(): void {
    sessionId.value = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  return { sessionId, ensureSession, resetSession };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/stores/session.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend
git commit -m "feat: scaffold vue frontend with session store"
```

---

### Task 6: GitHub Client + Data Snapshot

**Files:**
- Create: `apps/backend/src/github/client.ts`
- Create: `apps/backend/src/github/snapshot.ts`
- Test: `apps/backend/src/github/client.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `types.ts` in `src/github`: `GitHubProfile`, `GitHubRepo`, `GitHubSnapshot`.
  - `fetchGitHubData(username: string): Promise<GitHubSnapshot>` — uses global `fetch`, honors `GITHUB_TOKEN` (optional) as `Authorization: Bearer`.
  - `buildSnapshot(profile, repos): GitHubSnapshot` — also derives language counts and an activity summary.
  - `GitHubFetchError extends Error` with `status` field (e.g. 404).

- [ ] **Step 1: Write the failing test**

`apps/backend/src/github/client.test.ts`:
```ts
import { faker } from "@faker-js/faker";
import { buildSnapshot } from "./client";
import type { GitHubProfile, GitHubRepo } from "./types";

const username = faker.internet.userName();

const profile: GitHubProfile = {
  login: username,
  name: faker.person.fullName(),
  bio: faker.lorem.sentence(),
  followers: faker.number.int({ min: 1, max: 1000 }),
  following: faker.number.int({ min: 0, max: 100 }),
  public_repos: 2,
  created_at: "2011-01-01T00:00:00Z",
  location: null,
  company: null,
  avatar_url: `https://avatars.githubusercontent.com/${username}?v=4`,
  html_url: `https://github.com/${username}`,
};

const repos: GitHubRepo[] = [
  { name: "tslib", description: "TS lib", language: "TypeScript", topics: ["ts"], stargazers_count: 5, forks_count: 1, watchers_count: 5, updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), fork: false },
  { name: "hello", description: null, language: "JavaScript", topics: [], stargazers_count: 3, forks_count: 0, watchers_count: 3, updated_at: "2024-05-01T00:00:00Z", fork: false },
];

describe("buildSnapshot", () => {
  it("aggregates language counts", () => {
    const snapshot = buildSnapshot(profile, repos);
    expect(snapshot.languages).toEqual([
      { language: "TypeScript", count: 1 },
      { language: "JavaScript", count: 1 },
    ]);
  });
  it("exposes repo popularity and activity", () => {
    const snapshot = buildSnapshot(profile, repos);
    expect(snapshot.profile.username).toBe(username);
    expect(snapshot.repos[0].stars).toBe(5);
    expect(snapshot.activity.repoCount).toBe(2);
    expect(snapshot.activity.recentCommits).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/github/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/backend/src/github/types.ts`:
```ts
export interface GitHubProfile {
  login: string;
  name: string | null;
  bio: string | null;
  followers: number;
  following: number;
  public_repos: number;
  created_at: string;
  location: string | null;
  company: string | null;
  avatar_url: string;
  html_url: string;
}

export interface GitHubRepo {
  name: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  updated_at: string;
  fork: boolean;
}

export interface GitHubSnapshot {
  profile: {
    username: string;
    name: string | null;
    bio: string | null;
    followers: number;
    following: number;
    repoCount: number;
    createdAt: string;
    location: string | null;
    company: string | null;
    avatarUrl: string;
  };
  repos: Array<{
    name: string;
    description: string | null;
    language: string | null;
    topics: string[];
    stars: number;
    forks: number;
    watchers: number;
    updatedAt: string;
  }>;
  languages: Array<{ language: string; count: number }>;
  activity: { recentCommits: number; lastPush: string | null; repoCount: number };
}

export class GitHubFetchError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "GitHubFetchError";
  }
}
```

`apps/backend/src/github/client.ts`:
```ts
import { GitHubFetchError, type GitHubProfile, type GitHubRepo, type GitHubSnapshot } from "./types";

const BASE = "https://api.github.com";

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new GitHubFetchError(`GitHub API ${res.status}`, res.status);
  return (await res.json()) as T;
}

export async function fetchGitHubData(username: string): Promise<GitHubSnapshot> {
  const profile = await get<GitHubProfile>(`${BASE}/users/${encodeURIComponent(username)}`);
  const repos = await get<GitHubRepo[]>(`${BASE}/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`);
  return buildSnapshot(profile, repos);
}

export function buildSnapshot(profile: GitHubProfile, repos: GitHubRepo[]): GitHubSnapshot {
  const languageCounts = new Map<string, number>();
  for (const repo of repos) {
    if (repo.language) languageCounts.set(repo.language, (languageCounts.get(repo.language) ?? 0) + 1);
  }
  const languages = Array.from(languageCounts.entries())
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count);

  const recentWindow = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recentCommits = repos.filter((r) => new Date(r.updated_at).getTime() >= recentWindow).length;
  const lastPush = repos.length ? [...repos].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0].updated_at : null;

  return {
    profile: {
      username: profile.login,
      name: profile.name,
      bio: profile.bio,
      followers: profile.followers,
      following: profile.following,
      repoCount: profile.public_repos,
      createdAt: profile.created_at,
      location: profile.location,
      company: profile.company,
      avatarUrl: profile.avatar_url,
    },
    repos: repos
      .filter((r) => !r.fork)
      .map((r) => ({
        name: r.name,
        description: r.description,
        language: r.language,
        topics: r.topics,
        stars: r.stargazers_count,
        forks: r.forks_count,
        watchers: r.watchers_count,
        updatedAt: r.updated_at,
      })),
    languages,
    activity: { recentCommits, lastPush, repoCount: repos.length },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest src/github/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/github
git commit -m "feat: add github data client and snapshot builder"
```

---

### Task 7: LLM Provider Interface + Prompt Builder

**Files:**
- Create: `apps/backend/src/llm/provider.ts`
- Create: `apps/backend/src/llm/prompts.ts`
- Create: `apps/backend/src/llm/json.ts`
- Test: `apps/backend/src/llm/prompts.test.ts`

**Interfaces:**
- Consumes: `GitHubSnapshot` (Task 6), `Scorecard`/`ProviderId` from `@repo/shared`.
- Produces:
  - `interface LLMProvider { id: ProviderId; displayName: string; analyze(ctx: AnalyzeContext): Promise<Scorecard> }`.
  - `interface AnalyzeContext { snapshot: GitHubSnapshot; onProgress: (p: number) => void }`.
  - `buildSystemPrompt(): string`, `buildUserPrompt(snapshot: GitHubSnapshot): string`.
  - `parseScorecardJson(raw: string, provider: ProviderId): Scorecard` — validates with `ScorecardSchema`, throws `ScorecardParseError` on failure.
  - `extractJson(text: string): string` — strips markdown fences if present.

- [ ] **Step 1: Write the failing test**

`apps/backend/src/llm/prompts.test.ts`:
```ts
import { extractJson, parseScorecardJson } from "./json";

describe("extractJson", () => {
  it("strips markdown fences", () => {
    const text = '```json\n{"a": 1}\n```';
    expect(extractJson(text)).toBe('{"a": 1}');
  });
});

describe("parseScorecardJson", () => {
  it("parses and validates a full scorecard", () => {
    const raw = JSON.stringify({
      provider: "gemini",
      status: "succeeded",
      progress: 100,
      startedAt: null,
      lastUpdated: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      dimensions: [
        { key: "code_quality", label: "Code Quality", score: 8 },
        { key: "languages", label: "Languages", score: 7 },
        { key: "contribution", label: "Contribution Activity", score: 6 },
        { key: "project_depth", label: "Project Depth", score: 9 },
        { key: "oss_experience", label: "Open Source Experience", score: 7 },
      ],
      top_repos: [],
      strengths: ["x"],
      gaps: ["y"],
      verdict: { leaning: "hire", summary: "ok" },
    });
    const scorecard = parseScorecardJson(raw, "gemini");
    expect(scorecard.provider).toBe("gemini");
    expect(scorecard.dimensions).toHaveLength(5);
  });

  it("throws on invalid input", () => {
    expect(() => parseScorecardJson('{"provider":"gemini"}', "gemini")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/llm/prompts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/backend/src/llm/provider.ts`:
```ts
import type { ProviderId, Scorecard } from "@repo/shared";
import type { GitHubSnapshot } from "../github/types";

export interface AnalyzeContext {
  snapshot: GitHubSnapshot;
  onProgress: (progress: number) => void;
}

export interface LLMProvider {
  id: ProviderId;
  displayName: string;
  analyze(ctx: AnalyzeContext): Promise<Scorecard>;
}
```

`apps/backend/src/llm/prompts.ts`:
```ts
import type { GitHubSnapshot } from "../github/types";

const DIMENSIONS = [
  { key: "code_quality", label: "Code Quality" },
  { key: "languages", label: "Languages" },
  { key: "contribution", label: "Contribution Activity" },
  { key: "project_depth", label: "Project Depth" },
  { key: "oss_experience", label: "Open Source Experience" },
];

export function buildSystemPrompt(): string {
  return `You are a technical recruiter evaluating a candidate's GitHub profile.
Score each dimension from 1 (very weak) to 10 (excellent). Be honest and evidence-based.
Respond ONLY with a JSON object (no markdown fences) matching exactly this shape:
{
  "provider": "<your id>",
  "dimensions": [
    { "key": "code_quality", "label": "Code Quality", "score": <1-10> },
    { "key": "languages", "label": "Languages", "score": <1-10> },
    { "key": "contribution", "label": "Contribution Activity", "score": <1-10> },
    { "key": "project_depth", "label": "Project Depth", "score": <1-10> },
    { "key": "oss_experience", "label": "Open Source Experience", "score": <1-10> }
  ],
  "top_repos": [{ "name": "<repo name>", "stars": <int>, "description": "<short>", "reason": "<why this repo stands out>" }],
  "strengths": ["<strength>"],
  "gaps": ["<gap>"],
  "verdict": { "leaning": "hire|no_hire|uncertain", "summary": "<1-2 sentence verdict>" }
}`;
}

export function buildUserPrompt(snapshot: GitHubSnapshot): string {
  const repoLines = snapshot.repos
    .map(
      (r) =>
        `- ${r.name} (${r.language ?? "n/a"}) ⭐${r.stars} forks:${r.forks} updated:${r.updatedAt} topics:[${r.topics.join(", ")}] desc:${r.description ?? "none"}`
    )
    .slice(0, 30)
    .join("\n");

  return `Candidate GitHub profile:
- username: ${snapshot.profile.username}
- name: ${snapshot.profile.name ?? "n/a"}
- bio: ${snapshot.profile.bio ?? "n/a"}
- followers: ${snapshot.profile.followers}, following: ${snapshot.profile.following}
- account created: ${snapshot.profile.createdAt}
- location: ${snapshot.profile.location ?? "n/a"}
- company: ${snapshot.profile.company ?? "n/a"}

Languages:
${snapshot.languages.map((l) => `- ${l.language}: ${l.count} repo(s)`).join("\n")}

Activity:
- repos: ${snapshot.activity.repoCount}
- repos updated in last 90 days: ${snapshot.activity.recentCommits}
- last push: ${snapshot.activity.lastPush ?? "n/a"}

Top repos:
${repoLines}`;
}
```

`apps/backend/src/llm/json.ts`:
```ts
import { ScorecardSchema, type ProviderId, type Scorecard } from "@repo/shared";

export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return candidate;
  return candidate.slice(start, end + 1);
}

export class ScorecardParseError extends Error {
  constructor(message: string, public raw: string) {
    super(message);
    this.name = "ScorecardParseError";
  }
}

export function parseScorecardJson(raw: string, provider: ProviderId): Scorecard {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new ScorecardParseError("Invalid JSON from provider", raw);
  }
  const result = ScorecardSchema.safeParse({ ...parsed, provider, status: "succeeded", progress: 100 });
  if (!result.success) {
    throw new ScorecardParseError(`Schema validation failed: ${result.error.message}`, raw);
  }
  return result.data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest src/llm/prompts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/llm
git commit -m "feat: add llm provider interface, prompts and json parsing"
```

---

### Task 8: LLM Provider Implementations (Gemini, Groq, OpenRouter)

**Files:**
- Create: `apps/backend/src/llm/gemini.ts`
- Create: `apps/backend/src/llm/groq.ts`
- Create: `apps/backend/src/llm/openrouter.ts`
- Create: `apps/backend/src/llm/index.ts`
- Test: `apps/backend/src/llm/providers.test.ts`

**Interfaces:**
- Consumes: `LLMProvider`/`AnalyzeContext` (Task 7), `buildSystemPrompt`/`buildUserPrompt`, `parseScorecardJson`.
- Produces: `export const providers: LLMProvider[]` (three instances) and `getProvider(id): LLMProvider` from `apps/backend/src/llm/index.ts`.

- [ ] **Step 1: Write the failing test**

`apps/backend/src/llm/providers.test.ts`:
```ts
import { providers, getProvider } from "./index";

describe("providers", () => {
  it("exposes exactly the three providers", () => {
    expect(providers.map((p) => p.id).sort()).toEqual(["gemini", "groq", "openrouter"]);
  });
  it("getProvider returns a provider by id", () => {
    expect(getProvider("gemini").id).toBe("gemini");
    expect(() => getProvider("x" as never)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/llm/providers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the three providers**

`apps/backend/src/llm/gemini.ts`:
```ts
import type { AnalyzeContext, LLMProvider } from "./provider";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { parseScorecardJson } from "./json";

const API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export class GeminiProvider implements LLMProvider {
  id = "gemini" as const;
  displayName = "Gemini";
  async analyze(ctx: AnalyzeContext): Promise<ReturnType<typeof parseScorecardJson>> {
    ctx.onProgress(20);
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: [{ parts: [{ text: buildUserPrompt(ctx.snapshot) }] }],
      }),
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}`);
    ctx.onProgress(70);
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) throw new Error("Gemini returned empty response");
    const scorecard = parseScorecardJson(text, this.id);
    ctx.onProgress(100);
    return scorecard;
  }
}
```

`apps/backend/src/llm/groq.ts`:
```ts
import type { AnalyzeContext, LLMProvider } from "./provider";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { parseScorecardJson } from "./json";

const API = "https://api.groq.com/openai/v1/chat/completions";

export class GroqProvider implements LLMProvider {
  id = "groq" as const;
  displayName = "Groq";
  async analyze(ctx: AnalyzeContext): Promise<ReturnType<typeof parseScorecardJson>> {
    ctx.onProgress(20);
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY is not set");
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(ctx.snapshot) },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`Groq API ${res.status}`);
    ctx.onProgress(70);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Groq returned empty response");
    const scorecard = parseScorecardJson(text, this.id);
    ctx.onProgress(100);
    return scorecard;
  }
}
```

`apps/backend/src/llm/openrouter.ts`:
```ts
import type { AnalyzeContext, LLMProvider } from "./provider";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { parseScorecardJson } from "./json";

const API = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterProvider implements LLMProvider {
  id = "openrouter" as const;
  displayName = "OpenRouter";
  async analyze(ctx: AnalyzeContext): Promise<ReturnType<typeof parseScorecardJson>> {
    ctx.onProgress(20);
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY is not set");
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "HTTP-Referer": "http://localhost:3000" },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct:free",
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(ctx.snapshot) },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter API ${res.status}`);
    ctx.onProgress(70);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("OpenRouter returned empty response");
    const scorecard = parseScorecardJson(text, this.id);
    ctx.onProgress(100);
    return scorecard;
  }
}
```

`apps/backend/src/llm/index.ts`:
```ts
import type { ProviderId } from "@repo/shared";
import type { LLMProvider } from "./provider";
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { OpenRouterProvider } from "./openrouter";

export const providers: LLMProvider[] = [new GeminiProvider(), new GroqProvider(), new OpenRouterProvider()];

export function getProvider(id: ProviderId): LLMProvider {
  const found = providers.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown provider: ${id}`);
  return found;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest src/llm/providers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/llm
git commit -m "feat: add gemini, groq and openrouter providers"
```

---

### Task 9: Analysis Runner (orchestration + progress + WS emit)

**Files:**
- Create: `apps/backend/src/analysis/runner.ts`
- Create: `apps/backend/src/analysis/types.ts`
- Test: `apps/backend/src/analysis/runner.test.ts`

**Interfaces:**
- Consumes: `fetchGitHubData` (Task 6), `providers` (Task 8), DB functions (Task 3), `ScorecardSchema` from shared.
- Produces:
  - `type AnalysisEvent` in `src/analysis/types.ts`:
    ```ts
    export type AnalysisEvent =
      | { type: "provider-update"; analysisId: string; provider: ProviderId; status: ProviderStatus; progress: number; lastUpdated: string }
      | { type: "final"; analysisId: string; status: AnalysisStatus; error?: string };
    ```
  - `type EventSink = (event: AnalysisEvent) => void`.
  - `runAnalysis(analysisId: string, username: string, sink: EventSink): Promise<void>` — fetches data, runs providers in parallel, persists every status change, updates the analysis row, and emits `final`.
  - `runProviders(analysisId: string, snapshot, sink): Promise<void>` (exported for tests).

- [ ] **Step 1: Write the failing test**

`apps/backend/src/analysis/runner.test.ts`:
```ts
import { faker } from "@faker-js/faker";
import { runProviders } from "./runner";
import type { GitHubSnapshot } from "../github/types";
import type { LLMProvider } from "../llm/provider";
import type { Scorecard } from "@repo/shared";
import { createSession } from "../db/sessions";
import { createAnalysis } from "../db/analyses";
import { createProviderRows, getProviderRows } from "../db/providers";
import { resetDbForTests } from "../db/database";

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

function makeScorecard(provider: "gemini" | "groq" | "openrouter"): Scorecard {
  const dims = [
    "code_quality", "languages", "contribution", "project_depth", "oss_experience",
  ].map((key, i) => ({ key, label: key, score: 10 - i } as Scorecard["dimensions"][number]));
  return {
    provider,
    status: "succeeded",
    progress: 100,
    startedAt: null,
    lastUpdated: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    dimensions: dims,
    top_repos: [],
    strengths: [faker.lorem.word()],
    gaps: [],
    verdict: { leaning: "hire", summary: faker.lorem.sentence() },
  };
}

const snapshot: GitHubSnapshot = {
  profile: { username, name: null, bio: null, followers: 1, following: 0, repoCount: 1, createdAt: "2020-01-01T00:00:00Z", location: null, company: null, avatarUrl: "" },
  repos: [{ name: faker.internet.domainWord(), description: null, language: "TS", topics: [], stars: 1, forks: 0, watchers: 1, updatedAt: "2026-01-01T00:00:00Z" }],
  languages: [{ language: "TS", count: 1 }],
  activity: { recentCommits: 1, lastPush: "2026-01-01T00:00:00Z", repoCount: 1 },
};

function makeProvider(id: string, fail = false): LLMProvider {
  return {
    id: id as "gemini" | "groq" | "openrouter",
    displayName: id,
    async analyze(ctx) {
      ctx.onProgress(50);
      if (fail) throw new Error("boom");
      return makeScorecard(id as "gemini" | "groq" | "openrouter");
    },
  };
}

beforeEach(() => resetDbForTests());

describe("runProviders", () => {
  it("marks each provider succeeded and emits final", async () => {
    createSession(sessionId, 1_700_000_000_000 + 43_200_000);
    createAnalysis(analysisId, sessionId, username);
    createProviderRows(analysisId, ["gemini", "groq", "openrouter"]);

    const events: unknown[] = [];
    await runProviders(analysisId, snapshot, ["gemini", "groq", "openrouter"], makeProvider, (e) => events.push(e));

    const rows = getProviderRows(analysisId);
    expect(rows.every((r) => r.status === "succeeded")).toBe(true);
    expect(events.some((e) => (e as { type: string }).type === "final")).toBe(true);
  });

  it("marks a failing provider failed without failing others", async () => {
    createSession(sessionId, 1_700_000_000_000 + 43_200_000);
    createAnalysis(analysisId, sessionId, username);
    createProviderRows(analysisId, ["gemini", "groq", "openrouter"]);

    await runProviders(
      analysisId,
      snapshot,
      ["gemini", "groq", "openrouter"],
      (id) => makeProvider(id, id === "gemini"),
      () => {}
    );

    const rows = getProviderRows(analysisId);
    expect(rows.find((r) => r.provider === "gemini")?.status).toBe("failed");
    expect(rows.filter((r) => r.status === "succeeded")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/analysis/runner.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the runner**

`apps/backend/src/analysis/types.ts`:
```ts
import type { AnalysisStatus, ProviderId, ProviderStatus } from "@repo/shared";

export type AnalysisEvent =
  | { type: "provider-update"; analysisId: string; provider: ProviderId; status: ProviderStatus; progress: number; lastUpdated: string }
  | { type: "final"; analysisId: string; status: AnalysisStatus; error?: string };

export type EventSink = (event: AnalysisEvent) => void;
```

`apps/backend/src/analysis/runner.ts`:
```ts
import { getProviderRows, updateProvider, touchProviderAttempt } from "../db/providers";
import { updateAnalysisStatus } from "../db/analyses";
import { fetchGitHubData, GitHubFetchError } from "../github/client";
import type { GitHubSnapshot } from "../github/types";
import type { LLMProvider } from "../llm/provider";
import { getProvider } from "../llm";
import type { EventSink } from "./types";

type ProviderFactory = (id: string) => LLMProvider;

export async function runProviders(
  analysisId: string,
  snapshot: GitHubSnapshot,
  providerIds: string[],
  factory: ProviderFactory,
  sink: EventSink
): Promise<void> {
  await Promise.all(
    providerIds.map(async (pid) => {
      const now = Date.now();
      touchProviderAttempt(analysisId, pid, now);
      updateProvider(analysisId, pid, { status: "running", startedAt: now });
      sink({
        type: "provider-update",
        analysisId,
        provider: pid as never,
        status: "running",
        progress: 0,
        lastUpdated: new Date().toISOString(),
      });
      try {
        const provider = factory(pid);
        const scorecard = await provider.analyze({
          snapshot,
          onProgress: (progress) => {
            updateProvider(analysisId, pid, { progress });
            sink({
              type: "provider-update",
              analysisId,
              provider: pid as never,
              status: "running",
              progress,
              lastUpdated: new Date().toISOString(),
            });
          },
        });
        updateProvider(analysisId, pid, {
          status: "succeeded",
          progress: 100,
          completedAt: Date.now(),
          scorecard: JSON.stringify(scorecard),
        });
        sink({
          type: "provider-update",
          analysisId,
          provider: pid as never,
          status: "succeeded",
          progress: 100,
          lastUpdated: new Date().toISOString(),
        });
      } catch (err) {
        updateProvider(analysisId, pid, { status: "failed", completedAt: Date.now() });
        sink({
          type: "provider-update",
          analysisId,
          provider: pid as never,
          status: "failed",
          progress: getProviderRows(analysisId).find((r) => r.provider === pid)?.progress ?? 0,
          lastUpdated: new Date().toISOString(),
        });
      }
    })
  );

  const rows = getProviderRows(analysisId);
  const anySucceeded = rows.some((r) => r.status === "succeeded");
  const anyFailed = rows.some((r) => r.status === "failed");
  const status = anySucceeded && !anyFailed ? "succeeded" : "failed";
  updateAnalysisStatus(analysisId, status);
  sink({ type: "final", analysisId, status });
}

export async function runAnalysis(analysisId: string, username: string, sink: EventSink): Promise<void> {
  try {
    const snapshot = await fetchGitHubData(username);
    sink({ type: "provider-update", analysisId, provider: "gemini", status: "running", progress: 5, lastUpdated: new Date().toISOString() });
    await runProviders(analysisId, snapshot, ["gemini", "groq", "openrouter"], (id) => getProvider(id as never), sink);
  } catch (err) {
    const msg = err instanceof GitHubFetchError ? `GitHub error ${err.status}: ${err.message}` : `Analysis error: ${String(err)}`;
    updateAnalysisStatus(analysisId, "failed", msg);
    for (const pid of ["gemini", "groq", "openrouter"]) {
      updateProvider(analysisId, pid, { status: "failed", completedAt: Date.now() });
    }
    sink({ type: "final", analysisId, status: "failed", error: msg });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest src/analysis/runner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/analysis
git commit -m "feat: add analysis runner with provider orchestration"
```

---

### Task 10: WebSocket Hub + Custom Next.js Server

**Files:**
- Create: `apps/backend/src/ws/hub.ts`
- Create: `apps/backend/server.ts`
- Create: `apps/backend/src/ws/hub.test.ts`

**Interfaces:**
- Consumes: `AnalysisEvent` (Task 9).
- Produces:
  - `wsHub` singleton in `src/ws/hub.ts`: `subscribe(analysisId: string, ws: WebSocket): () => void`, `publish(analysisId: string, event: AnalysisEvent): void`, `setRunningChecker(fn: (analysisId: string) => boolean): void`.
  - `server.ts` — custom HTTP server that mounts Next.js and a `WebSocketServer` at path `/ws`, using `wsHub`.
  - Exported `createWssHandler(getAnalysisById)` helper in `src/ws/hub.ts` for testability: on connection, looks up the analysis; if not `running`, closes immediately.

- [ ] **Step 1: Write the failing test**

`apps/backend/src/ws/hub.test.ts`:
```ts
import { wsHub } from "./hub";
import type { WebSocket } from "ws";

describe("wsHub", () => {
  it("publishes only to subscribers of that analysis", () => {
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    const fakeA = { send: (m: string) => receivedA.push(JSON.parse(m)) } as unknown as WebSocket;
    const fakeB = { send: (m: string) => receivedB.push(JSON.parse(m)) } as unknown as WebSocket;

    wsHub.subscribe("a1", fakeA);
    wsHub.subscribe("a2", fakeB);
    wsHub.publish("a1", { type: "final", analysisId: "a1", status: "succeeded" });

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(0);
  });

  it("stops publishing after unsubscribe", () => {
    const received: unknown[] = [];
    const fake = { send: (m: string) => received.push(JSON.parse(m)) } as unknown as WebSocket;
    const unsubscribe = wsHub.subscribe("a1", fake);
    unsubscribe();
    wsHub.publish("a1", { type: "final", analysisId: "a1", status: "succeeded" });
    expect(received).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/ws/hub.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the hub**

`apps/backend/src/ws/hub.ts`:
```ts
import type { WebSocket } from "ws";
import type { AnalysisEvent } from "../analysis/types";

class WsHub {
  private subscribers = new Map<string, Set<WebSocket>>();
  private runningChecker: ((analysisId: string) => boolean) | null = null;

  setRunningChecker(fn: (analysisId: string) => boolean): void {
    this.runningChecker = fn;
  }

  subscribe(analysisId: string, ws: WebSocket): () => void {
    const set = this.subscribers.get(analysisId) ?? new Set<WebSocket>();
    set.add(ws);
    this.subscribers.set(analysisId, set);
    ws.on("close", () => this.unsubscribe(analysisId, ws));
    return () => this.unsubscribe(analysisId, ws);
  }

  private unsubscribe(analysisId: string, ws: WebSocket): void {
    const set = this.subscribers.get(analysisId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) this.subscribers.delete(analysisId);
  }

  publish(analysisId: string, event: AnalysisEvent): void {
    const set = this.subscribers.get(analysisId);
    if (!set) return;
    const payload = JSON.stringify(event);
    for (const ws of set) {
      if (ws.readyState === 1) ws.send(payload); // WebSocket.OPEN === 1
    }
  }

  canSubscribe(analysisId: string): boolean {
    return this.runningChecker ? this.runningChecker(analysisId) : true;
  }
}

export const wsHub = new WsHub();
```

`apps/backend/server.ts`:
```ts
import next from "next";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { wsHub } from "./src/ws/hub";
import { getAnalysis } from "./src/db/analyses";
import { getProviderRows } from "./src/db/providers";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  wsHub.setRunningChecker((analysisId) => getAnalysis(analysisId)?.status === "running");

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname !== "/ws") return;
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const analysisId = url.searchParams.get("analysisId");
      if (!analysisId || !wsHub.canSubscribe(analysisId)) {
        ws.close(4001, "no running analysis");
        return;
      }
      wsHub.subscribe(analysisId, ws);
      const snapshot = buildStateSnapshot(analysisId);
      ws.send(JSON.stringify({ type: "state", analysisId, ...snapshot }));
    });
  });

  server.listen(3000, () => console.log("backend on http://localhost:3000"));
});

function buildStateSnapshot(analysisId: string) {
  const analysis = getAnalysis(analysisId);
  if (!analysis) return { providers: [], status: "failed" };
  const providers = getProviderRows(analysisId).map((row) => {
    const scorecard = row.scorecard ? JSON.parse(row.scorecard) : null;
    return {
      provider: row.provider,
      status: row.status,
      progress: row.progress,
      lastUpdated: new Date(row.lastUpdated).toISOString(),
      scorecard: scorecard ? ScorecardSchema.parse(scorecard) : null,
    };
  });
  return { status: analysis.status, error: analysis.error, username: analysis.username, providers };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest src/ws/hub.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/ws apps/backend/server.ts
git commit -m "feat: add websocket hub and custom next server"
```

---

### Task 11: API Routes — session, analyze, analysis, report, retry

**Files:**
- Create: `apps/backend/pages/api/session.ts`
- Create: `apps/backend/pages/api/analyze.ts`
- Create: `apps/backend/pages/api/analysis/index.ts`
- Create: `apps/backend/pages/api/analysis/[id].ts`
- Create: `apps/backend/pages/api/analysis/[id]/report.ts`
- Create: `apps/backend/pages/api/analysis/[id]/retry.ts`
- Create: `apps/backend/src/api/helpers.ts`
- Create: `apps/backend/src/api/router.ts`
- Test: `apps/backend/src/api/routes.test.ts`

**Interfaces:**
- Consumes: DB layer (Task 3), `runAnalysis` (Task 9), `wsHub` (Task 10), `getProvider` (Task 8).
- Produces: the full HTTP API:
  - `POST /api/session` → `201 { sessionId, expiresAt }`.
  - `POST /api/analyze` body `{ username }` → `201 { analysisId, username, shared: false }` | `200 { analysisId, username, shared: true }` | `409`.
  - `GET /api/analysis?sessionId=...` → latest analysis summary or `{ analysis: null }`.
  - `GET /api/analysis/:id` → analysis summary (from `[id].ts`).
  - `GET /api/analysis/:id/report` → `200 { scorecards }` | `425` while running.
  - `POST /api/analysis/:id/retry` body `{ sessionId, provider }` → `201 { shared: false }` | `200 { shared: true }` | `429 { retryAfterSeconds }`.

- [ ] **Step 1: Write the failing test**

`apps/backend/src/api/routes.test.ts`:
```ts
import { faker } from "@faker-js/faker";
import { createMockReqRes } from "../test-helpers";
import { sessionHandler } from "../../pages/api/session";
import { analyzeHandler } from "../../pages/api/analyze";
import { retryHandler } from "../../pages/api/analysis/[id]/retry";
import { resetDbForTests } from "../db/database";
import { createSession } from "../db/sessions";
import { createAnalysis } from "../db/analyses";
import { createProviderRows, getProviderRow, touchProviderAttempt } from "../db/providers";

jest.mock("../../src/api/router", () => ({
  startAnalysisAsync: jest.fn(),
}));

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

beforeEach(() => {
  resetDbForTests();
  jest.clearAllMocks();
});

describe("session", () => {
  it("creates a session", async () => {
    const { req, res } = createMockReqRes();
    await sessionHandler(req, res);
    expect(res.statusCode).toBe(201);
    const body = res._getJSON() as { sessionId: string; expiresAt: number };
    expect(body.sessionId).toBeTruthy();
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe("analyze", () => {
  it("returns 401 for unknown session", async () => {
    const { req, res } = createMockReqRes();
    req.body = { username };
    req.headers = { "x-session-id": "nope" };
    await analyzeHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 for a new analysis", async () => {
    createSession(sessionId, Date.now() + 43_200_000);
    const { req, res } = createMockReqRes();
    req.body = { username };
    req.headers = { "x-session-id": sessionId };
    await analyzeHandler(req, res);
    expect(res.statusCode).toBe(201);
  });

  it("returns 409 when the session already has a running analysis", async () => {
    createSession(sessionId, Date.now() + 43_200_000);
    createAnalysis(analysisId, sessionId, faker.internet.userName());
    const { req, res } = createMockReqRes();
    req.body = { username };
    req.headers = { "x-session-id": sessionId };
    await analyzeHandler(req, res);
    expect(res.statusCode).toBe(409);
  });
});

describe("retry", () => {
  it("returns 429 inside the 45s cooldown", async () => {
    createSession(sessionId, Date.now() + 43_200_000);
    createAnalysis(analysisId, sessionId, username);
    createProviderRows(analysisId, ["gemini", "groq", "openrouter"]);
    touchProviderAttempt(analysisId, "gemini", Date.now() - 10_000);
    const { req, res } = createMockReqRes();
    req.body = { sessionId, provider: "gemini" };
    req.query = { id: analysisId };
    await retryHandler(req, res);
    expect(res.statusCode).toBe(429);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/api/routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the helpers and routes**

`apps/backend/src/api/helpers.ts`:
```ts
import type { NextApiResponse } from "next";
import { getSession } from "../db/sessions";

export function sendJson(res: NextApiResponse, status: number, payload: unknown): void {
  res.status(status).json(payload);
}

export function requireSession(sessionId: string): string | null {
  const session = getSession(sessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) return null;
  return session.id;
}

export function getHeader(req: { headers: Record<string, string | string[] | undefined> }, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}
```

`apps/backend/src/api/router.ts`:
```ts
import { wsHub } from "../ws/hub";
import { runAnalysis } from "../analysis/runner";

export function startAnalysisAsync(analysisId: string, username: string): void {
  runAnalysis(analysisId, username, (event) => {
    if (event.type === "provider-update") wsHub.publish(event.analysisId, event);
    if (event.type === "final") wsHub.publish(event.analysisId, event);
  });
}
```

`apps/backend/pages/api/session.ts`:
```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { createSession } from "../../src/db/sessions";
import { sendJson } from "../../src/api/helpers";

export async function sessionHandler(_req: NextApiRequest, res: NextApiResponse) {
  const sessionId = randomUUID();
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  createSession(sessionId, expiresAt);
  sendJson(res, 201, { sessionId, expiresAt });
}

export default sessionHandler;
```

`apps/backend/pages/api/analyze.ts`:
```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { requireSession, sendJson, getHeader } from "../../src/api/helpers";
import { createAnalysis, getRunningAnalysisForUsername, hasRunningAnalysisForSession } from "../../src/db/analyses";
import { createProviderRows } from "../../src/db/providers";
import { PROVIDER_IDS } from "@repo/shared";
import { startAnalysisAsync } from "../../src/api/router";

export async function analyzeHandler(req: NextApiRequest, res: NextApiResponse) {
  const sessionId = getHeader(req, "x-session-id");
  const username = req.body?.username as string | undefined;
  if (!sessionId) return sendJson(res, 401, { error: "missing session" });
  if (!requireSession(sessionId)) return sendJson(res, 401, { error: "invalid or expired session" });
  if (!username) return sendJson(res, 400, { error: "username is required" });

  if (hasRunningAnalysisForSession(sessionId)) {
    return sendJson(res, 409, { error: "an analysis is already running for this session" });
  }

  const existing = getRunningAnalysisForUsername(username, sessionId);
  if (existing) {
    return sendJson(res, 200, { analysisId: existing.id, username, shared: true });
  }

  const analysisId = randomUUID();
  createAnalysis(analysisId, sessionId, username);
  createProviderRows(analysisId, PROVIDER_IDS);
  startAnalysisAsync(analysisId, username);
  sendJson(res, 201, { analysisId, username, shared: false });
}

export default analyzeHandler;
```

`apps/backend/pages/api/analysis/index.ts`:
```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession, sendJson, getHeader } from "../../../src/api/helpers";
import { getLatestAnalysisForSession } from "../../../src/db/analyses";
import { getProviderRows } from "../../../src/db/providers";
import { toAnalysisSummary } from "../../../src/api/summary";

export async function latestAnalysisHandler(req: NextApiRequest, res: NextApiResponse) {
  const sessionId = getHeader(req, "x-session-id");
  if (!sessionId || !requireSession(sessionId)) return sendJson(res, 401, { error: "invalid session" });
  const analysis = getLatestAnalysisForSession(sessionId);
  if (!analysis) return sendJson(res, 200, { analysis: null });
  sendJson(res, 200, { analysis: toAnalysisSummary(analysis, getProviderRows(analysis.id)) });
}

export default latestAnalysisHandler;
```

`apps/backend/src/api/summary.ts`:
```ts
import { ScorecardSchema, type AnalysisSummary } from "@repo/shared";
import type { AnalysisRow } from "../db/database";
import type { ProviderRow } from "../db/database";

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
          return ScorecardSchema.parse({ ...JSON.parse(r.scorecard), status: r.status, progress: r.progress, lastUpdated: new Date(r.lastUpdated).toISOString() });
        } catch {
          // fall through to blank
        }
      }
      return {
        provider: r.provider as never,
        status: r.status,
        progress: r.progress,
        startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
        lastUpdated: new Date(r.lastUpdated).toISOString(),
        completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
        dimensions: [],
        top_repos: [],
        strengths: [],
        gaps: [],
        verdict: { leaning: "uncertain" as const, summary: "" },
      };
    }),
  };
}
```

`apps/backend/pages/api/analysis/[id].ts`:
```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendJson } from "../../../src/api/helpers";
import { getAnalysis } from "../../../src/db/analyses";
import { getProviderRows } from "../../../src/db/providers";
import { toAnalysisSummary } from "../../../src/api/summary";

export async function analysisByIdHandler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;
  const analysis = getAnalysis(id);
  if (!analysis) return sendJson(res, 404, { error: "analysis not found" });
  sendJson(res, 200, { analysis: toAnalysisSummary(analysis, getProviderRows(id)) });
}

export default analysisByIdHandler;
```

`apps/backend/pages/api/analysis/[id]/report.ts`:
```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendJson } from "../../../../src/api/helpers";
import { getAnalysis } from "../../../../src/db/analyses";
import { getProviderRows } from "../../../../src/db/providers";
import { toAnalysisSummary } from "../../../../src/api/summary";

export async function reportHandler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;
  const analysis = getAnalysis(id);
  if (!analysis) return sendJson(res, 404, { error: "analysis not found" });
  if (analysis.status === "running") return sendJson(res, 425, { error: "analysis still running" });
  const summary = toAnalysisSummary(analysis, getProviderRows(id));
  const scorecards = summary.providers.filter((p) => p.status === "succeeded");
  sendJson(res, 200, { analysis: summary, scorecards });
}

export default reportHandler;
```

`apps/backend/pages/api/analysis/[id]/retry.ts`:
```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getAnalysis, updateAnalysisStatus } from "../../../../src/db/analyses";
import { getProviderRow, updateProvider } from "../../../../src/db/providers";
import { requireSession, sendJson } from "../../../../src/api/helpers";
import { getProvider } from "../../../../src/llm";
import { fetchGitHubData } from "../../../../src/github/client";
import { runProviders } from "../../../../src/analysis/runner";
import { wsHub } from "../../../../src/ws/hub";

const COOLDOWN_MS = 45_000;

export async function retryHandler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;
  const sessionId = (req.body?.sessionId as string) ?? (req.query.sessionId as string);
  const provider = req.body?.provider as string;

  if (!sessionId || !requireSession(sessionId)) return sendJson(res, 401, { error: "invalid session" });
  const analysis = getAnalysis(id);
  if (!analysis) return sendJson(res, 404, { error: "analysis not found" });

  const row = getProviderRow(id, provider);
  if (!row) return sendJson(res, 400, { error: "unknown provider" });

  if (row.status === "running") {
    return sendJson(res, 200, { shared: true });
  }

  const now = Date.now();
  if (row.lastAttemptAt && now - row.lastAttemptAt < COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil((COOLDOWN_MS - (now - row.lastAttemptAt)) / 1000);
    return sendJson(res, 429, { retryAfterSeconds });
  }

  getProvider(provider as never);
  const analysisId = id;
  updateAnalysisStatus(analysisId, "running");
  try {
    const snapshot = await fetchGitHubData(analysis.username);
    await runProviders(
      analysisId,
      snapshot,
      [provider],
      (pid) => getProvider(pid as never),
      (event) => wsHub.publish(event.analysisId, event)
    );
    const updated = getProviderRow(analysisId, provider);
    sendJson(res, updated?.status === "succeeded" ? 201 : 200, { shared: false, status: updated?.status });
  } catch {
    updateProvider(analysisId, provider, { status: "failed", completedAt: Date.now() });
    sendJson(res, 200, { shared: false, status: "failed" });
  }
}

export default retryHandler;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest src/api/routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/pages/api apps/backend/src/api
git commit -m "feat: add session, analyze, analysis, report and retry api routes"
```

---

### Task 12: Frontend API Client

**Files:**
- Create: `apps/frontend/src/api/client.ts`
- Test: `apps/frontend/src/api/client.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `createSession(): Promise<{ sessionId: string; expiresAt: number }>`
  - `startAnalysis(username: string, sessionId: string): Promise<{ status: 201 | 200 | 409 | 401; analysisId?: string; shared?: boolean; error?: string }>`
  - `fetchLatestAnalysis(sessionId: string): Promise<AnalysisSummary | null>`
  - `fetchAnalysis(id: string): Promise<AnalysisSummary | null>`
  - `fetchReport(id: string): Promise<{ analysis: AnalysisSummary; scorecards: Scorecard[] }>`
  - `retryProvider(id: string, sessionId: string, provider: string): Promise<{ status: number; shared?: boolean; retryAfterSeconds?: number }>`
  - Throws `ApiError` on network failure / non-2xx (except handled statuses).

- [ ] **Step 1: Write the failing test**

`apps/frontend/src/api/client.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { faker } from "@faker-js/faker";
import { createSession, startAnalysis, fetchReport, retryProvider } from "./client";

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("createSession", () => {
  it("posts and returns the session", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionId, expiresAt: 1 }), { status: 201 }));
    const session = await createSession();
    expect(session.sessionId).toBe(sessionId);
  });
});

describe("startAnalysis", () => {
  it("returns 201 payload", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ analysisId, username, shared: false }), { status: 201 }));
    const result = await startAnalysis(username, sessionId);
    expect(result.status).toBe(201);
    expect(result.analysisId).toBe(analysisId);
  });
  it("returns shared payload on 200", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ analysisId, username, shared: true }), { status: 200 }));
    const result = await startAnalysis(username, sessionId);
    expect(result.status).toBe(200);
    expect(result.shared).toBe(true);
  });
});

describe("retryProvider", () => {
  it("returns retryAfterSeconds on 429", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ retryAfterSeconds: 30 }), { status: 429 }));
    const result = await retryProvider(analysisId, sessionId, "gemini");
    expect(result.status).toBe(429);
    expect(result.retryAfterSeconds).toBe(30);
  });
});

describe("fetchReport", () => {
  it("throws ApiError on 425", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "running" }), { status: 425 }));
    await expect(fetchReport(analysisId)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the client**

`apps/frontend/src/api/client.ts`:
```ts
import type { AnalysisSummary, Scorecard } from "@repo/shared";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(path, init);
  const body = (await res.json().catch(() => null)) as T | null;
  return { status: res.status, body: body as T };
}

export async function createSession(): Promise<{ sessionId: string; expiresAt: number }> {
  const { status, body } = await request<{ sessionId: string; expiresAt: number }>("/api/session", { method: "POST" });
  if (status !== 201) throw new ApiError("failed to create session", status);
  return body;
}

export interface StartAnalysisResult {
  status: number;
  analysisId?: string;
  username?: string;
  shared?: boolean;
  error?: string;
}

export async function startAnalysis(username: string, sessionId: string): Promise<StartAnalysisResult> {
  const { status, body } = await request<StartAnalysisResult>("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
    body: JSON.stringify({ username }),
  });
  return { ...body, status };
}

export async function fetchLatestAnalysis(sessionId: string): Promise<AnalysisSummary | null> {
  const { status, body } = await request<{ analysis: AnalysisSummary | null }>(`/api/analysis?sessionId=${encodeURIComponent(sessionId)}`, {
    headers: { "X-Session-Id": sessionId },
  });
  if (status === 401) return null;
  return body?.analysis ?? null;
}

export async function fetchAnalysis(id: string): Promise<AnalysisSummary | null> {
  const { status, body } = await request<{ analysis: AnalysisSummary | null }>(`/api/analysis/${id}`);
  if (status !== 200) return null;
  return body?.analysis ?? null;
}

export async function fetchReport(id: string): Promise<{ analysis: AnalysisSummary; scorecards: Scorecard[] }> {
  const { status, body } = await request<{ analysis: AnalysisSummary; scorecards: Scorecard[] }>(`/api/analysis/${id}/report`);
  if (status !== 200) throw new ApiError(body ? "analysis still running" : "failed to fetch report", status);
  return body;
}

export interface RetryResult {
  status: number;
  shared?: boolean;
  retryAfterSeconds?: number;
}

export async function retryProvider(id: string, sessionId: string, provider: string): Promise<RetryResult> {
  const { status, body } = await request<RetryResult>(`/api/analysis/${id}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
    body: JSON.stringify({ sessionId, provider }),
  });
  return { ...body, status };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/api/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api
git commit -m "feat: add frontend api client"
```

---

### Task 13: Frontend WebSocket Client + Analysis Store

**Files:**
- Create: `apps/frontend/src/api/ws.ts`
- Create: `apps/frontend/src/stores/analysis.ts`
- Test: `apps/frontend/src/stores/analysis.test.ts`

**Interfaces:**
- Consumes: `fetchLatestAnalysis`, `fetchAnalysis`, `retryProvider` (Task 12), `useSessionStore` (Task 5).
- Produces:
  - `connectAnalysisWs(analysisId: string, sessionId: string, handlers): () => void` in `src/api/ws.ts` — opens `ws://<host>/ws?sessionId=&analysisId=`, returns a close function; auto-reconnect only while the caller's `shouldReconnect` returns true.
  - Pinia `useAnalysisStore` exposing: `analysis`, `analysisId`, `username`, `loading`, `shared`, `banner`, `start(username)`, `restore()`, `loadAnalysis(id)`, `retry(provider)`, `onWsEvent(event)`, `cooldown(provider)`.

- [ ] **Step 1: Write the failing test**

`apps/frontend/src/stores/analysis.test.ts`:
```ts
import { describe, expect, it, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { faker } from "@faker-js/faker";
import { useAnalysisStore } from "./analysis";
import { useSessionStore } from "./session";
import * as client from "../api/client";

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe("analysis store", () => {
  it("start sets running state from 201", async () => {
    vi.spyOn(client, "startAnalysis").mockResolvedValue({ status: 201, analysisId, username, shared: false });
    vi.spyOn(client, "fetchAnalysis").mockResolvedValue({
      id: analysisId, sessionId, username, status: "running", error: null,
      createdAt: new Date().toISOString(), providers: [],
    } as never);
    const session = useSessionStore();
    session.ensureSession();
    const store = useAnalysisStore();
    await store.start(username);
    expect(store.username).toBe(username);
    expect(store.analysisId).toBe(analysisId);
    expect(store.shared).toBe(false);
  });

  it("marks shared when server returns 200", async () => {
    vi.spyOn(client, "startAnalysis").mockResolvedValue({ status: 200, analysisId, username, shared: true });
    vi.spyOn(client, "fetchAnalysis").mockResolvedValue({
      id: analysisId, sessionId, username, status: "running", error: null,
      createdAt: new Date().toISOString(), providers: [],
    } as never);
    const session = useSessionStore();
    session.ensureSession();
    const store = useAnalysisStore();
    await store.start(username);
    expect(store.shared).toBe(true);
    expect(store.banner).toContain("already being analyzed");
  });

  it("exposes cooldown state", () => {
    vi.useFakeTimers();
    try {
      const store = useAnalysisStore();
      store.setCooldown("gemini", 30);
      expect(store.cooldownRemaining("gemini")).toBe(30);
      vi.advanceTimersByTime(1000);
      expect(store.cooldownRemaining("gemini")).toBe(29);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/stores/analysis.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the WS client and store**

`apps/frontend/src/api/ws.ts`:
```ts
export interface WsHandlers {
  onState: (snapshot: unknown) => void;
  onProviderUpdate: (payload: unknown) => void;
  onFinal: (payload: { status: string; error?: string }) => void;
  shouldReconnect: () => boolean;
}

export function connectAnalysisWs(analysisId: string, sessionId: string, handlers: WsHandlers): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retryDelay = 500;

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${window.location.host}/ws?sessionId=${encodeURIComponent(sessionId)}&analysisId=${encodeURIComponent(analysisId)}`;

  const connect = () => {
    ws = new WebSocket(url);
    ws.onopen = () => {
      retryDelay = 500;
    };
    ws.onmessage = (e) => {
      const event = JSON.parse(e.data as string);
      if (event.type === "state") handlers.onState(event);
      else if (event.type === "provider-update") handlers.onProviderUpdate(event);
      else if (event.type === "final") {
        handlers.onFinal(event);
        ws?.close();
      }
    };
    ws.onclose = () => {
      if (closed) return;
      if (!handlers.shouldReconnect()) return;
      setTimeout(() => {
        if (!closed && handlers.shouldReconnect()) connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 5000);
    };
  };

  connect();
  return () => {
    closed = true;
    ws?.close();
  };
}
```

`apps/frontend/src/stores/analysis.ts`:
```ts
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { AnalysisSummary } from "@repo/shared";
import { startAnalysis, retryProvider, fetchLatestAnalysis, fetchAnalysis } from "../api/client";
import { connectAnalysisWs } from "../api/ws";
import { useSessionStore } from "./session";

export const useAnalysisStore = defineStore("analysis", () => {
  const analysis = ref<AnalysisSummary | null>(null);
  const username = ref<string | null>(null);
  const analysisId = ref<string | null>(null);
  const shared = ref(false);
  const banner = ref<string | null>(null);
  const loading = ref(false);
  const cooldowns = ref<Record<string, number>>({});

  const isRunning = computed(() => analysis.value?.status === "running");

  function setCooldown(provider: string, seconds: number): void {
    cooldowns.value[provider] = seconds;
    const timer = setInterval(() => {
      cooldowns.value[provider] = Math.max(0, (cooldowns.value[provider] ?? 0) - 1);
      if (cooldowns.value[provider] <= 0) clearInterval(timer);
    }, 1000);
  }

  function cooldownRemaining(provider: string): number {
    return cooldowns.value[provider] ?? 0;
  }

  async function start(input: string): Promise<"started" | "shared" | "conflict" | "error"> {
    const session = useSessionStore();
    const sessionId = session.ensureSession();
    const result = await startAnalysis(input, sessionId);
    if (result.status === 409) return "conflict";
    if (result.status === 401) return "error";
    if (result.status === 200 && result.shared) {
      username.value = result.username ?? input;
      analysisId.value = result.analysisId ?? null;
      shared.value = true;
      banner.value = "This GitHub profile is already being analyzed right now — you're watching the live session.";
      if (analysisId.value) loadAnalysis(analysisId.value);
      return "shared";
    }
    username.value = result.username ?? input;
    analysisId.value = result.analysisId ?? null;
    shared.value = false;
    banner.value = null;
    if (analysisId.value) loadAnalysis(analysisId.value);
    return "started";
  }

  async function restore(): Promise<boolean> {
    const session = useSessionStore();
    const sessionId = session.ensureSession();
    const latest = await fetchLatestAnalysis(sessionId);
    if (!latest) return false;
    analysis.value = latest;
    username.value = latest.username;
    analysisId.value = latest.id;
    return true;
  }

  async function loadAnalysis(id: string): Promise<void> {
    const a = await fetchAnalysis(id);
    if (a) {
      analysis.value = a;
      username.value = a.username;
      analysisId.value = a.id;
    }
  }

  async function retry(provider: string): Promise<void> {
    const session = useSessionStore();
    if (!analysisId.value) return;
    const result = await retryProvider(analysisId.value, session.sessionId ?? "", provider);
    if (result.status === 429 && result.retryAfterSeconds) {
      setCooldown(provider, result.retryAfterSeconds);
      banner.value = `Please wait ${result.retryAfterSeconds}s before retrying ${provider}.`;
      return;
    }
    if (result.status === 200 && result.shared) {
      banner.value = "Another user already retried this provider — you're watching the same retry in progress.";
      return;
    }
    banner.value = null;
    await loadAnalysis(analysisId.value);
  }

  function onProviderUpdate(payload: { analysisId: string; provider: string; status: string; progress: number; lastUpdated: string }): void {
    if (!analysis.value) return;
    const p = analysis.value.providers.find((x) => x.provider === payload.provider);
    if (p) {
      p.status = payload.status as never;
      p.progress = payload.progress;
      p.lastUpdated = payload.lastUpdated;
    }
  }

  function onFinal(payload: { status: string; error?: string }): void {
    if (analysis.value) {
      analysis.value.status = payload.status as never;
      if (payload.error) analysis.value.error = payload.error;
    }
  }

  return {
    analysis, username, analysisId, shared, banner, loading, isRunning,
    start, restore, loadAnalysis, retry, onProviderUpdate, onFinal, setCooldown, cooldownRemaining,
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/stores/analysis.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api/ws.ts apps/frontend/src/stores/analysis.ts
git commit -m "feat: add websocket client and analysis store"
```

---

### Task 14: Frontend Home View (validation + confirmation modal)

**Files:**
- Create: `apps/frontend/src/pages/HomeView.vue`
- Create: `apps/frontend/src/components/ConfirmModal.vue`
- Test: `apps/frontend/src/pages/HomeView.test.ts`

**Interfaces:**
- Consumes: `parseGithubUrl` (Task 4), `useAnalysisStore` (Task 13).
- Produces: Home page with input, validation error, confirmation modal, and navigation to `/analysis` on success. On `409` shows an inline message; on shared `200` also navigates to `/analysis`.

- [ ] **Step 1: Write the failing test**

`apps/frontend/src/pages/HomeView.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { faker } from "@faker-js/faker";
import HomeView from "./HomeView.vue";
import { useAnalysisStore } from "../stores/analysis";
import * as client from "../api/client";

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe("HomeView", () => {
  it("rejects an invalid link with an error", async () => {
    const wrapper = mount(HomeView);
    await wrapper.find("input").setValue("not a url");
    await wrapper.find("button.primary").trigger("click");
    expect(wrapper.text()).toContain("invalid");
  });

  it("shows the confirmation modal for a valid link", async () => {
    const wrapper = mount(HomeView);
    await wrapper.find("input").setValue(`https://github.com/${username}`);
    await wrapper.find("button.primary").trigger("click");
    expect(wrapper.text()).toContain(username);
  });

  it("starts analysis on confirm", async () => {
    vi.spyOn(client, "startAnalysis").mockResolvedValue({ status: 201, analysisId, username, shared: false });
    vi.spyOn(client, "fetchAnalysis").mockResolvedValue({
      id: analysisId, sessionId, username, status: "running", error: null,
      createdAt: new Date().toISOString(), providers: [],
    } as never);
    const store = useAnalysisStore();
    const wrapper = mount(HomeView);
    await wrapper.find("input").setValue(`https://github.com/${username}`);
    await wrapper.find("button.primary").trigger("click");
    await wrapper.find("button.confirm").trigger("click");
    await vi.waitFor(() => expect(store.analysisId).toBe(analysisId));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/pages/HomeView.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the Home view and modal**

`apps/frontend/src/components/ConfirmModal.vue`:
```vue
<template>
  <div class="modal-overlay" data-test="confirm-modal">
    <div class="modal">
      <p>Do you really want to analyze the GitHub account of <strong>{{ username }}</strong>?</p>
      <div class="modal-actions">
        <button class="cancel" data-test="cancel" @click="$emit('cancel')">No</button>
        <button class="confirm" data-test="confirm" @click="$emit('confirm')">Yes</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ username: string }>();
defineEmits<{ (e: "confirm"): void; (e: "cancel"): void }>();
</script>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; }
.modal { background: white; padding: 24px; border-radius: 8px; max-width: 420px; }
.modal-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px; }
</style>
```

`apps/frontend/src/pages/HomeView.vue`:
```vue
<template>
  <div class="home">
    <h1>GitHub Profile Analyzer</h1>
    <input
      v-model="link"
      data-test="link-input"
      placeholder="https://github.com/username"
      @keyup.enter="onAnalyze"
    />
    <button class="primary" data-test="analyze" :disabled="busy" @click="onAnalyze">Analyze</button>
    <p v-if="error" class="error" data-test="error">{{ error }}</p>
    <ConfirmModal
      v-if="candidate"
      :username="candidate"
      @confirm="onConfirm"
      @cancel="candidate = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { parseGithubUrl } from "../utils/githubUrl";
import { useAnalysisStore } from "../stores/analysis";
import ConfirmModal from "../components/ConfirmModal.vue";

const router = useRouter();
const store = useAnalysisStore();
const link = ref("");
const candidate = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

function onAnalyze(): void {
  const parsed = parseGithubUrl(link.value);
  if (!parsed) {
    error.value = "Invalid link. Enter a GitHub profile URL like https://github.com/username";
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
  const result = await store.start(username);
  busy.value = false;
  if (result === "conflict") {
    error.value = "An analysis is already running — wait for it to finish before starting another.";
    return;
  }
  if (result === "error") {
    error.value = "Your session expired. Please reload the page.";
    return;
  }
  router.push("/analysis");
}
</script>

<style scoped>
.home { max-width: 640px; margin: 80px auto; text-align: center; }
input { width: 100%; padding: 12px; font-size: 16px; }
button.primary { margin-top: 12px; padding: 12px 24px; }
.error { color: #b00020; }
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/pages/HomeView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/HomeView.vue apps/frontend/src/components/ConfirmModal.vue
git commit -m "feat: add home view with confirmation modal"
```

---

### Task 15: Frontend Analysis View (live provider cards + retry)

**Files:**
- Create: `apps/frontend/src/pages/AnalysisView.vue`
- Create: `apps/frontend/src/components/ProviderCard.vue`
- Test: `apps/frontend/src/pages/AnalysisView.test.ts`

**Interfaces:**
- Consumes: `useAnalysisStore` (Task 13), `connectAnalysisWs` (Task 13), `useSessionStore` (Task 5).
- Produces: Analysis page that on mount either restores state (F5) or subscribes to WS for the active analysis; renders provider cards; wires retry buttons + countdown; shows the shared-watch banner; navigates to `/report/:id` on "View report".

- [ ] **Step 1: Write the failing test**

`apps/frontend/src/pages/AnalysisView.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { faker } from "@faker-js/faker";
import AnalysisView from "./AnalysisView.vue";
import { useAnalysisStore } from "../stores/analysis";
import * as client from "../api/client";

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}));

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe("AnalysisView", () => {
  it("shows shared banner when shared", async () => {
    const store = useAnalysisStore();
    store.shared = true;
    store.banner = "already being analyzed";
    store.analysisId = analysisId;
    const wrapper = mount(AnalysisView);
    await flushPromises();
    expect(wrapper.text()).toContain("already being analyzed");
  });

  it("shows a retry button for a failed provider", async () => {
    const store = useAnalysisStore();
    store.analysisId = analysisId;
    store.analysis = {
      id: analysisId, sessionId, username, status: "failed", error: null,
      createdAt: new Date().toISOString(),
      providers: [
        { provider: "gemini", status: "failed", progress: 40, startedAt: null, lastUpdated: new Date().toISOString(), completedAt: null, dimensions: [], top_repos: [], strengths: [], gaps: [], verdict: { leaning: "uncertain", summary: "" } },
      ],
    } as never;
    const wrapper = mount(AnalysisView);
    await flushPromises();
    expect(wrapper.text()).toContain("Retry");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/pages/AnalysisView.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/frontend/src/components/ProviderCard.vue`:
```vue
<template>
  <div class="provider-card" :data-status="card.status">
    <div class="provider-header">
      <span class="provider-name">{{ card.provider }}</span>
      <span class="provider-status">{{ card.status }}</span>
    </div>
    <template v-if="card.status === 'pending' || card.status === 'running'">
      <div class="progress-bar"><div class="progress-fill" :style="{ width: card.progress + '%' }"></div></div>
      <span class="meta">progress: {{ card.progress }}% · updated {{ card.lastUpdated }}</span>
    </template>
    <template v-else-if="card.status === 'failed'">
      <span class="meta">Analysis failed</span>
      <button class="retry" data-test="retry" :disabled="cooldownRemaining > 0" @click="$emit('retry')">
        Retry{{ cooldownRemaining > 0 ? ` (${cooldownRemaining}s)` : "" }}
      </button>
    </template>
    <template v-else>
      <button class="view-scorecard" data-test="view-scorecard" @click="$emit('view-scorecard')">View scorecard</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Scorecard } from "@repo/shared";

defineProps<{ card: Scorecard; cooldownRemaining: number }>();
defineEmits<{ (e: "retry"): void; (e: "view-scorecard"): void }>();
</script>

<style scoped>
.provider-card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 12px 0; }
.provider-header { display: flex; justify-content: space-between; }
.progress-bar { height: 8px; background: #eee; border-radius: 4px; margin: 8px 0; }
.progress-fill { height: 100%; background: #4caf50; border-radius: 4px; transition: width 0.3s; }
.meta { color: #666; font-size: 12px; }
</style>
```

`apps/frontend/src/pages/AnalysisView.vue`:
```vue
<template>
  <div class="analysis">
    <h2 data-test="username">{{ store.username }}</h2>
    <p v-if="store.banner" class="banner" data-test="banner">{{ store.banner }}</p>
    <div v-if="!store.analysis" class="empty">No analysis yet.</div>
    <template v-else>
      <p v-if="store.analysis.error" class="error" data-test="analysis-error">{{ store.analysis.error }}</p>
      <ProviderCard
        v-for="card in store.analysis.providers"
        :key="card.provider"
        :card="card"
        :cooldown-remaining="store.cooldownRemaining(card.provider)"
        @retry="store.retry(card.provider)"
        @view-scorecard="showReport"
      />
      <button v-if="store.analysis.status !== 'running'" class="primary" data-test="view-report" @click="showReport">
        View report
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useAnalysisStore } from "../stores/analysis";
import { useSessionStore } from "../stores/session";
import { connectAnalysisWs } from "../api/ws";
import ProviderCard from "../components/ProviderCard.vue";

const router = useRouter();
const store = useAnalysisStore();
const session = useSessionStore();

let closeWs: (() => void) | null = null;

function subscribe(): void {
  if (!store.analysisId || !session.sessionId) return;
  closeWs?.();
  closeWs = connectAnalysisWs(store.analysisId, session.sessionId, {
    onState: (snapshot) => {
      store.loadAnalysis(store.analysisId!);
      void snapshot;
    },
    onProviderUpdate: store.onProviderUpdate,
    onFinal: (payload) => {
      store.onFinal(payload);
      closeWs?.();
    },
    shouldReconnect: () => store.isRunning,
  });
}

function showReport(): void {
  if (store.analysisId) router.push(`/report/${store.analysisId}`);
}

onMounted(async () => {
  if (!store.analysisId) {
    const restored = await store.restore();
    if (!restored) {
      router.push("/");
      return;
    }
  }
  if (store.isRunning) subscribe();
});

onUnmounted(() => closeWs?.());
</script>

<style scoped>
.analysis { max-width: 720px; margin: 40px auto; }
.banner { background: #fff8e1; padding: 12px; border-radius: 6px; }
.error { color: #b00020; }
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/pages/AnalysisView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/AnalysisView.vue apps/frontend/src/components/ProviderCard.vue
git commit -m "feat: add analysis view with provider cards and retry"
```

---

### Task 16: Frontend Report View

**Files:**
- Create: `apps/frontend/src/pages/ReportView.vue`
- Create: `apps/frontend/src/components/ScorecardTable.vue`
- Create: `apps/frontend/src/components/VerdictBox.vue`
- Test: `apps/frontend/src/pages/ReportView.test.ts`

**Interfaces:**
- Consumes: `fetchReport` (Task 12).
- Produces: Report page rendering per-provider tabs with dimension bars, top repos, strengths, gaps, verdict, and a "copy report" button.

- [ ] **Step 1: Write the failing test**

`apps/frontend/src/pages/ReportView.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { faker } from "@faker-js/faker";
import ReportView from "./ReportView.vue";
import * as client from "../api/client";

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

const scorecard = {
  provider: "gemini",
  status: "succeeded",
  progress: 100,
  startedAt: null,
  lastUpdated: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  dimensions: [
    { key: "code_quality", label: "Code Quality", score: 8 },
    { key: "languages", label: "Languages", score: 7 },
    { key: "contribution", label: "Contribution Activity", score: 6 },
    { key: "project_depth", label: "Project Depth", score: 9 },
    { key: "oss_experience", label: "Open Source Experience", score: 7 },
  ],
  top_repos: [{ name: faker.internet.domainWord(), stars: faker.number.int({ min: 1, max: 999 }), description: faker.lorem.sentence(), reason: faker.lorem.sentence() }],
  strengths: [faker.lorem.words(2)],
  gaps: [faker.lorem.words(2)],
  verdict: { leaning: "hire", summary: faker.lorem.sentence() },
};

beforeEach(() => vi.restoreAllMocks());

describe("ReportView", () => {
  it("renders a scorecard with verdict", async () => {
    vi.spyOn(client, "fetchReport").mockResolvedValue({
      analysis: { id: analysisId, sessionId, username, status: "succeeded", error: null, createdAt: new Date().toISOString(), providers: [scorecard] },
      scorecards: [scorecard],
    });
    const wrapper = mount(ReportView, { props: { id: analysisId } });
    await flushPromises();
    expect(wrapper.text()).toContain("Code Quality");
    expect(wrapper.text()).toContain(scorecard.verdict.summary);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/pages/ReportView.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/frontend/src/components/ScorecardTable.vue`:
```vue
<template>
  <div class="scorecard" data-test="scorecard">
    <h3>{{ card.provider }}</h3>
    <div v-for="d in card.dimensions" :key="d.key" class="dimension">
      <span class="dim-label">{{ d.label }}</span>
      <div class="dim-bar"><div class="dim-fill" :style="{ width: (d.score * 10) + '%' }"></div></div>
      <span class="dim-score">{{ d.score }}/10</span>
    </div>
    <h4>Top repos</h4>
    <ul>
      <li v-for="r in card.top_repos" :key="r.name">
        {{ r.name }} (⭐{{ r.stars }}) — {{ r.description }} <em>{{ r.reason }}</em>
      </li>
    </ul>
    <h4>Strengths</h4>
    <ul><li v-for="s in card.strengths" :key="s">{{ s }}</li></ul>
    <h4>Gaps</h4>
    <ul><li v-for="g in card.gaps" :key="g">{{ g }}</li></ul>
  </div>
</template>

<script setup lang="ts">
import type { Scorecard } from "@repo/shared";
defineProps<{ card: Scorecard }>();
</script>

<style scoped>
.dimension { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
.dim-bar { flex: 1; height: 10px; background: #eee; border-radius: 5px; }
.dim-fill { height: 100%; background: #2196f3; border-radius: 5px; }
.dim-score { width: 40px; text-align: right; }
</style>
```

`apps/frontend/src/components/VerdictBox.vue`:
```vue
<template>
  <div class="verdict" :data-leaning="card.verdict.leaning">
    <h4>Verdict: {{ card.verdict.leaning }}</h4>
    <p>{{ card.verdict.summary }}</p>
  </div>
</template>

<script setup lang="ts">
import type { Scorecard } from "@repo/shared";
defineProps<{ card: Scorecard }>();
</script>

<style scoped>
.verdict { border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-top: 12px; }
.verdict[data-leaning="hire"] { border-color: #4caf50; }
.verdict[data-leaning="no_hire"] { border-color: #f44336; }
</style>
```

`apps/frontend/src/pages/ReportView.vue`:
```vue
<template>
  <div class="report">
    <h2>{{ report?.analysis.username }}</h2>
    <div class="tabs">
      <button
        v-for="(card, i) in report?.scorecards ?? []"
        :key="card.provider"
        :class="{ active: activeTab === i }"
        @click="activeTab = i"
      >
        {{ card.provider }}
      </button>
    </div>
    <template v-if="activeCard">
      <VerdictBox :card="activeCard" />
      <ScorecardTable :card="activeCard" />
    </template>
    <p v-else-if="report && report.scorecards.length === 0" data-test="no-scorecards">
      No provider succeeded. Please retry a failed provider.
    </p>
    <button class="primary" data-test="copy" @click="copyReport">Copy report</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { fetchReport } from "../api/client";
import type { AnalysisSummary, Scorecard } from "@repo/shared";
import ScorecardTable from "../components/ScorecardTable.vue";
import VerdictBox from "../components/VerdictBox.vue";

const props = defineProps<{ id: string }>();
const report = ref<{ analysis: AnalysisSummary; scorecards: Scorecard[] } | null>(null);
const activeTab = ref(0);

const activeCard = computed(() => report.value?.scorecards[activeTab.value] ?? null);

onMounted(async () => {
  try {
    report.value = await fetchReport(props.id);
  } catch {
    report.value = null;
  }
});

function copyReport(): void {
  if (!report.value) return;
  const text = JSON.stringify(report.value.scorecards, null, 2);
  navigator.clipboard.writeText(text);
}
</script>

<style scoped>
.report { max-width: 720px; margin: 40px auto; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tabs button.active { font-weight: bold; border-bottom: 2px solid #2196f3; }
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/pages/ReportView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/ReportView.vue apps/frontend/src/components/ScorecardTable.vue apps/frontend/src/components/VerdictBox.vue
git commit -m "feat: add report view with scorecard tabs"
```

---

### Task 17: End-to-End Wiring, README + Final Verification

**Files:**
- Create: `README.md`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Modify: root `package.json` scripts (add `docker:up` / `docker:down`)
- Test: run all test suites + a manual smoke test + a Docker compose smoke test

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Add root scripts and README**

Root `package.json` — add:
```json
"scripts": {
  "dev": "npm run dev --workspace=apps/backend & npm run dev --workspace=apps/frontend",
  "test": "npm run test --workspaces --if-present",
  "test:backend": "npm run test --workspace=apps/backend",
  "test:frontend": "npm run test --workspace=apps/frontend",
  "test:shared": "npm run test --workspace=packages/shared",
  "docker:up": "docker compose up --build",
  "docker:down": "docker compose down"
}
```

Also create `docker-compose.yml` at the repo root (same file already introduced in Task 2 — this task only verifies it in place):
```yaml
services:
  backend:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DB_PATH=/data/app.db
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - GROQ_API_KEY=${GROQ_API_KEY}
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - GITHUB_TOKEN=${GITHUB_TOKEN}
    volumes:
      - backend-data:/data

volumes:
  backend-data:
```

`README.md`:
```markdown
# GitHub Profile Analyzer

Analyze a candidate's GitHub profile with free LLM providers (Gemini, Groq, OpenRouter) and get a recruiter-friendly scorecard report.

## Prerequisites

- Node 20+ (installed via nvm)
- LLM API keys in a local `.env` file (see below): `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` (at least two for a useful report)
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
```

`.env.example` (repo root):
```
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
GITHUB_TOKEN=
```

- [ ] **Step 2: Install and run all test suites**

Run: `npm install`
Then:
Run: `npm run test:shared`
Run: `npm run test:backend`
Run: `npm run test:frontend`
Expected: all suites PASS.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Manual steps:
1. Open http://localhost:5173, paste `https://github.com/octocat`, click Analyze, confirm modal → Analysis screen shows 3 provider cards with progress.
2. F5 mid-analysis → state restores, progress resumes via WS.
3. Wait for completion → click View report → tabs with scorecards + verdict.
4. Two tabs in the same browser → second analyze returns the "already running" conflict message.
5. A second browser (or incognito) analyzing the same username → shared-watch banner shown.

- [ ] **Step 4: Docker compose smoke test**

Run: `cp .env.example .env` (add at least one LLM key), then `npm run docker:up`
Manual steps:
1. Wait for the backend to build and start; verify http://localhost:3000/api/health returns `{ "ok": true }`.
2. Run an analysis against a GitHub username; complete it; restart the stack with `docker compose restart`.
3. Verify the analysis persists (F5 recovery on the frontend still shows the completed analysis) — proving the SQLite `backend-data` volume connection works.
4. Run `npm run docker:down`.

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example docker-compose.yml package.json
git commit -m "chore: add readme, docker compose and final wiring"
```

---

## Self-Review Notes

- All spec API endpoints are covered: `POST /api/session`, `POST /api/analyze`, `GET /api/analysis`, `GET /api/analysis/:id`, `GET /api/analysis/:id/report`, `POST /api/analysis/:id/retry`, `WS /ws`.
- Session 12h expiry, one-active-per-session (`409`), cross-session shared runtime (`200 shared:true`), 45s retry cooldown (`429`), deduplicated shared retries (`200 shared:true`) are all implemented in Task 11 with DB logic in Task 3.
- WS lifecycle (open only while running, final message closes, no idle connection) in Tasks 10 and 15.
- F5 recovery (restore latest analysis; WS only when running) in Task 13 (store `restore`) and Task 15 (`onMounted`).
- Scorecard schema matches the spec exactly, with lifecycle fields (`status`, `progress`, `startedAt`, `lastUpdated`, `completedAt`).
- Vue/Vite/Vitest frontend (Pinia state) and Next.js/Jest/Docker backend per the approved tech stack.
- Code quality tooling set up in Task 1 and gating all later commits: ESLint (typescript-eslint flat config + `eslint-plugin-vue`), Prettier, Husky `pre-commit` (lint-staged) and `commit-msg` (commitlint conventional), Commitizen (`npm run commit`), `@faker-js/faker` used for generated test fixtures throughout (Tasks 1, 3, 4, 6, 9, 11-16).
- Clean architecture in the backend: `pages/api/*` adapters → `src/api/*` use cases → `src/{analysis,llm,github,db}` domain/data; no domain → route imports (enforced by dependency direction in each task's Files/Interfaces).
- TDD followed in every task: failing test written and verified first, then implementation, then commit.
- Docker images (build + runtime) use nvm to install Node `20.15.0` and `npm` for all package operations — no base `node` image (Task 2 Dockerfile).
- Docker Compose (Task 17, `docker-compose.yml`) runs the backend with the SQLite database on a named volume `backend-data` mounted at `/data` via `DB_PATH=/data/app.db`, so data survives `docker compose restart`. `.env.example` at repo root provides the key wiring for compose.
- Known simplification: `runAnalysis` fires async after `201`; provider progress is estimated (fetch + 20% per provider) rather than server-streamed token counts — matches the spec's "estimated, approximate" allowance.
- Known simplification: shared retry dedup is enforced by checking `status === "running"` on the provider row; the concurrency guarantee relies on SQLite serialized writes.
