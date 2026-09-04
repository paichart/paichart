'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import SideNav from './SideNav';
import UserMenu from './UserMenu';
import NotificationBell from './NotificationBell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/lib/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { POVSearchAndFilters } from '@/components/pov/POVSearchAndFilters';
import { usePOVFilters } from '@/lib/contexts/POVFiltersContext';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, isLoadingUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isRedirecting, setIsRedirecting] = React.useState(false);
  const { searchTerm, setSearchTerm, filters, setFilters, clearFilters } = usePOVFilters();

  // Check if we're on the POV list page
  const isPOVListPage = pathname === '/pov/list' || pathname === '/pov';

  useEffect(() => {
    if (!isLoadingUser && !user && !isRedirecting) {
      setIsRedirecting(true);
      // Use replace instead of push to prevent back button issues
      router.replace('/login');
    }
  }, [user, isLoadingUser, router, isRedirecting]);

  // Show loading state while checking auth or redirecting
  if (isLoadingUser || isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // If no user after loading, show nothing (redirect in progress)
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {user && <SideNav />}
      <div className="flex-grow flex flex-col">
        <div className="border-b bg-background">
          <div className="flex h-16 items-center px-4 gap-4">
            {/* POV Search/Filters - only show on POV list page */}
            {isPOVListPage && (
              <div className="flex-1 flex justify-center">
                <POVSearchAndFilters
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  filters={filters}
                  onFiltersChange={setFilters}
                  onClearFilters={clearFilters}
                />
              </div>
            )}
            {!isPOVListPage && <div className="flex-1" />}
            <div className="flex items-center space-x-4">
              {user && (
                <>
                  <ThemeToggle />
                  <NotificationBell />
                  <UserMenu />
                </>
              )}
            </div>
          </div>
        </div>
        <main className="flex-grow">
          {children}
        </main>
      </div>
    </div>
  );
}
