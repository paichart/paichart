"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { SectionEditorProps } from '../types';
import { SectionDefinition } from '@/lib/pov/templates/types';

/**
 * Section editor component for the sections wizard
 */
export function SectionEditor({ 
  section, 
  isNew = false,
  onCancel,
  onSave
}: SectionEditorProps) {
  const [localSection, setLocalSection] = useState<SectionDefinition>({ ...section });
  
  const updateLocalSection = (updates: Partial<SectionDefinition>) => {
    setLocalSection(prev => ({ ...prev, ...updates }));
  };
  
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{isNew ? 'Add New Section' : `Edit Section: ${section.title}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="section-title">Section Title</Label>
          <Input
            id="section-title"
            value={localSection.title}
            onChange={(e) => updateLocalSection({ title: e.target.value })}
            placeholder="Enter section title"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="section-description">Description</Label>
          <Textarea
            id="section-description"
            value={localSection.description || ''}
            onChange={(e) => updateLocalSection({ description: e.target.value })}
            placeholder="Enter section description"
          />
        </div>
        
        <div className="flex justify-end space-x-2 pt-4">
          <Button
            variant="outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onSave(localSection)}
            disabled={!localSection.title.trim()}
          >
            {isNew ? 'Add Section' : 'Update Section'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}