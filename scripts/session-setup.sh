#!/bin/bash
#
# session-setup.sh — ensure the workspace is ready to build/lint/migrate.
#
# Runs from the SessionStart hook (.claude/settings.json) at the start of every
# Claude Code session, local and cloud. It is idempotent and fast: each step is
# skipped when its output is already present and up to date, so steady-state
# sessions add negligible latency. It never exits non-zero, so it can never
# block a session from starting.
#
# Manual use: ./scripts/session-setup.sh

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$PROJECT_DIR" || exit 0

# 1. Node dependencies — install only if missing or package-lock.json is newer.
#    Playwright browsers are provisioned separately (Docker layer / CI step), so
#    skip the postinstall download here to keep fresh clones fast.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "[session-setup] Installing npm dependencies..."
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD="${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-1}" \
    npm install || echo "[session-setup] WARN: npm install failed — run it manually."
else
  echo "[session-setup] node_modules up to date — skipping npm install."
fi

# 2. Drizzle client/types — regenerate only if the schema is newer than the
#    generated migration metadata. `db:generate` is a no-op when nothing changed.
if [ lib/db/schema.ts -nt lib/db/migrations/meta/_journal.json ]; then
  echo "[session-setup] Schema changed — regenerating Drizzle artifacts..."
  npm run db:generate || echo "[session-setup] WARN: db:generate failed — run it manually."
else
  echo "[session-setup] Drizzle artifacts up to date — skipping db:generate."
fi

# 3. Git author identity — attribute commits to a real account.
#    Cloud agents otherwise author commits as "Claude <noreply@anthropic.com>".
#    Setting the repo-local author here (it overrides any global default) keeps
#    authorship consistent; Claude stays credited via the mandatory
#    `Co-Authored-By:` trailer on each commit.
GIT_AUTHOR_NAME="${CONCEPTMESH_GIT_AUTHOR_NAME:-George K}"
GIT_AUTHOR_EMAIL="${CONCEPTMESH_GIT_AUTHOR_EMAIL:-kesaev@gmail.com}"
if [ -d .git ]; then
  git config --local user.name  "$GIT_AUTHOR_NAME"  2>/dev/null || true
  git config --local user.email "$GIT_AUTHOR_EMAIL" 2>/dev/null || true
fi

echo "[session-setup] Ready."
exit 0
