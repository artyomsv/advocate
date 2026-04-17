import { WebStorageStateStore } from 'oidc-client-ts';
import type { JSX, ReactNode } from 'react';
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
  onSigninCallback: () => {
    // Strip code + state from URL so refresh doesn't retry the exchange.
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  return <OidcProvider {...oidcConfig}>{children}</OidcProvider>;
}
