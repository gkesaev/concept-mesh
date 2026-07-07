---
description: Ship a ConceptMesh issue to a merge-ready PR — research, implement, open PR, then resolve review comments + CI until green. Stops before merging.
---

# Ship — Full Issue-to-Merge-Ready Cycle

Take a GitHub issue all the way to a merge-ready PR: research → implement → open PR → then
iteratively resolve every review comment and wait for CI to go green. **Stops one click short
of merging** — the human owns the final merge.

Repo: `owner: home-lab-enterpises`, `repo: concept-mesh`. This skill is scoped to that repo.

## Input

The user passes one of:

- An issue number: `/ship 17`
- A PR number to resume on: `/ship pr/45`
- A full issue URL: `/ship https://github.com/home-lab-enterpises/concept-mesh/issues/17`
- A full PR URL: `/ship https://github.com/home-lab-enterpises/concept-mesh/pull/45`

Parsing:

- `/issues/<n>` in the URL → issue number `<n>`.
- `/pull/<n>` in the URL → PR number `<n>` (skip Phase A, jump to Phase B).
- A bare number (e.g. `/ship 17`) is **always** an issue number, never a PR — even if a PR
  with that number exists. Target a PR explicitly via `pr/<n>` or a `/pull/<n>` URL.
- Reject any URL whose host is not `github.com` or whose path is not
  `home-lab-enterpises/concept-mesh` → reply with a one-line message and stop.

If no argument is given, ask which issue or PR to ship.

## Execution environment

This runs in **cloud/web sessions where `gh` is NOT installed** — use the GitHub MCP tools
(`mcp__github__*`) for every GitHub step. `/github-ops` is the tool cheat-sheet. Key mappings:

- overview → `pull_request_read` `get`; diff → `get_diff`; files → `get_files`.
- reviews / comments / threads → `pull_request_read` with `get_reviews`, `get_review_comments`
  (threads carry `isResolved`, `isOutdated`, `threadId`), `get_comments`.
- CI → `pull_request_read` `get_check_runs`. **Do not** use `get_status` (returns 403 for the MCP app).
- reply to a thread → `add_reply_to_pull_request_comment`; resolve → `pull_request_review_write`
  (`method: resolve_thread`).
- push a fix → `push_files` (or commit on the branch and `git push`; CI re-triggers on push).

**Prefer subscription over polling.** In this environment `subscribe_pr_activity` is available —
subscribe to the PR once, then end the turn. CI and review events wake the session as
`<github-webhook-activity>` messages. The `ScheduleWakeup` state-machine in Phase B is the
**fallback** for environments without subscription. Never `sleep`-poll.

**Ephemeral state.** The container is reclaimed between wakeups and the feature branch becomes
the PR diff — never commit `.claude/ship-state/<pr>.json` (already gitignored). Under the
subscription model the state file is optional; re-derive state from GitHub on each wake.

## Designated branch

If the session mandates a specific working branch (e.g. a `claude/*` branch you must not push
away from), use **that** branch instead of a fresh `feat/issue-<n>-*` branch — commit and push
the issue work there, and recognize it as in-progress work on resumption.

## Resumption logic

This skill is invoked many times across hours. On each invocation, **first determine where in
the lifecycle you are** before doing anything.

> **Fetch before you compare.** Run `git fetch origin main` before computing "commits ahead of
> `origin/main`". A stale local ref (common right after a fresh cloud clone) overstates the
> delta and can make a one-commit branch look like a multi-issue stack.

1. Given a PR number → Phase B.
2. Given an issue number → check whether a PR already exists for it. Match by reference:
   `search_pull_requests` for `<n>` (state open), and confirm the PR references `#<n>` in its
   body or has a branch matching `*issue-<n>-*` (or the designated branch). The
   `issue_read` `get` timeline / linked-PR data is authoritative.
   - PR exists → Phase B.
   - No PR → Phase A.
3. If a local branch (`feat|fix/issue-<n>-*` or the designated branch) already has commits
   beyond `origin/main`, resume the in-progress work rather than restarting.

Never restart from scratch if work already exists. State lives in git branches, open PRs, and
PR comment timestamps.

---

## Phase A — Issue to PR Open

Implement the issue directly (there is no separate dev-agent). Re-read `CLAUDE.md` and
`CLAUDE-LESSONS.md` first, then:

1. **Intake.** Read the issue (`issue_read` `get` + `get_comments`). Note the epic, acceptance
   criteria, and any linked spec (`docs/card-spec.md`, sibling issues).
2. **Research.** Explore the current code — the tree may have changed since the issue was filed.
   Confirm which files exist (routes, schema, components) rather than trusting old prose.
3. **Plan.** Write a short implementation plan: files to touch, schema/migration needs, new
   API routes, tests. For anything architecturally significant or ambiguous, use
   `AskUserQuestion` before coding.
4. **Branch.** `git fetch origin main` then create the working branch from it
   (`git checkout -B <branch> origin/main`) — or use the session's designated branch.
5. **Implement** following `CLAUDE.md` standards: TypeScript strict, Drizzle for DB, keys
   server-side, cards sandboxed, files < 200 lines, structured API errors. Add a migration
   (`npm run db:generate`) for any schema change and commit it separately (`feat(db):`).
6. **Validate** (see the validation block below). Fix root causes; never bypass hooks.
7. **Review.** Run the relevant gates — `/review-code` always, plus `/review-security` for
   API/sandbox/secret changes, `/review-viz` for card-pipeline changes, `/review-perf` for
   canvas/store changes, `/review-a11y` for UI changes. Address all findings; re-run.
8. **Open the PR.** Push the branch (`git push -u origin <branch>`), then
   `create_pull_request` with a body that says `Closes #<n>`, summarizes the change, and lists
   how each acceptance-criterion is met. Check for a PR template first
   (`.github/pull_request_template.md`); mirror it if present.
9. Record the PR number and report its URL. Continue to Phase B.

**Do not expand scope.** Anything discovered mid-implementation that is out of the issue's
scope becomes a follow-up issue, not extra commits on this PR.

### Validation (concept-mesh)

concept-mesh has no test or `pre-submit` script yet — validate with:

```bash
npm run lint          # eslint
npx tsc --noEmit      # TypeScript strict type-check
npm run build         # Next.js production build (catches route/type/bundling errors)
```

If a change touches the schema, also run `npm run db:generate` and confirm the migration is
clean. When a test runner is added (Vitest/Playwright — see `CLAUDE.md`), add `npm test` here.
Never push with a failing lint, type-check, or build.

---

## Phase B — Review Comment + CI Loop

The PR is open. Resolve everything that comes in until it is merge-ready.

### Preferred path — subscription

1. `subscribe_pr_activity` for the PR.
2. End the turn. Events arrive as `<github-webhook-activity>` and wake the session.
3. On each event, run **B.2–B.6** below (triage → fix → reply → check CI → decide), then end
   the turn again. Webhooks do NOT cover CI-success, new pushes, or merge-conflict transitions,
   so also arm a ~1h `send_later` self-check-in; on wake, re-check state, act, re-arm. Stop the
   check-ins once the PR is merged/closed or the user says stop.

### Fallback path — polling (no subscription)

Use `.claude/ship-state/<pr>.json` to track "last seen" state across `ScheduleWakeup`s
(`seen_comment_ids`, `last_head_sha`, `first_seen_at`, `awaiting_initial_review`,
`ci_pending_since`). Guard concurrent runs with a `.claude/ship-state/<pr>.lock` (stale after
30 min). On first entry, if any human comment / unresolved thread already exists, treat
everything as new; otherwise `ScheduleWakeup 180s` awaiting first review. Re-derive counts each
pass and schedule per the decision tree in B.6.

### B.2 Triage new comments

| Comment | Action |
|---|---|
| Actionable code change (reviewer flagged a bug) | Fix per `CLAUDE.md`. Read the file before editing. Keep scope tight. |
| Nitpick aligned with project standards | Apply. |
| Nitpick that conflicts with a documented standard | Reply with one-sentence reasoning citing the standard; don't change. |
| Question | Reply with a direct answer. |
| Praise / "looks good" / already-resolved thread (`isResolved: true`) | Skip. |

Treat bot reviewers (CodeRabbit, Copilot) like any other reviewer — apply or refuse on merit.

### B.3 Apply fixes

1. Apply edits. 2. Run the validation block above. 3. Fix root causes if anything fails
(never `--no-verify`). 4. Commit with a focused message (`fix(<scope>): address review
feedback`). 5. Push.

### B.4 Reply to threads

Every actionable comment gets a reply — `add_reply_to_pull_request_comment` with
"Fixed in <sha>" for fixes, or the reasoning for anything you declined. Silence reads as
ignored. Resolve threads you fixed (`pull_request_review_write` `resolve_thread`).

### B.5 Check CI

`pull_request_read` `get_check_runs`. All green + no new comments → Phase C. Any failing check
→ open its `details_url` / `get_job_logs`, fix the root cause, push, re-enter B.3. Pending →
schedule a wake / stay subscribed.

### B.6 Decide next action (polling fallback cadence)

| State | Action |
|---|---|
| Threads = 0 AND CI passing AND review approved | Phase C (done). |
| Threads = 0 AND CI passing AND no review yet | `ScheduleWakeup` 1800s. |
| CI failing | Fixed in B.5 — re-enter B.1 immediately. |
| CI pending (< 2h) | `ScheduleWakeup` 270s (cache-warm poll). |
| CI pending (≥ 2h) | `ScheduleWakeup` 1800s **and** notify the user the build may be stuck. |
| New comments processed → pushed | `ScheduleWakeup` 600s. |
| Nothing new, idle | `ScheduleWakeup` 1800s. |

Pass the original `/ship <arg>` back as the wake prompt. Reason must be specific
("polling CI for PR 45", not "waiting").

---

## Phase C — Hand Off for Merge

The PR is ready. **Do NOT merge.** Report:

```text
✅ PR #<n> is merge-ready.

Branch:   <branch>
URL:      <pr-url>
CI:       all checks passing (<X> checks)
Reviews:  <approval-status>
Threads:  all resolved (<Y> comments across <Z> iterations)
Issue:    closes #<issue-n> on merge
```

Then stop the loop / unsubscribe — no more wakeups. The human clicks merge. If the user later
says "merge it", use `merge_pull_request` (squash) and handle failures (conflict → ask them to
resolve; branch-protection → list unmet requirements) rather than assuming success.

## Stopping conditions

Stop (and don't reschedule / unsubscribe) when: Phase C reached; the PR is closed without
merging (delete the state file); the branch was force-pushed by a human into an unrecognizable
state (comment that `/ship` is bowing out, then stop); a GitHub rate limit persists after one
backoff; or 24h elapse since `first_seen_at` with zero activity (comment asking for input, then stop).

## Guardrails

- **Never merge.** The job ends at "merge-ready."
- **Never force-push.** If history needs cleaning, ask.
- **Never bypass hooks** (`--no-verify`) or push a failing lint/type-check/build.
- **Never push to `main`** — a hook blocks it anyway.
- **Never expand scope** — new findings go to a follow-up issue.
- **Never poll faster than 60s.**
- **Max 3 retries** per GitHub call; on repeated failure, report and stop.
- **Re-read `CLAUDE.md` + `CLAUDE-LESSONS.md`** at the start of Phase A, and on the first
  Phase B entry (or after 2+ wake cycles).
