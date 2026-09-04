'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useSettings } from './useSettings';

export function useThemeSettings() {
  const { theme, setTheme } = useTheme();
  const { settings } = useSettings();

  // Sync the highContrast setting with the Dusk theme
  useEffect(() => {
    // Only update theme if the highContrast setting changes
    // This prevents unnecessary theme changes when the component mounts
    const isDuskActive = theme === 'dusk';
    const isHighContrastEnabled = settings.accessibility?.highContrast === true;
    
    if (isHighContrastEnabled && !isDuskActive) {
      // Only set to dusk if high contrast is enabled and dusk is not already active
      setTheme('dusk');
    }
  }, [settings.accessibility?.highContrast, setTheme, theme]);

  // Function to toggle the Dusk theme
  const toggleDuskTheme = () => {
    if (theme === 'dusk') {
      setTheme(settings.theme?.mode || 'system');
    } else {
      setTheme('dusk');
    }
  };

  return {
    isDuskTheme: theme === 'dusk',
    toggleDuskTheme,
  };
}