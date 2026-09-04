import { prisma } from '@/lib/prisma';
import { defaultSettingsSelect } from '../prisma/select';
import { mapSettingsToResponse, validateTimezone } from '../prisma/mappers';
import { UserSettingsUpdate, defaultUserSettings } from '../types';
import { trackActivity } from '@/lib/auth/audit';

export async function getUserSettings(userId: string) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: defaultSettingsSelect,
  });

  if (!settings) {
    return null;
  }

  return mapSettingsToResponse(settings);
}

/**
 * P1.4 (2026-05-24, audit HIGH-10 PUT-merge guard): protect plaintext
 * credentials from being blanked by UI round-trips.
 *
 * Background: the profile form (app/(authenticated)/profile/page.tsx:108-114)
 * hydrates LLM key inputs from GET (now redacted to empty/booleans by P1.4
 * mapper), then PUTs the entire `data.llm` back unchanged on submit. The
 * pre-P1.4 shallow spread `{ ...existing, ...data }` would overwrite the real
 * stored key with the empty redacted value — silent credential wipe.
 *
 * This helper deep-merges protected sub-objects (llm, apiKey) and PRESERVES
 * the stored value for protected fields whenever incoming is empty/missing.
 * It also strips UI-echo flags (anthropicApiKeyConfigured, hasKey) that the
 * client may send back from the redacted GET — those never belong in the DB.
 *
 * Caught by boundary-contract-specialist. The naive shallow strip pattern
 * would NOT have worked because shallow merge means a partial `data.llm`
 * replaces the entire stored `llm` object.
 */
// Exported for test only (scripts/test-settings-redaction.ts). The preserve-vs-clear branch
// below is credential-wipe-adjacent — it needs direct coverage, not coverage-by-inference.
export function mergeSettingsPreservingSecrets(
  existing: Record<string, any> | null | undefined,
  incoming: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = { ...(existing || {}), ...incoming };

  if (existing?.llm || incoming?.llm) {
    const existingLlm = (existing?.llm as Record<string, any>) || {};
    const incomingLlm = (incoming?.llm as Record<string, any>) || {};
    result.llm = { ...existingLlm, ...incomingLlm };
    // EXPLICIT DELETE (2026-08-06). Preserve-on-empty below means a blank field can never remove
    // a key — correct (it stops the redacted GET's empty value wiping the credential on resubmit)
    // but it left NO way to delete one at all, short of editing the database. `clearAnthropicApiKey`
    // separates "I left it blank" from "I want it gone". Checked BEFORE the preserve branch, and
    // stripped afterwards so the transient signal is never itself persisted.
    if (incomingLlm.clearAnthropicApiKey === true) {
      delete result.llm.anthropicApiKey;
    } else if (!incomingLlm.anthropicApiKey) {
      // Preserve stored secret when incoming is empty/redacted
      result.llm.anthropicApiKey = existingLlm.anthropicApiKey;
    }
    delete result.llm.clearAnthropicApiKey;
    // Strip UI-echo booleans (read-only on GET, never persisted)
    delete result.llm.anthropicApiKeyConfigured;
  }

  if (existing?.apiKey || incoming?.apiKey) {
    const existingApiKey = (existing?.apiKey as Record<string, any>) || {};
    const incomingApiKey = (incoming?.apiKey as Record<string, any>) || {};
    result.apiKey = { ...existingApiKey, ...incomingApiKey };
    if (!incomingApiKey.token) result.apiKey.token = existingApiKey.token;
    delete result.apiKey.hasKey;
  }

  return result;
}

export async function updateUserSettings(userId: string, data: UserSettingsUpdate) {
  // Validate timezone if provided
  if (data.timezone && !validateTimezone(data.timezone)) {
    throw new Error('Invalid timezone');
  }

  // Get existing settings
  const existingSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: defaultSettingsSelect,
  });

  const existing = (existingSettings?.settings as Record<string, any>) || null;
  const mergedUpdate = mergeSettingsPreservingSecrets(existing, data as Record<string, any>);
  const mergedCreate = mergeSettingsPreservingSecrets(
    defaultUserSettings as Record<string, any>,
    data as Record<string, any>
  );

  // Update or create settings
  const settings = await prisma.userSettings.upsert({
    where: { userId },
    update: { settings: mergedUpdate },
    create: { userId, settings: mergedCreate },
    select: defaultSettingsSelect,
  });

  // Track activity
  await trackActivity(
    userId,
    'update',
    'settings',
    {
      resourceId: settings.id,
      changes: Object.keys(data),
    }
  );

  return mapSettingsToResponse(settings);
}
