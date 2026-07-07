---
description: Cheat-sheet mapping common GitHub tasks to the exact MCP tool + args (avoids re-deriving or writing throwaway scripts)
---

# GitHub Ops

Quick reference for working with GitHub in this repo. **Cloud/web sessions have NO `gh` CLI** —
use the `mcp__github__*` tools for every GitHub action.

Repo: `owner: home-lab-enterpises`, `repo: concept-mesh` (the only allowed repo).

## Read a PR

| Need | Tool + `method` |
| --- | --- |
| PR overview (title, body, state, branches) | `pull_request_read` `get` |
| Diff | `pull_request_read` `get_diff` |
| Files changed | `pull_request_read` `get_files` (paginate: `perPage`, `page`) |
| **CI — per-job check runs** | `pull_request_read` `get_check_runs` (each run has a `details_url`) |
| ~~CI — combined status~~ | ⚠️ **Avoid** `pull_request_read` `get_status` — returns `403 Resource not accessible by integration` for the MCP app. Use `get_check_runs`. |
| CI — job logs | `get_job_logs` (`failed_only: true` to focus on failures) |
| Issue/PR-level comments | `pull_request_read` `get_comments` |
| Review summaries | `pull_request_read` `get_reviews` |
| **Inline review threads** | `pull_request_read` `get_review_comments` → threads carry `isResolved`, `isOutdated`, and the `threadId` (e.g. `PRRT_…`) needed to resolve |

## Act on a PR

| Need | Tool |
| --- | --- |
| Reply to a specific review comment | `add_reply_to_pull_request_comment` (needs `commentId` from `get_review_comments`) |
| General PR/issue comment | `add_issue_comment` (`issue_number` = PR number) |
| Resolve / unresolve a review thread | `resolve_review_thread` / `unresolve_review_thread` (needs `threadId`) — or `pull_request_review_write` `method: resolve_thread` |
| Approve / request changes / comment review | `pull_request_review_write` `method: create` + `event` |
| Update title/body/reviewers/state | `update_pull_request` |
| Create a PR | `create_pull_request` (check `.github/pull_request_template.md` first) |
| Push a fix / re-run CI | `push_files` to the PR branch (CI re-triggers on push) |
| Watch for CI + review events | `subscribe_pr_activity` (then end the turn) / `unsubscribe_pr_activity` |

Be frugal with PR comments — only reply when genuinely necessary (e.g. explaining why a
suggestion is wrong or can't be done).

## Issues

| Need | Tool |
| --- | --- |
| List open issues | `list_issues` (`state: OPEN`) |
| Read one issue | `issue_read` `get` / `get_comments` / `get_sub_issues` / `get_labels` |
| Tight search | `search_issues` (`owner`,`repo` + query; use the `sort`/`order` params, not `sort:` in the query) |
| Create / edit / close | `issue_write` (set `state_reason` when closing), comment via `add_issue_comment` |

## Watch a PR (autofix CI / review comments)

`subscribe_pr_activity` (per PR) then end the turn — events arrive as
`<github-webhook-activity>` and wake the session. Don't poll with `sleep`. Stop with
`unsubscribe_pr_activity` when asked. See `/ship` for the full resolve-until-green loop.
