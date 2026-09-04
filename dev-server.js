#!/usr/bin/env node

// Load environment variables
require('dotenv').config();

// Enable AsyncLocalStorage support
if (!globalThis.AsyncLocalStorage) {
  globalThis.AsyncLocalStorage = require('async_hooks').AsyncLocalStorage;
}

// Removed experimental flags that cause Jest worker errors in Next.js
// These flags are not allowed in NODE_OPTIONS for child processes
// process.env.NODE_OPTIONS = '--experimental-async-context-snapshot --experimental-async-stack-traces';

// Register ts-node
require('ts-node').register({
  project: './tsconfig.server.json',
  transpileOnly: true
});

// Register path aliases
require('tsconfig-paths/register');

// Start the server
require('./server.ts');