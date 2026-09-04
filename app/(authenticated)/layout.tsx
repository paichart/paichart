'use client';

import AppLayout from '@/components/layout/AppLayout';
import { POVFiltersProvider } from '@/lib/contexts/POVFiltersContext';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <POVFiltersProvider>
      <AppLayout>{children}</AppLayout>
    </POVFiltersProvider>
  );
}
