import { useState, useEffect, useMemo } from 'react';
import { POV, SalesTheatre, Region, Country, User, Team, POVStatus, Priority } from '@prisma/client';

// Extended POV details type that includes related entities
export interface ExtendedPoVDetails extends POV {
  region?: Region;
  country?: Country;
  owner?: User;
  team?: Team & {
    members?: {
      user: User;
    }[];
  };
  daysInProgress?: number; // Used for special sorting
  
  // Add index signature to allow string indexing
  [key: string]: any;
}

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

export function usePOVList() {
  // Data state
  const [povs, setPovs] = useState<ExtendedPoVDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Filter state
  const [filters, setFilters] = useState({
    salesTheatre: undefined as SalesTheatre | undefined,
    countryId: undefined as string | undefined,
    regionId: undefined as string | undefined
  });
  
  // Sort state
  const [sortField, setSortField] = useState('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [specialSort, setSpecialSort] = useState<string | null>(null);
  
  // Saved views state
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  
  // Fetch POVs function
  const fetchPOVs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/pov');
      if (!response.ok) {
        throw new Error('Failed to fetch POVs');
      }
      const result = await response.json();
      setPovs(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  };

  // Refresh function for external use
  const refreshPovs = () => {
    fetchPOVs();
  };

  // Fetch POVs on component mount
  useEffect(() => {
    fetchPOVs();
  }, []);
  
  // Load saved views from localStorage on component mount
  useEffect(() => {
    const savedViewsJson = localStorage.getItem('povSavedViews');
    if (savedViewsJson) {
      try {
        const views = JSON.parse(savedViewsJson);
        setSavedViews(views);
      } catch (e) {
        console.error('Failed to parse saved views:', e);
      }
    }
  }, []);

  // Extract available geographical data from POVs
  const availableTheatres = useMemo(() => {
    const theatres = povs
      .filter(pov => pov.salesTheatre)
      .map(pov => pov.salesTheatre as SalesTheatre);
    return [...new Set(theatres)];
  }, [povs]);

  const availableCountries = useMemo(() => {
    const countries = povs
      .filter(pov => pov.country)
      .map(pov => ({
        id: pov.country!.id,
        name: pov.country!.name,
        code: pov.country!.code,
        theatre: pov.salesTheatre
      }));
    return [...new Map(countries.map(c => [c.id, c])).values()];
  }, [povs]);

  const availableRegions = useMemo(() => {
    const regions = povs
      .filter(pov => pov.region)
      .map(pov => ({
        id: pov.region!.id,
        name: pov.region!.name,
        type: pov.region!.type,
        countryId: pov.countryId
      }));
    return [...new Map(regions.map(r => [r.id, r])).values()];
  }, [povs]);

  // Filter POVs based on selected filters
  const filteredPovs = useMemo(() => {
    return povs.filter(pov => {
      // Filter by theatre
      if (filters.salesTheatre && pov.salesTheatre !== filters.salesTheatre) {
        return false;
      }
      
      // Filter by country
      if (filters.countryId && pov.countryId !== filters.countryId) {
        return false;
      }
      
      // Filter by region
      if (filters.regionId && pov.regionId !== filters.regionId) {
        return false;
      }
      
      return true;
    });
  }, [povs, filters]);
  
  // Sort POVs based on sort field and direction
  const sortedPovs = useMemo(() => {
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
              ? a.daysInProgress! - b.daysInProgress!
              : b.daysInProgress! - a.daysInProgress!;
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
  
  // Export POVs to CSV
  const exportToCSV = () => {
    // Define the CSV headers
    const headers = [
      'Title',
      'Status',
      'Priority',
      'Start Date',
      'End Date',
      'Revenue',
      'Customer',
      'Theatre',
      'Country',
      'Region'
    ];
    
    // Convert POVs to CSV rows
    const rows = sortedPovs.map(pov => [
      pov.title,
      pov.status,
      pov.priority,
      new Date(pov.startDate).toLocaleDateString(),
      new Date(pov.endDate).toLocaleDateString(),
      pov.revenue ? `$${pov.revenue}` : '',
      pov.customerName || '',
      pov.salesTheatre || '',
      pov.country?.name || '',
      pov.region?.name || ''
    ]);
    
    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Create a Blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `povs_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return {
    povs: sortedPovs,
    loading,
    error,
    filters,
    sortField,
    sortDirection,
    specialSort,
    availableTheatres,
    availableCountries,
    availableRegions,
    savedViews,
    handleFilterChange,
    handleSortChange,
    handleSpecialSortChange,
    handleSaveView,
    handleApplyView,
    handleDeleteView,
    exportToCSV,
    refreshPovs
  };
}
