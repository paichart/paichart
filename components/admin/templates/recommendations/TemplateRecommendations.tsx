"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { AlertCircle, CheckCircle, Info, Star, ThumbsUp, Plus } from 'lucide-react';
import { POVTemplate } from '@/lib/pov/templates/types';

interface PhaseTemplate {
  id: string;
  name: string;
  description: string;
  status: string;
  compatibility?: number; // 0-100 score
  usageCount?: number;
  tags?: string[];
}

interface TemplateRecommendationsProps {
  povTemplate: POVTemplate;
  onSelectTemplate: (templateId: string) => void;
}

export function TemplateRecommendations({ povTemplate, onSelectTemplate }: TemplateRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<PhaseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch recommendations on component mount
  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        setLoading(true);
        
        // In a real implementation, this would be an API call that analyzes the POV template
        // and returns recommended phase templates based on compatibility, usage patterns, etc.
        // For now, we'll simulate this with a timeout and mock data
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock recommendations data
        const mockRecommendations: PhaseTemplate[] = [
          {
            id: 'phase-1',
            name: 'Discovery Phase',
            description: 'Initial discovery and requirements gathering',
            status: 'published',
            compatibility: 95,
            usageCount: 28,
            tags: ['discovery', 'requirements']
          },
          {
            id: 'phase-2',
            name: 'Implementation Phase',
            description: 'Implementation and development work',
            status: 'published',
            compatibility: 87,
            usageCount: 24,
            tags: ['implementation', 'development']
          },
          {
            id: 'phase-3',
            name: 'Testing Phase',
            description: 'Testing and quality assurance',
            status: 'published',
            compatibility: 82,
            usageCount: 22,
            tags: ['testing', 'qa']
          },
          {
            id: 'phase-4',
            name: 'Evaluation Phase',
            description: 'Evaluation and feedback collection',
            status: 'published',
            compatibility: 78,
            usageCount: 18,
            tags: ['evaluation', 'feedback']
          },
          {
            id: 'phase-5',
            name: 'Handover Phase',
            description: 'Project handover and documentation',
            status: 'published',
            compatibility: 75,
            usageCount: 15,
            tags: ['handover', 'documentation']
          }
        ];
        
        setRecommendations(mockRecommendations);
      } catch {
        setError('Failed to load recommendations. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, [povTemplate]);
  
  // Get compatibility color based on score
  const getCompatibilityColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 75) return 'text-blue-500';
    if (score >= 60) return 'text-amber-500';
    return 'text-gray-500';
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <Spinner size="lg" />
        <span className="ml-2 text-muted-foreground">Analyzing template and generating recommendations...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }
  
  if (recommendations.length === 0) {
    return (
      <div className="text-center p-8 border rounded-lg bg-gray-50">
        <Info className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <p className="text-gray-500">No recommendations available for this template.</p>
            <p className="text-sm text-gray-400 mt-1">
              Try adding more fields or sections to get better recommendations.
            </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-md">
        <div className="flex items-start">
          <Info className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-800">Smart Recommendations</h3>
            <p className="text-sm text-blue-700 mt-1">
              Based on your template structure, we&apos;ve analyzed and recommended the following phase templates.
              These recommendations consider field compatibility, common usage patterns, and successful POV outcomes.
            </p>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        {recommendations.map((template) => (
          <Card key={template.id} className="overflow-hidden">
            <div className={`h-1 ${
              template.compatibility && template.compatibility >= 90 
                ? 'bg-green-500' 
                : template.compatibility && template.compatibility >= 75
                ? 'bg-blue-500'
                : 'bg-amber-500'
            }`}></div>
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center">
                    <h3 className="font-medium">{template.name}</h3>
                    {template.compatibility && template.compatibility >= 90 && (
                      <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200">
                        <ThumbsUp className="h-3 w-3 mr-1" />
                        Highly Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                  
                  <div className="flex items-center mt-2 space-x-4">
                    {template.compatibility && (
                      <div className="flex items-center">
                        <span className={`font-medium ${getCompatibilityColor(template.compatibility)}`}>
                          {template.compatibility}%
                        </span>
                        <span className="text-xs text-gray-500 ml-1">compatibility</span>
                      </div>
                    )}
                    
                    {template.usageCount && (
                      <div className="flex items-center">
                        <span className="font-medium text-gray-700">{template.usageCount}</span>
                        <span className="text-xs text-gray-500 ml-1">POVs</span>
                      </div>
                    )}
                    
                    {template.status && (
                      <Badge variant={
                        template.status === 'published' 
                          ? 'success' 
                          : template.status === 'deprecated'
                          ? 'destructive'
                          : 'default'
                      } className="text-xs">
                        {template.status}
                      </Badge>
                    )}
                  </div>
                  
                  {template.tags && template.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {template.tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelectTemplate(template.id)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              
              {template.compatibility && template.compatibility >= 90 && (
                <div className="mt-3 p-2 bg-green-50 rounded text-sm text-green-700 flex items-start">
                  <CheckCircle className="h-4 w-4 mr-2 mt-0.5 text-green-500" />
                  <span>
                    Perfect match! This phase template is highly compatible with your POV structure
                    and has been successfully used in similar POVs.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="flex justify-between items-center pt-4 border-t">
        <div className="flex items-center text-sm text-gray-500">
          <Star className="h-4 w-4 mr-1 text-amber-400" />
          <span>Recommendations are based on template structure and historical usage patterns</span>
        </div>
        
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Refresh Recommendations
        </Button>
      </div>
    </div>
  );
}

export default TemplateRecommendations;
