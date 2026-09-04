"use client";

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Download, Trash2, X } from 'lucide-react';

interface BulkActionsProps {
  selectedIds: string[];
  templateType: 'phase' | 'pov';
  onExport: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  onClearSelection: () => void;
}

export function BulkActions({
  selectedIds,
  templateType,
  onExport,
  onDelete,
  onClearSelection
}: BulkActionsProps) {
  
  if (selectedIds.length === 0) {
    return null;
  }

  const handleBulkDelete = () => {
    const confirmMessage = `Are you sure you want to delete ${selectedIds.length} template${selectedIds.length > 1 ? 's' : ''}? This action cannot be undone.`;
    
    if (confirm(confirmMessage)) {
      onDelete(selectedIds);
    }
  };

  return (
    <div className="flex justify-between items-center mb-4 p-3 bg-accent/50 border border-border rounded-md">
      <div className="flex items-center space-x-4">
        <div className="text-foreground">
          <span className="font-medium">{selectedIds.length}</span> template{selectedIds.length !== 1 ? 's' : ''} selected
        </div>
        
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExport(selectedIds)}
          >
            <Download className="h-4 w-4 mr-2" />
            Export Selected
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkDelete}
            className="text-destructive hover:text-destructive/80"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Selected
          </Button>
        </div>
      </div>
      
      <Button 
        variant="outline" 
        size="sm"
        onClick={onClearSelection}
      >
        <X className="h-4 w-4 mr-2" />
        Clear Selection
      </Button>
    </div>
  );
}

export default BulkActions;
