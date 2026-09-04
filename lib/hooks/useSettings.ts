import { useState, useEffect } from 'react';
import { UserSettings, defaultUserSettings } from '@/lib/types/settings';

interface UseSettingsResult {
  settings: UserSettings;
  isLoading: boolean;
  error: Error | null;
  updateSettings: (update: Partial<UserSettings>) => Promise<void>;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<UserSettings>(defaultUserSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) {
          throw new Error('Failed to fetch settings');
        }
        const { data } = await response.json();
        setSettings(data.settings?.settings || defaultUserSettings);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('An error occurred'));
      } finally {
        setIsLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const updateSettings = async (update: Partial<UserSettings>) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(update),
      });

      if (!response.ok) {
        throw new Error('Failed to update settings');
      }

      const { data } = await response.json();
      setSettings(data.settings.settings);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred'));
      throw err;
    }
  };

  return {
    settings,
    isLoading,
    error,
    updateSettings,
  };
}
