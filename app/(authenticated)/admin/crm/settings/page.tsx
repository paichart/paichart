'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Loader2Icon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/Form';

interface CRMSettings {
  apiUrl: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
  autoSync: boolean;
  syncInterval: string;
  retryAttempts: string;
}

export default function CRMSettingsPage() {
  const [success, setSuccess] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<CRMSettings>({
    defaultValues: {
      apiUrl: '',
      apiKey: '',
      clientId: '',
      clientSecret: '',
      autoSync: true,
      syncInterval: '30',
      retryAttempts: '3',
    }
  });

  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/admin/crm/settings');
        if (!response.ok) {
          throw new Error('Failed to load settings');
        }
        const data = await response.json();
        form.reset({
          apiUrl: data.apiUrl || '',
          apiKey: data.apiKey || '',
          clientId: data.clientId || '',
          clientSecret: data.clientSecret || '',
          autoSync: data.autoSync ?? true,
          syncInterval: data.syncInterval?.toString() || '30',
          retryAttempts: data.retryAttempts?.toString() || '3',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      }
    };

    loadSettings();
  }, [form]);

  const onSubmit = async (data: CRMSettings) => {
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/admin/crm/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">CRM Settings</h1>
        <p className="text-muted-foreground">
          Configure global CRM integration settings and connection details.
        </p>
      </div>

      <Card>
        <div className="p-6 space-y-6">
          {success && (
            <Alert>
              <AlertDescription>Settings saved successfully</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}

          <Form form={form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Connection Settings</h2>

              <div className="grid gap-6">
                <FormField
                  control={form.control}
                  name="apiUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API URL</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          required
                          placeholder="Enter API URL"
                        />
                      </FormControl>
                      <FormDescription>
                        The base URL for your CRM API
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="apiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>API Key</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            required
                            type="password"
                            placeholder="Enter API key"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client ID</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            required
                            placeholder="Enter client ID"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="clientSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client Secret</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            required
                            type="password"
                            placeholder="Enter client secret"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Sync Settings</h2>

                <FormField
                  control={form.control}
                  name="autoSync"
                  render={({ field }) => (
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="autoSync"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <FormLabel htmlFor="autoSync">Enable Automatic Synchronization</FormLabel>
                    </div>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="syncInterval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sync Interval (minutes)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            disabled={!form.watch('autoSync')}
                            min={5}
                            max={1440}
                            placeholder="Enter sync interval"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="retryAttempts"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Retry Attempts</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={1}
                            max={10}
                            placeholder="Enter retry attempts"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="gap-2"
              >
                {form.formState.isSubmitting && <Loader2Icon className="h-4 w-4 animate-spin" />}
                {form.formState.isSubmitting ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
            </form>
          </Form>
        </div>
      </Card>
    </div>
  );
}
