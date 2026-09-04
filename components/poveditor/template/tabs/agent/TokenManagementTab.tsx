"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Slider } from '@/components/ui/Slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { AlertTriangle, DollarSign, TrendingUp, Settings, Info, Calculator } from 'lucide-react';
import { AgentTabProps, TokenManagementConfig } from './types';

interface TokenUsageEstimate {
  dailyEstimate: number;
  monthlyEstimate: number;
  costEstimate: number;
  efficiency: number;
}

/**
 * Token Management Tab Component
 * 
 * Provides comprehensive token budget management, optimization settings, and cost tracking.
 * Includes budget limits, dynamic allocation, optimization features, and usage analytics.
 */
export function TokenManagementTab({ templateId, isReadOnly = false }: AgentTabProps) {
  // State management
  const [tokenConfig, setTokenConfig] = useState<TokenManagementConfig>({
    budgetLimits: {
      maxPerRequest: 4000,
      maxPerHour: 50000,
      maxPerDay: 500000,
      alertThreshold: 80
    },
    optimization: {
      enableDynamicAllocation: true,
      enablePromptCompression: false,
      enableCaching: true,
      complexityMultiplier: 1.0,
      adaptiveScaling: true
    },
    costTracking: {
      enableCostAlerts: true,
      dailyBudget: 50.0,
      monthlyBudget: 1500.0,
      costPerToken: 0.00002
    },
    performanceSettings: {
      priorityMode: 'balanced',
      qualityThreshold: 0.85,
      speedThreshold: 5000,
      enablePerformanceOptimization: true
    }
  });

  const [usageEstimate, setUsageEstimate] = useState<TokenUsageEstimate>({
    dailyEstimate: 0,
    monthlyEstimate: 0,
    costEstimate: 0,
    efficiency: 0
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  const calculateUsageEstimate = useCallback(() => {
    const { budgetLimits, costTracking, optimization } = tokenConfig;
    
    // Estimate daily usage based on limits and optimization
    const baseDaily = Math.min(budgetLimits.maxPerDay || 500000, 100000);
    const optimizationFactor = optimization.enablePromptCompression ? 0.8 : 1.0;
    const cachingFactor = optimization.enableCaching ? 0.7 : 1.0;
    
    const dailyEstimate = baseDaily * optimizationFactor * cachingFactor;
    const monthlyEstimate = dailyEstimate * 30;
    const costEstimate = dailyEstimate * (costTracking.costPerToken || 0.00002);
    const efficiency = (1 - (optimizationFactor * cachingFactor - 0.5)) * 100;

    setUsageEstimate({
      dailyEstimate: Math.round(dailyEstimate),
      monthlyEstimate: Math.round(monthlyEstimate),
      costEstimate: Math.round(costEstimate * 100) / 100,
      efficiency: Math.round(efficiency)
    });
  }, [tokenConfig]);

  // Calculate usage estimates when config changes
  useEffect(() => {
    calculateUsageEstimate();
  }, [calculateUsageEstimate]);

  const handleBudgetChange = (field: keyof TokenManagementConfig['budgetLimits'], value: number) => {
    setTokenConfig(prev => ({
      ...prev,
      budgetLimits: {
        ...prev.budgetLimits,
        [field]: value
      }
    }));
  };

  const handleOptimizationChange = (field: keyof TokenManagementConfig['optimization'], value: any) => {
    setTokenConfig(prev => ({
      ...prev,
      optimization: {
        ...prev.optimization,
        [field]: value
      }
    }));
  };

  const handleCostTrackingChange = (field: keyof TokenManagementConfig['costTracking'], value: any) => {
    setTokenConfig(prev => ({
      ...prev,
      costTracking: {
        ...prev.costTracking,
        [field]: value
      }
    }));
  };

  const handlePerformanceChange = (field: keyof TokenManagementConfig['performanceSettings'], value: any) => {
    setTokenConfig(prev => ({
      ...prev,
      performanceSettings: {
        ...prev.performanceSettings,
        [field]: value
      }
    }));
  };

  const getBudgetStatus = (current: number, max: number, threshold: number) => {
    const percentage = (current / max) * 100;
    if (percentage >= threshold) return 'danger';
    if (percentage >= threshold * 0.7) return 'warning';
    return 'safe';
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div className="bg-primary/10 border border-primary/20 rounded-md p-4">
        <h3 className="font-medium mb-2">Token Management Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Configure token budgets, optimization settings, and cost tracking for this agent template.
          Optimize performance while controlling costs and ensuring efficient resource usage.
        </p>
      </div>

      {/* Usage Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calculator className="h-5 w-5 mr-2" />
            Usage Estimates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{formatNumber(usageEstimate.dailyEstimate)}</div>
              <div className="text-sm text-muted-foreground">Daily Tokens</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{formatNumber(usageEstimate.monthlyEstimate)}</div>
              <div className="text-sm text-muted-foreground">Monthly Tokens</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{formatCurrency(usageEstimate.costEstimate)}</div>
              <div className="text-sm text-muted-foreground">Daily Cost</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{usageEstimate.efficiency}%</div>
              <div className="text-sm text-muted-foreground">Efficiency</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="budgets" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="budgets">Budget Limits</TabsTrigger>
          <TabsTrigger value="optimization">Optimization</TabsTrigger>
          <TabsTrigger value="cost-tracking">Cost Tracking</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* Budget Limits Tab */}
        <TabsContent value="budgets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DollarSign className="h-5 w-5 mr-2" />
                Token Budget Limits
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Set maximum token usage limits to control costs and prevent overuse
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Max Tokens Per Request</Label>
                  <Input
                    type="number"
                    value={tokenConfig.budgetLimits.maxPerRequest}
                    onChange={(e) => handleBudgetChange('maxPerRequest', parseInt(e.target.value) || 0)}
                    placeholder="4000"
                    disabled={isReadOnly}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum tokens for a single agent request
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Alert Threshold (%)</Label>
                  <Input
                    type="number"
                    value={tokenConfig.budgetLimits.alertThreshold}
                    onChange={(e) => handleBudgetChange('alertThreshold', parseInt(e.target.value) || 0)}
                    placeholder="80"
                    min={1}
                    max={100}
                    disabled={isReadOnly}
                  />
                  <p className="text-xs text-muted-foreground">
                    Alert when usage reaches this percentage of limit
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Max Tokens Per Hour</Label>
                  <Input
                    type="number"
                    value={tokenConfig.budgetLimits.maxPerHour || ''}
                    onChange={(e) => {
                      const value = e.target.value ? parseInt(e.target.value) : undefined;
                      setTokenConfig(prev => ({
                        ...prev,
                        budgetLimits: {
                          ...prev.budgetLimits,
                          maxPerHour: value
                        }
                      }));
                    }}
                    placeholder="50000"
                    disabled={isReadOnly}
                  />
                  <p className="text-xs text-muted-foreground">
                    Hourly token usage limit (optional)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Max Tokens Per Day</Label>
                  <Input
                    type="number"
                    value={tokenConfig.budgetLimits.maxPerDay || ''}
                    onChange={(e) => {
                      const value = e.target.value ? parseInt(e.target.value) : undefined;
                      setTokenConfig(prev => ({
                        ...prev,
                        budgetLimits: {
                          ...prev.budgetLimits,
                          maxPerDay: value
                        }
                      }));
                    }}
                    placeholder="500000"
                    disabled={isReadOnly}
                  />
                  <p className="text-xs text-muted-foreground">
                    Daily token usage limit (optional)
                  </p>
                </div>
              </div>

              {/* Budget Status Indicators */}
              <div className="space-y-3">
                <Label>Current Budget Status</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex items-center justify-between p-3 border rounded-md">
                    <span className="text-sm">Per Request</span>
                    <Badge variant="outline">
                      {formatNumber(tokenConfig.budgetLimits.maxPerRequest)} tokens
                    </Badge>
                  </div>
                  {tokenConfig.budgetLimits.maxPerHour && (
                    <div className="flex items-center justify-between p-3 border rounded-md">
                      <span className="text-sm">Per Hour</span>
                      <Badge variant="outline">
                        {formatNumber(tokenConfig.budgetLimits.maxPerHour)} tokens
                      </Badge>
                    </div>
                  )}
                  {tokenConfig.budgetLimits.maxPerDay && (
                    <div className="flex items-center justify-between p-3 border rounded-md">
                      <span className="text-sm">Per Day</span>
                      <Badge variant="outline">
                        {formatNumber(tokenConfig.budgetLimits.maxPerDay)} tokens
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Optimization Tab */}
        <TabsContent value="optimization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="h-5 w-5 mr-2" />
                Token Optimization
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure optimization features to reduce token usage while maintaining quality
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Dynamic Token Allocation</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically adjust token allocation based on task complexity
                    </p>
                  </div>
                  <Switch
                    checked={tokenConfig.optimization.enableDynamicAllocation}
                    onCheckedChange={(checked) => handleOptimizationChange('enableDynamicAllocation', checked)}
                    disabled={isReadOnly}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Prompt Compression</Label>
                    <p className="text-sm text-muted-foreground">
                      Compress prompts to reduce token usage while maintaining quality
                    </p>
                  </div>
                  <Switch
                    checked={tokenConfig.optimization.enablePromptCompression}
                    onCheckedChange={(checked) => handleOptimizationChange('enablePromptCompression', checked)}
                    disabled={isReadOnly}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Response Caching</Label>
                    <p className="text-sm text-muted-foreground">
                      Cache similar responses to reduce redundant API calls
                    </p>
                  </div>
                  <Switch
                    checked={tokenConfig.optimization.enableCaching}
                    onCheckedChange={(checked) => handleOptimizationChange('enableCaching', checked)}
                    disabled={isReadOnly}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Adaptive Scaling</Label>
                    <p className="text-sm text-muted-foreground">
                      Scale token allocation based on historical performance
                    </p>
                  </div>
                  <Switch
                    checked={tokenConfig.optimization.adaptiveScaling}
                    onCheckedChange={(checked) => handleOptimizationChange('adaptiveScaling', checked)}
                    disabled={isReadOnly}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>
                  Complexity Multiplier: {tokenConfig.optimization.complexityMultiplier}x
                </Label>
                <Slider
                  value={[tokenConfig.optimization.complexityMultiplier]}
                  onValueChange={([value]) => handleOptimizationChange('complexityMultiplier', value)}
                  max={3.0}
                  min={0.5}
                  step={0.1}
                  className="w-full"
                  disabled={isReadOnly}
                />
                <p className="text-sm text-muted-foreground">
                  Adjust token allocation based on task complexity (0.5x - 3.0x)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cost Tracking Tab */}
        <TabsContent value="cost-tracking" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DollarSign className="h-5 w-5 mr-2" />
                Cost Tracking & Alerts
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Monitor costs and set up alerts to stay within budget
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Cost Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications when approaching budget limits
                  </p>
                </div>
                <Switch
                  checked={tokenConfig.costTracking.enableCostAlerts}
                  onCheckedChange={(checked) => handleCostTrackingChange('enableCostAlerts', checked)}
                  disabled={isReadOnly}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Daily Budget ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={tokenConfig.costTracking.dailyBudget}
                    onChange={(e) => handleCostTrackingChange('dailyBudget', parseFloat(e.target.value) || 0)}
                    placeholder="50.00"
                    disabled={isReadOnly}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum daily spending limit
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Monthly Budget ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={tokenConfig.costTracking.monthlyBudget}
                    onChange={(e) => handleCostTrackingChange('monthlyBudget', parseFloat(e.target.value) || 0)}
                    placeholder="1500.00"
                    disabled={isReadOnly}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum monthly spending limit
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Cost Per Token ($)</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={tokenConfig.costTracking.costPerToken}
                    onChange={(e) => handleCostTrackingChange('costPerToken', parseFloat(e.target.value) || 0)}
                    placeholder="0.00002"
                    disabled={isReadOnly}
                  />
                  <p className="text-xs text-muted-foreground">
                    Cost per token for calculations
                  </p>
                </div>
              </div>

              {/* Cost Projections */}
              <div className="space-y-3">
                <Label>Cost Projections</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 border rounded-md">
                    <div className="text-lg font-semibold text-green-600">
                      {formatCurrency(usageEstimate.costEstimate)}
                    </div>
                    <div className="text-sm text-muted-foreground">Estimated Daily Cost</div>
                  </div>
                  <div className="p-3 border rounded-md">
                    <div className="text-lg font-semibold text-blue-600">
                      {formatCurrency(usageEstimate.costEstimate * 30)}
                    </div>
                    <div className="text-sm text-muted-foreground">Estimated Monthly Cost</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Performance Settings
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure performance optimization and quality thresholds
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Priority Mode</Label>
                <Select
                  value={tokenConfig.performanceSettings.priorityMode}
                  onValueChange={(value) => handlePerformanceChange('priorityMode', value)}
                  disabled={isReadOnly}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="speed">Speed - Prioritize fast responses</SelectItem>
                    <SelectItem value="quality">Quality - Prioritize high-quality outputs</SelectItem>
                    <SelectItem value="balanced">Balanced - Balance speed and quality</SelectItem>
                    <SelectItem value="cost">Cost - Minimize token usage</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Quality Threshold</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={tokenConfig.performanceSettings.qualityThreshold}
                    onChange={(e) => handlePerformanceChange('qualityThreshold', parseFloat(e.target.value) || 0)}
                    placeholder="0.85"
                    disabled={isReadOnly}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum quality score (0.0 - 1.0)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Speed Threshold (ms)</Label>
                  <Input
                    type="number"
                    value={tokenConfig.performanceSettings.speedThreshold}
                    onChange={(e) => handlePerformanceChange('speedThreshold', parseInt(e.target.value) || 0)}
                    placeholder="5000"
                    disabled={isReadOnly}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum acceptable response time
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Performance Optimization</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically optimize based on performance metrics
                  </p>
                </div>
                <Switch
                  checked={tokenConfig.performanceSettings.enablePerformanceOptimization}
                  onCheckedChange={(checked) => handlePerformanceChange('enablePerformanceOptimization', checked)}
                  disabled={isReadOnly}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Advanced Settings Toggle */}
      <Card>
        <CardContent className="p-4">
          <Button
            variant="outline"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full"
          >
            <Settings className="h-4 w-4 mr-2" />
            {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
          </Button>
          
          {showAdvanced && (
            <div className="mt-4 p-4 border rounded-md bg-muted/50">
              <div className="flex items-start space-x-2">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-1">Advanced Configuration</p>
                  <p>These settings will be available in Phase 3 for fine-tuning token management behavior, custom optimization algorithms, and integration with external cost monitoring systems.</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
