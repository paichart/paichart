'use client';

import React from 'react';
import { UserRole } from '@/lib/types/auth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';
import { Separator } from '@/components/ui/Separator';
import { Switch } from '@/components/ui/Switch';
import { GeographicalPreferencesLink } from '@/components/settings/GeographicalPreferencesLink';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useThemeSettings } from '@/lib/hooks/useThemeSettings';
import { useTheme } from 'next-themes';
import { SelfServiceApiKeyManagement } from '@/components/profile/SelfServiceApiKeyManagement';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from '@/components/ui/Form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';
import TimezoneSelect from '@/components/settings/TimezoneSelect';
import LLMSettings from '@/components/settings/LLMSettings';
import { useSettings } from '@/lib/hooks/useSettings';
import { useAuth } from '@/lib/hooks/useAuth';

import { UserSettings, defaultUserSettings } from '@/lib/types/settings';

const settingsFormSchema = z.object({
  timezone: z.string(),
  display: z.object({
    timeFormat: z.enum(['12h', '24h']).optional(),
    firstDayOfWeek: z.union([z.literal(0), z.literal(1)]).optional(),
  }).optional(),
  notifications: z.object({
    email: z.boolean(),
    inApp: z.boolean(),
    desktop: z.boolean(),
  }).optional(),
  accessibility: z.object({
    reducedMotion: z.boolean().optional(),
    highContrast: z.boolean().optional(),
    screenReader: z.boolean().optional(),
  }).optional(),
  llm: z.object({
    provider: z.enum(['anthropic_sdk', 'system']).optional(),
    anthropicApiKey: z.string().optional(),
    useSystemProvider: z.boolean().optional(),
    // READ-ONLY signals from GET /api/settings. The mapper (redactSensitiveSettings) strips the
    // stored keys and returns these booleans in their place, so the key inputs always hydrate
    // EMPTY even when a key is saved. LLMSettings uses these to say "a key is already stored"
    // instead of showing a blank box that looks like the save failed. They are echoed back on
    // submit and deleted server-side by mergeSettingsPreservingSecrets — never persisted.
    anthropicApiKeyConfigured: z.boolean().optional(),
    // Transient delete signal — set by the Remove-key button, consumed and stripped by
    // mergeSettingsPreservingSecrets. An empty key field means "keep", never "delete".
    clearAnthropicApiKey: z.boolean().optional(),
  }).optional(),
});

type SettingsFormData = z.infer<typeof settingsFormSchema>;

// Helper function to convert legacy provider to new provider.
// Falls back to 'anthropic_sdk', NOT 'system' (2026-08-05). The provider <Select> in LLMSettings
// offers only anthropic_sdk, so a 'system' value matched no option and rendered an
// empty dropdown — and because the API-key input is gated on that same value, it meant NO key
// field rendered either. Returning a real provider is what makes the key input reachable at all;
// without this, defaulting useSystemProvider to false below would still show nowhere to type.
const convertLegacyProvider = (provider: string | undefined): 'anthropic_sdk' | 'system' => {
  if (provider === 'anthropic') return 'anthropic_sdk';
  if (provider === 'anthropic_sdk') {
    return provider;
  }
  // 'gemini'/'gemini_sdk' intentionally NOT mapped (2026-08-05): the Gemini LLM provider was
  // removed and no stored row used it, so a legacy value now falls through to Anthropic.
  return 'anthropic_sdk';
};

export default function ProfilePage() {
  const { user, hasRole } = useAuth();
  const { settings, updateSettings, isLoading } = useSettings();
  const { isDuskTheme } = useThemeSettings();
  const { theme, setTheme } = useTheme(); // Move useTheme to the top level
  const [saving, setSaving] = React.useState(false);
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [userName, setUserName] = React.useState(user?.name || '');
  const [userEmail, setUserEmail] = React.useState(user?.email || '');
  const isAdmin = user && hasRole(UserRole.ADMIN);

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      timezone: settings.timezone || defaultUserSettings.timezone,
      display: {
        timeFormat: settings.display?.timeFormat || defaultUserSettings.display?.timeFormat,
        firstDayOfWeek: settings.display?.firstDayOfWeek || defaultUserSettings.display?.firstDayOfWeek,
      },
      notifications: {
        email: settings.notifications?.email ?? defaultUserSettings.notifications?.email,
        inApp: settings.notifications?.inApp ?? defaultUserSettings.notifications?.inApp,
        desktop: settings.notifications?.desktop ?? defaultUserSettings.notifications?.desktop,
      },
      accessibility: {
        reducedMotion: settings.accessibility?.reducedMotion ?? defaultUserSettings.accessibility?.reducedMotion,
        highContrast: settings.accessibility?.highContrast ?? defaultUserSettings.accessibility?.highContrast,
        screenReader: settings.accessibility?.screenReader ?? defaultUserSettings.accessibility?.screenReader,
      },
      llm: {
        provider: convertLegacyProvider(settings.llm?.provider),
        // `?? false` (was `?? true`, 2026-08-05): a user with no stored preference now starts on
        // their OWN key with the fields visible, rather than on the system provider with the whole
        // section hidden. Note the runtime already behaved this way — resolveUserSettings tests
        // `!llmSettings.useSystemProvider`, and `!undefined` is true — so the old `?? true` display
        // actively contradicted what the engine did for these users.
        useSystemProvider: settings.llm?.useSystemProvider ?? false,
        anthropicApiKey: settings.llm?.anthropicApiKey || '',
        anthropicApiKeyConfigured: settings.llm?.anthropicApiKeyConfigured ?? false,
        clearAnthropicApiKey: false, // transient; never loaded from the server
      },
    },
  });

  // Update form values when server settings are loaded
  React.useEffect(() => {
    if (!isLoading) {
      form.reset({
        timezone: settings.timezone,
        display: {
          timeFormat: settings.display?.timeFormat || '24h',
          firstDayOfWeek: settings.display?.firstDayOfWeek || 1,
        },
        notifications: {
          email: settings.notifications?.email || false,
          inApp: settings.notifications?.inApp || false,
          desktop: settings.notifications?.desktop || false,
        },
        accessibility: {
          reducedMotion: settings.accessibility?.reducedMotion || false,
          highContrast: settings.accessibility?.highContrast || false,
          screenReader: settings.accessibility?.screenReader || false,
        },
        llm: {
          provider: convertLegacyProvider(settings.llm?.provider),
          useSystemProvider: settings.llm?.useSystemProvider ?? false, // see defaultValues above
          anthropicApiKey: settings.llm?.anthropicApiKey || '',
          anthropicApiKeyConfigured: settings.llm?.anthropicApiKeyConfigured ?? false,
          clearAnthropicApiKey: false, // transient; never loaded from the server
        },
      });
    }
  }, [settings, isLoading, form]);

  const onSubmit = async (data: SettingsFormData) => {
    setSaving(true);
    try {
      // Ensure LLM provider is set and handle backward compatibility
      const formattedData = {
        ...data,
        llm: data.llm ? {
          ...data.llm,
          provider: data.llm.provider || 'system'
        } : undefined
      };
      
      await updateSettings(formattedData);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  // Handle profile update
  const handleProfileUpdate = async () => {
    if (!userName.trim()) return;
    
    setProfileSaving(true);
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: userName,
          email: isAdmin ? userEmail : undefined
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update profile');
      }
      
      // Update the user object in the UI
      if (user) {
        user.name = userName;
        if (isAdmin) {
          user.email = userEmail;
        }
      }
      
      // Show success message
      alert('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setProfileSaving(false);
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Profile Settings</h1>
        <Button
          type="submit"
          onClick={form.handleSubmit(onSubmit)}
          disabled={saving || form.formState.isSubmitting}
          className="min-w-[120px]"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Changes
        </Button>
      </div>

      {/* Profile Information */}
      <Card className="p-6 mb-6">
        <div className="flex items-center mb-6">
          <Avatar className="h-20 w-20 mr-4">
            <AvatarFallback className="bg-primary text-white font-bold">
              {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-semibold">{user?.name}</h2>
            <p className="text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="space-y-2">
                <div className="font-medium">Name</div>
                <Input
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  disabled={!isAdmin}
                />
                {!isAdmin && (
                  <p className="text-xs text-muted-foreground mt-1">Only administrators can change their profile</p>
                )}
              </div>
            </div>
            <div>
              <div className="space-y-2">
                <div className="font-medium">Email</div>
                <Input
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  disabled={!isAdmin}
                  type="email"
                />
              </div>
            </div>
          </div>
          
          {isAdmin && (
            <div className="flex justify-end">
              <Button
                onClick={handleProfileUpdate}
                disabled={profileSaving || (userName === user?.name && userEmail === user?.email)}
              >
                {profileSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Update Profile
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Form form={form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Time & Date Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Time & Date</h2>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <TimezoneSelect
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                <FormField
                  control={form.control}
                  name="display.timeFormat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time Format</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select time format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="12h">12-hour</SelectItem>
                          <SelectItem value="24h">24-hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="display.firstDayOfWeek"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Day of Week</FormLabel>
                      <Select
                        value={String(field.value)}
                        onValueChange={(value) => field.onChange(parseInt(value))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select first day" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Sunday</SelectItem>
                          <SelectItem value="1">Monday</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
            </Card>

            {/* Notification Settings */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Notifications</h2>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="notifications.email"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <FormLabel>Email Notifications</FormLabel>
                        <FormDescription>Receive notifications via email</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notifications.inApp"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <FormLabel>In-App Notifications</FormLabel>
                        <FormDescription>Show notifications in the app</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notifications.desktop"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <FormLabel>Desktop Notifications</FormLabel>
                        <FormDescription>Show desktop notifications</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </Card>
          </div>

          {/* LLM Settings */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">AI Provider Settings</h2>
            <LLMSettings form={form} />
          </Card>

          {/* API Key Management - Self-Service */}
          <SelfServiceApiKeyManagement />

          {/* Geographical Preferences Link */}
          <GeographicalPreferencesLink />
          
          {/* Accessibility Settings */}
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Accessibility</h2>
              <ThemeToggle />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <FormField
                control={form.control}
                name="accessibility.reducedMotion"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel>Reduced Motion</FormLabel>
                      <FormDescription>Minimize animations</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="accessibility.highContrast"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel>Dusk Theme</FormLabel>
                      <FormDescription>Windows 11 style reduced contrast</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={theme === 'dusk'}
                        onCheckedChange={(checked) => {
                          // Update both the form field and the theme
                          field.onChange(checked);
                          setTheme(checked ? 'dusk' : 'system');
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="accessibility.screenReader"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel>Screen Reader</FormLabel>
                      <FormDescription>Optimize for screen readers</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </Card>

          {/* Removed Save Changes button from here */}
        </form>
      </Form>
    </div>
  );
}
