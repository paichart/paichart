export interface UserSettings {
  timezone: string;
  notifications?: {
    email: boolean;
    inApp: boolean;
    desktop: boolean;
  };
  theme?: {
    mode: 'light' | 'dark' | 'system';
    primaryColor?: string;
    fontSize?: 'small' | 'medium' | 'large';
  };
  display?: {
    dateFormat?: string;
    timeFormat?: '12h' | '24h';
    firstDayOfWeek?: 0 | 1; // 0 = Sunday, 1 = Monday
  };
  accessibility?: {
    reducedMotion?: boolean;
    highContrast?: boolean;
    screenReader?: boolean;
  };
  llm?: {
    // The provider/key axis. NOTE: no `model` — model is a template/task concern,
    // not a user setting (two-axis, 2026-06-18 model-resolution cleanup).
    provider: 'anthropic_sdk' | 'system';
    anthropicApiKey?: string;
    useSystemProvider?: boolean;
    /**
     * READ-ONLY, response-side only. GET /api/settings runs `redactSensitiveSettings`, which
     * DELETES `anthropicApiKey` from the payload and substitutes this boolean. So a client can
     * never read back a stored key — it can only learn that one exists. Present on responses,
     * never persisted: `mergeSettingsPreservingSecrets` deletes it on the way in.
     */
    anthropicApiKeyConfigured?: boolean;
  };
}

export const defaultUserSettings: UserSettings = {
  timezone: 'Australia/Sydney',
  notifications: {
    email: true,
    inApp: true,
    desktop: false,
  },
  theme: {
    mode: 'system',
    fontSize: 'medium',
  },
  display: {
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    firstDayOfWeek: 1,
  },
  accessibility: {
    reducedMotion: false,
    highContrast: false,
    screenReader: false,
  },
  // 2026-08-05: was `provider: 'system'` + `useSystemProvider: true`. This object is what a user
  // with NO UserSettings row falls back to (useSettings() seeds state from it), and those two
  // values hid the whole provider/key section on /profile — the toggle read "use the system
  // provider" and everything below it was unrendered, so a new user had nowhere to enter a key.
  // 'system' also matched no option in the provider <Select> (which offers anthropic_sdk
  // only), and the key input is gated on that select's value, so it suppressed the key field a
  // second time. Every human account that HAS a settings row already runs useSystemProvider:false
  // with its own key — this default now matches that reality instead of contradicting it.
  llm: {
    provider: 'anthropic_sdk',
    useSystemProvider: false,
  },
};

export type UserSettingsUpdate = Partial<UserSettings>;
