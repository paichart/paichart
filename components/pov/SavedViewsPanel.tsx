"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Save, X, Check, Edit, Trash } from 'lucide-react';
import { SalesTheatre } from '@prisma/client';
import { Badge } from '@/components/ui/Badge';

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

interface SavedViewsPanelProps {
  savedViews: SavedView[];
  onSaveView: (name: string) => void;
  onApplyView: (view: SavedView) => void;
  onDeleteView: (id: string) => void;
  currentFilters: {
    salesTheatre?: SalesTheatre;
    countryId?: string;
    regionId?: string;
  };
  sortField: string;
  sortDirection: 'asc' | 'desc';
  specialSort: string | null;
  availableCountries: any[];
  availableRegions: any[];
}

export function SavedViewsPanel({
  savedViews,
  onSaveView,
  onApplyView,
  onDeleteView,
  currentFilters,
  sortField,
  sortDirection,
  specialSort,
  availableCountries,
  availableRegions
}: SavedViewsPanelProps) {
  const [viewName, setViewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Get country and region names for display
  const getCountryName = (id?: string) => {
    if (!id) return null;
    const country = availableCountries.find(c => c.id === id);
    return country ? country.name : null;
  };

  const getRegionName = (id?: string) => {
    if (!id) return null;
    const region = availableRegions.find(r => r.id === id);
    return region ? region.name : null;
  };

  // Format theatre name for display
  const formatTheatreName = (theatre?: SalesTheatre) => {
    if (!theatre) return null;
    
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

  // Format sort field for display
  const formatSortField = (field: string) => {
    switch (field) {
      case 'title':
        return 'Name';
      case 'startDate':
        return 'Start Date';
      case 'endDate':
        return 'End Date';
      case 'updatedAt':
        return 'Last Updated';
      case 'createdAt':
        return 'Created Date';
      default:
        return field.charAt(0).toUpperCase() + field.slice(1);
    }
  };

  // Format special sort for display
  const formatSpecialSort = (sort: string | null) => {
    if (!sort) return null;
    
    switch (sort) {
      case 'thisQuarter':
        return 'This Quarter';
      case 'nextQuarter':
        return 'Next Quarter';
      case 'daysInProgress':
        return 'Days in Progress';
      case 'highestRevenue':
        return 'Highest Revenue';
      case 'lowestRevenue':
        return 'Lowest Revenue';
      default:
        return sort.replace(/([A-Z])/g, ' $1').trim();
    }
  };

  const handleSave = () => {
    if (viewName.trim()) {
      onSaveView(viewName);
      setViewName('');
    }
  };

  const handleStartEdit = (view: SavedView) => {
    setEditingId(view.id);
    setEditName(view.name);
  };

  const handleSaveEdit = (id: string) => {
    // In a real implementation, you would update the view name
    // For now, we'll just cancel the edit
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved Views</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Save current view */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Input
              type="text"
              placeholder="Save current view as..."
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleSave}
              disabled={!viewName.trim()}
            >
              <Save className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Current filters summary */}
          <div className="text-xs text-muted-foreground">
            <div>
              <span className="font-medium">Filters: </span>
              {currentFilters.salesTheatre && (
                <span>Theatre: {formatTheatreName(currentFilters.salesTheatre)}</span>
              )}
              {currentFilters.countryId && (
                <span>, Country: {getCountryName(currentFilters.countryId)}</span>
              )}
              {currentFilters.regionId && (
                <span>, Region: {getRegionName(currentFilters.regionId)}</span>
              )}
              {!currentFilters.salesTheatre && !currentFilters.countryId && !currentFilters.regionId && (
                <span>None</span>
              )}
            </div>
            <div>
              <span className="font-medium">Sort: </span>
              {specialSort ? (
                <span>{formatSpecialSort(specialSort)}</span>
              ) : (
                <span>{formatSortField(sortField)} ({sortDirection === 'asc' ? 'Ascending' : 'Descending'})</span>
              )}
            </div>
          </div>
        </div>
        
        {/* Saved views list */}
        {savedViews.length > 0 ? (
          <div className="space-y-2">
            {savedViews.map(view => (
              <div key={view.id} className="border rounded-md p-2">
                {editingId === view.id ? (
                  <div className="flex items-center gap-2 mb-2">
                    <Input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleSaveEdit(view.id)}
                      disabled={!editName.trim()}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCancelEdit}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{view.name}</h3>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStartEdit(view)}
                        className="h-7 w-7"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteView(view.id)}
                        className="h-7 w-7 text-destructive"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
                
                <div className="flex flex-wrap gap-1 mb-2">
                  {view.filters.salesTheatre && (
                    <Badge variant="outline" className="text-xs">
                      Theatre: {formatTheatreName(view.filters.salesTheatre)}
                    </Badge>
                  )}
                  {view.filters.countryId && (
                    <Badge variant="outline" className="text-xs">
                      Country: {getCountryName(view.filters.countryId)}
                    </Badge>
                  )}
                  {view.filters.regionId && (
                    <Badge variant="outline" className="text-xs">
                      Region: {getRegionName(view.filters.regionId)}
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs">
                    {view.specialSort ? formatSpecialSort(view.specialSort) : `${formatSortField(view.sortField)} (${view.sortDirection === 'asc' ? 'Asc' : 'Desc'})`}
                  </Badge>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onApplyView(view)}
                    className="h-7 text-xs"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-4">
            <p>No saved views yet</p>
            <p className="text-xs mt-1">Save your current filters and sorting to create a view</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
