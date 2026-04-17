import { QueryClientProvider } from '@tanstack/react-query';
import type { JSX } from 'react';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { queryClient } from './lib/queryClient';
import { router } from './routes/router';
import { ThemeProvider } from './theme/ThemeProvider';

export function App(): JSX.Element {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
