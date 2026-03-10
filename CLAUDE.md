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
| Viz Sandboxing | iframe sandbox with injected React runtime | N/A |

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
- AI-generated visualization code is a string containing a React arrow function using React.createElement (NO JSX).
- Code runs inside an iframe sandbox with `sandbox="allow-scripts"`.
- The iframe receives a minimal React runtime. Communication via postMessage.
- An Error Boundary wraps the visualization — broken code never crashes the app.

### Serendipity is Semantic, Not Random
- Every concept description is embedded as a vector (pgvector).
- Serendipity = find concepts that are semantically close but graph-distant (near in vector space, far in hop count).
- Claude then articulates WHY they connect.
- Connections are stored with `ai_generated: true` and a `reason` field.

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout, providers
│   ├── page.tsx                  # Main canvas page
│   ├── globals.css               # Tailwind imports
│   └── api/
│       ├── mesh/route.ts         # GET: bulk fetch (concepts + connections + positions for viewport)
│       ├── concepts/
│       │   ├── route.ts          # GET (list/search), POST (create)
│       │   └── [id]/
│       │       ├── route.ts      # GET, PUT, DELETE single concept
│       │       ├── generate/route.ts   # POST: trigger AI viz generation (SSE stream)
│       │       └── expand/route.ts     # POST: generate sub-concepts for this concept
│       ├── connections/route.ts  # GET, POST connections
│       └── serendipity/route.ts  # GET: AI-surfaced unexpected connections
│
├── components/
│   ├── canvas/
│   │   ├── MeshCanvas.tsx        # React Flow canvas + d3-force integration
│   │   ├── ConceptNode.tsx       # Custom node: concept card (adapts to zoom level)
│   │   ├── ConnectionEdge.tsx    # Custom edge: color-coded connection line
│   │   └── CanvasControls.tsx    # Zoom, fit, minimap
│   ├── concept/
│   │   ├── ConceptModal.tsx      # Focused modal for visualization
│   │   └── ConceptSearch.tsx     # Search/create concepts
│   ├── visualization/
│   │   ├── VizRenderer.tsx       # iframe sandbox manager
│   │   ├── VizPlaceholder.tsx    # Unexplored concept state
│   │   └── VizError.tsx          # Error boundary
│   └── serendipity/
│       └── SerendipityBanner.tsx  # "Did you know X connects to Y?"
│
├── store/
│   ├── meshStore.ts              # Nodes, edges, viewport, layout state
│   ├── conceptStore.ts           # Concept data, generation status
│   └── uiStore.ts                # Selection, modals, search
│
├── lib/
│   ├── ai/
│   │   ├── pipeline.ts           # Multi-shot generation pipeline
│   │   ├── prompts.ts            # All prompt templates
│   │   ├── serendipity.ts        # Serendipity engine
│   │   └── techniqueMap.ts       # Concept → visualization technique mapping
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema (4 tables + vectors)
│   │   ├── client.ts             # Database client
│   │   └── migrations/           # Drizzle migrations
│   ├── graph/
│   │   ├── layout.ts             # d3-force config and simulation
│   │   ├── semanticZoom.ts       # Zoom-level detail logic
│   │   └── clustering.ts         # Domain-based clustering
│   └── eval/
│       └── safeEval.ts           # Sandbox evaluation utilities
│
├── workers/
│   └── forceLayout.worker.ts     # Web Worker for d3-force computation
│
└── types/
    ├── concept.ts                # Concept, Connection, Visualization
    └── mesh.ts                   # Node, Edge, Viewport
```

## Database Schema

Four core tables + vector embeddings:

### concepts
- `id` (text, PK, slug like "binary-search")
- `name` (text, not null)
- `domain` (text, not null)
- `explanation` (text, not null)
- `difficulty` (text, nullable: beginner/intermediate/advanced)
- `metadata` (jsonb, extensible)
- `embedding` (vector(1536), for semantic search)
- `created_at`, `updated_at` (timestamps)

### connections
- `id` (uuid, PK)
- `source_id` (FK → concepts)
- `target_id` (FK → concepts)
- `type` (text, default "related" — extensible later)
- `strength` (float, default 1.0 — for layout weighting)
- `ai_generated` (boolean)
- `reason` (text, nullable — "why this connection exists")
- `created_at` (timestamp)
- Unique constraint on (source_id, target_id)

### visualizations
- `id` (uuid, PK)
- `concept_id` (FK → concepts, not null)
- `code` (text, not null — the React.createElement arrow function)
- `plan` (text, nullable — AI planning output)
- `version` (integer, default 1)
- `is_active` (boolean, default true)
- `created_at` (timestamp)

### node_positions
- `concept_id` (FK → concepts, PK)
- `x`, `y` (float)
- `updated_at` (timestamp)

## API Design

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/mesh?x=&y=&zoom=&radius=` | Viewport-based bulk fetch |
| GET | `/api/concepts?q=&domain=` | Search/list concepts |
| POST | `/api/concepts` | Create concept |
| GET | `/api/concepts/[id]` | Get concept + active visualization |
| PUT | `/api/concepts/[id]` | Update concept |
| POST | `/api/concepts/[id]/generate` | Trigger AI viz generation (SSE) |
| POST | `/api/concepts/[id]/expand` | Generate sub-concepts (SSE) |
| GET | `/api/connections` | List connections |
| POST | `/api/connections` | Create connection |
| GET | `/api/serendipity` | Get unexpected connection suggestion |

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
- All prompts live in `src/lib/ai/prompts.ts` as template functions.
- Never hardcode model names — use environment variables.
- Always stream generation progress to the client.
- Generated code MUST be validated before saving to DB.

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

```env
ANTHROPIC_API_KEY=           # Server-side only
DATABASE_URL=                # PostgreSQL connection string (Neon)
EMBEDDING_MODEL=             # Model for concept embeddings (default: voyage or similar)
NEXT_PUBLIC_APP_URL=         # Public URL for the app
```

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
