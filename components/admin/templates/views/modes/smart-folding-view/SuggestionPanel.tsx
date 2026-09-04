import React from 'react';
import { Stage } from '../../types';
import { Suggestion } from './hooks/useSmartFoldingState';
import { Lightbulb, RefreshCw, Loader2, Check, X, AlertTriangle, Info } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';

interface SuggestionPanelProps {
  suggestions: Suggestion[];
  stages: Stage[];
  onStageSelect: (stageId: string) => void;
  onTaskSelect: (stageId: string, taskId: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  isReadOnly: boolean;
}

/**
 * Suggestion panel component for displaying AI-generated suggestions
 */
export const SuggestionPanel: React.FC<SuggestionPanelProps> = ({
  suggestions,
  stages,
  onStageSelect,
  onTaskSelect,
  onRefresh,
  isLoading,
  isReadOnly
}) => {
  const { toast } = useToast();

  // Get stage name by ID
  const getStageName = (stageId: string) => {
    const stage = stages.find((s: Stage) => s.id === stageId);
    return stage ? stage.name : 'Unknown Stage';
  };
  
  // Get task name by stage ID and task ID
  const getTaskName = (stageId: string, taskId: string) => {
    const stage = stages.find((s: Stage) => s.id === stageId);
    if (!stage) return 'Unknown Task';
    
    const task = stage.tasks.find(t => t.id === taskId);
    return task ? task.title : 'Unknown Task';
  };
  
  // Get icon for suggestion type
  const getSuggestionIcon = (type: string, priority: string) => {
    switch (type) {
      case 'add':
        return <Plus className={`text-green-500`} size={16} />;
      case 'modify':
        return <Edit className={`text-blue-500`} size={16} />;
      case 'remove':
        return <Trash className={`text-red-500`} size={16} />;
      case 'general':
      default:
        return <Info className={`text-purple-500`} size={16} />;
    }
  };
  
  // Get color for priority
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-500';
      case 'medium':
        return 'text-orange-500';
      case 'low':
        return 'text-green-500';
      default:
        return 'text-gray-500';
    }
  };
  
  // Handle suggestion click
  const handleSuggestionClick = (suggestion: Suggestion) => {
    if (suggestion.stageId) {
      onStageSelect(suggestion.stageId);
      
      if (suggestion.taskId) {
        onTaskSelect(suggestion.stageId, suggestion.taskId);
      }
    }
  };
  
  // Sort suggestions by priority
  const sortedSuggestions = [...suggestions].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
  });
  
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium">AI Suggestions</h3>
        
        <button
          className="p-1 rounded hover:bg-gray-100 text-gray-600"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh Suggestions"
        >
          {isLoading ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <RefreshCw size={16} />
          )}
        </button>
      </div>
      
      {suggestions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No suggestions available
        </div>
      ) : (
        <div className="space-y-3">
          {sortedSuggestions.map((suggestion, index) => (
            <div 
              key={index}
              className={`
                p-3 border rounded-md hover:bg-gray-50
                ${suggestion.stageId ? 'cursor-pointer' : ''}
              `}
              onClick={() => suggestion.stageId && handleSuggestionClick(suggestion)}
            >
              <div className="flex items-start">
                <div className="mt-1 mr-2 flex-shrink-0">
                  {getSuggestionIcon(suggestion.type, suggestion.priority)}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">
                        {suggestion.type.charAt(0).toUpperCase() + suggestion.type.slice(1)} Suggestion
                      </h4>
                      {suggestion.stageId && (
                        <p className="text-sm text-gray-500">
                          Stage: {getStageName(suggestion.stageId)}
                          {suggestion.taskId && ` • Task: ${getTaskName(suggestion.stageId, suggestion.taskId)}`}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs font-medium ${getPriorityColor(suggestion.priority)}`}>
                      {suggestion.priority.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{suggestion.suggestion}</p>
                  
                  {!isReadOnly && (
                    <div className="mt-3 flex justify-end space-x-2">
                      <button
                        className="px-2 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100 flex items-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          // TODO: Implement apply suggestion functionality
                          toast({
                            title: "Coming Soon",
                            description: "Apply suggestion functionality will be available in a future update",
                          });
                        }}
                      >
                        <Check size={12} className="mr-1" />
                        Apply
                      </button>
                      <button
                        className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 flex items-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          // TODO: Implement dismiss suggestion functionality
                          toast({
                            title: "Coming Soon",
                            description: "Dismiss suggestion functionality will be available in a future update",
                          });
                        }}
                      >
                        <X size={12} className="mr-1" />
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Import these at the top of the file
const Plus = Lightbulb;
const Edit = Lightbulb;
const Trash = AlertTriangle;
