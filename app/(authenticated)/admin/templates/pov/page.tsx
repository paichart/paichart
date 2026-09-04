"use client";

import { useSearchParams } from 'next/navigation';
import TemplateEditor from '@/components/poveditor/template/TemplateEditor';

export default function PovTemplateEditorPage() {
  const searchParams = useSearchParams();
  const templateId = searchParams?.get('templateId');
  const action = searchParams?.get('action') || 'edit';
  
  // Set the page title based on the action
  const pageTitle = action === 'new' ? 'Create New POV Template' : 'Edit POV Template';
  
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">
        {pageTitle}
      </h1>
      
      <TemplateEditor 
        templateId={templateId || undefined}
        initialTemplateType="pov"
      />
    </div>
  );
}
