'use client';

import React from 'react';
import { ChevronDown, Check, FileText, Settings, Bot } from 'lucide-react';
import { TemplateType } from '../context/types/TemplateEditorState';

/**
 * Template type selector props
 */
interface TemplateTypeSelectorProps {
  templateType: TemplateType;
  onTemplateTypeChange: (type: TemplateType) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Template type option interface
 */
interface TemplateTypeOption {
  value: TemplateType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

/**
 * Template type option configuration
 */
const TEMPLATE_TYPE_OPTIONS: TemplateTypeOption[] = [
  {
    value: 'pov',
    label: 'POV Template',
    description: 'Create templates for Proof of Value projects',
    icon: FileText,
  },
  {
    value: 'phase',
    label: 'Phase Template',
    description: 'Create templates for project phases with stages and tasks',
    icon: Settings,
  },
  {
    value: 'agent',
    label: 'Agent Template',
    description: 'Create templates for AI agent configurations (Coming Soon)',
    icon: Bot,
    disabled: true, // Future feature
  },
];

/**
 * Template Type Selector Component
 * 
 * A dropdown selector for choosing between POV, Phase, and Agent template types.
 * Supports future extensibility for additional template types.
 */
export function TemplateTypeSelector({
  templateType,
  onTemplateTypeChange,
  disabled = false,
  className = '',
}: TemplateTypeSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Get current template type option
  const currentOption = TEMPLATE_TYPE_OPTIONS.find(option => option.value === templateType);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle template type selection
  const handleSelect = (newType: TemplateType) => {
    if (newType !== templateType && !disabled) {
      onTemplateTypeChange(newType);
      setIsOpen(false);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        setIsOpen(!isOpen);
        break;
      case 'Escape':
        setIsOpen(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        }
        break;
    }
  };

  const IconComponent = currentOption?.icon || FileText;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Dropdown Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          relative w-full min-w-[200px] bg-background border border-border rounded-md shadow-sm 
          pl-3 pr-10 py-2 text-left cursor-default focus:outline-none focus:ring-1 
          focus:ring-primary focus:border-primary sm:text-sm text-foreground
          ${disabled 
            ? 'bg-muted text-muted-foreground cursor-not-allowed' 
            : 'hover:bg-muted/50'
          }
          ${isOpen ? 'ring-1 ring-primary border-primary' : ''}
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby="template-type-label"
      >
        <span className="flex items-center">
          <IconComponent className="h-4 w-4 mr-2 text-muted-foreground" />
          <span className="block truncate font-medium">
            {currentOption?.label || 'Select Template Type'}
          </span>
        </span>
        <span className="ml-3 absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <ChevronDown 
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
              isOpen ? 'transform rotate-180' : ''
            }`} 
            aria-hidden="true" 
          />
        </span>
      </button>

      {/* Dropdown Options */}
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-background shadow-lg max-h-56 rounded-md py-1 text-base ring-1 ring-border ring-opacity-5 overflow-auto focus:outline-none sm:text-sm border border-border">
          {TEMPLATE_TYPE_OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            return (
              <div
                key={option.value}
                onClick={() => !option.disabled && handleSelect(option.value)}
                className={`
                  cursor-pointer select-none relative py-3 pl-3 pr-9 hover:bg-muted/50
                  ${option.disabled 
                    ? 'text-muted-foreground cursor-not-allowed bg-muted/30' 
                    : 'text-foreground'
                  }
                  ${templateType === option.value 
                    ? 'bg-primary/10 text-primary' 
                    : ''
                  }
                `}
                role="option"
                aria-selected={templateType === option.value}
              >
                <div className="flex items-start">
                  <OptionIcon className="h-4 w-4 mr-3 mt-0.5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex items-center">
                      <span className={`block font-medium ${
                        option.disabled ? 'text-muted-foreground' : 'text-foreground'
                      }`}>
                        {option.label}
                      </span>
                      {option.disabled && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                          Coming Soon
                        </span>
                      )}
                    </div>
                    <p className={`mt-1 text-sm ${
                      option.disabled ? 'text-muted-foreground/70' : 'text-muted-foreground'
                    }`}>
                      {option.description}
                    </p>
                  </div>
                  
                  {/* Selected indicator */}
                  {templateType === option.value && (
                    <span className="absolute inset-y-0 right-0 flex items-center pr-4">
                      <Check className="h-4 w-4 text-primary" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Template Type Selector with Label
 * 
 * A wrapper component that includes a label for the template type selector.
 */
interface TemplateTypeSelectorWithLabelProps extends TemplateTypeSelectorProps {
  label?: string;
  description?: string;
  required?: boolean;
}

export function TemplateTypeSelectorWithLabel({
  label = 'Template Type',
  description,
  required = false,
  className = '',
  ...props
}: TemplateTypeSelectorWithLabelProps) {
  return (
    <div className={className}>
      <label 
        id="template-type-label" 
        className="block text-sm font-medium text-foreground mb-1"
      >
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      
      {description && (
        <p className="text-sm text-muted-foreground mb-2">
          {description}
        </p>
      )}
      
      <TemplateTypeSelector {...props} />
    </div>
  );
}

/**
 * Hook for template type selector state management
 */
export function useTemplateTypeSelector(
  initialType: TemplateType = 'pov',
  onTypeChange?: (type: TemplateType) => void
) {
  const [templateType, setTemplateType] = React.useState<TemplateType>(initialType);

  const handleTypeChange = React.useCallback((newType: TemplateType) => {
    setTemplateType(newType);
    onTypeChange?.(newType);
  }, [onTypeChange]);

  return {
    templateType,
    setTemplateType: handleTypeChange,
    isValidType: (type: string): type is TemplateType => {
      return ['pov', 'phase', 'agent'].includes(type);
    },
  };
}
