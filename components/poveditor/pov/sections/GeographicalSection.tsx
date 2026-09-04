import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { GeographicalSelect } from '@/components/ui/GeographicalSelect';
import { SalesTheatre } from '@prisma/client';

interface GeographicalSectionProps {
  selectedTheatre?: SalesTheatre;
  selectedRegion?: string;
  selectedCountry?: string;
  onChange: (data: {
    theatre?: SalesTheatre;
    regionId?: string;
    countryId?: string;
  }) => void;
}

export function GeographicalSection({
  selectedTheatre,
  selectedRegion,
  selectedCountry,
  onChange
}: GeographicalSectionProps) {
  return (
    <div className="space-y-4">
      <GeographicalSelect
        selectedTheatre={selectedTheatre}
        selectedRegion={selectedRegion}
        selectedCountry={selectedCountry}
        onChange={onChange}
      />
      {!selectedCountry && (
        <Alert className="mt-4">
          <AlertDescription>
            Country selection is required for POV creation.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default GeographicalSection;
