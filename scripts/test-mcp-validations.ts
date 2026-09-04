import {
  ListResourcesQuerySchema,
  POVContextSchema,
  ReadResourceQuerySchema
} from '../lib/validation/mcp-resources-validation';
import {
  ListAutomationsQuerySchema,
  AutomationMetricsQuerySchema,
  AIRecommendationsQuerySchema
} from '../lib/validation/mcp-automations-validation';
import {
  ListToolsQuerySchema,
  InvokeToolSchema
} from '../lib/validation/mcp-tools-validation';

console.log('🧪 Testing MCP Validation Schemas...\n');

// Test ListResourcesQuerySchema
try {
  const validResource = ListResourcesQuerySchema.parse({
    serverName: 'test',
    limit: 50,
    sortBy: 'name',
    sortOrder: 'asc'
  });
  console.log('✅ ListResourcesQuerySchema valid:', validResource);
} catch (e) {
  console.error('❌ ListResourcesQuerySchema failed:', e);
  process.exit(1);
}

// Test POVContextSchema (v4 new feature)
try {
  const validPOVContext = POVContextSchema.parse({
    // 2026-07-28: was a UUID (123e4567-e89b-12d3-a456-426614174000). POVContextSchema
    // requires a CUID — the project-wide convention enforced by `validate:id-format`
    // ("CUID enforcement, no UUID"). The fixture predates that migration, so the
    // SCHEMA is right and this test had been red ever since. Not a product defect.
    id: 'cmh86xj81002tyxmi5k2qv1ls',
    ownerId: 'user-123',
    teamMemberIds: ['user-456', 'user-789'],
    isDemo: false
  });
  console.log('✅ POVContextSchema valid:', validPOVContext);
} catch (e) {
  console.error('❌ POVContextSchema failed:', e);
  process.exit(1);
}

// Test ReadResourceQuerySchema
try {
  const validRead = ReadResourceQuerySchema.parse({
    serverName: 'test',
    includeContent: true
  });
  console.log('✅ ReadResourceQuerySchema valid:', validRead);
} catch (e) {
  console.error('❌ ReadResourceQuerySchema failed:', e);
  process.exit(1);
}

// Test ListAutomationsQuerySchema
try {
  const validAutomations = ListAutomationsQuerySchema.parse({
    status: 'RUNNING',
    limit: 10
  });
  console.log('✅ ListAutomationsQuerySchema valid:', validAutomations);
} catch (e) {
  console.error('❌ ListAutomationsQuerySchema failed:', e);
  process.exit(1);
}

// Test AutomationMetricsQuerySchema
try {
  const validMetrics = AutomationMetricsQuerySchema.parse({
    // 2026-07-28: same UUID-vs-CUID rot as the POVContextSchema fixture above.
    // The script process.exit(1)s at the first failure, so this second site only
    // surfaced once that one was fixed — worth knowing when triaging such scripts.
    taskId: 'cmh86xj81002tyxmi5k2qv1ls',
    startDate: new Date('2025-01-01'),
  });
  console.log('✅ AutomationMetricsQuerySchema valid:', validMetrics);
} catch (e) {
  console.error('❌ AutomationMetricsQuerySchema failed:', e);
  process.exit(1);
}

// Test AIRecommendationsQuerySchema
try {
  const validRecommendations = AIRecommendationsQuerySchema.parse({
    status: 'PENDING',
    type: 'OPTIMIZATION',
    priority: 'HIGH',
    confidence: 'high'
  });
  console.log('✅ AIRecommendationsQuerySchema valid:', validRecommendations);
} catch (e) {
  console.error('❌ AIRecommendationsQuerySchema failed:', e);
  process.exit(1);
}

// Test ListToolsQuerySchema
try {
  const validTools = ListToolsQuerySchema.parse({
    serverName: 'test',
    category: 'utility',
    limit: 20
  });
  console.log('✅ ListToolsQuerySchema valid:', validTools);
} catch (e) {
  console.error('❌ ListToolsQuerySchema failed:', e);
  process.exit(1);
}

// Test InvokeToolSchema
try {
  const validInvoke = InvokeToolSchema.parse({
    toolName: 'test-tool',
    serverName: 'test-server',
    timeout: 5000
  });
  console.log('✅ InvokeToolSchema valid:', validInvoke);
} catch (e) {
  console.error('❌ InvokeToolSchema failed:', e);
  process.exit(1);
}

// Test invalid data (should throw ZodError)
console.log('\n🧪 Testing invalid data handling...\n');

try {
  ListResourcesQuerySchema.parse({ limit: 'invalid' });
  console.error('❌ Should have thrown ZodError for invalid limit');
  process.exit(1);
} catch (e) {
  console.log('✅ ListResourcesQuerySchema invalid caught correctly');
}

try {
  ListToolsQuerySchema.parse({ limit: 999 }); // Max is 200
  console.error('❌ Should have thrown ZodError for limit > 200');
  process.exit(1);
} catch (e) {
  console.log('✅ ListToolsQuerySchema max limit validation works');
}

try {
  ListAutomationsQuerySchema.parse({ status: 'INVALID_STATUS' });
  console.error('❌ Should have thrown ZodError for invalid status');
  process.exit(1);
} catch (e) {
  console.log('✅ AutomationStatusSchema enum validation works');
}

try {
  InvokeToolSchema.parse({ toolName: 'test', serverName: 'test', timeout: 500 }); // Min is 1000
  console.error('❌ Should have thrown ZodError for timeout < 1000');
  process.exit(1);
} catch (e) {
  console.log('✅ InvokeToolSchema timeout validation works');
}

console.log('\n✅ All validation schemas working correctly!');
console.log('✅ v4 POV context schema validated successfully!');
console.log('✅ All error handling tests passed!');
