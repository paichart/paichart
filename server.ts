require('dotenv').config(); // Load environment variables from .env file
import type { IncomingMessage, ServerResponse } from 'http';
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { initializeServer } = require('./lib/server-init');
const { errorCounter } = require('./lib/monitoring/error-counter');

// D4 (2026-09-04): issuer/audiences/OAuth discovery URLs derive from APP_BASE_URL
// (lib/auth/public-base-url.ts). In production the web server refuses to boot without it —
// a self-host at the fallback would advertise paichart.app as its OAuth issuer. Deliberately
// TOP-LEVEL (not inside initializeServer, whose .catch() swallows errors and keeps serving).
// Prod always sets it (deploy heredoc), so this is a no-op there.
const { assertPublicBaseUrlConfigured } = require('./lib/auth/public-base-url');
if (process.env.NODE_ENV === 'production') {
  const { warnings: baseUrlWarnings } = assertPublicBaseUrlConfigured();
  for (const w of baseUrlWarnings) console.warn('[public-base-url]', w);
}

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    PORT?: string;
  }
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Process-level error handlers — catch crashes PM2 can't see
// BC57 FIX: Sanitize logged data to prevent leaking connection strings or secrets
process.on('uncaughtException', (err: Error) => {
  try { errorCounter.increment('uncaught'); } catch {}
  console.error('[UNCAUGHT]', err.message);
});

process.on('unhandledRejection', (reason: unknown) => {
  try { errorCounter.increment('unhandled-rejection'); } catch {}
  const msg = reason instanceof Error ? reason.message : 'Promise rejected';
  console.error('[UNHANDLED]', msg);
});

// Configure Next.js with custom server options
const app = next({ 
  dev, 
  hostname, 
  port,
  customServer: true,
  conf: {
    experimental: {
      serverComponentsExternalPackages: ['@modelcontextprotocol/sdk']
    }
  }
});

const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      try { errorCounter.increment('ssr'); } catch {}
      console.error('Error occurred handling request:', err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  // Start the server first
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.NODE_ENV
      }`
    );
    
    // Initialize all server services AFTER the server is listening
    initializeServer(server).then(() => {
      console.log('> MCP services ready');
    }).catch((error: any) => {
      console.error('Failed to initialize server services:', error);
      console.log('> Server started without MCP services');
    });
  });

  // Handle server shutdown - cleanup is now handled in initializeServer
});
