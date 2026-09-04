#!/usr/bin/env ts-node
/**
 * MCPServiceOrchestrationHandler Tests (Dual-Layer Architecture)
 *
 * Layer 1: Pattern Validation - Checks code structure and imports
 * Layer 2: Behavior Validation - Tests actual handler behavior
 *
 * Created: 2026-01-05
 * Tests: 15 pattern + 20 behavior = 35 total
 */

import * as fs from 'fs';
import * as path from 'path';

// Import schemas for behavior testing
import {
  MCPOrchestrationParamsSchema,
  WorkflowStepSchema,
  OrchestrationConfigSchema,
  WORKFLOW_TIMEOUT_BOUNDS,
} from '../lib/services/workflow/types/orchestration-params';

import { MCPExecutionMode, UserRole } from '@prisma/client';

console.log('🧪 MCPServiceOrchestrationHandler Tests (Dual-Layer)\n');

let passed = 0;
let failed = 0;
let layer1Passed = 0;
let layer2Passed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    }
    failed++;
  }
}

function expect(value: any) {
  return {
    toBe(expected: any) {
      if (value !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toContain(expected: any) {
      if (typeof value === 'string' && !value.includes(expected)) {
        throw new Error(`Expected string to contain "${expected}"`);
      }
      if (Array.isArray(value) && !value.includes(expected)) {
        throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
      }
    },
    toBeDefined() {
      if (value === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
    toBeGreaterThan(expected: number) {
      if (value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`);
      }
    },
    toHaveLength(expected: number) {
      if (!Array.isArray(value) || value.length !== expected) {
        throw new Error(`Expected array length ${expected}, got ${Array.isArray(value) ? value.length : 'not an array'}`);
      }
    },
  };
}

// ========================================
// LAYER 1: Pattern Validation
// ========================================

console.log('=====================================');
console.log('LAYER 1: Code Pattern Validation');
console.log('=====================================\n');

const handlerPath = path.join(__dirname, '../lib/services/workflow/handlers/mcpOrchestrationHandler.ts');
const handlerCode = fs.readFileSync(handlerPath, 'utf-8');

const contextPath = path.join(__dirname, '../lib/services/workflow/types/orchestration-context.ts');
const contextCode = fs.readFileSync(contextPath, 'utf-8');

const trackerPath = path.join(__dirname, '../lib/services/workflow/tracking/orchestration-tracker.ts');
const trackerCode = fs.readFileSync(trackerPath, 'utf-8');

const callerPath = path.join(__dirname, '../lib/services/workflow/integrations/service-caller.ts');
const callerCode = fs.readFileSync(callerPath, 'utf-8');

const auditPath = path.join(__dirname, '../lib/services/workflow/security/orchestration-audit.ts');
const auditCode = fs.readFileSync(auditPath, 'utf-8');

// 2026-07-28: execution-mode dispatch and variable resolution were extracted from
// the handler into the shared engine — the handler now delegates via `this.engine`.
// The greps below follow them rather than asserting against the handler, which no
// longer owns that logic.
const enginePath = path.join(__dirname, '../lib/services/workflow/core/orchestration-engine.js');
const engineCode = fs.readFileSync(enginePath, 'utf-8');

// AD_HOC is stamped on the MCP path, not by the GUI-only tracker above.
const mcpWorkflowPath = path.join(__dirname, '../lib/mcp/server/tools/hub/workflow-tools-handler.js');
const mcpWorkflowCode = fs.readFileSync(mcpWorkflowPath, 'utf-8');

// Handler Pattern Tests
test('Pattern: Handler imports validateMCPPOVAccess (not validatePOVAccess)', () => {
  expect(handlerCode).toContain('validateMCPPOVAccess');
  layer1Passed++;
});

test('Pattern: Handler imports MCPOrchestrationParamsSchema', () => {
  expect(handlerCode).toContain('MCPOrchestrationParamsSchema');
  layer1Passed++;
});

test('Pattern: Handler implements WorkflowHandler interface', () => {
  expect(handlerCode).toContain('implements WorkflowHandler');
  layer1Passed++;
});

test('Pattern: Handler has execute method with userId parameter', () => {
  expect(handlerCode).toContain('execute(config: WorkflowConfig, userId: string)');
  layer1Passed++;
});

test('Pattern: Engine supports three execution modes', () => {
  // 2026-07-28: was asserted against handlerCode. Mode dispatch moved to the
  // shared engine; the handler delegates through `this.engine.execute(...)`.
  expect(engineCode).toContain("case 'parallel':");
  expect(engineCode).toContain("case 'conditional':");
  expect(engineCode).toContain('executeSequential'); // default case
  // The handler must still route to the engine rather than reimplementing dispatch.
  expect(handlerCode).toContain('this.engine');
  layer1Passed++;
});

test('Pattern: Engine has variable resolution with {{step.N.output}}', () => {
  // 2026-07-28: moved with mode dispatch (see above). Behaviour is covered in
  // depth by scripts/test-variable-resolution.ts.
  expect(engineCode).toContain('{{step');
  expect(engineCode).toContain('resolveVariables');
  layer1Passed++;
});

// Context Pattern Tests
test('Pattern: Context uses UserRole enum (not Role model)', () => {
  expect(contextCode).toContain("import { UserRole } from '@prisma/client'");
  expect(contextCode).toContain('role: UserRole');
  layer1Passed++;
});

test('Pattern: Context has buildOrchestrationContext function', () => {
  expect(contextCode).toContain('export async function buildOrchestrationContext');
  layer1Passed++;
});

// Tracker Pattern Tests
test('Pattern: Tracker imports MCPExecutionMode from Prisma', () => {
  expect(trackerCode).toContain("import { MCPExecutionMode } from '@prisma/client'");
  layer1Passed++;
});

test('Pattern: GUI tracker stamps PREDEFINED, MCP path stamps AD_HOC', () => {
  // 2026-07-28: previously asserted AD_HOC on the tracker. Wrong file — this
  // tracker is GUI-only (its own comment says so) and correctly stamps
  // PREDEFINED. The invariant worth guarding is that the two origins stay
  // DISTINGUISHABLE, so assert both halves on the files that own them.
  expect(trackerCode).toContain('MCPExecutionMode.PREDEFINED');
  // This file's minimal `expect` has no `.not`, so assert the boolean directly.
  expect(trackerCode.includes('MCPExecutionMode.AD_HOC')).toBe(false);
  expect(mcpWorkflowCode).toContain("executionMode: 'AD_HOC'");
  layer1Passed++;
});

test('Pattern: Tracker has userId null guard', () => {
  expect(trackerCode).toContain('context.user?.id');
  expect(trackerCode).toContain('user ID required');
  layer1Passed++;
});

// Service Caller Pattern Tests
test('Pattern: Service caller uses ServiceConnectionPool', () => {
  expect(callerCode).toContain('ServiceConnectionPool');
  layer1Passed++;
});

test('Pattern: Service caller has MAX_CONCURRENT limit', () => {
  expect(callerCode).toContain('MAX_CONCURRENT');
  layer1Passed++;
});

test('Pattern: Service caller resolves endpoint via MCPTool table', () => {
  expect(callerCode).toContain('prisma.mCPTool.findFirst');
  layer1Passed++;
});

// Audit Pattern Tests
test('Pattern: Audit uses trackActivity with positional args', () => {
  expect(auditCode).toContain("import { trackActivity } from '@/lib/auth/audit'");
  expect(auditCode).toContain('await trackActivity(');
  layer1Passed++;
});

// ========================================
// LAYER 2: Behavior Validation
// ========================================

console.log('\n=====================================');
console.log('LAYER 2: Schema Behavior Validation');
console.log('=====================================\n');

// WorkflowStepSchema Tests
test('Behavior: WorkflowStepSchema accepts valid step', () => {
  const validStep = {
    service: 'sentry',
    tool: 'list_issues',
    arguments: { limit: 5 },
  };
  const result = WorkflowStepSchema.safeParse(validStep);
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: WorkflowStepSchema requires service field', () => {
  const invalidStep = {
    tool: 'list_issues',
    arguments: {},
  };
  const result = WorkflowStepSchema.safeParse(invalidStep);
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: WorkflowStepSchema requires tool field', () => {
  const invalidStep = {
    service: 'sentry',
    arguments: {},
  };
  const result = WorkflowStepSchema.safeParse(invalidStep);
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: WorkflowStepSchema accepts optional dependsOn', () => {
  const stepWithDeps = {
    service: 'slack',
    tool: 'send_message',
    arguments: { channel: '#alerts' },
    dependsOn: [0, 1],
  };
  const result = WorkflowStepSchema.safeParse(stepWithDeps);
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: WorkflowStepSchema validates timeout range (1s-60s)', () => {
  const validTimeout = {
    service: 'api',
    tool: 'call',
    arguments: {},
    timeout: 30000,
  };
  const result = WorkflowStepSchema.safeParse(validTimeout);
  expect(result.success).toBe(true);

  const invalidTimeout = {
    service: 'api',
    tool: 'call',
    arguments: {},
    timeout: 100, // Less than 1000ms
  };
  const result2 = WorkflowStepSchema.safeParse(invalidTimeout);
  expect(result2.success).toBe(false);
  layer2Passed++;
});

// MCPOrchestrationParamsSchema Tests
test('Behavior: MCPOrchestrationParamsSchema requires at least 1 step', () => {
  const noSteps = {
    steps: [],
    executionMode: 'sequential',
  };
  const result = MCPOrchestrationParamsSchema.safeParse(noSteps);
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: MCPOrchestrationParamsSchema allows max 20 steps', () => {
  const steps = Array.from({ length: 20 }, (_, i) => ({
    service: `service-${i}`,
    tool: 'action',
    arguments: {},
  }));
  const validParams = { steps, executionMode: 'parallel' };
  const result = MCPOrchestrationParamsSchema.safeParse(validParams);
  expect(result.success).toBe(true);

  const tooManySteps = Array.from({ length: 21 }, (_, i) => ({
    service: `service-${i}`,
    tool: 'action',
    arguments: {},
  }));
  const invalidParams = { steps: tooManySteps };
  const result2 = MCPOrchestrationParamsSchema.safeParse(invalidParams);
  expect(result2.success).toBe(false);
  layer2Passed++;
});

test('Behavior: MCPOrchestrationParamsSchema defaults executionMode to sequential', () => {
  const params = {
    steps: [{ service: 'test', tool: 'action', arguments: {} }],
  };
  const result = MCPOrchestrationParamsSchema.safeParse(params);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.executionMode).toBe('sequential');
  }
  layer2Passed++;
});

test('Behavior: MCPOrchestrationParamsSchema defaults failureStrategy to stop', () => {
  const params = {
    steps: [{ service: 'test', tool: 'action', arguments: {} }],
  };
  const result = MCPOrchestrationParamsSchema.safeParse(params);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.failureStrategy).toBe('stop');
  }
  layer2Passed++;
});

test('Behavior: MCPOrchestrationParamsSchema defaults timeout to 60s', () => {
  const params = {
    steps: [{ service: 'test', tool: 'action', arguments: {} }],
  };
  const result = MCPOrchestrationParamsSchema.safeParse(params);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.timeout).toBe(60000);
  }
  layer2Passed++;
});

test('Behavior: MCPOrchestrationParamsSchema enforces the workflow timeout bound', () => {
  // 2026-07-28: was hardcoded to "5min" and asserted 400000 must be REJECTED. The
  // bound was raised to WORKFLOW_TIMEOUT_BOUNDS.max (600000 = 10min) by 2ac51ec1
  // ("Phase 4 — schema alignment via shared constants"), so 400000 became valid
  // and this went red. The bound was never missing; the expectation was stale.
  //
  // Now DERIVED from the shared constant, so a future bound change cannot rot it.
  // test:workflow-schema-alignment separately asserts this constant matches the
  // engine-side definition, so the pair is anchored at both ends.
  const base = { steps: [{ service: 'test', tool: 'action', arguments: {} }] };

  const overMax = MCPOrchestrationParamsSchema.safeParse({
    ...base, timeout: WORKFLOW_TIMEOUT_BOUNDS.max + 1,
  });
  expect(overMax.success).toBe(false);

  const underMin = MCPOrchestrationParamsSchema.safeParse({
    ...base, timeout: WORKFLOW_TIMEOUT_BOUNDS.min - 1,
  });
  expect(underMin.success).toBe(false);

  // Negative half: the bound must ACCEPT a legal value, or the assertions above
  // would also pass against a schema that rejects every timeout.
  const atMax = MCPOrchestrationParamsSchema.safeParse({
    ...base, timeout: WORKFLOW_TIMEOUT_BOUNDS.max,
  });
  expect(atMax.success).toBe(true);

  layer2Passed++;
});

test('Behavior: MCPOrchestrationParamsSchema accepts all execution modes', () => {
  const modes = ['sequential', 'parallel', 'conditional'] as const;
  for (const mode of modes) {
    const params = {
      steps: [{ service: 'test', tool: 'action', arguments: {} }],
      executionMode: mode,
    };
    const result = MCPOrchestrationParamsSchema.safeParse(params);
    expect(result.success).toBe(true);
  }
  layer2Passed++;
});

test('Behavior: MCPOrchestrationParamsSchema rejects invalid execution mode', () => {
  const params = {
    steps: [{ service: 'test', tool: 'action', arguments: {} }],
    executionMode: 'invalid_mode',
  };
  const result = MCPOrchestrationParamsSchema.safeParse(params);
  expect(result.success).toBe(false);
  layer2Passed++;
});

// OrchestrationConfigSchema Tests
test('Behavior: OrchestrationConfigSchema accepts mcp_service_orchestration', () => {
  const config = {
    workflowType: 'mcp_service_orchestration',
    parameters: {
      steps: [{ service: 'test', tool: 'action', arguments: {} }],
    },
  };
  const result = OrchestrationConfigSchema.safeParse(config);
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: OrchestrationConfigSchema accepts parallel_service_execution', () => {
  const config = {
    workflowType: 'parallel_service_execution',
    parameters: {
      steps: [{ service: 'test', tool: 'action', arguments: {} }],
    },
  };
  const result = OrchestrationConfigSchema.safeParse(config);
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: OrchestrationConfigSchema accepts conditional_workflow', () => {
  const config = {
    workflowType: 'conditional_workflow',
    parameters: {
      steps: [{ service: 'test', tool: 'action', arguments: {} }],
    },
  };
  const result = OrchestrationConfigSchema.safeParse(config);
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: OrchestrationConfigSchema rejects invalid workflow type', () => {
  const config = {
    workflowType: 'browser_automation', // Not an orchestration type
    parameters: {
      steps: [{ service: 'test', tool: 'action', arguments: {} }],
    },
  };
  const result = OrchestrationConfigSchema.safeParse(config);
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: OrchestrationConfigSchema accepts optional povId as CUID', () => {
  const config = {
    workflowType: 'mcp_service_orchestration',
    povId: 'clxyz123abc456def789',
    parameters: {
      steps: [{ service: 'test', tool: 'action', arguments: {} }],
    },
  };
  const result = OrchestrationConfigSchema.safeParse(config);
  expect(result.success).toBe(true);
  layer2Passed++;
});

// MCPExecutionMode Enum Tests
test('Behavior: MCPExecutionMode has AD_HOC value', () => {
  expect(MCPExecutionMode.AD_HOC).toBe('AD_HOC');
  layer2Passed++;
});

test('Behavior: MCPExecutionMode has PREDEFINED value', () => {
  expect(MCPExecutionMode.PREDEFINED).toBe('PREDEFINED');
  layer2Passed++;
});

// ========================================
// Summary
// ========================================

console.log('\n=====================================');
console.log('MCPServiceOrchestrationHandler Summary:');
console.log('=====================================');
console.log(`\n📊 Layer 1 (Pattern): ${layer1Passed}/15`);
console.log(`📊 Layer 2 (Behavior): ${layer2Passed}/20`);
console.log(`\n✅ Total Passed: ${passed}`);
console.log(`❌ Total Failed: ${failed}`);
console.log(`📊 Total Tests:  ${passed + failed}`);
console.log('=====================================\n');

if (failed > 0) {
  console.error('❌ Some tests failed!\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
  console.log('Handler validation complete:');
  console.log('  - ✅ Code patterns follow specialist recommendations');
  console.log('  - ✅ Schemas validate orchestration parameters correctly');
  console.log('  - ✅ MCPExecutionMode enum integrated properly');
  console.log('  - ✅ Ready for production use');
  process.exit(0);
}
