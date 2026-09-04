"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { POVStatus, Priority, SalesTheatre } from '@prisma/client';
import { ExtendedPoVDetails } from '@/lib/pov/hooks/usePOVList';
import { cn } from '@/lib/utils';

interface POVDataVisualizationProps {
  povs: ExtendedPoVDetails[];
}

export function POVDataVisualization({ povs }: POVDataVisualizationProps) {
  const [activeTab, setActiveTab] = React.useState('status');
  
  // Prepare data for status chart
  const statusData = React.useMemo(() => {
    const statusCounts: Record<string, number> = {};
    povs.forEach(pov => {
      statusCounts[pov.status] = (statusCounts[pov.status] || 0) + 1;
    });
    
    return Object.entries(statusCounts).map(([status, count]) => ({
      name: formatStatus(status as POVStatus),
      value: count,
      color: getStatusColor(status as POVStatus),
      percentage: Math.round((count / povs.length) * 100)
    }));
  }, [povs]);
  
  // Prepare data for theatre chart
  const theatreData = React.useMemo(() => {
    const theatreCounts: Record<string, number> = {};
    povs.forEach(pov => {
      if (pov.salesTheatre) {
        theatreCounts[pov.salesTheatre] = (theatreCounts[pov.salesTheatre] || 0) + 1;
      }
    });
    
    return Object.entries(theatreCounts).map(([theatre, count]) => ({
      name: formatTheatreName(theatre as SalesTheatre),
      value: count,
      color: getTheatreColor(theatre as SalesTheatre),
      percentage: Math.round((count / povs.length) * 100)
    }));
  }, [povs]);
  
  // Prepare data for priority chart
  const priorityData = React.useMemo(() => {
    const priorityCounts: Record<string, number> = {};
    povs.forEach(pov => {
      priorityCounts[pov.priority] = (priorityCounts[pov.priority] || 0) + 1;
    });
    
    return Object.entries(priorityCounts).map(([priority, count]) => ({
      name: formatPriority(priority as Priority),
      value: count,
      color: getPriorityColor(priority as Priority),
      percentage: Math.round((count / povs.length) * 100)
    }));
  }, [povs]);
  
  // Format status for display
  function formatStatus(status: POVStatus) {
    return status.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }
  
  // Format priority for display
  function formatPriority(priority: Priority) {
    return priority.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }
  
  // Format theatre name for display
  function formatTheatreName(theatre: SalesTheatre) {
    switch (theatre) {
      case 'NORTH_AMERICA':
        return 'North America';
      case 'LAC':
        return 'Latin America & Caribbean';
      case 'EMEA':
        return 'Europe, Middle East & Africa';
      case 'APJ':
        return 'Asia Pacific & Japan';
      default:
        return String(theatre).replace('_', ' ');
    }
  }
  
  // Get status color
  function getStatusColor(status: POVStatus) {
    switch (status) {
      case 'PROJECTED':
        return 'bg-blue-500';
      case 'IN_PROGRESS':
        return 'bg-green-500';
      case 'STALLED':
        return 'bg-amber-500';
      case 'VALIDATION':
        return 'bg-purple-500';
      case 'WON':
        return 'bg-emerald-500';
      case 'LOST':
        return 'bg-red-500';
      default:
        return 'bg-muted-foreground';
    }
  }

  // Get priority color
  function getPriorityColor(priority: Priority) {
    switch (priority) {
      case 'HIGH':
        return 'bg-red-500';
      case 'MEDIUM':
        return 'bg-amber-500';
      case 'LOW':
        return 'bg-blue-500';
      case 'URGENT':
        return 'bg-red-700';
      default:
        return 'bg-muted-foreground';
    }
  }

  // Get theatre color
  function getTheatreColor(theatre: SalesTheatre) {
    switch (theatre) {
      case 'NORTH_AMERICA':
        return 'bg-blue-500';
      case 'LAC':
        return 'bg-green-500';
      case 'EMEA':
        return 'bg-purple-500';
      case 'APJ':
        return 'bg-amber-500';
      default:
        return 'bg-muted-foreground';
    }
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>POV Analytics</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="status">By Status</TabsTrigger>
            <TabsTrigger value="theatre">By Theatre</TabsTrigger>
            <TabsTrigger value="priority">By Priority</TabsTrigger>
          </TabsList>
          
          <TabsContent value="status" className="pt-4">
            <div className="space-y-2">
              {statusData.map(item => (
                <div key={item.name} className="flex items-center">
                  <div className="w-24 text-sm">{item.name}</div>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full rounded-full", item.color)} 
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <div className="w-16 text-right text-sm">{item.value} ({item.percentage}%)</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground mt-4 text-center">
              Distribution of POVs by status
            </div>
          </TabsContent>
          
          <TabsContent value="theatre" className="pt-4">
            <div className="space-y-2">
              {theatreData.map(item => (
                <div key={item.name} className="flex items-center">
                  <div className="w-32 text-sm truncate">{item.name}</div>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full rounded-full", item.color)} 
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <div className="w-16 text-right text-sm">{item.value} ({item.percentage}%)</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground mt-4 text-center">
              Distribution of POVs by sales theatre
            </div>
          </TabsContent>
          
          <TabsContent value="priority" className="pt-4">
            <div className="space-y-2">
              {priorityData.map(item => (
                <div key={item.name} className="flex items-center">
                  <div className="w-24 text-sm">{item.name}</div>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full rounded-full", item.color)} 
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <div className="w-16 text-right text-sm">{item.value} ({item.percentage}%)</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground mt-4 text-center">
              Distribution of POVs by priority
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
