'use client';

import React from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { UserRole } from '@/lib/types/auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Separator } from '@/components/ui/Separator';
import { PAIChartIcon } from '@/components/ui/PAIChartLogo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

export default function UserMenu() {
  const { user, hasRole } = useAuth();
  const isAdmin = user && hasRole(UserRole.ADMIN);
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include', // Include cookies in the request
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Logout failed');
      }
      // Force a hard refresh to clear any cached state
      window.location.href = '/login';
    } catch {
      // Even if logout fails on the server, redirect to login
      window.location.href = '/login';
    }
  };

  if (!user) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <DropdownMenu>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 rounded-full flex items-center justify-center hover:bg-accent transition-colors"
              >
                <div className="h-9 w-9 rounded-full flex items-center justify-center p-0.5 bg-gradient-to-br from-background to-muted border border-border hover:border-primary/50 transition-all">
                  <PAIChartIcon className="w-full h-full" />
                </div>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            Account settings
          </TooltipContent>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-3 py-2 bg-muted/30 dark:bg-muted/20 dusk:bg-muted/15">
              <p className="text-sm font-semibold leading-none">
                {user.name}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5">
                {user.email}
              </p>
              {isAdmin && (
                <p className="text-xs font-medium bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive dusk:bg-destructive/15 dusk:text-destructive/90 rounded px-1.5 py-0.5 mt-1.5 inline-block">
                  Administrator
                </p>
              )}
            </div>
            <Separator className="my-1" />
            <DropdownMenuItem
              onClick={() => router.push('/profile')}
              className="py-2 cursor-pointer hover:bg-primary/10 dark:hover:bg-primary/20 dusk:hover:bg-primary/15"
            >
              <span className="font-medium">Profile Settings</span>
            </DropdownMenuItem>
            {isSuperAdmin && (
              <DropdownMenuItem
                onClick={() => router.push('/admin')}
                className="py-2 cursor-pointer hover:bg-destructive/10 dark:hover:bg-destructive/20 dusk:hover:bg-destructive/15"
              >
                <span className="font-medium">Admin Dashboard</span>
              </DropdownMenuItem>
            )}
            <Separator className="my-1" />
            <DropdownMenuItem
              onClick={handleLogout}
              className="py-2 cursor-pointer hover:bg-destructive/10 dark:hover:bg-destructive/20 dusk:hover:bg-destructive/15 text-destructive dusk:text-destructive/90"
            >
              <span className="font-medium">Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Tooltip>
    </TooltipProvider>
  );
}
