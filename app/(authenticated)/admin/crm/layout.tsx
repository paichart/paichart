'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Settings, GitCompare, GitMerge } from 'lucide-react';

const menuItems = [
  { text: 'Settings', icon: Settings, href: '/admin/crm/settings' },
  { text: 'Field Mapping', icon: GitMerge, href: '/admin/crm/mapping' },
  { text: 'Sync Status', icon: GitCompare, href: '/admin/crm/sync' },
];

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div className="flex border-b">
        <nav className="flex space-x-4 px-6">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.text}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 py-4 text-sm font-medium transition-colors border-b-2",
                  "hover:text-primary",
                  isActive 
                    ? "border-primary text-primary" 
                    : "border-transparent text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.text}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
