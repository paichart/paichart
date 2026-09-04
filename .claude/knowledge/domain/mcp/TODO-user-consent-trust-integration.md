# TODO: User Consent & Trust Level Integration

> **Status**: Planning | **Created**: 2026-02-21 | **Priority**: Medium
>
> **Related Files**:
> - `lib/mcp/server/config/user-consent-policy.js` - GDPR consent framework (aspirational, not wired up)
> - `lib/services/workflow/security/trust-level.js` - Production trust level system
> - `lib/mcp/server/config/tool-security.js` - Tool access tiers
> - `lib/mcp/server/config/tool-annotations.js` - MCP spec annotations (includes GDPR erasure)
> - `.claude/knowledge/domain/mcp/prompts/trust_levels.md` - Trust level documentation

---

## Background

### Current State

**Trust levels** (production, live):
- 6-tier hierarchy (INTERNAL > TRUSTED > OWNER > TEAM_MEMBER > SCOPED > ANONYMOUS)
- Levels 1-4 receive JWT tokens automatically
- Trust is determined by structural relationships (ownership, team membership)
- No user input or consent required at any point

**Consent policy** (aspirational, not wired up):
- 4 consent types defined: SERVICE_REGISTRATION, SERVICE_CALLS, DATA_PROCESSING, MONITORING
- 3 privacy notice categories with retention periods
- Functions reference `prisma.userConsent`, `prisma.auditLog`, `prisma.securityLog` - none exist in schema
- GDPR user rights framework (access, rectification, erasure, portability, objection, withdrawal)

### The Gap

Adding a user to a POV team **automatically** grants TEAM_MEMBER trust for any service owned by the POV owner. The user's JWT token gets forwarded to those services with **no consent, no awareness, no opt-out**. The consent policy framework exists but is disconnected from the trust chain.

---

## Prerequisites

Before any use case can be implemented:

1. **Add `UserConsent` model to Prisma schema**:
   ```prisma
   model UserConsent {
     id          String   @id @default(cuid())
     userId      String
     user        User     @relation(fields: [userId], references: [id])
     consentType String   // SERVICE_REGISTRATION, SERVICE_CALLS, DATA_PROCESSING, MONITORING, TOKEN_FORWARDING
     status      String   // GRANTED, REVOKED, EXPIRED
     consentText String?  // Human-readable description shown at grant time
     version     String   @default("1.0")
     ipAddress   String?
     userAgent   String?
     grantedAt   DateTime @default(now())
     revokedAt   DateTime?
     expiresAt   DateTime
     metadata    Json?    // { source, operation, sessionId, serviceId, povId }
     createdAt   DateTime @default(now())
     updatedAt   DateTime @updatedAt

     @@index([userId, consentType, status])
     @@index([userId, expiresAt])
   }
   ```

2. **Decide on `AuditLog` and `SecurityLog` models** (referenced by `generateTransparencyReport` in user-consent-policy.js but not in schema). May be able to reuse existing `Activity` model which already logs `TRUST_DENIAL` events.

---

## Use Case 1: Team Join Consent

### Problem
When a POV owner adds a user to their team, the user gets TEAM_MEMBER trust automatically. Their JWT becomes eligible for forwarding to any service the POV owner runs. The user has no awareness of this.

### Proposed Flow
```
POV Owner invites Alice to team
  -> System generates consent form:
     - SERVICE_CALLS consent (your interactions will be logged)
     - DATA_PROCESSING consent (interactions analyzed for security/compliance)
     - MONITORING consent (security monitoring of interactions)
  -> Alice reviews implications:
     "Your JWT token may be passed to services owned by [POV Owner name]"
     "Your service interactions within this POV will be logged"
     "Service owners may see your usage patterns"
  -> Alice grants or denies
  -> If granted: TeamMember record created, consents recorded with povId in metadata
  -> If denied: Invitation remains pending, POV owner notified
```

### Integration Points
- `TeamMember` creation flow (wherever team members are added)
- `user-consent-policy.js` → `generateConsentForm('join_team', { userId, povId, povOwnerId })`
- New consent-to-operation mapping entry: `'join_team': ['SERVICE_CALLS', 'DATA_PROCESSING', 'MONITORING']`
- UI: Consent dialog in team invitation acceptance flow

### Complexity: Medium
- Requires UI component for consent dialog
- Requires linking consent records to specific POV/team
- Needs to handle invitation lifecycle (pending -> accepted/declined)

---

## Use Case 2: Token Forwarding Consent (Per-User Global)

### Problem
Users have no control over whether their JWT token is sent to external services. The trust system decides automatically based on relationships.

### Proposed Flow
```
User navigates to Settings > Privacy & Security
  -> Sees "Token Forwarding" toggle (default: ON for backward compatibility)
  -> Toggle OFF: System records TOKEN_FORWARDING consent as REVOKED
  -> Effect: buildServiceContext() checks consent before including token
     - If consent revoked: Trust level 1-4 services still work but receive no JWT
     - Service falls back to userId/email identification (like SCOPED trust)
  -> Toggle ON: Consent re-granted
```

### New Consent Type
```javascript
TOKEN_FORWARDING: {
  id: 'token_forwarding',
  title: 'Token Forwarding Consent',
  description: 'Allow your authentication token to be sent to external services',
  required: false,  // Optional - user can opt out
  implications: [
    'Your JWT token will be sent to services you interact with (trust levels 1-4)',
    'External services can cryptographically verify your identity via JWKS',
    'You can revoke this at any time (services still work but cannot verify your identity)',
    'Internal platform services (levels 1-2) always receive tokens regardless of this setting'
  ]
}
```

### Integration Point in trust-level.js
```javascript
// In buildServiceContext():
if (TOKEN_RECEIVING_TRUST_LEVELS.has(trustLevel)) {
  // Skip consent check for INTERNAL and TRUSTED (platform services)
  if (trustLevel === TrustLevel.INTERNAL || trustLevel === TrustLevel.TRUSTED) {
    return { ...baseContext, token };
  }

  // For OWNER and TEAM_MEMBER, check user consent
  const consent = await validateUserConsent(userId, 'token_forwarding', prisma);
  if (consent.valid) {
    return { ...baseContext, token };
  }

  // User opted out - downgrade to base context (no token)
  await logTrustDenial(prisma, {
    userId, serviceId, serviceName, trustLevel,
    povId, reason: 'User revoked TOKEN_FORWARDING consent'
  });
  return baseContext;
}
```

### Complexity: Low-Medium
- Settings UI toggle
- One new consent type
- Small modification to `buildServiceContext()`
- Backward compatible (default: consented)

---

## Use Case 3: Per-Service Token Consent

### Problem
Use Case 2 is all-or-nothing. A user might want to allow token forwarding to their own services (OWNER) but not to team services (TEAM_MEMBER), or approve specific services individually.

### Proposed Flow
```
Alice calls "data-analytics-service" (owned by Bob, TEAM_MEMBER trust)
  -> First call detected: No per-service consent recorded
  -> System prompts:
     "data-analytics-service (owned by Bob) will receive your JWT token.
      This service can verify your identity. Allow?"
  -> Options:
     [Allow this service] - Records consent with serviceId in metadata
     [Allow all services by Bob] - Records consent with ownerId in metadata
     [Deny] - Service call proceeds but without JWT (SCOPED-equivalent)
     [Always allow for this POV] - Records consent with povId in metadata
  -> Choice stored in UserConsent:
     metadata: { serviceId: "cm...", ownerId: "cm...", povId: "cm...", scope: "service|owner|pov" }
```

### Consent Lookup Order (most specific wins)
1. Per-service consent for this exact service
2. Per-owner consent for all services by this owner
3. Per-POV consent for all services within this POV
4. Global TOKEN_FORWARDING consent (Use Case 2)
5. Default: prompt user

### Integration Point
```javascript
async function checkPerServiceConsent(userId, serviceId, serviceOwnerId, povId, prisma) {
  // Check from most specific to least specific
  const consents = await prisma.userConsent.findMany({
    where: {
      userId,
      consentType: 'TOKEN_FORWARDING',
      status: 'GRANTED',
      expiresAt: { gt: new Date() }
    },
    orderBy: { grantedAt: 'desc' }
  });

  for (const consent of consents) {
    const meta = consent.metadata;
    if (meta?.serviceId === serviceId) return { allowed: true, scope: 'service' };
    if (meta?.ownerId === serviceOwnerId) return { allowed: true, scope: 'owner' };
    if (meta?.povId === povId) return { allowed: true, scope: 'pov' };
    if (!meta?.serviceId && !meta?.ownerId && !meta?.povId) return { allowed: true, scope: 'global' };
  }

  return { allowed: false, requiresPrompt: true };
}
```

### Complexity: High
- Requires interactive consent prompting during service calls
- Multi-level consent hierarchy
- Performance consideration: consent lookup on every service call (needs caching)
- MCP protocol may not support interactive consent prompts mid-call (would need pre-flight or async pattern)

---

## Use Case 4: GDPR Right to Object (Retroactive Revocation)

### Problem
A user should be able to see which services received their token historically and revoke future access.

### Proposed Flow
```
User navigates to Settings > Privacy > Transparency Report
  -> System calls generateTransparencyReport(userId, prisma)
  -> Shows:
     - Services that received their JWT (from Activity logs where action includes trust info)
     - Number of calls per service
     - Last call date
     - Current consent status per service
  -> User can click "Revoke" on any service
     -> Records consent as REVOKED with serviceId in metadata
     -> Future calls to that service skip JWT (SCOPED-equivalent)
  -> User can click "Revoke All External"
     -> Revokes global TOKEN_FORWARDING consent
     -> Only INTERNAL and TRUSTED services get tokens going forward
```

### Integration Points
- `user-consent-policy.js` → `generateTransparencyReport()` (already stubbed, needs real data)
- Reuse existing `Activity` table (already logs `TRUST_DENIAL` events)
- Need to also log `TRUST_GRANT` events when tokens ARE passed (currently only denials are logged)
- UI: Settings page with transparency dashboard

### Prerequisite
Add `TRUST_GRANT` audit logging alongside existing `TRUST_DENIAL` logging in trust-level.js:
```javascript
// In buildServiceContext(), after deciding to include token:
await prisma.activity.create({
  data: {
    userId,
    action: 'TRUST_GRANT',
    type: 'Security',
    metadata: { serviceId, serviceName, trustLevel, povId }
  }
});
```

### Complexity: Medium
- Transparency report already stubbed
- Activity model already exists and logs trust events
- Needs UI for the transparency dashboard
- Need to add TRUST_GRANT logging

---

## Use Case 5: Data Portability on Team Removal

### Problem
When a user is removed from a POV team (or leaves voluntarily), they should receive a record of their activity and have the option to request data erasure.

### Proposed Flow
```
Alice is removed from POV team (or leaves)
  -> System triggers:
     1. Generate transparency report for Alice's activity in this POV
     2. Export data package:
        - Service calls made within POV context
        - Services that received Alice's JWT
        - Timestamps and interaction summaries
        - Consent history for this POV
     3. Offer data erasure:
        "Would you like to request deletion of your interaction data for this POV?"
        -> If yes: Mark interaction logs for deletion (30-day grace period)
        -> If no: Data retained per standard retention policy
     4. Revoke all POV-scoped consents automatically
     5. TEAM_MEMBER trust for this POV's services is immediately removed
```

### Integration Points
- TeamMember deletion/removal flow
- `generateTransparencyReport()` scoped to specific POV
- Data export endpoint (JSON format, machine-readable per GDPR Article 20)
- Consent auto-revocation on team removal

### Complexity: Medium-High
- Requires POV-scoped transparency report (current stub is user-global)
- Data export packaging
- Deletion scheduling with grace period
- Automatic consent cleanup

---

## Use Case 6: Service Registration Consent (Existing, Needs Wiring)

### Problem
The consent policy already defines SERVICE_REGISTRATION consent but it's not enforced during actual service registration.

### Proposed Flow
```
User calls registry(action: "register", ...)
  -> validateUserConsent(userId, 'registry(action: "register")', prisma)
  -> If no consent: Return consent form with implications:
     "Your service information will be visible to authenticated users"
     "Other users may execute tools from your service"
     "Service usage will be logged for monitoring and billing"
     "You remain responsible for your service's actions and outputs"
  -> User grants consent
  -> Registration proceeds
  -> Consent recorded with serviceId in metadata
```

### Integration Point
- `registry(action: "register")` handler in MCP server tools
- `user-consent-policy.js` → `validateUserConsent()` + `recordUserConsent()`

### Complexity: Low
- Framework code already exists
- Just needs database model and handler integration

---

## Implementation Priority

| Priority | Use Case | Complexity | Value |
|----------|----------|-----------|-------|
| **1** | Prerequisites (Prisma model) | Low | Enables everything |
| **2** | UC6: Service Registration Consent | Low | Wires up existing code |
| **3** | UC2: Global Token Forwarding Toggle | Low-Medium | Biggest privacy win |
| **4** | UC4: GDPR Right to Object | Medium | Compliance requirement |
| **5** | UC1: Team Join Consent | Medium | Important but changes invitation flow |
| **6** | UC5: Data Portability | Medium-High | GDPR compliance |
| **7** | UC3: Per-Service Token Consent | High | Best UX but complex |

---

## Performance Considerations

- **Consent lookups on every service call** (UC2, UC3): Must be cached. LRU cache with 5-minute TTL keyed on `userId:consentType`. Invalidate on consent change.
- **Audit logging on every token pass** (UC4 prerequisite): Use async/fire-and-forget pattern (existing `logTrustDenial` already does this). Consider batching if volume is high.
- **Consent form generation**: Stateless, no DB queries. Already implemented as pure functions.

---

## Open Questions

1. **Backward compatibility**: Should existing team members be auto-consented, or should we prompt them on next login?
2. **INTERNAL/TRUSTED exemption**: Should platform services (levels 1-2) always bypass consent? Current recommendation: yes, they're same-process/localhost.
3. **Consent expiry**: Current policy sets 1-year expiry. Should this be configurable per consent type?
4. **MCP protocol limitations**: Can we prompt for consent mid-service-call, or must all consent be pre-collected? (Likely pre-collected via UI settings.)
5. **Multi-tenant implications**: When multi-tenancy ships, should consent be per-tenant or global per user?
