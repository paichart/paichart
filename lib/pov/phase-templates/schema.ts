/**
 * JSON Schema definition for Phase templates
 */

export const templateSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  title: "Phase Template Schema",
  description: "Schema for defining phase templates",
  required: ["id", "name", "type", "stages"],
  properties: {
    id: {
      type: "string",
      description: "Unique identifier for the template"
    },
    name: {
      type: "string",
      description: "Display name for the template"
    },
    description: {
      type: "string",
      description: "Detailed description of the template"
    },
    type: {
      type: "string",
      enum: ["PLANNING", "EXECUTION", "REVIEW"],
      description: "Type of phase this template is for"
    },
    version: {
      type: "string",
      description: "Version of the template (semver format)",
      pattern: "^\\d+\\.\\d+\\.\\d+$"
    },
    stages: {
      type: "array",
      description: "Stages in the template",
      minItems: 1,
      items: {
        type: "object",
        required: ["name", "tasks"],
        properties: {
          name: {
            type: "string",
            description: "Name of the stage"
          },
          description: {
            type: "string",
            description: "Description of the stage"
          },
          status: {
            type: "string",
            enum: ["PENDING", "ACTIVE", "COMPLETED", "BLOCKED"],
            default: "PENDING",
            description: "Initial status of the stage"
          },
          order: {
            type: "integer",
            minimum: 0,
            description: "Order of the stage in the sequence"
          },
          dependencies: {
            type: "array",
            items: {
              type: "string"
            },
            description: "IDs of stages that must be completed before this one"
          },
          tasks: {
            type: "array",
            description: "Tasks in the stage",
            minItems: 1,
            items: {
              type: "object",
              required: ["key", "title"],
              properties: {
                key: {
                  type: "string",
                  description: "Unique key for the task within the template"
                },
                title: {
                  type: "string",
                  description: "Title of the task"
                },
                description: {
                  type: "string",
                  description: "Description of the task"
                },
                required: {
                  type: "boolean",
                  default: false,
                  description: "Whether the task is required for completion"
                },
                priority: {
                  type: "string",
                  enum: ["HIGH", "MEDIUM", "LOW"],
                  default: "MEDIUM",
                  description: "Priority level of the task"
                },
                dependencies: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "Keys of tasks that must be completed before this one"
                },
                estimatedDuration: {
                  type: "object",
                  properties: {
                    value: {
                      type: "number",
                      minimum: 0
                    },
                    unit: {
                      type: "string",
                      enum: ["MINUTES", "HOURS", "DAYS", "WEEKS"]
                    }
                  },
                  required: ["value", "unit"],
                  description: "Estimated time to complete the task"
                },
                metadata: {
                  type: "object",
                  description: "Additional metadata for the task"
                }
              }
            }
          },
          metadata: {
            type: "object",
            description: "Additional metadata for the stage"
          }
        }
      }
    },
    validationRules: {
      type: "array",
      description: "Rules for validating the template",
      items: {
        type: "object",
        required: ["type", "condition"],
        properties: {
          type: {
            type: "string",
            enum: ["DEPENDENCY", "TIMELINE", "REQUIRED_TASKS", "CUSTOM"],
            description: "Type of validation rule"
          },
          condition: {
            type: "string",
            description: "Condition expression for the rule"
          },
          errorMessage: {
            type: "string",
            description: "Error message to display when validation fails"
          }
        }
      }
    },
    timelineRecommendations: {
      type: "object",
      description: "Recommendations for timeline planning",
      properties: {
        minimumDuration: {
          type: "object",
          properties: {
            value: {
              type: "number",
              minimum: 0
            },
            unit: {
              type: "string",
              enum: ["DAYS", "WEEKS", "MONTHS"]
            }
          },
          required: ["value", "unit"]
        },
        maximumDuration: {
          type: "object",
          properties: {
            value: {
              type: "number",
              minimum: 0
            },
            unit: {
              type: "string",
              enum: ["DAYS", "WEEKS", "MONTHS"]
            }
          },
          required: ["value", "unit"]
        },
        stageDurations: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              value: {
                type: "number",
                minimum: 0
              },
              unit: {
                type: "string",
                enum: ["DAYS", "WEEKS", "MONTHS"]
              }
            },
            required: ["value", "unit"]
          }
        }
      }
    },
    metadata: {
      type: "object",
      description: "Additional metadata for the template"
    }
  }
};

export const stageSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["name", "tasks"],
  properties: templateSchema.properties.stages.items.properties
};

export const taskSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["key", "title"],
  properties: templateSchema.properties.stages.items.properties.tasks.items.properties
};
