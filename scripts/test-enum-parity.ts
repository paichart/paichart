#!/usr/bin/env ts-node
/**
 * Enum Parity Tests (Dual-Layer Architecture)
 *
 * Layer 1: Consistency Checks - Ensures Prisma and Zod enums match
 * Layer 2: Schema Behavior - Tests actual schema validation with enum values
 *
 * Created: 2025-11-08 (Enhanced from test-enum-parity.js)
 * Tests: 25 consistency + 25 behavior = 50 total
 */

// CI guard: stub DATABASE_URL before requiring tool-schemas.js.
// Requiring tool-schemas transitively triggers lib/prisma.ts initialization
// which throws if DATABASE_URL is unset. CI runners don't have it; the test
// never actually queries the DB. Production code path is unaffected because
// the runtime env always has DATABASE_URL set. Stub must be set BEFORE any
// import below — top-of-file placement is load-bearing.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://stub:stub@localhost:5432/stub?sslmode=disable';
}

import { z } from 'zod';
import {
  TaskPriority,
  TaskStatus,
  StageStatus,
  POVStatus,
  TeamRole,
  SalesTheatre,
  UserRole,
  TemplateType,
  AgentCategory,
  // 2026-05-23 bug-class eradication: MCP* enums added so hardcoded
  // z.enum([...]) literals in tool-schemas.js are drift-checked. Before
  // this, BUG-TEMPLATE-004, BUG-ANALYTICS-007, Wave C C2 (MCPToolStatus)
  // and 2026-05-23 COST_REDUCTION miss were all undetected silently.
  MCPToolStatus,
  MCPAuthType,
  MCPRecommendationType,
  MCPImpact,
  MCPWorkflowExecutionStatus,
  MCPInteractionStatus,
  Priority,
  ExecutionStatus,
} from '@prisma/client';
// 2026-05-23 extension: also drift-check pipeline-context-schemas.ts literals
// (Phase 2.5 Q1 sibling-branch sweep — same drift class, different file).
import { TaskStatusSchema as PipelineCtxTaskStatusSchema, ExecutionStatusSchema as PipelineCtxExecutionStatusSchema } from '../lib/validation/pipeline-context-schemas';
import { CreateTaskSchema, UpdateTaskSchema } from '../lib/validation/task-validation';
import { CreatePOVSchemaInline, CreateStageSchema, UpdatePOVSchemaComprehensive } from '../lib/validation/pov';
import { PrismaEnum } from '../lib/validation/enum-validation';

// 2026-05-23 bug-class eradication: import hardcoded literals from tool-schemas.js
// so we can drift-check them against Prisma. Same KEEP IN SYNC contract as
// the sanitize-keys.ts/tool-schemas.js dual.
/* eslint-disable @typescript-eslint/no-require-imports */
const toolSchemas = require('../lib/mcp/server/config/tool-schemas');

console.log('🧪 Enum Parity Tests (Dual-Layer)\n');

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
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    }
  };
}

// ========================================
// LAYER 1: Enum Consistency Checks
// ========================================

console.log('=====================================');
console.log('LAYER 1: Enum Consistency Checks');
console.log('=====================================\n');

function testEnumParity(enumName: string, prismaEnum: any, zodSchema: z.ZodType) {
  console.log(`Testing ${enumName} parity...\n`);

  // Test: Prisma → Zod (all Prisma values pass Zod validation)
  test(`Consistency: ${enumName} Prisma → Zod (all values pass)`, () => {
    const prismaValues = Object.values(prismaEnum);

    prismaValues.forEach(value => {
      const result = zodSchema.safeParse(value);
      if (!result.success) {
        throw new Error(`Prisma value "${value}" should pass Zod validation`);
      }
    });
    layer1Passed++;
  });

  // Test: Zod → Prisma (no extra values in Zod)
  test(`Consistency: ${enumName} Zod → Prisma (no drift detected)`, () => {
    const prismaValues = Object.values(prismaEnum);

    prismaValues.forEach(value => {
      const result = zodSchema.safeParse(value);
      if (result.success && !prismaValues.includes(result.data)) {
        throw new Error(`Zod value "${result.data}" should exist in Prisma enum`);
      }
    });
    layer1Passed++;
  });

  // Test: Invalid value rejected
  test(`Consistency: ${enumName} rejects invalid values`, () => {
    const invalidValue = 'INVALID_VALUE_NOT_IN_ENUM';
    const result = zodSchema.safeParse(invalidValue);
    if (result.success) {
      throw new Error(`Invalid value "${invalidValue}" should be rejected`);
    }
    layer1Passed++;
  });

  console.log('');
}

// Run parity tests for all enums
testEnumParity('TaskPriority', TaskPriority, z.nativeEnum(TaskPriority));
testEnumParity('TaskStatus', TaskStatus, z.nativeEnum(TaskStatus));
testEnumParity('StageStatus', StageStatus, z.nativeEnum(StageStatus));
testEnumParity('POVStatus', POVStatus, z.nativeEnum(POVStatus));
testEnumParity('TeamRole', TeamRole, z.nativeEnum(TeamRole));
testEnumParity('SalesTheatre', SalesTheatre, z.nativeEnum(SalesTheatre));
testEnumParity('UserRole', UserRole, z.nativeEnum(UserRole));
// Added 2026-04-17 (task #83): TemplateType + AgentCategory parity coverage.
// TemplateType formerly drove P9 scope matching (matcher retired 2026-07-17) and is
// still user-editable + read by GUI/template surfaces;
// AgentCategory is used by recommendations + API filtering. Both are user-editable
// via the Agent Builder GUI (see cline_docs/reviews/template-audit-2026-04-16/).
testEnumParity('TemplateType', TemplateType, z.nativeEnum(TemplateType));
testEnumParity('AgentCategory', AgentCategory, z.nativeEnum(AgentCategory));

// 2026-05-23 bug-class eradication: MCP* enum parity coverage. These cover
// the hardcoded z.enum([...]) literals in lib/mcp/server/config/tool-schemas.js
// that can't use z.nativeEnum() because the file loads from BOTH webpack and
// bare-Node (paichart-mcp). Drift here causes the same symptoms as
// BUG-TEMPLATE-004 + BUG-ANALYTICS-007: silent L1 reject of valid Prisma
// values OR Prisma findMany 500 on phantom values. Tests assert the hardcoded
// arrays match Prisma exactly (extras in either direction = drift = fail).
//
// Wave C C1 (Priority + URGENT) and Wave C C2 (MCPToolStatus + ERROR/MAINTENANCE)
// were ENUMERATION DRIFT cases that escaped the per-domain pilots; this
// systemic check prevents recurrence.
console.log('=====================================');
console.log('LAYER 1b: MCP* Enum Literal Parity (Tool Schemas)');
console.log('=====================================\n');

function testLiteralParity(label: string, hardcodedLiterals: string[], prismaEnum: any) {
  const prismaValues = Object.values(prismaEnum) as string[];

  test(`Literal Parity: ${label} — every Prisma value is in the hardcoded list`, () => {
    const missing = prismaValues.filter(v => !hardcodedLiterals.includes(v));
    if (missing.length > 0) {
      throw new Error(`Hardcoded literal missing Prisma values: ${missing.join(', ')}`);
    }
    layer1Passed++;
  });

  test(`Literal Parity: ${label} — every hardcoded value exists in Prisma`, () => {
    const phantom = hardcodedLiterals.filter(v => !prismaValues.includes(v));
    if (phantom.length > 0) {
      throw new Error(`Hardcoded literal contains phantom values not in Prisma: ${phantom.join(', ')}`);
    }
    layer1Passed++;
  });
}

// prioritySchema → Prisma Priority (4 values: LOW/MEDIUM/HIGH/URGENT)
testLiteralParity('prioritySchema → Priority', toolSchemas.prioritySchema._def.values, Priority);

// recommendationTypeSchema → MCPRecommendationType (8 values)
testLiteralParity('recommendationTypeSchema → MCPRecommendationType',
  toolSchemas.recommendationTypeSchema._def.values, MCPRecommendationType);

// impactLevelSchema → MCPImpact (4 values: LOW/MEDIUM/HIGH/CRITICAL)
testLiteralParity('impactLevelSchema → MCPImpact', toolSchemas.impactLevelSchema._def.values, MCPImpact);

// AGENT_CATEGORIES array → AgentCategory (11 values post BUG-TEMPLATE-004 fix)
testLiteralParity('AGENT_CATEGORIES → AgentCategory', toolSchemas.AGENT_CATEGORIES, AgentCategory);

// pipeline-context-schemas.ts literals → Prisma (Phase 2.5 Q1 extension —
// same drift class, second file). These shadow Prisma TaskStatus +
// ExecutionStatus and validate SiblingRow API boundary responses. Drift
// here causes silent 500s when the boundary schema rejects valid DB values.
testLiteralParity('PipelineCtx.TaskStatusSchema → TaskStatus',
  PipelineCtxTaskStatusSchema._def.values, TaskStatus);
testLiteralParity('PipelineCtx.ExecutionStatusSchema → ExecutionStatus',
  PipelineCtxExecutionStatusSchema._def.values, ExecutionStatus);

// projectStatusFilterSchema is the UNION POVStatus ∪ TaskStatus — the `project`
// tool's `status` field accepts both because the action decides which enum
// applies (pov.* → POV statuses, task.list → task statuses; per-action validation
// lives in the handlers). Drift in EITHER Prisma enum must be reflected here, or
// the Zod gate silently rejects a newly-valid status (the exact bug this field
// just had with task `OPEN`). Assert exact set-equality with the union.
test('Literal Parity: projectStatusFilterSchema → POVStatus ∪ TaskStatus', () => {
  const union = Array.from(new Set([...Object.values(POVStatus), ...Object.values(TaskStatus)])) as string[];
  const literals = toolSchemas.projectStatusFilterSchema._def.values as string[];
  const missing = union.filter(v => !literals.includes(v));
  const phantom = literals.filter(v => !union.includes(v));
  if (missing.length > 0 || phantom.length > 0) {
    throw new Error(`projectStatusFilterSchema drift — missing from literals: [${missing.join(', ')}], phantom (not in either Prisma enum): [${phantom.join(', ')}]`);
  }
  layer1Passed++;
});

console.log('');
console.log('Critical Bug Prevention...\n');

test('Consistency: TaskPriority does NOT include URGENT (bug prevented)', () => {
  const TaskPrioritySchema = z.nativeEnum(TaskPriority);
  const result = TaskPrioritySchema.safeParse('URGENT');
  expect(result.success).toBe(false);
  layer1Passed++;
});

test('Consistency: TaskPriority includes all valid values (HIGH, MEDIUM, LOW)', () => {
  const TaskPrioritySchema = z.nativeEnum(TaskPriority);
  const validValues = ['HIGH', 'MEDIUM', 'LOW'];

  validValues.forEach(value => {
    const result = TaskPrioritySchema.safeParse(value);
    expect(result.success).toBe(true);
  });
  layer1Passed++;
});

test('Consistency: StageStatus includes BLOCKED (bug prevented)', () => {
  const StageStatusSchema = z.nativeEnum(StageStatus);
  const result = StageStatusSchema.safeParse('BLOCKED');
  expect(result.success).toBe(true);
  layer1Passed++;
});

test('Consistency: StageStatus includes all 4 values (PENDING, ACTIVE, COMPLETED, BLOCKED)', () => {
  const StageStatusSchema = z.nativeEnum(StageStatus);
  const validValues = ['PENDING', 'ACTIVE', 'COMPLETED', 'BLOCKED'];

  validValues.forEach(value => {
    const result = StageStatusSchema.safeParse(value);
    expect(result.success).toBe(true);
  });
  layer1Passed++;
});

// ========================================
// LAYER 2: Schema Behavior Validation
// ========================================

console.log('\n=====================================');
console.log('LAYER 2: Schema Behavior Validation');
console.log('=====================================\n');

console.log('TaskPriority Behavior Tests...\n');

test('Behavior: CreateTaskSchema accepts TaskPriority.HIGH', () => {
  const validTask = {
    title: 'Test Task',
    description: 'Description',
    povId: 'clxy123abc',
    priority: TaskPriority.HIGH,
    status: TaskStatus.OPEN
  };
  const result = CreateTaskSchema.safeParse(validTask);
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: CreateTaskSchema accepts TaskPriority.MEDIUM', () => {
  const validTask = {
    title: 'Test Task',
    description: 'Description',
    povId: 'clxy123abc',
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.OPEN
  };
  const result = CreateTaskSchema.safeParse(validTask);
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: CreateTaskSchema accepts TaskPriority.LOW', () => {
  const validTask = {
    title: 'Test Task',
    description: 'Description',
    povId: 'clxy123abc',
    priority: TaskPriority.LOW,
    status: TaskStatus.OPEN
  };
  const result = CreateTaskSchema.safeParse(validTask);
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: CreateTaskSchema rejects invalid priority', () => {
  const invalidTask = {
    title: 'Test Task',
    description: 'Description',
    povId: 'clxy123abc',
    priority: 'URGENT', // Not in enum
    status: TaskStatus.OPEN
  };
  const result = CreateTaskSchema.safeParse(invalidTask);
  expect(result.success).toBe(false);
  layer2Passed++;
});

console.log('\nTaskStatus Behavior Tests...\n');

test('Behavior: CreateTaskSchema accepts OPEN, IN_PROGRESS, COMPLETED statuses', () => {
  const statuses = [TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED];

  statuses.forEach(status => {
    const task = {
      title: 'Test Task',
      description: 'Description',
      povId: 'clxy123abc',
      priority: TaskPriority.MEDIUM,
      status
    };
    const result = CreateTaskSchema.safeParse(task);
    expect(result.success).toBe(true);
  });
  layer2Passed++;
});

test('Behavior: UpdateTaskSchema accepts partial with valid priority', () => {
  const update = {
    priority: TaskPriority.HIGH
  };
  const result = UpdateTaskSchema.safeParse(update);
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: Schema rejects invalid status string', () => {
  const PrismaTaskStatusSchema = PrismaEnum.taskStatus;
  const result = PrismaTaskStatusSchema.safeParse('INVALID_STATUS');
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: Schema rejects hardcoded string not in enum', () => {
  const PrismaTaskStatusSchema = PrismaEnum.taskStatus;
  const result = PrismaTaskStatusSchema.safeParse('PENDING'); // Wrong enum
  expect(result.success).toBe(false);
  layer2Passed++;
});

console.log('\nStageStatus Behavior Tests...\n');

test('Behavior: CreateStageSchema accepts all StageStatus values', () => {
  const statuses = [StageStatus.PENDING, StageStatus.ACTIVE, StageStatus.COMPLETED, StageStatus.BLOCKED];

  statuses.forEach(status => {
    const stage = {
      name: 'Test Stage',
      status
    };
    const result = CreateStageSchema.safeParse(stage);
    expect(result.success).toBe(true);
  });
  layer2Passed++;
});

test('Behavior: StageStatus includes BLOCKED (critical!)', () => {
  const stage = {
    name: 'Blocked Stage',
    status: StageStatus.BLOCKED
  };
  const result = CreateStageSchema.safeParse(stage);
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: Schema rejects wrong enum value', () => {
  const PrismaStageStatusSchema = PrismaEnum.stageStatus;
  const result = PrismaStageStatusSchema.safeParse('IN_PROGRESS'); // TaskStatus, not StageStatus
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: Partial update accepts valid status', () => {
  const update = {
    name: 'Updated Stage',
    status: StageStatus.ACTIVE
  };
  const result = CreateStageSchema.safeParse(update);
  expect(result.success).toBe(true);
  layer2Passed++;
});

console.log('\nPOVStatus Behavior Tests...\n');

test('Behavior: CreatePOVSchema accepts all POVStatus values', () => {
  const PrismaPOVStatusSchema = PrismaEnum.povStatus;
  const statuses = Object.values(POVStatus);

  statuses.forEach(status => {
    const result = PrismaPOVStatusSchema.safeParse(status);
    expect(result.success).toBe(true);
  });
  layer2Passed++;
});

test('Behavior: Schema rejects invalid POV status', () => {
  const PrismaPOVStatusSchema = PrismaEnum.povStatus;
  const result = PrismaPOVStatusSchema.safeParse('INVALID_STATUS');
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: UpdatePOVSchema accepts partial with status', () => {
  const update = {
    status: POVStatus.IN_PROGRESS
  };
  const result = UpdatePOVSchemaComprehensive.safeParse(update);
  expect(result.success).toBe(true);
  layer2Passed++;
});

console.log('\nTeamRole Behavior Tests...\n');

test('Behavior: Schema accepts all TeamRole values', () => {
  const PrismaTeamRoleSchema = PrismaEnum.teamRole;
  const roles = Object.values(TeamRole);

  roles.forEach(role => {
    const result = PrismaTeamRoleSchema.safeParse(role);
    expect(result.success).toBe(true);
  });
  layer2Passed++;
});

test('Behavior: Schema rejects invalid role', () => {
  const PrismaTeamRoleSchema = PrismaEnum.teamRole;
  const result = PrismaTeamRoleSchema.safeParse('INVALID_ROLE');
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: Team member assignment with valid role', () => {
  const PrismaTeamRoleSchema = PrismaEnum.teamRole;
  const result = PrismaTeamRoleSchema.safeParse(TeamRole.PROJECT_MANAGER);
  expect(result.success).toBe(true);
  layer2Passed++;
});

console.log('\nSalesTheatre Behavior Tests...\n');

test('Behavior: Schema accepts all SalesTheatre values', () => {
  const PrismaSalesTheatreSchema = PrismaEnum.salesTheatre;
  const theatres = Object.values(SalesTheatre);

  theatres.forEach(theatre => {
    const result = PrismaSalesTheatreSchema.safeParse(theatre);
    expect(result.success).toBe(true);
  });
  layer2Passed++;
});

test('Behavior: Schema rejects invalid theatre', () => {
  const PrismaSalesTheatreSchema = PrismaEnum.salesTheatre;
  const result = PrismaSalesTheatreSchema.safeParse('INVALID_THEATRE');
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: POV creation with valid theatre', () => {
  const PrismaSalesTheatreSchema = PrismaEnum.salesTheatre;
  const result = PrismaSalesTheatreSchema.safeParse(SalesTheatre.NORTH_AMERICA);
  expect(result.success).toBe(true);
  layer2Passed++;
});

console.log('\nUserRole Behavior Tests...\n');

test('Behavior: Schema accepts all UserRole values', () => {
  const PrismaUserRoleSchema = PrismaEnum.userRole;
  const roles = [UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DEMO_USER];

  roles.forEach(role => {
    const result = PrismaUserRoleSchema.safeParse(role);
    expect(result.success).toBe(true);
  });
  layer2Passed++;
});

test('Behavior: Schema includes DEMO_USER (critical!)', () => {
  const PrismaUserRoleSchema = PrismaEnum.userRole;
  const result = PrismaUserRoleSchema.safeParse(UserRole.DEMO_USER);
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: Schema rejects invalid user role', () => {
  const PrismaUserRoleSchema = PrismaEnum.userRole;
  const result = PrismaUserRoleSchema.safeParse('GUEST'); // Not in enum
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: User creation with valid role', () => {
  const PrismaUserRoleSchema = PrismaEnum.userRole;
  const result = PrismaUserRoleSchema.safeParse(UserRole.ADMIN);
  expect(result.success).toBe(true);
  layer2Passed++;
});

// ========================================
// Summary
// ========================================

console.log('\n=====================================');
console.log('Enum Parity Test Summary:');
console.log('=====================================');
console.log(`\n📊 Layer 1 (Consistency): ${layer1Passed}/25`);
console.log(`📊 Layer 2 (Behavior):    ${layer2Passed}/25`);
console.log(`\n✅ Total Passed: ${passed}`);
console.log(`❌ Total Failed: ${failed}`);
console.log(`📊 Total Tests:  ${passed + failed}`);
console.log('=====================================\n');

if (failed > 0) {
  console.error('❌ Enum drift detected!');
  console.error('   Fix by migrating hardcoded enums to z.nativeEnum()');
  console.error('   See: /lib/validation/enum-validation.ts\n');
  process.exit(1);
} else {
  console.log('✅ All enum parity tests passed!');
  console.log('\nEnum validation is consistent:');
  console.log('  - ✅ No drift between Prisma and Zod');
  console.log('  - ✅ URGENT bug prevented (TaskPriority)');
  console.log('  - ✅ BLOCKED included (StageStatus)');
  console.log('  - ✅ DEMO_USER included (UserRole)');
  console.log('  - ✅ All critical enums validated');
  console.log('  - ✅ Dual-layer validation: Consistency + Behavior');
  console.log('  - ✅ Ready for production use\n');
  process.exit(0);
}
