/**
 * Pino Logger for non-MCP JavaScript files
 *
 * CJS pino wrapper for JS files in lib/ that are outside lib/mcp/server/.
 * Mirrors lib/logger.ts domain loggers and lib/mcp/server/mcp-logger.js pattern.
 *
 * Use this for:
 *   - lib/events/ (event system infrastructure)
 *   - lib/auth/oauth/ (OAuth utilities)
 *   - lib/services/workflow/ (workflow engine)
 *   - lib/utils/ (utilities)
 *   - lib/prisma.js (Prisma singleton)
 *   - lib/mcp/simple-resource-manager.js (resource manager)
 *
 * Do NOT use for:
 *   - lib/mcp/server/ — use lib/mcp/server/mcp-logger.js instead
 *   - TypeScript files — use lib/logger.ts instead
 *
 * Created: Feb 2026 — pino migration for server-side JS files.
 * See pino-structured-logging-pattern.md for full conventions.
 *
 * @module js-logger
 */

'use strict';

const pino = require('pino');
// Load shared redact config (single source of truth with lib/logger.ts and mcp-logger.js)
// Static path required — path.join(__dirname, ...) causes webpack "critical dependency" warning
const pinoBaseOptions = require('./mcp/server/pino-base-options.json');

const BASE_OPTIONS = {
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: pinoBaseOptions.redact,
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Root logger (stdout — these files run inside the Next.js process)
const root = pino(BASE_OPTIONS);

// Domain loggers matching lib/logger.ts exports
const authLogger    = root.child({ domain: 'auth' });
const mcpLogger     = root.child({ domain: 'mcp' });
const dbLogger      = root.child({ domain: 'db' });
const eventLogger   = root.child({ domain: 'event' });
const apiLogger     = root.child({ domain: 'api' });
const monitorLogger = root.child({ domain: 'monitor' });

/**
 * Creates a logger adapter that bridges console-style (msg, ...args) calling
 * convention to pino's (obj, msg) signature. Identical to mcp-logger.js createAdapter().
 *
 * @param {import('pino').Logger} pinoChild - A pino child logger
 * @returns {{ trace, debug, info, warn, error, fatal }} Console-compatible logger
 */
function createAdapter(pinoChild) {
  function adapt(level) {
    return function (msg, ...args) {
      // Detect pino-native convention: log.info({ data }, 'message')
      if (msg !== null && typeof msg === 'object' && !(msg instanceof Error) && !(msg instanceof Date)) {
        if (args.length === 0) {
          pinoChild[level](msg);
        } else {
          pinoChild[level](msg, ...args);
        }
        return;
      }

      if (args.length === 0) {
        pinoChild[level](String(msg));
      } else if (args.length === 1) {
        const arg = args[0];
        if (arg instanceof Error) {
          pinoChild[level]({ err: arg }, String(msg));
        } else if (arg !== null && arg !== undefined && typeof arg === 'object' && !(arg instanceof Date)) {
          pinoChild[level](arg, String(msg));
        } else {
          pinoChild[level](`${msg} ${arg}`);
        }
      } else {
        const first = args[0];
        if (first instanceof Error) {
          const rest = args.slice(1);
          if (rest.length > 0) {
            const restStr = rest.map(a =>
              (a !== null && typeof a === 'object') ? JSON.stringify(a) : String(a)
            ).join(' ');
            pinoChild[level]({ err: first }, `${msg} ${restStr}`);
          } else {
            pinoChild[level]({ err: first }, String(msg));
          }
        } else {
          const parts = args.map(a =>
            (a !== null && a !== undefined && typeof a === 'object') ? JSON.stringify(a) : String(a)
          );
          pinoChild[level](`${msg} ${parts.join(' ')}`);
        }
      }
    };
  }

  return {
    trace: adapt('trace'),
    debug: adapt('debug'),
    info:  adapt('info'),
    warn:  adapt('warn'),
    error: adapt('error'),
    fatal: adapt('fatal'),
  };
}

module.exports = {
  // Root logger (for creating custom children)
  root,

  // Domain loggers
  authLogger,
  mcpLogger,
  dbLogger,
  eventLogger,
  apiLogger,
  monitorLogger,

  // Adapter factory
  createAdapter,
};
