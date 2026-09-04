"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { FieldDefinition, SectionDefinition } from '@/lib/pov/templates/types';
import { 
  useTemplateData, 
  useTemplateTypeOperations, 
  usePovTemplateOperations, 
  useTemplateValidation,
  useTemplateSave 
} from '../context/TemplateEditorContext';

// Phase template interface for fetched data
interface PhaseTemplate {
  id: string;
  name: string;
  description: string;
  type: 'PLANNING' | 'EXECUTION' | 'REVIEW';
}

// Separate component for POV-specific content to avoid conditional hook calls
function PovTemplateContent() {
  const { fields, sections } = usePovTemplateOperations();
  const templateData = useTemplateData();
  
  // Get phase template IDs with stable reference
  const phaseTemplateIds = useMemo(() => {
    return templateData.phaseTemplateIds || [];
  }, [templateData.phaseTemplateIds]);
  
  // State for fetched phase templates
  const [phaseTemplates, setPhaseTemplates] = useState<PhaseTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  
  // Fetch phase template details when IDs change
  useEffect(() => {
    if (phaseTemplateIds.length === 0) {
      setPhaseTemplates([]);
      return;
    }
    
    const fetchPhaseTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const response = await fetch('/api/phase-templates');
        if (response.ok) {
          const allTemplates = await response.json();
          // Filter to only include selected templates
          const selectedTemplates = allTemplates.filter((template: PhaseTemplate) => 
            phaseTemplateIds.includes(template.id)
          );
          setPhaseTemplates(selectedTemplates);
        }
      } catch {
        // Could not fetch phase templates
      } finally {
        setLoadingTemplates(false);
      }
    };
    
    fetchPhaseTemplates();
  }, [phaseTemplateIds]);
  
  return (
    <>
      {/* Fields Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Fields ({Object.keys(fields).length})</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(fields).length === 0 ? (
            <p className="text-muted-foreground">No fields defined</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(fields).map(([fieldId, field]) => (
                <div key={fieldId} className="border border-border rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-foreground">{field.label}</h4>
                    <Badge variant="outline">{field.type}</Badge>
                  </div>
                  {field.description && (
                    <p className="text-sm text-muted-foreground mt-1">{field.description}</p>
                  )}
                  {field.required && (
                    <Badge variant="secondary" className="mt-2 text-xs">Required</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Sections Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Sections ({sections.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {sections.length === 0 ? (
            <p className="text-muted-foreground">No sections defined</p>
          ) : (
            <div className="space-y-4">
              {sections.map(section => (
                <div key={section.id} className="border border-border rounded-md p-4">
                  <h4 className="font-medium text-foreground">{section.title}</h4>
                  {section.description && (
                    <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                  )}
                  
                  <div className="mt-3">
                    <h5 className="text-sm font-medium text-foreground mb-2">Fields in this section:</h5>
                    {section.fields.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No fields assigned</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {section.fields.map(fieldId => {
                          const field = fields[fieldId];
                          if (!field) return null;
                          
                          return (
                            <Badge key={fieldId} variant="outline">
                              {field.label}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Phase Templates Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Phase Templates ({phaseTemplateIds.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {phaseTemplateIds.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-muted-foreground mb-2">No phase templates selected</p>
              <p className="text-sm text-muted-foreground">
                POVs created from this template will not have predefined phases
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-3">
                The following phase templates will be automatically applied when POVs are created from this template:
              </p>
              {loadingTemplates ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">Loading template details...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {phaseTemplateIds.map((templateId, index) => {
                    const template = phaseTemplates.find(t => t.id === templateId);
                    return (
                      <div key={templateId} className="border border-border rounded-md p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="text-xs">
                              #{index + 1}
                            </Badge>
                            <span className="font-medium text-foreground text-sm">
                              {template?.name || 'Phase Template'}
                            </span>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            ID: {templateId.slice(-8)}
                          </Badge>
                        </div>
                        {template?.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {template.description}
                          </p>
                        )}
                        {!template && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Template ID: {templateId}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-md">
                <p className="text-sm text-primary">
                  <strong>Note:</strong> When a POV is created from this template, these {phaseTemplateIds.length} phase template{phaseTemplateIds.length !== 1 ? 's' : ''} will be automatically applied to provide a structured workflow.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function ReviewSection() {
  const templateData = useTemplateData();
  const { templateType } = useTemplateTypeOperations();
  const { saveTemplate, canSave, isSubmitting } = useTemplateSave();
  const { isValid, hasErrors, validationErrors } = useTemplateValidation();
  
  // Get template-specific data
  const { name, description, version, tags } = templateData;
  
  // Get validation status
  const getValidationStatus = (condition: boolean, successMessage: string, errorMessage: string) => {
    return {
      isValid: condition,
      message: condition ? successMessage : errorMessage,
      icon: condition ? CheckCircle : XCircle,
      color: condition ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
      bgColor: condition ? 'bg-green-600 dark:bg-green-400' : 'bg-red-600 dark:bg-red-400'
    };
  };
  
  // Basic validation checks
  const validationChecks = [
    getValidationStatus(
      !!name?.trim(),
      'Template has a name',
      'Template name is required'
    ),
    getValidationStatus(
      !!description?.trim(),
      'Template has a description',
      'Template description is recommended'
    ),
  ];
  
  const handleSave = async () => {
    try {
      await saveTemplate();
    } catch {
      // Failed to save template
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Template Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Template Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-lg font-medium text-foreground">{name || 'Untitled Template'}</h3>
            <p className="text-muted-foreground mt-1">{description || 'No description provided'}</p>
          </div>
          
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-2">
              <span className="text-muted-foreground">Type:</span>
              <Badge variant="outline" className="capitalize">
                {templateType} Template
              </Badge>
            </div>
            
            {version && (
              <div className="flex items-center space-x-2">
                <span className="text-muted-foreground">Version:</span>
                <Badge variant="outline">{version}</Badge>
              </div>
            )}
          </div>
          
          {tags && tags.length > 0 && (
            <div>
              <span className="text-sm text-muted-foreground mr-2">Tags:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* POV Template Specific Content */}
      {templateType === 'pov' && <PovTemplateContent />}
      
      {/* Phase Template Specific Content */}
      {templateType === 'phase' && (
        <Card>
          <CardHeader>
            <CardTitle>Phase Template Structure</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Phase template configuration will be displayed here once phase template sections are implemented.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Agent Template Specific Content */}
      {templateType === 'agent' && (
        <>
          {/* Agent Configuration Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Agent Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              {templateData.agentConfig ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-foreground">Default Role</h4>
                      <p className="text-sm text-muted-foreground">
                        {templateData.agentConfig.defaultRole || 'Not specified'}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">Category</h4>
                      <Badge variant="outline" className="capitalize">
                        {templateData.agentConfig.category || 'General'}
                      </Badge>
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">Priority</h4>
                      <Badge variant="outline">
                        {templateData.agentConfig.priority || 'Medium'}
                      </Badge>
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">Timeout</h4>
                      <p className="text-sm text-muted-foreground">
                        {templateData.agentConfig.timeout || 300} seconds
                      </p>
                    </div>
                  </div>

                  {/* Capabilities */}
                  {templateData.agentConfig.capabilities && Object.keys(templateData.agentConfig.capabilities).length > 0 && (
                    <div>
                      <h4 className="font-medium text-foreground mb-3">Capabilities</h4>
                      <div className="space-y-3">
                        {Object.entries(templateData.agentConfig.capabilities).map(([category, items]: [string, any]) => (
                          <div key={category}>
                            <h5 className="text-sm font-medium text-foreground capitalize mb-2">{category}</h5>
                            <div className="flex flex-wrap gap-1">
                              {Array.isArray(items) ? items.map((item: string, index: number) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {item}
                                </Badge>
                              )) : (
                                <Badge variant="secondary" className="text-xs">
                                  {String(items)}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Constraints */}
                  {templateData.agentConfig.constraints && Object.keys(templateData.agentConfig.constraints).length > 0 && (
                    <div>
                      <h4 className="font-medium text-foreground mb-3">Constraints</h4>
                      <div className="space-y-2">
                        {Object.entries(templateData.agentConfig.constraints).map(([key, value]: [string, any]) => (
                          <div key={key} className="border border-border rounded-md p-3">
                            <h5 className="text-sm font-medium text-foreground">{key}</h5>
                            <p className="text-sm text-muted-foreground mt-1">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {templateData.agentConfig.tags && templateData.agentConfig.tags.length > 0 && (
                    <div>
                      <h4 className="font-medium text-foreground mb-2">Agent Tags</h4>
                      <div className="flex flex-wrap gap-1">
                        {templateData.agentConfig.tags.map((tag: string, index: number) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">No agent configuration defined</p>
              )}
            </CardContent>
          </Card>

          {/* Agent Metadata Summary */}
          {(templateData as any).metadata && (
            <Card>
              <CardHeader>
                <CardTitle>Advanced Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(templateData as any).metadata?.workflowIntegration && (
                    <div>
                      <h4 className="font-medium text-foreground">Workflow Integration</h4>
                      <p className="text-sm text-muted-foreground">
                        Mode: {(templateData as any).metadata.workflowIntegration.participationMode || 'executor'}
                      </p>
                    </div>
                  )}
                  
                  {(templateData as any).metadata?.tokenManagement && (
                    <div>
                      <h4 className="font-medium text-foreground">Token Management</h4>
                      <p className="text-sm text-muted-foreground">
                        Max per request: {(templateData as any).metadata.tokenManagement.budgetLimits?.maxPerRequest || 4000} tokens
                      </p>
                    </div>
                  )}
                  
                  {(templateData as any).metadata?.mcpToolConfiguration && (
                    <div>
                      <h4 className="font-medium text-foreground">MCP Tools</h4>
                      <p className="text-sm text-muted-foreground">
                        {(templateData as any).metadata.mcpToolConfiguration.selectedTools?.length || 0} tools configured
                      </p>
                    </div>
                  )}
                  
                  {(templateData as any).metadata?.securityConfiguration && (
                    <div>
                      <h4 className="font-medium text-foreground">Security</h4>
                      <p className="text-sm text-muted-foreground">
                        Access level: {(templateData as any).metadata.securityConfiguration.dataAccessLevel || 'public'}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
      
      {/* Validation Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span>Validation Status</span>
            {isValid ? (
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {validationChecks.map((check, index) => {
              const IconComponent = check.icon;
              return (
                <div key={index} className="flex items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 ${check.bgColor}`}>
                    <IconComponent className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{check.message}</p>
                  </div>
                </div>
              );
            })}
            
            {/* Show validation errors if any */}
            {hasErrors && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <h5 className="text-sm font-medium text-destructive mb-2">Validation Errors:</h5>
                <ul className="text-sm text-destructive space-y-1">
                  {Object.entries(validationErrors).map(([field, errors]) => (
                    <li key={field}>
                      <strong>{field}:</strong> {errors.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Save Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Save Template</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {isValid 
                  ? 'Your template is ready to be saved.' 
                  : 'Please fix validation issues before saving.'}
              </p>
            </div>
            <Button 
              onClick={handleSave}
              disabled={!canSave || isSubmitting}
              className="min-w-[120px]"
            >
              {isSubmitting ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
