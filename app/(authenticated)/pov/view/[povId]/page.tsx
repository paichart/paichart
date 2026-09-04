'use client';

import { useParams } from 'next/navigation';
import PovEditor from '@/components/poveditor/pov/PovEditor';

export default function POVViewPage() {
  const params = useParams();
  const povId = params.povId as string;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-blue-800 dark:text-blue-200 font-semibold">👁️ View Mode</span>
          <span className="text-blue-700 dark:text-blue-300 text-sm">
            Read-only view of POV with analytics and overview tabs
          </span>
        </div>
      </div>
      
      <PovEditor povId={povId} mode="view" />
    </div>
  );
}
