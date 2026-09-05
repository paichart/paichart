# User Retirement / Safe-Delete Runbook

> **Purpose**: safely delete a `User` row (e.g. retiring a personal-Gmail / PII account, or a test
> account) **without losing real data or leaving orphans**. Deleting a user is *not* a simple
> `DELETE` — it triggers a mix of Cascade / Restrict / SetNull FK actions plus non-FK dangling refs.
> **Proven**: `<maintainer-email>` (2026-05-27, SQL path) + `cterryaus@gmail.com` (2026-05-27, GUI path).
> **Owner**: database-manager-specialist (cascade semantics + transaction patterns).

---

## TL;DR — the only things that need a human decision

Everything a user references is auto-handled by the schema **except** these — handle them BEFORE the delete:

| Concern | FK action | Why it matters | What to do first |
|---|---|---|---|
| **POVs the user owns** (`POV.ownerId`) | **Cascade** | Deleting the user **deletes their POVs + all phases/stages/tasks/executions/artifacts** | **Reassign** to keep them, or accept deletion |
| **POV → Team orphan** | `POV.teamId → Team` Cascade fires on **Team**-delete, *not* POV-delete | Raw `DELETE FROM "POV"` leaves the Team **orphaned** | Delete the Team explicitly, **or** use the GUI/service POV-delete which cleans it (commit `9f8856ec`) |
| **Workflow executions** (`mcp_workflow_executions.userId`) | **RESTRICT** (the *only* Restrict on User) | **Blocks** the user delete entirely if any rows exist | Reassign or delete those rows first |
| **Non-FK dangling scalars** | none (plain columns) | Silently point at a dead user id | Reassign/null: `agent_templates.createdBy`, `mcp_recommendations.implementedBy` |
| **MCP services** (`mcp_tools.configuration.ownerId` / `permissions.owner`) | none (JSON, no FK) | Service keeps a dead owner id | Reassign or delete the service |

Auto-handled (no action): `Task.assignee_id` + `MCPRecommendation.user_id` → **SetNull**; everything else
that references `User` (`Comment`, `Activity`, `Notification`, `TeamMember`, `TaskActivity`,
`StageActivity`, `UserSettings`, `RefreshToken`, `SupportRequest`, `FeatureRequest`, …) → **Cascade**
(deleted with the user).

---

## Path A — GUI (recommended when the footprint is small)

Verified clean for cterryaus. **Order matters.**

1. **Delete the user's POVs from the GUI first** (`DELETE /api/pov/[povId]`). The POV-delete *service*
   (`lib/pov/services/pov.ts`, commit `9f8856ec`) deletes the POV **and its Team** → no orphan.
   *(If you want to keep a POV, reassign its owner in the GUI instead of deleting it.)*
2. **Delete the user from the admin GUI** (`UserManagement.tsx` → `DELETE /api/admin/users?userId=…`
   → `AdminUserService.deleteUser` = `prisma.user.delete`, a **hard** delete). Cascades fire; with the
   POVs already gone there's nothing left to cascade-delete, and `mcp_workflow_executions` RESTRICT
   only blocks if rows exist.

⚠️ **Why POV-first**: if you delete the **user** first, `prisma.user.delete` FK-cascade-deletes the POVs
**bypassing the service's Team cleanup** → orphaned Teams. POV-first (via the service) avoids that.

The GUI user-delete also enforces a **role guard** (can't delete a user with a higher role than yours)
and writes a SOC-2 audit event (`USER_MANAGEMENT:DELETE_USER`).

---

## Path B — SQL (for reassignment, bulk, or headless)

Use when you want to **preserve** the user's POVs (reassign) or are scripting. Always dry-run first.

**Connect** (prod): `ssh <PROD_USER>@<PROD_HOST>` → `cd /var/www/paichart-app/current && source .env.production && psql "$DATABASE_URL"`

**Step 0 — backup**: `pg_dump -Fc "$DATABASE_URL" -f /root/retire-<user>-$(date +%F-%H%M%S).dump`

**Step 1 — impact analysis** (substitute the user id):
```sql
\set uid 'PUT_USER_ID_HERE'
SELECT 'POVs_owned (Cascade→deletes+orphans Team)' AS check, count(*) FROM "POV" WHERE "ownerId"=:'uid'
UNION ALL SELECT 'workflow_execs (RESTRICT→BLOCKS)', count(*) FROM mcp_workflow_executions WHERE "userId"=:'uid'
UNION ALL SELECT 'agent_templates.createdBy (dangles)', count(*) FROM agent_templates WHERE "createdBy"=:'uid'
UNION ALL SELECT 'recs.implementedBy (dangles)', count(*) FROM mcp_recommendations WHERE "implementedBy"=:'uid'
UNION ALL SELECT 'assigned_tasks (SetNull, auto)', count(*) FROM tasks WHERE assignee_id=:'uid'
UNION ALL SELECT 'team_memberships (Cascade, auto)', count(*) FROM "TeamMember" WHERE "userId"=:'uid'
UNION ALL SELECT 'MCP services owned (dangle)', count(*) FROM mcp_tools WHERE configuration->>'ownerId'=:'uid' OR permissions->>'owner'=:'uid';
```

**Step 2 — transactional retire** (dry-run = ends in ROLLBACK; flip to COMMIT to apply). Reassign target
is looked up by email so it's env-portable:
```sql
BEGIN;
-- Reassign target is looked up inline by email (env-portable — ids differ per environment).
-- 1. POV ownership FIRST (else the POVs cascade-delete on user delete)
UPDATE "POV" SET "ownerId"=(SELECT id FROM "User" WHERE email='<maintainer-email>') WHERE "ownerId"=:'uid';
-- 2. clear the RESTRICT blocker (reassign or DELETE the rows)
UPDATE mcp_workflow_executions SET "userId"=(SELECT id FROM "User" WHERE email='<maintainer-email>') WHERE "userId"=:'uid';
-- 3. keep reassigned POVs' tasks assigned (else Task.assignee SetNulls to unassigned)
UPDATE tasks SET assignee_id=(SELECT id FROM "User" WHERE email='<maintainer-email>') WHERE assignee_id=:'uid';
-- 4. reassign/null the non-FK dangling scalars
UPDATE agent_templates    SET "createdBy"=(SELECT id FROM "User" WHERE email='<maintainer-email>') WHERE "createdBy"=:'uid';
UPDATE mcp_recommendations SET "implementedBy"=NULL WHERE "implementedBy"=:'uid';
-- 5. (if any) reassign/delete MCP services owned via JSON — handle per service
-- 6. delete the user (Cascade cleans TeamMember/Comment/Activity/Notification/etc.)
DELETE FROM "User" WHERE id=:'uid';

-- verify post-state here (re-run Step 1 counts → expect 0 on OLD id), then:
ROLLBACK;   -- change to COMMIT to apply
```

If instead you want to **discard** the user's POVs (not reassign): skip Step 1's POV reassign; after
`DELETE FROM "User"` the POVs cascade-delete but their **Teams orphan** — clean them with the orphan
sweep below (`DELETE FROM "Team" WHERE id IN (…)`).

---

## Orphan sweep (post-delete verification — reusable any time)

```sql
SELECT 'orphaned Teams (no POV)' AS check, count(*) AS n
  FROM "Team" t WHERE NOT EXISTS (SELECT 1 FROM "POV" p WHERE p."teamId"=t.id)
UNION ALL SELECT 'dangling agent_templates.createdBy', count(*)
  FROM agent_templates a WHERE a."createdBy" IS NOT NULL
    AND a."createdBy" <> 'system'                              -- ← see caveat
    AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id=a."createdBy")
UNION ALL SELECT 'dangling mcp_recommendations.implementedBy', count(*)
  FROM mcp_recommendations r WHERE r."implementedBy" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id=r."implementedBy")
UNION ALL SELECT 'dangling mcp_tools owner', count(*)
  FROM mcp_tools m WHERE m.configuration->>'ownerId' IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = m.configuration->>'ownerId')
ORDER BY n DESC;
```

**⚠️ `createdBy='system'` caveat**: seeded/default `agent_templates` carry the literal string
`createdBy='system'` — an **intentional sentinel**, never a real `User` id (20 rows on prod as of
2026-05-27, all `isDefault=true`). Do **NOT** null/"fix" these — exclude them (the `<> 'system'` above).

---

## Service accounts (`@paichart.system`) — 2026-06-04

`@paichart.system` accounts (e.g. `demo-owner@paichart.system`, `monitor@paichart.system`) are
**passwordless, non-login** service identities (role `USER`), marked by the email suffix
(`lib/utils/team-member-guard.ts` `SYSTEM_ACCOUNT_EMAIL_SUFFIX`). They are:
- **Excluded from team-member / assignee pickers and write-adds** (suffix guard across the 6
  picker/write surfaces) — they never clutter team UIs.
- **Protected from the demo-cleanup cron** (`scripts/cleanup-demo-users.ts` `PROTECTED_EMAILS` +
  suffix guard) — that cron only reaps idle `DEMO_USER` rows, never `@paichart.system`.

So retiring one is **always a deliberate manual op via this runbook** — never automatic.

**`demo-owner@paichart.system`** is a real content owner (2026-06-04: owns **2 POVs**, member of
**1 team**, assignee of **77 tasks**). To tear down the demo:
- **(a) Full teardown** — delete the demo POVs first (GUI **Path A**, or the POV-delete service so
  Teams don't orphan); their tasks/phases/stages cascade away. Then delete `demo-owner` once it
  owns nothing — direct, no reassignment.
- **(b) Keep the content** — reassign `demo-owner`'s POVs/tasks to another owner via **Path B**,
  then delete.

**`monitor@paichart.system`** owns/assigns nothing — if ever retired it can be deleted directly
(only its minted RS256 token + any login `Activity` exist; the token also lives in
`PAICHART_MONITOR_TOKEN` env/secret, remove there too).

---

## Gotchas

- **Mixed column casing** (Prisma `@map` inconsistency — quote camelCase, not snake_case):
  `"POV"."ownerId"/"teamId"`, `mcp_workflow_executions."userId"`, `agent_templates."createdBy"`,
  `mcp_recommendations.user_id` (snake!) **but** `mcp_recommendations."implementedBy"` (camel!),
  `tasks.assignee_id` / `tasks.pov_id` (snake), `"TeamMember"."userId"`.
- **`check` is a reserved word** — alias columns as `chk` or quote, and `ORDER BY 1` not `ORDER BY check`.
- **MCP service ownership is JSON, not an FK** — deleting the user neither blocks nor cascades it; the
  service silently keeps a dead `ownerId`. Always include the `mcp_tools` check.
- **DEMO users** are read-only on POVs and register-denied, so their footprint is usually tiny (often
  just login `Activity` + maybe workflow execs). But verify — cterryaus (DEMO) still owned 1 POV.

## References
- Schema: `prisma/schema.prisma` — `POV.owner`/`POV.team` (Cascade), `MCPWorkflowExecution.user` (Restrict).
- POV→Team cleanup: `lib/pov/services/pov.ts` `delete()` (commit `9f8856ec`).
- Admin user delete: `lib/admin/services/user.ts` `deleteUser` (hard `prisma.user.delete`).
- Worked examples: `cline_docs/reviews/retire-steveterry66-2026-05-27/retire-steveterry66.sql`.
- Memory: `project_pov_team_orphan_bug`, `prelaunch-pentest-2026-05-26`.
