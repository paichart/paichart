/**
 * Register Internal pAIchart Services
 *
 * Registers internal services that route directly to handlers
 * (no HTTP call - same process invocation)
 *
 * Run: npx ts-node scripts/register-internal-services.ts
 *
 * @see implementation-plan-v4.2-focused.md
 */

import { PrismaClient, MCPAuthType } from '@prisma/client';

const prisma = new PrismaClient();

interface InternalServiceConfig {
  id: string;
  name: string;
  description: string;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: object;
  }>;
}

// Legacy service IDs to delete (replaced by paichart-project-service)
const LEGACY_SERVICE_IDS = [
  'paichart-pov-service',
  'paichart-task-service',
];

const INTERNAL_SERVICES: InternalServiceConfig[] = [
  {
    id: 'paichart-project-service',
    name: 'pAIchart Project Service',
    description: `Unified access to POV and task data through the MCP Hub.

TOOLS:
• project - Read POV and task data (actions: pov.list, pov.details, pov.phases, task.list, task.context, task.details)
• perform - Execute task/agent/POV/stage actions (14 sub-actions)

EXAMPLES:
• services(action: "call", targetService: "paichart-project-service", tool: "project", arguments: {action: "pov.list", status: "IN_PROGRESS"})
• services(action: "call", targetService: "paichart-project-service", tool: "project", arguments: {action: "pov.details", povName: "Acme Corp"})
• services(action: "call", targetService: "paichart-project-service", tool: "project", arguments: {action: "task.list", povId: "clxyz123", status: "TODO"})
• services(action: "call", targetService: "paichart-project-service", tool: "perform", arguments: {action: "task.complete", taskId: "clabc456"})`,
    tools: [
      {
        name: 'project',
        description: 'Read POV and task data. Use action parameter to specify operation.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['pov.list', 'pov.details', 'pov.phases', 'task.list', 'task.context', 'task.details'],
              description: 'Operation to perform'
            },
            // POV params
            status: { type: 'string', description: 'Filter by status (e.g., IN_PROGRESS, STALLED)' },
            customerName: { type: 'string', description: 'Filter by customer name' },
            salesTheatre: { type: 'string', description: 'Filter by sales theatre' },
            povId: { type: 'string', description: 'POV ID (CUID)' },
            povName: { type: 'string', description: 'POV name (alternative to ID)' },
            // Task params
            taskId: { type: 'string', description: 'Task ID (CUID)' },
            taskName: { type: 'string', description: 'Task name (alternative lookup)' },
            phaseId: { type: 'string', description: 'Phase ID to filter tasks' },
            assigneeId: { type: 'string', description: 'Filter tasks by assignee' },
            limit: { type: 'number', default: 100, description: 'Max results to return' }
          },
          required: ['action']
        }
      },
      {
        name: 'perform',
        description: 'Execute task, agent, POV, stage, and analytics actions.',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action to perform (e.g., task.create, task.complete, agent.assign, agent.execute, pov.create, stage.create, analytics.generate)' },
            taskId: { type: 'string', description: 'Task ID (CUID)' },
            parameters: { type: 'object', description: 'Action-specific parameters' }
          },
          required: ['action']
        }
      }
    ]
  }
];

async function registerInternalServices() {
  console.log('🔧 Registering internal pAIchart services...\n');

  // Delete legacy services (replaced by consolidated paichart-project-service)
  for (const legacyId of LEGACY_SERVICE_IDS) {
    try {
      await prisma.mCPTool.delete({ where: { id: legacyId } });
      console.log(`  🗑️  Deleted legacy service: ${legacyId}`);
    } catch (e: any) {
      if (e.code === 'P2025') {
        console.log(`  ⏭️  Legacy service already removed: ${legacyId}`);
      } else {
        console.error(`  ⚠️  Error deleting ${legacyId}:`, e.message);
      }
    }
  }
  console.log('');

  for (const service of INTERNAL_SERVICES) {
    console.log(`Registering: ${service.name}`);

    await prisma.mCPTool.upsert({
      where: { id: service.id },
      update: {
        name: service.name,
        description: service.description,
        version: '1.0.0',
        status: 'ACTIVE',
        capabilities: {
          tools: service.tools,
          categories: ['internal', 'paichart'],
          transport: 'internal'
        },
        configuration: {
          type: 'internal',
          endpoint: `internal://${service.id.replace('paichart-', '').replace('-service', '')}`,
          healthCheck: 'internal',
          category: 'data-services'  // Hub-level category for services(action: "discover") filtering
        },
        authType: MCPAuthType.NONE, // Auth handled by Hub
        permissions: {
          publicAccess: true, // Any authenticated Hub user
          internal: true
        }
      },
      create: {
        id: service.id,
        name: service.name,
        description: service.description,
        version: '1.0.0',
        status: 'ACTIVE',
        capabilities: {
          tools: service.tools,
          categories: ['internal', 'paichart'],
          transport: 'internal'
        },
        configuration: {
          type: 'internal',
          endpoint: `internal://${service.id.replace('paichart-', '').replace('-service', '')}`,
          healthCheck: 'internal',
          category: 'data-services'  // Hub-level category for services(action: "discover") filtering
        },
        authType: MCPAuthType.NONE,
        credentials: {},
        permissions: {
          publicAccess: true,
          internal: true
        }
      }
    });

    console.log(`  ✅ ${service.id} registered with ${service.tools.length} tools`);
  }

  // Register recommendation engine (Phase 1.5: system tool for data-driven recommendations)
  console.log('Registering: pAIchart Recommendation Engine');
  const recEngineData = {
    name: 'pAIchart Recommendation Engine',
    description: 'Internal recommendation engine for data-driven task recommendations. Generates actionable recommendations based on stale tasks, unassigned work, approaching deadlines, and POV progress.',
    version: '1.0.0',
    status: 'ACTIVE' as const,
    capabilities: {
      categories: ['internal', 'recommendations', 'ai-intelligence'],
      transport: 'internal',
    },
    configuration: {
      type: 'internal',
      endpoint: 'internal://recommendation-engine',
      healthCheck: 'internal',
      category: 'ai-intelligence',
    },
    authType: MCPAuthType.NONE,
    credentials: {},
    permissions: { internal: true },
  };
  await prisma.mCPTool.upsert({
    where: { id: 'paichart-recommendation-engine' },
    update: recEngineData,
    create: { id: 'paichart-recommendation-engine', ...recEngineData },
  });
  console.log('  ✅ paichart-recommendation-engine registered');

  // Register KPI service (KPI Service: scoring, history, evaluation for POVs)
  console.log('Registering: pAIchart KPI Service');
  const kpiServiceData = {
    name: 'pAIchart KPI Service',
    description: 'KPI scoring, history, and evaluation for POVs. Read-only — provides scorecard data for dashboards and AI clients. 3 calculators: task-completion-rate, on-time-rate, stale-task-ratio.',
    version: '1.0.0',
    status: 'ACTIVE' as const,
    capabilities: {
      categories: ['internal', 'kpi', 'ai-intelligence'],
      transport: 'internal',
    },
    configuration: {
      type: 'internal',
      endpoint: 'internal://kpi-service',
      healthCheck: 'internal',
      category: 'ai-intelligence',
    },
    authType: MCPAuthType.NONE,
    credentials: {},
    permissions: { internal: true },
  };
  await prisma.mCPTool.upsert({
    where: { id: 'paichart-kpi-service' },
    update: kpiServiceData,
    create: { id: 'paichart-kpi-service', ...kpiServiceData },
  });
  console.log('  ✅ paichart-kpi-service registered');

  console.log('\n✅ Internal services registration complete!');
  console.log('\nRegistered services:');
  INTERNAL_SERVICES.forEach(s => {
    console.log(`  • ${s.id} (${s.tools.length} tools)`);
  });
  console.log('  • paichart-recommendation-engine (system tool)');
  console.log('  • paichart-kpi-service (system tool)');

  console.log('\n📝 Legacy services deleted:');
  LEGACY_SERVICE_IDS.forEach(id => console.log(`  • ${id} (replaced by paichart-project-service)`));
}

registerInternalServices()
  .catch(console.error);
// Note: Global singleton handles its own lifecycle - no $disconnect() needed
