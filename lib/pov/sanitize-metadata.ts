/**
 * POV metadata reserved-key guard (2026-05-27, pentest MA-1).
 *
 * `POV.metadata` is user-controlled freeform JSON, but some keys are
 * system-trusted — notably `isDemo`, which gates whether the POV is readable by
 * public DEMO viewers (the read filter is `metadata.isDemo === true`). These keys
 * must NOT be settable by a non-admin via a metadata mass-assignment.
 *
 * Verified live (MA-1): a plain USER could `PUT {"metadata":{"isDemo":true}}` on
 * their own POV and have it persist — injecting arbitrary content into the
 * viewer-facing demo pool. Write is already authz-gated (own POV / DEMO viewers
 * are read-only / cross-tenant → 403), so this is content-integrity, not an
 * isolation break — but the demo pool is exactly what launch viewers see.
 *
 * Policy: admins may set anything. For non-admins, reserved keys are forced to the
 * POV's EXISTING value (carried forward) or dropped if none existed. All other
 * metadata keys pass through unchanged (replace semantics preserved otherwise).
 */

export const RESERVED_POV_METADATA_KEYS = ['isDemo', 'tenantId'] as const;

type Meta = Record<string, unknown> | null | undefined;

export function sanitizePovMetadata(
  incoming: Meta,
  opts: { isAdmin: boolean; existing?: Meta },
): Meta {
  // No metadata in the payload → leave the field untouched.
  if (incoming === undefined || incoming === null) return incoming;
  // Admins may set reserved keys.
  if (opts.isAdmin) return incoming;
  // Non-object (shouldn't reach here past schema validation) → leave as-is.
  if (typeof incoming !== 'object' || Array.isArray(incoming)) return incoming;

  const existing =
    opts.existing && typeof opts.existing === 'object' && !Array.isArray(opts.existing)
      ? (opts.existing as Record<string, unknown>)
      : {};

  const result: Record<string, unknown> = { ...(incoming as Record<string, unknown>) };
  for (const k of RESERVED_POV_METADATA_KEYS) {
    if (k in existing) result[k] = existing[k]; // carry forward the system value
    else delete result[k]; // or drop the attacker-supplied value
  }
  return result;
}
