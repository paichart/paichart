"use client";

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { TemplateRelationshipGraphWrapper } from '@/components/admin/templates/relationships/TemplateRelationshipGraphWrapper';
import { TemplateRelationshipManagerWrapper } from '@/components/admin/templates/relationships/TemplateRelationshipManagerWrapper';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

/**
 * TemplateRelationshipsPage - Page for visualizing and managing template relationships
 */
export default function TemplateRelationshipsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'visualize' | 'manage'>('visualize');
  
  // Handle back button click
  const handleBack = () => {
    router.push('/admin/templates');
  };
  
  return (
    <div className="container mx-auto py-6">
      <Button variant="ghost" onClick={handleBack} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Templates
      </Button>
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Template Relationships</h1>
          <p className="text-gray-500">Visualize and manage relationships between templates</p>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'visualize' | 'manage')}>
        <TabsList className="mb-6">
          <TabsTrigger value="visualize">Visualize Relationships</TabsTrigger>
          <TabsTrigger value="manage">Manage Relationships</TabsTrigger>
        </TabsList>
        
        <TabsContent value="visualize">
          <TemplateRelationshipGraphWrapper />
        </TabsContent>
        
        <TabsContent value="manage">
          <TemplateRelationshipManagerWrapper />
        </TabsContent>
      </Tabs>
    </div>
  );
}