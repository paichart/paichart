import React from 'react';
import { Stage } from '../../types';
import { SearchResult } from './hooks/useSmartFoldingState';
import { Search, Loader2 } from 'lucide-react';

interface SmartSearchProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  stages: Stage[];
  onSearch: () => void;
  onStageSelect: (stageId: string) => void;
  onTaskSelect: (stageId: string, taskId: string) => void;
  isLoading: boolean;
}

/**
 * Smart search component for searching within templates
 */
export const SmartSearch: React.FC<SmartSearchProps> = ({
  searchQuery,
  setSearchQuery,
  searchResults,
  stages,
  onSearch,
  onStageSelect,
  onTaskSelect,
  isLoading
}) => {
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
  
  // Handle search form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch();
    }
  };
  
  // Handle search result click
  const handleResultClick = (result: SearchResult) => {
    onStageSelect(result.stageId);
    onTaskSelect(result.stageId, result.taskId);
  };
  
  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="relative">
          <input
            type="text"
            className="w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Search template..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            disabled={isLoading || !searchQuery.trim()}
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Search size={18} />
            )}
          </button>
        </div>
      </form>
      
      {searchResults.length === 0 ? (
        searchQuery.trim() ? (
          <div className="text-center py-8 text-muted-foreground">
            No results found for &quot;{searchQuery}&quot;
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Enter a search term to find tasks
          </div>
        )
      ) : (
        <div>
          <h3 className="font-medium mb-3">Search Results</h3>
          <div className="space-y-3">
            {searchResults.map((result, index) => (
              <div 
                key={index}
                className="p-3 border rounded-md hover:bg-muted cursor-pointer"
                onClick={() => handleResultClick(result)}
              >
                <div className="flex items-start">
                  <div className="flex-1">
                    <h4 className="font-medium">{getTaskName(result.stageId, result.taskId)}</h4>
                    <p className="text-sm text-muted-foreground">
                      Stage: {getStageName(result.stageId)}
                    </p>
                    {result.matchedText && (
                      <div className="mt-2 text-sm">
                        <p className="text-foreground">
                          <span className="font-medium">Matched:</span>{' '}
                          <span className="italic">&quot;{result.matchedText}&quot;</span>
                        </p>
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground/70">
                      Relevance: {Math.round(result.relevance * 100)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
