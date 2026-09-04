"use client";

import React, { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/Popover';
import { Search, Filter, X } from 'lucide-react';
import { SalesTheatre } from '@prisma/client';

interface POVSearchAndFiltersProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filters: {
    status?: string;
    forecastDate?: string;
    salesTheatre?: SalesTheatre;
    ownerName?: string;
    customerName?: string;
  };
  onFiltersChange: (filters: any) => void;
  onClearFilters: () => void;
}

export function POVSearchAndFilters({
  searchTerm,
  onSearchChange,
  filters,
  onFiltersChange,
  onClearFilters
}: POVSearchAndFiltersProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const statusOptions = [
    { value: 'PROJECTED', label: 'Projected' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'STALLED', label: 'Stalled' },
    { value: 'VALIDATION', label: 'Validation' },
    { value: 'WON', label: 'Won' },
    { value: 'LOST', label: 'Lost' }
  ];

  const forecastDateOptions = [
    { value: 'THIS_QUARTER', label: 'This Quarter' },
    { value: 'NEXT_QUARTER', label: 'Next Quarter' },
    { value: 'LAST_QUARTER', label: 'Last Quarter' }
  ];

  const theatreOptions = [
    { value: 'NORTH_AMERICA', label: 'North America' },
    { value: 'LAC', label: 'LAC' },
    { value: 'EMEA', label: 'EMEA' },
    { value: 'APJ', label: 'APJ' }
  ];

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const handleFilterChange = (key: string, value: string | undefined) => {
    // Convert "ALL_*" values to undefined to clear the filter
    let filterValue = value;
    if (value === 'ALL_STATUSES' || value === 'ALL_PRIORITIES' || value === 'ALL_THEATRES') {
      filterValue = undefined;
    }
    
    onFiltersChange({
      ...filters,
      [key]: filterValue || undefined
    });
  };

  return (
    <div className="flex items-center gap-2">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search POVs..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 w-64"
        />
      </div>

      {/* Filter Popover */}
      <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="relative">
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filters</h4>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onClearFilters();
                    setIsFilterOpen(false);
                  }}
                  className="h-auto p-1 text-xs"
                >
                  Clear all
                </Button>
              )}
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={filters.status || ''}
                onValueChange={(value) => handleFilterChange('status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_STATUSES">All statuses</SelectItem>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Forecast Date Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Forecast Date</label>
              <Select
                value={filters.forecastDate || ''}
                onValueChange={(value) => handleFilterChange('forecastDate', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All quarters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_QUARTERS">All quarters</SelectItem>
                  {forecastDateOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sales Theatre Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Sales Theatre</label>
              <Select
                value={filters.salesTheatre || ''}
                onValueChange={(value) => handleFilterChange('salesTheatre', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All theatres" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_THEATRES">All theatres</SelectItem>
                  {theatreOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* POV Owner Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">POV Owner</label>
              <Input
                placeholder="Owner name..."
                value={filters.ownerName || ''}
                onChange={(e) => handleFilterChange('ownerName', e.target.value)}
              />
            </div>

            {/* Customer Name Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Customer</label>
              <Input
                placeholder="Customer name..."
                value={filters.customerName || ''}
                onChange={(e) => handleFilterChange('customerName', e.target.value)}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active Filter Tags */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1 ml-2">
          {filters.status && (
            <Badge variant="secondary" className="text-xs">
              Status: {statusOptions.find(s => s.value === filters.status)?.label}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-1 hover:bg-transparent"
                onClick={() => handleFilterChange('status', undefined)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          {filters.forecastDate && (
            <Badge variant="secondary" className="text-xs">
              Forecast: {forecastDateOptions.find(f => f.value === filters.forecastDate)?.label}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-1 hover:bg-transparent"
                onClick={() => handleFilterChange('forecastDate', undefined)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          {filters.salesTheatre && (
            <Badge variant="secondary" className="text-xs">
              Theatre: {theatreOptions.find(t => t.value === filters.salesTheatre)?.label}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-1 hover:bg-transparent"
                onClick={() => handleFilterChange('salesTheatre', undefined)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          {filters.ownerName && (
            <Badge variant="secondary" className="text-xs">
              Owner: {filters.ownerName}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-1 hover:bg-transparent"
                onClick={() => handleFilterChange('ownerName', undefined)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          {filters.customerName && (
            <Badge variant="secondary" className="text-xs">
              Customer: {filters.customerName}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-1 hover:bg-transparent"
                onClick={() => handleFilterChange('customerName', undefined)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

export default POVSearchAndFilters;
