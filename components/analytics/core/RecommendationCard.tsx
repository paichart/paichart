'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { BLOOMBERG_COLORS, BLOOMBERG_VARIANTS } from '@/lib/constants/bloomberg-styles';

/**
 * Recommendation Types from Analytics API
 * Maps to /api/analytics?domain=tasks&metrics=insights
 */
export type RecommendationType =
  | 'RISK_MITIGATION'
  | 'WORKLOAD_BALANCING'
  | 'PRODUCTIVITY_IMPROVEMENT'
  | 'BOTTLENECK_RESOLUTION';

export type RecommendationPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Recommendation {
  type: RecommendationType | string;
  priority: RecommendationPriority;
  title: string;
  description: string;
  actionItems: string[];
}

interface RecommendationCardProps extends Recommendation {
  /** Optional callback when user clicks an action item */
  onAction?: (action: string, type: string) => void;
  /** Optional callback to generate prompt for copying */
  onCopyPrompt?: (action: string, type: string) => string;
  /** Show action buttons on items (default: false) */
  showActionButtons?: boolean;
}

/**
 * RecommendationCard Component
 * Displays AI-generated recommendations with priority styling and action items
 *
 * Features:
 * - Priority-based styling (HIGH=red, MEDIUM=yellow, LOW=default)
 * - Type badge showing recommendation category
 * - Expandable action items list
 * - Optional action buttons for navigation/execution
 *
 * Used by:
 * - InsightsTab (AI recommendations section)
 * - AnalyticsSection (embedded POV analytics)
 * - Future: Any view showing AI recommendations
 */
export function RecommendationCard({
  type,
  priority,
  title,
  description,
  actionItems,
  onAction,
  onCopyPrompt,
  showActionButtons = false,
}: RecommendationCardProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (action: string, index: number) => {
    if (!onCopyPrompt) return;
    const prompt = onCopyPrompt(action, type);
    await navigator.clipboard.writeText(prompt);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const priorityStyles: Record<RecommendationPriority, string> = {
    HIGH: BLOOMBERG_VARIANTS.danger,
    MEDIUM: BLOOMBERG_VARIANTS.warning,
    LOW: BLOOMBERG_VARIANTS.neutral,
  };

  const priorityVariant: Record<RecommendationPriority, 'destructive' | 'default' | 'secondary'> = {
    HIGH: 'destructive',
    MEDIUM: 'default',
    LOW: 'secondary',
  };

  // Format type for display (RISK_MITIGATION → Risk Mitigation)
  const formatType = (t: string) =>
    t.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');

  return (
    <Card className={priorityStyles[priority] || priorityStyles.LOW}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={priorityVariant[priority] || 'secondary'}>
              {priority}
            </Badge>
            <Badge variant="outline">{formatType(type)}</Badge>
          </div>
        </div>
        <CardTitle className="text-base mt-2">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">{description}</p>

        {actionItems && actionItems.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2">Recommended Actions:</p>
            <ul className="space-y-1">
              {actionItems.map((item, index) => (
                <li
                  key={index}
                  className="text-xs text-muted-foreground flex items-start gap-2"
                >
                  <span className="text-primary mt-0.5">•</span>
                  <span className="flex-1">{item}</span>
                  {showActionButtons && (
                    <div className="flex items-center gap-1">
                      {onCopyPrompt && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(item, index)}
                          className="text-xs h-6 px-2"
                          title="Copy prompt to clipboard"
                        >
                          {copiedIndex === index ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                      {onAction && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onAction(item, type)}
                          className="text-xs h-6 px-2"
                        >
                          Go →
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Empty State for Recommendations
 * Shows when no recommendations are present (project on track)
 */
export function NoRecommendationsCard() {
  return (
    <Card className={BLOOMBERG_VARIANTS.success}>
      <CardContent className="p-6">
        <p className={`text-center ${BLOOMBERG_COLORS.success}`}>
          No critical recommendations - Project is on track!
        </p>
      </CardContent>
    </Card>
  );
}
