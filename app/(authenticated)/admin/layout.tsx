'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { UserRole, ResourceType, ResourceAction } from '@/lib/types/auth';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, hasRole, hasPermission, isLoadingUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = user && hasRole(UserRole.ADMIN);

  useEffect(() => {
    if (!isLoadingUser && (!user || !isAdmin)) {
      router.push('/dashboard');
      return;
    }

    // Get the resource type based on the current path
    const path = pathname?.split('/').filter(Boolean) || [];
    if (path.length > 1 && path[0] === 'admin') {
      const section = path[1];
      let resourceType: ResourceType;

      switch (section) {
        case 'user-management':
          resourceType = ResourceType.USER_MANAGEMENT;
          break;
        case 'permissions':
          resourceType = ResourceType.PERMISSIONS;
          break;
        case 'job-titles':
          resourceType = ResourceType.JOB_TITLES;
          break;
        case 'audit':
          resourceType = ResourceType.AUDIT;
          break;
        case 'crm':
          resourceType = ResourceType.CRM;
          // For CRM sub-sections
          const subSection = path[2];
          if (subSection) {
            switch (subSection) {
              case 'settings':
                resourceType = ResourceType.CRM_SETTINGS;
                break;
              case 'mapping':
                resourceType = ResourceType.CRM_MAPPING;
                break;
              case 'sync':
                resourceType = ResourceType.CRM_SYNC;
                break;
            }
          }
          break;
        default:
          return;
      }

      // Check if user has permission to view this section
      const canView = hasPermission(resourceType, ResourceAction.VIEW);
      if (!canView) {
        router.push('/dashboard');
      }
    }
  }, [user, isAdmin, isLoadingUser, router, pathname, hasPermission]);

  if (isLoadingUser) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return <>{children}</>;
}
