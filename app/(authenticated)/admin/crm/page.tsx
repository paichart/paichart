'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Settings, ArrowLeftRight, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

const CRMCard = ({ title, description, icon: Icon, path }: {
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  path: string;
}) => {
  const router = useRouter();

  return (
    <Card>
      <div className="p-6 h-full flex flex-col">
        <div className="mb-4 text-primary">
          <Icon className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-semibold mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
        <div className="mt-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(path)}
          >
            Configure
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default function CRMPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">CRM Integration</h1>
        <p className="text-muted-foreground">
          Configure CRM integration settings and field mappings for PoV synchronization.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <CRMCard
          title="Global Settings"
          description="Configure CRM connection settings, authentication, and global sync preferences."
          icon={Settings}
          path="/admin/crm/settings"
        />
        <CRMCard
          title="Field Mapping"
          description="Define and manage field mappings between PoV data and CRM fields."
          icon={ArrowLeftRight}
          path="/admin/crm/mapping"
        />
        <CRMCard
          title="Sync Status"
          description="Monitor CRM synchronization status and view sync history across all PoVs."
          icon={RefreshCw}
          path="/admin/crm/sync"
        />
      </div>
    </div>
  );
}
