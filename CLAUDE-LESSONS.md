# CLAUDE Lessons

Recorded mistakes and recurring patterns to avoid. Add entries with `/add-lesson`. Newest
first. Prefer automating a lesson (ESLint rule, tighter types) over relying on this doc.

---

### 2026-07-07: Docs drifted a whole major version behind the code

- **Problem:** `CLAUDE.md` and `init.md` described the v1 prototype (`src/` layout,
  `React.createElement` visualizations, Anthropic-only, a `visualizations` table, `voyage`
  embeddings) long after the code moved to v2 (root layout, self-contained HTML cards,
  multi-provider, NextAuth, `concept_cards`/`concept_edges`). Agents reading `CLAUDE.md` as the
  source of truth would generate code against tables and a component model that no longer exist.
- **Root Cause:** Architecture docs were not updated in the same PRs that changed the
  architecture. There was no rule tying doc updates to structural changes.
- **Fix:** Trust `lib/db/schema.ts` and the actual file tree over prose. When you change the
  structure (schema, routes, component model, provider strategy), update `CLAUDE.md` in the
  **same PR**. Flag not-yet-built features as _(planned — #NN)_ rather than describing them as
  present.
- **Files:** `CLAUDE.md`, `init.md` (removed), `README.md`.
- **Automated:** No (process discipline — reviewers should reject structural PRs that leave
  `CLAUDE.md` stale).
