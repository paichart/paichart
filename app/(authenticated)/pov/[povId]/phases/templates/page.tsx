"use client";

import { PhaseTemplateSelector } from '@/components/pov/phases/PhaseTemplateSelector';

export default function PhaseTemplatesPage({ params }: { params: { povId: string } }) {
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Select a Phase Template</h1>
      <p className="text-gray-500 mb-6">
        Choose a template to create a new phase for your POV. Templates provide pre-configured stages and tasks.
      </p>
      
      <PhaseTemplateSelector povId={params.povId} />
    </div>
  );
}
