# Dashboard Shell + Auth Implementation Plan (Plan 13)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship a React 19 SPA at port 36400 that authenticates against the shared Keycloak via PKCE using client `mynah-dashboard`, shows a minimal shell (sidebar + topbar + dashboard home), and attaches the Bearer token to API calls against `mynah-api` on port 36401. Tag `plan13-complete`.

**Architecture:** New workspace package `@mynah/dashboard` (React 19 + Vite 6 + Tailwind 4 + shadcn/ui + TanStack Query + Zustand). `react-oidc-context` wraps `oidc-client-ts` for PKCE redirect + silent renew — no custom token handling code. `<ProtectedRoute>` gates real routes; the root layout mounts `<AppShell>` with sidebar/topbar. A thin `api()` fetch wrapper pulls the token from the OIDC context and sets `Authorization: Bearer …` on every request. Docker gets a new `dashboard` service built from a multi-stage `packages/dashboard/Dockerfile` — nginx serves the static bundle on container port 80 → host 36400.

**Tech Stack:** React 19 · Vite 6 · TypeScript 5.8 · Tailwind 4 (Oxide, no PostCSS config) · shadcn/ui (Radix primitives) · `react-router` 7 (data router) · `react-oidc-context` + `oidc-client-ts` · `@tanstack/react-query` · `zustand` · nginx (prod serve)

**Prerequisites:**
- Plan 12 complete (tag `plan12-complete`) — API enforces JWTs
- Plan R complete (tag `rename-complete`) — packages use `@mynah/*`
- Branch: `master`
- Keycloak realm `mynah` with client `mynah-dashboard` (publicClient + PKCE S256 + `redirectUris: http://localhost:36400/*`) — already configured
- Owner user `owner / Mynah-Dev-2026!` with `ROLE_ADMIN`

**Design decisions:**

1. **One package, not a submonorepo.** `packages/dashboard/` sits next to `app` and `engine`. No nested workspaces.
2. **`react-oidc-context` over `keycloak-js`.** Smaller, framework-agnostic, maintained, and does PKCE + silent renew out of the box. We don't need Keycloak-specific features like session status iframe checks.
3. **Silent renew via hidden iframe is disabled** for this plan. Access tokens live 900s (Keycloak default). The context refreshes automatically via the refresh token once Keycloak is patched for `offline_access` — or the user logs in again. Good enough for MVP.
4. **No route code-splitting in this plan.** One bundle. Route-level `React.lazy` can be added when the app has more than two real pages.
5. **No state persistence (yet).** Zustand store is transient. When we add dashboard preferences (collapsed sidebar, theme), we'll add `zustand/middleware` persist.
6. **nginx prod serve, vite dev in development.** In Docker the `dashboard` service serves built static files via `nginx:alpine`. For local dev, `pnpm --filter @mynah/dashboard dev` runs Vite on 5173 and proxies API calls to localhost:36401.
7. **Environment injection at build time.** Vite reads `VITE_*` vars from `.env`. For Docker, we inline them at build via `ARG` → `ENV` → build. Runtime re-configuration isn't needed at MVP.

---

## File Structure Overview

```
packages/dashboard/
├── package.json                       # @mynah/dashboard
├── tsconfig.json
├── tsconfig.node.json                 # for vite.config.ts
├── vite.config.ts
├── index.html
├── tailwind.config.ts                 # Tailwind 4 minimal config
├── postcss.config.js                  # (or skip if Tailwind 4 Oxide doesn't need it)
├── Dockerfile                          # multi-stage: build → nginx
├── nginx.conf                          # SPA fallback + API proxy (optional)
├── .dockerignore
├── src/
│   ├── main.tsx                       # entry; renders <App />
│   ├── App.tsx                        # wraps QueryClient + Router + AuthProvider
│   ├── index.css                      # Tailwind directives + theme CSS vars
│   ├── auth/
│   │   ├── AuthProvider.tsx           # react-oidc-context wrapper with config
│   │   ├── ProtectedRoute.tsx         # redirects to login when unauthenticated
│   │   └── useApiToken.ts             # hook that returns `Authorization: Bearer …`
│   ├── lib/
│   │   ├── api.ts                     # fetch wrapper
│   │   ├── queryClient.ts             # TanStack QueryClient instance
│   │   └── cn.ts                      # tailwind-merge helper
│   ├── routes/
│   │   ├── router.tsx                 # createBrowserRouter definition
│   │   └── pages/
│   │       ├── DashboardHome.tsx      # one real page (products count, legends count)
│   │       ├── LoginCallback.tsx      # optional — oidc-client handles inline
│   │       └── Unauthorized.tsx       # 403 screen
│   ├── components/
│   │   ├── shell/
│   │   │   ├── AppShell.tsx           # <Outlet/> layout with sidebar + topbar
│   │   │   ├── Sidebar.tsx
│   │   │   └── Topbar.tsx             # shows preferred_username + LogoutButton
│   │   └── ui/                        # shadcn/ui generated components (button, card)
│   └── stores/
│       └── ui.store.ts                # zustand: sidebarCollapsed

packages/dashboard/tests/
├── setup.ts
└── auth/
    └── ProtectedRoute.test.tsx        # redirects unauth users

docker-compose.yml                      # (modify) add `dashboard` service
pnpm-workspace.yaml                     # (modify if workspaces are listed explicitly)
```

---

## Task 1: Scaffold `@mynah/dashboard` workspace

**Files:** all new under `packages/dashboard/`.

- [ ] **Step 1.1: Check `pnpm-workspace.yaml`**

Open `pnpm-workspace.yaml`. If it lists packages explicitly, add `packages/dashboard`. If it uses a glob like `packages/*`, no change needed.

- [ ] **Step 1.2: `packages/dashboard/package.json`**

```json
{
  "name": "@mynah/dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173",
    "build": "tsc -p tsconfig.json && vite build",
    "preview": "vite preview --port 5173",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.70.0",
    "clsx": "^2.1.1",
    "oidc-client-ts": "^3.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-oidc-context": "^3.2.0",
    "react-router": "^7.4.0",
    "tailwind-merge": "^2.6.0",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.0",
    "@tailwindcss/vite": "^4.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "jsdom": "^26.0.0",
    "postcss": "^8.5.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.8.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

Run:
```bash
cd E:/Projects/Stukans/advocate
pnpm install
```

- [ ] **Step 1.3: `packages/dashboard/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "isolatedModules": true,
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 1.4: `packages/dashboard/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "skipLibCheck": true,
    "types": ["node"],
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 1.5: `packages/dashboard/vite.config.ts`**

```typescript
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Host-side dev: forward /api to the Fastify server on 36401.
      '/api': {
        target: 'http://localhost:36401',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
});
```

- [ ] **Step 1.6: `packages/dashboard/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mynah</title>
  </head>
  <body class="bg-slate-950 text-slate-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 1.7: `packages/dashboard/src/index.css`**

```css
@import "tailwindcss";

@theme {
  --color-brand: oklch(0.72 0.22 260);
}
```

- [ ] **Step 1.8: `packages/dashboard/tests/setup.ts`**

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 1.9: `packages/dashboard/.dockerignore`**

```
node_modules
dist
.turbo
.vite
*.log
.DS_Store
```

- [ ] **Step 1.10: Smoke entry + commit**

`packages/dashboard/src/main.tsx`:

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

function Placeholder(): JSX.Element {
  return <div className="p-8 text-xl">Mynah dashboard scaffolding OK</div>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <Placeholder />
  </StrictMode>,
);
```

Verify the scaffold:
```bash
pnpm --filter @mynah/dashboard typecheck
pnpm --filter @mynah/dashboard build
```

Both must pass. Commit:
```bash
git add packages/dashboard pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(dashboard): scaffold @mynah/dashboard (React 19 + Vite 6 + Tailwind 4)"
```

---

## Task 2: OIDC wiring + ProtectedRoute

**Files:** all new under `packages/dashboard/src/auth/`.

- [ ] **Step 2.1: `packages/dashboard/src/auth/AuthProvider.tsx`**

```typescript
import { WebStorageStateStore } from 'oidc-client-ts';
import type { ReactNode } from 'react';
import { AuthProvider as OidcProvider, type AuthProviderProps } from 'react-oidc-context';

const oidcConfig: AuthProviderProps = {
  authority: `${import.meta.env.VITE_KEYCLOAK_URL}/realms/${import.meta.env.VITE_KEYCLOAK_REALM}`,
  client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
  redirect_uri: `${window.location.origin}/callback`,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email',
  loadUserInfo: true,
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  // Strip the authorization code + state params from the URL after signin,
  // so refreshing the page doesn't retry the exchange.
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  return <OidcProvider {...oidcConfig}>{children}</OidcProvider>;
}
```

Add Vite env types in `packages/dashboard/src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KEYCLOAK_URL: string;
  readonly VITE_KEYCLOAK_REALM: string;
  readonly VITE_KEYCLOAK_CLIENT_ID: string;
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 2.2: `packages/dashboard/.env` (local dev)**

```
VITE_KEYCLOAK_URL=http://localhost:9080
VITE_KEYCLOAK_REALM=mynah
VITE_KEYCLOAK_CLIENT_ID=mynah-dashboard
VITE_API_BASE_URL=http://localhost:36401
```

This file is gitignored per root `.gitignore` (`.env` pattern applies to subdirs too). If it doesn't, add `packages/dashboard/.env` to the root `.gitignore`.

- [ ] **Step 2.3: `packages/dashboard/src/auth/ProtectedRoute.tsx`**

```typescript
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';

export function ProtectedRoute({ children }: { children: ReactNode }): JSX.Element | null {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && !auth.error) {
      void auth.signinRedirect();
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.error, auth]);

  if (auth.isLoading) return <div className="p-8">Loading…</div>;
  if (auth.error) return <div className="p-8 text-red-500">Auth error: {auth.error.message}</div>;
  if (!auth.isAuthenticated) return null;
  return <>{children}</>;
}
```

- [ ] **Step 2.4: `packages/dashboard/src/auth/useApiToken.ts`**

```typescript
import { useAuth } from 'react-oidc-context';

/** Returns the bearer header suffix (without "Bearer ") or null if unauthenticated. */
export function useApiToken(): string | null {
  const auth = useAuth();
  return auth.user?.access_token ?? null;
}
```

- [ ] **Step 2.5: `packages/dashboard/src/lib/api.ts`**

```typescript
export interface ApiOptions extends RequestInit {
  token?: string | null;
}

const BASE = import.meta.env.VITE_API_BASE_URL;

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { token, headers, ...rest } = opts;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}
```

- [ ] **Step 2.6: `packages/dashboard/src/lib/queryClient.ts`**

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

- [ ] **Step 2.7: Test — `packages/dashboard/tests/auth/ProtectedRoute.test.tsx`**

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import * as OidcContext from 'react-oidc-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '../../src/auth/ProtectedRoute';

describe('ProtectedRoute', () => {
  let signinRedirect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    signinRedirect = vi.fn().mockResolvedValue(undefined);
  });

  function mockAuth(over: Partial<ReturnType<typeof OidcContext.useAuth>> = {}) {
    vi.spyOn(OidcContext, 'useAuth').mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      error: null,
      user: null,
      signinRedirect,
      signoutRedirect: vi.fn(),
      ...over,
    } as ReturnType<typeof OidcContext.useAuth>);
  }

  it('renders children when authenticated', () => {
    mockAuth({ isAuthenticated: true });
    render(
      <ProtectedRoute>
        <span>secret</span>
      </ProtectedRoute>,
    );
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('triggers signinRedirect when not authenticated and not loading', async () => {
    mockAuth({ isAuthenticated: false });
    render(<ProtectedRoute>hidden</ProtectedRoute>);
    await waitFor(() => expect(signinRedirect).toHaveBeenCalledTimes(1));
  });

  it('shows a loading state while auth is resolving', () => {
    mockAuth({ isLoading: true });
    render(<ProtectedRoute>hidden</ProtectedRoute>);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});
```

Run:
```bash
pnpm --filter @mynah/dashboard test ProtectedRoute
```

All 3 tests pass.

- [ ] **Step 2.8: Commit**

```bash
git add packages/dashboard/src/auth packages/dashboard/src/lib packages/dashboard/src/vite-env.d.ts \
        packages/dashboard/.env packages/dashboard/tests
git commit -m "feat(dashboard): OIDC auth wiring + ProtectedRoute + api client"
```

---

## Task 3: Shell layout + dashboard home + router

**Files:** all new under `packages/dashboard/src/components/` and `src/routes/`.

- [ ] **Step 3.1: `packages/dashboard/src/lib/cn.ts`**

```typescript
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3.2: `packages/dashboard/src/stores/ui.store.ts`**

```typescript
import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
```

- [ ] **Step 3.3: `packages/dashboard/src/components/shell/Sidebar.tsx`**

```typescript
import { NavLink } from 'react-router';
import { useUiStore } from '../../stores/ui.store';
import { cn } from '../../lib/cn';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/products', label: 'Products' },
  { to: '/legends', label: 'Legends' },
] as const;

export function Sidebar(): JSX.Element {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  return (
    <aside
      className={cn(
        'flex flex-col border-r border-slate-800 bg-slate-900',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      <div className="p-4 text-lg font-semibold">{collapsed ? 'M' : 'Mynah'}</div>
      <nav className="flex flex-col gap-1 p-2">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              cn(
                'rounded px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60',
              )
            }
          >
            {collapsed ? n.label.charAt(0) : n.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3.4: `packages/dashboard/src/components/shell/Topbar.tsx`**

```typescript
import { useAuth } from 'react-oidc-context';
import { useUiStore } from '../../stores/ui.store';

export function Topbar(): JSX.Element {
  const auth = useAuth();
  const toggle = useUiStore((s) => s.toggleSidebar);
  const username = auth.user?.profile.preferred_username ?? '—';

  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
      <button
        type="button"
        onClick={toggle}
        className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800"
      >
        ☰
      </button>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-slate-400">{username}</span>
        <button
          type="button"
          onClick={() => void auth.signoutRedirect()}
          className="rounded border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3.5: `packages/dashboard/src/components/shell/AppShell.tsx`**

```typescript
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell(): JSX.Element {
  return (
    <div className="flex h-screen w-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.6: `packages/dashboard/src/routes/pages/DashboardHome.tsx`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useApiToken } from '../../auth/useApiToken';

interface Product {
  id: string;
  name: string;
  slug: string;
}

export function DashboardHome(): JSX.Element {
  const token = useApiToken();
  const products = useQuery({
    queryKey: ['products'],
    queryFn: () => api<Product[]>('/products', { token }),
    enabled: !!token,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="rounded border border-slate-800 bg-slate-900 p-4">
        <div className="text-sm text-slate-400">Products</div>
        <div className="text-3xl">
          {products.isLoading ? '…' : products.isError ? 'error' : products.data?.length ?? 0}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.7: `packages/dashboard/src/routes/router.tsx`**

```typescript
import { createBrowserRouter } from 'react-router';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { AppShell } from '../components/shell/AppShell';
import { DashboardHome } from './pages/DashboardHome';

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardHome /> },
      // Placeholder route — full pages land in Plan 14.
      { path: 'products', element: <div className="text-slate-400">Coming in Plan 14</div> },
      { path: 'legends', element: <div className="text-slate-400">Coming in Plan 14</div> },
    ],
  },
  { path: '/callback', element: <div className="p-8">Signing in…</div> },
]);
```

- [ ] **Step 3.8: `packages/dashboard/src/App.tsx`**

```typescript
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { queryClient } from './lib/queryClient';
import { router } from './routes/router';

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 3.9: Update `packages/dashboard/src/main.tsx`**

Replace the Placeholder with:

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3.10: Typecheck + build + commit**

```bash
pnpm --filter @mynah/dashboard typecheck
pnpm --filter @mynah/dashboard build
```

Both must pass. Check `packages/dashboard/dist/index.html` exists.

```bash
git add packages/dashboard/src
git commit -m "feat(dashboard): AppShell + DashboardHome + router + Zustand UI store"
```

---

## Task 4: Docker dashboard service

**Files:**
- Create: `packages/dashboard/Dockerfile`
- Create: `packages/dashboard/nginx.conf`
- Modify: `docker-compose.yml`

- [ ] **Step 4.1: `packages/dashboard/Dockerfile`**

Multi-stage: build with Node, serve with nginx.

```dockerfile
# ============================================
# Stage 1 — deps
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
# Stage 2 — builder
# ============================================
FROM node:22-alpine AS builder
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/dashboard/node_modules ./packages/dashboard/node_modules
COPY packages/dashboard/ ./packages/dashboard/

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
# Stage 3 — nginx serve
# ============================================
FROM nginx:alpine AS runtime
COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/packages/dashboard/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1
```

- [ ] **Step 4.2: `packages/dashboard/nginx.conf`**

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # SPA fallback — any non-file request returns index.html so react-router
  # handles the route on the client.
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Static asset cache
  location ~* \.(?:js|css|svg|png|jpg|jpeg|gif|ico|webp|woff2)$ {
    expires 7d;
    add_header Cache-Control "public, immutable";
  }
}
```

- [ ] **Step 4.3: `docker-compose.yml` — add `dashboard` service**

After the `worker` service block:

```yaml
  dashboard:
    build:
      context: .
      dockerfile: packages/dashboard/Dockerfile
      target: runtime
      args:
        # Browser-facing values — the SPA talks to the user's host, not to the Docker
        # network. Keycloak and the API are reachable from the browser at localhost.
        VITE_KEYCLOAK_URL: "http://localhost:9080"
        VITE_KEYCLOAK_REALM: "mynah"
        VITE_KEYCLOAK_CLIENT_ID: "mynah-dashboard"
        VITE_API_BASE_URL: "http://localhost:36401"
    container_name: mynah-dashboard
    ports:
      - "${DASHBOARD_PORT:-36400}:80"
    depends_on:
      api:
        condition: service_healthy
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

Validate:
```bash
docker compose config --quiet
```

Commit:
```bash
git add packages/dashboard/Dockerfile packages/dashboard/nginx.conf docker-compose.yml
git commit -m "feat(dashboard): Docker image + compose service (nginx-served SPA)"
```

---

## Task 5: Docker round-trip + tag

- [ ] **Step 5.1: Full stack up**

```bash
docker compose up -d --build
```

Wait for all 5 containers healthy: `mynah-postgres`, `mynah-redis`, `mynah-api`, `mynah-worker`, `mynah-dashboard`.

- [ ] **Step 5.2: Verify dashboard serves**

```bash
curl -sS -o /dev/null -w "dashboard root: %{http_code}\n" http://localhost:36400/
curl -sS -o /dev/null -w "dashboard index: %{http_code}\n" http://localhost:36400/index.html
```

Both 200.

- [ ] **Step 5.3: Manual browser verification**

Open `http://localhost:36400/` in Chrome:
1. Expect redirect to Keycloak login page (`http://localhost:9080/realms/mynah/protocol/openid-connect/auth?…`).
2. Log in as `owner / Mynah-Dev-2026!`.
3. Keycloak redirects back to `http://localhost:36400/callback` then to `/`.
4. `AppShell` renders: sidebar with Dashboard/Products/Legends, topbar shows `owner` + Log out button.
5. Dashboard home shows a "Products" card with count `0` (fresh DB post-rename).
6. Open DevTools → Network. Confirm a `GET http://localhost:36401/products` with `Authorization: Bearer …` header returns 200.

- [ ] **Step 5.4: Logout verification**

Click Log out. Keycloak clears the session and redirects back to `http://localhost:36400`. The SPA shows the loading state, then redirects to Keycloak login again — confirming auth is really enforced.

- [ ] **Step 5.5: Tear down + tag**

```bash
docker compose down
git tag -a plan13-complete -m "Plan 13 (Dashboard shell + auth) complete — React 19 SPA, PKCE via mynah-dashboard, protected routes, nginx-served, Bearer tokens flow to API"
git push origin master
git push origin plan13-complete
```

- [ ] **Step 5.6: Update plan README**

Edit `docs/plans/README.md` — Plan 13 row:

```
| 13 | Dashboard: Shell + Auth — React + shadcn/ui + Keycloak SPA | ✅ Complete (tag `plan13-complete`) | [2026-04-17-13-dashboard-shell-auth.md](2026-04-17-13-dashboard-shell-auth.md) |
```

Commit:
```bash
git add docs/plans/README.md
git commit -m "docs(plan): mark Plan 13 (dashboard shell + auth) complete"
git push origin master
```

---

## Acceptance Criteria

1. ✅ `@mynah/dashboard` workspace builds with `pnpm --filter @mynah/dashboard build`
2. ✅ `ProtectedRoute` redirects unauthenticated users to Keycloak and returns children when authenticated (3/3 tests pass)
3. ✅ `AppShell` renders with sidebar + topbar + `<Outlet />`, displays `preferred_username`
4. ✅ `DashboardHome` fetches `GET /products` with Bearer token and renders the count
5. ✅ Docker `mynah-dashboard` container serves SPA on port 36400
6. ✅ End-to-end browser flow: visit `/` → Keycloak login → redirect back → protected content
7. ✅ Log out flow clears the session and re-prompts for login
8. ✅ Tag `plan13-complete` pushed

## Out of Scope

- **Full products/legends CRUD pages** — Plan 14
- **Kanban / content approval queue** — Plan 14
- **Theme toggle + persisted UI state** — later, when more than one preference exists
- **Silent token refresh via iframe** — optional polish; current 15-min access token + logout-on-expiry is fine for MVP
- **Role-gated UI** — add when `ROLE_USER` vs `ROLE_ADMIN` UX differs
- **shadcn/ui CLI scaffolding** — install on-demand in Plan 14 when Card/Table/Dialog are needed

---

**End of Plan 13 (Dashboard Shell + Auth).**
