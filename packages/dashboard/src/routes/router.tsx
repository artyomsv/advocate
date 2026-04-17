import type { JSX } from 'react';
import { createBrowserRouter } from 'react-router';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { AppShell } from '../components/shell/AppShell';
import { DashboardHome } from './pages/DashboardHome';

function ComingSoon(): JSX.Element {
  return <div className="text-slate-400">Coming in Plan 14</div>;
}

function SigningIn(): JSX.Element {
  return <div className="p-8">Signing in…</div>;
}

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
      { path: 'products', element: <ComingSoon /> },
      { path: 'legends', element: <ComingSoon /> },
    ],
  },
  { path: '/callback', element: <SigningIn /> },
]);
