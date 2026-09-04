"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { SalesTheatre } from '@prisma/client';

interface POVFilters {
  status?: string;
  forecastDate?: string;
  salesTheatre?: SalesTheatre;
  ownerName?: string;
  customerName?: string;
}

interface POVFiltersContextType {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filters: POVFilters;
  setFilters: (filters: POVFilters) => void;
  clearFilters: () => void;
}

const POVFiltersContext = createContext<POVFiltersContextType | null>(null);

export function POVFiltersProvider({ children }: { children: ReactNode }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<POVFilters>({
    status: undefined,
    forecastDate: undefined,
    salesTheatre: undefined,
    ownerName: undefined,
    customerName: undefined,
  });

  const clearFilters = () => {
    setFilters({
      status: undefined,
      forecastDate: undefined,
      salesTheatre: undefined,
      ownerName: undefined,
      customerName: undefined,
    });
  };

  return (
    <POVFiltersContext.Provider
      value={{
        searchTerm,
        setSearchTerm,
        filters,
        setFilters,
        clearFilters,
      }}
    >
      {children}
    </POVFiltersContext.Provider>
  );
}

export function usePOVFilters() {
  const context = useContext(POVFiltersContext);
  if (!context) {
    // Return default values if not in provider (for non-POV pages)
    return {
      searchTerm: '',
      setSearchTerm: () => {},
      filters: {},
      setFilters: () => {},
      clearFilters: () => {},
    };
  }
  return context;
}
