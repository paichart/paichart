import React, { useState, useEffect, useCallback } from 'react';
import { ViewModeProps } from '../types';
import { 
  FoldableStage, 
  RelatedSections, 
  SmartSearch, 
  SuggestionPanel,
  useSmartFoldingState
} from './smart-folding-view';
import { llmService } from '@/lib/services/llm';
import { LLMProvider } from '@/lib/services/llm/types';
import { Settings, Search, Lightbulb, GitBranch, Loader2 } from 'lucide-react';

/**
 * AI-Assisted Smart Folding View with Contextual Suggestions
 * 
 * Features:
 * - Intelligent folding of less relevant sections
 * - Highlighting of related sections
 * - Smart search functionality
 * - AI assistant for editing suggestions
 * - Working sets for pinning related tasks
 * - Contextual recommendations
 */
export const SmartFoldingView: React.FC<ViewModeProps> = ({
  template,
  onTemplateChange,
  onSave,
  isReadOnly
}) => {
  // Use the smart folding state hook
  const {
    foldedSections,
    relatedSections,
    suggestions,
    searchResults,
    setFoldedSections,
    setRelatedSections,
    setSuggestions,
    setSearchResults,
    currentStageId,
    currentTaskId,
    setCurrentStageId,
    setCurrentTaskId,
    updateStage,
    updateTask,
    stages
  } = useSmartFoldingState(template, onTemplateChange);
  
  // State for AI analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'search' | 'related' | 'suggestions'>('related');
  const [searchQuery, setSearchQuery] = useState('');
  // Was LLMProvider.GEMINI_SDK until 2026-08-05; Gemini is gone, so this now defaults to the
  // only remaining provider rather than to a value the enum no longer has.
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>(LLMProvider.ANTHROPIC_SDK);
  const [hasAnalyzedFolding, setHasAnalyzedFolding] = useState(false);
  const [hasAnalyzedRelationships, setHasAnalyzedRelationships] = useState(false);
  
  // Initialize with the default provider
  useEffect(() => {
    setSelectedProvider(LLMProvider.ANTHROPIC_SDK);
  }, []);
  
  // Handle save
  const handleSave = () => {
    onSave(template);
  };
  
  // Analyze template for folding
  const analyzeTemplateForFolding = useCallback(async () => {
    if (isAnalyzing) return;
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    
    try {
      // Set the provider
      await llmService.setProvider(selectedProvider);
      
      // Analyze the template
      const result = await llmService.analyzeTemplate({
        template,
        analysisType: 'folding',
        context: {
          currentStageId,
          currentTaskId
        }
      });
      
      if (result.foldedSections) {
        setFoldedSections(result.foldedSections);
        setHasAnalyzedFolding(true);
      }
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Unknown error during analysis');
    } finally {
      setIsAnalyzing(false);
    }
  }, [template, currentStageId, currentTaskId, selectedProvider, setFoldedSections, isAnalyzing]);
  
  // Analyze template for relationships
  const analyzeTemplateForRelationships = useCallback(async () => {
    if (isAnalyzing) return;
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    
    try {
      // Set the provider
      await llmService.setProvider(selectedProvider);
      
      // Analyze the template
      const result = await llmService.analyzeTemplate({
        template,
        analysisType: 'relationships',
        context: {
          currentStageId,
          currentTaskId
        }
      });
      
      if (result.relatedSections) {
        setRelatedSections(result.relatedSections);
        setHasAnalyzedRelationships(true);
      }
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Unknown error during analysis');
    } finally {
      setIsAnalyzing(false);
    }
  }, [template, currentStageId, currentTaskId, selectedProvider, setRelatedSections, isAnalyzing]);
  
  // Analyze template for suggestions
  const analyzeTemplateForSuggestions = useCallback(async () => {
    if (isAnalyzing) return;
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    
    try {
      // Set the provider
      await llmService.setProvider(selectedProvider);
      
      // Analyze the template
      const result = await llmService.analyzeTemplate({
        template,
        analysisType: 'suggestions',
        context: {
          currentStageId,
          currentTaskId
        }
      });
      
      if (result.suggestions) {
        setSuggestions(result.suggestions);
      }
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Unknown error during analysis');
    } finally {
      setIsAnalyzing(false);
    }
  }, [template, currentStageId, currentTaskId, selectedProvider, setSuggestions, isAnalyzing]);
  
  // Search template
  const searchTemplate = useCallback(async () => {
    if (isAnalyzing || !searchQuery.trim()) return;
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    
    try {
      // Set the provider
      await llmService.setProvider(selectedProvider);
      
      // Analyze the template
      const result = await llmService.analyzeTemplate({
        template,
        analysisType: 'search',
        context: {
          query: searchQuery
        }
      });
      
      if (result.searchResults) {
        setSearchResults(result.searchResults);
      }
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Unknown error during analysis');
    } finally {
      setIsAnalyzing(false);
    }
  }, [template, searchQuery, selectedProvider, setSearchResults, isAnalyzing]);
  
  // Initial analysis - only run once when stages are loaded and no folded sections exist
  useEffect(() => {
    if (stages.length > 0 && !hasAnalyzedFolding && !isAnalyzing) {
      // Use a timeout to prevent immediate re-analysis
      const timer = setTimeout(() => {
        analyzeTemplateForFolding();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [stages.length, hasAnalyzedFolding, isAnalyzing, analyzeTemplateForFolding]);
  
  // When current stage/task changes, analyze for relationships
  useEffect(() => {
    // Only analyze if we haven't already analyzed or if the current stage/task has changed
    if (currentStageId && currentTaskId && !isAnalyzing && activeTab === 'related' &&
        (!hasAnalyzedRelationships || relatedSections.length === 0)) {
      // Use a timeout to prevent immediate re-analysis
      const timer = setTimeout(() => {
        analyzeTemplateForRelationships();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [
    currentStageId, 
    currentTaskId, 
    activeTab, 
    isAnalyzing, 
    hasAnalyzedRelationships,
    relatedSections.length,
    analyzeTemplateForRelationships
  ]);
  
  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold">{template.name}</h2>
          <p className="text-muted-foreground text-sm">{template.description}</p>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Provider selector */}
          <select
            className="px-2 py-1 border rounded text-sm bg-background"
            value={selectedProvider}
            onChange={(e) => {
              setSelectedProvider(e.target.value as LLMProvider);
              // Reset analysis flags when provider changes
              setHasAnalyzedFolding(false);
              setHasAnalyzedRelationships(false);
            }}
            disabled={isAnalyzing}
          >
            <option value={LLMProvider.ANTHROPIC_SDK}>Anthropic Claude (SDK)</option>
          </select>
          
          {/* Save button removed to unify save functionality in the parent TemplateEditor component */}
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 flex">
        {/* Stages panel */}
        <div className="w-2/3 pr-4 overflow-y-auto">
          {isAnalyzing && (
            <div className="flex items-center justify-center p-4 bg-primary/10 rounded mb-4">
              <Loader2 className="animate-spin mr-2" size={16} />
              <span>Analyzing template...</span>
            </div>
          )}
          
          {analysisError && (
            <div className="p-4 bg-destructive/10 text-destructive rounded mb-4">
              <p className="font-medium">Analysis Error</p>
              <p className="text-sm">{analysisError}</p>
            </div>
          )}
          
          {stages.map((stage) => (
            <FoldableStage
              key={stage.id}
              stage={stage}
              isFolded={foldedSections.some(fs => fs.stageId === stage.id)}
              foldedTaskIds={foldedSections.find(fs => fs.stageId === stage.id)?.taskIds || []}
              isCurrentStage={stage.id === currentStageId}
              currentTaskId={currentTaskId}
              onStageSelect={() => setCurrentStageId(stage.id)}
              onTaskSelect={(taskId) => {
                setCurrentStageId(stage.id);
                setCurrentTaskId(taskId);
              }}
              onStageUpdate={(updatedStage) => updateStage(stage.id, updatedStage)}
              onTaskUpdate={(taskId, updatedTask) => updateTask(stage.id, taskId, updatedTask)}
              relatedSections={relatedSections.filter(rs => 
                (rs.sourceStageId === stage.id) || (rs.relatedStageId === stage.id)
              )}
              isReadOnly={isReadOnly || false}
            />
          ))}
        </div>
        
        {/* Right panel */}
        <div className="w-1/3 border-l pl-4">
          {/* Tabs */}
          <div className="flex border-b mb-4">
            <button
              className={`px-4 py-2 flex items-center ${activeTab === 'related' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
              onClick={() => {
                setActiveTab('related');
                if (currentStageId && currentTaskId) {
                  analyzeTemplateForRelationships();
                }
              }}
            >
              <GitBranch size={16} className="mr-1" />
              Related
            </button>
            <button
              className={`px-4 py-2 flex items-center ${activeTab === 'suggestions' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
              onClick={() => {
                setActiveTab('suggestions');
                analyzeTemplateForSuggestions();
              }}
            >
              <Lightbulb size={16} className="mr-1" />
              Suggestions
            </button>
            <button
              className={`px-4 py-2 flex items-center ${activeTab === 'search' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
              onClick={() => setActiveTab('search')}
            >
              <Search size={16} className="mr-1" />
              Search
            </button>
          </div>
          
          {/* Tab content */}
          {activeTab === 'related' && (
            <RelatedSections
              relatedSections={relatedSections}
              stages={stages}
              currentStageId={currentStageId}
              currentTaskId={currentTaskId}
              onStageSelect={setCurrentStageId}
              onTaskSelect={(stageId, taskId) => {
                setCurrentStageId(stageId);
                setCurrentTaskId(taskId);
              }}
              onRefresh={analyzeTemplateForRelationships}
              isLoading={isAnalyzing}
            />
          )}
          
          {activeTab === 'suggestions' && (
            <SuggestionPanel
              suggestions={suggestions}
              stages={stages}
              onStageSelect={setCurrentStageId}
              onTaskSelect={(stageId, taskId) => {
                setCurrentStageId(stageId);
                setCurrentTaskId(taskId);
              }}
              onRefresh={analyzeTemplateForSuggestions}
              isLoading={isAnalyzing}
              isReadOnly={isReadOnly || false}
            />
          )}
          
          {activeTab === 'search' && (
            <SmartSearch
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchResults={searchResults}
              stages={stages}
              onSearch={searchTemplate}
              onStageSelect={setCurrentStageId}
              onTaskSelect={(stageId, taskId) => {
                setCurrentStageId(stageId);
                setCurrentTaskId(taskId);
              }}
              isLoading={isAnalyzing}
            />
          )}
        </div>
      </div>
    </div>
  );
};
