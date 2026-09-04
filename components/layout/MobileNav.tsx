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
  Settings,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

const menuItems = [
  { text: 'Dashboard', icon: LayoutDashboard, href: '/admin' },
  { text: 'PoV Management', icon: FileText, href: '/admin/pov' },
  { text: 'Analytics', icon: BarChart, href: '/admin/analytics' },
  { text: 'Team', icon: Users, href: '/admin/users' },
  { text: 'Settings', icon: Settings, href: '/admin/settings' },
];

export default function MobileNav({ open, onClose }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-[240px] sm:hidden p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="text-left">PoV Manager</SheetTitle>
        </SheetHeader>
        <nav className="space-y-1 p-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.text}
                href={item.href}
                onClick={onClose}
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
      </SheetContent>
    </Sheet>
  );
}
