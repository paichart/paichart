import { useState, useEffect } from 'react';
import { SalesTheatre } from '@prisma/client';

export interface GeoPreferences {
  preferredSalesTheatre?: SalesTheatre;
  preferredCountryId?: string;
  preferredRegionId?: string;
}

/**
 * Hook to fetch user geographical preferences
 * @returns User geographical preferences
 */
export function useUserGeoPreferences() {
  const [preferences, setPreferences] = useState<GeoPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    async function fetchPreferences() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/user/preferences');
        
        if (!response.ok) {
          setPreferences(null);
          return;
        }

        const data = await response.json();

        if (!data.success) {
          setPreferences(null);
          return;
        }
        
        setPreferences({
          preferredSalesTheatre: data.data.preferredSalesTheatre,
          preferredCountryId: data.data.preferredCountryId,
          preferredRegionId: data.data.preferredRegionId,
        });
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setPreferences(null);
      } finally {
        setLoading(false);
      }
    }
    
    fetchPreferences();
  }, []);
  
  return {
    preferences,
    loading,
    error
  };
}
