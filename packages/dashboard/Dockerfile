# ============================================
# Stage 1 — deps: install workspace dependencies
# ============================================
FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/engine/package.json ./packages/engine/
COPY packages/app/package.json ./packages/app/
COPY packages/dashboard/package.json ./packages/dashboard/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ============================================
# Stage 2 — builder: compile the Vite bundle
# ============================================
FROM node:22-alpine AS builder
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/dashboard/node_modules ./packages/dashboard/node_modules

COPY packages/dashboard/ ./packages/dashboard/

# Build-time browser env. Browser reaches Keycloak + API on the host,
# NOT via the Docker network (compose internal DNS isn't in the browser).
ARG VITE_KEYCLOAK_URL=http://localhost:9080
ARG VITE_KEYCLOAK_REALM=mynah
ARG VITE_KEYCLOAK_CLIENT_ID=mynah-dashboard
ARG VITE_API_BASE_URL=http://localhost:36401
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM
ENV VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN pnpm --filter @mynah/dashboard build

# ============================================
# Stage 3 — runtime: nginx serves the built SPA
# ============================================
FROM nginx:alpine AS runtime
COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/packages/dashboard/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1
