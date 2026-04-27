# ConceptMesh — Agentic Instructions

## What This Is

ConceptMesh is a visual concept exploration platform. It renders an infinite, zoomable mesh of concept cards connected by color-coded edges. Users explore knowledge spatially — zooming in fractures concepts into deeper sub-concepts, clicking a card opens a focused modal with an AI-generated interactive visualization. The graph is limitless: every concept is a door to more concepts, and a serendipity engine surfaces unexpected connections between distant ideas.

This is NOT a learning management system. It is a personal/shared exploration tool for finding exciting connections between ideas.

## Tech Stack

| Layer | Technology | License |
|-------|-----------|---------|
| Framework | Next.js 15 (App Router, TypeScript) | MIT |
| Graph Canvas | @xyflow/react (React Flow) | MIT |
| Layout Physics | d3-force (Web Worker) | ISC |
| State Management | Zustand | MIT |
| Styling | Tailwind CSS 4 | MIT |
| Database | PostgreSQL + pgvector (Neon) | MIT-compatible |
| ORM | Drizzle ORM | MIT |
| AI | @anthropic-ai/sdk (server-side only) | MIT |
| Auth | NextAuth.js v5 (GitHub / Google) + Drizzle adapter | ISC / MIT |
| Viz Sandboxing | self-contained HTML in iframe `sandbox="allow-scripts"` (srcdoc) | N/A |
| Card Validation | static checks now, Playwright headless render planned | Apache-2.0 |

**All dependencies MUST have MIT, ISC, Apache-2.0, or BSD licenses. No GPL. Check before adding.**

## Architecture Principles

### The Graph is Limitless
- The mesh expands as users explore. There is no "full graph" — only what has been discovered so far.
- Viewport-based loading: fetch nodes near the camera, load more on pan/zoom.
- New nodes appear relative to their parent and settle via d3-force without reshuffling everything.
- Every concept's prerequisites/applications are pointers to nodes that may not exist yet — they get created on first click.

### AI Pipeline is Server-Side
- The Anthropic API key NEVER reaches the client.
- All AI calls happen in Next.js Route Handlers.
- Generation progress streams to the client via Server-Sent Events (SSE).
- Multi-shot pipeline: Plan → Generate → Validate (local) → Fix (if needed) → Save to DB.

### Generated Visualizations are Sandboxed
- AI-generated visualization is a **complete, self-contained HTML document** stored in `concept_cards.html`.
- The card runs inside an iframe with `sandbox="allow-scripts"` and is delivered via `srcdoc` so the iframe is a unique opaque origin (no `allow-same-origin`, no parent DOM access, no cookies).
- Inline `<script>` and `<style>` are allowed; **external resources are blocked** by the static validator (no `src=http*`, `href=http*`, `import "http*"`, `fetch(`, `XMLHttpRequest`, `WebSocket`, etc.).
- The iframe communicates with the host via `postMessage` only (`{type: 'ready' | 'interaction' | 'error', ...}`). The host wraps the iframe in an Error Boundary so a broken card never crashes the app.

### Cards are Versioned and Community-Owned
- A concept can have multiple cards (different versions, different authors). `concepts.best_card_id` points to the canonical one shown by default.
- `concept_cards.status` flow: `draft` → (validate) → `published` | `flagged`.
- Quality signals: `validation_renders`, `validation_has_interactivity`, `validation_screenshot_hash`, plus community signals `upvotes`, `views`, `embed_count`.
- Provenance is tracked: `author_id`, `generated_with` (model id), `generation_prompt`, `parent_card_id` (for forks/iterations).

### Serendipity is Semantic, Not Random
- Every concept description is embedded as a vector (pgvector).
- Serendipity = find concepts that are semantically close but graph-distant (near in vector space, far in hop count).
- Claude then articulates WHY they connect.
- Connections are stored with `ai_generated: true` and a `reason` field.

## Project Structure

This project does **not** use a `src/` directory — Next.js App Router files live at the repo root (`app/`, `components/`, etc.).

```
app/                              # Next.js App Router
├── layout.tsx                    # Root layout, providers
├── page.tsx                      # Main canvas page
├── globals.css                   # Tailwind imports
├── auth/                         # NextAuth UI pages
├── settings/                     # User settings (BYOK key entry)
└── api/
    ├── auth/[...nextauth]/route.ts   # NextAuth handler
    ├── user/
    │   ├── api-key/route.ts          # BYOK key (encrypted at rest)
    │   └── favorites/route.ts        # Authenticated favorites
    ├── mesh/route.ts                 # GET: viewport-bounded bulk fetch
    ├── concepts/
    │   ├── route.ts                  # GET (list/search), POST (create)
    │   └── [id]/                     # path param is the concept slug
    │       ├── route.ts              # GET, PUT, DELETE
    │       ├── cards/route.ts        # GET cards for this concept
    │       └── generate/route.ts     # POST: card generation — SSE stream
    └── connections/route.ts          # GET, POST edges

components/
├── auth/UserMenu.tsx
├── providers/SessionProvider.tsx
├── canvas/{MeshCanvas,ConceptNode,ConnectionEdge}.tsx
├── concept/ConceptModal.tsx          # Focused modal — wraps VizRenderer
├── visualization/                    # iframe sandbox UI
│   ├── VizRenderer.tsx               # srcdoc iframe with postMessage bridge
│   ├── VizPlaceholder.tsx            # Unexplored / generating states
│   └── VizError.tsx                  # Error boundary + retry
└── serendipity/SerendipityBanner.tsx

store/
├── meshStore.ts                  # Nodes, edges, layout state
└── uiStore.ts                    # Selection, modal, search, banners

lib/
├── auth.ts                       # NextAuth config + session helpers
├── crypto.ts                     # AES-GCM encryption for BYOK keys
├── ai/
│   ├── client.ts                 # Anthropic client factory (BYOK-aware)
│   ├── prompts.ts                # Plan / Generate / Fix prompt templates
│   ├── techniqueMap.ts           # Concept → visualization technique
│   ├── cardValidator.ts          # Static safety + structure checks
│   └── pipeline.ts               # Multi-shot generator (yields PipelineEvent)
├── db/{schema,client,seed}.ts
├── db/migrations/
└── graph/layout.ts               # d3-force layout

types/
├── concept.ts                    # Concept, ConceptCard, ConceptEdge, MeshData
└── mesh.ts                       # Node, Edge types for React Flow
```

## Database Schema

The schema lives in `lib/db/schema.ts`. There are NextAuth tables (`users`, `accounts`, `sessions`, `verification_tokens`) plus the domain tables below. Treat `lib/db/schema.ts` as the source of truth — this section is a summary.

### concepts
- `slug` (text, **PK**, slug like `binary-search`)
- `title`, `domain`, `description` (text, not null)
- `embedding` (vector(1536), for semantic search / serendipity)
- `best_card_id` (uuid, FK → concept_cards.id, nullable — canonical card)
- `card_count` (integer, denormalized counter)
- `created_at`, `updated_at`

### concept_cards
- `id` (uuid, PK), `slug` (FK → concepts.slug, cascade), `version` (integer)
- Denormalized concept metadata: `title`, `domain`, `description`, `tags`, `difficulty`
- **Visualization**: `html` (text, not null — self-contained HTML document), `thumbnail`, `interactivity_level`
- **Quality**: `status` (`draft`/`validating`/`published`/`flagged`), `validation_renders`, `validation_has_interactivity`, `validation_screenshot_hash`
- **Provenance**: `author_id` (FK → users), `generated_with` (model id), `generation_prompt`, `parent_card_id` (self-FK for forks)
- **Community**: `upvotes`, `views`, `embed_count`
- Unique on `(slug, version)`; indexes on `slug` and `status`

### concept_edges
- `id` (uuid, PK), `source_slug` and `target_slug` (FK → concepts.slug, cascade)
- `relationship` (`related` | `prerequisite` | `application` | `contrast` | `analogy`, default `related`)
- `reason` (text, nullable), `ai_generated` (bool), `created_at`
- Unique on `(source_slug, target_slug)`

### node_positions
- `concept_slug` (PK, FK → concepts.slug, cascade), `x`, `y`, `updated_at`

### favorites
- `(user_id, concept_slug)` composite PK with cascading FKs

## API Design

Routes use the concept `slug` as the path parameter (kept as `[id]` in the file path for backwards compatibility).

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/mesh?x=&y=&radius=` | Viewport-bounded bulk fetch (concepts + edges + positions) |
| GET | `/api/concepts?q=&domain=` | Search/list concepts |
| POST | `/api/concepts` | Create concept |
| GET | `/api/concepts/[slug]` | Get concept |
| PUT | `/api/concepts/[slug]` | Update concept |
| DELETE | `/api/concepts/[slug]` | Delete concept |
| GET | `/api/concepts/[slug]/cards` | List cards for a concept (or `?best=1` for the active one) |
| POST | `/api/concepts/[slug]/generate` | Trigger AI card generation — **SSE stream** |
| POST | `/api/concepts/[slug]/expand` | Generate sub-concepts — **SSE stream** *(planned)* |
| GET | `/api/connections` | List edges |
| POST | `/api/connections` | Create edge |
| GET | `/api/serendipity` | Get an unexpected connection suggestion *(planned)* |
| `*` | `/api/auth/[...nextauth]` | NextAuth.js session/sign-in/callback |
| `*` | `/api/user/api-key` | BYOK key management (stored encrypted at rest) |
| `*` | `/api/user/favorites` | Authenticated favorites |

## Coding Standards

### General
- TypeScript strict mode. No `any` unless absolutely unavoidable.
- Functional components only. No class components.
- Named exports for components, default export only for pages.
- Keep files under 200 lines. If longer, split.
- No barrel exports (index.ts re-exports). Import directly from the file.

### State
- Zustand stores are the single source of truth.
- No prop drilling deeper than 2 levels — use store hooks instead.
- Zustand actions are defined inside the store, not in components.

### AI Pipeline
- All prompts live in `lib/ai/prompts.ts` as template functions; the orchestrator lives in `lib/ai/pipeline.ts`.
- Never hardcode model names. The model id comes from `process.env.ANTHROPIC_MODEL` with a sensible default (currently the latest Sonnet); the AI client is built via `lib/ai/client.ts` which resolves the user's BYOK key first.
- Use **prompt caching** (`cache_control: { type: 'ephemeral' }`) for the system prompt so repeated generations are cheap.
- Use **streaming** for the generate phase — the SSE route forwards phase updates and token deltas to the browser via `text/event-stream`.
- Generated HTML MUST pass static validation (`lib/ai/cardValidator.ts`) before saving. If validation fails, the pipeline gets exactly **one** retry with the validator's error messages appended to the prompt.
- Cards are written with `status: 'draft'`. They flip to `published` only after either client-side render confirmation (postMessage `ready`) or future Playwright validation.
- The pipeline returns a typed `PipelineEvent` async iterable so the SSE route handler stays a thin adapter (the same generator can be tested or invoked from a worker without HTTP).

### Database
- All DB access goes through Drizzle ORM. No raw SQL in route handlers.
- Migrations are checked into git.
- Use transactions for multi-table writes.

### Styling
- Tailwind utility classes for layout and spacing.
- CSS variables for the color theme (dark space theme: deep indigo/purple).
- Mobile-first responsive: touch interactions, full-screen modal on mobile.

## Visual Design Direction

- Dark background: deep space gradient (slate-900 → indigo-950)
- Cards: frosted glass effect with subtle borders
- Connections: soft glowing lines, color-coded by relationship type
- Unexplored nodes: dimmer, slightly pulsing, inviting interaction
- Explored nodes: vibrant, with a subtle glow
- The mesh should feel alive — gentle drift, subtle particle effects
- Modal: slides up from the card position, fills focus area
- Typography: system-ui, clean, high contrast on dark

## Environment Variables

The canonical, fully documented list lives in `.env.local.example`. The variables ConceptMesh actually reads:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (pgvector required) |
| `AUTH_SECRET` | yes | NextAuth session secret (`openssl rand -base64 32`) |
| `ENCRYPTION_KEY` | yes | 32-byte hex key (`openssl rand -hex 32`) used to encrypt BYOK keys at rest |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | optional | GitHub OAuth |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | optional | Google OAuth |
| `ANTHROPIC_API_KEY` | optional | Server-side fallback when no user key is set |
| `ANTHROPIC_MODEL` | optional | Model id (defaults to the latest Sonnet) |
| `DEFAULT_PROVIDER` / `DEFAULT_API_KEY` | optional | Operator-level default provider/key |
| `NEXT_PUBLIC_APP_URL` | yes (in prod) | Public base URL of the app |

The Anthropic API key **never** reaches the client — all AI calls go through Route Handlers that resolve a key via `lib/ai/client.ts` (user BYOK first, then `ANTHROPIC_API_KEY`, then `DEFAULT_*`).

## Build Order

### Phase 1: Foundation
- Next.js scaffold with TypeScript, Tailwind, App Router
- PostgreSQL schema with Drizzle + pgvector
- Seed data migration (5 starter concepts from prototype)
- Core API routes: /api/mesh, /api/concepts, /api/connections

### Phase 2: The Canvas
- React Flow canvas with custom ConceptNode component
- d3-force layout engine in Web Worker
- Custom ConnectionEdge component
- Pan, zoom, drag, touch interactions

### Phase 3: AI Generation
- Port multi-shot pipeline to server-side Route Handlers
- SSE streaming for generation progress
- iframe sandbox for visualization rendering
- ConceptModal with VizRenderer

### Phase 4: Semantic Zoom + Expansion
- Zoom-level-dependent node detail
- Concept expansion (click unexplored → AI generates sub-concepts)
- Concept search and creation
- Position persistence

### Phase 5: Serendipity
- Concept embedding on creation
- Vector similarity queries for unexpected connections
- Claude-powered connection articulation
- SerendipityBanner UI

### Phase 6: Polish
- Mobile responsive pass
- Performance optimization (virtualization, lazy loading)
- Error handling and edge cases
- Visual polish (animations, particles, glow effects)

## Review Agents

Custom slash commands for quality gates. Run these before merging any PR or after significant changes.

| Command | Purpose | When to Run |
|---------|---------|-------------|
| `/review-code` | Coding standards compliance | Every PR, every significant change |
| `/review-security` | Security audit (sandbox, API, secrets) | Any change to viz pipeline, API routes, or iframe code |
| `/review-viz` | Validate AI-generated visualization code | After pipeline changes or new viz generation |
| `/review-pr` | Full PR review (architecture + breaking changes) | Before merging any PR |
| `/review-perf` | Performance audit (canvas, layout, data loading) | After canvas/layout/store changes |
| `/review-a11y` | Accessibility audit (modals, keyboard, contrast) | After UI component changes |

### When to Run Reviews
- **Before every merge**: `/review-pr` (includes code + architecture)
- **After touching `lib/ai/` or `VizRenderer`**: `/review-security` + `/review-viz`
- **After touching `components/` or `store/`**: `/review-perf` + `/review-a11y`
- **After adding dependencies**: `/review-code` (license check) + `/review-security` (CVE check)

## Error Handling Patterns

### API Routes
- Return structured JSON errors: `{ error: string, code?: string }`
- Use appropriate HTTP status codes: 400 (bad input), 404 (not found), 500 (server error)
- Never leak stack traces or internal details in production
- Log errors server-side with context (concept ID, operation name)

### SSE Streams
- Send `event: error` with JSON payload on failure
- Always send `event: done` to signal completion (even on error)
- Client must close EventSource on unmount and on `done` event

### Canvas Components
- React Flow error boundary catches rendering errors per-node
- Visualization iframe errors are caught via postMessage and displayed in VizError
- Network failures show a retry prompt, not a crash

### Store Actions
- Optimistic updates with rollback on API failure
- Never leave store in an inconsistent state — use immer or replace atomically

## Testing Strategy

### Unit Tests (Vitest — when added)
- `lib/ai/pipeline.ts` — mock Anthropic SDK, test plan/generate/validate/fix flow
- `lib/ai/techniqueMap.ts` — concept-to-technique mapping
- `lib/ai/cardValidator.ts` — must reject every dangerous pattern in the deny-list and accept clean inline-only HTML
- `lib/graph/layout.ts` — d3-force config produces valid positions
- `lib/db/schema.ts` — Drizzle schema matches expected shape
- Store actions — Zustand store state transitions

### Integration Tests
- API routes — test with real DB (Docker postgres), verify response shapes
- AI generation → DB storage → API retrieval → VizRenderer round-trip

### E2E Tests (Playwright — when added)
- Load canvas, verify nodes render
- Click concept → modal opens → visualization renders in iframe
- Search for concept → navigate to it
- Expand concept → new nodes appear on canvas

### What NOT to Test
- React Flow internals (library responsibility)
- Tailwind class output (visual, not logical)
- Third-party SDK behavior

## Performance Budgets

| Metric | Target |
|--------|--------|
| Canvas initial load (50 nodes) | < 2s |
| Node click → modal open | < 200ms |
| AI viz generation (full pipeline) | < 30s |
| SSE first event (generation start) | < 1s |
| Viewport pan (re-fetch nodes) | < 500ms |
| d3-force layout (100 nodes) | < 1s |
| Bundle size (client JS) | < 300KB gzipped |

## Git Workflow

- Branch naming: `feat/`, `fix/`, `refactor/`, `docs/` prefixes
- **Semantic commits** (Conventional Commits format):
  - `feat: add concept expansion API` — new feature (minor version bump)
  - `fix: prevent duplicate connections` — bug fix (patch version bump)
  - `refactor: extract layout logic to worker` — code restructuring, no behavior change
  - `docs: update API endpoint table` — documentation only
  - `chore: upgrade drizzle-orm to 0.35` — dependencies, config, tooling
  - `style: align Tailwind class ordering` — formatting, no logic change
  - `perf: virtualize off-screen nodes` — performance improvement
  - `test: add pipeline unit tests` — adding or updating tests
  - Use optional scope for context: `feat(canvas): add pinch-to-zoom`
  - Breaking changes: add `!` suffix — `feat(api)!: change mesh endpoint response shape`
  - Body (optional): imperative mood, describe the "why" not the "what"
- Run `/review-pr` before merging
- Database migrations get their own commit with `feat(db):` or `fix(db):` prefix
- Never commit `.env` — use `.env.local.example` for templates
