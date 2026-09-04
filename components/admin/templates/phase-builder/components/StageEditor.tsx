import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { Stage } from '../types';

interface StageEditorProps {
  stage: Omit<Stage, 'id' | 'tasks'>;
  isNew?: boolean;
  onCancel: () => void;
  onSave: (stage: Omit<Stage, 'id' | 'tasks'>) => void;
  onInteraction?: () => void; // Optional callback for when the user interacts with the form
}

export function StageEditor({ 
  stage, 
  isNew = false,
  onCancel,
  onSave,
  onInteraction
}: StageEditorProps) {
  const [localStage, setLocalStage] = useState<Omit<Stage, 'id' | 'tasks'>>({ ...stage });
  
  const updateLocalStage = (updates: Partial<Omit<Stage, 'id' | 'tasks'>>) => {
    setLocalStage(prev => ({ ...prev, ...updates }));
    if (onInteraction) {
      onInteraction();
    }
  };
  
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{isNew ? 'Add New Stage' : `Edit Stage: ${stage.name}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="stage-name">Stage Name</Label>
          <Input
            id="stage-name"
            value={localStage.name}
            onChange={(e) => updateLocalStage({ name: e.target.value })}
            placeholder="Enter stage name"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="stage-description">Description</Label>
          <Textarea
            id="stage-description"
            value={localStage.description}
            onChange={(e) => updateLocalStage({ description: e.target.value })}
            placeholder="Enter stage description"
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
            onClick={() => onSave(localStage)}
            disabled={!localStage.name.trim()}
          >
            {isNew ? 'Add Stage' : 'Update Stage'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
