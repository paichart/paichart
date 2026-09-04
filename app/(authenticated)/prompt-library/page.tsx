'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { UserRole } from '@/lib/types/auth';
import { PromptLibraryPage } from './PromptLibraryPage';

const ADMIN_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN];

export default function Page() {
  const { user, isLoadingUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoadingUser && (!user || !ADMIN_ROLES.includes(user.role))) {
      router.replace('/analytics');
    }
  }, [user, isLoadingUser, router]);

  if (isLoadingUser || !user || !ADMIN_ROLES.includes(user.role)) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <PromptLibraryPage userRole={user.role} />
    </div>
  );
}
