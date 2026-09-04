import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormControl,
  FormMessage,
} from '@/components/ui/Form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { LLMProvider } from '@/lib/services/llm/types';

const llmSettingsSchema = z.object({
  provider: z.enum(['anthropic_sdk']),
  anthropicApiKey: z.string().optional(),
  // Transient delete signal. The GET never returns the key, so this form always loads with an
  // empty box — meaning "empty" cannot imply "delete" without wiping the org credential on every
  // unrelated save. Removing a key needs its own explicit signal. See the PUT handler.
  clearAnthropicApiKey: z.boolean().optional(),
  allowUserOverride: z.boolean().default(true),
});

type LLMSettingsFormData = z.infer<typeof llmSettingsSchema>;

interface ConnectionStatus {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
}

interface GlobalLLMSettingsProps {
  // `anthropicApiKeySet` is returned by GET /api/admin/settings/llm in place of the key itself —
  // the value is never sent to the client. It is what tells the form a key exists.
  initialSettings?: Partial<LLMSettingsFormData> & { anthropicApiKeySet?: boolean };
  onSave: (settings: LLMSettingsFormData) => Promise<void>;
}

export const GlobalLLMSettings: React.FC<GlobalLLMSettingsProps> = ({
  initialSettings = {},
  onSave,
}) => {
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ status: 'idle' });

  const form = useForm<LLMSettingsFormData>({
    resolver: zodResolver(llmSettingsSchema),
    defaultValues: {
      provider: initialSettings.provider || 'anthropic_sdk',
      anthropicApiKey: initialSettings.anthropicApiKey || '',
      clearAnthropicApiKey: false,
      allowUserOverride: initialSettings.allowUserOverride ?? true,
    },
  });

  const provider = form.watch('provider');
  const typedKey = form.watch('anthropicApiKey');
  const pendingClear = form.watch('clearAnthropicApiKey');
  // A key exists server-side unless this save is going to remove it.
  const keyConfigured = !!initialSettings.anthropicApiKeySet && !pendingClear;

  const handleSubmit = async (data: LLMSettingsFormData) => {
    setSaving(true);
    try {
      await onSave(data);
      setConnectionStatus({
        status: 'success',
        message: 'Settings saved successfully'
      });
    } catch (error) {
      // Failed to save LLM settings
      setConnectionStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to save settings'
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    const data = form.getValues();
    setConnectionStatus({ status: 'testing' });

    try {
      // Prepare the request payload based on the selected provider
      const payload: any = {
        action: 'test_connection',
        provider: data.provider,
      };

      // Add provider-specific parameters
      switch (data.provider) {
        case 'anthropic_sdk':
          payload.apiKey = data.anthropicApiKey;
          break;
      }

      // Make the API request to test the connection
      const response = await fetch('/api/llm/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Connection test failed');
      }

      setConnectionStatus({
        status: 'success',
        message: result.message || 'Connection successful'
      });
    } catch (error) {
      // Connection test failed
      setConnectionStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Connection test failed'
      });
    }
  };

  // Reset connection status when provider changes
  React.useEffect(() => {
    setConnectionStatus({ status: 'idle' });
  }, [provider]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Global AI Provider Settings</CardTitle>
        <CardDescription>
          Configure the default AI provider settings for all users. These settings will be used
          unless a user has configured their own provider settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {connectionStatus.status === 'success' && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Success</AlertTitle>
            <AlertDescription className="text-green-700">
              {connectionStatus.message}
            </AlertDescription>
          </Alert>
        )}

        {connectionStatus.status === 'error' && (
          <Alert className="mb-6 bg-red-50 border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-800">Error</AlertTitle>
            <AlertDescription className="text-red-700">
              {connectionStatus.message}
            </AlertDescription>
          </Alert>
        )}

        <Form form={form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default LLM Provider</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select LLM provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anthropic_sdk">Anthropic Claude (SDK)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Select the default LLM provider to use for AI-assisted features
                  </FormDescription>
                </FormItem>
              )}
            />

            {provider === 'anthropic_sdk' && (
              <FormField
                control={form.control}
                name="anthropicApiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Anthropic API Key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={keyConfigured
                          ? 'A key is saved — enter a new one to replace it'
                          : 'Enter your Anthropic API key'}
                        autoComplete="new-password"
                        {...field}
                        onChange={(e) => {
                          // Typing a replacement cancels a pending removal.
                          if (e.target.value) form.setValue('clearAnthropicApiKey', false);
                          field.onChange(e);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {pendingClear
                        ? 'The saved key will be removed when you save.'
                        : keyConfigured
                          ? 'A key is saved for your organization. It is never shown again — leave this blank to keep it, enter a new key to replace it, or remove it below.'
                          : 'Your organization\u2019s Anthropic API key for Claude'}
                    </FormDescription>
                    {(keyConfigured || pendingClear) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          form.setValue('clearAnthropicApiKey', !pendingClear);
                          if (!pendingClear) form.setValue('anthropicApiKey', '');
                        }}
                      >
                        {pendingClear ? 'Cancel removal' : 'Remove key'}
                      </Button>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}


            <div className="mt-6 flex justify-between items-center">
              <Button
                type="button"
                variant="outline"
                onClick={testConnection}
                disabled={connectionStatus.status === 'testing' || !form.formState.isValid}
                className="min-w-[150px]"
              >
                {connectionStatus.status === 'testing' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </Button>
              
              <Button
                type="submit"
                disabled={saving || form.formState.isSubmitting}
                className="min-w-[120px]"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Settings'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default GlobalLLMSettings;
