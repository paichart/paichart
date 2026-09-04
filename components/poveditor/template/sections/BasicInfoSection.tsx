"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { useTemplateEditor, useTemplateTypeOperations, useTemplateValidation } from '../context/TemplateEditorContext';

export default function BasicInfoSection() {
  const { setFieldValue } = useTemplateEditor();
  const { templateType } = useTemplateTypeOperations();
  const { getFieldErrors, hasFieldError } = useTemplateValidation();
  const { state } = useTemplateEditor();
  
  return (
    <div className="space-y-6">
      {/* Basic Template Information */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">
                Template Name
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="template-name"
                placeholder="Enter template name"
                value={state.data.name || ''}
                onChange={(e) => setFieldValue(['name'], e.target.value)}
                className={hasFieldError('name') ? 'border-destructive' : ''}
                disabled={state.ui.isSubmitting}
              />
              {hasFieldError('name') && (
                <p className="text-sm text-destructive">
                  {getFieldErrors('name')[0]}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="template-description">
                Description
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Textarea
                id="template-description"
                placeholder="Enter template description"
                value={state.data.description || ''}
                onChange={(e) => setFieldValue(['description'], e.target.value)}
                rows={4}
                className={hasFieldError('description') ? 'border-destructive' : ''}
                disabled={state.ui.isSubmitting}
              />
              {hasFieldError('description') ? (
                <p className="text-sm text-destructive">
                  {getFieldErrors('description')[0]}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Provide a clear description of what this template is for and when it should be used.
                </p>
              )}
            </div>

            {/* Template Version */}
            <div className="space-y-2">
              <Label htmlFor="template-version">Version</Label>
              <Input
                id="template-version"
                placeholder="1.0.0"
                value={state.data.version || ''}
                onChange={(e) => setFieldValue(['version'], e.target.value)}
                disabled={state.ui.isSubmitting}
              />
              <p className="text-sm text-muted-foreground">
                Version number for this template (e.g., 1.0.0, 2.1.0).
              </p>
            </div>

            {/* Template Tags */}
            <div className="space-y-2">
              <Label htmlFor="template-tags">Tags</Label>
              <Input
                id="template-tags"
                placeholder="Enter tags separated by commas"
                value={state.data.tags?.join(', ') || ''}
                onChange={(e) => {
                  const tags = e.target.value
                    .split(',')
                    .map(tag => tag.trim())
                    .filter(tag => tag.length > 0);
                  setFieldValue(['tags'], tags);
                }}
                disabled={state.ui.isSubmitting}
              />
              <p className="text-sm text-muted-foreground">
                Add tags to help categorize and find this template (e.g., security, networking, cloud).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Template Type Specific Information */}
      {templateType === 'pov' && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">POV Template Settings</h3>
              <p className="text-sm text-muted-foreground">
                This template will be used to create Proof of Value projects with custom fields and sections.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {templateType === 'phase' && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">Phase Template Settings</h3>
              <p className="text-sm text-muted-foreground">
                This template will be used to create project phases with predefined stages and tasks.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {templateType === 'agent' && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">Agent Template Settings</h3>
              <p className="text-sm text-muted-foreground">
                This template will be used to configure AI agents for automated tasks. Configure workflow integration, MCP tools, token management, security settings, and testing parameters using the specialized tabs above.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
