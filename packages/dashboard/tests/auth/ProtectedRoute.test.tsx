import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '../../src/auth/ProtectedRoute';

// vi.mock is hoisted — factory runs before any imports.
// We return a mutable ref so each test can override the return value.
const authState = {
  isLoading: false,
  isAuthenticated: false,
  error: null as Error | null,
  user: null,
  signinRedirect: vi.fn().mockResolvedValue(undefined),
  signoutRedirect: vi.fn(),
};

vi.mock('react-oidc-context', () => ({
  useAuth: () => authState,
}));

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authState.isLoading = false;
    authState.isAuthenticated = false;
    authState.error = null;
    authState.user = null;
    authState.signinRedirect = vi.fn().mockResolvedValue(undefined);
    authState.signoutRedirect = vi.fn();
  });

  it('renders children when authenticated', () => {
    authState.isAuthenticated = true;
    render(
      <ProtectedRoute>
        <span>secret</span>
      </ProtectedRoute>,
    );
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('triggers signinRedirect when not authenticated and not loading', async () => {
    authState.isAuthenticated = false;
    render(<ProtectedRoute>hidden</ProtectedRoute>);
    await waitFor(() => expect(authState.signinRedirect).toHaveBeenCalledTimes(1));
  });

  it('shows a loading state while auth is resolving', () => {
    authState.isLoading = true;
    render(<ProtectedRoute>hidden</ProtectedRoute>);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});
