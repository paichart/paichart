"use client";

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { 
  CheckCircle, 
  AlertCircle, 
  FileText, 
  Hash, 
  Calendar, 
  Mail, 
  Phone, 
  Link, 
  DollarSign,
  ToggleLeft,
  List,
  Type,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { FieldDefinition, SectionDefinition } from '@/lib/pov/templates/types';

interface DynamicFieldsWizardSectionProps {
  fields: FieldDefinition[];
  sections?: SectionDefinition[];
  formData: Record<string, any>;
  onChange: (fieldId: string, value: any) => void;
  showProgress?: boolean;
  showSectionGrouping?: boolean;
  validationErrors?: Record<string, string>;
}

export default function DynamicFieldsWizardSection({
  fields,
  sections = [],
  formData,
  onChange,
  showProgress = true,
  showSectionGrouping = true,
  validationErrors = {}
}: DynamicFieldsWizardSectionProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  
  // Calculate progress
  const totalRequiredFields = fields.filter(field => field.required).length;
  const completedRequiredFields = fields.filter(field => {
    if (!field.required) return true;
    const value = formData[field.label];
    return value !== undefined && value !== null && value !== '';
  }).length;
  const progressPercentage = totalRequiredFields > 0 ? (completedRequiredFields / totalRequiredFields) * 100 : 100;
  
  // Get field icon based on type
  const getFieldIcon = (type: string) => {
    switch (type) {
      case 'text': return <Type className="h-4 w-4" />;
      case 'textarea': return <FileText className="h-4 w-4" />;
      case 'number': return <Hash className="h-4 w-4" />;
      case 'date': return <Calendar className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'phone': return <Phone className="h-4 w-4" />;
      case 'url': return <Link className="h-4 w-4" />;
      case 'currency': return <DollarSign className="h-4 w-4" />;
      case 'boolean': return <ToggleLeft className="h-4 w-4" />;
      case 'select':
      case 'multiselect': return <List className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };
  
  // Validate field value
  const validateField = (field: FieldDefinition, value: any): string | null => {
    if (field.required && (value === undefined || value === null || value === '')) {
      return `${field.label} is required`;
    }
    
    if (field.validation) {
      const validation = field.validation;
      
      if (validation.min !== undefined && typeof value === 'number' && value < validation.min) {
        return `${field.label} must be at least ${validation.min}`;
      }
      
      if (validation.max !== undefined && typeof value === 'number' && value > validation.max) {
        return `${field.label} must be at most ${validation.max}`;
      }
      
      if (validation.pattern && typeof value === 'string') {
        try {
          // BC37 FIX: Guard against ReDoS from malformed patterns
          if (validation.pattern.length <= 500 && new RegExp(validation.pattern).test(value) === false) {
            return `${field.label} format is invalid`;
          }
        } catch {
          // Invalid regex pattern — skip validation rather than crash
        }
      }
    }
    
    return null;
  };
  
  // Toggle section collapse
  const toggleSection = (sectionId: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(sectionId)) {
      newCollapsed.delete(sectionId);
    } else {
      newCollapsed.add(sectionId);
    }
    setCollapsedSections(newCollapsed);
  };
  
  // Group fields by section if sections are provided
  type GroupedField = {
    section: SectionDefinition | null;
    fields: FieldDefinition[];
  };
  
  const groupedFields: GroupedField[] = showSectionGrouping && sections.length > 0 
    ? sections.map(section => ({
        section,
        fields: fields.filter(field => section.fields?.includes(field.label))
      })).filter(group => group.fields.length > 0)
    : [{ section: null, fields }];
  
  // Add ungrouped fields if using sections
  if (showSectionGrouping && sections.length > 0) {
    const groupedFieldIds = new Set(
      groupedFields.flatMap(group => group.fields.map(field => field.label))
    );
    const ungroupedFields = fields.filter(field => !groupedFieldIds.has(field.label));
    
    if (ungroupedFields.length > 0) {
      groupedFields.push({
        section: { id: 'ungrouped', title: 'Other Fields', description: '', fields: [] } as SectionDefinition,
        fields: ungroupedFields
      });
    }
  }
  
  // Render field component
  const renderField = (field: FieldDefinition) => {
    const fieldId = field.label;
    const value = formData[fieldId];
    const error = validationErrors[fieldId] || validateField(field, value);
    const hasError = !!error;
    const isCompleted = field.required ? (value !== undefined && value !== null && value !== '') : true;
    
    return (
      <div key={fieldId} className="space-y-2">
        <div className="flex items-center gap-2">
          {getFieldIcon(field.type)}
          <Label 
            htmlFor={fieldId} 
            className={`block text-sm font-medium ${hasError ? 'text-red-600' : 'text-gray-700'}`}
          >
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {isCompleted && !hasError && (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )}
          {hasError && (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
        </div>
        
        {field.description && (
          <p className="text-sm text-muted-foreground mb-2">{field.description}</p>
        )}
        
        <div className={`${hasError ? 'ring-2 ring-red-500 rounded' : ''}`}>
          {field.type === 'text' && (
            <Input
              id={fieldId}
              placeholder={field.placeholder}
              value={value || ''}
              onChange={(e) => onChange(fieldId, e.target.value)}
              required={field.required}
            />
          )}
          
          {field.type === 'textarea' && (
            <Textarea
              id={fieldId}
              placeholder={field.placeholder}
              value={value || ''}
              onChange={(e) => onChange(fieldId, e.target.value)}
              rows={4}
              required={field.required}
            />
          )}
          
          {field.type === 'number' && (
            <Input
              id={fieldId}
              type="number"
              placeholder={field.placeholder}
              value={value || ''}
              onChange={(e) => onChange(fieldId, parseFloat(e.target.value))}
              required={field.required}
              min={field.validation?.min}
              max={field.validation?.max}
            />
          )}
          
          {field.type === 'select' && (
            <Select
              value={value || ''}
              onValueChange={(newValue) => onChange(fieldId, newValue)}
            >
              <SelectTrigger>
                <SelectValue placeholder={field.placeholder || "Select an option"} />
              </SelectTrigger>
              <SelectContent>
                {field.validation?.options?.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {field.type === 'multiselect' && (
            <div className="space-y-2 border rounded p-3">
              {field.validation?.options?.map(option => (
                <div key={option.value} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`${fieldId}-${option.value}`}
                    checked={Array.isArray(value) && value.includes(option.value)}
                    onChange={(e) => {
                      const currentValues = Array.isArray(value) ? [...value] : [];
                      if (e.target.checked) {
                        onChange(fieldId, [...currentValues, option.value]);
                      } else {
                        onChange(fieldId, currentValues.filter(v => v !== option.value));
                      }
                    }}
                    className="rounded"
                  />
                  <Label htmlFor={`${fieldId}-${option.value}`} className="text-sm">
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          )}
          
          {field.type === 'date' && (
            <DatePicker
              value={value ? new Date(value) : undefined}
              onChange={(date) => onChange(fieldId, date)}
            />
          )}
          
          {field.type === 'boolean' && (
            <div className="flex items-center space-x-2">
              <Switch
                id={fieldId}
                checked={!!value}
                onCheckedChange={(checked) => onChange(fieldId, checked)}
              />
              <Label htmlFor={fieldId}>{field.placeholder || "Enable"}</Label>
            </div>
          )}
          
          {field.type === 'email' && (
            <Input
              id={fieldId}
              type="email"
              placeholder={field.placeholder}
              value={value || ''}
              onChange={(e) => onChange(fieldId, e.target.value)}
              required={field.required}
            />
          )}
          
          {field.type === 'phone' && (
            <Input
              id={fieldId}
              type="tel"
              placeholder={field.placeholder}
              value={value || ''}
              onChange={(e) => onChange(fieldId, e.target.value)}
              required={field.required}
            />
          )}
          
          {field.type === 'url' && (
            <Input
              id={fieldId}
              type="url"
              placeholder={field.placeholder}
              value={value || ''}
              onChange={(e) => onChange(fieldId, e.target.value)}
              required={field.required}
            />
          )}
          
          {field.type === 'currency' && (
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-500">$</span>
              <Input
                id={fieldId}
                type="number"
                step="0.01"
                placeholder={field.placeholder}
                value={value || ''}
                onChange={(e) => onChange(fieldId, parseFloat(e.target.value))}
                required={field.required}
                className="pl-7"
              />
            </div>
          )}
        </div>
        
        {hasError && (
          <Alert variant="destructive" className="mt-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  };
  
  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      {showProgress && totalRequiredFields > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Completion Progress</span>
                <span className="text-sm text-muted-foreground">
                  {completedRequiredFields} of {totalRequiredFields} required fields
                </span>
              </div>
              <Progress value={progressPercentage} className="w-full" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Required fields completed</span>
                <span>{Math.round(progressPercentage)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Grouped fields */}
      {groupedFields.map((group, groupIndex) => {
        const sectionId = group.section?.id || 'default';
        const isCollapsed = collapsedSections.has(sectionId);
        const sectionRequiredFields = group.fields.filter(f => f.required).length;
        const sectionCompletedFields = group.fields.filter(f => {
          if (!f.required) return true;
          const value = formData[f.label];
          return value !== undefined && value !== null && value !== '';
        }).length;
        
        if (group.section) {
          return (
            <Card key={sectionId}>
              <CardHeader 
                className="cursor-pointer"
                onClick={() => toggleSection(sectionId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    <CardTitle className="text-lg">{group.section.title}</CardTitle>
                    {sectionRequiredFields > 0 && (
                      <Badge variant={sectionCompletedFields === group.fields.length ? "default" : "secondary"}>
                        {sectionCompletedFields}/{sectionRequiredFields} required
                      </Badge>
                    )}
                  </div>
                  {sectionCompletedFields === group.fields.length && sectionRequiredFields > 0 && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                </div>
                {group.section.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {group.section.description}
                  </p>
                )}
              </CardHeader>
              {!isCollapsed && (
                <CardContent className="space-y-4">
                  {group.fields.map(renderField)}
                </CardContent>
              )}
            </Card>
          );
        } else {
          return (
            <div key={groupIndex} className="space-y-4">
              {group.fields.map(renderField)}
            </div>
          );
        }
      })}
      
      {/* Summary */}
      {fields.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No fields to display for this template.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
