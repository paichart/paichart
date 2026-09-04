'use client';

import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { XIcon, FilterIcon } from 'lucide-react';
import { UserRole, UserStatus } from '@/lib/types/auth';
import { UserFilters, UserFilterProps } from './types';

const initialFilters: UserFilters = {
  role: 'all',
  status: 'all',
  jobTitle: 'all',
  search: '',
};

export function UserFilter({ onFilterChange, roles, jobTitles }: UserFilterProps) {
  const [filters, setFilters] = React.useState<UserFilters>(initialFilters);

  const handleRoleChange = (value: string) => {
    const newFilters = {
      ...filters,
      role: value as UserRole | 'all',
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleStatusChange = (value: string) => {
    const newFilters = {
      ...filters,
      status: value as UserStatus | 'all',
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleJobTitleChange = (value: string) => {
    const newFilters = {
      ...filters,
      jobTitle: value,
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = {
      ...filters,
      search: event.target.value,
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleClear = () => {
    setFilters(initialFilters);
    onFilterChange(initialFilters);
  };

  return (
    <Card className="p-4 mb-4">
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="w-full sm:w-auto min-w-[120px]">
          <Select value={filters.role} onValueChange={handleRoleChange}>
            <SelectTrigger>
              <SelectValue placeholder="System Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {roles.map((role) => (
                <SelectItem key={role} value={role}>
                  {role.charAt(0) + role.slice(1).toLowerCase().replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-auto min-w-[120px]">
          <Select value={filters.jobTitle} onValueChange={handleJobTitleChange}>
            <SelectTrigger>
              <SelectValue placeholder="Job Title" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {jobTitles.map((title) => (
                <SelectItem key={title.id} value={title.id}>
                  {title.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-auto min-w-[120px]">
          <Select value={filters.status} onValueChange={handleStatusChange}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full">
          <Input
            placeholder="Search"
            value={filters.search}
            onChange={handleSearchChange}
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleClear}
            className="gap-2"
          >
            <XIcon className="h-4 w-4" />
            Clear
          </Button>
          <Button
            onClick={() => onFilterChange(filters)}
            className="gap-2"
          >
            <FilterIcon className="h-4 w-4" />
            Filter
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default UserFilter;
