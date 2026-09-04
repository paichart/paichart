'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PAIChartLogoAuto } from '@/components/ui/PAIChartLogo';
import {
  Wrench,
  ClipboardList,
  BarChart,
  HelpCircle,
  GitBranch,
  MessageSquare,
  Bot
} from 'lucide-react';

interface SideNavProps {
  onMobileClose?: () => void;
}

interface NavItem {
  title: string;
  icon: React.ReactNode;
  path: string;
  allowedRoles?: string[];
}

const SideNav: React.FC<SideNavProps> = ({ onMobileClose }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user role securely from API
  useEffect(() => {
    async function fetchUserRole() {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const json = await response.json();
          // API returns: { data: { user: { role: "SUPER_ADMIN" } } }
          const role = json.data?.user?.role || json.role; // Support both formats
          setUserRole(role);
        }
      } catch {
        // Could not fetch user role
      } finally {
        setLoading(false);
      }
    }

    fetchUserRole();
  }, []);

  // ✅ PHASE 0: Define nav items with role requirements
  // Note: Role requirements don't expose much (Dashboard being admin-only is expected)
  const allNavItems: NavItem[] = [
    {
      title: 'Analytics',
      icon: <BarChart className="h-6 w-6" />,
      path: '/analytics'
    },
    {
      title: 'Projects',
      icon: <ClipboardList className="h-6 w-6" />,
      path: '/pov/list'
    },
    {
      title: 'Skills',
      icon: <MessageSquare className="h-6 w-6" />,
      path: '/prompt-library',
      allowedRoles: ['ADMIN', 'SUPER_ADMIN']  // Admin-only (server enforces this)
    },
    {
      title: 'Workflows',
      icon: <GitBranch className="h-6 w-6" />,
      path: '/workflows',
      allowedRoles: ['ADMIN', 'SUPER_ADMIN']  // Admin-only (server enforces this)
    },
    {
      title: 'Agents',
      icon: <Bot className="h-6 w-6" />,
      path: '/agents'
    },
    {
      title: 'Operations',
      icon: <Wrench className="h-6 w-6" />,
      path: '/dashboard',
      allowedRoles: ['ADMIN', 'SUPER_ADMIN']  // Admin-only (server enforces this)
    },
    {
      title: 'Support',
      icon: <HelpCircle className="h-6 w-6" />,
      path: '/support'
    }
  ];

  // ✅ Filter nav items by user role (UI/UX only - server still enforces)
  const visibleItems = loading
    ? allNavItems.filter(item => !item.allowedRoles) // Show public items while loading
    : allNavItems.filter(item => {
        if (!item.allowedRoles) return true; // No role restriction
        return userRole && item.allowedRoles.includes(userRole);
      });

  const handleNavClick = (path: string) => {
    router.push(path);
    if (onMobileClose) {
      onMobileClose();
    }
  };

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === path || pathname === '/';
    }
    return pathname.startsWith(path);
  };

  return (
    <nav className="flex w-24 shrink-0 flex-col border-r bg-background">
      {/* Logo — full wordmark (same as the expanded sidebar), matches navbar h-16 */}
      <div className="flex h-16 items-center justify-center border-b px-2">
        <PAIChartLogoAuto className="w-20 h-auto" />
      </div>

      {/* Spacing below the logo (kept after the chevron was removed) */}
      <div className="flex flex-col gap-1.5 px-2 pt-6">
        {visibleItems.map((item) => (
          <button
            key={item.path}
            onClick={() => handleNavClick(item.path)}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-1.5 rounded-lg px-1 py-3 text-center transition-colors',
              isActive(item.path)
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {item.icon}
            <span className="text-xs leading-tight">{item.title}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default SideNav;
