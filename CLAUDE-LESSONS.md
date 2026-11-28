# CLAUDE Lessons

Recorded mistakes and recurring patterns to avoid. Add entries with `/add-lesson`. Newest
first. Prefer automating a lesson (ESLint rule, tighter types) over relying on this doc.

---

### 2026-11-27: Review fixes polluted git history with chatter commits

- **Problem:** Pushing follow-up commits like `fix(...): address PR review comments` or
  `fix(...): harden ... from self-review` leaves meaningless review-process chatter in git
  history forever instead of a clean story of how the codebase was built.
- **Root Cause:** `.claude/commands/ship.md` instructed agents to commit review fixes as
  separate `fix(<scope>): address review feedback` commits and had a blanket `Never force-push`
  rule that prevented amending/rebasing PR branches.
- **Fix:** Treat git history as a curated development story. Every fix made during a PR
  (whether from self-review, subagent review, CodeRabbit, CI, or human review) MUST be folded
  back into the commit that introduced the code via `git commit --amend` or
  `git commit --fixup <sha>` + `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash origin/main`,
  then pushed to the PR branch with `git push --force-with-lease`. Never leave
  "address review comments" commits in history.
- **Files:** `CLAUDE.md`, `CONTRIBUTING.md`, `.claude/commands/ship.md`, `.claude/settings.json`.
- **Automated:** Partially — `.claude/settings.json` allows `git rebase`, and `.claude/hooks/block-main-write.sh`
  prevents commits/pushes to `main`/`master`.

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
