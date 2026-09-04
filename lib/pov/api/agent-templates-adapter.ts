import { fetchWithAuth } from '@/lib/utils/fetch-utils';
import { ApiResponse } from './agent-service';
import { LLMProvider, DEFAULT_MAX_TOKENS } from '@/lib/services/llm/types';
import { ModelParameters } from '@/components/poveditor/pov/context/types/EntityTypes';
import { povLogger } from '@/lib/logger';
import { AgentCategory, TemplateType } from '@prisma/client';

/**
 * Build the metadata object sent to POST/PUT agent-templates.
 * Includes modelParameters (LLM config) and protocol (child-side workflow)
 * only when present; returns undefined if both are empty so the server
 * doesn't receive a spurious empty object.
 *
 * KNOWN DATA LOSS (boundary-contract review 2026-04-17, commit 0321fdfb):
 * Prisma's .update({ data: { metadata: X } }) on a JSONB column overwrites,
 * not merges. When a GUI-user updates a seeded template, decorative metadata
 * fields (hasModelParameters, modelParamsVersion, mcpHubSpecific) get dropped.
 * Zero runtime consumers confirmed; cosmetic only. If preservation becomes
 * important later, thread existing metadata through form state and merge here.
 */
function buildMetadata(
  modelParameters?: ModelParameters,
  protocol?: string,
  mcpTools?: string[],
  loadProtocols?: boolean | string | null
): Record<string, any> | undefined {
  const out: Record<string, any> = {};
  if (modelParameters) out.modelParameters = modelParameters;
  if (protocol) out.protocol = protocol;
  // Preserve the stored injection mode across GUI round-trips (JSONB overwrite — see header).
  // `null` is EXPLICIT removal (warn — de-protocoling is a deliberate act, never a default);
  // undefined/false simply omit the key, matching the stored-absent shape.
  if (loadProtocols === null) {
    povLogger.warn({}, 'buildMetadata: explicit loadProtocols removal — template will stop loading protocols');
  } else if (loadProtocols !== undefined && loadProtocols !== false) {
    out.loadProtocols = loadProtocols;
  }
  // Shape matches the agent-configure handler's read contract:
  // metadata.mcpToolConfiguration.selectedTools (single source of truth).
  if (mcpTools && mcpTools.length > 0) out.mcpToolConfiguration = { selectedTools: mcpTools };
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Interface for agent template (compatible with POV Editor)
 */
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  role: string;
  prompt: string;
  inputContext?: Record<string, any>;
  modelParameters?: ModelParameters;
  maxRetries?: number;
  timeout?: number;
  tags?: string[];
  capabilities?: Record<string, any>;
  constraints?: Record<string, any>;
  category?: AgentCategory;
  templateType?: TemplateType;
  /**
   * Optional child-side protocol name. Mirrors the prompt-library entry name
   * (e.g., 'artifact-synthesis-protocol'). When set, the execution engine
   * injects that protocol into the template's system prompt at runtime.
   * See pipeline-harness-specialist §2a/2b for the taxonomy.
   */
  protocol?: string;
  /**
   * Meta-agent flag (metadata.loadProtocols). `true` (legacy load-all): the engine
   * injects ALL protocol-tagged prompts. `'composed'` (WS1 Phase C): the engine
   * composes the protocol-base plus the task's ONE stamped protocol. Carried as the
   * RAW stored value so a GUI round-trip cannot coerce 'composed' to false and wipe
   * it on save (the JSONB overwrite above). In `true` mode, mutually-exclusive-in-
   * practice with `protocol`; in `'composed'` mode `protocol` is a fallback rung.
   */
  loadProtocols?: boolean | string;
  /**
   * Template-level tool selection (2026-06-10). Stored as
   * metadata.mcpToolConfiguration.selectedTools — the configure handler merges
   * these with any task-level mcpTools at agent-configure time. Empty/absent
   * = default-all consolidated tools.
   */
  mcpTools?: string[];
  createdAt: string;
  updatedAt: string;
  isBuiltIn?: boolean;
}

/**
 * Interface for creating a new agent template
 */
export interface CreateTemplateRequest {
  name: string;
  description: string;
  role: string;
  prompt: string;
  inputContext?: Record<string, any>;
  modelParameters?: ModelParameters;
  maxRetries?: number;
  timeout?: number;
  tags?: string[];
  category?: AgentCategory;
  templateType?: TemplateType;
  protocol?: string;
  mcpTools?: string[];
  /** Raw injection-mode value round-tripped so a save cannot wipe it (see buildMetadata). */
  loadProtocols?: boolean | string | null;
}

/**
 * Interface for updating an agent template
 */
export interface UpdateTemplateRequest {
  id: string;
  mcpTools?: string[];
  name?: string;
  description?: string;
  role?: string;
  prompt?: string;
  inputContext?: Record<string, any>;
  modelParameters?: ModelParameters;
  maxRetries?: number;
  timeout?: number;
  tags?: string[];
  category?: AgentCategory;
  templateType?: TemplateType;
  protocol?: string;
  /** Raw injection-mode value round-tripped so a save cannot wipe it (see buildMetadata). */
  loadProtocols?: boolean | string | null;
}

/**
 * Adapter Service for agent template operations
 * Bridges the POV Editor interface with our new AgentTemplateService
 */
export const AgentTemplateServiceAdapter = {
  /**
   * Get all agent templates
   * @returns Agent templates
   */
  async getTemplates(): Promise<ApiResponse<AgentTemplate[]>> {
    try {
      // `/api/agent-templates` defaults to limit=20 (route.ts:47) — the admin Templates view needs the
      // FULL set (34+ as pipeline domains land), or rows silently disappear (and Copy lands off-page).
      // 200 is the API's hard ceiling for this route.
      const response = await fetchWithAuth('/api/agent-templates?limit=200', {
        method: 'GET',
      });

      const data = await response.json();

      if (!response.ok) {
        povLogger.error({ status: response.status }, 'agent templates API error');
        return {
          success: false,
          error: data.error?.message || 'Failed to get agent templates',
        };
      }

      // Handle different response formats
      // Database API returns: { success: true, data: { templates: [...] } }
      // POV API returns: { data: [...] }
      let rawTemplates = data.data?.templates || data.data || [];

      // Transform the data to match the POV Editor interface
      const templates = rawTemplates?.map((template: any) => ({
        id: template.id,
        name: template.name,
        description: template.description || '',
        role: template.defaultRole || 'assistant',
        prompt: template.promptTemplate || '',
        inputContext: template.contextTemplate || {},
        modelParameters: template.metadata?.modelParameters || {
          provider: LLMProvider.ANTHROPIC_SDK,
          model: 'claude-haiku-4-5',
          temperature: 0.3,
          maxTokens: DEFAULT_MAX_TOKENS,
          stopSequences: [],
          useSystemPrompt: true,
          systemPrompt: template.metadata?.modelParameters?.systemPrompt || template.promptTemplate || 'You are a helpful AI assistant.',
        },
        maxRetries: template.maxRetries ?? 3,
        timeout: template.timeout ?? 300,
        tags: template.tags || [],
        capabilities: template.capabilities || {},
        constraints: template.constraints || {},
        category: template.category ?? 'GENERAL',
        templateType: template.templateType ?? undefined,
        protocol: template.metadata?.protocol ?? undefined,
        loadProtocols: template.metadata?.loadProtocols ?? false,
        mcpTools: template.metadata?.mcpToolConfiguration?.selectedTools ?? undefined,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        isBuiltIn: template.isBuiltIn || false
      })) || [];

      return {
        success: true,
        data: templates,
      };
    } catch (error) {
      povLogger.error({ err: error }, 'failed to get agent templates');

      // For development, return mock data if the API is not available
      if (process.env.NODE_ENV === 'development') {
        povLogger.debug('using mock template data in development mode');
        return {
          success: true,
          data: getMockTemplates(),
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      };
    }
  },

  /**
   * Get an agent template by ID
   * @param id Template ID
   * @returns Agent template
   */
  async getTemplate(id: string): Promise<ApiResponse<AgentTemplate>> {
    try {
      // Validate ID
      if (!id) {
        return {
          success: false,
          error: 'Template ID is required',
        };
      }
      
      // Use our new API endpoint
      const response = await fetchWithAuth(`/api/agent-templates/${id}`, {
        method: 'GET',
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific error cases
        if (data.error?.code === 'NOT_FOUND') {
          return {
            success: false,
            error: 'Template not found. Please ensure the template ID is correct.',
          };
        }
        
        return {
          success: false,
          error: data.error?.message || 'Failed to get agent template',
        };
      }

      // Transform the data to match the POV Editor interface
      const template = data.data; // Fix: API returns data.data, not data.template
      const transformedTemplate: AgentTemplate = {
        id: template.id,
        name: template.name,
        description: template.description || '',
        role: template.defaultRole || 'assistant',
        prompt: template.promptTemplate || '',
        inputContext: template.contextTemplate || {},
        modelParameters: template.metadata?.modelParameters || {
          provider: LLMProvider.ANTHROPIC_SDK,
          model: 'claude-haiku-4-5',
          temperature: 0.3,
          maxTokens: DEFAULT_MAX_TOKENS,
          stopSequences: [],
          useSystemPrompt: true,
          systemPrompt: template.metadata?.modelParameters?.systemPrompt || template.promptTemplate || 'You are a helpful AI assistant.',
        },
        maxRetries: template.maxRetries ?? 3,
        timeout: template.timeout ?? 300,
        tags: template.tags || [],
        capabilities: template.capabilities || {},
        constraints: template.constraints || {},
        category: template.category ?? 'GENERAL',
        templateType: template.templateType ?? undefined,
        protocol: template.metadata?.protocol ?? undefined,
        loadProtocols: template.metadata?.loadProtocols ?? false,
        mcpTools: template.metadata?.mcpToolConfiguration?.selectedTools ?? undefined,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        isBuiltIn: template.isDefault || false
      };

      return {
        success: true,
        data: transformedTemplate,
      };
    } catch (error) {
      povLogger.error({ err: error }, 'failed to get agent template');

      // For development, return mock data if the API is not available
      if (process.env.NODE_ENV === 'development') {
        povLogger.debug('using mock template data in development mode');
        const mockTemplates = getMockTemplates();
        const template = mockTemplates.find(t => t.id === id);
        
        if (template) {
          return {
            success: true,
            data: template,
          };
        } else {
          return {
            success: false,
            error: 'Template not found',
          };
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      };
    }
  },

  /**
   * Create a new agent template
   * @param template Template to create
   * @returns Created template
   */
  async createTemplate(template: CreateTemplateRequest): Promise<ApiResponse<AgentTemplate>> {
    try {
      // Validate template
      if (!template.name) {
        return {
          success: false,
          error: 'Template name is required',
        };
      }
      
      if (!template.role) {
        return {
          success: false,
          error: 'Template role is required',
        };
      }
      
      if (!template.prompt) {
        return {
          success: false,
          error: 'Template prompt is required',
        };
      }
      
      // Use our new API endpoint
      const response = await fetchWithAuth('/api/agent-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          // 2026-04-17 (task #83 Bug C fix): use caller-provided values; was hardcoded 'GENERAL'.
          // Form dropdowns were silently cosmetic before this fix.
          category: template.category ?? 'GENERAL',
          templateType: template.templateType ?? undefined,
          defaultRole: template.role,
          promptTemplate: template.prompt,
          capabilities: {},
          constraints: {},
          maxRetries: template.maxRetries ?? 3,
          // BUG-A fix (2026-07-01): CreateAgentTemplateSchema REQUIRES `variables` (no default) and
          // timeout >= 1000ms. This create payload omitted variables and sent 60 (< min), so "Save"
          // for a NEW template 400'd every time. The Builder has no Variables UI, so [] is correct;
          // any {{placeholder}} in the prompt (a non-feature here) then fails validation as intended.
          variables: [],
          timeout: template.timeout ?? 60000,
          contextTemplate: template.inputContext || {},
          tags: template.tags || [],
          // 2026-04-17: persist metadata.modelParameters and metadata.protocol.
          // modelParameters drives runtime LLM config; protocol (if set) points
          // at a prompt-library row that the engine injects at execution time.
          metadata: buildMetadata(template.modelParameters, template.protocol, template.mcpTools, template.loadProtocols),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error?.message || 'Failed to create agent template',
        };
      }

      // Transform the response
      // BC FIX: API returns { success, data: { template, templateId } }
      const createdTemplate = data.data?.template || data.template;
      const transformedTemplate: AgentTemplate = {
        id: createdTemplate.id,
        name: createdTemplate.name,
        description: createdTemplate.description || '',
        role: createdTemplate.defaultRole || 'assistant',
        prompt: createdTemplate.promptTemplate || '',
        inputContext: createdTemplate.contextTemplate || {},
        modelParameters: createdTemplate.metadata?.modelParameters || template.modelParameters,
        maxRetries: createdTemplate.maxRetries ?? 3,
        timeout: createdTemplate.timeout ?? 300,
        tags: createdTemplate.tags || [],
        capabilities: createdTemplate.capabilities || {},
        constraints: createdTemplate.constraints || {},
        category: createdTemplate.category ?? 'GENERAL',
        templateType: createdTemplate.templateType ?? undefined,
        protocol: createdTemplate.metadata?.protocol ?? undefined,
        loadProtocols: createdTemplate.metadata?.loadProtocols ?? false,
        mcpTools: createdTemplate.metadata?.mcpToolConfiguration?.selectedTools ?? template.mcpTools,
        createdAt: createdTemplate.createdAt,
        updatedAt: createdTemplate.updatedAt,
        isBuiltIn: createdTemplate.isDefault || false
      };

      return {
        success: true,
        data: transformedTemplate,
      };
    } catch (error) {
      povLogger.error({ err: error }, 'failed to create agent template');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      };
    }
  },

  /**
   * Update an agent template
   * @param template Template to update
   * @returns Updated template
   */
  async updateTemplate(template: UpdateTemplateRequest): Promise<ApiResponse<AgentTemplate>> {
    try {
      // Validate template
      if (!template.id) {
        return {
          success: false,
          error: 'Template ID is required',
        };
      }
      
      // Use our new API endpoint
      const response = await fetchWithAuth(`/api/agent-templates/${template.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          category: template.category,
          templateType: template.templateType,
          defaultRole: template.role,
          promptTemplate: template.prompt,
          maxRetries: template.maxRetries,
          timeout: template.timeout,
          contextTemplate: template.inputContext,
          tags: template.tags,
          // 2026-04-17: include metadata.protocol if set, alongside modelParameters
          metadata: buildMetadata(template.modelParameters, template.protocol, template.mcpTools, template.loadProtocols),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // API returns { success: false, error: 'message' } or { success: false, error: 'Validation failed', details: {...} }
        const errorMsg = typeof data.error === 'string' ? data.error : data.error?.message;
        return {
          success: false,
          error: errorMsg || 'Failed to update agent template',
        };
      }

      // Transform the response — API returns { success, data: { id, name, ... } }
      const updatedTemplate = data.data;
      if (!updatedTemplate) {
        return {
          success: false,
          error: 'Unexpected response format from server',
        };
      }
      const transformedTemplate: AgentTemplate = {
        id: updatedTemplate.id,
        name: updatedTemplate.name,
        description: updatedTemplate.description || '',
        role: updatedTemplate.defaultRole || 'assistant',
        prompt: updatedTemplate.promptTemplate || template.prompt || '',
        inputContext: updatedTemplate.contextTemplate || {},
        modelParameters: template.modelParameters,
        maxRetries: updatedTemplate.maxRetries ?? 3,
        timeout: updatedTemplate.timeout ?? 60,
        tags: updatedTemplate.tags || [],
        category: updatedTemplate.category ?? 'GENERAL',
        templateType: updatedTemplate.templateType ?? undefined,
        protocol: updatedTemplate.metadata?.protocol ?? template.protocol ?? undefined,
        loadProtocols: updatedTemplate.metadata?.loadProtocols ?? false,
        mcpTools: updatedTemplate.metadata?.mcpToolConfiguration?.selectedTools ?? template.mcpTools,
        createdAt: updatedTemplate.createdAt,
        updatedAt: updatedTemplate.updatedAt,
        isBuiltIn: updatedTemplate.isBuiltIn || false
      };

      return {
        success: true,
        data: transformedTemplate,
      };
    } catch (error) {
      povLogger.error({ err: error }, 'failed to update agent template');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      };
    }
  },

  /**
   * Delete an agent template
   * @param id Template ID
   * @returns Success status
   */
  async deleteTemplate(id: string): Promise<ApiResponse<void>> {
    try {
      // Validate ID
      if (!id) {
        return {
          success: false,
          error: 'Template ID is required',
        };
      }
      
      // Use our new API endpoint
      const response = await fetchWithAuth(`/api/agent-templates/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        
        // Handle specific error cases
        if (data.error?.code === 'NOT_FOUND') {
          return {
            success: false,
            error: 'Template not found. Please ensure the template ID is correct.',
          };
        }
        
        if (data.error?.code === 'FORBIDDEN') {
          return {
            success: false,
            error: 'Cannot delete built-in templates.',
          };
        }
        
        return {
          success: false,
          error: data.error?.message || 'Failed to delete agent template',
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      povLogger.error({ err: error }, 'failed to delete agent template');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      };
    }
  },
};

/**
 * Get mock templates for development
 * @returns Mock templates
 */
function getMockTemplates(): AgentTemplate[] {
  return [
    {
      id: 'senior-developer',
      name: 'Senior Software Developer',
      description: 'Experienced developer for complex coding tasks',
      role: 'Senior Software Developer',
      prompt: 'You are a senior software developer with expertise in modern web technologies. Help with coding tasks, architecture decisions, and best practices.',
      inputContext: {
        projectType: 'web application',
        technologies: ['React', 'TypeScript', 'Node.js'],
        complexity: 'high'
      },
      modelParameters: {
        provider: LLMProvider.ANTHROPIC_SDK,
        model: 'claude-haiku-4-5',
        temperature: 0.3,
        maxTokens: DEFAULT_MAX_TOKENS,
        stopSequences: [],
        useSystemPrompt: true,
        systemPrompt: 'You are a senior software developer with expertise in modern web technologies.',
      },
      maxRetries: 3,
      timeout: 120,
      tags: ['development', 'senior', 'web', 'architecture'],
      createdAt: '2025-06-10T00:00:00Z',
      updatedAt: '2025-06-10T00:00:00Z',
      isBuiltIn: true
    },
    {
      id: 'qa-engineer',
      name: 'QA Engineer',
      description: 'Quality assurance specialist for testing and validation',
      role: 'QA Engineer',
      prompt: 'You are a QA engineer focused on quality assurance, testing strategies, and bug identification. Help with test planning and quality validation.',
      inputContext: {
        testingType: 'automated',
        frameworks: ['Jest', 'Cypress', 'Playwright'],
        coverage: 'comprehensive'
      },
      modelParameters: {
        provider: LLMProvider.ANTHROPIC_SDK,
        model: 'claude-haiku-4-5',
        temperature: 0.2,
        maxTokens: DEFAULT_MAX_TOKENS,
        stopSequences: [],
        useSystemPrompt: true,
        systemPrompt: 'You are a QA engineer focused on quality assurance and testing.',
      },
      maxRetries: 2,
      timeout: 90,
      tags: ['testing', 'qa', 'quality', 'automation'],
      createdAt: '2025-06-10T00:00:00Z',
      updatedAt: '2025-06-10T00:00:00Z',
      isBuiltIn: true
    }
  ];
}

// Export the adapter as the main service for backward compatibility
export const AgentTemplateService = AgentTemplateServiceAdapter;
export { AgentTemplateServiceAdapter as default };
