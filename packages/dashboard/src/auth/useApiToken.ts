import { useAuth } from 'react-oidc-context';

export function useApiToken(): string | null {
  const auth = useAuth();
  return auth.user?.access_token ?? null;
}
