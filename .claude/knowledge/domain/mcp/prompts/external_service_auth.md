# External Service Authentication

> **Validate pAIchart JWT tokens in your external MCP service**
>
> JWKS validation, RS256 tokens, Component 5, **U2 Audience-Tightening (2026-05-19)**, and security best practices

> **⚠️ POST-U2 (2026-05-19) UPDATE — required reading**
>
> The Hub now mints **per-service audiences** (RFC 8707) for tokens forwarded to your service. Your validator's accept-list MUST include `https://paichart.app/mcp/<your-service-slug>` where `<your-service-slug>` is your service's normalized name. The 2 legacy generic audiences (`/api`, `/mcp`) remain accepted during the 1-week overlap window — drop them later.
>
> Code examples below show the LEGACY 2-audience pattern; the seeded `HOWTO-validate-jwt-tokens` prompt (DB-loaded, see `scripts/seed-operational-prompts.ts`) has the UPDATED examples with per-service audience + env-var-driven accept-list. Use the seeded version as the source of truth; this doc is supplemented but not fully rewritten (code examples below need `+ 'https://paichart.app/mcp/<your-service-slug>'` added to every audience array).
>
> Updated reference template: `.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md` Step 4 (post-U2 rewritten).

---

## 🎯 Quick Navigation

**What do you need?**

- **[A] Quick start** → See 3-Step Integration
- **[B] Understand JWKS** → See What is JWKS?
- **[C] Component 5** → See Audience-Based Isolation
- **[D] Code examples** → See Implementation Examples
- **[E] Test integration** → See token-validator Service
- **[F] Troubleshooting** → See Common Validation Errors

---

## 🔐 What You'll Learn

By the end of this guide, you'll understand:
- ✅ How to validate pAIchart JWT tokens using JWKS
- ✅ What Component 5 is (audience-based isolation)
- ✅ Why RS256 is secure (no shared secrets)
- ✅ How to implement validation in TypeScript/JavaScript/Python
- ✅ How to test with token-validator service

**Time**: 20-30 minutes

---

## Section A: 3-Step Integration (Quick Start)

### Step 1: Install JWT Library

**TypeScript/JavaScript** (recommended):
```bash
npm install jose
```

**Python**:
```bash
pip install pyjwt cryptography
```

---

### Step 2: Validate Tokens via JWKS

**TypeScript/JavaScript**:
```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

// pAIchart JWKS endpoint - fetches public key automatically
const PAICHART_JWKS = createRemoteJWKSet(
  new URL('https://paichart.app/api/auth/jwks')
);

async function validatePAIchartToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, PAICHART_JWKS, {
      issuer: 'https://paichart.app',
      audience: ['https://paichart.app/api', 'https://paichart.app/mcp']
    });

    return {
      valid: true,
      userId: payload.sub,
      email: payload.email,
      role: payload.role
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
```

**Python**:
```python
import jwt
import requests
from cryptography.hazmat.primitives import serialization

def validate_paichart_token(token: str):
    try:
        # Fetch JWKS
        jwks_url = 'https://paichart.app/api/auth/jwks'
        jwks = requests.get(jwks_url).json()

        # Decode header to get key ID
        header = jwt.get_unverified_header(token)
        kid = header['kid']

        # Find matching public key
        key = next((k for k in jwks['keys'] if k['kid'] == kid), None)
        if not key:
            return {'valid': False, 'error': 'Public key not found'}

        # Convert JWK to PEM
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)

        # Verify token
        payload = jwt.decode(
            token,
            public_key,
            algorithms=['RS256'],
            issuer='https://paichart.app',
            audience=['https://paichart.app/api', 'https://paichart.app/mcp']
        )

        return {
            'valid': True,
            'userId': payload['sub'],
            'email': payload['email'],
            'role': payload['role']
        }
    except Exception as e:
        return {'valid': False, 'error': str(e)}
```

---

### 💡 Quick Start: Get Working Code Examples

**Want to see all 3 language implementations at once?**

Run this workflow to get TypeScript, JavaScript, AND Python examples in parallel (15 seconds):

```javascript
services(action: "workflow.execute", workflowName: "jwks-validation-advanced-demo")
```

**Returns**: Complete working code for all 3 languages + validation results + performance metrics

---

### Step 3: Use in Your Tool Handler

**TypeScript**:
```typescript
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const context = args._context;

  // Validate token
  if (!context?.token) {
    return {
      content: [{ type: 'text', text: 'Authentication required' }],
      isError: true
    };
  }

  const auth = await validatePAIchartToken(context.token);
  if (!auth.valid) {
    return {
      content: [{ type: 'text', text: `Invalid token: ${auth.error}` }],
      isError: true
    };
  }

  // Now you have verified user identity!
  console.log(`Request from ${auth.email} (${auth.role})`);

  // Implement your business logic
  const results = await yourBusinessLogic(args, auth);
  return { content: [{ type: 'text', text: JSON.stringify(results) }] };
});
```

**✅ Done!** Your service now validates pAIchart tokens securely.

---

## Section B: What is JWKS?

### JWKS Explained

**JWKS** = JSON Web Key Set

**Purpose**: Distribute public keys for JWT validation

**How it works**:
```
Your Service                    pAIchart Hub
     │                                │
     │  1. GET /api/auth/jwks        │
     ├───────────────────────────────>│
     │                                │
     │  2. Public key JSON            │
     │<───────────────────────────────┤
     │                                │
     │  3. Verify JWT signature       │
     │     using public key           │
     │                                │
     ✅ Token valid!                  │
```

**Benefits**:
- ✅ **No shared secrets** - public key can't sign new tokens
- ✅ **Automatic rotation** - JWKS endpoint updates during key rotation
- ✅ **Industry standard** - OAuth 2.0, OpenID Connect
- ✅ **Secure** - private key never leaves pAIchart infrastructure

---

### JWKS Endpoint Details

**URL**: `GET https://paichart.app/api/auth/jwks`

**Response**:
```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "paichart-2026-01",
      "use": "sig",
      "alg": "RS256",
      "n": "xGOz...",  // Public key modulus
      "e": "AQAB"     // Public key exponent
    }
  ]
}
```

**Cache headers**:
- `Cache-Control: public, max-age=86400` (24 hours)
- `Expires`: 24 hours from request

**Security features**:
- Rate limited (100 requests/minute per IP)
- Filters expired keys automatically
- Multi-key support (during rotation)
- Empty array prevention

**Validation time**: ~34ms (including network fetch)

---

### RS256 vs HS256

**RS256** (Asymmetric - used by pAIchart):
- ✅ Public key validates, private key signs
- ✅ No shared secrets
- ✅ External services can validate but not mint tokens
- ✅ Industry standard for distributed systems

**HS256** (Symmetric - deprecated for external use):
- ❌ Same secret signs and validates
- ❌ Sharing secret enables token minting
- ❌ Security risk if leaked
- ⚠️ Only used for legacy API keys (sunset Jul 5, 2026)

**Why RS256**: External services shouldn't be able to mint new tokens (only validate existing ones).

---

## Section C: Component 5 - Audience-Based Isolation

### What is Component 5?

**Component 5** = Resource-specific token audiences (RFC 8707)

**Security boundary**: Tokens are scoped to specific resources to prevent reuse attacks.

**Audiences**:

| Audience | Purpose | Algorithm | Status |
|----------|---------|-----------|--------|
| `https://paichart.app/api` | Web/API operations | RS256 | ✅ Active |
| `https://paichart.app/mcp` | MCP operations | RS256 + HS256 | ✅ Active |
| `paichart-api` | Legacy Web tokens | RS256 | ⚠️ Deprecated (sunset Jul 5, 2026) |
| `paichart-app` | Legacy API keys | HS256 | ⚠️ Deprecated (sunset Jul 5, 2026) |

---

### Attack Scenario Prevented

**Before Component 5** (no audience validation):
```
1. Attacker steals MCP token from external service
2. Reuses token to access Web/API endpoints
3. Gains unauthorized access to user data
```

**After Component 5** (audience-based isolation):
```
1. Attacker steals MCP token (aud: https://paichart.app/mcp)
2. Attempts to access Web/API endpoint (requires aud: https://paichart.app/api)
3. Token rejected: Audience mismatch ✅
```

---

### How to Validate (Component 5)

**Accept BOTH audiences** (web + MCP tokens may call your service):

```typescript
await jwtVerify(token, JWKS, {
  issuer: 'https://paichart.app',
  audience: ['https://paichart.app/api', 'https://paichart.app/mcp']  // Accept both!
});
```

**Why accept both**:
- MCP clients (ChatGPT, Claude Desktop) use `/mcp` audience
- Web UI workflows use `/api` audience
- Your service should work with both

**Security**: Token isolation prevents cross-resource reuse (MCP token can't access Web APIs, vice versa)

---

### RFC Compliance

**Component 5 implements**:
- ✅ **RFC 8707**: Resource Indicators for OAuth 2.0
- ✅ **RFC 9068**: JWT Profile for OAuth 2.0 (audience-restricted tokens)
- ✅ **OIDC Core 1.0**: Proper audience claim validation

**Validation Status**: ✅ Deployed Jan 30, 2026 (34ms JWKS validation, 100% success)

---

## Section D: Implementation Examples

### Complete Service Example (TypeScript)

```typescript
// src/index.ts - Complete authenticated MCP service
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import express from 'express';

const app = express();
app.use(express.json());

// pAIchart JWKS for token validation
const PAICHART_JWKS = createRemoteJWKSet(
  new URL('https://paichart.app/api/auth/jwks')
);

// Validate pAIchart JWT
async function validateToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, PAICHART_JWKS, {
      issuer: 'https://paichart.app',
      audience: ['https://paichart.app/api', 'https://paichart.app/mcp']
    });
    return { valid: true, ...payload };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// MCP Server
const mcpServer = new Server(
  { name: 'my-analytics-service', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List tools
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'analyze_data',
    description: 'Analyze project data (requires authentication)',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' }
      },
      required: ['projectId']
    }
  }]
}));

// Tool handler with authentication
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const context = args._context;

  // Step 1: Check for token
  if (!context?.token) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: 'Authentication required',
        hint: 'This service requires OWNER or TEAM_MEMBER trust level',
        trustLevel: context?.trustLevel || 'UNKNOWN'
      })}],
      isError: true
    };
  }

  // Step 2: Validate the token
  const auth = await validateToken(context.token);
  if (!auth.valid) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: 'Invalid token',
        details: auth.error
      })}],
      isError: true
    };
  }

  // Step 3: Log authenticated request
  console.log(`[Auth] ${auth.email} (${auth.role}) called ${name}`);

  // Step 4: Implement business logic
  if (name === 'analyze_data') {
    const results = await yourAnalysisFunction(args.projectId, {
      userId: auth.sub,
      tenantId: context.tenantId,
      requestedBy: auth.email
    });

    return {
      content: [{ type: 'text', text: JSON.stringify({
        success: true,
        analyzedBy: auth.email,
        results
      })}]
    };
  }
});

// SSE endpoint
const transports = new Map();
app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/message', res);
  transports.set(transport.sessionId, transport);
  req.on('close', () => transports.delete(transport.sessionId));
  await mcpServer.connect(transport);
  await new Promise(resolve => req.on('close', resolve));
});

app.post('/message', async (req, res) => {
  const transport = transports.get(req.query.sessionId) || [...transports.values()][0];
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

app.get('/health', (_, res) => res.json({ status: 'healthy' }));

app.listen(3200, () => console.log('Service running on port 3200'));
```

---

### Streamable HTTP Version

**For serverless/external deployments** (recommended):

```typescript
// Streamable HTTP endpoint (single POST endpoint)
app.post('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string || 'default-session';
    res.setHeader('Mcp-Session-Id', sessionId);

    // Process MCP JSON-RPC request
    const response = await mcpServer.handleRequest(req.body);
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal error' },
      id: req.body?.id || null
    });
  }
});
```

**Register with**:
```javascript
registry(action: "register", {
  endpoint: "https://your-service.com/mcp"  // Streamable HTTP
})
```

---

### Python Example (Flask)

```python
from flask import Flask, request, jsonify
import jwt
import requests

app = Flask(__name__)

# Fetch JWKS
def get_jwks():
    return requests.get('https://paichart.app/api/auth/jwks').json()

# Validate pAIchart token
def validate_token(token: str):
    try:
        jwks = get_jwks()
        header = jwt.get_unverified_header(token)
        kid = header['kid']

        # Find matching key
        key = next((k for k in jwks['keys'] if k['kid'] == kid), None)
        if not key:
            return {'valid': False, 'error': 'Key not found'}

        # Verify token
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
        payload = jwt.decode(
            token,
            public_key,
            algorithms=['RS256'],
            issuer='https://paichart.app',
            audience=['https://paichart.app/api', 'https://paichart.app/mcp']
        )

        return {
            'valid': True,
            'userId': payload['sub'],
            'email': payload['email'],
            'role': payload['role']
        }
    except Exception as e:
        return {'valid': False, 'error': str(e)}

@app.route('/health')
def health():
    return jsonify({'status': 'healthy'})

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json
    context = data.get('_context', {})

    # Validate token
    if not context.get('token'):
        return jsonify({'error': 'Authentication required'}), 401

    auth = validate_token(context['token'])
    if not auth['valid']:
        return jsonify({'error': f"Invalid token: {auth['error']}"}), 401

    # Your business logic here
    results = perform_analysis(data, auth)
    return jsonify({'success': True, 'results': results})

if __name__ == '__main__':
    app.run(port=3200)
```

---

## Section E: What Your Service Receives

### _context Object

**Every Hub call includes** `_context` in tool arguments:

```typescript
{
  name: "analyze_project",
  arguments: {
    projectId: "proj-123",  // User's arguments

    // Automatically added by Hub
    _context: {
      userId: "clm8xyz123",        // pAIchart user ID (CUID)
      userEmail: "alice@acme.com", // User's email
      userRole: "ADMIN",           // USER, DEMO_USER, ADMIN, SUPER_ADMIN
      token: "eyJhbGci...",        // JWT (RS256) - if trust level allows
      povId: "clpov789",           // POV context (if POV-scoped)
      tenantId: "clpov789",        // Tenant ID (currently = povId)
      requestId: "uuid-v4",        // Request trace ID
      source: "mcp_hub_workflow",  // Origin identifier
      trustLevel: "TEAM_MEMBER"    // Trust level (helps debugging)
    }
  }
}
```

---

### When You Receive Tokens

**Trust levels that receive tokens**:
- ✅ **INTERNAL** - pAIchart-* services (always get tokens)
- ✅ **TRUSTED** - Localhost Docker services
- ✅ **OWNER** - User calls their own registered service
- ✅ **TEAM_MEMBER** - Service owner is in POV team

**Trust levels that DON'T receive tokens**:
- ❌ **SCOPED** - Public service with POV context (only povId)
- ❌ **ANONYMOUS** - Public service, no POV (only userId)

**Check trustLevel field** to understand why you did/didn't receive a token.

**See full guide**: [G] **trust_levels** prompt

---

### JWT Token Claims

**Standard claims** (in every token):

```typescript
{
  // User identity
  sub: "clm8xyz123",           // User ID (subject)
  userId: "clm8xyz123",        // Duplicate for convenience
  email: "alice@acme.com",     // User email
  role: "ADMIN",               // Platform role

  // Security
  iss: "https://paichart.app",           // Issuer (who minted token)
  aud: "https://paichart.app/mcp",       // Audience (which resource)

  // Timing
  iat: 1737008745,             // Issued at (Unix timestamp)
  exp: 1737012345,             // Expires at (Unix timestamp)

  // Key rotation
  kid: "paichart-2026-01"      // Key ID (in header, not payload)
}
```

**Use in your service**:
```typescript
const auth = await validateToken(context.token);

// User identity
console.log(`User: ${auth.email}`);
console.log(`Role: ${auth.role}`);

// Tenant context (from _context, not token)
console.log(`Tenant: ${context.tenantId}`);
console.log(`POV: ${context.povId}`);
```

---

## Section F: First-Party Token Minting (Security Critical)

### Why pAIchart Mints Its Own Tokens

**The Problem**: OAuth Passthrough Attack

**Vulnerable pattern**:
```javascript
// ❌ CRITICAL SECURITY HOLE
// User authenticates via GitHub OAuth
const githubToken = await exchangeCodeForToken(code);

// WRONG: Return GitHub's token directly
res.json({ access_token: githubToken.access_token });
```

**Attack scenario**:
1. User authenticates via GitHub
2. Malicious external service receives GitHub token
3. Service uses token on GitHub API
4. Result: **Private repos cloned, malicious code pushed**

**Security Impact**: 0/10 (GitHub account compromise)

---

**Secure pattern** (pAIchart implementation):
```javascript
// ✅ SECURE (First-party minting)
const githubUser = await authenticateWithGitHub(code);

// Mint OUR token (RS256 with pAIchart identity)
const mcpToken = mintToken({
  userId: user.id,
  email: user.email,
  role: user.role,
  audience: 'https://paichart.app/mcp'  // OUR resource
});

// Return OUR token (not GitHub's!)
res.json({ access_token: mcpToken });
```

**Security Impact**: 95/100 (pAIchart-scoped, revocable, JWKS-validatable)

---

### Security Benefits

✅ **External services never receive OAuth provider tokens**
✅ **Token scope limited to pAIchart operations only**
✅ **No GitHub/Microsoft/Google account access possible**
✅ **First-party control over all token capabilities**

**Pattern**: See `.claude/knowledge/patterns/oauth-token-minting-not-passthrough.md` (Pattern #29)

---

## Section G: token-validator Service (Test Your Integration)

### What is token-validator?

**Purpose**: Test and verify your JWKS integration works correctly.

**Service**: `test-auth-service` or `token-validator-service` (port 3105)

**What it does**:
1. Receives your service call with `_context`
2. Shows your trust level
3. Validates token via JWKS (11-step verification)
4. Returns step-by-step validation results
5. Provides copy-paste code examples

---

### How to Test

**Basic test**:
```javascript
services(action: "workflow.execute", {
  steps: [{
    service: "test-auth-service",
    tool: "verify_auth",
    arguments: {}
  }]
})
```

**Response**:
```json
{
  "trustLevel": "OWNER",
  "tokenReceived": true,
  "validation": {
    "step1": "✅ Token extracted from _context",
    "step2": "✅ JWKS fetched (34ms)",
    "step3": "✅ Public key found (kid: paichart-2026-01)",
    "step4": "✅ Signature valid (RS256)",
    "step5": "✅ Issuer valid (https://paichart.app)",
    "step6": "✅ Audience valid (https://paichart.app/mcp)",
    "step7": "✅ Token not expired",
    "step8": "✅ Claims extracted"
  },
  "claims": {
    "sub": "user456",
    "email": "alice@company.com",
    "role": "ADMIN",
    "aud": "https://paichart.app/mcp",
    "iss": "https://paichart.app"
  },
  "codeExamples": {
    "typescript": "...",  // Copy-paste ready
    "javascript": "...",
    "python": "..."
  }
}
```

**Validation time**: ~34ms (JWKS fetch + RS256 verification)

---

### Interpreting Results

**If tokenReceived: false**:
```json
{
  "trustLevel": "SCOPED",
  "tokenReceived": false,
  "explanation": "Service owner not in POV team",
  "howToImprove": "Join a POV team owned by the service owner to receive tokens"
}
```

**Solutions**:
- Register your own service → OWNER trust
- Join POV team → TEAM_MEMBER trust
- Make service work without tokens → Use userId/email only

---

## Section H: Common Validation Errors

### Error: "Invalid signature"

**Cause**: Token signature doesn't match JWKS public key

**Common reasons**:
1. Wrong JWKS endpoint (using old URL)
2. Using HS256 validation instead of RS256
3. Token expired or corrupted

**Solution**:
```typescript
// Ensure you're using RS256 JWKS validation
const JWKS = createRemoteJWKSet(new URL('https://paichart.app/api/auth/jwks'));
await jwtVerify(token, JWKS, { algorithms: ['RS256'] });  // Specify RS256
```

---

### Error: "Unexpected audience"

**Cause**: Token audience doesn't match expected values

**Solution**: Accept BOTH audiences
```typescript
// ❌ WRONG - only accepts one audience
await jwtVerify(token, JWKS, {
  audience: 'https://paichart.app/mcp'  // Rejects /api tokens!
});

// ✅ CORRECT - accepts both
await jwtVerify(token, JWKS, {
  audience: ['https://paichart.app/api', 'https://paichart.app/mcp']
});
```

---

### Error: "Invalid issuer"

**Cause**: Token issuer doesn't match expected value

**Solution**: Use correct issuer URL
```typescript
await jwtVerify(token, JWKS, {
  issuer: 'https://paichart.app'  // Exact match required
});
```

---

### Error: "Token expired"

**Cause**: Token's `exp` claim is in the past

**Solution**: This is normal - pAIchart tokens have limited lifetime
- Access tokens: 15 minutes
- Refresh tokens: 7 days
- Hub automatically refreshes during workflows

**Handling**:
```typescript
// jose library throws automatically
try {
  await jwtVerify(token, JWKS);
} catch (error) {
  if (error.code === 'ERR_JWT_EXPIRED') {
    return { valid: false, error: 'Token expired - user should re-authenticate' };
  }
}
```

---

### Error: "Public key not found"

**Cause**: Token's `kid` doesn't match any key in JWKS

**Reasons**:
1. Using old token after key rotation
2. JWKS cache is stale
3. Wrong JWKS endpoint

**Solution**:
```typescript
// Check token header
const header = jwt.decode(token, { complete: true }).header;
console.log('Token kid:', header.kid);  // e.g., "paichart-2026-01"

// Fetch fresh JWKS
const jwks = await fetch('https://paichart.app/api/auth/jwks').then(r => r.json());
console.log('Available kids:', jwks.keys.map(k => k.kid));

// Should match! If not, token is from different issuer or very old
```

---

## 🚀 Best Practices

### Security

1. ✅ **Always validate tokens** - Never trust `_context` without verification
2. ✅ **Accept both audiences** - `/api` and `/mcp` tokens may call your service
3. ✅ **Verify issuer** - Ensure token is from `https://paichart.app`
4. ✅ **Handle missing tokens** - Not all trust levels receive tokens (SCOPED, ANONYMOUS)
5. ✅ **Never forward tokens** - Use your service's credentials for downstream calls
6. ✅ **Log authentication events** - Audit who accessed what

---

### Performance

1. ✅ **Cache JWKS** - `createRemoteJWKSet` caches automatically (24-hour TTL)
2. ✅ **Validate once per request** - Don't re-validate same token multiple times
3. ✅ **Use async validation** - Don't block request handling

---

### Development

1. ✅ **Test with token-validator** - Verify integration before deploying
2. ✅ **Start private** - Test with OWNER trust first
3. ✅ **Handle errors gracefully** - Return helpful error messages
4. ✅ **Use TypeScript** - Type safety for token claims

---

## 📚 Related Documentation

**Deep Dive Prompts**:
- [G] **trust_levels** - 6-tier trust system (when you receive tokens)
- [F] **security_policy** - Multi-layer security, compliance
- [H] **architecture** - How token passing works internally

**Quick Start**:
- [A] **get_started** - Role-based tutorials (Path A: Developer)
- [D] **register_guide** - Register your service first

**Workflows**:
- [I] **workflow_guide** - Use your authenticated service in workflows

---

## 💬 Support

**Authentication Questions**: steve.terry@paichart.com
**JWKS Endpoint**: https://paichart.app/api/auth/jwks
**Documentation**: https://paichart.app/docs

---

## 📖 Quick Reference

### JWKS Endpoint

```
GET https://paichart.app/api/auth/jwks
```

**Returns**:
```json
{
  "keys": [{
    "kty": "RSA",
    "kid": "paichart-2026-01",
    "use": "sig",
    "alg": "RS256",
    "n": "...",  // Public key
    "e": "AQAB"
  }]
}
```

### Validation Code (TypeScript)

```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://paichart.app/api/auth/jwks'));

async function validate(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: 'https://paichart.app',
    audience: ['https://paichart.app/api', 'https://paichart.app/mcp']
  });
  return payload;
}
```

### Component 5 (Audience Isolation)

**Accept both audiences**:
```typescript
audience: ['https://paichart.app/api', 'https://paichart.app/mcp']
```

**Why**: Web UI and MCP clients use different audiences. Your service should work with both.

### Token Claims

```typescript
{
  sub: "user-id",              // User ID
  email: "user@company.com",   // Email
  role: "ADMIN",               // Role
  iss: "https://paichart.app", // Issuer
  aud: "https://paichart.app/mcp",  // Audience
  exp: 1737012345,             // Expiration
  iat: 1737008745              // Issued at
}
```

### Trust Levels (Who Gets Tokens)

| Level | Token? | Requirement |
|-------|--------|-------------|
| INTERNAL | ✅ Yes | pAIchart-* service |
| TRUSTED | ✅ Yes | Localhost Docker |
| OWNER | ✅ Yes | You own the service |
| TEAM_MEMBER | ✅ Yes | Caller in POV team (POV owned by service owner) |
| SCOPED | ❌ No | Public + POV context |
| ANONYMOUS | ❌ No | Public, no POV |

### Testing

```javascript
// Test your integration
services(action: "workflow.execute", {
  steps: [{ service: "test-auth-service", tool: "verify_auth" }]
})

// Returns: Trust level, validation steps, code examples
```

---

**Version**: 1.0 | **Created**: 2026-02-02 | **Status**: Production-Ready
**Validation**: 34ms JWKS validation, 100% success | **Security**: 95/100
**RFC Compliance**: RFC 8707 (Resource Indicators), RFC 9068 (JWT Profile)
