'use client';

import React, { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Loader2Icon } from 'lucide-react';
import AuditLogViewer from '@/components/admin/AuditLog/AuditLogViewer';
import { ActivityListData } from '@/lib/admin/types';

export default function AuditLogPage() {
  const [initialData, setInitialData] = useState<ActivityListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/admin/audit?page=1&limit=10');
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || 'Failed to fetch audit data');
        }
        
        const { data } = await response.json();
        
        setInitialData(data);
      } catch (error) {
        console.error('Error fetching initial audit data:', error);
        setError(error instanceof Error ? error.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!initialData) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>No audit data available</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6">
      <AuditLogViewer initialData={initialData} />
    </div>
  );
}
