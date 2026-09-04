"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { SalesTheatre } from '@prisma/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Globe, MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CustomDropdown, DropdownOption } from '@/components/ui/CustomDropdown';

interface Country {
  id: string;
  name: string;
  code: string;
  theatre: SalesTheatre;
}

interface Region {
  id: string;
  name: string;
  type: string;
  countryId: string;
}

interface GeographicalFilterProps {
  onFilterChange: (filters: {
    salesTheatre?: SalesTheatre;
    regionId?: string;
    countryId?: string;
  }) => void;
  availableTheatres: SalesTheatre[];
  availableCountries: Country[];
  availableRegions: Region[];
  className?: string;
}

export function GeographicalFilter({
  onFilterChange,
  availableTheatres,
  availableCountries,
  availableRegions,
  className
}: GeographicalFilterProps) {
  const [selectedTheatre, setSelectedTheatre] = useState<SalesTheatre | undefined>(undefined);
  const [selectedCountry, setSelectedCountry] = useState<Country | undefined>(undefined);
  const [selectedRegion, setSelectedRegion] = useState<Region | undefined>(undefined);
  
  // Update filters when selections change
  useEffect(() => {
    onFilterChange({
      salesTheatre: selectedTheatre,
      countryId: selectedCountry?.id,
      regionId: selectedRegion?.id,
    });
    // We intentionally exclude onFilterChange from the dependency array
    // to prevent infinite update loops if the parent component re-renders frequently
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTheatre, selectedCountry, selectedRegion]);

  // Reset dependent filters when parent filter changes
  useEffect(() => {
    if (!selectedTheatre) {
      setSelectedCountry(undefined);
      setSelectedRegion(undefined);
    }
  }, [selectedTheatre]);

  useEffect(() => {
    setSelectedRegion(undefined);
  }, [selectedCountry]);
  
  // Format theatre name for display
  const formatTheatreName = (theatre: SalesTheatre) => {
    switch (theatre) {
      case 'NORTH_AMERICA':
        return 'North America';
      case 'LAC':
        return 'Latin America & Caribbean';
      case 'EMEA':
        return 'Europe, Middle East & Africa';
      case 'APJ':
        return 'Asia Pacific & Japan';
      default:
        return String(theatre).replace('_', ' ');
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedTheatre(undefined);
    setSelectedCountry(undefined);
    setSelectedRegion(undefined);
    onFilterChange({});
  };

  // Get active filters count
  const activeFiltersCount = [
    selectedTheatre,
    selectedCountry,
    selectedRegion,
  ].filter(Boolean).length;
  
  // Filter countries by selected theatre
  const filteredCountries = useMemo(() => {
    if (!selectedTheatre) return availableCountries;
    return availableCountries.filter(country => country.theatre === selectedTheatre);
  }, [availableCountries, selectedTheatre]);
  
  // Filter regions by selected country
  const filteredRegions = useMemo(() => {
    if (!selectedCountry) return availableRegions;
    return availableRegions.filter(region => region.countryId === selectedCountry.id);
  }, [availableRegions, selectedCountry]);

  // Convert theatres to dropdown options
  const theatreOptions = useMemo(() => {
    return availableTheatres.map(theatre => ({
      id: theatre,
      name: formatTheatreName(theatre)
    }));
  }, [availableTheatres]);

  // Convert countries to dropdown options
  const countryOptions = useMemo(() => {
    return filteredCountries.map(country => ({
      id: country.id,
      name: country.name,
      data: country
    }));
  }, [filteredCountries]);

  // Convert regions to dropdown options
  const regionOptions = useMemo(() => {
    return filteredRegions.map(region => ({
      id: region.id,
      name: region.name,
      data: region
    }));
  }, [filteredRegions]);

  return (
    <Card className={cn("shadow-sm", className)}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-medium">Geographical Filters</CardTitle>
          {activeFiltersCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearFilters}
              className="h-8 gap-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              <span>Clear all</span>
            </Button>
          )}
        </div>
        <CardDescription>
          Filter POVs by geographical location
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Theatre Selector */}
        <div className="space-y-1.5">
          <div className="text-sm font-medium">Sales Theatre</div>
          <CustomDropdown
            options={theatreOptions}
            value={selectedTheatre || null}
            onChange={(value) => {
              setSelectedTheatre(value as SalesTheatre);
            }}
            placeholder="Select theatre"
            getOptionLabel={(option) => option.name}
          />
        </div>

        {/* Countries by Theatre */}
        <div className="space-y-1.5">
          <div className="text-sm font-medium">Country</div>
          <CustomDropdown
            options={countryOptions}
            value={selectedCountry?.id || null}
            onChange={(value) => {
              const country = filteredCountries.find(c => c.id === value);
              setSelectedCountry(country);
            }}
            placeholder="Select country"
            disabled={filteredCountries.length === 0}
          />
        </div>

        {/* Regions by Country */}
        <div className="space-y-1.5">
          <div className="text-sm font-medium">Region</div>
          <CustomDropdown
            options={regionOptions}
            value={selectedRegion?.id || null}
            onChange={(value) => {
              const region = filteredRegions.find(r => r.id === value);
              setSelectedRegion(region);
            }}
            placeholder="Select region"
            disabled={filteredRegions.length === 0}
          />
        </div>

        {/* Active Filters */}
        {activeFiltersCount > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="text-sm font-medium mb-2">Active Filters</div>
            <div className="flex flex-wrap gap-2">
              {selectedTheatre && (
                <Badge variant="secondary" className="gap-1 pl-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  <span>{formatTheatreName(selectedTheatre)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 ml-1 hover:bg-transparent"
                    onClick={() => setSelectedTheatre(undefined)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              )}
              {selectedCountry && (
                <Badge variant="secondary" className="gap-1 pl-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{selectedCountry.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 ml-1 hover:bg-transparent"
                    onClick={() => setSelectedCountry(undefined)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              )}
              {selectedRegion && (
                <Badge variant="secondary" className="gap-1 pl-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{selectedRegion.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 ml-1 hover:bg-transparent"
                    onClick={() => setSelectedRegion(undefined)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
