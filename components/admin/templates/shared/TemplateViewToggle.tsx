"use client";

import React from 'react';
import { Button } from '@/components/ui/Button';
import { LayoutGrid, Table } from 'lucide-react';

interface TemplateViewToggleProps {
  currentView: 'cards' | 'table';
  onViewChange: (view: 'cards' | 'table') => void;
}

export function TemplateViewToggle({ currentView, onViewChange }: TemplateViewToggleProps) {
  return (
    <div className="flex items-center space-x-1">
      <Button
        variant={currentView === 'cards' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('cards')}
        className="h-8 px-3"
      >
        <LayoutGrid className="h-4 w-4 mr-2" />
        Cards
      </Button>
      <Button
        variant={currentView === 'table' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('table')}
        className="h-8 px-3"
      >
        <Table className="h-4 w-4 mr-2" />
        Table
      </Button>
    </div>
  );
}

export default TemplateViewToggle;
