"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Check, ChevronDown, X, Search } from 'lucide-react';
import { Badge } from './Badge';

export interface DropdownOption {
  id: string;
  name: string;
  [key: string]: any; // Allow additional properties
}

interface CustomDropdownProps {
  options: DropdownOption[];
  value: string | string[] | null;
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  isMulti?: boolean;
  className?: string;
  disabled?: boolean;
  searchable?: boolean;
  maxHeight?: number;
  renderOption?: (option: DropdownOption, isSelected: boolean) => React.ReactNode;
  getOptionLabel?: (option: DropdownOption) => string;
}

export function CustomDropdown({
  options,
  value,
  onChange,
  placeholder = "Select...",
  isMulti = false,
  className = "",
  disabled = false,
  searchable = true,
  maxHeight = 300,
  renderOption,
  getOptionLabel = (option: DropdownOption) => option.name,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get selected option(s)
  const selectedOptions = useMemo(() => {
    if (!value) return isMulti ? [] : null;
    
    if (isMulti && Array.isArray(value)) {
      return options.filter(option => value.includes(option.id));
    } else if (!isMulti && typeof value === 'string') {
      return options.find(option => option.id === value) || null;
    }
    
    return isMulti ? [] : null;
  }, [options, value, isMulti]);

  // Filter options based on search term
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    return options.filter(option => 
      getOptionLabel(option).toLowerCase().includes(lowerSearchTerm)
    );
  }, [options, searchTerm, getOptionLabel]);

  // Handle selection
  const handleSelect = useCallback((option: DropdownOption) => {
    if (isMulti) {
      const currentValue = Array.isArray(value) ? value : [];
      const newValue = currentValue.includes(option.id)
        ? currentValue.filter(id => id !== option.id)
        : [...currentValue, option.id];
      
      onChange(newValue);
      
      // Don't close dropdown for multi-select
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    } else {
      onChange(option.id);
      setIsOpen(false);
      setSearchTerm('');
    }
  }, [value, onChange, isMulti]);

  // Handle removing a selected item in multi-select mode
  const handleRemoveItem = useCallback((optionId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent dropdown from opening
    
    if (isMulti && Array.isArray(value)) {
      const newValue = value.filter(id => id !== optionId);
      onChange(newValue);
    }
  }, [value, onChange, isMulti]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  }, []);

  // Render selected value(s) in the trigger button
  const renderValue = () => {
    if (isMulti) {
      const selected = Array.isArray(selectedOptions) ? selectedOptions : [];
      
      if (selected.length === 0) {
        return <span className="text-muted-foreground">{placeholder}</span>;
      }
      
      // Show count if many items are selected
      if (selected.length > 2) {
        return (
          <div className="flex items-center">
            <span>{selected.length} items selected</span>
          </div>
        );
      }
      
      // Show badges for selected items
      return (
        <div className="flex flex-wrap gap-1">
          {selected.map(option => (
            <Badge key={option.id} variant="secondary" className="flex items-center gap-1">
              {getOptionLabel(option)}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => handleRemoveItem(option.id, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleRemoveItem(option.id, e as unknown as React.MouseEvent);
                  }
                }}
                className="ml-1 rounded-full hover:bg-muted p-0.5 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </span>
            </Badge>
          ))}
        </div>
      );
    } else {
      // Single selection
      const selected = selectedOptions as DropdownOption | null;
      return selected 
        ? <span>{getOptionLabel(selected)}</span>
        : <span className="text-muted-foreground">{placeholder}</span>;
    }
  };

  return (
    <div 
      className={`relative w-full ${className}`} 
      ref={dropdownRef}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger button */}
      <button
        type="button"
        className={`
          w-full px-3 py-2 text-left flex justify-between items-center
          border rounded-md bg-background
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-accent'}
        `}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex-1 truncate">
          {renderValue()}
        </div>
        <ChevronDown 
          className={`ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>
      
      {/* Dropdown menu */}
      {isOpen && (
        <div 
          className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md overflow-hidden"
          role="listbox"
          aria-multiselectable={isMulti}
        >
          {/* Search input */}
          {searchable && (
            <div className="p-2 border-b flex items-center">
              <Search className="h-4 w-4 mr-2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                className="w-full bg-transparent border-none outline-none text-sm"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setSearchTerm('')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSearchTerm('');
                    }
                  }}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </span>
              )}
            </div>
          )}
          
          {/* Options list */}
          <div 
            className="overflow-auto"
            style={{ maxHeight: `${maxHeight}px` }}
          >
            {filteredOptions.length === 0 ? (
              <div className="p-2 text-center text-muted-foreground">
                No options found
              </div>
            ) : (
              filteredOptions.map(option => {
                const isSelected = isMulti 
                  ? Array.isArray(value) && value.includes(option.id)
                  : option.id === value;
                
                // Use custom render function if provided
                if (renderOption) {
                  return (
                    <div 
                      key={option.id}
                      onClick={() => handleSelect(option)}
                      role="option"
                      aria-selected={isSelected}
                    >
                      {renderOption(option, isSelected)}
                    </div>
                  );
                }
                
                // Default rendering
                return (
                  <div
                    key={option.id}
                    className={`
                      px-3 py-2 cursor-pointer flex items-center
                      ${isSelected ? 'bg-accent' : 'hover:bg-muted'}
                    `}
                    onClick={() => handleSelect(option)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    {isMulti && (
                      <div className={`
                        mr-2 h-4 w-4 border rounded flex items-center justify-center
                        ${isSelected ? 'bg-primary border-primary' : 'border-input'}
                      `}>
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                    )}
                    
                    <span className="flex-1">{getOptionLabel(option)}</span>
                    
                    {!isMulti && isSelected && (
                      <Check className="ml-2 h-4 w-4 text-primary" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
