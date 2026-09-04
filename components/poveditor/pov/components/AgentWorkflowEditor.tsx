"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Plus, Trash2, GitBranch, AlertCircle, Copy, RotateCcw } from 'lucide-react';

interface WorkflowPhase {
  name: string;
  description: string;
}

interface AgentWorkflowEditorProps {
  workflow: Record<string, string>;
  onChange: (workflow: Record<string, string>) => void;
  className?: string;
}

// Predefined workflow templates for common agent types
const WORKFLOW_TEMPLATES = {
  'qa-testing': {
    name: 'QA Testing Workflow',
    phases: {
      'setup': 'Initialize testing environment and validate prerequisites',
      'parameter_validation': 'Execute comprehensive parameter testing and validation',
      'search_testing': 'Test exact match, partial match, and edge case functionality',
      'error_handling': 'Validate error scenarios and exception handling',
      'performance_testing': 'Assess response times and system performance',
      'documentation': 'Create comprehensive test report and recommendations'
    }
  },
  'documentation': {
    name: 'Documentation Workflow',
    phases: {
      'research': 'Gather requirements and analyze existing documentation',
      'planning': 'Create documentation structure and outline',
      'writing': 'Draft comprehensive documentation content',
      'review': 'Review for accuracy, clarity, and completeness',
      'formatting': 'Apply consistent formatting and styling',
      'finalization': 'Final review and publication preparation'
    }
  },
  'analysis': {
    name: 'Analysis Workflow',
    phases: {
      'data_collection': 'Gather and validate required data sources',
      'initial_analysis': 'Perform preliminary data analysis and exploration',
      'deep_analysis': 'Conduct detailed analysis and pattern identification',
      'validation': 'Validate findings and cross-check results',
      'insights': 'Extract key insights and actionable recommendations',
      'reporting': 'Create comprehensive analysis report'
    }
  },
  'development': {
    name: 'Development Workflow',
    phases: {
      'requirements': 'Analyze requirements and technical specifications',
      'design': 'Create technical design and architecture plan',
      'implementation': 'Develop and implement the solution',
      'testing': 'Perform unit testing and integration testing',
      'review': 'Code review and quality assurance',
      'deployment': 'Prepare for deployment and documentation'
    }
  }
};

export const AgentWorkflowEditor: React.FC<AgentWorkflowEditorProps> = ({
  workflow,
  onChange,
  className
}) => {
  const [phases, setPhases] = useState<WorkflowPhase[]>([]);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newPhaseDescription, setNewPhaseDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  // Convert workflow object to phases array for editing
  useEffect(() => {
    const phasesArray = Object.entries(workflow).map(([name, description]) => ({
      name,
      description
    }));
    setPhases(phasesArray);
  }, [workflow]);

  // Convert phases array back to workflow object
  const updateWorkflow = (newPhases: WorkflowPhase[]) => {
    const workflowObject = newPhases.reduce((acc, phase) => {
      if (phase.name.trim() && phase.description.trim()) {
        acc[phase.name.trim()] = phase.description.trim();
      }
      return acc;
    }, {} as Record<string, string>);
    
    onChange(workflowObject);
  };

  // Add new phase
  const handleAddPhase = () => {
    if (!newPhaseName.trim() || !newPhaseDescription.trim()) {
      return;
    }

    const newPhases = [...phases, {
      name: newPhaseName.trim(),
      description: newPhaseDescription.trim()
    }];
    
    setPhases(newPhases);
    updateWorkflow(newPhases);
    setNewPhaseName('');
    setNewPhaseDescription('');
  };

  // Remove phase
  const handleRemovePhase = (index: number) => {
    const newPhases = phases.filter((_, i) => i !== index);
    setPhases(newPhases);
    updateWorkflow(newPhases);
  };

  // Update phase
  const handleUpdatePhase = (index: number, field: 'name' | 'description', value: string) => {
    const newPhases = [...phases];
    newPhases[index] = { ...newPhases[index], [field]: value };
    setPhases(newPhases);
    updateWorkflow(newPhases);
  };

  // Apply template
  const handleApplyTemplate = () => {
    if (!selectedTemplate || !WORKFLOW_TEMPLATES[selectedTemplate as keyof typeof WORKFLOW_TEMPLATES]) {
      return;
    }

    const template = WORKFLOW_TEMPLATES[selectedTemplate as keyof typeof WORKFLOW_TEMPLATES];
    const templatePhases = Object.entries(template.phases).map(([name, description]) => ({
      name,
      description
    }));
    
    setPhases(templatePhases);
    updateWorkflow(templatePhases);
    setSelectedTemplate('');
  };

  // Clear all phases
  const handleClearAll = () => {
    setPhases([]);
    onChange({});
  };

  // Move phase up/down
  const handleMovePhase = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === phases.length - 1)
    ) {
      return;
    }

    const newPhases = [...phases];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newPhases[index], newPhases[targetIndex]] = [newPhases[targetIndex], newPhases[index]];
    
    setPhases(newPhases);
    updateWorkflow(newPhases);
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Agent Workflow
          {phases.length > 0 && (
            <Badge variant="secondary">
              {phases.length} phase{phases.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Template Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Workflow Templates</Label>
          <div className="flex gap-2">
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="flex-1 px-3 py-2 border border-input bg-background rounded-md text-sm"
            >
              <option value="">Select a template...</option>
              {Object.entries(WORKFLOW_TEMPLATES).map(([key, template]) => (
                <option key={key} value={key}>
                  {template.name}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyTemplate}
              disabled={!selectedTemplate}
            >
              <Copy className="h-4 w-4 mr-1" />
              Apply
            </Button>
          </div>
          {selectedTemplate && (
            <div className="text-xs text-muted-foreground">
              {Object.keys(WORKFLOW_TEMPLATES[selectedTemplate as keyof typeof WORKFLOW_TEMPLATES].phases).length} phases: {' '}
              {Object.keys(WORKFLOW_TEMPLATES[selectedTemplate as keyof typeof WORKFLOW_TEMPLATES].phases).join(', ')}
            </div>
          )}
        </div>

        {/* Current Workflow Phases */}
        {phases.length > 0 && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium">Workflow Phases</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            </div>
            
            <div className="space-y-3">
              {phases.map((phase, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {index + 1}
                    </Badge>
                    <Input
                      value={phase.name}
                      onChange={(e) => handleUpdatePhase(index, 'name', e.target.value)}
                      placeholder="Phase name"
                      className="flex-1"
                    />
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMovePhase(index, 'up')}
                        disabled={index === 0}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMovePhase(index, 'down')}
                        disabled={index === phases.length - 1}
                      >
                        ↓
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemovePhase(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={phase.description}
                    onChange={(e) => handleUpdatePhase(index, 'description', e.target.value)}
                    placeholder="Describe what happens in this phase..."
                    rows={2}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add New Phase */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Add New Phase</Label>
          <div className="space-y-2">
            <Input
              value={newPhaseName}
              onChange={(e) => setNewPhaseName(e.target.value)}
              placeholder="Phase name (e.g., setup, analysis, documentation)"
            />
            <Textarea
              value={newPhaseDescription}
              onChange={(e) => setNewPhaseDescription(e.target.value)}
              placeholder="Describe what the agent should do in this phase..."
              rows={2}
            />
            <Button
              onClick={handleAddPhase}
              disabled={!newPhaseName.trim() || !newPhaseDescription.trim()}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Phase
            </Button>
          </div>
        </div>

        {/* Workflow Preview */}
        {phases.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Workflow Preview</Label>
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="space-y-2">
                {phases.map((phase, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <Badge variant="secondary" className="mt-0.5">
                      {index + 1}
                    </Badge>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{phase.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {phase.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {phases.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <GitBranch className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No workflow phases defined</p>
            <p className="text-xs mt-1">
              Add phases to define the agent&apos;s execution workflow
            </p>
          </div>
        )}

        {/* Help Text */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>Workflow phases</strong> guide the agent through systematic execution steps. 
            Each phase should describe a specific stage of work with clear objectives.
            The agent will follow these phases in order during task execution.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default AgentWorkflowEditor;
