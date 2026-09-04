import React, { useState } from 'react';
import {
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormControl,
} from '@/components/ui/Form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Button } from '@/components/ui/Button';
import { Loader2 } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { UserSettings } from '@/lib/types/settings';

interface LLMSettingsProps {
  form: UseFormReturn<any>;
}

export const LLMSettings: React.FC<LLMSettingsProps> = ({ form }) => {
  const provider = form.watch('llm.provider');
  const useSystemProvider = form.watch('llm.useSystemProvider');
  // GET /api/settings redacts stored keys to booleans, so these inputs ALWAYS hydrate empty even
  // when a key is saved. Without surfacing that, a saved key is indistinguishable from no key and
  // users re-enter it every visit. Leaving the box empty is correct (never round-trip a secret) —
  // what changes is the description beside it.
  const anthropicKeyConfigured = form.watch('llm.anthropicApiKeyConfigured');
  const typedKey = form.watch('llm.anthropicApiKey');
  const pendingClear = form.watch('llm.clearAnthropicApiKey');
  // A key exists server-side unless this save is going to remove it.
  const keyOnFile = !!anthropicKeyConfigured && !pendingClear;

  const [testState, setTestState] = useState<{ status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string }>({ status: 'idle' });

  // Tests the key TYPED INTO THE BOX, not the stored one — the stored key is never sent to the
  // browser, so the client has nothing to test. Hence the button is only enabled once something
  // is typed. Paste → Test → Save is the flow this supports.
  const testKey = async () => {
    setTestState({ status: 'testing' });
    try {
      const res = await fetch('/api/llm/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'anthropic_sdk', apiKey: typedKey }),
      });
      const body = await res.json();
      if (res.ok && body.success) setTestState({ status: 'ok', message: body.message || 'Key works.' });
      else setTestState({ status: 'fail', message: body.error || body.message || 'Key did not work.' });
    } catch {
      setTestState({ status: 'fail', message: 'Could not reach the test endpoint.' });
    }
  };

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="llm.useSystemProvider"
        render={({ field }) => (
          <FormItem className="flex items-center justify-between">
            <div>
              <FormLabel>Use System Provider</FormLabel>
              <FormDescription>
                Use the organization&apos;s LLM provider settings instead of your own
              </FormDescription>
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

      {/* Only the PROVIDER choice is gated on the toggle — key management below is NOT.
          Until 2026-08-06 the whole block was gated, which meant the only way to reach the
          Remove button was to switch the system provider off first; saving then persisted
          that as your preference, so removing a key silently opted you out of the org key.
          Which key you USE and what your key IS are independent concerns. */}
      {!useSystemProvider && (
        <>
          <FormField
            control={form.control}
            name="llm.provider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>LLM Provider</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={useSystemProvider}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select LLM provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anthropic_sdk">Anthropic Claude (SDK)</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Default provider for agent executions. Per-task settings in the Agent Builder override this.
                </FormDescription>
              </FormItem>
            )}
          />

        </>
      )}

      {/* Model is NOT a profile setting — it's chosen on the agent template /
          Agent Builder (two-axis, 2026-06-18). This profile governs the
          provider/key axis only. */}

      {provider === 'anthropic_sdk' && (
            <FormField
              control={form.control}
              name="llm.anthropicApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Anthropic API Key</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={
                        anthropicKeyConfigured
                          ? 'A key is saved — enter a new one to replace it'
                          : 'Enter your Anthropic API key'
                      }
                      autoComplete="new-password"
                      {...field}
                      onChange={(e) => {
                        if (e.target.value) form.setValue('llm.clearAnthropicApiKey', false);
                        setTestState({ status: 'idle' });
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    {useSystemProvider && (
                      <span className="block mb-1 font-medium">
                        Not currently in use — &quot;Use System Provider&quot; is on, so executions run on
                        the organization&apos;s key. You can still manage your own key here.
                      </span>
                    )}
                    {pendingClear
                      ? 'The saved key will be removed when you save.'
                      : keyOnFile
                        ? 'A key is saved for your account. It is never shown again — leave this blank to keep it, enter a new key to replace it, or remove it below.'
                        : 'Your Anthropic API key will be stored securely and used only for your account'}
                  </FormDescription>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={testKey}
                      disabled={!typedKey || testState.status === 'testing'}
                    >
                      {testState.status === 'testing' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                      Test key
                    </Button>
                    {(keyOnFile || pendingClear) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          form.setValue('llm.clearAnthropicApiKey', !pendingClear);
                          if (!pendingClear) form.setValue('llm.anthropicApiKey', '');
                          setTestState({ status: 'idle' });
                        }}
                      >
                        {pendingClear ? 'Cancel removal' : 'Remove key'}
                      </Button>
                    )}
                  </div>
                  {testState.status !== 'idle' && testState.status !== 'testing' && (
                    <p className={`mt-1 text-xs ${testState.status === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                      {testState.message}
                    </p>
                  )}
                  {!typedKey && !pendingClear && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Enter a key above to test it — a saved key can&apos;t be tested from here, because it is never sent back to your browser.
                    </p>
                  )}
                </FormItem>
              )}
        />
      )}
    </div>
  );
};

export default LLMSettings;
