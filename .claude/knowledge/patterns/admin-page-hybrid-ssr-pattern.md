# Admin Page Hybrid SSR Pattern

> **Category**: Security | **Confidence**: 96% | **ROI**: High
> **Created**: 2026-01-15 | **Status**: Production-proven

## Problem

Admin pages using client-side auth (`'use client'` + `useAuth()`) have security gaps:
- Unauthorized users briefly see loading state before redirect
- Component code is downloaded even for unauthorized users
- Auth check happens in browser (can be inspected/delayed)

## Solution

Use the **hybrid SSR pattern**: Server component for auth gate, client component for UI.

```
┌─────────────────────────────────────────────────────────────────┐
│  page.tsx (Server Component)     │  ClientUI.tsx ('use client') │
│  ─────────────────────────────   │  ─────────────────────────── │
│  1. Auth check on SERVER         │  Interactive UI components   │
│  2. Redirect BEFORE HTML sent    │  Only loaded if authorized   │
│  3. Render client component      │  Tabs, forms, data fetching  │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation

### page.tsx (Server Component - NO 'use client')

```typescript
import { redirect } from 'next/navigation';
import { getAuthUserFromServer } from '@/lib/auth/get-auth-user';
import { UserRole } from '@/lib/types/auth';
import { AdminPageContent } from './AdminPageContent';

const ADMIN_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN];

/**
 * Admin Page with Server-Side Auth
 *
 * Security: Hybrid SSR pattern
 * - Auth check on SERVER (cannot be bypassed)
 * - Unauthorized users never receive component code
 * - Redirect happens before any HTML sent
 */
export default async function Page() {
  // Server-side auth (cannot be bypassed by client)
  const user = await getAuthUserFromServer();

  // Role check with redirect
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    authLogger.warn({
      userId: user?.userId || 'anonymous',
      role: user?.role || 'none',
      action: 'DENIED'
    }, 'PageName access unauthorized');
    redirect('/analytics');
  }

  // Audit log for successful access
  authLogger.info({
    userId: user.userId,
    role: user.role,
  }, 'PageName access authorized');

  // Only render for authorized users
  return <AdminPageContent />;
}
```

### AdminPageContent.tsx (Client Component)

```typescript
'use client';

import { useState } from 'react';
// ... other imports

/**
 * Admin Page Content (Client Component)
 *
 * This component is ONLY sent to authorized users.
 * All interactivity (tabs, forms, data fetching) goes here.
 */
export function AdminPageContent() {
  const [activeTab, setActiveTab] = useState('default');

  return (
    <div className="p-6">
      {/* Interactive UI here */}
    </div>
  );
}
```

## Security Benefits

| Aspect | Client-Only | Hybrid SSR |
|--------|-------------|------------|
| Auth check location | Browser | Server |
| Unauthorized sees | Loading → redirect | Nothing (immediate redirect) |
| Component code sent | Always | Only if authorized |
| Can be bypassed | Inspectable | No |
| Audit logging | Client-side | Server-side |

## When to Use

**Use this pattern for:**
- Admin-only pages (`/admin/*`, `/dashboard`, `/workflows`)
- Pages with sensitive data or operations
- Pages requiring role-based access control

**Not needed for:**
- Public pages
- User-facing pages where all authenticated users have access
- Pages with complex client-side routing requirements

## Pages to Apply This Pattern

Current admin pages using client-only auth that should migrate:

| Page | Current | Priority |
|------|---------|----------|
| `/workflows` | ✅ Migrated | Done |
| `/dashboard` | ✅ Already SSR | Done |
| `/admin/users` | Client | High |
| `/admin/audit` | Client | High |
| `/admin/settings` | Client | Medium |
| `/admin/templates/*` | Client | Medium |
| `/admin/roles` | Client | High |
| `/admin/permissions` | Client | High |

## Migration Checklist

- [ ] Remove `'use client'` from page.tsx
- [ ] Change to `async function Page()`
- [ ] Replace `useAuth()` with `getAuthUserFromServer()`
- [ ] Replace `router.replace()` with `redirect()`
- [ ] Move interactive UI to separate client component
- [ ] Add server-side audit logging
- [ ] Test unauthorized access redirects correctly
- [ ] Verify build passes

## Related Patterns

- `authorization-dual-layer-pattern.md` - API-level authorization
- `security-patterns.md` - General security patterns
- `api-security-withPOVAccess-pattern.md` - POV-scoped access control

## Examples in Codebase

- `/app/(authenticated)/dashboard/page.tsx` - Gold standard implementation
- `/app/(authenticated)/workflows/page.tsx` - Recently migrated
