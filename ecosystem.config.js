// PM2 Ecosystem Configuration for pAIchart Production Deployment
// Production server: <PROD_HOST> (paichart.app)
// Updated: 2025-09-04 - Simplified configuration for actual usage patterns
// MCP server handles all user traffic, web server for admin only

// Load environment variables BEFORE config export to ensure secrets are available
const path = require('path');
const dotenv = require('dotenv');

// Determine which environment file to load
const envFile = process.env.NODE_ENV === 'production'
  ? '.env.production'
  : '.env';

// Load environment variables first - this ensures PM2 has access to secrets
dotenv.config({ path: path.resolve(__dirname, envFile) });

console.log('[PM2 Config] Loading environment from:', envFile);
console.log('[PM2 Config] OAuth configured:', !!process.env.GITHUB_CLIENT_ID ? 'YES' : 'NO');

module.exports = {
  apps: [
    {
      name: 'paichart-mcp',
      script: './mcp-server-http-clean.js',  // ✅ Battle-tested: Single backend, prompt-preserving
      cwd: '/var/www/paichart-app/current',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: process.env.DATABASE_URL,  // Required for event system PostgreSQL connection

        // Pipeline-harness guards (R9 untrusted-output sanitize + R10 artifact-secret redact). Built +
        // tested, shipped default-OFF; enabled 2026-06-29 for the terraform-iac validation rig and as the
        // intended production posture. Values come from .env.production via dotenv (top of this file).
        CONNECTED_OUTPUT_SANITIZE_ENABLED: process.env.CONNECTED_OUTPUT_SANITIZE_ENABLED,
        ARTIFACT_SECRET_REDACT_ENABLED: process.env.ARTIFACT_SECRET_REDACT_ENABLED,

        // LLM API Keys
        // ANTHROPIC_API_KEY intentionally NOT injected (task #85, 2026-04-16).
        // Triggering-user-only auth model: every request resolves its apiKey
        // from per-user UserSettings. Removing env injection ensures no
        // silent fallback — if the triggering user has no configured key,
        // execution fails loud at engine pre-flight instead of billing
        // whoever's key happened to be in the environment.
        // GEMINI_API_KEY dropped 2026-08-05 with the Gemini LLM provider.
        // OLLAMA_API_URL kept — that path was not part of the removal.
        OLLAMA_API_URL: process.env.OLLAMA_API_URL,

        MCP_HTTP_PORT: 8080,
        MCP_HTTP_AUTH_REQUIRED: 'false',  // Enable dual-privilege mode for Claude Desktop connections
        MCP_HTTP_BIND_ALL: 'false',  // Security: localhost only
        MCP_HTTP_CORS_ORIGIN: 'https://paichart.app,https://claude.ai',
        MCP_FEATURE_VERBOSELOGGING: 'false',
        MCP_LOG_LEVEL: 'info',
        OAUTH_LOG_LEVEL: 'info',  // NEW: OAuth audit logging verbosity

        // OAuth Configuration (rationalized — single org GitHub App for all MCP clients)
        GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,  // Web login only
        GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
        MCP_CLI_GITHUB_CLIENT_ID: process.env.MCP_CLI_GITHUB_CLIENT_ID,  // Org app for all MCP OAuth
        MCP_CLI_GITHUB_CLIENT_SECRET: process.env.MCP_CLI_GITHUB_CLIENT_SECRET,
        MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,  // ChatGPT Microsoft OAuth
        MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,

        // SMTP Configuration for trial emails (matching Thunderbird settings)
        BREVO_API_KEY: process.env.BREVO_API_KEY,
        BREVO_FROM_EMAIL: 'support@paichart.com',
        BREVO_FROM_NAME: 'pAIchart Support',

        // Rate limiting: trust CF-Connecting-IP / x-forwarded-for from nginx so each
        // user gets their own bucket. Without this, all CF-fronted traffic shares
        // the 'direct' identifier and per-IP rate limits collapse to a single bucket.
        // Paired with /etc/nginx/conf.d/cloudflare-realip.conf which rewrites
        // $remote_addr from CF-Connecting-IP. 2026-05-24 P1.1 (SaaS-readiness audit).
        TRUSTED_PROXY: 'true'
      },
      instances: 1,  // Optimal for MCP session management
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      max_restarts: 10,
      restart_delay: 2000,
      error_file: '/var/log/paichart/mcp-error.log',
      out_file: '/var/log/paichart/mcp-out.log', 
      log_file: '/var/log/paichart/mcp-combined.log',
      time: true,
      
      // Health monitoring
      min_uptime: '10s',
      listen_timeout: 8000,
      kill_timeout: 5000
    },
    {
      name: 'paichart-web',
      script: './server.js',  // ✅ Matches "npm run start" production command
      cwd: '/var/www/paichart-app/current',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: process.env.DATABASE_URL,  // Required for Prisma and event systems

        // Pipeline-harness guards (R9/R10) — see the paichart-mcp block above for rationale.
        CONNECTED_OUTPUT_SANITIZE_ENABLED: process.env.CONNECTED_OUTPUT_SANITIZE_ENABLED,
        ARTIFACT_SECRET_REDACT_ENABLED: process.env.ARTIFACT_SECRET_REDACT_ENABLED,
        PORT: 3000,
        HOST: 'localhost',  // Security: localhost only, nginx proxy handles external

        // JWT Authentication (ACCESS_SECRET retired 2026-06-05, REFRESH_SECRET 2026-08-07 — RS256-only auth; refresh tokens are DB rows)
        JWT_ACCESS_EXPIRATION: process.env.JWT_ACCESS_EXPIRATION || '15',
        JWT_REFRESH_EXPIRATION: process.env.JWT_REFRESH_EXPIRATION || '7',

        // OAuth Configuration (rationalized — single org GitHub App for all MCP clients)
        GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,  // Web login only
        GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
        MCP_CLI_GITHUB_CLIENT_ID: process.env.MCP_CLI_GITHUB_CLIENT_ID,  // Org app for all MCP OAuth
        MCP_CLI_GITHUB_CLIENT_SECRET: process.env.MCP_CLI_GITHUB_CLIENT_SECRET,
        MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,  // ChatGPT Microsoft OAuth
        MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        OAUTH_STATE_SECRET: process.env.OAUTH_STATE_SECRET || 'production-oauth-state-secret-32char-minimum',
        OAUTH_SESSION_TIMEOUT: '900',
        OAUTH_PKCE_ENABLED: 'true',
        OAUTH_LOG_LEVEL: 'info',  // NEW: OAuth audit logging verbosity
        APP_BASE_URL: 'https://paichart.app',

        // SMTP Configuration for password reset emails (matching Thunderbird settings)
        BREVO_API_KEY: process.env.BREVO_API_KEY,
        BREVO_FROM_EMAIL: 'support@paichart.com',
        BREVO_FROM_NAME: 'pAIchart Support',
        SMTP_HOST: process.env.SMTP_HOST,
        SMTP_PORT: process.env.SMTP_PORT,
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASS: process.env.SMTP_PASS,
        SMTP_FROM: process.env.SMTP_FROM,
        SMTP_SECURE: process.env.SMTP_SECURE,

        // Rate limiting: trust x-forwarded-for from nginx so each user gets their own bucket
        // Without this, all users share the 'direct' identifier in enhanced rate limiters
        TRUSTED_PROXY: 'true'
      },
      instances: 1,  // Single instance for admin use only
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      max_restarts: 10,
      restart_delay: 2000,
      error_file: '/var/log/paichart/web-error.log',
      out_file: '/var/log/paichart/web-out.log',
      log_file: '/var/log/paichart/web-combined.log', 
      time: true,
      
      // Health check settings
      min_uptime: '10s',
      listen_timeout: 8000,
      kill_timeout: 5000
    }
  ],

  // Deployment configuration for GitHub Actions
  deploy: {
    production: {
      user: 'root',
      host: '<PROD_HOST>',
      ref: 'origin/main',
      repo: 'https://github.com/steveterryp/copov15.git',
      path: '/var/www/paichart-app',
      'pre-deploy-local': '',
      'post-deploy': [
        'npm install --production --no-audit --no-fund',
        'npm run build',
        'pm2 reload ecosystem.config.js --update-env',
        'pm2 save'
      ].join(' && '),
      'pre-setup': ''
    }
  }
};