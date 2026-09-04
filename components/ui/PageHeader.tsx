"use client";

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared page header — icon + title + subtitle (+ optional right-aligned actions).
 * Extracted from the /agents page header so /agents, /workflows, /prompt-library share one chrome.
 * Defaults reproduce the agents header exactly (icon text-primary, h-7 w-7).
 */
export function PageHeader({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  actions,
}: {
  icon?: LucideIcon;
  iconClassName?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {Icon && <Icon className={cn('h-7 w-7', iconClassName ?? 'text-primary')} />}
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
