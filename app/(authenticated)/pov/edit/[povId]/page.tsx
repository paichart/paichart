"use client";

import PovEditor from '@/components/poveditor/pov/PovEditor';
import { useParams, useSearchParams } from 'next/navigation';

export default function EditPovPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const povId = params.povId as string;
  
  // Parse mode from query parameters
  const modeParam = searchParams.get('mode');
  const mode = modeParam === 'project' ? 'project' : 'edit';
  
  return (
    <div className="container mx-auto py-8">
      <PovEditor povId={povId} mode={mode} />
    </div>
  );
}
