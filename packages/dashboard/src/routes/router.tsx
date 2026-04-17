import type { JSX } from 'react';
import { createBrowserRouter } from 'react-router';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { AppShell } from '../components/shell/AppShell';
import { AgentsActivity } from './pages/AgentsActivity';
import { AgentsConfig } from './pages/AgentsConfig';
import { AgentsStructure } from './pages/AgentsStructure';
import { Campaigns } from './pages/Campaigns';
import { Communities } from './pages/Communities';
import { ContentQueue } from './pages/ContentQueue';
import { Insights } from './pages/Insights';
import { LegendNew } from './pages/LegendNew';
import { Legends } from './pages/Legends';
import { LlmCenter } from './pages/LlmCenter';
import { ProductHome } from './pages/ProductHome';
import { Posts } from './pages/Posts';
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
      { path: 'campaigns', element: <Campaigns /> },
      { path: 'communities', element: <Communities /> },
      { path: 'insights', element: <Insights /> },
      { path: 'posts', element: <Posts /> },
      { path: 'agents', element: <AgentsStructure /> },
      { path: 'agents/activity', element: <AgentsActivity /> },
      { path: 'agents/config', element: <AgentsConfig /> },
      { path: 'tasks', element: <Tasks /> },
      { path: 'legends', element: <Legends /> },
      { path: 'legends/new', element: <LegendNew /> },
      { path: 'llm', element: <LlmCenter /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
  { path: '/callback', element: <SigningIn /> },
]);
