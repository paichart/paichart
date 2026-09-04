"use client";

import React, { useState, useMemo } from 'react';
import { POVTimelineView } from './views/POVTimelineView';
import { SalesTheatre } from '@prisma/client';
import { ExtendedPoVDetails } from '@/lib/pov/hooks/usePOVList';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePOVFilters } from '@/lib/contexts/POVFiltersContext';

interface SavedView {
  id: string;
  name: string;
  filters: {
    salesTheatre?: SalesTheatre;
    countryId?: string;
    regionId?: string;
  };
  sortField: string;
  sortDirection: 'asc' | 'desc';
  specialSort: string | null;
}

interface POVListViewProps {
  povs: ExtendedPoVDetails[];
  loading: boolean;
  availableTheatres: SalesTheatre[];
  availableCountries: any[];
  availableRegions: any[];
  onExport: () => void;
  onPovDeleted?: () => void;
}

export function POVListView({
  povs,
  loading,
  availableTheatres,
  availableCountries,
  availableRegions,
  onExport,
  onPovDeleted
}: POVListViewProps) {
  
  // Filter state
  const [filters, setFilters] = useState({
    salesTheatre: undefined as SalesTheatre | undefined,
    countryId: undefined as string | undefined,
    regionId: undefined as string | undefined
  });
  
  // Sort state
  const [sortField, setSortField] = useState('revenue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [specialSort, setSpecialSort] = useState<string | null>(null);

  // Search and filter state from context (shared with navbar)
  const { searchTerm, filters: searchFilters } = usePOVFilters();
  
  // Saved views state
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  
  // Load saved views from localStorage on component mount
  React.useEffect(() => {
    const savedViewsJson = localStorage.getItem('povSavedViews');
    if (savedViewsJson) {
      try {
        const views = JSON.parse(savedViewsJson);
        setSavedViews(views);
      } catch {
        // Could not parse saved views - use default empty array
      }
    }
  }, []);

  // Filter POVs based on selected filters and search
  const filteredPovs = React.useMemo(() => {
    return povs.filter(pov => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          pov.title.toLowerCase().includes(searchLower) ||
          pov.description.toLowerCase().includes(searchLower) ||
          (pov.customerName && pov.customerName.toLowerCase().includes(searchLower)) ||
          (pov.opportunityName && pov.opportunityName.toLowerCase().includes(searchLower));
        
        if (!matchesSearch) return false;
      }

      // Search filters
      if (searchFilters.status && pov.status !== searchFilters.status) {
        return false;
      }
      
      // Forecast date filter
      if (searchFilters.forecastDate) {
        const forecastDate = pov.forecastDate ? new Date(pov.forecastDate) : null;
        if (!forecastDate) return false;
        
        const now = new Date();
        const currentQuarter = Math.floor(now.getMonth() / 3);
        
        switch (searchFilters.forecastDate) {
          case 'THIS_QUARTER':
            const thisQuarterStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
            const thisQuarterEnd = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
            if (forecastDate < thisQuarterStart || forecastDate > thisQuarterEnd) return false;
            break;
            
          case 'NEXT_QUARTER':
            const nextQuarterStart = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 1);
            const nextQuarterEnd = new Date(now.getFullYear(), (currentQuarter + 2) * 3, 0);
            if (forecastDate < nextQuarterStart || forecastDate > nextQuarterEnd) return false;
            break;
            
          case 'LAST_QUARTER':
            const lastQuarterStart = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1);
            const lastQuarterEnd = new Date(now.getFullYear(), currentQuarter * 3, 0);
            if (forecastDate < lastQuarterStart || forecastDate > lastQuarterEnd) return false;
            break;
        }
      }
      
      if (searchFilters.salesTheatre && pov.salesTheatre !== searchFilters.salesTheatre) {
        return false;
      }
      
      if (searchFilters.ownerName) {
        const ownerLower = searchFilters.ownerName.toLowerCase();
        if (!pov.owner || !pov.owner.name || !pov.owner.name.toLowerCase().includes(ownerLower)) {
          return false;
        }
      }
      
      if (searchFilters.customerName) {
        const customerLower = searchFilters.customerName.toLowerCase();
        if (!pov.customerName || !pov.customerName.toLowerCase().includes(customerLower)) {
          return false;
        }
      }

      // Legacy filters (from sidebar)
      if (filters.salesTheatre && pov.salesTheatre !== filters.salesTheatre) {
        return false;
      }
      
      if (filters.countryId && pov.countryId !== filters.countryId) {
        return false;
      }
      
      if (filters.regionId && pov.regionId !== filters.regionId) {
        return false;
      }
      
      return true;
    });
  }, [povs, filters, searchTerm, searchFilters]);
  
  // Sort POVs based on sort field and direction
  const sortedPovs = React.useMemo(() => {
    const sorted = [...filteredPovs];
    
    // Handle special sorts
    if (specialSort) {
      switch (specialSort) {
        case 'thisQuarter':
          // Get current quarter start and end dates
          const now = new Date();
          const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          const quarterEnd = new Date(quarterStart);
          quarterEnd.setMonth(quarterEnd.getMonth() + 3);
          quarterEnd.setDate(0); // Last day of the month
          
          // Filter POVs with endDate in this quarter
          return sorted.filter(pov => {
            const endDate = new Date(pov.endDate);
            return endDate >= quarterStart && endDate <= quarterEnd;
          }).sort((a, b) => {
            return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
          });
          
        case 'nextQuarter':
          // Get next quarter start and end dates
          const currentDate = new Date();
          const currentQuarter = Math.floor(currentDate.getMonth() / 3);
          const nextQuarterStart = new Date(currentDate.getFullYear(), (currentQuarter + 1) * 3, 1);
          const nextQuarterEnd = new Date(nextQuarterStart);
          nextQuarterEnd.setMonth(nextQuarterEnd.getMonth() + 3);
          nextQuarterEnd.setDate(0); // Last day of the month
          
          // Filter POVs with endDate in next quarter
          return sorted.filter(pov => {
            const endDate = new Date(pov.endDate);
            return endDate >= nextQuarterStart && endDate <= nextQuarterEnd;
          }).sort((a, b) => {
            return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
          });
          
        case 'daysInProgress':
          // Calculate days in progress for each POV
          const today = new Date();
          return sorted.map(pov => {
            const startDate = new Date(pov.startDate);
            const daysInProgress = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            return { ...pov, daysInProgress };
          }).sort((a, b) => {
            return sortDirection === 'asc'
              ? (a as any).daysInProgress - (b as any).daysInProgress
              : (b as any).daysInProgress - (a as any).daysInProgress;
          });
          
        case 'highestRevenue':
          return sorted.sort((a, b) => {
            const aRevenue = a.revenue ? parseFloat(a.revenue.toString()) : 0;
            const bRevenue = b.revenue ? parseFloat(b.revenue.toString()) : 0;
            return bRevenue - aRevenue; // Always descending for highest revenue
          });
          
        case 'lowestRevenue':
          return sorted.sort((a, b) => {
            const aRevenue = a.revenue ? parseFloat(a.revenue.toString()) : 0;
            const bRevenue = b.revenue ? parseFloat(b.revenue.toString()) : 0;
            return aRevenue - bRevenue; // Always ascending for lowest revenue
          });
          
        default:
          break;
      }
    }
    
    // Standard sorting
    return sorted.sort((a, b) => {
      // Handle different field types
      if (sortField === 'revenue') {
        const aRevenue = a.revenue ? parseFloat(a.revenue.toString()) : 0;
        const bRevenue = b.revenue ? parseFloat(b.revenue.toString()) : 0;
        return sortDirection === 'asc' ? aRevenue - bRevenue : bRevenue - aRevenue;
      }
      
      if (sortField === 'startDate' || sortField === 'endDate' || sortField === 'createdAt' || sortField === 'updatedAt') {
        const aDate = a[sortField] ? new Date(a[sortField]).getTime() : 0;
        const bDate = b[sortField] ? new Date(b[sortField]).getTime() : 0;
        return sortDirection === 'asc' ? aDate - bDate : bDate - aDate;
      }
      
      // Default string comparison
      const aValue = a[sortField] || '';
      const bValue = b[sortField] || '';
      return sortDirection === 'asc'
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    });
  }, [filteredPovs, sortField, sortDirection, specialSort]);

  // Handle filter changes
  const handleFilterChange = (newFilters: {
    salesTheatre?: SalesTheatre;
    countryId?: string;
    regionId?: string;
  }) => {
    setFilters(prev => {
      const updated = { ...prev };
      
      // Only update properties that are present in newFilters
      if ('salesTheatre' in newFilters) updated.salesTheatre = newFilters.salesTheatre;
      if ('countryId' in newFilters) updated.countryId = newFilters.countryId;
      if ('regionId' in newFilters) updated.regionId = newFilters.regionId;
      
      return updated;
    });
  };
  
  // Handle sort changes
  const handleSortChange = (field: string, direction: 'asc' | 'desc') => {
    setSortField(field);
    setSortDirection(direction);
    setSpecialSort(null);
  };
  
  // Handle special sort changes
  const handleSpecialSortChange = (type: string) => {
    setSpecialSort(type);
  };
  
  // Save a new view
  const handleSaveView = (name: string) => {
    const newView: SavedView = {
      id: Date.now().toString(),
      name,
      filters,
      sortField,
      sortDirection,
      specialSort,
    };
    
    const updatedViews = [...savedViews, newView];
    setSavedViews(updatedViews);
    localStorage.setItem('povSavedViews', JSON.stringify(updatedViews));
  };
  
  // Apply a saved view
  const handleApplyView = (view: SavedView) => {
    // Create a new filters object with the current values
    const newFilters = { ...filters };
    
    // Update with values from the saved view
    if ('salesTheatre' in view.filters) newFilters.salesTheatre = view.filters.salesTheatre;
    if ('countryId' in view.filters) newFilters.countryId = view.filters.countryId;
    if ('regionId' in view.filters) newFilters.regionId = view.filters.regionId;
    
    setFilters(newFilters);
    setSortField(view.sortField);
    setSortDirection(view.sortDirection);
    setSpecialSort(view.specialSort);
  };
  
  // Delete a saved view
  const handleDeleteView = (id: string) => {
    const updatedViews = savedViews.filter(view => view.id !== id);
    setSavedViews(updatedViews);
    localStorage.setItem('povSavedViews', JSON.stringify(updatedViews));
  };
  
  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[500px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  return (
    <POVTimelineView
      povs={sortedPovs}
      onPovDeleted={onPovDeleted}
    />
  );
}
