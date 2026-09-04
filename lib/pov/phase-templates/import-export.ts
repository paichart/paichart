import { povLogger } from '@/lib/logger';

const localLogger = povLogger.child({ module: 'PhaseTemplateImportExport' });

/**
 * Service for importing and exporting phase templates
 */

/**
 * Import options for phase templates
 */
export interface PhaseTemplateImportOptions {
  validateOnly?: boolean;
  overwrite?: boolean;
  createMissing?: boolean;
}

/**
 * Import result for phase templates
 */
export interface PhaseTemplateImportResult {
  success: boolean;
  validateOnly: boolean;
  results: {
    valid: number;
    invalid: number;
    invalidDetails: Array<{
      template: any;
      errors: string[];
    }>;
  };
}

/**
 * Export format for phase templates
 */
export interface PhaseTemplateExport {
  version: string;
  exportedAt: string;
  templates: Array<{
    id: string;
    name: string;
    description: string;
    type: string;
    isDefault: boolean;
    workflow: any;
  }>;
}

/**
 * Import phase templates
 * @param templates Array of templates to import
 * @param options Import options
 * @returns Import result
 */
export async function importPhaseTemplates(
  templates: any[],
  options: PhaseTemplateImportOptions = {}
): Promise<PhaseTemplateImportResult> {
  try {
    const response = await fetch('/api/phase-templates/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        templates,
        options
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to import phase templates');
    }
    
    return await response.json();
  } catch (error) {
    localLogger.error({ err: error }, 'error importing phase templates');
    throw error;
  }
}

/**
 * Export phase templates
 * @param templateIds Optional array of template IDs to export
 * @param exportAll Whether to export all templates
 * @returns Exported templates
 */
export async function exportPhaseTemplates(
  templateIds?: string[],
  exportAll: boolean = false
): Promise<PhaseTemplateExport> {
  try {
    let url = '/api/phase-templates/export';
    const params = new URLSearchParams();
    
    if (templateIds && templateIds.length > 0) {
      params.set('ids', templateIds.join(','));
    } else if (exportAll) {
      params.set('all', 'true');
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to export phase templates');
    }
    
    return await response.json();
  } catch (error) {
    localLogger.error({ err: error }, 'error exporting phase templates');
    throw error;
  }
}

/**
 * Download phase templates as a JSON file
 * @param templates Templates to download
 * @param filename Filename for the download
 */
export function downloadPhaseTemplates(
  templates: PhaseTemplateExport,
  filename: string = 'phase-templates.json'
): void {
  const json = JSON.stringify(templates, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * Parse a JSON file containing phase templates
 * @param file File object containing JSON data
 * @returns Parsed templates
 */
export async function parsePhaseTemplatesFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        
        // Check if the file has the expected format
        if (json.templates && Array.isArray(json.templates)) {
          resolve(json.templates);
        } else if (Array.isArray(json)) {
          resolve(json);
        } else {
          reject(new Error('Invalid file format: Expected an array of templates or an object with a templates array'));
        }
      } catch (error) {
        reject(new Error('Failed to parse JSON file'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}
