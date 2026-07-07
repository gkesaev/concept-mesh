# Contributing to ConceptMesh

This guide covers the day-to-day workflow. Architecture and coding standards live in
[`CLAUDE.md`](CLAUDE.md); product vision in [`PROJECT.md`](PROJECT.md). Read `CLAUDE.md` before
your first change — it is the authoritative map of the codebase.

## Setup

```bash
cp .env.local.example .env.local   # fill AUTH_SECRET + ENCRYPTION_KEY
docker compose up -d db            # Postgres 16 + pgvector on :5433
npm install
npm run db:migrate && npm run db:seed
npm run dev
```

In Claude Code sessions this is mostly automatic: `scripts/session-setup.sh` (run from the
`SessionStart` hook) installs deps and regenerates Drizzle artifacts on demand.

## Branches & commits

- **Never commit to `main`.** A `PreToolUse` git hook refuses commits/pushes on
  `main`/`master`. Work on a branch.
- Branch prefixes: `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`, `perf/`, `test/`, `style/`.
  Issue branches: `feat/issue-<n>-short-slug`.
- **Conventional Commits**: `type(scope): subject` — imperative, subject describes *what*, body
  the *why*. Breaking changes take `!` (`feat(api)!: …`). Schema migrations get their own
  `feat(db):` / `fix(db):` commit.
- Never commit `.env*` (use `.env.local.example`) or `.claude/ship-state/` (gitignored — it
  pollutes the PR diff).

## Validation before you push

concept-mesh doesn't have a test runner yet (Vitest/Playwright are planned — see `CLAUDE.md`).
Until then, the gate is:

```bash
npm run lint          # eslint
npx tsc --noEmit      # TypeScript strict
npm run build         # Next.js build — catches route/type/bundling errors
```

For schema changes also run `npm run db:generate` and commit the resulting migration. Never
push with a failing lint, type-check, or build. When tests land, add `npm test` to this list.

## Review gates

Six `/review-*` slash commands are the quality gates. Run `/review` to auto-dispatch by file
type, or a specific one when you know what changed:

| Command | Run when |
| --- | --- |
| `/review-code` | every significant change (baseline) |
| `/review-security` | API routes, `lib/ai/**`, auth/crypto, iframe/sandbox code, new deps |
| `/review-viz` | card-generation pipeline or generated card HTML |
| `/review-perf` | canvas / store / layout changes |
| `/review-a11y` | any UI change |
| `/review-pr` | before requesting a merge (full architecture + breaking-change pass) |

Address every Must-Fix / Should-Fix finding and re-run. Record repeatable mistakes with
`/add-lesson` (→ `CLAUDE-LESSONS.md`), and automate them (ESLint rule) where possible.

## Working an issue with agents: `/ship` vs `/loop`

Two different tools — don't confuse or combine them.

### `/ship <issue#>` — the issue→PR lifecycle driver

`/ship 17` researches the issue, implements it on a feature branch, opens a PR, then watches
review comments and CI until everything is green and every thread is resolved. **It stops one
click short of merging** — a human clicks merge. In web/remote sessions it uses
`subscribe_pr_activity` (event-driven) rather than polling. This is the normal way to pick up a
roadmap issue.

`/ship` is **stateful and self-driving**: it figures out where in the lifecycle it is on each
invocation and schedules its own adaptive wake-ups (fast while CI runs, slow while idle).

### `/loop <interval> <prompt|/command>` — a stateless interval re-runner

`/loop` simply re-runs a prompt or slash command on a fixed cadence (e.g. `/loop 1h /triage`).
It has no notion of a lifecycle or a terminal state — it repeats until you stop it. Use it for
recurring **chores**:

- sweeping open Dependabot PRs,
- triaging newly-filed issues,
- periodic dependency/license or link checks.

### Do **not** wrap `/ship` in `/loop`

`ship`'s Phase B *is already a loop* — a smarter, stateful, event-driven one. Wrapping it in
`/loop` would double-schedule the same PR and the two schedulers would fight each other. The
rule of thumb:

> **One issue → one PR → use `/ship`. Repeating the same stateless task on a timer → use `/loop`.**

### GitHub without `gh`

Cloud/web sessions have no `gh` CLI — use the `mcp__github__*` tools. `/github-ops` is the
cheat-sheet mapping each task to the exact tool and arguments.

## Dependencies & licenses

Every dependency must be MIT / ISC / Apache-2.0 / BSD (or the equally permissive PostgreSQL
license). **No GPL.** Check a package's license before adding it, and run `/review-code`
(license) + `/review-security` (CVE) after any dependency change.

## Opening a PR

Push your branch and open a PR whose body says `Closes #<n>`, summarizes the change, and shows
how each acceptance criterion is met. Check for `.github/pull_request_template.md` and mirror it
if present. Run `/review-pr` before requesting a merge.
