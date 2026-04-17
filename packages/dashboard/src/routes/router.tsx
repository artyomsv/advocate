import type { JSX } from 'react';
import { createBrowserRouter } from 'react-router';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { AppShell } from '../components/shell/AppShell';
import { ContentQueue } from './pages/ContentQueue';
import { Legends } from './pages/Legends';
import { LlmCenter } from './pages/LlmCenter';
import { ProductHome } from './pages/ProductHome';

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
      { index: true, element: <ProductHome /> },
      { path: 'queue', element: <ContentQueue /> },
      { path: 'legends', element: <Legends /> },
      { path: 'llm', element: <LlmCenter /> },
    ],
  },
  { path: '/callback', element: <SigningIn /> },
]);
