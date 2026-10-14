#!/usr/bin/env ts-node
/**
 * TEMPLATE-SENT-TWICE fix A (2026-10-07) — `execution.config.prompt` is only ever the task's OWN directive.
 *
 * Both engine-path config builders used to fall back to the RAW agent template (`task.prompt ||
 * task.agentTemplate?.promptTemplate`). The engine renders config.prompt as the user `## Directive`
 * (build-agent-prompt-body.ts), while buildSystemPrompt resolves the SAME template into the system prompt — so the
 * template went to the model twice (~18 KB, raw `${agentRole}` in the copy). 2,277 of 2,321 executions in 60 days
 * took the fallback. Root cause + options: cline_docs/reviews/template-sent-twice-2026-10-07/REVIEW-prompt-construction.md.
 *
 * Pins, BEHAVIOURALLY (the real builders run against stubbed I/O):
 *   1. buildRichExecutionConfig (task-ready + retrigger reactors — every pipeline child and harness re-run):
 *      no task prompt ⇒ config.prompt absent (never the template); own prompt ⇒ passed through unchanged.
 *   2. AgentTaskService.executeAgentOnTask (agent.execute): the same, plus overrideConfig.prompt > task.prompt.
 *   3. The absent prompt renders as the SYNTHESIZED directive ("As a <role>, complete the following task: …"),
 *      and the template text does not appear in the user prompt body.
 *   4. The builder's missing-keys warning no longer requires 'prompt' (absent is the designed state).
 *   5. Source tripwire: no `|| …promptTemplate` fallback into a `prompt:` field in either builder.
 *
 * Pure: prisma and createAgentExecution are replaced in require.cache BEFORE the builders load. No DB, no server.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';
process.env.PAICHART_SKIP_DB_CONNECT = process.env.PAICHART_SKIP_DB_CONNECT || 'true';

import * as fs from 'fs';
import * as path from 'path';

// ── Stubs (installed before the modules under test are required) ───────────────────────────────
let currentTask: any = null;
const createCalls: any[] = [];

const prismaStub = {
  task: {
    findUnique: async (args: any) => {
      if (args?.select && Object.keys(args.select).length === 1 && args.select.inputContext) {
        return currentTask ? { inputContext: currentTask.inputContext } : null;
      }
      return currentTask;
    },
    updateMany: async () => ({ count: 1 }),
  },
  agentExecution: { delete: async () => ({}) },
};

function stubModule(rel: string, exports: any) {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports } as any;
}
stubModule('../lib/prisma', { prisma: prismaStub, default: prismaStub });
stubModule('../lib/services/agent-execution-create', {
  createAgentExecution: async (args: any) => {
    createCalls.push(args);
    return { execution: { id: 'cmexec0000000000000000001', taskId: args.taskId, status: args.status, config: args.config } };
  },
});

const { buildRichExecutionConfig } = require('../lib/services/agentExecutionConfigBuilder');
const { AgentTaskService } = require('../lib/services/agentTaskService');
const { buildAgentPromptBody } = require('../lib/agents/harness/build-agent-prompt-body');

// ── Harness ────────────────────────────────────────────────────────────────────────────────────
let passed = 0;
const failed: string[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed.push(name); console.log(`  ❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }

const TEMPLATE_TEXT = 'You are a ${agentRole}. TEMPLATE-BODY-SENTINEL — role guidance that belongs in the SYSTEM prompt only.';
function makeTask(prompt: string | null | undefined): any {
  return {
    id: 'cmtask00000000000000000001',
    title: 'Author the change package',
    description: 'desc',
    type: 'ACTION',
    status: 'TODO',
    priority: 'MEDIUM',
    agentRole: 'config_change_author',
    prompt,
    inputContext: null,
    maxRetries: 3,
    timeout: null,
    metadata: {},
    executionStatus: null,
    mcpToolId: null, mcpWorkflowId: null, mcpContext: null, mcpMetadata: null,
    agentTemplateId: 'cmtpl000000000000000000001',
    assignee: null, phase: null, pov: null,
    agentTemplate: {
      id: 'cmtpl000000000000000000001', name: 'Config Change Author', promptTemplate: TEMPLATE_TEXT,
      defaultRole: 'config_change_author', capabilities: [], constraints: {}, metadata: {},
      maxRetries: 3, timeout: 600, priority: 'MEDIUM', outputSchema: null,
    },
  };
}
const OPTS = { triggerSource: 'task-ready-reactor' as const };

async function main() {
  console.log('\n🧪 TEMPLATE-SENT-TWICE — config.prompt carries the task\'s own directive only\n');

  for (const empty of [null, undefined, '']) {
    await test(`reactor builder: task.prompt=${JSON.stringify(empty)} ⇒ config.prompt absent, never the template`, async () => {
      currentTask = makeTask(empty);
      const built = await buildRichExecutionConfig(currentTask.id, OPTS);
      assert(built && built.config, 'builder returned null');
      assert(!built.config.prompt, `config.prompt should be absent, got ${JSON.stringify(built.config.prompt)?.slice(0, 80)}`);
      const persisted = JSON.parse(JSON.stringify(built.config));
      assert(!('prompt' in persisted), 'persisted JSON must not carry a prompt key');
      // config.systemPrompt (from buildTemplateModelParameters) legitimately stores the template; no reader sends it
      // (the engine resolves the live template row). Every OTHER key must be free of it.
      const { systemPrompt: _sp, ...rest } = persisted;
      assert(!JSON.stringify(rest).includes('TEMPLATE-BODY-SENTINEL'), 'template text leaked into a non-systemPrompt config key');
    });
  }

  await test('reactor builder: own task.prompt passes through unchanged (the task-prompt overrides must not move)', async () => {
    currentTask = makeTask('Do exactly this.');
    const built = await buildRichExecutionConfig(currentTask.id, OPTS);
    assert(built.config.prompt === 'Do exactly this.', `got ${JSON.stringify(built.config.prompt)}`);
  });

  for (const empty of [null, '']) {
    await test(`agent.execute builder: task.prompt=${JSON.stringify(empty)} ⇒ config.prompt absent, never the template`, async () => {
      currentTask = makeTask(empty);
      createCalls.length = 0;
      await AgentTaskService.executeAgentOnTask(currentTask.id, {}, 'cmuser00000000000000000001');
      assert(createCalls.length === 1, `createAgentExecution calls: ${createCalls.length}`);
      const cfg = createCalls[0].config;
      assert(!cfg.prompt, `config.prompt should be absent, got ${JSON.stringify(cfg.prompt)?.slice(0, 80)}`);
      const { systemPrompt: _sp, ...rest } = cfg;
      assert(!JSON.stringify(rest).includes('TEMPLATE-BODY-SENTINEL'), 'template text leaked into a non-systemPrompt config key');
    });
  }

  await test('agent.execute builder: own task.prompt passes through; overrideConfig.prompt beats it', async () => {
    currentTask = makeTask('Task directive.');
    createCalls.length = 0;
    await AgentTaskService.executeAgentOnTask(currentTask.id, {}, 'cmuser00000000000000000001');
    assert(createCalls[0].config.prompt === 'Task directive.', `own: ${JSON.stringify(createCalls[0].config.prompt)}`);
    await AgentTaskService.executeAgentOnTask(currentTask.id, { overrideConfig: { prompt: 'Override directive.' } }, 'cmuser00000000000000000001');
    assert(createCalls[1].config.prompt === 'Override directive.', `override: ${JSON.stringify(createCalls[1].config.prompt)}`);
  });

  await test('the absent prompt renders as the SYNTHESIZED directive; the template is not in the user prompt', async () => {
    currentTask = makeTask(null);
    const built = await buildRichExecutionConfig(currentTask.id, OPTS);
    const body: string = buildAgentPromptBody(currentTask, built.config, { agentTemplate: currentTask.agentTemplate });
    assert(body.includes('## Directive\nAs a config_change_author, complete the following task: "Author the change package"'),
      `synthesized directive missing:\n${body.slice(0, 300)}`);
    assert(!body.includes('TEMPLATE-BODY-SENTINEL'), 'template text appears in the user prompt body');
    assert(!body.includes('${agentRole}'), 'raw placeholder appears in the user prompt body');
  });

  await test('source: no `|| …promptTemplate` fallback into a prompt field; missing-keys warn does not require prompt', () => {
    for (const rel of ['lib/services/agentExecutionConfigBuilder.ts', 'lib/services/agentTaskService.ts']) {
      const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
      const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      assert(!/prompt:[^\n]*promptTemplate/.test(code), `${rel}: a prompt field still falls back to promptTemplate`);
    }
    const b = fs.readFileSync(path.join(__dirname, '..', 'lib/services/agentExecutionConfigBuilder.ts'), 'utf8');
    assert(!/missingKeys = \[[^\]]*'prompt'/.test(b), "missing-keys warning still requires 'prompt'");
  });

  console.log(`\n${passed} passed, ${failed.length} failed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
