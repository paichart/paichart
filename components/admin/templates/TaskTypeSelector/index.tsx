import React from 'react';
import RadioGroup, { RadioGroupItem } from '@/components/ui/RadioGroup';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';
import { TaskType } from '@prisma/client';
import {
  taskTypeLabels,
  getTaskTypeColorClass,
} from '@/lib/utils/taskTypes';
import { taskTypeIcons } from '@/lib/utils/taskTypeIcons';

interface TaskTypeSelectorProps {
  value: TaskType;
  onChange: (value: TaskType) => void;
  managerName?: string;
  onManagerNameChange?: (name: string) => void;
}

/**
 * Task Type Selector Component
 *
 * Allows selecting between different task types (ACTION, DECISION, MILESTONE, APPROVAL, DOCUMENT, MCP_SERVICE, PIPELINE)
 * and provides additional fields for specific task types (e.g., manager name for approval tasks)
 */
export function TaskTypeSelector({
  value,
  onChange,
  managerName = '',
  onManagerNameChange
}: TaskTypeSelectorProps) {
  const isApproval = value === TaskType.APPROVAL;

  return (
    <div className="space-y-4">
      <RadioGroup
        value={value}
        onValueChange={onChange}
        className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        {Object.values(TaskType).map(type => {
          const IconComponent = taskTypeIcons[type];
          return (
            <div key={type} className="flex items-center space-x-2 rounded-md border p-3 cursor-pointer hover:bg-gray-50">
              <RadioGroupItem value={type} id={`type-${type}`} />
              <Label htmlFor={`type-${type}`} className="flex items-center cursor-pointer">
                <IconComponent className={`h-4 w-4 mr-2 ${getTaskTypeColorClass(type)}`} />
                {taskTypeLabels[type]}
              </Label>
            </div>
          );
        })}
      </RadioGroup>

      {isApproval && onManagerNameChange && (
        <div className="space-y-2">
          <Label htmlFor="manager-name">Manager Name (Reference)</Label>
          <Input
            id="manager-name"
            value={managerName}
            onChange={(e) => onManagerNameChange(e.target.value)}
            placeholder="Enter manager name for reference"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Legacy TaskTypeSelector Component
 *
 * This version accepts string values for backward compatibility.
 * Converts between string values and TaskType enum values.
 * Handles pre-rationalization types (browser, MCP sub-types).
 */
export function LegacyTaskTypeSelector({
  value,
  onChange,
  managerName = '',
  onManagerNameChange
}: {
  value: string;
  onChange: (value: string) => void;
  managerName?: string;
  onManagerNameChange?: (name: string) => void;
}) {
  // Convert string to TaskType (handles legacy values)
  const getTaskTypeFromString = (typeStr: string): TaskType => {
    const normalizedType = typeStr.toUpperCase();

    if (Object.values(TaskType).includes(normalizedType as TaskType)) {
      return normalizedType as TaskType;
    }

    // Legacy mappings (pre-rationalization Apr 2026)
    const legacyMappings: Record<string, TaskType> = {
      'task': TaskType.ACTION,
      'completed': TaskType.ACTION,
      'browser-automation': TaskType.ACTION,
      'web-scraping': TaskType.ACTION,
      'ui-testing': TaskType.ACTION,
      'form-submission': TaskType.ACTION,
      'mcp-service-registration': TaskType.MCP_SERVICE,
      'mcp-service-discovery': TaskType.MCP_SERVICE,
      'mcp-service-test': TaskType.MCP_SERVICE,
      'mcp-service-integration': TaskType.MCP_SERVICE,
    };

    return legacyMappings[typeStr.toLowerCase()] || TaskType.ACTION;
  };

  // Convert TaskType to string
  const getStringFromTaskType = (type: TaskType): string => {
    const mappings: Record<TaskType, string> = {
      [TaskType.ACTION]: 'task',
      [TaskType.DECISION]: 'decision',
      [TaskType.MILESTONE]: 'milestone',
      [TaskType.APPROVAL]: 'approval',
      [TaskType.DOCUMENT]: 'document',
      [TaskType.MCP_SERVICE]: 'mcp-service',
      [TaskType.PIPELINE]: 'pipeline',
    };

    return mappings[type] || type.toLowerCase();
  };

  const enumValue = getTaskTypeFromString(value);

  const handleChange = (newEnumValue: TaskType) => {
    onChange(getStringFromTaskType(newEnumValue));
  };

  return (
    <TaskTypeSelector
      value={enumValue}
      onChange={handleChange}
      managerName={managerName}
      onManagerNameChange={onManagerNameChange}
    />
  );
}
