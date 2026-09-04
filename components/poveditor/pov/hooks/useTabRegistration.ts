"use client";

import { useEffect } from 'react';
import { EditorTab } from '../types/EditorTab';
import { tabsRegistry } from '../registry/TabsRegistry';

/**
 * Hook for registering a tab with the registry
 * @param tab The tab to register
 * @returns void
 */
export function useTabRegistration(tab: EditorTab) {
  useEffect(() => {
    // Register the tab when the component mounts
    tabsRegistry.register(tab);
    
    // Unregister when the component unmounts
    return () => {
      tabsRegistry.unregister(tab.id);
    };
  }, [tab]);
}
