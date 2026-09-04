import React from 'react';
import { TaskNodeData } from './types';

interface TaskDetailsPanelProps {
  selectedTaskId: string;
  nodes: TaskNodeData[];
  getTaskTypeIcon: (type: string) => React.ReactNode;
}

export const TaskDetailsPanel = React.memo(function TaskDetailsPanel({
  selectedTaskId,
  nodes,
  getTaskTypeIcon
}: TaskDetailsPanelProps) {
  const selectedTask = nodes.find(node => node.id === selectedTaskId);
  if (!selectedTask) return null;
  
  const dependencies = selectedTask.dependencies
    .map(depId => nodes.find(n => n.id === depId))
    .filter(Boolean)
    .map(node => node?.title);
  
  const dependents = nodes
    .filter(node => node.dependencies.includes(selectedTaskId))
    .map(node => node.title);
  
  return (
    <div className="mb-4 p-3 border rounded-md bg-muted">
      <div className="text-sm">
        <div className="font-medium text-base mb-2">{selectedTask.title}</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-muted-foreground mb-1">Stage</p>
            <p>{selectedTask.stageName}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Type</p>
            <p className="flex items-center">
              <span className="mr-1">{getTaskTypeIcon(selectedTask.type)}</span>
              {selectedTask.type}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Dependencies ({dependencies.length})</p>
            {dependencies.length > 0 ? (
              <ul className="list-disc list-inside">
                {dependencies.map((name, i) => (
                  <li key={i} className="truncate">{name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground/60 italic">None</p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Dependent Tasks ({dependents.length})</p>
            {dependents.length > 0 ? (
              <ul className="list-disc list-inside">
                {dependents.map((name, i) => (
                  <li key={i} className="truncate">{name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground/60 italic">None</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
