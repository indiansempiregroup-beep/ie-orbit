import React, { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../contexts/AuthContext';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { DateTimeZoneSync } from '../components/DateTimeZoneSync';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ConfirmProvider } from '../contexts/ConfirmContext';
import { SnackbarProvider } from '../contexts/SnackbarContext';

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WorkspaceProvider>
            <DateTimeZoneSync>
              <ThemeProvider>
                <ConfirmProvider>
                  <SnackbarProvider>
                    <Suspense fallback={<div>Loading…</div>}>{children}</Suspense>
                  </SnackbarProvider>
                </ConfirmProvider>
              </ThemeProvider>
            </DateTimeZoneSync>
          </WorkspaceProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
