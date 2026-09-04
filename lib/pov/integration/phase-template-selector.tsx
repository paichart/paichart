import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PhaseTemplate } from '@/lib/pov/phase-templates/types';
import { templateService } from '@/lib/services/template-service'; // Import the service

interface PhaseTemplateSelectorProps {
  selectedTemplateIds: string[];
  onChange: (selectedIds: string[]) => void;
}

/**
 * Component for selecting phase templates to associate with a POV template
 */
export function PhaseTemplateSelector({ selectedTemplateIds, onChange }: PhaseTemplateSelectorProps) {
  const [selected, setSelected] = useState<string[]>(selectedTemplateIds || []);

  // Fetch phase templates
  const { data, isLoading, error } = useQuery({
    queryKey: ['phaseTemplates'],
    queryFn: async () => {
      // Use the unified template service to fetch and normalize data
      const templates = await templateService.listTemplates('phase');
      // The service returns PhaseTemplate | POVTemplate[], so we need to cast
      return templates as PhaseTemplate[];
    }
  });

  const templates = data || [];

  // Update parent component when selection changes
  useEffect(() => {
    onChange(selected);
  }, [selected, onChange]);

  // Handle template selection
  const toggleTemplate = (templateId: string) => {
    setSelected(prev => {
      if (prev.includes(templateId)) {
        return prev.filter(id => id !== templateId);
      } else {
        return [...prev, templateId];
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Select Phase Templates</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="border rounded-lg p-4 space-y-2">
              <div className="h-6 w-3/4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 w-full bg-gray-200 rounded animate-pulse mb-2"></div>
              <div className="h-4 w-2/3 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 rounded-md text-red-800">
        <p>Error loading phase templates. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Select Phase Templates</h3>
        <span className="px-2 py-1 text-xs rounded-full border">{selected.length} selected</span>
      </div>
      
      {templates.length === 0 ? (
        <p className="text-gray-500">No phase templates available. Create phase templates first.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(template => (
            <div 
              key={template.id} 
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                selected.includes(template.id) ? 'border-blue-500 bg-blue-50' : ''
              }`}
              onClick={() => toggleTemplate(template.id)}
            >
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-medium">{template.name}</h4>
                <input 
                  type="checkbox" 
                  checked={selected.includes(template.id)}
                  onChange={() => toggleTemplate(template.id)}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  className="h-4 w-4"
                />
              </div>
              <span className="inline-block px-2 py-0.5 text-xs border rounded-full mb-2">
                {template.type || 'Default'}
              </span>
              <p className="text-sm text-gray-600 line-clamp-2">
                {template.description || 'No description provided'}
              </p>
            </div>
          ))}
        </div>
      )}
      
      <div className="flex justify-end space-x-2 pt-4">
        <button 
          className="px-4 py-2 border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setSelected([])}
          disabled={selected.length === 0}
        >
          Clear Selection
        </button>
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => templates && setSelected(templates.map(t => t.id))}
          disabled={templates.length === 0 || selected.length === templates.length}
        >
          Select All
        </button>
      </div>
    </div>
  );
}
