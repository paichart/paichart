import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'OAuth 2.0 Documentation',
  description: 'OAuth 2.0 authentication documentation for pAIchart MCP Server',
};

export default function OAuthDocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-8">OAuth 2.0 Authentication</h1>

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p className="text-muted-foreground mb-6">
            Documentation for integrating with pAIchart&apos;s OAuth 2.0 authentication system
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Overview</h2>
            <p>
              pAIchart uses OAuth 2.0 with PKCE (Proof Key for Code Exchange) for secure authentication.
              We support multiple OAuth providers including GitHub, Microsoft, and Google.
            </p>
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mt-4">
              <p className="text-sm">
                <strong>Important:</strong> All AI clients (ChatGPT, Claude Desktop, Claude.ai) connect to the
                same HTTPS endpoint. OAuth authentication is handled automatically by the client platform.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">MCP Server Endpoint</h2>
            <p className="mb-3">
              All clients connect to the same HTTPS endpoint:
            </p>
            <div className="bg-muted p-4 rounded-lg mb-4">
              <code className="text-sm">
                POST https://paichart.app/mcp
              </code>
            </div>
            <p className="mb-3">
              <strong>Protocol</strong>: JSON-RPC 2.0 over HTTPS
            </p>
            <p className="mb-3">
              <strong>Authentication</strong>: OAuth 2.0 with PKCE (handled automatically by client)
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Discovery Endpoint</h2>
            <p className="mb-3">
              OAuth metadata is available at the standard discovery endpoint (RFC 8414):
            </p>
            <div className="bg-muted p-4 rounded-lg mb-4">
              <code className="text-sm">
                GET https://paichart.app/.well-known/oauth-authorization-server
              </code>
            </div>
            <p>
              This endpoint provides all necessary information about supported OAuth flows, scopes,
              endpoints, and capabilities.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Supported Providers</h2>

            <div className="space-y-4">
              <div className="border border-border rounded-lg p-4">
                <h3 className="text-xl font-semibold mb-2">GitHub</h3>
                <p className="mb-2">Recommended for developers and technical users.</p>
                <ul className="list-disc pl-6 mb-2">
                  <li><strong>Authorization URL</strong>: https://github.com/login/oauth/authorize</li>
                  <li><strong>Token URL</strong>: https://github.com/login/oauth/access_token</li>
                  <li><strong>Scopes</strong>: read:user, read:org</li>
                </ul>
              </div>

              <div className="border border-border rounded-lg p-4">
                <h3 className="text-xl font-semibold mb-2">Microsoft</h3>
                <p className="mb-2">For enterprise users with Microsoft/Azure accounts.</p>
                <ul className="list-disc pl-6 mb-2">
                  <li><strong>Authorization URL</strong>: https://login.microsoftonline.com/common/oauth2/v2.0/authorize</li>
                  <li><strong>Token URL</strong>: https://login.microsoftonline.com/common/oauth2/v2.0/token</li>
                  <li><strong>Scopes</strong>: openid, email, profile, User.Read</li>
                </ul>
              </div>

              <div className="border border-border rounded-lg p-4">
                <h3 className="text-xl font-semibold mb-2">Google</h3>
                <p className="mb-2">For users with Google/Gmail accounts.</p>
                <ul className="list-disc pl-6 mb-2">
                  <li><strong>Authorization URL</strong>: https://accounts.google.com/o/oauth2/v2/auth</li>
                  <li><strong>Token URL</strong>: https://oauth2.googleapis.com/token</li>
                  <li><strong>Scopes</strong>: openid, email, profile</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">OAuth Endpoints</h2>

            <div className="space-y-3">
              <div>
                <h3 className="text-lg font-semibold">Authorization Endpoint</h3>
                <code className="text-sm bg-muted px-2 py-1 rounded">
                  GET https://paichart.app/oauth/authorize
                </code>
                <p className="text-sm text-muted-foreground mt-1">
                  Redirects users to their chosen OAuth provider for authentication
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold">Token Endpoint</h3>
                <code className="text-sm bg-muted px-2 py-1 rounded">
                  POST https://paichart.app/oauth/token
                </code>
                <p className="text-sm text-muted-foreground mt-1">
                  Exchanges authorization code for access token
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold">Client Registration</h3>
                <code className="text-sm bg-muted px-2 py-1 rounded">
                  POST https://paichart.app/oauth/register
                </code>
                <p className="text-sm text-muted-foreground mt-1">
                  Dynamic client registration (optional)
                </p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">PKCE Flow</h2>
            <p className="mb-3">
              We use PKCE (Proof Key for Code Exchange) for enhanced security:
            </p>

            <ol className="list-decimal pl-6 space-y-3 mb-4">
              <li>
                <strong>Client generates code verifier</strong>
                <p className="text-sm text-muted-foreground">
                  Random 43-128 character string
                </p>
              </li>
              <li>
                <strong>Client creates code challenge</strong>
                <p className="text-sm text-muted-foreground">
                  SHA-256 hash of verifier (method: S256) or plain text
                </p>
              </li>
              <li>
                <strong>Authorization request includes challenge</strong>
                <p className="text-sm text-muted-foreground">
                  Sent with authorization request to prevent interception
                </p>
              </li>
              <li>
                <strong>Token exchange requires verifier</strong>
                <p className="text-sm text-muted-foreground">
                  Original verifier must match the challenge
                </p>
              </li>
            </ol>

            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm">
                <strong>Why PKCE?</strong> PKCE prevents authorization code interception attacks,
                making OAuth secure even for public clients like mobile apps and single-page applications.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Integration Examples</h2>

            <h3 className="text-xl font-semibold mb-3">ChatGPT Integration</h3>
            <p className="mb-3">Configure in ChatGPT&apos;s GPT builder or Action configuration:</p>
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto mb-2">
              <code className="text-sm">{`{
  "tools": [
    {
      "type": "mcp",
      "server_label": "pAIchart",
      "server_url": "https://paichart.app/mcp",
      "require_approval": "never"
    }
  ]
}`}</code>
            </pre>
            <p className="text-sm text-muted-foreground mb-4">
              <strong>Note:</strong> ChatGPT handles OAuth authentication automatically when you add this MCP server.
            </p>

            <h3 className="text-xl font-semibold mb-3">Claude Desktop Integration</h3>
            <p className="mb-3">Add to your Claude Desktop configuration file:</p>
            <ul className="list-disc pl-6 mb-3 text-sm">
              <li><strong>macOS/Linux:</strong> <code>~/.config/Claude/claude_desktop_config.json</code></li>
              <li><strong>Windows:</strong> <code>%APPDATA%\Claude\claude_desktop_config.json</code></li>
            </ul>
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto mb-2">
              <code className="text-sm">{`{
  "mcpServers": {
    "paichart": {
      "url": "https://paichart.app/mcp",
      "transport": {
        "type": "http"
      }
    }
  }
}`}</code>
            </pre>
            <p className="text-sm text-muted-foreground mb-4">
              <strong>Note:</strong> OAuth authentication will be prompted on first connection.
            </p>

            <h3 className="text-xl font-semibold mb-3">Claude.ai Browser Integration</h3>
            <p className="mb-3">OAuth is handled automatically when you:</p>
            <ol className="list-decimal pl-6 space-y-2 mb-4">
              <li>Visit <a href="https://paichart.app" className="text-primary hover:underline">https://paichart.app</a></li>
              <li>Click &quot;Connect to Claude&quot;</li>
              <li>Authorize the connection</li>
              <li>The MCP server will be available in your Claude.ai session</li>
            </ol>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Security Best Practices</h2>

            <ul className="list-disc pl-6 space-y-2">
              <li>Always use HTTPS for all OAuth communication</li>
              <li>Use PKCE (S256 method preferred) for all authorization flows</li>
              <li>Validate state parameter to prevent CSRF attacks</li>
              <li>Store tokens securely (encrypted at rest)</li>
              <li>Never expose client secrets in client-side code</li>
              <li>Use short-lived access tokens with refresh tokens</li>
              <li>Implement proper token revocation</li>
              <li>Validate redirect URIs strictly</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Troubleshooting</h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Invalid Redirect URI</h3>
                <p className="text-sm text-muted-foreground">
                  Ensure your redirect URI exactly matches the one registered with the OAuth provider.
                  URIs are case-sensitive and must include protocol, domain, and path.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold">Code Verifier Mismatch</h3>
                <p className="text-sm text-muted-foreground">
                  The code verifier sent during token exchange must match the challenge sent during
                  authorization. Store the verifier securely between requests.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold">Token Expired</h3>
                <p className="text-sm text-muted-foreground">
                  Access tokens expire after a set period. Use refresh tokens to obtain new access
                  tokens without requiring user re-authentication.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Related Documentation</h2>

            <ul className="list-none space-y-2">
              <li>
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                {' '}- How we handle your data
              </li>
              <li>
                <Link href="/terms" className="text-primary hover:underline">
                  Terms of Service
                </Link>
                {' '}- Service agreement and usage terms
              </li>
              <li>
                <a
                  href="https://datatracker.ietf.org/doc/html/rfc6749"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  OAuth 2.0 Specification (RFC 6749)
                </a>
                {' '}- Official OAuth 2.0 standard
              </li>
              <li>
                <a
                  href="https://datatracker.ietf.org/doc/html/rfc7636"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  PKCE Specification (RFC 7636)
                </a>
                {' '}- PKCE extension for OAuth
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Support</h2>
            <p className="mb-3">
              Need help with OAuth integration?
            </p>
            <ul className="list-none">
              <li>Email: <a href="mailto:oauth@paichart.app" className="text-primary hover:underline">oauth@paichart.app</a></li>
              <li>Technical Support: <a href="mailto:support@paichart.app" className="text-primary hover:underline">support@paichart.app</a></li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
