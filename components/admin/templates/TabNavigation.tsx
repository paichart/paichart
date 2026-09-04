"use client";

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Activity, FileText, Layers, BarChart, Settings, Bot, MessageSquare } from 'lucide-react';

interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}

export function TabNavigation({ activeTab, onTabChange, children }: TabNavigationProps) {
  return (
    <Tabs defaultValue={activeTab} value={activeTab} onValueChange={onTabChange}>
      <TabsList className="grid grid-cols-7 mb-8">
        <TabsTrigger value="overview" className="flex items-center">
          <Activity className="h-4 w-4 mr-2" />
          Overview
        </TabsTrigger>
        <TabsTrigger value="pov-templates" className="flex items-center">
          <FileText className="h-4 w-4 mr-2" />
          POV Templates
        </TabsTrigger>
        <TabsTrigger value="phase-templates" className="flex items-center">
          <Layers className="h-4 w-4 mr-2" />
          Phase Templates
        </TabsTrigger>
        <TabsTrigger value="agent-templates" className="flex items-center">
          <Bot className="h-4 w-4 mr-2" />
          Agent Templates
        </TabsTrigger>
        <TabsTrigger value="prompt-library" className="flex items-center">
          <MessageSquare className="h-4 w-4 mr-2" />
          Prompt Library
        </TabsTrigger>
        <TabsTrigger value="analytics" className="flex items-center">
          <BarChart className="h-4 w-4 mr-2" />
          Analytics
        </TabsTrigger>
        <TabsTrigger value="settings" className="flex items-center">
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </TabsTrigger>
      </TabsList>
      
      {children}
    </Tabs>
  );
}

export default TabNavigation;
