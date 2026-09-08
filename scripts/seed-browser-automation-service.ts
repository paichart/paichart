/**
 * Seed Browser Automation Service into MCPTool database
 *
 * Registers the browser-automation-service as an MCP service
 * that can be called via the Hub's MCPServiceOrchestrationHandler.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Registering Browser Automation Service...');

  const service = await prisma.mCPTool.upsert({
    where: {
      id: 'browser-automation-service'
    },
    update: {
      name: 'Browser Automation Service',
      description: `Playwright-based browser automation for web scraping, form filling, screenshots, and PDFs.

WHEN TO USE:
✅ Scrape competitor pricing or product data
✅ Fill out web forms automatically (lead gen, registrations)
✅ Capture screenshots for documentation or monitoring
✅ Generate PDFs from web pages (reports, invoices)
✅ Execute JavaScript for complex interactions
✅ Debug browser sessions with trace recordings
❌ Real-time browser control (use direct Playwright)
❌ Long-running browser sessions >5 minutes

AVAILABLE TOOLS:
• scrape_page - Extract data with CSS selectors, supports pagination
• fill_form - Automated form filling with field mappings
• click_element - Click buttons/links with optional screenshot
• take_screenshot - Full page or element screenshots
• generate_pdf - Convert pages to PDF (A4/Letter/Legal)
• run_script - Execute custom JavaScript
• trace_session - Record browser sessions for debugging

EXAMPLES (registry(action: 'tools') for full parameter schemas):
• scrape_page — {url: '…/products', selectors: {title: 'h1.product-name', price: '.price'}}
• take_screenshot — {url: 'https://example.com', fullPage: true}
• fill_form — {url: '…/contact', fieldMappings: {name: '#name'}, formData: {name: 'John'}, submit: true}
• generate_pdf — {url: '…/report', pageSettings: {format: 'A4', landscape: false}}

WORKFLOW:
1. services(action: "discover", capability: 'browser-automation') → Find this service
2. services(action: "health", service_name: 'browser-automation-service') → Verify healthy
3. services(action: "call", targetService: 'browser-automation-service', tool: 'scrape_page', ...) → Execute automation (you are here)

SEE ALSO:
• notification-service - Send alerts based on scraped data
• services(action: "health") - Check service availability before automation`,
      version: '1.0.0',
      status: 'ACTIVE',
      capabilities: {
        tools: [
          {
            name: 'scrape_page',
            description: 'Extract data from web pages using CSS selectors with optional pagination',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                selectors: { type: 'object', additionalProperties: { type: 'string' } },
                waitFor: { type: 'string' },
                pagination: {
                  type: 'object',
                  properties: {
                    nextSelector: { type: 'string' },
                    maxPages: { type: 'number', minimum: 1, maximum: 100 }
                  }
                }
              },
              required: ['url', 'selectors']
            }
          },
          {
            name: 'fill_form',
            description: 'Fill and optionally submit web forms with field mappings',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                fieldMappings: { type: 'object', additionalProperties: { type: 'string' } },
                formData: { type: 'object', additionalProperties: { type: 'string' } },
                submit: { type: 'boolean' },
                submitSelector: { type: 'string' }
              },
              required: ['url', 'fieldMappings', 'formData']
            }
          },
          {
            name: 'click_element',
            description: 'Click an element on the page and optionally capture screenshots',
            inputSchema: {
              type: 'object',
              properties: {
                selector: { type: 'string' },
                url: { type: 'string', format: 'uri' },
                waitAfter: { type: 'number', minimum: 0, maximum: 30000 },
                screenshot: { type: 'boolean' }
              },
              required: ['selector']
            }
          },
          {
            name: 'take_screenshot',
            description: 'Capture screenshots of web pages or specific elements',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                fullPage: { type: 'boolean' },
                selector: { type: 'string' }
              }
            }
          },
          {
            name: 'generate_pdf',
            description: 'Generate PDF documents from web pages with configurable settings',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                pageSettings: {
                  type: 'object',
                  properties: {
                    format: { type: 'string', enum: ['A4', 'Letter', 'Legal'] },
                    landscape: { type: 'boolean' },
                    margin: {
                      type: 'object',
                      properties: {
                        top: { type: 'string' },
                        right: { type: 'string' },
                        bottom: { type: 'string' },
                        left: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          {
            name: 'run_script',
            description: 'Execute JavaScript code in the browser context',
            inputSchema: {
              type: 'object',
              properties: {
                script: { type: 'string' },
                url: { type: 'string', format: 'uri' },
                timeout: { type: 'number', minimum: 1000, maximum: 300000 }
              },
              required: ['script']
            }
          },
          {
            name: 'trace_session',
            description: 'Record and manage browser session traces for debugging',
            inputSchema: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['start', 'stop', 'get'] },
                traceId: { type: 'string' }
              },
              required: ['action']
            }
          }
        ],
        categories: ['browser-automation', 'web-scraping', 'testing'],
        transport: 'http',
        maxConcurrentBrowsers: 5
      },
      configuration: {
        endpoint: 'http://localhost:3100/sse',
        healthCheck: '/health',
        timeout: 60000,
        poolSize: 5,
        category: 'automation',  // Hub-level category for services(action: "discover") filtering
        // Operational settings (moved from permissions for semantic correctness)
        allowedDomains: ['*'],
        maxExecutionTime: 300000,
        maxScreenshotSize: 10485760
      },
      authType: 'NONE',
      credentials: {},
      permissions: {
        publicAccess: false  // 2026-05-26: locked down — SSRF/arbitrary-fetch + run_script abuse (public DEMO)
      }
    },
    create: {
      id: 'browser-automation-service',
      name: 'Browser Automation Service',
      description: `Playwright-based browser automation for web scraping, form filling, screenshots, and PDFs.

WHEN TO USE:
✅ Scrape competitor pricing or product data
✅ Fill out web forms automatically (lead gen, registrations)
✅ Capture screenshots for documentation or monitoring
✅ Generate PDFs from web pages (reports, invoices)
✅ Execute JavaScript for complex interactions
✅ Debug browser sessions with trace recordings
❌ Real-time browser control (use direct Playwright)
❌ Long-running browser sessions >5 minutes

AVAILABLE TOOLS:
• scrape_page - Extract data with CSS selectors, supports pagination
• fill_form - Automated form filling with field mappings
• click_element - Click buttons/links with optional screenshot
• take_screenshot - Full page or element screenshots
• generate_pdf - Convert pages to PDF (A4/Letter/Legal)
• run_script - Execute custom JavaScript
• trace_session - Record browser sessions for debugging

EXAMPLES (registry(action: 'tools') for full parameter schemas):
• scrape_page — {url: '…/products', selectors: {title: 'h1.product-name', price: '.price'}}
• take_screenshot — {url: 'https://example.com', fullPage: true}
• fill_form — {url: '…/contact', fieldMappings: {name: '#name'}, formData: {name: 'John'}, submit: true}
• generate_pdf — {url: '…/report', pageSettings: {format: 'A4', landscape: false}}

WORKFLOW:
1. services(action: "discover", capability: 'browser-automation') → Find this service
2. services(action: "health", service_name: 'browser-automation-service') → Verify healthy
3. services(action: "call", targetService: 'browser-automation-service', tool: 'scrape_page', ...) → Execute automation (you are here)

SEE ALSO:
• notification-service - Send alerts based on scraped data
• services(action: "health") - Check service availability before automation`,
      version: '1.0.0',
      status: 'ACTIVE',
      capabilities: {
        tools: [
          {
            name: 'scrape_page',
            description: 'Extract data from web pages using CSS selectors with optional pagination',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                selectors: { type: 'object', additionalProperties: { type: 'string' } },
                waitFor: { type: 'string' },
                pagination: {
                  type: 'object',
                  properties: {
                    nextSelector: { type: 'string' },
                    maxPages: { type: 'number', minimum: 1, maximum: 100 }
                  }
                }
              },
              required: ['url', 'selectors']
            }
          },
          {
            name: 'fill_form',
            description: 'Fill and optionally submit web forms with field mappings',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                fieldMappings: { type: 'object', additionalProperties: { type: 'string' } },
                formData: { type: 'object', additionalProperties: { type: 'string' } },
                submit: { type: 'boolean' },
                submitSelector: { type: 'string' }
              },
              required: ['url', 'fieldMappings', 'formData']
            }
          },
          {
            name: 'click_element',
            description: 'Click an element on the page and optionally capture screenshots',
            inputSchema: {
              type: 'object',
              properties: {
                selector: { type: 'string' },
                url: { type: 'string', format: 'uri' },
                waitAfter: { type: 'number', minimum: 0, maximum: 30000 },
                screenshot: { type: 'boolean' }
              },
              required: ['selector']
            }
          },
          {
            name: 'take_screenshot',
            description: 'Capture screenshots of web pages or specific elements',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                fullPage: { type: 'boolean' },
                selector: { type: 'string' }
              }
            }
          },
          {
            name: 'generate_pdf',
            description: 'Generate PDF documents from web pages with configurable settings',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                pageSettings: {
                  type: 'object',
                  properties: {
                    format: { type: 'string', enum: ['A4', 'Letter', 'Legal'] },
                    landscape: { type: 'boolean' },
                    margin: {
                      type: 'object',
                      properties: {
                        top: { type: 'string' },
                        right: { type: 'string' },
                        bottom: { type: 'string' },
                        left: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          {
            name: 'run_script',
            description: 'Execute JavaScript code in the browser context',
            inputSchema: {
              type: 'object',
              properties: {
                script: { type: 'string' },
                url: { type: 'string', format: 'uri' },
                timeout: { type: 'number', minimum: 1000, maximum: 300000 }
              },
              required: ['script']
            }
          },
          {
            name: 'trace_session',
            description: 'Record and manage browser session traces for debugging',
            inputSchema: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['start', 'stop', 'get'] },
                traceId: { type: 'string' }
              },
              required: ['action']
            }
          }
        ],
        categories: ['browser-automation', 'web-scraping', 'testing'],
        transport: 'http',
        maxConcurrentBrowsers: 5
      },
      configuration: {
        endpoint: 'http://localhost:3100/sse',
        healthCheck: '/health',
        timeout: 60000,
        poolSize: 5,
        category: 'automation',  // Hub-level category for services(action: "discover") filtering
        // Operational settings (moved from permissions for semantic correctness)
        allowedDomains: ['*'],
        maxExecutionTime: 300000,
        maxScreenshotSize: 10485760
      },
      authType: 'NONE',
      credentials: {},
      permissions: {
        publicAccess: false  // 2026-05-26: locked down — SSRF/arbitrary-fetch + run_script abuse (public DEMO)
      }
    }
  });

  console.log('✅ Browser Automation Service registered:');
  console.log(`   ID: ${service.id}`);
  console.log(`   Name: ${service.name}`);
  console.log(`   Version: ${service.version}`);
  console.log(`   Status: ${service.status}`);
  console.log(`   Endpoint: http://localhost:3100/sse`);
  console.log(`   Tools: 7 browser automation tools`);
}

main()
  .catch((e) => {
    console.error('Error registering service:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
