import type { JSX, ReactNode } from 'react';
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
  if (auth.error) {
    return <div className="p-8 text-red-500">Auth error: {auth.error.message}</div>;
  }
  if (!auth.isAuthenticated) return null;
  return <>{children}</>;
}
