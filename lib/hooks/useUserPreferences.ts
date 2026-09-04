import { useState, useEffect, useCallback } from 'react';
import { SalesTheatre } from '@prisma/client';

export interface UserPreferences {
  preferredSalesTheatre?: SalesTheatre;
  preferredCountryId?: string;
  preferredRegionId?: string;
  preferredCountry?: {
    id: string;
    name: string;
    code: string;
    theatre: SalesTheatre;
  } | null;
  preferredRegion?: {
    id: string;
    name: string;
    type: string;
    countryId: string;
  } | null;
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Fetch preferences
  const fetchPreferences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/user/preferences');
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch preferences: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch preferences');
      }
      
      setPreferences(data.data);
    } catch (err) {
      console.error('Error fetching user preferences:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Update preferences
  const updatePreferences = useCallback(async (newPreferences: Partial<UserPreferences>) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferredSalesTheatre: newPreferences.preferredSalesTheatre,
          preferredCountryId: newPreferences.preferredCountryId,
          preferredRegionId: newPreferences.preferredRegionId,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update preferences: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to update preferences');
      }
      
      setPreferences(data.data);
      return data.data;
    } catch (err) {
      console.error('Error updating user preferences:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Fetch preferences on mount
  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);
  
  return {
    preferences,
    loading,
    error,
    fetchPreferences,
    updatePreferences
  };
}
