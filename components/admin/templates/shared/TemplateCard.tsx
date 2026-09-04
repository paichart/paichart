"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { Eye, Edit, Trash2 } from 'lucide-react';

interface TemplateCardProps {
  template: any; // Will be PhaseTemplate | POVTemplate
  templateType: 'phase' | 'pov';
  onPreview: (template: any) => void;
  onEdit: (template: any) => void;
  onDelete: (templateId: string) => void;
  showSelection?: boolean;
  isSelected?: boolean;
  onSelectionChange?: (templateId: string, selected: boolean) => void;
}

export function TemplateCard({
  template,
  templateType,
  onPreview,
  onEdit,
  onDelete,
  showSelection = false,
  isSelected = false,
  onSelectionChange
}: TemplateCardProps) {
  
  const handleCardClick = () => {
    if (showSelection && onSelectionChange) {
      onSelectionChange(template.id, !isSelected);
    }
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  // Calculate stats based on template type
  const getTemplateStats = () => {
    if (templateType === 'phase') {
      const stageCount = template.stages?.length || 0;
      const taskCount = template.stages?.reduce((acc: number, stage: any) => 
        acc + (stage.tasks?.length || 0), 0) || 0;
      
      // Calculate agent stats (X/Y format)
      const agentTaskCount = template.stages?.reduce((acc: number, stage: any) => 
        acc + (stage.tasks?.filter((task: any) => task.agentRole).length || 0), 0) || 0;
      
      return {
        stages: stageCount,
        tasks: taskCount,
        agents: taskCount > 0 ? `${agentTaskCount}/${taskCount}` : '--'
      };
    } else {
      return {
        sections: template.sections?.length || 0,
        fields: Object.keys(template.fields || {}).length
      };
    }
  };

  const stats = getTemplateStats();

  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}
      onClick={handleCardClick}
    >
      <CardHeader className="relative">
        {showSelection && (
          <div className="absolute top-4 right-4">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => {}} // Handled by card click
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <CardTitle className="pr-8">{template.name}</CardTitle>
      </CardHeader>
      
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {template.description}
        </p>
        
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Template type specific badges */}
          {templateType === 'phase' ? (
            <>
              <Badge variant="outline">{template.type}</Badge>
              <Badge variant="outline">{stats.stages} stages</Badge>
              <Badge variant="outline">{stats.tasks} tasks</Badge>
              <Badge variant="outline">{stats.agents} agents</Badge>
              {template.isDefault && (
                <Badge variant="success">Default</Badge>
              )}
            </>
          ) : (
            <>
              {template.status && (
                <Badge variant={
                  template.status === 'published'
                    ? 'success'
                    : template.status === 'deprecated'
                    ? 'destructive'
                    : 'default'
                }>
                  {template.status.charAt(0).toUpperCase() + template.status.slice(1)}
                </Badge>
              )}
              <Badge variant="outline">{stats.sections} sections</Badge>
              <Badge variant="outline">{stats.fields} fields</Badge>
              {template.metadata?.tags && template.metadata.tags.length > 0 && (
                template.metadata.tags.slice(0, 2).map((tag: string) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))
              )}
              {template.metadata?.tags && template.metadata.tags.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{template.metadata.tags.length - 2}
                </Badge>
              )}
            </>
          )}
        </div>
        
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => handleActionClick(e, () => onPreview(template))}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => handleActionClick(e, () => onEdit(template))}
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-500 hover:text-red-700"
            onClick={(e) => handleActionClick(e, () => onDelete(template.id))}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default TemplateCard;
