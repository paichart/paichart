"use client";

import { useState } from 'react';
import { useEditorContext } from '../context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/lib/hooks/useToast';
import { POVStatus, Priority } from '@prisma/client';
import { format } from 'date-fns';
import { X, AlertTriangle } from 'lucide-react';
import { toLocalYmd, fromLocalYmd } from '@/lib/utils/local-date';

// SECURITY: Tag validation constants
const MAX_TAG_LENGTH = 50;
const MAX_TAGS_PER_POV = 20;
const TAG_PATTERN = /^[a-zA-Z0-9-_\s]+$/;
const BLACKLISTED_TAGS = [
  'spam', 'test', 'xxx', 'admin', 'system', 'internal', 'confidential'
] as const;

// TYPE SAFETY: Discriminated union for validation results
type ValidationSuccess = { valid: true; sanitized: string };
type ValidationError = { valid: false; error: string };
type ValidationResult = ValidationSuccess | ValidationError;

// SECURITY: Tag validation and sanitization function
function validateAndSanitizeTag(
  input: string,
  existingTags: string[]
): ValidationResult {
  const trimmed = input.trim();

  // 1. Empty check
  if (!trimmed) {
    return { valid: false, error: 'Tag cannot be empty' };
  }

  // 2. Length validation
  if (trimmed.length > MAX_TAG_LENGTH) {
    return { valid: false, error: `Tag too long (max ${MAX_TAG_LENGTH} characters)` };
  }

  // 3. Count validation
  if (existingTags.length >= MAX_TAGS_PER_POV) {
    return { valid: false, error: `Maximum ${MAX_TAGS_PER_POV} tags allowed` };
  }

  // 4. Format validation
  if (!TAG_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: 'Tags can only contain letters, numbers, dashes, underscores, and spaces'
    };
  }

  // 5. Sanitization
  const sanitized = trimmed
    .replace(/\s+/g, '-')  // Normalize spaces to dashes
    .replace(/[^a-zA-Z0-9-_]/g, '')  // Remove special chars
    .toLowerCase()  // Normalize case
    .slice(0, MAX_TAG_LENGTH);  // Enforce length

  if (!sanitized) {
    return { valid: false, error: 'Tag is empty after sanitization' };
  }

  // 6. Blacklist check
  if (BLACKLISTED_TAGS.includes(sanitized as any)) {
    return { valid: false, error: 'This tag is reserved and cannot be used' };
  }

  // 7. Duplicate check (case-insensitive)
  if (existingTags.map(t => t.toLowerCase()).includes(sanitized)) {
    return { valid: false, error: 'Tag already exists' };
  }

  return { valid: true, sanitized };
}

// TagsSection Component - Handles tag input and display with security
interface TagsSectionProps {
  data: any;
  updateField: (path: string[], value: any) => void;
}

function TagsSection({ data, updateField }: TagsSectionProps) {
  const [inputValue, setInputValue] = useState('');
  const tags = (data as any).tags || [];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      const result = validateAndSanitizeTag(inputValue, tags);

      if (!result.valid) {
        toast({
          title: 'Invalid Tag',
          description: result.error,  // Type-safe - error guaranteed
          variant: 'destructive'
        });
        return;
      }

      // Add sanitized tag
      updateField(['data', 'tags'], [...tags, result.sanitized]);  // Type-safe - sanitized guaranteed
      setInputValue('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    updateField(['data', 'tags'], tags.filter((tag: string) => tag !== tagToRemove));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="tags">Tags</Label>

      {/* Tag chips display */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map((tag: string) => (
            <Badge
              key={tag}
              variant="secondary"
              className="flex items-center gap-1 px-2 py-1"
            >
              <span className="text-sm">{tag}</span>
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                aria-label={`Remove ${tag} tag`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Tag input field */}
      <Input
        id="tags"
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onKeyPress={handleKeyDown}
        placeholder="Type a tag and press Enter"
        maxLength={MAX_TAG_LENGTH}
        disabled={tags.length >= MAX_TAGS_PER_POV}
      />
    </div>
  );
}

export default function BasicInfoSection() {
  const { state, updateField } = useEditorContext();
  const { data } = state;

  // Handle text input changes
  const handleInputChange = (field: string, value: string) => {
    updateField(['data', field], value);
  };

  // Handle date changes. Anchor to the picked LOCAL calendar day at UTC midnight
  // (date.toISOString() on a local-midnight Date skews the day in UTC+ zones).
  const handleDateChange = (field: string, date: Date | null) => {
    updateField(['data', field], date ? new Date(toLocalYmd(date)).toISOString() : undefined);
  };

  // Handle status change
  const handleStatusChange = (value: string) => {
    updateField(['data', 'status'], value as POVStatus);
  };

  // Handle priority change
  const handlePriorityChange = (value: string) => {
    updateField(['data', 'priority'], value as Priority);
  };

  // Format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString), 'yyyy-MM-dd');
    } catch {
      return '';
    }
  };

  // Get validation errors
  const getError = (field: string) => {
    const errorKey = `data.${field}`;
    return state.ui.validationErrors[errorKey]?.[0];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
        <CardDescription>
          Enter the basic details for this Proof of Value (POV)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Title and Opportunity Name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={data.title || ''}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="Enter POV title"
              className={getError('title') ? 'border-red-500' : ''}
            />
            {getError('title') && (
              <p className="text-sm text-red-500">{getError('title')}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="opportunityName">Opportunity Name</Label>
            <Input
              id="opportunityName"
              value={data.opportunityName || ''}
              onChange={(e) => handleInputChange('opportunityName', e.target.value)}
              placeholder="Enter opportunity name"
            />
          </div>
        </div>

        {/* Revenue and Forecast Date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="revenue">Revenue</Label>
            <Input
              id="revenue"
              type="number"
              step="0.01"
              value={data.revenue || ''}
              onChange={(e) => handleInputChange('revenue', e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="forecastDate">Forecast Date</Label>
            <DatePicker
              value={data.forecastDate ? fromLocalYmd(String(data.forecastDate)) : null}
              onChange={(date) => handleDateChange('forecastDate', date)}
            />
          </div>
        </div>

        {/* Start and End Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date</Label>
            <DatePicker
              value={data.startDate ? fromLocalYmd(String(data.startDate)) : null}
              onChange={(date) => handleDateChange('startDate', date)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endDate">End Date</Label>
            <DatePicker
              value={data.endDate ? fromLocalYmd(String(data.endDate)) : null}
              onChange={(date) => handleDateChange('endDate', date)}
            />
          </div>
        </div>

        {/* Description and Objective */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="description">
              Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="description"
              value={data.description || ''}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Enter POV description"
              rows={4}
              className={getError('description') ? 'border-red-500' : ''}
            />
            {getError('description') && (
              <p className="text-sm text-red-500">{getError('description')}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="objective">Objective</Label>
            <Textarea
              id="objective"
              value={data.objective || ''}
              onChange={(e) => handleInputChange('objective', e.target.value)}
              placeholder="Enter POV objective"
              rows={4}
            />
          </div>
        </div>

        {/* Status and Priority */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="status-trigger">Status</Label>
            <Select value={data.status || POVStatus.PROJECTED} onValueChange={handleStatusChange}>
              <SelectTrigger id="status-trigger">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={POVStatus.PROJECTED}>Projected</SelectItem>
                <SelectItem value={POVStatus.IN_PROGRESS}>In Progress</SelectItem>
                <SelectItem value={POVStatus.STALLED}>Stalled</SelectItem>
                <SelectItem value={POVStatus.VALIDATION}>Validation</SelectItem>
                <SelectItem value={POVStatus.WON}>Won</SelectItem>
                <SelectItem value={POVStatus.LOST}>Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority-trigger">Priority</Label>
            <Select value={data.priority || Priority.MEDIUM} onValueChange={handlePriorityChange}>
              <SelectTrigger id="priority-trigger">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={Priority.LOW}>Low</SelectItem>
                <SelectItem value={Priority.MEDIUM}>Medium</SelectItem>
                <SelectItem value={Priority.HIGH}>High</SelectItem>
                <SelectItem value={Priority.URGENT}>Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </div>

        {/* Demo POV and Tags - Same row layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Tags - Left side, half-width */}
          <TagsSection data={data} updateField={updateField} />

          {/* Demo POV Flag - Right side, right-justified */}
          <div className="flex items-end justify-end">
            <Label htmlFor="isDemo" className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="isDemo"
                checked={!!(data as any).metadata?.isDemo}
                onChange={(e) => {
                  const newMetadata = { ...(data as any).metadata, isDemo: e.target.checked };
                  updateField(['data', 'metadata'], newMetadata);
                }}
                className="h-4 w-4"
              />
              Demo POV (DEMO_USER access)
            </Label>
          </div>
        </div>

        {/* Solution */}
        <div className="space-y-2">
          <Label htmlFor="solution">Solution</Label>
          <Textarea
            id="solution"
            value={data.solution || ''}
            onChange={(e) => handleInputChange('solution', e.target.value)}
            placeholder="Enter proposed solution"
            rows={3}
          />
        </div>

        {/* Customer Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="customerName">Customer Name</Label>
            <Input
              id="customerName"
              value={data.customerName || ''}
              onChange={(e) => handleInputChange('customerName', e.target.value)}
              placeholder="Enter customer name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerContact">Customer Contact</Label>
            <Input
              id="customerContact"
              value={data.customerContact || ''}
              onChange={(e) => handleInputChange('customerContact', e.target.value)}
              placeholder="Enter customer contact"
            />
          </div>
        </div>

        {/* Partner Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="partnerName">Partner Name</Label>
            <Input
              id="partnerName"
              value={data.partnerName || ''}
              onChange={(e) => handleInputChange('partnerName', e.target.value)}
              placeholder="Enter partner name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="partnerContact">Partner Contact</Label>
            <Input
              id="partnerContact"
              value={data.partnerContact || ''}
              onChange={(e) => handleInputChange('partnerContact', e.target.value)}
              placeholder="Enter partner contact"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
