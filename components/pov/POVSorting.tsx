"use client";

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { ArrowDownAZ, ArrowUpAZ, Calendar, DollarSign, Clock } from 'lucide-react';

interface POVSortingProps {
  sortField: string;
  sortDirection: 'asc' | 'desc';
  specialSort: string | null;
  onSortChange: (sortField: string, sortDirection: 'asc' | 'desc') => void;
  onSpecialSortChange: (sortType: string) => void;
}

export function POVSorting({
  sortField,
  sortDirection,
  specialSort,
  onSortChange,
  onSpecialSortChange
}: POVSortingProps) {
  const handleSortFieldChange = (field: string) => {
    onSortChange(field, sortDirection);
  };
  
  const handleSortDirectionChange = () => {
    const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    onSortChange(sortField, newDirection);
  };
  
  return (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Select value={sortField} onValueChange={handleSortFieldChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="title">Name</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="startDate">Start Date</SelectItem>
              <SelectItem value="endDate">End Date</SelectItem>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="updatedAt">Last Updated</SelectItem>
              <SelectItem value="createdAt">Created Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <Button
          variant="outline"
          size="icon"
          onClick={handleSortDirectionChange}
          title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
        >
          {sortDirection === 'asc' ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
        </Button>
      </div>
      
      <div className="text-sm font-medium">Quick Sorts</div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={specialSort === 'thisQuarter' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSpecialSortChange('thisQuarter')}
          className="gap-1"
        >
          <Calendar className="h-4 w-4" />
          <span>This Quarter</span>
        </Button>
        
        <Button
          variant={specialSort === 'nextQuarter' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSpecialSortChange('nextQuarter')}
          className="gap-1"
        >
          <Calendar className="h-4 w-4" />
          <span>Next Quarter</span>
        </Button>
        
        <Button
          variant={specialSort === 'daysInProgress' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSpecialSortChange('daysInProgress')}
          className="gap-1"
        >
          <Clock className="h-4 w-4" />
          <span>Days in Progress</span>
        </Button>
        
        <Button
          variant={specialSort === 'highestRevenue' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSpecialSortChange('highestRevenue')}
          className="gap-1"
        >
          <DollarSign className="h-4 w-4" />
          <span>Highest Revenue</span>
        </Button>
        
        <Button
          variant={specialSort === 'lowestRevenue' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSpecialSortChange('lowestRevenue')}
          className="gap-1"
        >
          <DollarSign className="h-4 w-4" />
          <span>Lowest Revenue</span>
        </Button>
      </div>
    </div>
  );
}
