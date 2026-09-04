import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { POVTemplate, FieldDefinition } from './types';
import { templateSchema } from './schema';
import { ApiError } from '@/lib/errors';
import { safeRegex } from '@/lib/utils/safe-regex';

/**
 * Validator for POV templates
 */
export class TemplateValidator {
  private static instance: TemplateValidator;
  private ajv: Ajv;
  private validator: ReturnType<Ajv['compile']>;
  private customValidators: Map<string, (value: any, field: FieldDefinition) => boolean>;

  private constructor() {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
    
    this.validator = this.ajv.compile(templateSchema);
    this.customValidators = new Map();
    
    // Register default custom validators
    this.registerCustomValidator('isValidEmail', this.isValidEmail);
    this.registerCustomValidator('isValidPhone', this.isValidPhone);
    this.registerCustomValidator('isValidUrl', this.isValidUrl);
  }

  public static getInstance(): TemplateValidator {
    if (!TemplateValidator.instance) {
      TemplateValidator.instance = new TemplateValidator();
    }
    return TemplateValidator.instance;
  }

  /**
   * Validate a template against the schema
   */
  public validateTemplate(template: POVTemplate): { valid: boolean; errors: any[] } {
    const valid = this.validator(template);
    return {
      valid: !!valid,
      errors: this.validator.errors || []
    };
  }

  /**
   * Validate POV data against a template
   */
  public validatePOVData(data: Record<string, any>, template: POVTemplate): { valid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};
    
    // Check each field in the template
    Object.entries(template.fields).forEach(([fieldId, fieldDef]) => {
      const value = data[fieldId];
      
      // Check required fields
      if (fieldDef.required && (value === undefined || value === null || value === '')) {
        errors[fieldId] = `${fieldDef.label} is required`;
        return;
      }
      
      // Skip validation for empty optional fields
      if (value === undefined || value === null || value === '') {
        return;
      }
      
      // Validate based on field type
      switch (fieldDef.type) {
        case 'number':
        case 'currency':
          if (typeof value !== 'number') {
            errors[fieldId] = `${fieldDef.label} must be a number`;
          } else if (fieldDef.validation?.min !== undefined && value < fieldDef.validation.min) {
            errors[fieldId] = `${fieldDef.label} must be at least ${fieldDef.validation.min}`;
          } else if (fieldDef.validation?.max !== undefined && value > fieldDef.validation.max) {
            errors[fieldId] = `${fieldDef.label} must be at most ${fieldDef.validation.max}`;
          }
          break;
          
        case 'text':
        case 'textarea':
        case 'email':
        case 'phone':
        case 'url':
          if (typeof value !== 'string') {
            errors[fieldId] = `${fieldDef.label} must be a string`;
          } else {
            if (fieldDef.validation?.min !== undefined && value.length < fieldDef.validation.min) {
              errors[fieldId] = `${fieldDef.label} must be at least ${fieldDef.validation.min} characters`;
            }
            if (fieldDef.validation?.max !== undefined && value.length > fieldDef.validation.max) {
              errors[fieldId] = `${fieldDef.label} must be at most ${fieldDef.validation.max} characters`;
            }
            if (fieldDef.validation?.pattern) {
              // BC15 defense: validate regex pattern before instantiation (prevents ReDoS)
              const fieldRegex = safeRegex(fieldDef.validation.pattern, '', `field validation: ${fieldId}`);
              if (fieldRegex && !fieldRegex.test(value)) {
                errors[fieldId] = `${fieldDef.label} is not in the correct format`;
              }
              // If safeRegex returns null, skip validation (pattern was unsafe/invalid)
            }
            
            // Apply custom validators
            if (fieldDef.validation?.customValidator) {
              const validator = this.customValidators.get(fieldDef.validation.customValidator);
              if (validator && !validator(value, fieldDef)) {
                errors[fieldId] = `${fieldDef.label} is invalid`;
              }
            }
            
            // Type-specific validation
            if (fieldDef.type === 'email' && !this.isValidEmail(value, fieldDef)) {
              errors[fieldId] = `${fieldDef.label} must be a valid email address`;
            }
            if (fieldDef.type === 'phone' && !this.isValidPhone(value, fieldDef)) {
              errors[fieldId] = `${fieldDef.label} must be a valid phone number`;
            }
            if (fieldDef.type === 'url' && !this.isValidUrl(value, fieldDef)) {
              errors[fieldId] = `${fieldDef.label} must be a valid URL`;
            }
          }
          break;
          
        case 'date':
          if (!(value instanceof Date) && isNaN(Date.parse(value))) {
            errors[fieldId] = `${fieldDef.label} must be a valid date`;
          }
          break;
          
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors[fieldId] = `${fieldDef.label} must be a boolean`;
          }
          break;
          
        case 'select':
          if (fieldDef.validation?.options && !fieldDef.validation.options.some(opt => opt.value === value)) {
            errors[fieldId] = `${fieldDef.label} must be one of the available options`;
          }
          break;
          
        case 'multiselect':
          if (!Array.isArray(value)) {
            errors[fieldId] = `${fieldDef.label} must be an array`;
          } else if (fieldDef.validation?.options) {
            const validValues = fieldDef.validation.options.map(opt => opt.value);
            if (!value.every(v => validValues.includes(v))) {
              errors[fieldId] = `${fieldDef.label} contains invalid options`;
            }
          }
          break;
      }
    });
    
    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Register a custom validator function
   */
  public registerCustomValidator(
    name: string,
    validator: (value: any, field: FieldDefinition) => boolean
  ): void {
    this.customValidators.set(name, validator);
  }

  /**
   * Format validation errors into human-readable messages
   */
  public formatSchemaErrors(errors: any[]): string[] {
    return errors.map(error => {
      const path = error.instancePath || '';
      const property = error.params.missingProperty ? 
        `/${error.params.missingProperty}` : '';
      
      switch (error.keyword) {
        case 'required':
          return `Missing required property: ${error.params.missingProperty}`;
        case 'enum':
          return `${path}${property} must be one of: ${error.params.allowedValues.join(', ')}`;
        case 'type':
          return `${path}${property} must be a ${error.params.type}`;
        default:
          return `${path}${property} ${error.message}`;
      }
    });
  }

  // Default custom validators
  private isValidEmail(value: string, _field: FieldDefinition): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private isValidPhone(value: string, _field: FieldDefinition): boolean {
    return /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/.test(value);
  }

  private isValidUrl(value: string, _field: FieldDefinition): boolean {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }
}

export const templateValidator = TemplateValidator.getInstance();
