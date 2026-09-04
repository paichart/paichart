'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import {
  Trash2Icon,
  BanIcon,
  CheckCircleIcon,
} from 'lucide-react';

interface BulkActionsProps {
  selectedCount: number;
  onBulkDelete?: () => void;
  onBulkDeactivate?: () => void;
  onBulkActivate?: () => void;
}

export function BulkActions({
  selectedCount,
  onBulkDelete,
  onBulkDeactivate,
  onBulkActivate,
}: BulkActionsProps) {
  if (selectedCount === 0) return null;

  return (
    <Card className="flex items-center gap-4 p-4 mb-4">
      <p className="text-sm text-muted-foreground">
        {selectedCount} user{selectedCount !== 1 ? 's' : ''} selected
      </p>

      <div className="flex gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                onClick={onBulkDelete}
                className="gap-2"
              >
                <Trash2Icon className="h-4 w-4" />
                Delete
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete selected users</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={onBulkDeactivate}
                className="gap-2"
              >
                <BanIcon className="h-4 w-4" />
                Deactivate
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Deactivate selected users</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={onBulkActivate}
                className="gap-2"
              >
                <CheckCircleIcon className="h-4 w-4" />
                Activate
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Activate selected users</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </Card>
  );
}

export default BulkActions;
