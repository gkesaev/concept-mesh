#!/usr/bin/env bash
# PreToolUse hook: blocks `git commit` / `git push` when HEAD is on main or master,
# and blocks any push that targets main/master as the destination ref.
# Exit code 2 with stderr message = block the tool call.

set -euo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"

# Only inspect git commit / git push
if ! printf '%s' "$cmd" | grep -qE '(^|[[:space:]])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+(commit|push)([[:space:]]|$)'; then
  exit 0
fi

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"

if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
  printf 'Blocked: refuses git commit/push while HEAD is on "%s". Create a feature branch first (git checkout -b feat/...).\n' "$branch" >&2
  exit 2
fi

# Also reject pushes that name main/master as the destination ref,
# e.g. `git push origin main`, `git push origin HEAD:main`, `git push --force origin master`.
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+push\b'; then
  if printf '%s' "$cmd" | grep -qE '(:|[[:space:]])(refs/heads/)?(main|master)([[:space:]]|$)'; then
    printf 'Blocked: refuses to push to main/master. Push to your feature branch and open a PR.\n' >&2
    exit 2
  fi
fi

exit 0
