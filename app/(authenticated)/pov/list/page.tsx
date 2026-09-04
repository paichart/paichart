'use client';

import { POVListView } from '@/components/pov/POVListView';
import { usePOVList } from '@/lib/pov/hooks/usePOVList';
import { useAuth } from '@/lib/hooks/useAuth';
import { UserRole } from '@/lib/types/auth';
import { Button } from '@/components/ui/Button';
import { Download, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';

export default function POVListPage() {
  const { 
    povs, 
    loading, 
    error, 
    availableTheatres,
    availableCountries,
    availableRegions,
    exportToCSV,
    refreshPovs 
  } = usePOVList();
  
  const { user, hasRole } = useAuth();
  const isAdmin = user && hasRole(UserRole.ADMIN);

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive">Error: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <POVListView 
        povs={povs} 
        loading={loading} 
        availableTheatres={availableTheatres}
        availableCountries={availableCountries}
        availableRegions={availableRegions}
        onExport={exportToCSV}
        onPovDeleted={refreshPovs}
      />
    </div>
  );
}
