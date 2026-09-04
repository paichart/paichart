"use client";

import { useParams, useSearchParams } from 'next/navigation';
import TemplateEditor from '@/components/poveditor/template/TemplateEditor';

export default function PhaseTemplateByIdPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const templateId = params?.templateId as string;
  const action = searchParams?.get('action') || 'edit';
  
  // Set the page title based on the action
  const pageTitle = action === 'edit' ? 'Edit Phase Template' : 'View Phase Template';
  
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">
        {pageTitle}
      </h1>
      
      <TemplateEditor 
        templateId={templateId}
        initialTemplateType="phase"
      />
    </div>
  );
}
