"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { GeographicalFilter } from './GeographicalFilter';
import { POVSorting } from './POVSorting';
import { SalesTheatre } from '@prisma/client';

interface POVFilterSortPanelProps {
  onFilterChange: (filters: {
    salesTheatre?: SalesTheatre;
    regionId?: string;
    countryId?: string;
  }) => void;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  specialSort: string | null;
  onSortChange: (sortField: string, sortDirection: 'asc' | 'desc') => void;
  onSpecialSortChange: (sortType: string) => void;
  availableTheatres: SalesTheatre[];
  availableCountries: any[];
  availableRegions: any[];
}

export function POVFilterSortPanel({
  onFilterChange,
  sortField,
  sortDirection,
  specialSort,
  onSortChange,
  onSpecialSortChange,
  availableTheatres,
  availableCountries,
  availableRegions
}: POVFilterSortPanelProps) {
  const [activeTab, setActiveTab] = React.useState('filter');
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium">Filter & Sort</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="filter">Filter</TabsTrigger>
            <TabsTrigger value="sort">Sort</TabsTrigger>
          </TabsList>
          
          <TabsContent value="filter" className="pt-4">
            <GeographicalFilter 
              onFilterChange={onFilterChange}
              availableTheatres={availableTheatres}
              availableCountries={availableCountries}
              availableRegions={availableRegions}
            />
          </TabsContent>
          
          <TabsContent value="sort" className="pt-4">
            <POVSorting
              sortField={sortField}
              sortDirection={sortDirection}
              specialSort={specialSort}
              onSortChange={onSortChange}
              onSpecialSortChange={onSpecialSortChange}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
