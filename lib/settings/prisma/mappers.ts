import { UserSettings } from '@prisma/client';
import { DefaultSettingsSelect } from './select';
import { UserSettings as UserSettingsType } from '../types';

/**
 * P1.4 (2026-05-24, audit HIGH-10): strip plaintext credentials from settings
 * JSONB before returning to any client. Replaces raw secrets with boolean
 * "configured" flags so the UI can still show "Key is set" without leaking
 * the value via Network tab, browser cache, screen share, or XSS.
 *
 * Affected fields:
 *   - llm.anthropicApiKey → replaced by an anthropicApiKeyConfigured boolean
 *   - apiKey.token → replaced by hasKey boolean
 *   - apiKey.apiKeyHistory[].token → dropped
 *
 * Internal server callers (lib/services/llm/llm-service.ts:60-64) read the
 * raw JSONB via Prisma directly, bypassing this mapper — they remain
 * unaffected. Verified by boundary-contract + auth-permissions specialists.
 */
export function redactSensitiveSettings(settings: unknown): unknown {
  if (!settings || typeof settings !== 'object') return settings;
  const src = settings as Record<string, any>;
  const redacted: Record<string, any> = { ...src };

  if (src.llm && typeof src.llm === 'object') {
    // `geminiApiKey` is still stripped even though the Gemini provider was removed 2026-08-05.
    // This is deliberate and is NOT residual Gemini support: 2 stored rows still carry the field,
    // and anything left in `src.llm` that isn't destructured out here passes through to the client
    // in `llmRest`. Dropping this line would turn a legacy value into a response leak — the exact
    // regression `test-settings-redaction.ts` asserts against ("no Gemini key prefix in response").
    // The paired `geminiApiKeyConfigured` boolean IS gone: nothing consumes it now.
    const { anthropicApiKey, geminiApiKey, ...llmRest } = src.llm;
    void geminiApiKey; // stripped, never surfaced
    redacted.llm = {
      ...llmRest,
      anthropicApiKeyConfigured: Boolean(anthropicApiKey),
    };
  }

  if (src.apiKey && typeof src.apiKey === 'object') {
    const { token, apiKeyHistory, ...apiKeyRest } = src.apiKey;
    redacted.apiKey = {
      ...apiKeyRest,
      hasKey: Boolean(token),
      ...(Array.isArray(apiKeyHistory)
        ? { apiKeyHistory: apiKeyHistory.map((h: any) => {
            if (!h || typeof h !== 'object') return h;
            const { token: _t, ...rest } = h;
            return rest;
          })}
        : {}),
    };
  }

  return redacted;
}

export function mapSettingsToResponse(settings: DefaultSettingsSelect) {
  return {
    id: settings.id,
    userId: settings.userId,
    settings: redactSensitiveSettings(settings.settings) as unknown as UserSettingsType,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

export function mapSettingsArrayToResponse(settings: DefaultSettingsSelect[]) {
  return settings.map(mapSettingsToResponse);
}

export function validateTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (e) {
    return false;
  }
}
