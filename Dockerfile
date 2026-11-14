# QA Forge API: Node 20 plus the Chromium headless shell that test runs use.
# Build from the repo root: docker build -t qaforge-api .
# Configuration comes from environment variables at runtime (see apps/api/.env.example).
FROM node:20-bookworm-slim

ENV CI=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile --filter "@qaforge/api..." \
 && pnpm --filter "@qaforge/api..." build

# Only the headless shell (what headless runs launch) plus its system libraries: about 450 MB
# smaller than full Chromium. Firefox and WebKit are not installed.
RUN pnpm --filter @qaforge/playwright-runner exec playwright install --with-deps --only-shell chromium \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production PORT=4000
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
