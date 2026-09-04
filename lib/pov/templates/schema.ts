/**
 * JSON Schema definition for POV templates
 */

export const templateSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "POV Template Schema",
  "description": "Schema for defining POV templates",
  "required": ["id", "name", "description", "fields", "sections"],
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique identifier for the template"
    },
    "name": {
      "type": "string",
      "description": "Display name for the template"
    },
    "description": {
      "type": "string",
      "description": "Detailed description of the template"
    },
    "version": {
      "type": "string",
      "description": "Version of the template (semver format)",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "status": {
      "type": "string",
      "enum": ["draft", "published", "deprecated"],
      "default": "draft",
      "description": "Status of the template"
    },
    "sections": {
      "type": "array",
      "description": "Sections of the POV form",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "title", "fields"],
        "properties": {
          "id": {
            "type": "string",
            "description": "Unique identifier for the section"
          },
          "title": {
            "type": "string",
            "description": "Display title for the section"
          },
          "description": {
            "type": "string",
            "description": "Optional description for the section"
          },
          "order": {
            "type": "integer",
            "minimum": 0,
            "description": "Display order of the section"
          },
          "fields": {
            "type": "array",
            "description": "Fields in this section",
            "items": {
              "type": "string",
              "description": "Field ID reference"
            }
          },
          "conditional": {
            "type": "object",
            "description": "Conditions for displaying this section",
            "properties": {
              "field": {
                "type": "string",
                "description": "Field ID to check"
              },
              "operator": {
                "type": "string",
                "enum": ["equals", "notEquals", "contains", "greaterThan", "lessThan"],
                "description": "Comparison operator"
              },
              "value": {
                "description": "Value to compare against"
              }
            },
            "required": ["field", "operator", "value"]
          }
        }
      }
    },
    "fields": {
      "type": "object",
      "description": "Field definitions for the POV",
      "additionalProperties": {
        "type": "object",
        "required": ["type", "label"],
        "properties": {
          "type": {
            "type": "string",
            "enum": ["text", "textarea", "select", "multiselect", "date", "number", "boolean", "email", "phone", "url", "currency"],
            "description": "Type of field"
          },
          "label": {
            "type": "string",
            "description": "Display label for the field"
          },
          "description": {
            "type": "string",
            "description": "Help text for the field"
          },
          "placeholder": {
            "type": "string",
            "description": "Placeholder text for the field"
          },
          "defaultValue": {
            "description": "Default value for the field"
          },
          "required": {
            "type": "boolean",
            "default": false,
            "description": "Whether the field is required"
          },
          "validation": {
            "type": "object",
            "description": "Validation rules for the field",
            "properties": {
              "pattern": {
                "type": "string",
                "description": "Regex pattern for validation"
              },
              "min": {
                "type": "number",
                "description": "Minimum value for numbers or minimum length for strings"
              },
              "max": {
                "type": "number",
                "description": "Maximum value for numbers or maximum length for strings"
              },
              "options": {
                "type": "array",
                "description": "Options for select/multiselect fields",
                "items": {
                  "type": "object",
                  "required": ["value", "label"],
                  "properties": {
                    "value": {
                      "description": "Option value"
                    },
                    "label": {
                      "type": "string",
                      "description": "Display label for the option"
                    }
                  }
                }
              },
              "customValidator": {
                "type": "string",
                "description": "Name of custom validator function"
              }
            }
          },
          "ui": {
            "type": "object",
            "description": "UI rendering hints",
            "properties": {
              "width": {
                "type": "string",
                "enum": ["full", "half", "third", "quarter"],
                "default": "full",
                "description": "Width of the field in the form"
              },
              "hidden": {
                "type": "boolean",
                "default": false,
                "description": "Whether the field is hidden by default"
              },
              "component": {
                "type": "string",
                "description": "Custom component to use for rendering"
              }
            }
          },
          "conditional": {
            "type": "object",
            "description": "Conditions for displaying this field",
            "properties": {
              "field": {
                "type": "string",
                "description": "Field ID to check"
              },
              "operator": {
                "type": "string",
                "enum": ["equals", "notEquals", "contains", "greaterThan", "lessThan"],
                "description": "Comparison operator"
              },
              "value": {
                "description": "Value to compare against"
              }
            },
            "required": ["field", "operator", "value"]
          },
          "metadata": {
            "type": "object",
            "description": "Additional metadata for the field"
          }
        }
      }
    },
    "metadata": {
      "type": "object",
      "description": "Additional metadata for the template",
      "properties": {
        "author": {
          "type": "string",
          "description": "Author of the template"
        },
        "createdAt": {
          "type": "string",
          "description": "Creation date of the template"
        },
        "updatedAt": {
          "type": "string",
          "description": "Last update date of the template"
        },
        "tags": {
          "type": "array",
          "description": "Tags for categorizing the template",
          "items": {
            "type": "string"
          }
        },
        "fieldMappings": {
          "type": "object",
          "description": "Mappings from POV fields to form fields",
          "additionalProperties": {
            "type": "string"
          }
        },
        "phaseTemplates": {
          "type": "array",
          "description": "Phase templates to use with this POV template",
          "items": {
            "type": "string",
            "description": "Phase template ID"
          }
        }
      }
    }
  }
};
