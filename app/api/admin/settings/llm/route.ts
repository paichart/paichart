import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { hashApiKey } from '@/lib/crypto/hashing';
import { trackActivity } from '@/lib/auth/audit';
import { UpdateLLMSettingsSchema } from '@/lib/validation/settings-validation';
import { adminSettingsLimiter } from '@/lib/middleware/rate-limit';
import { logger } from '@/lib/logger';

// Get the global LLM settings
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check admin role (SUPER_ADMIN also allowed)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Get the LLM settings from the CustomSchema
    const customSchema = await prisma.customSchema.findFirst({
      where: { name: 'llm_settings' },
    });

    // ✅ SECURITY FIX: Never return API keys (Week 2 P0 Fix #2)
    const defaultSettings = {
      provider: 'anthropic_sdk',
      anthropicApiKeySet: false,
      ollamaApiUrl: '',
      customApiUrl: '',
      customApiKeySet: false,
      allowUserOverride: true,
    };

    if (!customSchema) {
      return NextResponse.json({
        settings: defaultSettings,
      });
    }

    // Parse the settings from JSON
    const settings = customSchema.schema as unknown as any;

    // ✅ SECURITY FIX: Sanitize response (don't expose hashed keys either)
    return NextResponse.json({
      settings: {
        provider: settings.provider || 'anthropic_sdk',
        // Legacy rows may still carry anthropicApiKeyHash from before 2026-08-06; a hash is
        // not a usable key, so only the plaintext field counts as "configured".
        anthropicApiKeySet: !!settings.anthropicApiKey,
        ollamaApiUrl: settings.ollamaApiUrl || '',
        customApiUrl: settings.customApiUrl || '',
        customApiKeySet: !!settings.customApiKeyHash,
        allowUserOverride: settings.allowUserOverride ?? true
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Admin LLM Settings GET error');
    return NextResponse.json(
      { error: 'Failed to fetch LLM settings' },
      { status: 500 }
    );
  }
}

// Update the global LLM settings
export async function PUT(req: NextRequest) {
  try {
    // ✅ Rate limiting (P2.3): 10 updates per hour
    const rateLimitResponse = adminSettingsLimiter(req);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check admin role (SUPER_ADMIN also allowed)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // ✅ Validate the settings
    const body = await req.json();

    const validation = UpdateLLMSettingsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        error: 'Invalid LLM settings',
        details: validation.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }, { status: 400 });
    }

    const llmSettings = validation.data;

    // The org Anthropic key is stored as PLAINTEXT `anthropicApiKey`, not a hash (2026-08-06).
    // It was `anthropicApiKeyHash: hashApiKey(...)` — a SHA-256 digest. That is correct for a
    // secret you only ever VERIFY, and wrong for one you must REPLAY: the engine reads
    // `settings.anthropicApiKey` (llm-service.extractSettingsConfig) and sends it to Anthropic,
    // so a hash could never authenticate. The field name didn't match the reader either, so the
    // "Use System Provider" path could never work no matter what an admin typed here.
    // Matches how per-user keys are already stored. Both remain plaintext AT REST — encrypting
    // them is a separate, still-open piece of work; this change does not make that worse.
    // `customApiKeyHash` is deliberately left hashed: 'custom' is not a real provider (it has no
    // LLMProvider member and nothing reads it), so there is nothing to replay it to.
    const llmSettingsData: any = {
      provider: llmSettings.provider,
      customApiKeyHash: llmSettings.customApiKey ? hashApiKey(llmSettings.customApiKey) : undefined,
      // URLs are not sensitive (no hashing needed)
      ollamaApiUrl: llmSettings.ollamaApiUrl || '',
      customApiUrl: llmSettings.customApiUrl || '',
      allowUserOverride: llmSettings.allowUserOverride
    };

    // ✅ Remove undefined hashes (cleaner JSON)
    if (!llmSettingsData.customApiKeyHash) delete llmSettingsData.customApiKeyHash;

    // BC19 FIX: Atomic dual-table read-modify-write (SystemSettings + CustomSchema)
    await prisma.$transaction(async (tx) => {
      // Read existing SystemSettings
      const systemSettings = await tx.systemSettings.findUnique({
        where: { id: 'llm_settings' },
      });

      // Update or create SystemSettings
      if (systemSettings) {
        await tx.systemSettings.update({
          where: { id: 'llm_settings' },
          data: {
            notifications: systemSettings.notifications,
            twoFactor: systemSettings.twoFactor,
            darkMode: systemSettings.darkMode,
            updatedAt: new Date(),
          },
        });
      } else {
        await tx.systemSettings.create({
          data: {
            id: 'llm_settings',
            notifications: true,
            twoFactor: false,
            darkMode: false,
            updatedAt: new Date(),
          },
        });
      }

      // Read existing CustomSchema
      const existingSchema = await tx.customSchema.findFirst({
        where: { name: 'llm_settings' },
      });

      // PRESERVE-ON-EMPTY (2026-08-06). `llmSettingsData` is built fresh from the form and
      // REPLACES the stored schema wholesale, and the GET deliberately never returns the key —
      // so the admin form always loads with an empty key box. Without this, saving any unrelated
      // field (e.g. toggling allowUserOverride) would drop the key from the new object and
      // silently destroy the org credential. Harmless while the stored value was an unusable
      // hash; a live credential-wipe now that it is the real key. Same bug class, and the same
      // fix, as mergeSettingsPreservingSecrets on the per-user path.
      const existingLlm = (existingSchema?.schema as Record<string, any> | undefined) || {};
      if (llmSettings.clearAnthropicApiKey) {
        // Explicit delete — the ONLY way to remove a key. Empty never means delete.
        delete llmSettingsData.anthropicApiKey;
      } else if (llmSettings.anthropicApiKey) {
        llmSettingsData.anthropicApiKey = llmSettings.anthropicApiKey;
      } else if (existingLlm.anthropicApiKey) {
        llmSettingsData.anthropicApiKey = existingLlm.anthropicApiKey;
      }

      // Update or create CustomSchema
      if (existingSchema) {
        await tx.customSchema.update({
          where: { id: existingSchema.id },
          data: {
            schema: llmSettingsData,
            updatedAt: new Date(),
          },
        });
      } else {
        await tx.customSchema.create({
          data: {
            name: 'llm_settings',
            schema: llmSettingsData,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    // ✅ Audit logging (Week 2 P1)
    await trackActivity(
      user.userId,
      'SETTINGS',
      'UPDATE_LLM',
      {
        provider: llmSettings.provider,
        anthropicKeyChanged: !!llmSettings.anthropicApiKey,
        customKeyChanged: !!llmSettings.customApiKey,
        success: true
      }
    );

    logger.info({ provider: llmSettings.provider, keysChanged: [llmSettings.anthropicApiKey && 'anthropic', llmSettings.customApiKey && 'custom'].filter(Boolean).join(', ') }, 'AUDIT: LLM settings updated');

    // ✅ SECURITY FIX: Return sanitized response (never expose keys)
    return NextResponse.json({
      settings: {
        provider: llmSettingsData.provider,
        anthropicApiKeySet: !!llmSettingsData.anthropicApiKey,
        customApiKeySet: !!llmSettingsData.customApiKeyHash,
        ollamaApiUrl: llmSettingsData.ollamaApiUrl,
        customApiUrl: llmSettingsData.customApiUrl,
        allowUserOverride: llmSettingsData.allowUserOverride
      },
      message: 'LLM settings updated successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Admin LLM Settings PUT error');
    return NextResponse.json(
      { error: 'Failed to update LLM settings' },
      { status: 500 }
    );
  }
}
