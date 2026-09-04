"use client";

import React from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Search, Filter, SortAsc, SortDesc } from 'lucide-react';

interface FilterOption {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface TemplateFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (field: string, direction: 'asc' | 'desc') => void;
  filterOptions: FilterOption[];
  activeFilters: Record<string, any>;
  onFilterChange: (filters: Record<string, any>) => void;
  templateType: 'phase' | 'pov';
}

export function TemplateFilters({
  searchQuery,
  onSearchChange,
  sortField,
  sortDirection,
  onSortChange,
  filterOptions,
  activeFilters,
  onFilterChange,
  templateType
}: TemplateFiltersProps) {
  
  // Define sort options based on template type
  const sortOptions = templateType === 'phase' 
    ? [
        { value: 'name', label: 'Name' },
        { value: 'type', label: 'Type' },
        { value: 'stages', label: 'Stages' },
        { value: 'tasks', label: 'Tasks' },
        { value: 'agents', label: 'Agents' },
        { value: 'updatedAt', label: 'Last Modified' }
      ]
    : [
        { value: 'name', label: 'Name' },
        { value: 'status', label: 'Status' },
        { value: 'sections', label: 'Sections' },
        { value: 'fields', label: 'Fields' },
        { value: 'updatedAt', label: 'Last Modified' }
      ];

  const handleSortFieldChange = (field: string) => {
    if (field === sortField) {
      // Toggle direction if same field
      onSortChange(field, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to ascending
      onSortChange(field, 'asc');
    }
  };

  const handleFilterChange = (filterKey: string, value: string) => {
    const newFilters = { ...activeFilters };
    if (value === 'all' || value === '') {
      delete newFilters[filterKey];
    } else {
      newFilters[filterKey] = value;
    }
    onFilterChange(newFilters);
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 mb-6">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
        <Input
          placeholder="Search templates..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      
      {/* Filters */}
      <div className="flex gap-2">
        {filterOptions.map((filterOption) => (
          <div key={filterOption.key} className="relative">
            <select
              className="h-10 px-3 py-2 rounded-md border border-input bg-background pr-8"
              value={activeFilters[filterOption.key] || 'all'}
              onChange={(e) => handleFilterChange(filterOption.key, e.target.value)}
            >
              <option value="all">All {filterOption.label}</option>
              {filterOption.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Filter className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
          </div>
        ))}
        
        {/* Sort */}
        <div className="relative">
          <select
            className="h-10 px-3 py-2 rounded-md border border-input bg-background pr-8"
            value={sortField}
            onChange={(e) => handleSortFieldChange(e.target.value)}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                Sort by {option.label}
              </option>
            ))}
          </select>
        </div>
        
        {/* Sort Direction */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => onSortChange(sortField, sortDirection === 'asc' ? 'desc' : 'asc')}
          className="h-10 w-10"
        >
          {sortDirection === 'asc' ? (
            <SortAsc size={16} />
          ) : (
            <SortDesc size={16} />
          )}
        </Button>
      </div>
    </div>
  );
}

export default TemplateFilters;
