---
description: Run the appropriate review gate(s) based on which files changed
---

# Review

Dispatch to the right `/review-*` gate(s) for the current diff (or the files/paths given as
arguments). This is a router over the six review commands in `.claude/commands/`.

## Pre-review

1. Skim `CLAUDE-LESSONS.md` for recently recorded patterns to watch for.
2. `git diff --name-only main...HEAD` (or use the paths passed as arguments) to see what changed.
3. `npm run lint && npx tsc --noEmit` to clear automated issues before a human/agent review.

## Auto-detection → which gate

| Changed paths | Run |
| --- | --- |
| `app/api/**`, `lib/ai/**`, `lib/auth*`, `lib/crypto.ts`, iframe/sandbox code | `/review-security` |
| Card-generation pipeline or generated card HTML (`lib/ai/**`, `components/card/**`, `lib/db/seed-cards/**`) | `/review-viz` |
| `components/canvas/**`, `store/**`, `lib/graph/**` | `/review-perf` |
| Any `components/**` or `app/**/*.tsx` (UI) | `/review-a11y` |
| Any source change | `/review-code` |
| New/updated dependency (`package.json`) | `/review-code` (license check) + `/review-security` (CVE check) |
| Preparing to merge | `/review-pr` (full architecture + breaking-change pass) |

Run every gate whose row matches. When several match, run them in that order and consolidate
findings. `/review-code` is the baseline for any code change.

## Usage

```bash
/review                          # auto-detect from the working diff
/review app/api/mesh/route.ts    # review specific files
/review components/canvas/       # review a directory
```

## After review

- Address every Must-Fix and Should-Fix finding, then re-run the gate.
- If a finding reveals a repeatable mistake, record it with `/add-lesson` and consider whether
  an ESLint rule can catch it going forward.
