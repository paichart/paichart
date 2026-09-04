"use client";

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Trash2, Bot, Copy, X, Tag, Calendar } from 'lucide-react';
import { useTaskSelection } from '../context';

/**
 * Props for the TaskSelectionToolbar component
 */
interface TaskSelectionToolbarProps {
  onAssignAgent?: (taskIds: string[]) => void;
  onDelete?: (taskIds: string[]) => void;
  onDuplicate?: (taskIds: string[]) => void;
  onSetDueDate?: (taskIds: string[]) => void;
  onSetStatus?: (taskIds: string[]) => void;
}

/**
 * Toolbar for managing selected tasks
 */
export const TaskSelectionToolbar: React.FC<TaskSelectionToolbarProps> = ({
  onAssignAgent,
  onDelete,
  onDuplicate,
  onSetDueDate,
  onSetStatus
}) => {
  // Use task selection context
  const { selectedTaskIds, clearSelection } = useTaskSelection();
  
  // Get selected task IDs as array
  const selectedTaskIdsArray = Array.from(selectedTaskIds);
  
  // Get number of selected tasks
  const selectedTaskCount = selectedTaskIds.size;
  
  // Check if any tasks are selected
  if (selectedTaskCount === 0) {
    return null;
  }
  
  return (
    <Card className="sticky bottom-4 left-0 right-0 z-10 shadow-lg border-primary/20">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="font-medium mr-2">
              {selectedTaskCount} {selectedTaskCount === 1 ? 'task' : 'tasks'} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
          
          <div className="flex space-x-2">
            {onAssignAgent && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAssignAgent(selectedTaskIdsArray)}
              >
                <Bot className="h-4 w-4 mr-1" />
                Assign Agent
              </Button>
            )}
            
            {onSetStatus && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSetStatus(selectedTaskIdsArray)}
              >
                <Tag className="h-4 w-4 mr-1" />
                Set Status
              </Button>
            )}
            
            {onSetDueDate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSetDueDate(selectedTaskIdsArray)}
              >
                <Calendar className="h-4 w-4 mr-1" />
                Set Due Date
              </Button>
            )}
            
            {onDuplicate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDuplicate(selectedTaskIdsArray)}
              >
                <Copy className="h-4 w-4 mr-1" />
                Duplicate
              </Button>
            )}
            
            {onDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(selectedTaskIdsArray)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
