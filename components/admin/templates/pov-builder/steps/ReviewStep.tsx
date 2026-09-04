"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { FieldDefinition, SectionDefinition } from '@/lib/pov/templates/types';

interface ReviewStepProps {
  name: string;
  description: string;
  tags: string[];
  fields: Record<string, FieldDefinition>;
  sections: SectionDefinition[];
}

export function ReviewStep({ name, description, tags, fields, sections }: ReviewStepProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Template Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">{name}</h3>
            <p className="text-muted-foreground mt-1">{description || 'No description provided'}</p>
            
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
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
                <div key={fieldId} className="border rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{field.label}</h4>
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
                <div key={section.id} className="border rounded-md p-4">
                  <h4 className="font-medium">{section.title}</h4>
                  {section.description && (
                    <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                  )}
                  
                  <div className="mt-3">
                    <h5 className="text-sm font-medium mb-2">Fields in this section:</h5>
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
    </div>
  );
}

export default ReviewStep;