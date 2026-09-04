"use client";

import { PromptLibraryTab } from '@/components/admin/templates/PromptLibraryTab';

export default function PromptsPage() {
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Prompt Library Management</h1>
      <PromptLibraryTab />
    </div>
  );
}