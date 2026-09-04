'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/lib/hooks/useToast';
import { GeographicalSelect } from '@/components/ui/GeographicalSelect';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { SalesTheatre } from '@prisma/client';
import { Loader2 } from 'lucide-react';

export function GeographicalPreferences() {
  const { preferences, loading, error, updatePreferences } = useUserPreferences();
  const { toast } = useToast();
  
  // Form state
  const [salesTheatre, setSalesTheatre] = useState<SalesTheatre | undefined>(undefined);
  const [countryId, setCountryId] = useState<string | undefined>(undefined);
  const [regionId, setRegionId] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  
  // Initialize form with user preferences
  useEffect(() => {
    if (preferences) {
      setSalesTheatre(preferences.preferredSalesTheatre);
      setCountryId(preferences.preferredCountryId);
      setRegionId(preferences.preferredRegionId);
    }
  }, [preferences]);
  
  // Handle geographical selection changes
  const handleGeographicalChange = (data: {
    theatre?: SalesTheatre;
    countryId?: string;
    regionId?: string;
  }) => {
    if (data.theatre !== undefined) setSalesTheatre(data.theatre);
    if (data.countryId !== undefined) setCountryId(data.countryId);
    if (data.regionId !== undefined) setRegionId(data.regionId);
  };
  
  // Save preferences
  const savePreferences = async () => {
    try {
      setIsSaving(true);
      await updatePreferences({
        preferredSalesTheatre: salesTheatre,
        preferredCountryId: countryId,
        preferredRegionId: regionId,
      });
      
      toast({
        title: 'Success',
        description: 'Geographical preferences saved successfully.',
        variant: 'success',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save geographical preferences.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Geographical Preferences</CardTitle>
        <CardDescription>
          Set your default geographical preferences for new POVs
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading preferences...</span>
          </div>
        ) : error ? (
          <div className="bg-destructive/10 p-4 rounded-md text-destructive">
            <p>Error loading preferences: {error.message}</p>
            <Button 
              variant="outline" 
              className="mt-2"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <GeographicalSelect
              selectedTheatre={salesTheatre}
              selectedCountry={countryId}
              selectedRegion={regionId}
              onChange={handleGeographicalChange}
              disabled={isSaving}
            />
            
            <div className="flex justify-end">
              <Button 
                onClick={savePreferences} 
                disabled={isSaving || loading}
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Preferences
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
