import React, { useState } from 'react';
import { Task } from '../../types';
import { Pin, X, Edit, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface PinnedTask {
  id: string;
  stageId: string;
  task: Task;
}

interface TaskPinningProps {
  pinnedTasks: PinnedTask[];
  onUnpinTask: (stageId: string, taskId: string) => void;
  onTaskUpdate: (stageId: string, taskId: string, updatedTask: Partial<Task>) => void;
  isReadOnly: boolean;
}

/**
 * Task pinning component for pinning tasks across stages
 */
export const TaskPinning: React.FC<TaskPinningProps> = ({
  pinnedTasks,
  onUnpinTask,
  onTaskUpdate,
  isReadOnly
}) => {
  // State for panel expansion
  const [isExpanded, setIsExpanded] = useState(true);

  // State for edit dialog
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    taskId: string;
    stageId: string;
    currentName: string;
  }>({ open: false, taskId: '', stageId: '', currentName: '' });
  const [newName, setNewName] = useState('');

  // Handle save from dialog
  const handleSaveEdit = () => {
    if (newName && newName !== editDialog.currentName) {
      onTaskUpdate(editDialog.stageId, editDialog.taskId, { title: newName });
    }
    setEditDialog({ open: false, taskId: '', stageId: '', currentName: '' });
    setNewName('');
  };

  // If no pinned tasks, show a minimal UI
  if (pinnedTasks.length === 0) {
    return (
      <div className="mt-4 border-t pt-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground p-2">
          <div className="flex items-center">
            <Pin size={14} className="mr-1" />
            <span>Pinned Tasks</span>
          </div>
          <span>No tasks pinned</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="mt-4 border-t pt-2">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          <Pin size={16} className="mr-2 text-primary" />
          <h3 className="font-medium">Pinned Tasks ({pinnedTasks.length})</h3>
        </div>
        
        <button className="p-1 rounded hover:bg-accent">
          {isExpanded ? (
            <ChevronUp size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
        </button>
      </div>
      
      {/* Pinned tasks list */}
      {isExpanded && (
        <div className="mt-2 space-y-2 max-h-40 overflow-y-auto p-2">
          {pinnedTasks.map(({ id, stageId, task }) => (
            <div 
              key={`${stageId}-${id}`}
              className="flex items-start justify-between p-2 border rounded-md bg-primary/10"
            >
              <div className="flex-1">
                <div className="font-medium">{task.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  From stage: {stageId}
                </div>
                {task.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                    {task.description}
                  </p>
                )}
              </div>
              
              <div className="flex space-x-1">
                {!isReadOnly && (
                  <button
                    className="p-1 rounded hover:bg-primary/20"
                    onClick={() => {
                      setEditDialog({ open: true, taskId: id, stageId, currentName: task.title });
                      setNewName(task.title);
                    }}
                    title="Edit Task"
                  >
                    <Edit size={14} />
                  </button>
                )}
                
                {!isReadOnly && (
                  <button
                    className="p-1 rounded hover:bg-primary/20 text-destructive"
                    onClick={() => onUnpinTask(stageId, id)}
                    title="Unpin Task"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Task Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => {
        if (!open) {
          setEditDialog({ open: false, taskId: '', stageId: '', currentName: '' });
          setNewName('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task Name</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Task name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSaveEdit();
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialog({ open: false, taskId: '', stageId: '', currentName: '' });
                setNewName('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
