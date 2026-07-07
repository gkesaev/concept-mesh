# ConceptMesh

Visual, infinite, zoomable mesh of concept cards connected by color-coded
edges. Zoom to fracture concepts into sub-concepts, click a card to open an
AI-generated interactive visualization, and let the serendipity engine surface
unexpected connections between distant ideas.

See `PROJECT.md` for the product vision and `CLAUDE.md` for the architecture
and coding standards (the latter is the authoritative, up-to-date map of the
codebase). New here? `CONTRIBUTING.md` covers the day-to-day workflow.

## Architecture at a glance

ConceptMesh is a single Next.js 16 (App Router) app. The browser renders an
infinite React Flow canvas; a Postgres + pgvector database holds concepts,
cards, edges and positions; and all AI generation runs server-side in Route
Handlers so provider API keys never reach the client.

```
┌──────────────────────────── Browser ────────────────────────────┐
│  MeshCanvas (React Flow) ──▶ ConceptModal ──▶ CardViewer         │
│      │  Zustand stores (meshStore, uiStore)     (sandboxed       │
│      │                                            iframe)         │
└──────┼───────────────────────────────────────────────────────────┘
       │ fetch
┌──────▼──────────────── Next.js Route Handlers ───────────────────┐
│  /api/mesh   /api/concepts   /api/connections   /api/user/*      │
│  /api/cards/generate ⏳  /api/serendipity ⏳   (AI, server-side)  │
│      │ Drizzle ORM                    │ provider adapter          │
└──────┼────────────────────────────────┼──────────────────────────┘
       │                                 │ (key never sent to client)
┌──────▼────────────┐            ┌───────▼──────────────────────────┐
│ Postgres 16 +     │            │ Anthropic / OpenAI / OpenAI-compat│
│ pgvector          │            │  ⏳ adapters — see issues #11–#15 │
│  concepts, cards, │            └───────────────────────────────────┘
│  edges, positions │
└───────────────────┘   ⏳ = planned; see the roadmap issues on GitHub
```

A generated **card** is a string of self-contained HTML (inline CSS/JS, themed
via `--cm-*` variables) that renders inside an `sandbox="allow-scripts"` iframe.
The generation↔rendering contract is defined in `docs/card-spec.md`
(tracked in [#8](https://github.com/home-lab-enterpises/concept-mesh/issues/8)).

## Tech stack

- **Next.js 15** (App Router, TypeScript) on Node 22
- **@xyflow/react** canvas + **d3-force** layout
- **PostgreSQL 16 + pgvector** via **Drizzle ORM**
- **NextAuth.js** for auth (GitHub / Google)
- **Playwright** for server-side card validation (headless Chromium)
- Pluggable AI **provider adapters** (Anthropic, OpenAI, OpenAI-compatible)

## Prerequisites

- Node.js 22+
- Docker + Docker Compose (for the database and local full-stack runs)
- An API key from one of the supported providers (optional — users can
  supply their own in-app)

## Quick start (Docker)

```bash
# 1. Clone and enter the repo
git clone https://github.com/gkesaev/concept-mesh.git
cd concept-mesh

# 2. Create your local env file from the template
cp .env.local.example .env.local
# then edit .env.local — at minimum set AUTH_SECRET and ENCRYPTION_KEY:
#   openssl rand -base64 32   # AUTH_SECRET
#   openssl rand -hex 32      # ENCRYPTION_KEY

# 3. Boot the full stack (Postgres + migrations + app)
docker compose up --build
```

The app is served at <http://localhost:3000>. Postgres is exposed on
`localhost:5433` so it does not clash with a host Postgres.

On first boot the `migrate` service runs Drizzle migrations and seeds the
database with the starter concepts. The `app` service builds a Debian-slim
image that includes the Chromium system libraries needed by Playwright.

## Quick start (local Node, Docker only for Postgres)

```bash
cp .env.local.example .env.local   # fill in the blanks as above
docker compose up -d db             # just the database
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

## Environment variables

All variables are documented in `.env.local.example`. The important ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (pgvector required) |
| `AUTH_SECRET` | NextAuth session secret (`openssl rand -base64 32`) |
| `ENCRYPTION_KEY` | 32-byte hex key for encrypting user API keys at rest |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth (optional) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth (optional) |
| `DEFAULT_PROVIDER` | Server fallback provider: `anthropic` \| `openai` \| `openai-compat` |
| `DEFAULT_API_KEY` | Server fallback API key (encrypted in memory before use) |
| `ANTHROPIC_API_KEY` | Legacy single-provider fallback, still honoured |
| `ANTHROPIC_MODEL` | Model id (default `claude-sonnet-4-5`) |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | Set to `1` in CI to skip browser install during `npm ci` |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the app |

Per-user API keys are the primary path: a signed-in user adds their own
provider key in settings, it is encrypted with `ENCRYPTION_KEY`, stored in
the `users` table, and only decrypted server-side inside the generation
pipeline. `DEFAULT_PROVIDER` / `DEFAULT_API_KEY` exist so self-hosted
deployments can offer a shared fallback for unauthenticated or
unconfigured users.

## Useful scripts

```bash
npm run dev          # Next.js dev server
npm run build        # production build
npm run start        # run the production build
npm run lint         # eslint
npm run db:generate  # generate a Drizzle migration from schema changes
npm run db:migrate   # apply pending migrations
npm run db:seed      # seed starter concepts
npm run db:studio    # open Drizzle Studio
```

## Production

The repo ships a multi-stage `Dockerfile` (Debian slim, Playwright-ready)
and a `docker-compose.prod.yml` overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The production image skips browser downloads during `npm ci`
(`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) and provisions Chromium into
`/ms-playwright` in a dedicated layer, which is persisted via the
`playwright_cache` volume in compose.

## Review agents

Six custom slash commands live in `.claude/commands/` as quality gates:

| Command | When to run |
|---|---|
| `/review-code` | every significant change |
| `/review-security` | viz pipeline, API routes, iframe / sandbox code |
| `/review-viz` | after pipeline changes or new viz generation |
| `/review-pr` | before merging any PR |
| `/review-perf` | after canvas / layout / store changes |
| `/review-a11y` | after UI component changes |

## Contributing

Start with `CONTRIBUTING.md` — it explains the branch/commit conventions, the
review gates, and the agent workflow. In short:

- **Pick up an issue** with `/ship <issue#>` (in Claude Code): it researches,
  implements on a feature branch, opens a PR, and shepherds it to merge-ready.
- **Contribute a card:** cards are self-contained HTML conforming to
  `docs/card-spec.md`. You'll be able to paste one via the *Import Card* flow
  ([#20](https://github.com/home-lab-enterpises/concept-mesh/issues/20)); until
  then, add a reference card under `lib/db/seed-cards/` and wire it into
  `lib/db/seed.ts`.
- **Add a provider adapter:** implement the `ProviderAdapter` interface
  ([#11](https://github.com/home-lab-enterpises/concept-mesh/issues/11)) under
  `lib/ai/adapters/` and register it. Anthropic (#12), OpenAI (#13) and a
  generic OpenAI-compatible adapter (#14) are the reference implementations.
- **Every dependency must be MIT / ISC / Apache-2.0 / BSD** (or the equally
  permissive PostgreSQL license). No GPL. Check before adding.

Run `/review-pr` before requesting a merge. Never push to `main` — a git hook
enforces this.

## License

All runtime dependencies are MIT / ISC / Apache-2.0 / BSD. No GPL.
Check before adding new packages.
