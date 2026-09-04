'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Globe } from 'lucide-react';

export function GeographicalPreferencesLink() {
  return (
    <Card className="p-6">
      <div className="flex items-center mb-4">
        <Globe className="h-5 w-5 mr-2 text-primary" />
        <h2 className="text-xl font-semibold">Geographical Preferences</h2>
      </div>
      <p className="text-muted-foreground mb-4">
        Set your default geographical preferences for new POVs. These settings will be automatically applied when creating new POVs.
      </p>
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/settings/geographical">
            Manage Geographical Preferences
          </Link>
        </Button>
      </div>
    </Card>
  );
}
