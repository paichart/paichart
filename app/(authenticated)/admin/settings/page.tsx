'use client';

import React, { useState, useEffect } from 'react';
import GlobalLLMSettings from '@/components/admin/settings/GlobalLLMSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Loader2 } from 'lucide-react';
// import { useToast } from '@/components/ui/use-toast';

interface GlobalLLMSettingsData {
  provider: 'anthropic_sdk';
  anthropicApiKey?: string;
  // Sent by the API INSTEAD of the key itself — the value never reaches the client.
  anthropicApiKeySet?: boolean;
  // Transient delete signal produced by the form's Remove-key button.
  clearAnthropicApiKey?: boolean;
  allowUserOverride: boolean;
}

export default function AdminSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [llmSettings, setLlmSettings] = useState<GlobalLLMSettingsData | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/admin/settings/llm');
        if (!response.ok) {
          throw new Error('Failed to fetch LLM settings');
        }
        const data = await response.json();
        
        // Handle backward compatibility: convert legacy providers to SDK versions
        const settings = data.settings;
        if (settings) {
          if (settings.provider === 'anthropic') {
            settings.provider = 'anthropic_sdk';
          } else if (settings.provider !== 'anthropic_sdk') {
            // Any other legacy/removed value (gemini, ollama, custom) → the only provider left.
            // 'gemini' joined that list 2026-08-05 when the Gemini LLM provider was removed.
            settings.provider = 'anthropic_sdk';
          }
        }
        
        setLlmSettings(settings);
      } catch (error) {
        console.error('Error fetching LLM settings:', error);
        // Set default settings if fetch fails
        setLlmSettings({
          provider: 'anthropic_sdk',
          allowUserOverride: true,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSaveLLMSettings = async (settings: GlobalLLMSettingsData) => {
    try {
      const response = await fetch('/api/admin/settings/llm', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Failed to save LLM settings');
      }

      // Update local state
      setLlmSettings(settings);
    } catch (error) {
      console.error('Error saving LLM settings:', error);
      console.error('Failed to save settings. Please try again.');
      // Show error message
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Admin Settings</h1>

      <Tabs defaultValue="llm" className="space-y-4">
        <TabsList>
          <TabsTrigger value="llm">AI Providers</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="llm" className="space-y-4">
          <GlobalLLMSettings
            initialSettings={llmSettings || undefined}
            onSave={handleSaveLLMSettings}
          />
        </TabsContent>

        <TabsContent value="general">
          <div className="p-6 text-center text-gray-500">
            General settings will be implemented in a future update.
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="p-6 text-center text-gray-500">
            Security settings will be implemented in a future update.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
