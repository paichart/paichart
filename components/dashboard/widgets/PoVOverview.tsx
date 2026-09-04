'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { RefreshCw } from 'lucide-react';

interface PoVStats {
  totalPoVs: number;
  draftPoVs: number;
  inProgressPoVs: number;
  completedPoVs: number;
  recentPoVs: Array<{
    id: string;
    title: string;
    status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    owner: {
      name: string | null;
      email: string;
    };
  }>;
}

export function PoVOverview() {
  const [stats, setStats] = useState<PoVStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/dashboard/pov-overview');
      if (!response.ok) {
        throw new Error('Failed to fetch PoV statistics');
      }
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRefresh = () => {
    fetchStats();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-6">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">PoV Overview</h3>
        <Button variant="ghost" size="icon" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium mb-4">Statistics</h4>
            <dl className="space-y-4">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total PoVs</dt>
                <dd className="font-medium">{stats.totalPoVs}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Draft</dt>
                <dd className="font-medium">{stats.draftPoVs}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">In Progress</dt>
                <dd className="font-medium">{stats.inProgressPoVs}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Completed</dt>
                <dd className="font-medium">{stats.completedPoVs}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-4">Recent PoVs</h4>
            <ul className="space-y-4">
              {stats.recentPoVs.map((pov) => (
                <li key={pov.id} className="flex flex-col">
                  <span className="font-medium">{pov.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {pov.owner.name || pov.owner.email} • {pov.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
