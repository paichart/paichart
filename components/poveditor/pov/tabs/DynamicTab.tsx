"use client";

import React from 'react';
import { EditorTab } from '../types/EditorTab';

/**
 * Dynamic Tab Section Component
 * A placeholder tab for testing and development purposes
 */
const DynamicTabSection = () => {
  return (
    <div className="space-y-6">
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
          🧪 Dynamic Tab (Staging Mode)
        </h3>
        <p className="text-yellow-700 dark:text-yellow-300">
          This is a dynamic tab that only appears in staging mode for testing purposes.
          It can be used to test new features, components, or functionality before
          they are moved to production tabs.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Test Area 1</h4>
          <p className="text-blue-700 dark:text-blue-300 text-sm">
            Use this area to test new components or features.
          </p>
        </div>
        
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">Test Area 2</h4>
          <p className="text-green-700 dark:text-green-300 text-sm">
            Another area for experimental functionality.
          </p>
        </div>
      </div>
      
      <div className="bg-muted border border-border rounded-lg p-4">
        <h4 className="font-semibold text-foreground mb-2">Development Notes</h4>
        <ul className="text-muted-foreground text-sm space-y-1">
          <li>• This tab is only visible in staging mode</li>
          <li>• It&apos;s controlled by the centralized mode configuration</li>
          <li>• Perfect for testing new features before production</li>
          <li>• Can be easily modified for different testing scenarios</li>
        </ul>
      </div>
    </div>
  );
};

/**
 * Tab definition for the Dynamic section (staging only)
 */
export const DynamicTab: EditorTab = {
  id: 'dynamic-tab',
  label: 'Dynamic',
  component: DynamicTabSection,
  order: 999 // Put it at the end
};
