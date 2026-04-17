import type { JSX } from 'react';
import { createBrowserRouter } from 'react-router';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { AppShell } from '../components/shell/AppShell';
import { AgentsActivity } from './pages/AgentsActivity';
import { AgentsStructure } from './pages/AgentsStructure';
import { ContentQueue } from './pages/ContentQueue';
import { LegendNew } from './pages/LegendNew';
import { Legends } from './pages/Legends';
import { LlmCenter } from './pages/LlmCenter';
import { ProductHome } from './pages/ProductHome';
import { Settings } from './pages/Settings';
import { Tasks } from './pages/Tasks';

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
      { path: 'agents', element: <AgentsStructure /> },
      { path: 'agents/activity', element: <AgentsActivity /> },
      { path: 'tasks', element: <Tasks /> },
      { path: 'legends', element: <Legends /> },
      { path: 'legends/new', element: <LegendNew /> },
      { path: 'llm', element: <LlmCenter /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
  { path: '/callback', element: <SigningIn /> },
]);
