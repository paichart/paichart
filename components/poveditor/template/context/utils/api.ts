/**
 * Template Editor API Integration
 * Provides API functions for template operations
 */

import { TemplateType } from '../types/TemplateEditorState';

/**
 * API Response Types
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
}

export interface TemplateApiData {
  id?: string;
  name: string;
  description: string;
  type?: string;
  isDefault?: boolean;
  fields?: any[];
  sections?: any[];
  stages?: any[];
  metadata?: any;
  tags?: string[];
  version?: string;
}

/**
 * POV Template API Functions
 */
export async function fetchPovTemplates(): Promise<ApiResponse<any[]>> {
  try {
    const response = await fetch('/api/pov-templates', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to fetch POV templates',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data.templates || data
    };
  } catch (error) {
        return {
      success: false,
      error: 'Network error while fetching POV templates'
    };
  }
}

export async function fetchPovTemplate(templateId: string): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`/api/pov-templates/${templateId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to fetch POV template',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data.template || data
    };
  } catch (error) {
        return {
      success: false,
      error: 'Network error while fetching POV template'
    };
  }
}

export async function savePovTemplate(templateId: string | undefined, templateData: TemplateApiData): Promise<ApiResponse<any>> {
  try {
    const url = templateId ? `/api/pov-templates/${templateId}` : '/api/pov-templates';
    const method = templateId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(templateData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to save POV template',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data.template || data
    };
  } catch (error) {
        return {
      success: false,
      error: 'Network error while saving POV template'
    };
  }
}

export async function deletePovTemplate(templateId: string): Promise<ApiResponse<void>> {
  try {
    const response = await fetch(`/api/pov-templates/${templateId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to delete POV template',
        details: errorData.details
      };
    }

    return {
      success: true
    };
  } catch (error) {
        return {
      success: false,
      error: 'Network error while deleting POV template'
    };
  }
}

/**
 * Phase Template API Functions
 */
export async function fetchPhaseTemplates(filters?: { type?: string; isDefault?: boolean }): Promise<ApiResponse<any[]>> {
  try {
    const searchParams = new URLSearchParams();
    if (filters?.type) {
      searchParams.append('type', filters.type);
    }
    if (filters?.isDefault !== undefined) {
      searchParams.append('isDefault', filters.isDefault.toString());
    }

    const url = `/api/phase-templates${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to fetch phase templates',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: Array.isArray(data) ? data : data.templates || []
    };
  } catch (error) {
        return {
      success: false,
      error: 'Network error while fetching phase templates'
    };
  }
}

export async function fetchPhaseTemplate(templateId: string): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`/api/phase-templates/${templateId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to fetch phase template',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data.template || data
    };
  } catch (error) {
        return {
      success: false,
      error: 'Network error while fetching phase template'
    };
  }
}

export async function savePhaseTemplate(templateId: string | undefined, templateData: TemplateApiData): Promise<ApiResponse<any>> {
  try {
    const url = templateId ? `/api/phase-templates/${templateId}` : '/api/phase-templates';
    const method = templateId ? 'PUT' : 'POST';

    // Transform template data for phase template API
    const phaseTemplateData = {
      name: templateData.name,
      description: templateData.description,
      type: templateData.type || 'PLANNING',
      isDefault: templateData.isDefault || false,
      stages: templateData.stages || [],
      metadata: templateData.metadata
    };

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(phaseTemplateData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to save phase template',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data.template || data
    };
  } catch (error) {
        return {
      success: false,
      error: 'Network error while saving phase template'
    };
  }
}

export async function deletePhaseTemplate(templateId: string): Promise<ApiResponse<void>> {
  try {
    const response = await fetch(`/api/phase-templates/${templateId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to delete phase template',
        details: errorData.details
      };
    }

    return {
      success: true
    };
  } catch (error) {
        return {
      success: false,
      error: 'Network error while deleting phase template'
    };
  }
}

/**
 * Phase Template Import/Export Functions
 */
export async function importPhaseTemplate(file: File): Promise<ApiResponse<any>> {
  try {
    // Read and parse the file content
    const text = await file.text();
    const fileData = JSON.parse(text);
    
    // Prepare the import data in the format expected by the API
    let templates;
    if (Array.isArray(fileData)) {
      // If the file contains an array of templates
      templates = fileData;
    } else if (fileData.templates && Array.isArray(fileData.templates)) {
      // If the file contains a wrapper object with templates array
      templates = fileData.templates;
    } else {
      // If the file contains a single template
      templates = [fileData];
    }

    const importData = {
      templates,
      options: {
        validateOnly: false,
        overwrite: false,
        createMissing: true
      }
    };

    const response = await fetch('/api/phase-templates/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(importData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to import phase template',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data.results || data
    };
  } catch (error) {
        return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error while importing phase template'
    };
  }
}

export async function exportPhaseTemplate(templateId: string): Promise<ApiResponse<Blob>> {
  try {
    const response = await fetch(`/api/phase-templates/export?templateId=${templateId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to export phase template',
        details: errorData.details
      };
    }

    const blob = await response.blob();
    return {
      success: true,
      data: blob
    };
  } catch (error) {
        return {
      success: false,
      error: 'Network error while exporting phase template'
    };
  }
}

/**
 * Template Validation Functions
 */
export async function validatePhaseTemplate(templateData: any): Promise<ApiResponse<any>> {
  try {
    const response = await fetch('/api/phase-templates/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(templateData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Template validation failed',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data
    };
  } catch (error) {
        return {
      success: false,
      error: 'Network error while validating phase template'
    };
  }
}

/**
 * Unified Template API Functions
 */
export async function fetchTemplate(templateId: string, templateType: TemplateType): Promise<ApiResponse<any>> {
  switch (templateType) {
    case 'pov':
      return fetchPovTemplate(templateId);
    case 'phase':
      return fetchPhaseTemplate(templateId);
    default:
      return {
        success: false,
        error: `Unsupported template type: ${templateType}`
      };
  }
}

export async function saveTemplate(templateId: string | undefined, templateData: TemplateApiData, templateType: TemplateType): Promise<ApiResponse<any>> {
  switch (templateType) {
    case 'pov':
      return savePovTemplate(templateId, templateData);
    case 'phase':
      return savePhaseTemplate(templateId, templateData);
    default:
      return {
        success: false,
        error: `Unsupported template type: ${templateType}`
      };
  }
}

export async function deleteTemplate(templateId: string, templateType: TemplateType): Promise<ApiResponse<void>> {
  switch (templateType) {
    case 'pov':
      return deletePovTemplate(templateId);
    case 'phase':
      return deletePhaseTemplate(templateId);
    default:
      return {
        success: false,
        error: `Unsupported template type: ${templateType}`
      };
  }
}

export async function fetchTemplates(templateType: TemplateType, filters?: any): Promise<ApiResponse<any[]>> {
  switch (templateType) {
    case 'pov':
      return fetchPovTemplates();
    case 'phase':
      return fetchPhaseTemplates(filters);
    default:
      return {
        success: false,
        error: `Unsupported template type: ${templateType}`
      };
  }
}
