"use client";

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { Eye, Edit, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

interface TemplateTableProps {
  templates: any[]; // Will be (PhaseTemplate | POVTemplate)[]
  templateType: 'phase' | 'pov';
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onPreview: (template: any) => void;
  onEdit: (template: any) => void;
  onDelete: (templateId: string) => void;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  onSort: (field: string) => void;
}

export function TemplateTable({
  templates,
  templateType,
  selectedIds,
  onSelectionChange,
  onPreview,
  onEdit,
  onDelete,
  sortField,
  sortDirection,
  onSort
}: TemplateTableProps) {
  
  const handleSelectAll = () => {
    if (selectedIds.length === templates.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(templates.map(t => t.id));
    }
  };

  const handleSelectOne = (templateId: string) => {
    if (selectedIds.includes(templateId)) {
      onSelectionChange(selectedIds.filter(id => id !== templateId));
    } else {
      onSelectionChange([...selectedIds, templateId]);
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="h-4 w-4 ml-1" /> : 
      <ChevronDown className="h-4 w-4 ml-1" />;
  };

  const formatDate = (date: string | Date) => {
    if (!date) return '--';
    return new Date(date).toLocaleDateString();
  };

  const getAgentStats = (template: any) => {
    if (templateType !== 'phase') return '--';
    
    const taskCount = template.stages?.reduce((acc: number, stage: any) => 
      acc + (stage.tasks?.length || 0), 0) || 0;
    
    const agentTaskCount = template.stages?.reduce((acc: number, stage: any) => 
      acc + (stage.tasks?.filter((task: any) => task.agentRole).length || 0), 0) || 0;
    
    return taskCount > 0 ? `${agentTaskCount}/${taskCount}` : '--';
  };

  const getStatusBadge = (status: string) => {
    const variant = status === 'published' ? 'success' :
                   status === 'deprecated' ? 'destructive' : 'default';
    return (
      <Badge variant={variant}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const renderPhaseTemplateRow = (template: any) => (
    <>
      <td className="px-4 py-3">
        <Checkbox
          checked={selectedIds.includes(template.id)}
          onCheckedChange={() => handleSelectOne(template.id)}
        />
      </td>
      <td className="px-4 py-3 font-medium">{template.name}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
        {template.description}
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline">{template.type}</Badge>
      </td>
      <td className="px-4 py-3 text-center">{template.stages?.length || 0}</td>
      <td className="px-4 py-3 text-center">
        {template.stages?.reduce((acc: number, stage: any) => 
          acc + (stage.tasks?.length || 0), 0) || 0}
      </td>
      <td className="px-4 py-3 text-center">{getAgentStats(template)}</td>
      <td className="px-4 py-3">
        {template.isDefault ? (
          <Badge variant="success">Default</Badge>
        ) : (
          <Badge variant="outline">Active</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {formatDate(template.updatedAt)}
      </td>
    </>
  );

  const renderPOVTemplateRow = (template: any) => (
    <>
      <td className="px-4 py-3">
        <Checkbox
          checked={selectedIds.includes(template.id)}
          onCheckedChange={() => handleSelectOne(template.id)}
        />
      </td>
      <td className="px-4 py-3 font-medium">{template.name}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
        {template.description}
      </td>
      <td className="px-4 py-3">
        {template.status ? getStatusBadge(template.status) : '--'}
      </td>
      <td className="px-4 py-3 text-center">{template.sections?.length || 0}</td>
      <td className="px-4 py-3 text-center">
        {Object.keys(template.fields || {}).length}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {template.metadata?.tags?.slice(0, 2).map((tag: string) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {template.metadata?.tags?.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{template.metadata.tags.length - 2}
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {formatDate(template.updatedAt)}
      </td>
    </>
  );

  const phaseColumns = [
    { key: 'select', label: '', sortable: false },
    { key: 'name', label: 'Name', sortable: true },
    { key: 'description', label: 'Description', sortable: false },
    { key: 'type', label: 'Type', sortable: true },
    { key: 'stages', label: 'Stages', sortable: true },
    { key: 'tasks', label: 'Tasks', sortable: true },
    { key: 'agents', label: 'Agents', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'updatedAt', label: 'Last Modified', sortable: true },
    { key: 'actions', label: 'Actions', sortable: false }
  ];

  const povColumns = [
    { key: 'select', label: '', sortable: false },
    { key: 'name', label: 'Name', sortable: true },
    { key: 'description', label: 'Description', sortable: false },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'sections', label: 'Sections', sortable: true },
    { key: 'fields', label: 'Fields', sortable: true },
    { key: 'tags', label: 'Tags', sortable: false },
    { key: 'updatedAt', label: 'Last Modified', sortable: true },
    { key: 'actions', label: 'Actions', sortable: false }
  ];

  const columns = templateType === 'phase' ? phaseColumns : povColumns;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse bg-card rounded-lg shadow-sm border border-border">
        <thead className="bg-muted sticky top-0">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3 text-left text-sm font-medium text-muted-foreground border-b border-border ${
                  column.sortable ? 'cursor-pointer hover:bg-accent' : ''
                }`}
                onClick={column.sortable ? () => onSort(column.key) : undefined}
              >
                {column.key === 'select' ? (
                  <Checkbox
                    checked={selectedIds.length === templates.length && templates.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                ) : (
                  <div className="flex items-center">
                    {column.label}
                    {column.sortable && getSortIcon(column.key)}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {templates.map((template, index) => (
            <tr
              key={template.id}
              className={`hover:bg-accent/50 ${
                index % 2 === 0 ? 'bg-card' : 'bg-muted/30'
              }`}
            >
              {templateType === 'phase' 
                ? renderPhaseTemplateRow(template)
                : renderPOVTemplateRow(template)
              }
              <td className="px-4 py-3">
                <div className="flex space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onPreview(template)}
                    className="h-8 w-8 p-0"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(template)}
                    className="h-8 w-8 p-0"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(template.id)}
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {templates.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No templates found
        </div>
      )}
    </div>
  );
}

export default TemplateTable;
