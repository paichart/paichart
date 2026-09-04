# OAuth Architecture Clarification

**Date**: 2025-10-13
**Context**: Investigation during OAuth v2.3 monitoring implementation

## Executive Summary

pAIchart implements **two separate OAuth systems** with different purposes, authentication flows, and token management strategies. This document clarifies the architecture to prevent confusion about which clients use which system.

## The Two OAuth Systems

### System A: MCP OAuth (AI Clients)
**Purpose**: Stateless authentication for AI desktop clients
**Endpoints**: `/oauth/*` (e.g., `/oauth/callback`, `/oauth/authorize`)
**Implementation**: `mcp-server-http-clean.js` lines 640-663
**Clients**: Claude Desktop, ChatGPT Desktop

**Key Characteristics**:
- ✅ **Stateless**: Validates tokens per-request via GitHub API
- ✅ **No Token Storage**: Does not use `EnterpriseOAuthService.tokenStorage`
- ✅ **GitHub Only**: Single provider (GitHub personal access tokens)
- ✅ **Long-Lived Tokens**: GitHub tokens last 1+ year (no refresh needed)
- ✅ **No Background Refresh**: Not managed by `TokenRefreshService`

**Authentication Flow**:
```
1. Client presents GitHub token
2. MCP server validates via GitHub API (every request)
3. Creates/finds user in database
4. Returns user context
5. No token stored in memory
```

### System B: Web App OAuth (Browser Users)
**Purpose**: Token storage and proactive refresh for web application
**Endpoints**: `/api/auth/oauth/*` (e.g., `/api/auth/oauth/callback`, `/api/auth/oauth/authorize`)
**Implementation**: `/lib/auth/oauth/oauth-service.ts` lines 354-370
**Clients**: Browser users via https://paichart.app/login

**Key Characteristics**:
- ✅ **Stateful**: Stores tokens in `EnterpriseOAuthService.tokenStorage` (static Map)
- ✅ **Background Refresh**: Managed by `TokenRefreshService` (runs every 5 minutes)
- ✅ **Multiple Providers**: Microsoft, Google, GitHub
- ✅ **Proactive Refresh**: Refreshes tokens 10 minutes before expiry
- ✅ **In-Memory Storage**: Tokens lost on server restart (by design in v2.2)

**Authentication Flow**:
```
1. User logs in via browser
2. OAuth provider returns tokens (access + refresh)
3. Tokens stored in EnterpriseOAuthService.tokenStorage Map
4. Background service checks every 5 minutes
5. Tokens refreshed 10 minutes before expiry
6. Health endpoint reports token count
```

## Token Storage Map Structure

**Location**: `EnterpriseOAuthService.tokenStorage` (static Map)
**Scope**: Web App OAuth (System B) ONLY
**Key Format**: `oauth_${userId}`

**Value Structure**:
```typescript
{
  userId: string;
  provider: string;          // 'microsoft' | 'google' | 'github'
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  lastRefreshed: Date;
  refreshAttempts: number;
}
```

**Why Claude Desktop Sessions Show 0 Tokens**:
- Claude Desktop uses **MCP OAuth (System A)** - stateless validation
- It does NOT use **Web App OAuth (System B)** - no tokens stored
- Seeing 0 tokens is **correct behavior** when only MCP sessions are active

## Implementation Plan Clarification

**Original Objective** (from `oauth-token-refresh-implementation-plan-v2.1-final.md`):
> "Eliminate Daily Re-authentication: Desktop clients (Claude Desktop, ChatGPT) stay connected indefinitely"

**Clarification**:
- This objective refers to **Web App OAuth desktop clients** (users who access the web app from desktop browsers)
- It does **NOT** refer to **AI desktop clients** (Claude Desktop, ChatGPT applications)
- AI desktop clients use MCP OAuth with long-lived GitHub tokens (already stay connected indefinitely)

**Updated Understanding**:
- Web App OAuth: For browser users who need token refresh (access tokens expire in 1-24 hours)
- MCP OAuth: For AI clients with long-lived tokens (1+ year, no refresh needed)

## Health Monitoring

**Health Endpoint**: `/api/auth/oauth/health`

**What It Reports**:
```json
{
  "status": "healthy",
  "service": {
    "running": false,          // ❌ Process isolation issue
    "lastRun": "2025-10-13...", // ✅ Works correctly
    "tokensInMemory": 0        // ✅ Works correctly (0 = no web sessions)
  },
  "tokens": {
    "total": 0,
    "expiringWithin10Min": 0,
    "failedRefreshes": 0
  }
}
```

**Known Issues**:
- `service.running` always reports `false` due to Next.js process isolation
- `tokensInMemory` correctly reports count from `EnterpriseOAuthService.tokenStorage`
- Shows 0 tokens when only MCP OAuth sessions are active (expected behavior)

## Testing Token Storage

**To verify token storage works**:

1. **Open browser** and navigate to https://paichart.app/login
2. **Log in** using Microsoft, Google, or GitHub
3. **Check health endpoint**: `curl https://paichart.app/api/auth/oauth/health`
4. **Verify**: `tokensInMemory` should show `1` (or more for multiple providers)
5. **Check logs**: `pm2 logs paichart-web` should show token storage activity

**What WON'T work**:
- Connecting Claude Desktop or ChatGPT (uses MCP OAuth, no token storage)
- Checking MCP server logs for token storage (wrong OAuth system)

## Daily Health Email

**Script**: `/scripts/enterprise-health-monitor.sh`
**Schedule**: Every 5 minutes + daily summary at 23:55

**OAuth Metrics Included**:
```
🔐 OAuth Token Refresh Service:
  • Service Status: HEALTHY (Running: false)
  • Tokens in Memory: 0
  • Expiring Soon (<10min): 0
  • Failed Refreshes: 0
  • Circuit Breaker: CLOSED
```

**Alerts Generated**:
- ⚠️ WARNING: Service not running (expected due to process isolation)
- ⚠️ WARNING: Token refresh failures detected
- 🚨 ALERT: Circuit breaker OPEN

## Architectural Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     pAIchart OAuth Systems                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐        ┌──────────────────────┐  │
│  │   MCP OAuth (A)      │        │  Web App OAuth (B)   │  │
│  │   AI Clients         │        │  Browser Users       │  │
│  ├──────────────────────┤        ├──────────────────────┤  │
│  │ Endpoints:           │        │ Endpoints:           │  │
│  │ • /oauth/*           │        │ • /api/auth/oauth/*  │  │
│  │                      │        │                      │  │
│  │ Clients:             │        │ Clients:             │  │
│  │ • Claude Desktop     │        │ • Browser (Chrome)   │  │
│  │ • ChatGPT Desktop    │        │ • Browser (Safari)   │  │
│  │                      │        │                      │  │
│  │ Providers:           │        │ Providers:           │  │
│  │ • GitHub (only)      │        │ • Microsoft          │  │
│  │                      │        │ • Google             │  │
│  │                      │        │ • GitHub             │  │
│  │                      │        │                      │  │
│  │ Token Storage:       │        │ Token Storage:       │  │
│  │ • None (stateless)   │        │ • In-memory Map      │  │
│  │                      │        │ • Per-user           │  │
│  │                      │        │                      │  │
│  │ Refresh Service:     │        │ Refresh Service:     │  │
│  │ • Not needed         │        │ • TokenRefreshSvc    │  │
│  │ • Tokens last 1+ yr  │        │ • Every 5 minutes    │  │
│  │                      │        │ • 10min threshold    │  │
│  └──────────────────────┘        └──────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Key Files Reference

### MCP OAuth (System A)
- **Server**: `/mcp-server-http-clean.js`
- **Token Validation**: `lib/auth/oauth/mcp-oauth-validator.js` — `verifyGitHubToken()` (~lines 58-136). Note: server-class duplicate was removed in Phase 3.0a (Wave 3a, May 2026). Validator class is now sole authority.
- **No Storage**: Validates per-request via GitHub API

### Web App OAuth (System B)
- **Service**: `/lib/auth/oauth/oauth-service.ts`
- **Token Storage**: Lines 432-441 (static Map definition)
- **Storage Logic**: Lines 354-370 (`callback()` method)
- **Refresh Service**: `/lib/auth/oauth/token-refresh-service.ts`
- **Health Endpoint**: `/app/api/auth/oauth/health/route.ts`

### Monitoring
- **Health Script**: `/scripts/enterprise-health-monitor.sh` (lines 223-268)
- **Test Script**: `/scripts/test-health-email.sh`
- **Cron Job**: System logrotate at `/etc/logrotate.d/paichart-oauth`

## Recommendations

1. **Update Implementation Plan**: Clarify that "desktop clients" in objectives refers to browser desktop users, not AI desktop applications

2. **Fix Health Endpoint**: Consider inferring `service.running` status from `lastRun` timestamp:
   ```typescript
   const isRunning = serviceHealth.lastRun &&
     (Date.now() - serviceHealth.lastRun.getTime()) < 10 * 60 * 1000;
   ```

3. **Documentation**: Add this architectural diagram to main OAuth documentation

4. **Testing**: Verify Web App OAuth by logging in via browser and checking token count

## Version History

- **v2.2**: In-memory token storage implementation
- **v2.3**: Enhanced management endpoints, health monitoring, circuit breaker
- **2025-10-13**: Architectural clarification and dual-system documentation
