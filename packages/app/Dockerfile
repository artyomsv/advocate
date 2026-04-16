# ============================================
# Stage 1 — deps: install workspace dependencies
# ============================================
FROM node:22-alpine AS deps
WORKDIR /repo

# Enable pnpm via corepack (bundled with Node 22)
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

# Copy lockfile + all workspace manifests first so Docker caches the install layer
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/engine/package.json ./packages/engine/
COPY packages/app/package.json ./packages/app/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ============================================
# Stage 2 — builder: compile TypeScript
# ============================================
FROM node:22-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

# Bring in the full dependency tree from deps stage
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/engine/node_modules ./packages/engine/node_modules
COPY --from=deps /repo/packages/app/node_modules ./packages/app/node_modules

# Copy source
COPY . .

# Build engine first (app depends on its dist), then app
RUN pnpm --filter @advocate/engine build
RUN pnpm --filter @advocate/app build

# ============================================
# Stage 3 — runtime: slim image with only what's needed
# ============================================
FROM node:22-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

# Create a non-root user for the runtime
RUN addgroup -S advocate -g 1001 && \
    adduser -S advocate -u 1001 -G advocate

# Copy the monorepo manifest + workspace configs (pnpm needs them at runtime too)
COPY --from=builder /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./

# Copy engine (only dist + manifest)
COPY --from=builder /repo/packages/engine/package.json ./packages/engine/
COPY --from=builder /repo/packages/engine/dist ./packages/engine/dist

# Copy app (dist + manifest + migrations + drizzle config)
COPY --from=builder /repo/packages/app/package.json ./packages/app/
COPY --from=builder /repo/packages/app/dist ./packages/app/dist
COPY --from=builder /repo/packages/app/drizzle ./packages/app/drizzle

# Install production deps only (re-installing here drops devDependencies)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile

# Ownership + non-root
RUN chown -R advocate:advocate /app
USER advocate

EXPOSE 3000

# Entrypoint: apply pending migrations, then start server.
# Using sh -c keeps it a single container responsibility — no migrate sidecar needed
# for single-instance dev/staging. Switch to a separate one-shot `migrate` service
# in production k8s so replicas don't race.
CMD ["sh", "-c", "node packages/app/dist/db/migrate.js && node packages/app/dist/server/server.js"]

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD wget -qO- http://localhost:3000/health || exit 1
