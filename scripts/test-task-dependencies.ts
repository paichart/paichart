#!/usr/bin/env ts-node
/**
 * Task Dependencies Tests (Dual-Layer Architecture)
 *
 * Layer 1: Pattern Validation — verify the cycle-detection selector layer
 *          is the single canonical source (no duplicates).
 * Layer 2: Schema Behavior — verify depIds, dependsOn, and
 *          checkForDependencyCycles produce correct results for edge cases.
 *
 * Created: 2026-05-14
 * Source: types-system-specialist flagged the "cycle-detection invariant
 *         lives in two layers" risk on 2026-05-02. This suite locks in
 *         the editor's selector layer; the MCP path uses lib/utils/graph.ts
 *         checkDependencyCycle which has its own production validation
 *         (sec-ops 82% + api-efficiency 84% reviewed).
 *
 * Tests: 5 pattern + 15 behavior = 20 total
 */

import * as fs from 'fs';
import * as path from 'path';
import { TaskStatus, TaskType, TaskPriority } from '@prisma/client';
import {
  depIds,
  dependsOn,
  checkForDependencyCycles,
} from '../components/poveditor/pov/context/utils/taskDependencies';
import type { Task } from '../components/poveditor/pov/context/types/EntityTypes';

console.log('🧪 Task Dependencies (Dual-Layer)\n');

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
    if (error instanceof Error) console.error(`   Error: ${error.message}`);
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
    toEqual(expected: any) {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
  };
}

// Test fixture: build a minimal Task with optional dependency edges
function buildTask(id: string, dependsOnIds: string[] = []): Task {
  return {
    id,
    title: `Task ${id}`,
    status: TaskStatus.OPEN,
    type: TaskType.ACTION,
    priority: TaskPriority.MEDIUM,
    order: 0,
    dependencies: dependsOnIds.map((depId) => ({
      id: `${id}->${depId}`,
      taskId: id,
      dependsOnId: depId,
      dependsOn: {
        id: depId,
        title: `Task ${depId}`,
        status: TaskStatus.OPEN,
        stageId: 'stage1',
      },
    })),
  };
}

// Suppress console.warn during cycle-detection stale-dep tests
const originalWarn = console.warn;
function suppressWarn<T>(fn: () => T): T {
  console.warn = () => undefined;
  try {
    return fn();
  } finally {
    console.warn = originalWarn;
  }
}

// ============================================================
// LAYER 1: Pattern Validation (cycle-detection is canonical)
// ============================================================

console.log('=====================================');
console.log('LAYER 1: Pattern Validation');
console.log('=====================================\n');

const TASK_DEPS_PATH = path.resolve(
  __dirname,
  '../components/poveditor/pov/context/utils/taskDependencies.ts'
);
const VALIDATION_PATH = path.resolve(
  __dirname,
  '../components/poveditor/pov/context/utils/validation.ts'
);
const CONTEXT_PATH = path.resolve(
  __dirname,
  '../components/poveditor/pov/context/PovEditorContext.tsx'
);
const GRAPH_UTIL_PATH = path.resolve(__dirname, '../lib/utils/graph.ts');

test('Pattern: taskDependencies.ts exports the three selectors', () => {
  const content = fs.readFileSync(TASK_DEPS_PATH, 'utf-8');
  expect(content.includes('export const depIds')).toBe(true);
  expect(content.includes('export const dependsOn')).toBe(true);
  expect(content.includes('export function checkForDependencyCycles')).toBe(true);
  layer1Passed++;
});

test('F3 concurrency mechanism: the tasks-row write that serialises dependency rewrites is UNCONDITIONAL', () => {
  // Concurrent dependency rewrites of the SAME task are serialised NOT by the dependency rows —
  // two writers starting from an empty/disjoint set contend on nothing there, and RepeatableRead
  // would let both commit, leaving the UNION of their intents. They are serialised because every
  // task.update writes the parent `tasks` row inside the same tx, so the loser takes 40001 and
  // withSerializationRetry replays it.
  //
  // This pin exists because that safety is INVISIBLE at the rewrite site: an optimisation that
  // skips the row write "when only dependencyIds changed" would break nothing observable and
  // silently reopen the hazard. If this test fails, either take an explicit
  // `SELECT ... FOR UPDATE` on the task row, or restore the unconditional write.
  const src = fs.readFileSync(
    path.resolve(__dirname, '../lib/mcp/tasks/action/handlers/task/task-update-handler.ts'), 'utf-8');

  // 1. the tx is retry-wrapped (the 40001 replay is half the mechanism)
  expect(/withSerializationRetry\(\s*\(\)\s*=>\s*prisma\.\$transaction/.test(src)).toBe(true);
  // 2. at RepeatableRead (snapshot isolation is what makes the row conflict raise 40001)
  expect(src.includes('Prisma.TransactionIsolationLevel.RepeatableRead')).toBe(true);
  // 3. the parent-row write is NOT behind a dependency/field conditional — strip comments first,
  //    then assert the update sits at tx-body indentation with no `if (` on its own line above it.
  const code = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const m = code.match(/\n(\s*)let task = await tx\.task\.update\(\{/);
  expect(m !== null).toBe(true);
  const guarded = /if \([^)]*\)\s*\{[^{}]*\n\s*let task = await tx\.task\.update\(\{/.test(code);
  expect(guarded).toBe(false);
  layer1Passed++;
});

test('Pattern: validation.ts imports checkForDependencyCycles (no duplicate)', () => {
  const content = fs.readFileSync(VALIDATION_PATH, 'utf-8');
  // Must import from taskDependencies and NOT redefine
  expect(content.includes("from './taskDependencies'")).toBe(true);
  expect(content.includes('function checkForDependencyCycles')).toBe(false);
  layer1Passed++;
});

test('Pattern: PovEditorContext.tsx imports selectors (no duplicate)', () => {
  const content = fs.readFileSync(CONTEXT_PATH, 'utf-8');
  expect(content.includes("from './utils/taskDependencies'")).toBe(true);
  expect(content.includes('function checkForDependencyCycles')).toBe(false);
  layer1Passed++;
});

test('Pattern: lib/utils/graph.ts:checkDependencyCycle exists (MCP path)', () => {
  const content = fs.readFileSync(GRAPH_UTIL_PATH, 'utf-8');
  expect(content.includes('export async function checkDependencyCycle')).toBe(true);
  expect(content.includes('GraphLimits')).toBe(true);
  layer1Passed++;
});

test('Pattern: stale-dep guard is in place (d5d5b617 followup)', () => {
  const content = fs.readFileSync(TASK_DEPS_PATH, 'utf-8');
  expect(content.includes('dangling dependency reference')).toBe(true);
  layer1Passed++;
});

// ============================================================
// LAYER 2: Behavior Validation (selector functions)
// ============================================================

console.log('\n=====================================');
console.log('LAYER 2: Behavior Validation');
console.log('=====================================\n');

// --- depIds ---

test('Behavior: depIds() returns [] when dependencies is undefined', () => {
  const task: Task = {
    id: 'A',
    title: 'A',
    status: TaskStatus.OPEN,
    type: TaskType.ACTION,
    priority: TaskPriority.MEDIUM,
    order: 0,
  };
  expect(depIds(task)).toEqual([]);
  layer2Passed++;
});

test('Behavior: depIds() returns [] when dependencies is empty array', () => {
  expect(depIds(buildTask('A', []))).toEqual([]);
  layer2Passed++;
});

test('Behavior: depIds() returns single ID', () => {
  expect(depIds(buildTask('A', ['B']))).toEqual(['B']);
  layer2Passed++;
});

test('Behavior: depIds() returns multiple IDs in order', () => {
  expect(depIds(buildTask('A', ['B', 'C', 'D']))).toEqual(['B', 'C', 'D']);
  layer2Passed++;
});

// --- dependsOn ---

test('Behavior: dependsOn() returns false when dependencies undefined', () => {
  const task: Task = {
    id: 'A',
    title: 'A',
    status: TaskStatus.OPEN,
    type: TaskType.ACTION,
    priority: TaskPriority.MEDIUM,
    order: 0,
  };
  expect(dependsOn(task, 'B')).toBe(false);
  layer2Passed++;
});

test('Behavior: dependsOn() returns true for a matching dep', () => {
  expect(dependsOn(buildTask('A', ['B', 'C']), 'B')).toBe(true);
  layer2Passed++;
});

test('Behavior: dependsOn() returns false for a non-matching dep', () => {
  expect(dependsOn(buildTask('A', ['B', 'C']), 'Z')).toBe(false);
  layer2Passed++;
});

// --- checkForDependencyCycles ---

test('Behavior: checkForDependencyCycles() on empty graph returns false', () => {
  expect(checkForDependencyCycles('A', {})).toBe(false);
  layer2Passed++;
});

test('Behavior: checkForDependencyCycles() on task with no deps returns false', () => {
  const tasks = { A: buildTask('A', []) };
  expect(checkForDependencyCycles('A', tasks)).toBe(false);
  layer2Passed++;
});

test('Behavior: checkForDependencyCycles() detects self-cycle (A → A)', () => {
  const tasks = { A: buildTask('A', ['A']) };
  expect(checkForDependencyCycles('A', tasks)).toBe(true);
  layer2Passed++;
});

test('Behavior: checkForDependencyCycles() detects direct cycle (A → B → A)', () => {
  const tasks = {
    A: buildTask('A', ['B']),
    B: buildTask('B', ['A']),
  };
  expect(checkForDependencyCycles('A', tasks)).toBe(true);
  layer2Passed++;
});

test('Behavior: checkForDependencyCycles() detects transitive cycle (A → B → C → A)', () => {
  const tasks = {
    A: buildTask('A', ['B']),
    B: buildTask('B', ['C']),
    C: buildTask('C', ['A']),
  };
  expect(checkForDependencyCycles('A', tasks)).toBe(true);
  layer2Passed++;
});

test('Behavior: checkForDependencyCycles() returns false for clean chain (A → B → C, no return)', () => {
  const tasks = {
    A: buildTask('A', ['B']),
    B: buildTask('B', ['C']),
    C: buildTask('C', []),
  };
  expect(checkForDependencyCycles('A', tasks)).toBe(false);
  layer2Passed++;
});

test('Behavior: checkForDependencyCycles() handles stale dep ID without throwing (d5d5b617 guard)', () => {
  // Task A depends on non-existent task X. Pre-d5d5b617 this threw on
  // `task.dependencies` because `tasks['X']` was undefined.
  const tasks = { A: buildTask('A', ['X']) };
  const result = suppressWarn(() => checkForDependencyCycles('A', tasks));
  expect(result).toBe(false);
  layer2Passed++;
});

test('Behavior: checkForDependencyCycles() on disconnected components returns false', () => {
  const tasks = {
    A: buildTask('A', ['B']),
    B: buildTask('B', []),
    C: buildTask('C', ['D']),
    D: buildTask('D', []),
  };
  expect(checkForDependencyCycles('A', tasks)).toBe(false);
  expect(checkForDependencyCycles('C', tasks)).toBe(false);
  layer2Passed++;
});

// ============================================================
// Summary
// ============================================================

console.log('\n=====================================');
console.log('Task Dependencies Test Summary');
console.log('=====================================');
console.log(`\n📊 Layer 1 (Pattern):  ${layer1Passed}/5`);
console.log(`📊 Layer 2 (Behavior): ${layer2Passed}/15`);
console.log(`\n✅ Total Passed: ${passed}`);
console.log(`❌ Total Failed: ${failed}`);
console.log(`📊 Total Tests:  ${passed + failed}`);
console.log('=====================================\n');

if (failed > 0) {
  console.error('❌ Some tests failed!\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
  process.exit(0);
}
