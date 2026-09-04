/**
 * Template Application API Integration
 * Provides API functions for template application in POV creation
 */

export interface TemplateApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
}

export interface POVTemplateData {
  id: string;
  name: string;
  description: string;
  fields: any[];
  sections: any[];
  metadata?: {
    tags?: string[];
    phaseTemplates?: string[];
    [key: string]: any;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface TemplateFieldValue {
  fieldId: string;
  value: any;
  sectionId?: string;
}

export interface POVFromTemplateData {
  templateId: string;
  fieldValues: Record<string, any>;
  phaseTemplateIds?: string[];
  metadata?: {
    templateName?: string;
    appliedAt?: string;
    [key: string]: any;
  };
}

/**
 * Fetch all available POV templates
 */
export async function fetchPovTemplates(): Promise<TemplateApiResponse<POVTemplateData[]>> {
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
      data: Array.isArray(data) ? data : data.templates || []
    };
  } catch {
    return {
      success: false,
      error: 'Network error while fetching POV templates'
    };
  }
}

/**
 * Fetch a specific POV template by ID with all fields and sections
 */
export async function fetchTemplateById(templateId: string): Promise<TemplateApiResponse<POVTemplateData>> {
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
        error: errorData.error || 'Failed to fetch template',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data.template || data
    };
  } catch {
    return {
      success: false,
      error: 'Network error while fetching template'
    };
  }
}

/**
 * Apply template data to create a new POV
 */
export async function applyTemplateToPoV(
  templateId: string, 
  fieldValues: Record<string, any>,
  options?: {
    phaseTemplateIds?: string[];
    metadata?: Record<string, any>;
  }
): Promise<TemplateApiResponse<any>> {
  try {
    const requestData: POVFromTemplateData = {
      templateId,
      fieldValues,
      phaseTemplateIds: options?.phaseTemplateIds,
      metadata: {
        templateName: 'Unknown Template', // Will be filled by API
        appliedAt: new Date().toISOString(),
        ...options?.metadata
      }
    };

    const response = await fetch('/api/pov/from-template', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to create POV from template',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data.pov || data
    };
  } catch {
    return {
      success: false,
      error: 'Network error while creating POV from template'
    };
  }
}

/**
 * Validate template field values before applying
 */
export async function validateTemplateFieldValues(
  templateId: string,
  fieldValues: Record<string, any>
): Promise<TemplateApiResponse<{ isValid: boolean; errors: string[] }>> {
  try {
    const response = await fetch('/api/pov-templates/validate-fields', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        templateId,
        fieldValues
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to validate template fields',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: {
        isValid: data.isValid || false,
        errors: data.errors || []
      }
    };
  } catch {
    return {
      success: false,
      error: 'Network error while validating template fields'
    };
  }
}

/**
 * Get template usage statistics
 */
export async function getTemplateUsageStats(templateId: string): Promise<TemplateApiResponse<{
  usageCount: number;
  lastUsed?: string;
  popularFields?: string[];
}>> {
  try {
    const response = await fetch(`/api/pov-templates/${templateId}/stats`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to fetch template stats',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: {
        usageCount: data.usageCount || 0,
        lastUsed: data.lastUsed,
        popularFields: data.popularFields || []
      }
    };
  } catch {
    return {
      success: false,
      error: 'Network error while fetching template stats'
    };
  }
}

/**
 * Search POV templates with filters
 */
export async function searchPovTemplates(searchParams: {
  query?: string;
  tags?: string[];
  sortBy?: 'name' | 'created' | 'updated' | 'usage';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}): Promise<TemplateApiResponse<{
  templates: POVTemplateData[];
  total: number;
  hasMore: boolean;
}>> {
  try {
    const queryParams = new URLSearchParams();
    
    if (searchParams.query) {
      queryParams.append('q', searchParams.query);
    }
    if (searchParams.tags?.length) {
      queryParams.append('tags', searchParams.tags.join(','));
    }
    if (searchParams.sortBy) {
      queryParams.append('sortBy', searchParams.sortBy);
    }
    if (searchParams.sortOrder) {
      queryParams.append('sortOrder', searchParams.sortOrder);
    }
    if (searchParams.limit) {
      queryParams.append('limit', searchParams.limit.toString());
    }
    if (searchParams.offset) {
      queryParams.append('offset', searchParams.offset.toString());
    }

    const response = await fetch(`/api/pov-templates/search?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to search templates',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: {
        templates: data.templates || [],
        total: data.total || 0,
        hasMore: data.hasMore || false
      }
    };
  } catch {
    return {
      success: false,
      error: 'Network error while searching templates'
    };
  }
}

/**
 * Mark template as favorite for current user
 */
export async function toggleTemplateFavorite(
  templateId: string, 
  isFavorite: boolean
): Promise<TemplateApiResponse<{ isFavorite: boolean }>> {
  try {
    const response = await fetch(`/api/pov-templates/${templateId}/favorite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isFavorite }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to update template favorite status',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: { isFavorite: data.isFavorite }
    };
  } catch {
    return {
      success: false,
      error: 'Network error while updating template favorite'
    };
  }
}

/**
 * Get user's favorite templates
 */
export async function getFavoriteTemplates(): Promise<TemplateApiResponse<POVTemplateData[]>> {
  try {
    const response = await fetch('/api/pov-templates/favorites', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to fetch favorite templates',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data.templates || []
    };
  } catch {
    return {
      success: false,
      error: 'Network error while fetching favorite templates'
    };
  }
}

/**
 * Get recently used templates for current user
 */
export async function getRecentTemplates(limit: number = 5): Promise<TemplateApiResponse<POVTemplateData[]>> {
  try {
    const response = await fetch(`/api/pov-templates/recent?limit=${limit}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Failed to fetch recent templates',
        details: errorData.details
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data.templates || []
    };
  } catch {
    return {
      success: false,
      error: 'Network error while fetching recent templates'
    };
  }
}
