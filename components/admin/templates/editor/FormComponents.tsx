"use client";

import React, { ReactNode } from 'react';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { X, Plus, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';

// Form Field Container
interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  helpText?: string;
  error?: string;
  children: ReactNode;
}

export function FormField({ id, label, required, helpText, error, children }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className={required ? 'after:content-["*"] after:ml-0.5 after:text-red-500' : ''}>
          {label}
        </Label>
        {helpText && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-gray-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs text-sm">{helpText}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {helpText && !error && <p className="text-xs text-gray-500">{helpText}</p>}
    </div>
  );
}

// Text Input Field
interface TextInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  error?: string;
  maxLength?: number;
}

export function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  helpText,
  error,
  maxLength
}: TextInputProps) {
  return (
    <FormField id={id} label={label} required={required} helpText={helpText} error={error}>
      <Input
        id={id}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className={error ? 'border-red-500 focus-visible:ring-red-500' : ''}
      />
      {maxLength && (
        <div className="flex justify-end">
          <span className="text-xs text-gray-500">
            {value ? value.length : 0}/{maxLength}
          </span>
        </div>
      )}
    </FormField>
  );
}

// Text Area Field
interface TextAreaProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  error?: string;
  rows?: number;
  maxLength?: number;
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  helpText,
  error,
  rows = 4,
  maxLength
}: TextAreaProps) {
  return (
    <FormField id={id} label={label} required={required} helpText={helpText} error={error}>
      <Textarea
        id={id}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        rows={rows}
        maxLength={maxLength}
        className={error ? 'border-red-500 focus-visible:ring-red-500' : ''}
      />
      {maxLength && (
        <div className="flex justify-end">
          <span className="text-xs text-gray-500">
            {value ? value.length : 0}/{maxLength}
          </span>
        </div>
      )}
    </FormField>
  );
}

// Select Field
interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  error?: string;
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  helpText,
  error
}: SelectFieldProps) {
  return (
    <FormField id={id} label={label} required={required} helpText={helpText} error={error}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className={error ? 'border-red-500 focus-visible:ring-red-500' : ''}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

// Switch Field
interface SwitchFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  helpText?: string;
  error?: string;
}

export function SwitchField({
  id,
  label,
  checked,
  onChange,
  helpText,
  error
}: SwitchFieldProps) {
  return (
    <div className="flex items-center justify-between space-x-2">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        {helpText && <p className="text-xs text-gray-500">{helpText}</p>}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );
}

// Tags Input Field
interface TagsInputProps {
  id: string;
  label: string;
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  placeholder?: string;
  helpText?: string;
  error?: string;
}

export function TagsInput({
  id,
  label,
  tags,
  onAddTag,
  onRemoveTag,
  placeholder,
  helpText,
  error
}: TagsInputProps) {
  const [inputValue, setInputValue] = React.useState('');

  const handleAddTag = () => {
    if (inputValue.trim()) {
      onAddTag(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <FormField id={id} label={label} helpText={helpText} error={error}>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags && tags.map((tag) => (
          <Badge key={tag} variant="outline" className="flex items-center gap-1">
            {tag}
            <button
              type="button"
              onClick={() => onRemoveTag(tag)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={14} />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder || "Add a tag"}
          className={error ? 'border-red-500 focus-visible:ring-red-500' : ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddTag();
            }
          }}
        />
        <Button type="button" onClick={handleAddTag} size="sm">
          <Plus size={16} />
        </Button>
      </div>
    </FormField>
  );
}

// Form Section
interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <div className="space-y-4 border rounded-md p-4">
      <div>
        <h3 className="text-lg font-medium">{title}</h3>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

// Form Grid
interface FormGridProps {
  children: ReactNode;
  columns?: number;
}

export function FormGrid({ children, columns = 2 }: FormGridProps) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-${columns} gap-6`}>
      {children}
    </div>
  );
}