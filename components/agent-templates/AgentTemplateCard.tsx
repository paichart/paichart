'use client';

import React from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/Card';
import { Clock, Users, TrendingUp, Star, Settings, Play } from 'lucide-react';

interface AgentTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  defaultRole: string;
  priority: string;
  version: string;
  status: string;
  isDefault: boolean;
  tags: string[];
  usageCount: number;
  successRate?: number;
  averageTime?: number;
  createdAt: string;
  updatedAt: string;
}

interface AgentTemplateCardProps {
  template: AgentTemplate;
  onApply?: (templateId: string) => void;
  onEdit?: (templateId: string) => void;
  onView?: (templateId: string) => void;
  showActions?: boolean;
  compact?: boolean;
}

export function AgentTemplateCard({
  template,
  onApply,
  onEdit,
  onView,
  showActions = true,
  compact = false
}: AgentTemplateCardProps) {
  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      DEVELOPMENT: 'bg-blue-100 text-blue-800 border-blue-200',
      TESTING: 'bg-green-100 text-green-800 border-green-200',
      DOCUMENTATION: 'bg-purple-100 text-purple-800 border-purple-200',
      DEPLOYMENT: 'bg-orange-100 text-orange-800 border-orange-200',
      ANALYSIS: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      GENERAL: 'bg-gray-100 text-gray-800 border-gray-200',
      AUTOMATION: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      MONITORING: 'bg-red-100 text-red-800 border-red-200',
      REVIEW: 'bg-pink-100 text-pink-800 border-pink-200'
    };
    return colors[category] || colors.GENERAL;
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      HIGH: 'bg-red-100 text-red-800',
      MEDIUM: 'bg-yellow-100 text-yellow-800',
      LOW: 'bg-green-100 text-green-800',
      URGENT: 'bg-red-200 text-red-900'
    };
    return colors[priority] || colors.MEDIUM;
  };

  const formatTime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const formatSuccessRate = (rate?: number) => {
    if (rate === undefined || rate === null) return 'N/A';
    return `${Math.round(rate)}%`;
  };

  return (
    <Card className={`relative transition-all duration-200 hover:shadow-md ${compact ? 'h-auto' : 'h-full'}`}>
      {template.isDefault && (
        <div className="absolute top-2 right-2">
          <Star className="h-4 w-4 text-yellow-500 fill-current" />
        </div>
      )}
      
      <CardHeader className={compact ? 'pb-3' : 'pb-4'}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className={`${compact ? 'text-lg' : 'text-xl'} font-semibold text-gray-900`}>
              {template.name}
            </CardTitle>
            <CardDescription className={`mt-1 ${compact ? 'text-sm' : 'text-base'} text-gray-600`}>
              {template.description}
            </CardDescription>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge className={getCategoryColor(template.category)}>
            {template.category.toLowerCase()}
          </Badge>
          <Badge variant="outline" className={getPriorityColor(template.priority)}>
            {template.priority.toLowerCase()}
          </Badge>
          {template.status === 'ACTIVE' && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              active
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className={compact ? 'py-3' : 'py-4'}>
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            <span className="font-medium">Role:</span> {template.defaultRole}
          </div>
          
          {!compact && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">
                  {template.usageCount} uses
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">
                  {formatSuccessRate(template.successRate)} success
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">
                  ~{formatTime(template.averageTime)}
                </span>
              </div>
              
              <div className="text-gray-600">
                v{template.version}
              </div>
            </div>
          )}
          
          {template.tags && template.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {template.tags.slice(0, compact ? 3 : 5).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {template.tags.length > (compact ? 3 : 5) && (
                <Badge variant="secondary" className="text-xs">
                  +{template.tags.length - (compact ? 3 : 5)}
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardContent>

      {showActions && (
        <CardFooter className="pt-0">
          <div className="flex gap-2 w-full">
            {onApply && (
              <Button
                onClick={() => onApply(template.id)}
                className="flex-1"
                size="sm"
              >
                <Play className="h-4 w-4 mr-2" />
                Apply
              </Button>
            )}
            
            {onView && (
              <Button
                onClick={() => onView(template.id)}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                View
              </Button>
            )}
            
            {onEdit && (
              <Button
                onClick={() => onEdit(template.id)}
                variant="outline"
                size="sm"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

export default AgentTemplateCard;
