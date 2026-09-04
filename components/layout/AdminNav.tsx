"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  BarChart,
  Users,
  Shield,
  Briefcase,
  History,
  Settings,
  GitMerge,
} from 'lucide-react';

const menuItems = [
  { text: 'Dashboard', icon: LayoutDashboard, href: '/admin/dashboard' },
  { text: 'PoV Management', icon: FileText, href: '/admin/pov' },
  { text: 'Analytics', icon: BarChart, href: '/admin/analytics' },
  { text: 'Users', icon: Users, href: '/admin/users' },
  { text: 'User Permissions', icon: Shield, href: '/admin/permissions' },
  { text: 'Job Titles', icon: Briefcase, href: '/admin/roles' },
  { text: 'CRM Integration', icon: GitMerge, href: '/admin/crm/settings' },
  { text: 'Audit Log', icon: History, href: '/admin/audit' },
  { text: 'Settings', icon: Settings, href: '/admin/settings' },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="hidden sm:flex h-screen w-60 flex-col border-r bg-background">
      <div className="p-6">
        <h1 className="text-xl font-semibold text-primary">
          PoV Manager
        </h1>
      </div>
      <nav className="space-y-1 px-2">
        {menuItems.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.text}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-accent-foreground"
              )}
            >
              <Icon className={cn(
                "h-4 w-4",
                isActive ? "text-primary" : "text-muted-foreground"
              )} />
              <span className={cn(
                isActive ? "text-primary font-medium" : "text-muted-foreground"
              )}>
                {item.text}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
