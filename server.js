// Production server entry point for pAIchart
// This file bridges Node.js production environment with TypeScript codebase

require('dotenv').config(); // Load environment variables

// Check if we're in production and handle TypeScript compilation
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  // Register tsconfig-paths first to handle @ path mappings
  require('tsconfig-paths/register');
  
  // In production, register ts-node for TypeScript execution
  require('ts-node').register({
    project: './tsconfig.server.json',
    transpileOnly: true, // Skip type checking for performance
    compilerOptions: {
      module: 'CommonJS',
      baseUrl: '.',
      paths: {
        '@/*': ['./*']
      }
    }
  });
}

// Now require the TypeScript server file
require('./server.ts');
