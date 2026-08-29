import React, { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { AuthProvider } from '../contexts/AuthContext';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { DateTimeZoneSync } from '../components/DateTimeZoneSync';
import { LanguageSync } from '../components/LanguageSync';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ConfirmProvider } from '../contexts/ConfirmContext';
import { SnackbarProvider } from '../contexts/SnackbarContext';
import { i18n } from '../i18n';

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <LanguageSync>
              <WorkspaceProvider>
                <DateTimeZoneSync>
                  <ConfirmProvider>
                    <SnackbarProvider>
                      <Suspense fallback={<div>Loading…</div>}>{children}</Suspense>
                    </SnackbarProvider>
                  </ConfirmProvider>
                </DateTimeZoneSync>
              </WorkspaceProvider>
            </LanguageSync>
          </AuthProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </ErrorBoundary>
  );
}
