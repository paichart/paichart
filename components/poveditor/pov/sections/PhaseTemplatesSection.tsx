import React from 'react';
import { PhaseTemplateSelector } from '@/lib/pov/integration/phase-template-selector';
import { PhaseTemplate } from '@/lib/pov/phase-templates/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { X, GripVertical } from 'lucide-react';

interface PhaseTemplatesSectionProps {
  selectedTemplateIds: string[];
  phaseTemplates: PhaseTemplate[];
  onChange: (selectedIds: string[]) => void;
}

export function PhaseTemplatesSection({
  selectedTemplateIds,
  phaseTemplates,
  onChange
}: PhaseTemplatesSectionProps) {
  const handleRemoveTemplate = (templateId: string) => {
    onChange(selectedTemplateIds.filter(id => id !== templateId));
  };

  return (
    <div className="space-y-6">
      <PhaseTemplateSelector 
        selectedTemplateIds={selectedTemplateIds}
        onChange={onChange}
      />
      
      {selectedTemplateIds.length > 0 && (
        <div className="mt-8 border-t pt-6">
          <h3 className="text-lg font-medium mb-4">Selected Phase Templates</h3>
          <div className="space-y-2">
            {selectedTemplateIds.map((templateId) => {
              const template = phaseTemplates.find(t => t.id === templateId);
              return (
                <Card key={templateId} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-gray-400" />
                      <div>
                        <div className="font-medium">
                          {template?.name || `Template ${templateId}`}
                        </div>
                        {template?.description && (
                          <div className="text-sm text-gray-500">
                            {template.description}
                          </div>
                        )}
                      </div>
                      <Badge variant="secondary">{template?.type || 'Phase'}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveTemplate(templateId)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default PhaseTemplatesSection;
