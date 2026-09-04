/**
 * Seed Snowflake Service into MCPTool database
 *
 * Registers the Snowflake MCP service for Hub discovery and orchestration.
 * Run: npx ts-node scripts/seed-snowflake-service.ts
 */

import { PrismaClient, MCPAuthType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Registering Snowflake Service...');

  const service = await prisma.mCPTool.upsert({
    where: { id: 'snowflake-service' },
    update: {
      name: 'Snowflake Service',
      description: 'Snowflake data warehouse access with read-only SQL queries, schema exploration, and object metadata. Supports JWKS-authenticated workflow execution for user-scoped audit trails.',
      version: '1.0.0',
      status: 'ACTIVE',
      capabilities: {
        tools: [
          {
            name: 'run_snowflake_query',
            description: 'Execute a read-only SQL query against Snowflake data warehouse',
            inputSchema: {
              type: 'object',
              properties: {
                statement: { type: 'string', description: 'SQL SELECT query to execute' },
                warehouse: { type: 'string', description: 'Override warehouse for this query' },
                database: { type: 'string', description: 'Override database for this query' },
                schema: { type: 'string', description: 'Override schema for this query' },
              },
              required: ['statement'],
            },
          },
          {
            name: 'list_objects',
            description: 'List Snowflake objects (databases, schemas, tables, views, warehouses)',
            inputSchema: {
              type: 'object',
              properties: {
                objectType: {
                  type: 'string',
                  enum: ['databases', 'schemas', 'tables', 'views', 'warehouses'],
                  description: 'Type of Snowflake object to list',
                },
                database: { type: 'string', description: 'Database scope' },
                schema: { type: 'string', description: 'Schema scope' },
                like: { type: 'string', description: 'SQL LIKE pattern filter' },
              },
              required: ['objectType'],
            },
          },
          {
            name: 'describe_object',
            description: 'Get column definitions and metadata for a Snowflake table or view',
            inputSchema: {
              type: 'object',
              properties: {
                objectType: {
                  type: 'string',
                  enum: ['table', 'view'],
                  description: 'Type of object to describe',
                },
                name: { type: 'string', description: 'Object name (fully qualified or simple)' },
                database: { type: 'string', description: 'Database containing the object' },
                schema: { type: 'string', description: 'Schema containing the object' },
              },
              required: ['objectType', 'name'],
            },
          },
        ],
        categories: ['data-analytics', 'database', 'business-intelligence'],
        transport: 'http',
      },
      configuration: {
        endpoint: 'http://localhost:3106/sse',
        healthCheck: '/health',
        timeout: 60000,
        category: 'data-analytics',
        maxExecutionTime: 120000,
        rateLimit: { requests: 20, windowMs: 60000 },  // 2026-05-26: per-user hub rate limit (durability for live hardening)
      },
      authType: MCPAuthType.NONE,
      credentials: {},
      permissions: {
        publicAccess: true,
      },
    },
    create: {
      id: 'snowflake-service',
      name: 'Snowflake Service',
      description: 'Snowflake data warehouse access with read-only SQL queries, schema exploration, and object metadata. Supports JWKS-authenticated workflow execution for user-scoped audit trails.',
      version: '1.0.0',
      status: 'ACTIVE',
      capabilities: {
        tools: [
          {
            name: 'run_snowflake_query',
            description: 'Execute a read-only SQL query against Snowflake data warehouse',
            inputSchema: {
              type: 'object',
              properties: {
                statement: { type: 'string', description: 'SQL SELECT query to execute' },
                warehouse: { type: 'string', description: 'Override warehouse for this query' },
                database: { type: 'string', description: 'Override database for this query' },
                schema: { type: 'string', description: 'Override schema for this query' },
              },
              required: ['statement'],
            },
          },
          {
            name: 'list_objects',
            description: 'List Snowflake objects (databases, schemas, tables, views, warehouses)',
            inputSchema: {
              type: 'object',
              properties: {
                objectType: {
                  type: 'string',
                  enum: ['databases', 'schemas', 'tables', 'views', 'warehouses'],
                  description: 'Type of Snowflake object to list',
                },
                database: { type: 'string', description: 'Database scope' },
                schema: { type: 'string', description: 'Schema scope' },
                like: { type: 'string', description: 'SQL LIKE pattern filter' },
              },
              required: ['objectType'],
            },
          },
          {
            name: 'describe_object',
            description: 'Get column definitions and metadata for a Snowflake table or view',
            inputSchema: {
              type: 'object',
              properties: {
                objectType: {
                  type: 'string',
                  enum: ['table', 'view'],
                  description: 'Type of object to describe',
                },
                name: { type: 'string', description: 'Object name (fully qualified or simple)' },
                database: { type: 'string', description: 'Database containing the object' },
                schema: { type: 'string', description: 'Schema containing the object' },
              },
              required: ['objectType', 'name'],
            },
          },
        ],
        categories: ['data-analytics', 'database', 'business-intelligence'],
        transport: 'http',
      },
      configuration: {
        endpoint: 'http://localhost:3106/sse',
        healthCheck: '/health',
        timeout: 60000,
        category: 'data-analytics',
        maxExecutionTime: 120000,
        rateLimit: { requests: 20, windowMs: 60000 },  // 2026-05-26: per-user hub rate limit (durability for live hardening)
      },
      authType: MCPAuthType.NONE,
      credentials: {},
      permissions: {
        publicAccess: true,
      },
    },
  });

  console.log('Snowflake Service registered:');
  console.log(`  ID: ${service.id}`);
  console.log(`  Name: ${service.name}`);
  console.log(`  Endpoint: http://localhost:3106/sse`);
  console.log(`  Tools: run_snowflake_query, list_objects, describe_object`);
  console.log(`  Categories: data-analytics, database, business-intelligence`);
}

main()
  .catch((e) => {
    console.error('Error registering service:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
