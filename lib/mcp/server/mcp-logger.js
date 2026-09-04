/**
 * MCP Server Pino Logger
 *
 * CJS pino wrapper for root-level MCP server JS files.
 * Mirrors lib/logger.ts options exactly (level, redact, timestamp).
 *
 * Provides:
 *   - Stdout domain loggers (default): mcpLogger, authLogger, dbLogger, etc.
 *   - Stderr domain loggers: stderr.mcpLogger, etc. — for stdio-transport
 *     servers where stdout is reserved for JSON-RPC.
 *   - createAdapter(pinoChild): bridges console-style (msg, ...args) calling
 *     convention used by existing createLogger() facades to pino's (obj, msg)
 *     signature, avoiding changes to ~211 this.logger.* call sites.
 *
 * @module mcp-logger
 */

'use strict';

const pino = require('pino');
const pinoBaseOptions = require('./pino-base-options.json');

// ============================================================
// Base options — shared redact config from pino-base-options.json
// (single source of truth, also imported by lib/logger.ts)
// ============================================================

const BASE_OPTIONS = {
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: pinoBaseOptions.redact,
  timestamp: pino.stdTimeFunctions.isoTime,
};

// ============================================================
// Stdout loggers (default destination — fd 1)
// Use for HTTP-transport servers (mcp-server-http-clean.js)
// ============================================================

const stdoutRoot = pino(BASE_OPTIONS);

const mcpLogger     = stdoutRoot.child({ domain: 'mcp' });
const authLogger    = stdoutRoot.child({ domain: 'auth' });
const dbLogger      = stdoutRoot.child({ domain: 'db' });
const monitorLogger = stdoutRoot.child({ domain: 'monitor' });
const apiLogger     = stdoutRoot.child({ domain: 'api' });

// ============================================================
// Stderr loggers (fd 2)
// Use for stdio-transport servers where stdout = JSON-RPC
// (mcp-server-v5.js, mcp-server-http-clean.js)
// ============================================================

const stderrDest = pino.destination(2);
const stderrRoot = pino(BASE_OPTIONS, stderrDest);

const stderr = {
  mcpLogger:     stderrRoot.child({ domain: 'mcp' }),
  authLogger:    stderrRoot.child({ domain: 'auth' }),
  dbLogger:      stderrRoot.child({ domain: 'db' }),
  monitorLogger: stderrRoot.child({ domain: 'monitor' }),
  apiLogger:     stderrRoot.child({ domain: 'api' }),
};

// ============================================================
// createAdapter — bridges (msg, ...args) → pino (obj, msg)
// ============================================================

/**
 * Creates a logger object with info/warn/error/debug methods that accept
 * the same (msg, ...args) calling convention as the old console-based
 * createLogger() facades, but routes everything through a pino child.
 *
 * Handles all observed calling patterns:
 *   (msg)                → pino.info(msg)
 *   (msg, { data })      → pino.info({ data }, msg)
 *   (msg, error)         → pino.error({ err: error }, msg)
 *   (msg, val1, val2)    → pino.info('msg val1 val2')
 *
 * @param {import('pino').Logger} pinoChild - A pino child logger
 * @returns {{ trace, debug, info, warn, error, fatal }} Console-compatible logger
 */
function createAdapter(pinoChild) {
  function adapt(level) {
    return function (msg, ...args) {
      // Detect pino-native convention: log.info({ data }, 'message')
      // First arg is a plain object (not Error/Date), second arg is a string
      if (msg !== null && typeof msg === 'object' && !(msg instanceof Error) && !(msg instanceof Date)) {
        if (args.length === 0) {
          // log.info({ data }) — object only, no message
          pinoChild[level](msg);
        } else {
          // log.info({ data }, 'message', ...rest) — pass through to pino directly
          pinoChild[level](msg, ...args);
        }
        return;
      }

      if (args.length === 0) {
        // Single message string
        pinoChild[level](String(msg));
      } else if (args.length === 1) {
        const arg = args[0];
        if (arg instanceof Error) {
          pinoChild[level]({ err: arg }, String(msg));
        } else if (arg !== null && arg !== undefined && typeof arg === 'object' && !(arg instanceof Date)) {
          pinoChild[level](arg, String(msg));
        } else {
          // Primitive (string, number, boolean)
          pinoChild[level](`${msg} ${arg}`);
        }
      } else {
        // Multiple args
        const first = args[0];
        if (first instanceof Error) {
          // Error as first extra arg, maybe more args after
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
          // BC42 FIX: Redact sensitive keys before stringifying objects (bypasses pino redaction when concatenated into msg)
          const SENSITIVE_RE = /^(password|token|secret|key|apiKey|access_token|refresh_token|client_secret|code_verifier|authorization|cookie)$/i;
          const redactObj = (obj) => {
            if (typeof obj !== 'object' || obj === null) return obj;
            const r = {};
            for (const [k, v] of Object.entries(obj)) {
              r[k] = SENSITIVE_RE.test(k) ? '[REDACTED]' : v;
            }
            return r;
          };
          const parts = args.map(a =>
            (a !== null && a !== undefined && typeof a === 'object') ? JSON.stringify(redactObj(a)) : String(a)
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

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Stdout loggers (HTTP servers)
  mcpLogger,
  authLogger,
  dbLogger,
  monitorLogger,
  apiLogger,

  // Stderr loggers (stdio servers)
  stderr,

  // Adapter factory
  createAdapter,
};
