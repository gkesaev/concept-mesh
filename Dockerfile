# ============================================================
# ConceptMesh — production image
#
# Based on Debian slim (not Alpine) because the card validation
# pipeline renders generated HTML in headless Chromium via
# Playwright, and Alpine's musl libc is not supported by the
# Playwright browser builds.
# ============================================================

# ============================================================
# Stage 1: Install dependencies
# ============================================================
FROM node:22-bookworm-slim AS deps

WORKDIR /app

# Skip Playwright browser download during `npm ci` — the runner
# stage installs browsers explicitly into a shared path.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev=false


# ============================================================
# Stage 2: Build the Next.js application
# ============================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build args available at build time for Next.js
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Stub DATABASE_URL for build — the real value comes at runtime
ENV DATABASE_URL=postgresql://placeholder:placeholder@placeholder:5432/placeholder

RUN npm run build


# ============================================================
# Stage 3: Minimal production runner
# ============================================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Shared path where Playwright browsers live — mounted as a
# volume in docker-compose so browsers persist across rebuilds.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Chromium runtime dependencies. `playwright install --with-deps`
# would pull these at build time, but doing it here keeps the
# image buildable even before the Playwright package lands in
# package.json (issue #9).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libatspi2.0-0 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libglib2.0-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
      wget \
 && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home nextjs

# Copy only what's needed to run
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy DB migration files for the migrate step
COPY --from=builder /app/lib/db ./lib/db
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Provision Chromium once at build time if Playwright is installed.
# Silently skipped until the Playwright package is added (issue #9),
# at which point the next image build picks it up automatically.
RUN mkdir -p "$PLAYWRIGHT_BROWSERS_PATH" \
 && if [ -d "node_modules/playwright-core" ]; then \
      npx --yes playwright install chromium; \
    else \
      echo "Playwright not installed — skipping Chromium provisioning"; \
    fi \
 && chown -R nextjs:nodejs "$PLAYWRIGHT_BROWSERS_PATH"

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
