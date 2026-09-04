/**
 * Seed Notification Service into MCPTool database
 *
 * Registers the notification-service as an MCP service
 * that can be called via the Hub's MCPServiceOrchestrationHandler.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Registering Notification Service...');

  const service = await prisma.mCPTool.upsert({
    where: {
      id: 'notification-service'
    },
    update: {
      name: 'Notification Service',
      description: `Multi-channel notification routing service for email (Brevo), Slack, and webhooks.

WHEN TO USE:
✅ Send task completion notifications to team members
✅ Alert stakeholders when POV status changes
✅ Broadcast announcements across multiple channels
✅ Set up escalation chains for critical alerts
✅ Schedule recurring status updates
❌ Real-time chat (use direct Slack integration)
❌ SMS notifications (not yet supported)

AVAILABLE TOOLS:
• send - Single channel notification (email/slack/webhook)
• broadcast - Multi-channel simultaneous delivery
• escalate - Time-based escalation with acknowledgment
• schedule - Future delivery with optional recurrence

EXAMPLES:
• services(action: "call", targetService: 'notification-service', tool: 'send', arguments: {channel: 'email', recipients: [{id: 'user1', address: 'john@company.com'}], message: {subject: 'Task Complete', body: 'Your task has been completed'}})
• services(action: "call", targetService: 'notification-service', tool: 'broadcast', arguments: {channels: ['email', 'slack'], message: {subject: 'POV Won!', body: 'Congratulations team!'}})

WORKFLOW:
1. services(action: "discover", capability: 'notifications') → Find this service
2. services(action: "health", service_name: 'notification-service') → Verify healthy
3. services(action: "call", targetService: 'notification-service', tool: 'send', ...) → Send notification (you are here)

SEE ALSO:
• browser-automation-service - For web scraping and form filling
• services(action: "health") - Check service availability before sending`,
      version: '1.0.0',
      status: 'ACTIVE',
      capabilities: {
        tools: [
          {
            name: 'send',
            description: 'Send a notification through a single channel (email, slack, or webhook)',
            inputSchema: {
              type: 'object',
              properties: {
                channel: { type: 'string', enum: ['email', 'slack', 'webhook'] },
                recipients: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      address: { type: 'string' }
                    },
                    required: ['id', 'address']
                  }
                },
                message: {
                  type: 'object',
                  properties: {
                    subject: { type: 'string' },
                    body: { type: 'string' },
                    html: { type: 'string' },
                    priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] }
                  },
                  required: ['body']
                }
              },
              required: ['channel', 'recipients', 'message']
            }
          },
          {
            name: 'broadcast',
            description: 'Send notifications through multiple channels simultaneously',
            inputSchema: {
              type: 'object',
              properties: {
                channels: { type: 'array', items: { type: 'string', enum: ['email', 'slack', 'webhook'] } },
                recipients: { type: 'object', additionalProperties: { type: 'array' } },
                message: { type: 'object' }
              },
              required: ['channels', 'recipients', 'message']
            }
          },
          {
            name: 'escalate',
            description: 'Send time-based escalation notifications through a chain of channels',
            inputSchema: {
              type: 'object',
              properties: {
                escalationPath: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      channel: { type: 'string' },
                      recipients: { type: 'array' },
                      delayMinutes: { type: 'number' }
                    }
                  }
                },
                message: { type: 'object' },
                acknowledgmentCallback: { type: 'string' },
                maxEscalations: { type: 'number' }
              },
              required: ['escalationPath', 'message']
            }
          },
          {
            name: 'schedule',
            description: 'Schedule notifications for future delivery with optional recurrence',
            inputSchema: {
              type: 'object',
              properties: {
                channel: { type: 'string', enum: ['email', 'slack', 'webhook'] },
                recipients: { type: 'array' },
                message: { type: 'object' },
                scheduledAt: { type: 'string', format: 'date-time' },
                timezone: { type: 'string' },
                recurrence: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['once', 'daily', 'weekly', 'monthly'] },
                    count: { type: 'number' },
                    until: { type: 'string' }
                  }
                }
              },
              required: ['channel', 'recipients', 'message', 'scheduledAt']
            }
          }
        ],
        categories: ['notifications', 'messaging', 'communication'],
        transport: 'http',
        channels: ['email', 'slack', 'webhook']
      },
      configuration: {
        endpoint: 'http://localhost:3101/sse',
        healthCheck: '/health',
        toolsEndpoint: '/tools',
        callEndpoint: '/mcp/call',
        timeout: 30000,
        category: 'communication',  // Hub-level category for services(action: "discover") filtering
        // Operational settings (moved from permissions for semantic correctness)
        rateLimits: {
          email: 100,
          slack: 50,
          webhook: 100
        },
        maxRecipients: 100,
        maxScheduledDays: 30
      },
      authType: 'NONE',
      credentials: {},
      permissions: {
        publicAccess: false  // 2026-05-26: locked down — email spam relay + webhook SSRF (public DEMO abuse)
      }
    },
    create: {
      id: 'notification-service',
      name: 'Notification Service',
      description: `Multi-channel notification routing service for email (Brevo), Slack, and webhooks.

WHEN TO USE:
✅ Send task completion notifications to team members
✅ Alert stakeholders when POV status changes
✅ Broadcast announcements across multiple channels
✅ Set up escalation chains for critical alerts
✅ Schedule recurring status updates
❌ Real-time chat (use direct Slack integration)
❌ SMS notifications (not yet supported)

AVAILABLE TOOLS:
• send - Single channel notification (email/slack/webhook)
• broadcast - Multi-channel simultaneous delivery
• escalate - Time-based escalation with acknowledgment
• schedule - Future delivery with optional recurrence

EXAMPLES:
• services(action: "call", targetService: 'notification-service', tool: 'send', arguments: {channel: 'email', recipients: [{id: 'user1', address: 'john@company.com'}], message: {subject: 'Task Complete', body: 'Your task has been completed'}})
• services(action: "call", targetService: 'notification-service', tool: 'broadcast', arguments: {channels: ['email', 'slack'], message: {subject: 'POV Won!', body: 'Congratulations team!'}})

WORKFLOW:
1. services(action: "discover", capability: 'notifications') → Find this service
2. services(action: "health", service_name: 'notification-service') → Verify healthy
3. services(action: "call", targetService: 'notification-service', tool: 'send', ...) → Send notification (you are here)

SEE ALSO:
• browser-automation-service - For web scraping and form filling
• services(action: "health") - Check service availability before sending`,
      version: '1.0.0',
      status: 'ACTIVE',
      capabilities: {
        tools: [
          {
            name: 'send',
            description: 'Send a notification through a single channel (email, slack, or webhook)',
            inputSchema: {
              type: 'object',
              properties: {
                channel: { type: 'string', enum: ['email', 'slack', 'webhook'] },
                recipients: { type: 'array' },
                message: { type: 'object' }
              },
              required: ['channel', 'recipients', 'message']
            }
          },
          {
            name: 'broadcast',
            description: 'Send notifications through multiple channels simultaneously',
            inputSchema: { type: 'object' }
          },
          {
            name: 'escalate',
            description: 'Send time-based escalation notifications through a chain of channels',
            inputSchema: { type: 'object' }
          },
          {
            name: 'schedule',
            description: 'Schedule notifications for future delivery with optional recurrence',
            inputSchema: { type: 'object' }
          }
        ],
        categories: ['notifications', 'messaging', 'communication'],
        transport: 'http',
        channels: ['email', 'slack', 'webhook']
      },
      configuration: {
        endpoint: 'http://localhost:3101/sse',
        healthCheck: '/health',
        toolsEndpoint: '/tools',
        callEndpoint: '/mcp/call',
        timeout: 30000,
        category: 'communication',  // Hub-level category for services(action: "discover") filtering
        // Operational settings (moved from permissions for semantic correctness)
        rateLimits: {
          email: 100,
          slack: 50,
          webhook: 100
        },
        maxRecipients: 100,
        maxScheduledDays: 30
      },
      authType: 'NONE',
      credentials: {},
      permissions: {
        publicAccess: false  // 2026-05-26: locked down — email spam relay + webhook SSRF (public DEMO abuse)
      }
    }
  });

  console.log('✅ Notification Service registered:');
  console.log(`   ID: ${service.id}`);
  console.log(`   Name: ${service.name}`);
  console.log(`   Version: ${service.version}`);
  console.log(`   Status: ${service.status}`);
  console.log(`   Endpoint: http://localhost:3101/sse`);
  console.log(`   Tools: 4 notification tools`);
  console.log(`   Channels: email, slack, webhook`);
}

main()
  .catch((e) => {
    console.error('Error registering service:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
