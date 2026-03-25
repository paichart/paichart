/**
 * pAIchart MCP Hub Connector
 *
 * Lightweight proxy that forwards MCP requests to the hosted pAIchart platform.
 * Designed for containerized deployments (Glama, Docker) that need a local endpoint.
 *
 * The actual MCP Hub runs at https://paichart.app/mcp with full OAuth,
 * service discovery, workflow orchestration, and per-user authentication.
 */

const express = require('express');
const app = express();

const PAICHART_URL = process.env.PAICHART_MCP_URL || 'https://paichart.app/mcp';
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', upstream: PAICHART_URL });
});

// Proxy all MCP requests to the hosted platform
app.all('/mcp', async (req, res) => {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Forward authorization header if present
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    const response = await fetch(PAICHART_URL, {
      method: req.method,
      headers,
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.text();
    res.status(response.status).set('Content-Type', response.headers.get('content-type') || 'application/json').send(data);
  } catch (error) {
    res.status(502).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Upstream connection failed', data: { upstream: PAICHART_URL } },
      id: null
    });
  }
});

// OAuth discovery (point clients to the hosted platform)
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: 'https://paichart.app',
    authorization_endpoint: 'https://paichart.app/oauth/authorize',
    token_endpoint: 'https://paichart.app/oauth/token',
    registration_endpoint: 'https://paichart.app/oauth/register',
    jwks_uri: 'https://paichart.app/api/auth/jwks',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
    code_challenge_methods_supported: ['S256']
  });
});

app.listen(PORT, () => {
  console.log(`pAIchart MCP Hub Connector running on port ${PORT}`);
  console.log(`Proxying to: ${PAICHART_URL}`);
});
