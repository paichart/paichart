# MCP Session Consistency Discovery

**Last Updated**: 2026-06-11 (SC1 re-scope — pair rewritten around the live session domain)
**Status**: v2.0 — SessionStore + transport sessions + prompt-cache consistency + Protocol 9 Tracked Items
**Confidence**: Very High — every grep below proven against the tree on 2026-06-11
**Last Validated**: 2026-06-11

## Objective

Map the four surfaces that make an MCP "session" behave consistently:

1. **SessionStore** — the extracted in-memory state for the MCP HTTP server (sessions, OAuth state, auth codes)
2. **Transport sessions** — `Mcp-Session-Id` lifecycle, P7 identity binding, client-mode detection
3. **Prompt-cache consistency** — the in-process prompt cache vs the `agent_prompt_library` DB table
4. **Roadmap risk** — Protocol 9's two Tracked Items (30-min idle TTL; stateless transition)

## 1. SessionStore — Run These Greps FIRST

`lib/auth/oauth/session-store.ts` (539 lines) consolidates the 5 Maps that previously lived on
`CleanMCPHTTPServer` (SESSION-STORE-EXTRACTION-PLAN-v2.md, Phases 2.1–2.11, May 2026).

```bash
# Single instantiation point (the HTTP server owns it):
grep -rn "new SessionStore" lib/ mcp-server-http-clean.js --include="*.ts" --include="*.js"   # expect 1 (mcp-server-http-clean.js:~170)

# TTLs — session 30 min FIXED (no sliding refresh; see Tracked Item #1):
grep -n "sessionTtlMs ?? 30" lib/auth/oauth/session-store.ts   # expect 1 (:~224)

# Sliding-TTL was REMOVED in Phase 2.11 (2026-05-19) — git-history pointer kept in-file.
# Do NOT re-add without re-opening Tracked Item #1:
grep -n "trackSessionCreation + refreshSessionTTL removed" lib/auth/oauth/session-store.ts   # expect 1 (:~316)

# Invariants (header block) — verify all five survive any edit:
#   sync exchangeAuthCode (replay defense, sec-ops C1) · atomic+idempotent deleteSession (AP I-3)
#   setContext-requires-setSession (AP C-3) · idempotent destroy (sec-ops I1) · noCleanup option (sec-ops C3)
grep -n "INVARIANTS" lib/auth/oauth/session-store.ts   # expect 2 (:15 store invariants + :40 SessionContext interface invariants)

# Gate (12 tests; runs in CI):
npm run test:session-store
```

## 2. Transport Sessions — Mcp-Session-Id + P7 Identity Binding

The session-per-transport machinery lives in the Wave-6/7 extracted modules, NOT in
mcp-server-http-clean.js (facade since Wave 7).

```bash
# Session header handling + P7 binding/rejection:
grep -n "mcp-session-id" lib/mcp/server/routes/mcp-transport-routes.ts | head -3
grep -n "P7" lib/mcp/server/routes/mcp-transport-routes.ts   # expect 5: binding (:~133-136) + hijack rejection (:~214-222); P4 fresh-auth preference adjacent at :~232-237

# Client-mode detection + stateless dispatch (MCPCoreManager, Wave 7):
grep -n "detectClientMode\|handleStatelessRequest" lib/mcp/server/mcp-core.ts | head -5

# Transport parity gate:
npm run test:mcp-transport-parity
```

**P7 invariant**: a session is bound to the creating user's identity (`SessionContext.userId`,
top-level); any request presenting that session with a different authenticated user is rejected
as potential hijacking. The interface contract lives in `SessionContext` (session-store.ts) —
its consumers are in `mcp-transport-routes.ts`.

## 3. Prompt-Cache Consistency (the surviving slice of the original 2025 scope)

Database prompts are cached in-process by `prompt-registry.js`; the DB is the source of truth
but the cache does NOT self-invalidate on DB writes.

```bash
# Cache bounds + isPublic cache-hit gate (non-admins blocked from isPublic:false even on cache hits):
grep -n "MAX_DB_PROMPTS\|isPublic === false" lib/mcp/server/prompts/prompt-registry.js | head -4

# The deploy cycle for landing prompt changes (memory: reference_mcp_prompt_cache):
#   1. UPDATE agent_prompt_library (or re-seed)  2. pm2 restart paichart-mcp  3. client /mcp re-auth
# Exercised live 2026-06-11 (ABOUT-security-policy surgical fix).
```

## 4. Roadmap Risk — Protocol 9 Tracked Items

Both live in `.claude/knowledge/protocols/mcp-sdk-upgrade-protocol.md` and are re-decided on
every SDK bump:

- **#1 — 30-min idle TTL**: long agent tasks in Claude Desktop / ChatGPT may hit the fixed
  `sessionTtlMs`. Trigger to act: first user-reported session expiry. The removed sliding-TTL
  implementation is recoverable from git history (pointer at session-store.ts:~316).
- **#2 — Stateless transition**: the 2026 MCP roadmap moves away from server-owned session
  state (SEP-1442 / SEP-2567). `TransportData.temporary` + `handleStatelessRequest` are the
  current stateless seams.

## Red Flags

- ⚠️ A new Map appears on the server class instead of inside SessionStore (re-fragmenting Phase 2.1)
- ⚠️ `exchangeAuthCode` gains an `await` between get and delete (replay window — sec-ops C1)
- ⚠️ Sliding TTL re-added without a Tracked Item #1 decision
- ⚠️ A prompt edit "deployed" without the restart + re-auth cycle (cache serves stale text)
- ⚠️ Session-bound identity checks bypassed in a new transport route (P7)

## Historical Note

v1.x of this doc (2025) was the investigation prompt for a then-unresolved bug — database
prompts available over stdio but not HTTP, on the platform's pre-rename name ("chameleon").
That bug is long resolved; the prompt-persistence concern survives as §3 above. The May-2026
SessionStore drift sweep (`338add12`) missed this pair because SessionStore lives in the oauth
domain — the SC1 re-scope (2026-06-11) closed that gap.
