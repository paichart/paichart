import React, { useState, useEffect } from 'react';
import { PhaseTemplate } from '@/lib/pov/phase-templates/types';
import { useQuery } from '@tanstack/react-query';

interface TemplateWizardReviewSectionProps {
  formData: Record<string, any>;
  selectedPhaseTemplates: string[];
  phaseTemplates: PhaseTemplate[];
}

export function TemplateWizardReviewSection({
  formData,
  selectedPhaseTemplates,
  phaseTemplates
}: TemplateWizardReviewSectionProps) {
  // Define types for geographical data
  type Region = {
    id: string;
    name: string;
  };
  
  type Country = {
    id: string;
    name: string;
    regions?: Region[];
  };

  // Fetch country and region data for display
  const { data: countries, isLoading: countriesLoading } = useQuery<Country[]>({
    queryKey: ['countries'],
    queryFn: async () => {
      const response = await fetch('/api/geographical/countries');
      if (!response.ok) throw new Error('Failed to fetch countries');
      return response.json();
    }
  });

  // Fetch phase template data for any templates not already loaded
  const missingTemplateIds = (selectedPhaseTemplates || []).filter(
    id => !phaseTemplates.some(template => template.id === id)
  );

  const [additionalTemplates, setAdditionalTemplates] = useState<PhaseTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  useEffect(() => {
    const fetchMissingTemplates = async () => {
      if (missingTemplateIds.length === 0) return;
      
      setLoadingTemplates(true);
      
      try {
        const templatePromises = missingTemplateIds.map(async (id) => {
          try {
            const response = await fetch(`/api/phase-templates/${id}`);
            if (response.ok) {
              return await response.json();
            }
            if (response.status === 429 || response.status === 404) {
              return null;
            }
            return null;
          } catch {
            return null;
          }
        });
        
        const results = await Promise.all(templatePromises);
        setAdditionalTemplates(results.filter(Boolean));
      } catch {
        // Could not fetch missing templates
      } finally {
        setLoadingTemplates(false);
      }
    };
    
    fetchMissingTemplates();
  }, [missingTemplateIds]);

  // Combine loaded templates with additional templates
  const allPhaseTemplates = [...phaseTemplates, ...additionalTemplates];

  // Format the display value based on field type
  const getDisplayValue = (key: string, value: any) => {
    // Handle geographical data
    if (key === 'countryId' && value) {
      const country = countries?.find((c: Country) => c.id === value);
      return country ? country.name : `Country ID: ${value}`;
    }
    if (key === 'regionId' && value) {
      // Find the country first
      const country = countries?.find((c: Country) =>
        c.regions?.some((r: Region) => r.id === value)
      );
      // Then find the region within that country
      const region = country?.regions?.find((r: Region) => r.id === value);
      return region ? region.name : `Region ID: ${value}`;
    }
    if (key === 'salesTheatre' && value) {
      return value.replace('_', ' ');
    }
    
    // Handle other types
    if (value === null || value === undefined) return 'Not specified';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    
    return String(value);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">POV Details</h3>
      {countriesLoading ? (
        <div>Loading geographical data...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(formData).map(([key, value]) => (
            <div key={key} className="border-b pb-2">
              <div className="text-sm font-medium text-gray-500">{key}</div>
              <div>{getDisplayValue(key, value)}</div>
            </div>
          ))}
        </div>
      )}
      
      <h3 className="text-lg font-medium">Selected Phase Templates</h3>
      {loadingTemplates ? (
        <div className="flex items-center space-x-2">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          <span>Loading phase templates...</span>
        </div>
      ) : selectedPhaseTemplates.length === 0 ? (
        <p className="text-gray-500">No phase templates selected</p>
      ) : (
        <ul className="list-disc pl-5">
          {selectedPhaseTemplates.map(id => {
            const template = allPhaseTemplates.find(t => t.id === id);
            return (
              <li key={id}>{template ? template.name : `Template ${id}`}</li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default TemplateWizardReviewSection;
