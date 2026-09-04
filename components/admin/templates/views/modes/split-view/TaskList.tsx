import React from 'react';
import { Task } from '../../types';
import { CheckCircle, Circle, Plus, Search } from 'lucide-react';
import { TaskType } from '@prisma/client';
import { taskTypeLabels } from '@/lib/utils/taskTypes';

interface TaskListProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onTaskSelect: (taskId: string) => void;
  isReadOnly: boolean;
  stageName: string;
}

/**
 * Task List component for the Split View
 * Displays a list of tasks for the selected stage
 */
export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  selectedTaskId,
  onTaskSelect,
  isReadOnly,
  stageName
}) => {
  // State for search
  const [searchQuery, setSearchQuery] = React.useState('');
  
  // Filter tasks based on search query
  const filteredTasks = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return tasks;
    }
    
    const query = searchQuery.toLowerCase();
    return tasks.filter(task =>
      task.title.toLowerCase().includes(query) ||
      (task.description && task.description.toLowerCase().includes(query))
    );
  }, [tasks, searchQuery]);
  
  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b bg-muted">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-medium">Tasks {stageName ? `- ${stageName}` : ''}</h3>
          
          {!isReadOnly && (
            <button
              className="p-1 rounded hover:bg-accent"
              title="Add Task"
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        
        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search tasks..."
            className="w-full pl-8 pr-2 py-1 border rounded text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search size={14} className="absolute left-2 top-2 text-muted-foreground/70" />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {filteredTasks.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            {tasks.length === 0 
              ? 'No tasks in this stage' 
              : 'No tasks match your search'}
          </div>
        ) : (
          <ul className="divide-y">
            {filteredTasks.map(task => (
              <li 
                key={task.id}
                className={`
                  p-3 cursor-pointer hover:bg-accent/50
                  ${selectedTaskId === task.id ? 'bg-primary/10 border-l-4 border-primary' : ''}
                `}
                onClick={() => onTaskSelect(task.id)}
              >
                <div className="flex items-start">
                  {/* Check if task is completed based on metadata or status */}
                  {task.metadata?.status === 'completed' ? (
                    <CheckCircle size={16} className="mt-1 mr-2 text-success" />
                  ) : (
                    <Circle size={16} className="mt-1 mr-2 text-muted-foreground/70" />
                  )}
                  
                  <div className="flex-1">
                    <div className="font-medium">{task.title}</div>
                    
                    {task.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                    
                    <div className="text-xs text-muted-foreground/70 mt-1">
                      Type: {taskTypeLabels[task.type] || String(task.type)}
                    </div>
                    
                    {task.dependencies && task.dependencies.length > 0 && (
                      <div className="text-xs text-muted-foreground/70 mt-1">
                        Dependencies: {task.dependencies.length}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
