"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { BarChart, LineChart, PieChart } from 'lucide-react';

interface TemplateUsageData {
  templateId: string;
  templateName: string;
  usageCount: number;
}

interface TemplateCreationData {
  month: string;
  povCount: number;
  phaseCount: number;
}

interface TemplateStatusData {
  status: string;
  count: number;
}

interface TemplateAnalyticsProps {
  templateUsage?: TemplateUsageData[];
  templateCreation?: TemplateCreationData[];
  templateStatus?: TemplateStatusData[];
  phaseTemplateUsage?: TemplateUsageData[];
  loading?: boolean;
}

export function TemplateAnalytics({
  templateUsage,
  templateCreation,
  templateStatus,
  phaseTemplateUsage,
  loading = false
}: TemplateAnalyticsProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Template Analytics</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Template Usage</CardTitle>
            <CardDescription>
              Number of POVs created using each template
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80 flex items-center justify-center">
            {loading || !templateUsage ? (
              <div className="text-center text-muted-foreground">
                <BarChart className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p>Analytics data will appear here</p>
              </div>
            ) : (
              <div className="w-full h-full">
                {/* TODO: Consider replacing with recharts BarChart component (see D1 in IMPLEMENTATION-PLAN.md - low priority enhancement) */}
                <div className="space-y-4">
                  {templateUsage.map(item => (
                    <div key={item.templateId} className="flex items-center">
                      <div className="w-32 truncate">{item.templateName}</div>
                      <div className="flex-1 mx-2">
                        <div 
                          className="bg-blue-500 h-6 rounded" 
                          style={{ width: `${Math.min(100, item.usageCount * 5)}%` }}
                        ></div>
                      </div>
                      <div className="w-10 text-right">{item.usageCount}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Template Creation Over Time</CardTitle>
            <CardDescription>
              Number of templates created per month
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80 flex items-center justify-center">
            {loading || !templateCreation ? (
              <div className="text-center text-muted-foreground">
                <LineChart className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p>Analytics data will appear here</p>
              </div>
            ) : (
              <div className="w-full h-full">
                {/* TODO: Consider replacing with recharts BarChart component (see D1 in IMPLEMENTATION-PLAN.md - low priority enhancement) */}
                <div className="space-y-4">
                  {templateCreation.map(item => (
                    <div key={item.month} className="flex items-center">
                      <div className="w-24">{item.month}</div>
                      <div className="flex-1 mx-2 flex items-center space-x-1">
                        <div 
                          className="bg-blue-500 h-6 rounded" 
                          style={{ width: `${Math.min(100, item.povCount * 10)}%` }}
                        ></div>
                        <div 
                          className="bg-purple-500 h-6 rounded" 
                          style={{ width: `${Math.min(100, item.phaseCount * 10)}%` }}
                        ></div>
                      </div>
                      <div className="w-20 text-right">
                        <span className="text-blue-500 mr-2">{item.povCount}</span>
                        <span className="text-purple-500">{item.phaseCount}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center mt-4 text-sm">
                  <div className="flex items-center mr-4">
                    <div className="h-3 w-3 bg-blue-500 mr-1 rounded"></div>
                    <span>POV Templates</span>
                  </div>
                  <div className="flex items-center">
                    <div className="h-3 w-3 bg-purple-500 mr-1 rounded"></div>
                    <span>Phase Templates</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Template Status Distribution</CardTitle>
            <CardDescription>
              Distribution of templates by status
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80 flex items-center justify-center">
            {loading || !templateStatus ? (
              <div className="text-center text-muted-foreground">
                <PieChart className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p>Analytics data will appear here</p>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center">
                {/* TODO: Consider replacing with recharts BarChart component (see D1 in IMPLEMENTATION-PLAN.md - low priority enhancement) */}
                <div className="w-40 h-40 rounded-full border-8 border-gray-200 relative mb-6">
                  {templateStatus.map((item, index) => {
                    const total = templateStatus.reduce((sum, i) => sum + i.count, 0);
                    const percentage = (item.count / total) * 100;
                    const color = item.status === 'published' 
                      ? 'bg-green-500' 
                      : item.status === 'draft' 
                      ? 'bg-amber-500' 
                      : 'bg-red-500';
                    
                    return (
                      <div 
                        key={item.status}
                        className={`absolute top-0 left-0 w-full h-full ${color}`}
                        style={{ 
                          clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.cos(index * Math.PI / 2)}% ${50 - 50 * Math.sin(index * Math.PI / 2)}%)` 
                        }}
                      ></div>
                    );
                  })}
                </div>
                
                <div className="flex flex-wrap justify-center gap-4">
                  {templateStatus.map(item => (
                    <div key={item.status} className="flex items-center">
                      <div 
                        className={`h-3 w-3 mr-1 rounded ${
                          item.status === 'published' 
                            ? 'bg-green-500' 
                            : item.status === 'draft' 
                            ? 'bg-amber-500' 
                            : 'bg-red-500'
                        }`}
                      ></div>
                      <span className="capitalize">{item.status}: {item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Phase Template Usage</CardTitle>
            <CardDescription>
              Most commonly used phase templates
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80 flex items-center justify-center">
            {loading || !phaseTemplateUsage ? (
              <div className="text-center text-muted-foreground">
                <BarChart className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p>Analytics data will appear here</p>
              </div>
            ) : (
              <div className="w-full h-full">
                {/* TODO: Consider replacing with recharts BarChart component (see D1 in IMPLEMENTATION-PLAN.md - low priority enhancement) */}
                <div className="space-y-4">
                  {phaseTemplateUsage.map(item => (
                    <div key={item.templateId} className="flex items-center">
                      <div className="w-32 truncate">{item.templateName}</div>
                      <div className="flex-1 mx-2">
                        <div 
                          className="bg-purple-500 h-6 rounded" 
                          style={{ width: `${Math.min(100, item.usageCount * 5)}%` }}
                        ></div>
                      </div>
                      <div className="w-10 text-right">{item.usageCount}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default TemplateAnalytics;
