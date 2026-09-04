'use client';

import { ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';
import { QueryProvider } from './QueryProvider';
import { CookiesProvider } from 'next-client-cookies';
import { AuthProvider } from './AuthProvider';
// Removed TaskNormalizationProvider import
// import { TaskNormalizationProvider } from './TaskNormalizationProvider';

interface ProvidersProps {
  children: ReactNode;
  initialCookies: Array<{
    name: string;
    value: string;
  }>;
}

export function Providers({ children, initialCookies }: ProvidersProps) {
  return (
    <CookiesProvider value={initialCookies}>
      <QueryProvider>
        <AuthProvider>
          {/* Removed TaskNormalizationProvider wrapper */}
          {/* providers/NotificationProvider removed 2026-06-13 — used the
              always-null useClientAuth hook; its context had zero consumers.
              Live notifications: components/layout/NotificationBell (self-contained,
              fetches /api/notifications directly; no provider/context needed). */}
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </AuthProvider>
      </QueryProvider>
    </CookiesProvider>
  );
}
