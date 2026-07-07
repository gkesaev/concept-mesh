# ConceptMesh — Agentic Instructions

> **Source of truth.** This file describes the code **as it exists on `main` today (v2)**,
> not the original prototype. Product vision lives in [`PROJECT.md`](PROJECT.md); the
> human-facing setup guide is [`README.md`](README.md). Where a feature is planned but not
> yet built, it is marked _(planned — see #NN)_ with its tracking issue. If you change the
> architecture, update this file in the same PR.

## What This Is

ConceptMesh is a visual concept exploration platform: an infinite, zoomable mesh of concept
cards connected by color-coded edges. Zooming in fractures a concept into deeper
sub-concepts; clicking a card opens a focused modal rendering an **AI-generated, self-contained
HTML visualization** inside a sandboxed iframe. A serendipity engine surfaces unexpected
connections between semantically-close but graph-distant ideas.

It is **not** a learning-management system. It is a personal/shared exploration tool for
finding exciting connections between ideas.

### The v1 → v2 pivot (read this before trusting old prose)

The prototype (see the archived vision in `PROJECT.md`) generated `React.createElement`
strings for a single provider (Anthropic). **v2 replaced that model:**

| v1 (prototype) | v2 (current) |
|---|---|
| `React.createElement` code strings | **Self-contained HTML cards** (inline CSS/JS, `--cm-*` theme vars) — see [`docs/card-spec.md`](docs/card-spec.md) _(planned — #8, PR #35)_ |
| Anthropic-only, key in env | **Multi-provider adapters** (Anthropic / OpenAI / OpenAI-compatible), per-user encrypted keys _(planned — #11–#15)_ |
| No auth | **NextAuth.js** (GitHub / Google OAuth) |
| Single `visualizations` table | **`concept_cards`** with versions, status, votes, remixes |
| Client-side in-memory cache | **PostgreSQL 16 + pgvector** via Drizzle |
| Local render only | **Playwright** server-side card validation _(planned — #9)_ |

If you find a doc that describes `React.createElement`, `src/` layout, a `voyage`
embedding default, or an `EMBEDDING_MODEL` env var, it is stale v1 — trust the schema in
`lib/db/schema.ts` and the code, not the prose.

## Tech Stack

| Layer | Technology | License |
|-------|-----------|---------|
| Framework | Next.js 16 (App Router, TypeScript, Node 22) | MIT |
| Graph Canvas | @xyflow/react (React Flow) | MIT |
| Layout Physics | d3-force | ISC |
| State Management | Zustand | MIT |
| Styling | Tailwind CSS 4 | MIT |
| Database | PostgreSQL 16 + pgvector | PostgreSQL (permissive) |
| ORM | Drizzle ORM | Apache-2.0 |
| Auth | NextAuth.js (`next-auth@5`, Drizzle adapter) | ISC |
| AI | `@anthropic-ai/sdk` today; provider adapters _(planned — #11)_ | MIT |
| Card validation | Playwright (headless Chromium) _(planned — #9)_ | Apache-2.0 |
| Viz sandboxing | iframe `sandbox="allow-scripts"` rendering self-contained HTML | N/A |

**All dependencies MUST have MIT, ISC, Apache-2.0, or BSD (or the equally-permissive
PostgreSQL) license. No GPL. Check before adding.**

## Architecture Principles

### The Graph is Limitless
- The mesh expands as users explore. There is no "full graph" — only what has been discovered so far.
- Viewport-based loading: `GET /api/mesh?x=&y=&radius=` fetches concepts/edges/positions near the camera.
- New nodes appear relative to their parent and settle via d3-force without reshuffling everything.

### AI Pipeline is Server-Side
- Provider API keys NEVER reach the client. User keys are encrypted at rest
  (`ENCRYPTION_KEY`, AES via `lib/crypto.ts`) and only decrypted server-side.
- All AI calls happen in Next.js Route Handlers. `lib/ai/client.ts` resolves a key in this
  order: the signed-in user's encrypted key → `ANTHROPIC_API_KEY` → `DEFAULT_PROVIDER`/`DEFAULT_API_KEY`.
- Generation streams progress to the client via SSE _(planned — #17)_.
- Pipeline: Plan → Generate → Validate (Playwright) → Fix (one retry) → Save.

### Cards are Self-Contained HTML, Sandboxed
- A card is a string of self-contained HTML (inline CSS/JS, no external resources) themed
  through `--cm-bg`, `--cm-text`, `--cm-accent`, `--cm-surface`, `--cm-border`.
- Rendered by `components/card/CardViewer.tsx` inside an iframe with `sandbox="allow-scripts"`
  (no `allow-same-origin`, no `allow-popups`). Communication via `postMessage`.
- An error boundary wraps the viewer — broken card code never crashes the app.
- The generation↔rendering contract is `docs/card-spec.md` _(planned — #8, PR #35)_.

### Serendipity is Semantic, Not Random
- Every concept description is embedded as a `vector(1536)` (pgvector).
- Serendipity = concepts with high cosine similarity (> 0.8) but graph distance > 3 hops.
- Claude then articulates WHY they connect; stored as a `concept_edges` row with
  `ai_generated: true` and a `reason`. _(planned — #28)_

## Project Structure

The app lives at the repo **root** (there is no `src/` directory).

```
app/                              # Next.js App Router
├── layout.tsx                    # Root layout + providers
├── page.tsx                      # Main canvas page
├── globals.css                   # Tailwind + theme variables
├── auth/signin/page.tsx          # Sign-in page
├── settings/page.tsx             # Provider / API-key settings
└── api/
    ├── auth/[...nextauth]/route.ts   # NextAuth handler
    ├── mesh/route.ts                 # GET viewport-bounded bulk fetch
    ├── concepts/route.ts             # GET (list/search), POST (create)
    ├── concepts/[id]/route.ts        # GET (concept + best card), PUT, DELETE
    ├── connections/route.ts          # GET, POST concept edges
    └── user/
        ├── api-key/route.ts          # store/clear the user's encrypted provider key
        └── favorites/route.ts        # GET/POST/DELETE favorites

components/
├── canvas/{MeshCanvas,ConceptNode,ConnectionEdge}.tsx
├── card/CardViewer.tsx           # sandboxed iframe card renderer
├── concept/ConceptModal.tsx      # focused modal around the card
├── auth/UserMenu.tsx
├── providers/SessionProvider.tsx
└── serendipity/SerendipityBanner.tsx

store/
├── meshStore.ts                  # nodes, edges, viewport, layout state
└── uiStore.ts                    # selection, modals, search

lib/
├── ai/client.ts                  # Anthropic client + key resolution
├── auth.ts, auth.config.ts       # NextAuth config
├── crypto.ts                     # encrypt/decrypt user API keys
├── db/{client,schema,seed}.ts    # Drizzle client, schema, seed
├── db/migrations/                # checked-in SQL migrations + meta
├── db/seed-cards/*.html          # reference seed card HTML
└── graph/layout.ts               # d3-force config

types/
├── concept.ts                    # Concept, ConceptCard, ConceptEdge, ConceptDetail, MeshData
└── mesh.ts                       # ConceptNode/Edge data, Viewport, zoom thresholds
```

**Not yet built** (each has an epic issue): provider adapter layer (`lib/ai/adapters/`, #11–#14),
generation/expand/validate/serendipity routes (`app/api/cards/*`, `app/api/serendipity`, #9, #17, #19, #28),
import & embed routes (#20, #21), the d3-force Web Worker, and the `docs/` card spec (#8, PR #35).
Do not assume these exist — check the tree.

## Database Schema

Defined in `lib/db/schema.ts` (Drizzle). Migrations are checked into
`lib/db/migrations/`. The concept primary key is its **`slug`**, not a numeric id.

**NextAuth tables:** `users` (includes `encrypted_api_key`), `accounts`, `sessions`,
`verification_tokens`.

**Domain tables:**

- **`concepts`** — `slug` (PK), `title`, `domain`, `description`, `embedding` (vector 1536,
  nullable), `best_card_id` (→ `concept_cards`), `card_count`, timestamps.
- **`concept_cards`** — `id` (uuid PK), `slug` (→ concepts), `version`, denormalized
  `title`/`domain`/`description`/`tags`/`difficulty`, `html`, `thumbnail`,
  `interactivity_level`, `status` (`draft|validating|published|flagged`), validation fields,
  provenance (`author_id`, `generated_with`, `generation_prompt`, `parent_card_id` for remixes),
  community counters (`upvotes`, `views`, `embed_count`). Unique on (`slug`, `version`).
- **`concept_edges`** — `id` (uuid PK), `source_slug`, `target_slug`, `relationship`
  (`related|prerequisite|application|contrast|analogy`), `reason`, `ai_generated`. Unique on
  (`source_slug`, `target_slug`). _(This replaced the old `connections` table.)_
- **`node_positions`** — `concept_slug` (PK), `x`, `y`, `updated_at`.
- **`favorites`** — (`user_id`, `concept_slug`) composite PK.

> The v1 `visualizations` table was dropped (migration `0002_drop_visualizations.sql`).
> Cards live in `concept_cards`.

## API Design

| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| GET | `/api/mesh?x=&y=&radius=` | Viewport-bounded concepts + edges + positions | ✅ built |
| GET/POST | `/api/concepts` | List/search / create concept | ✅ built |
| GET/PUT/DELETE | `/api/concepts/[id]` | Concept + best card / update / delete | ✅ built |
| GET/POST | `/api/connections` | List / create concept edges | ✅ built |
| POST/DELETE | `/api/user/api-key` | Store / clear encrypted provider key | ✅ built |
| GET/POST/DELETE | `/api/user/favorites` | Manage favorites | ✅ built |
| `*` | `/api/auth/[...nextauth]` | NextAuth | ✅ built |
| POST | `/api/cards/generate` | Concept → card (SSE) | ⏳ #17 |
| POST | `/api/cards/validate` | Playwright validation + thumbnail | ⏳ #9 |
| POST | `/api/concepts/[id]/expand` | Generate sub-concepts | ⏳ #19 |
| GET | `/api/serendipity` | Surface an unexpected connection | ⏳ #28 |
| GET | `/embed/[cardId]` | Public card embed | ⏳ #21 |

## Coding Standards

### General
- TypeScript strict mode. No `any` unless truly unavoidable (justify in a comment).
- Functional components only. No class components.
- Named exports for components; default export only for Next.js pages.
- Keep files under ~200 lines. If longer, split.
- No barrel exports (`index.ts` re-exports). Import directly from the file.
- Nullable numbers: compare with `!= null`, never a truthy check (`if (count)` skips `0`).

### State
- Zustand stores are the single source of truth.
- No prop drilling deeper than 2 levels — use store hooks.
- Zustand actions are defined inside the store, not in components.
- Subscribe with selectors to avoid unnecessary re-renders.

### AI Pipeline
- All prompts live under `lib/ai/` as template functions — never inline in routes.
- Never hardcode model names — read from env (`ANTHROPIC_MODEL`, adapter config).
- Always stream generation progress to the client (SSE).
- Generated card HTML MUST pass validation before it is saved with `status: published`.
- API keys are per-request/per-user and encrypted; never store a plaintext key in the DB.

### Database
- All DB access goes through Drizzle. No raw SQL in route handlers (parameterized
  `sql` for vector ops in `lib/` is fine).
- Migrations are checked into git; generate with `npm run db:generate`.
- Use transactions for multi-table writes.
- Scope user-owned reads/writes by `userId`.

### Styling
- Tailwind utilities for layout/spacing; `--cm-*` CSS variables for the theme.
- Dark space theme (slate-900 → indigo-950), frosted-glass cards, glowing edges.
- Mobile-first: touch interactions, full-screen modal on mobile.

## Error Handling Patterns

- **API routes:** structured JSON errors `{ error: string, code?: string }`; correct status
  codes (400 bad input, 401/403 auth, 404 not found, 429 rate limit, 500 server). Never leak
  stack traces. Log server-side with context (concept slug, operation).
- **SSE streams:** emit `event: error` with a JSON payload on failure, and always a final
  `event: done`. The client closes the `EventSource` on `done` and on unmount.
- **Canvas:** per-node React Flow error boundary; card iframe errors caught via `postMessage`
  and shown in a fallback; network failures show a retry prompt, never a crash.
- **Store actions:** optimistic updates with rollback on API failure; never leave the store
  inconsistent.

## Review Agents

Six custom slash commands in `.claude/commands/` are quality gates. `/review` auto-dispatches
by file type; run the specific ones directly when you know what changed.

| Command | Purpose | When |
|---------|---------|------|
| `/review-code` | Coding-standards compliance | Every significant change |
| `/review-security` | Sandbox / API / secrets audit | viz pipeline, API routes, iframe code |
| `/review-viz` | Validate AI-generated card HTML | after pipeline changes / new cards |
| `/review-perf` | Canvas / layout / data-loading perf | after canvas/layout/store changes |
| `/review-a11y` | Accessibility audit | after UI changes |
| `/review-pr` | Full PR review (architecture + breaking) | before merging any PR |

## Working an Issue: `/ship`, `/loop`, and reviews

- **`/ship <issue#>`** — the primary driver. Takes a GitHub issue all the way to a
  merge-ready PR: research → implement on a `feat|fix/issue-<n>-*` branch → open PR → then
  watch review comments + CI until green and all threads are resolved. It **stops before
  merging** (the human clicks merge). In web/remote sessions it prefers `subscribe_pr_activity`
  over polling. See `.claude/commands/ship.md`.
- **`/loop <interval> <prompt|/command>`** — a generic, *stateless* interval re-runner. Use it
  for recurring chores that have no lifecycle of their own: sweeping Dependabot PRs, triaging
  new issues, periodic link-checks. **Do not wrap `/ship` in `/loop`** — `ship` already runs
  its own smarter, stateful, event-driven loop; nesting them double-schedules and fights
  itself. Pick one: `ship` for an issue→PR lifecycle, `loop` for stateless repetition.
- **`/github-ops`** — cheat-sheet mapping GitHub tasks to the exact `mcp__github__*` tool
  (cloud/web sessions have no `gh` CLI).
- **`/add-lesson`** — record a mistake in `CLAUDE-LESSONS.md` after review finds a pattern.

## Performance Budgets

| Metric | Target |
|--------|--------|
| Canvas initial load (50 nodes) | < 2s |
| Node click → modal open | < 200ms |
| AI card generation (full pipeline) | < 30s |
| SSE first event | < 1s |
| Viewport pan (re-fetch) | < 500ms |
| d3-force layout (100 nodes) | < 1s |
| Client JS bundle | < 300KB gzipped |

## Git Workflow

- Branch prefixes: `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`, `perf/`, `test/`, `style/`.
- **Conventional Commits**: `type(scope): subject` (imperative, describe the *why* in the body).
  Breaking changes take a `!`: `feat(api)!: change mesh response shape`.
- Database migrations get their own commit: `feat(db):` / `fix(db):`.
- A `PreToolUse` hook refuses commits/pushes on `main`/`master` — always work on a branch.
- Run `/review-pr` before requesting merge. Never commit `.claude/ship-state/` (it pollutes
  the PR diff — already gitignored). Never commit `.env*`; use `.env.local.example`.

## Session Setup (cloud & local)

`scripts/session-setup.sh` runs from the `SessionStart` hook: it installs npm deps when
`package-lock.json` changed and regenerates Drizzle artifacts when the schema changed. It is
idempotent and never blocks a session. Run it manually after a fresh clone if needed.

## Specialized Docs

- [`PROJECT.md`](PROJECT.md) — product vision and UX.
- [`README.md`](README.md) — human setup, Docker, env vars.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — workflow, review matrix, ship/loop guidance.
- [`CLAUDE-LESSONS.md`](CLAUDE-LESSONS.md) — recorded mistakes to avoid.
- `docs/card-spec.md` — card HTML contract _(planned — #8, PR #35)_.
