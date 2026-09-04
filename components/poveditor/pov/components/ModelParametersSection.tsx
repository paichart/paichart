"use client";

import React from 'react';
import { Label } from '@/components/ui/Label';
import { Slider } from '@/components/ui/Slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { Button } from '@/components/ui/Button';
import { ChevronDown, ChevronUp, Settings2, RotateCcw, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Separator } from '@/components/ui/Separator';
import { Badge } from '@/components/ui/Badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';
import { LLMProvider, anthropicModels, toModelOptions } from '@/lib/services/llm/types';
import { supportsThinkingBudget } from '@/lib/services/llm/model-capabilities';
import { useSettings } from '@/lib/hooks/useSettings';

export interface ModelParameters {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  stopSequences: string[];
  useSystemPrompt: boolean;
  systemPrompt: string;
  webSearch?: {
    maxUses?: number;
    allowedDomains?: string[];
    blockedDomains?: string[];
    userLocation?: {
      type: 'approximate';
      city: string;
      region: string;
      country: string;
      timezone: string;
    };
  };
  cacheControl?: { type: 'ephemeral' } | false | null; // false = explicit opt-out; null/absent = default (ON)
  thinkingBudgetTokens?: number;
}

interface ModelParametersSectionProps {
  parameters: ModelParameters;
  onChange: (parameters: ModelParameters) => void;
  availableModels: { provider: LLMProvider; models: { id: string; name: string }[] }[];
  templateDefaults?: Partial<ModelParameters>;
  onResetToTemplate?: () => void;
}

export const ModelParametersSection: React.FC<ModelParametersSectionProps> = ({
  parameters,
  onChange,
  availableModels = [],
  templateDefaults,
  onResetToTemplate
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [stopSequence, setStopSequence] = React.useState('');
  const { settings } = useSettings();

  // Helper function to check if a parameter is modified from template
  const isParameterModified = (key: keyof ModelParameters, currentValue: any): boolean => {
    if (!templateDefaults) return false;
    const templateValue = templateDefaults[key];
    if (templateValue === undefined) return false;
    
    // Handle different types of comparisons
    if (Array.isArray(currentValue) && Array.isArray(templateValue)) {
      return JSON.stringify(currentValue) !== JSON.stringify(templateValue);
    }
    return currentValue !== templateValue;
  };

  // Helper function to get template value for display
  const getTemplateValue = (key: keyof ModelParameters): any => {
    return templateDefaults?.[key];
  };

  // Helper component for parameter fields with source indication
  const ParameterField: React.FC<{
    children: React.ReactNode;
    paramKey: keyof ModelParameters;
    currentValue: any;
    label: string;
  }> = ({ children, paramKey, currentValue, label }) => {
    const isModified = isParameterModified(paramKey, currentValue);
    const templateValue = getTemplateValue(paramKey);
    
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label>{label}</Label>
            {isModified && templateDefaults && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                        Modified
                      </Badge>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <p><strong>Template value:</strong> {String(templateValue)}</p>
                      <p><strong>Current value:</strong> {String(currentValue)}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {isModified && onResetToTemplate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const resetParams = { ...parameters, [paramKey]: templateValue };
                onChange(resetParams);
              }}
              className="h-6 px-2 text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
        </div>
        {children}
      </div>
    );
  };

  // Get models for the selected provider
  const providerModels = availableModels.find(p => p.provider === parameters.provider)?.models || [];

  // Handle parameter changes
  const handleChange = (key: keyof ModelParameters, value: any) => {
    onChange({
      ...parameters,
      [key]: value
    });
  };

  // Handle adding a stop sequence
  const handleAddStopSequence = () => {
    const currentStopSequences = parameters.stopSequences || [];
    if (stopSequence && !currentStopSequences.includes(stopSequence)) {
      handleChange('stopSequences', [...currentStopSequences, stopSequence]);
      setStopSequence('');
    }
  };

  // Handle removing a stop sequence
  const handleRemoveStopSequence = (sequence: string) => {
    const currentStopSequences = parameters.stopSequences || [];
    handleChange(
      'stopSequences',
      currentStopSequences.filter(s => s !== sequence)
    );
  };

  // Default models if none are provided
  // Fallback when availableModels isn't passed — derived from the registry (single source, no drift).
  const defaultModels: Partial<Record<LLMProvider, { id: string; name: string }[]>> = {
    [LLMProvider.ANTHROPIC_SDK]: toModelOptions(anthropicModels)
  };

  // Get models to display
  const modelsToDisplay = providerModels.length > 0 
    ? providerModels 
    : (defaultModels[parameters.provider] || []);

  // Helper function to get effective provider for display
  const getEffectiveProvider = (): string => {
    // Always show the actual provider from parameters if it's set
    // This handles both explicit selections and saved configurations
    if (parameters.provider === LLMProvider.ANTHROPIC_SDK) return 'Claude';
    
    // If no provider in parameters, check user settings
    if (settings.llm?.useSystemProvider === false && settings.llm?.provider) {
      // User has personal provider preference
      if (settings.llm.provider === 'anthropic_sdk') return 'Claude';
    }
    
    // Default fallback (could be system/organization default)
    return 'System';
  };

  // Helper function to get effective model name for display
  const getEffectiveModel = (): string => {
    if (parameters.model?.includes('fable') || parameters.model?.includes('mythos')) return 'Fable';
    if (parameters.model?.includes('sonnet')) return 'Sonnet';
    if (parameters.model?.includes('opus')) return 'Opus';
    if (parameters.model?.includes('haiku')) return 'Haiku';
    if (parameters.model) return 'Model';
    
    // No model specified - show generic based on effective provider
    const effectiveProvider = getEffectiveProvider();
    if (effectiveProvider === 'Claude') return 'Model';
    return 'Model';
  };

  return (
    <Card className="mb-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full flex justify-between items-center p-4"
          >
            <div className="flex items-center">
              <Settings2 className="h-4 w-4 mr-2" />
              <span>Model Parameters</span>
              
              {/* Provider & Model Badge */}
              <Badge variant="outline" className="ml-2 text-xs">
                {getEffectiveProvider()} • {getEffectiveModel()}
              </Badge>
              
              {/* Temperature Badge - Always show */}
              <Badge variant="outline" className="ml-2 text-xs">
                T: {parameters.temperature}
              </Badge>
              
              {/* Token Limit - Always show, directly after temperature */}
              <Badge variant="outline" className="ml-2 text-xs">
                Tok: {parameters.maxTokens}
              </Badge>
              
              {/* Caching Status - Always show */}
              <Badge variant="outline" className="ml-2 text-xs">
                {/* Tri-state (Finding G, default-ON 2026-07-08): object = explicit on,
                    false = explicit opt-out, null/absent = platform default (caching ON). */}
                {parameters.cacheControl ? 'Cache' : parameters.cacheControl === false ? 'noCache' : 'Cache (default)'}
              </Badge>
              
              {/* Thinking Budget - Always show (only for compatible models) */}
              {(supportsThinkingBudget(parameters.model)) && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {parameters.thinkingBudgetTokens ? `Think: ${parameters.thinkingBudgetTokens}` : 'noThink'}
                </Badge>
              )}
              
            </div>
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="provider">Provider</Label>
                  <Select
                    value={parameters.provider}
                    onValueChange={(value) => handleChange('provider', value)}
                  >
                    <SelectTrigger id="provider">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={LLMProvider.ANTHROPIC_SDK}>Anthropic Claude (SDK)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Select
                    value={parameters.model}
                    onValueChange={(value) => handleChange('model', value)}
                  >
                    <SelectTrigger id="model">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelsToDisplay.map((model: { id: string; name: string }) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <Separator />
              
              {/* Compact Parameter Grid Layout with Source Indicators */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ParameterField
                  paramKey="temperature"
                  currentValue={parameters.temperature}
                  label="Temperature"
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          id="temperature"
                          type="number"
                          step="0.1"
                          min="0"
                          max="1"
                          value={parameters.temperature}
                          onChange={(e) => {
                            const value = e.target.value === '' ? 0.7 : parseFloat(e.target.value);
                            handleChange('temperature', value);
                          }}
                          onBlur={(e) => {
                            if (e.target.value === '') {
                              handleChange('temperature', 0.7);
                            }
                          }}
                          className="text-sm"
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Controls randomness. Lower values (0.0) make output more deterministic and focused, 
                          higher values (1.0) make output more creative and diverse.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </ParameterField>
                
                <ParameterField
                  paramKey="maxTokens"
                  currentValue={parameters.maxTokens}
                  label="Max Tokens"
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          id="max-tokens"
                          type="number"
                          min="100"
                          max="500000"
                          value={parameters.maxTokens}
                          onChange={(e) => {
                            const value = e.target.value === '' ? 1000 : parseInt(e.target.value);
                            handleChange('maxTokens', value);
                          }}
                          onBlur={(e) => {
                            if (e.target.value === '') {
                              handleChange('maxTokens', 1000);
                            }
                          }}
                          className="text-sm"
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Maximum number of tokens to generate. A token is approximately 4 characters.
                          Now supports up to 500,000 tokens for long-form content.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </ParameterField>
                
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stop Sequences</Label>
                  <div className="flex gap-2">
                    <Input
                      value={stopSequence}
                      onChange={(e) => setStopSequence(e.target.value)}
                      placeholder="Add stop sequence"
                      className="flex-1 text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddStopSequence}
                      disabled={!stopSequence}
                    >
                      Add
                    </Button>
                  </div>
                  {(parameters.stopSequences || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(parameters.stopSequences || []).map((sequence) => (
                        <Badge key={sequence} variant="secondary" className="flex items-center gap-1 text-xs">
                          {sequence}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-3 w-3 p-0 hover:bg-transparent"
                            onClick={() => handleRemoveStopSequence(sequence)}
                          >
                            ×
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              

              {/* Anthropic Specific Features Section */}
              {parameters.provider === LLMProvider.ANTHROPIC_SDK && (
                <>
                  <Separator />
                  <div className="pt-4">
                    <Label className="text-sm font-medium">Anthropic Specific Features</Label>
                    {/* Prompt Caching Control */}
                    <div className="space-y-2 mt-3">
                      <div className="flex items-center space-x-2">
                        {/* Default-ON semantics (Finding G, 2026-07-08): null/absent = platform
                            default (caching ON), so the switch reads ON unless explicitly opted
                            out; toggle-off writes FALSE (the opt-out sentinel that survives
                            normalizeCacheControl), never null. */}
                        <Switch
                          id="enable-prompt-caching"
                          checked={parameters.cacheControl !== false}
                          onCheckedChange={(checked) => {
                            handleChange('cacheControl', checked ? { type: 'ephemeral' } : false);
                          }}
                        />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Label htmlFor="enable-prompt-caching">Enable Prompt Caching (Ephemeral)</Label>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                Allows Anthropic models to reuse computations from previous identical requests to reduce latency and cost.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>

                    {/* Thinking Budget Tokens Control */}
                    <div className="space-y-2 mt-4">
                      <div className="flex justify-between">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Label htmlFor="thinking-budget-tokens">
                                Thinking Budget Tokens: {parameters.thinkingBudgetTokens || 0}
                              </Label>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                Allocates tokens for compatible models (e.g., Claude 3.7+ and Claude 4+ series) to &quot;think&quot; before responding. Set to 0 to disable.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Input
                        id="thinking-budget-tokens"
                        type="number"
                        value={parameters.thinkingBudgetTokens || ''}
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                          handleChange('thinkingBudgetTokens', value && value > 0 ? value : undefined);
                        }}
                        placeholder="e.g., 500 (0 to disable)"
                        min="0"
                        disabled={!(supportsThinkingBudget(parameters.model))}
                      />
                      {!(supportsThinkingBudget(parameters.model)) &&
                        <p className="text-xs text-muted-foreground">
                          Note: &quot;Thinking&quot; feature is available for Claude 3.7+ and Claude 4+ series models.
                        </p>
                      }
                    </div>
                  </div>
                </>
              )}
              
              <div className="flex justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onChange({
                      ...parameters,
                      temperature: 0.3,
                      maxTokens: 1000,
                      stopSequences: [],
                      useSystemPrompt: true,
                      systemPrompt: 'You are a helpful AI assistant.',
                      cacheControl: null,
                      thinkingBudgetTokens: undefined,
                    });
                  }}
                >
                  Reset to Defaults
                </Button>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default ModelParametersSection;
