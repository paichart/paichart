/**
 * Phase 1 smoke test — Dispatcher-boundary schema enforcement (GS14)
 *
 * Verifies the dispatch-with-schema helper rejects/accepts inputs correctly
 * for all 5 consolidated tools. Closes the embedded-MCP transport bypass
 * discovered 2026-05-15 (pov.update XSS), extended across project/analytics/
 * template/services/registry.
 *
 * Run: npx tsx scripts/test-mcp-phase1-smoke.ts
 *
 * Per cline_docs/reviews/embedded-mcp-dispatchers-bc-sweep-2026-05-16/synthesis.md
 * Phase 1 smoke test plan (12 tests + 6 regressions).
 */

// MUST precede the requires below — they reach `lib/prisma.ts` transitively,
// which THROWS at import time when DATABASE_URL is unset. The repo's .env masks
// this locally; a CI runner has none. This suite needs no DB, only the schemas.
// See [[feedback_ci_database_url_transitive]].
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
// Also skip the eager $connect() in lib/prisma.ts: it calls process.exit(1) at
// module scope on failure, which killed this suite on a CI runner with no
// Postgres even though every assertion passed. Schema-only suite — no DB needed.
process.env.PAICHART_SKIP_DB_CONNECT ||= 'true';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { validateDispatchArgs } = require('../lib/mcp/server/tools/dispatchers/dispatch-with-schema');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CONSOLIDATED_SCHEMAS, DANGEROUS_KEYS: JS_DANGEROUS_KEYS, stripDangerousKeys: jsStrip, deepStripDangerousKeys: jsDeepStrip } = require('../lib/mcp/server/config/tool-schemas');
import { DANGEROUS_KEYS as TS_DANGEROUS_KEYS, deepStripDangerousKeys as tsDeepStrip } from '../lib/utils/sanitize-keys';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WorkflowHandlerInputSchema, WorkflowListHandlerInputSchema } = require('../lib/mcp/server/tools/hub/workflow-tools-handler');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ServiceUpdateHandlerInputSchema } = require('../lib/mcp/server/tools/hub/service-update-handler');

type SmokeTest = {
  name: string;
  closes: string;
  toolName: string;
  args: unknown;
  expect: 'reject' | 'accept';
  // Optional: assert specific transformed value on the validated data.
  assertData?: (data: any) => string | null; // returns null if pass, error string if fail
};

const tests: SmokeTest[] = [
  // === CORE PHASE 1 VERIFICATION ===
  {
    name: '01. XSS string rejected at project boundary',
    closes: 'Core Phase 1 — yesterday\'s pov.update bypass fingerprint',
    toolName: 'project',
    args: { action: 'pov.list', customer_name: '<script>alert(1)</script>' },
    // 2026-07-27: flipped from 'accept' to 'reject'. The original rationale —
    // "Phase 1 enforces type/enum/transforms only; injection refines are Phase 2's
    // job, so the XSS string passes here and is stripped downstream" — was true
    // when written and is now obsolete: `customer_name` is SafeNameField(255)
    // (tool-schemas.js:448), whose DANGEROUS_TEXT_PATTERNS refine rejects
    // <script> at this boundary.
    //
    // The CODE is right and the test had rotted. Rejecting at the dispatch
    // boundary is strictly better than accept-then-strip: the attempt surfaces
    // as a loud validation failure in ops dashboards instead of being silently
    // neutralised downstream. The old assertData (which asserted the payload was
    // PRESERVED verbatim) encoded the accept-then-strip model and is dropped.
    //
    // Went unnoticed because this suite is not in test:all-validation, so CI
    // never ran it. See [[feedback_string_pinned_tests]].
    expect: 'reject',
  },
  {
    // Companion to 01, added 2026-07-27. Without this, 01 passes just as well
    // against a schema that rejects EVERYTHING — it would assert "customer_name
    // is broken" rather than "the injection refine discriminates". This pins the
    // negative half: ordinary customer names must still get through.
    name: '01b. Benign customer_name still accepted (01 is not blanket rejection)',
    closes: 'Core Phase 1 — SafeNameField discriminates, not blanket-rejects',
    toolName: 'project',
    args: { action: 'pov.list', customer_name: 'Meridian Health Systems' },
    expect: 'accept',
    assertData: (d) => d.customer_name === 'Meridian Health Systems' ? null
      : `expected benign customer_name preserved verbatim, got ${d.customer_name}`,
  },
  {
    name: '02. Empty body rejected (missing action enum)',
    closes: 'Core Phase 1 — empty-body silent acceptance bug',
    toolName: 'project',
    args: {},
    expect: 'reject',
  },
  {
    name: '03. Invalid action enum rejected at analytics',
    closes: 'Core Phase 1 — action enum enforcement',
    toolName: 'analytics',
    args: { action: 'not.a.real.action' },
    expect: 'reject',
  },
  {
    name: '04. Valid analytics action accepted',
    closes: 'Core Phase 1 — happy path',
    toolName: 'analytics',
    args: { action: 'recommendations.get' },
    expect: 'accept',
  },

  // === IMPLICIT-CLOSURE VERIFICATIONS (synthesis #31-36) ===
  {
    name: '05. Boolean-string coercion runs (#31): "true" → true',
    closes: '#31 — transforms lost on embedded path',
    toolName: 'project',
    args: { action: 'task.context', includeHistory: 'true' },
    expect: 'accept',
    assertData: (d) => d.includeHistory === true ? null
      : `expected boolean true after transform, got ${typeof d.includeHistory}:${d.includeHistory}`,
  },
  {
    name: '06. Boolean-string coercion runs (#31): "false" → false',
    closes: '#31 — transforms lost on embedded path',
    toolName: 'project',
    args: { action: 'task.context', includeAnalytics: 'false' },
    expect: 'accept',
    assertData: (d) => d.includeAnalytics === false ? null
      : `expected boolean false after transform, got ${typeof d.includeAnalytics}:${d.includeAnalytics}`,
  },
  {
    name: '07. Invalid enum rejected (#32): timeframe',
    closes: '#32 — analytics partial GS12 → full schema',
    toolName: 'analytics',
    args: { action: 'team.performance', timeframe: 'last_century' },
    expect: 'reject',
  },
  {
    name: '08. Invalid enum rejected (#32): recommendationType',
    closes: '#32 — analytics partial GS12 → full schema',
    toolName: 'analytics',
    args: { action: 'recommendations.get', type: 'GARBAGE' },
    expect: 'reject',
  },
  {
    name: '09. Non-string status rejected (#34): no TypeError on toUpperCase',
    closes: '#34 — TypeError surface goes away with schema enforcement',
    toolName: 'project',
    args: { action: 'pov.list', status: { malicious: 'object' } },
    expect: 'reject',
  },

  // === DISPATCHER REGRESSION COVERAGE ===
  {
    name: '10. project.pov.list happy path accepts known status',
    closes: 'Regression — Phase 1 doesn\'t break existing accepts',
    toolName: 'project',
    args: { action: 'pov.list', status: 'IN_PROGRESS', limit: 20 },
    expect: 'accept',
  },
  {
    name: '11. services.discover happy path',
    closes: 'Regression — services dispatcher',
    toolName: 'services',
    args: { action: 'discover' },
    expect: 'accept',
  },
  {
    name: '12. registry.list happy path',
    closes: 'Regression — registry dispatcher',
    toolName: 'registry',
    args: { action: 'list' },
    expect: 'accept',
  },

  // === SENTINEL TESTS (document gaps Phase 2/3 will close) ===
  // === BC27 STRIPPING — Phase 2 N4 (was inversion sentinels from Phase 1) ===
  {
    name: '13. BC27 — __proto__ stripped at project boundary',
    closes: 'Phase 2 N4 — stripDangerousKeys applied to project.inputSchema',
    toolName: 'project',
    // JSON.parse forces __proto__ as a real own-property (V8 special-cases
    // object literals with __proto__ so {__proto__: x} sets the prototype
    // chain; JSON.parse does not).
    args: JSON.parse('{"action":"pov.list","__proto__":{"polluted":true},"constructor":{"bad":1},"prototype":{"worse":1}}'),
    expect: 'accept',
    assertData: (d) => {
      const dangerous = ['__proto__', 'constructor', 'prototype'];
      const leaked = dangerous.filter(k => Object.prototype.hasOwnProperty.call(d, k));
      return leaked.length === 0 ? null
        : `BC27 FAIL: dangerous keys still present after Phase 2 N4: ${leaked.join(', ')}`;
    },
  },
  {
    name: '16. BC27 — __proto__ stripped at analytics boundary',
    closes: 'Phase 2 N4 — analytics.inputSchema',
    toolName: 'analytics',
    args: JSON.parse('{"action":"team.performance","__proto__":{"polluted":true}}'),
    expect: 'accept',
    assertData: (d) => Object.prototype.hasOwnProperty.call(d, '__proto__')
      ? 'BC27 FAIL: __proto__ leaked through analytics'
      : null,
  },
  {
    name: '17. BC27 — __proto__ stripped at template boundary',
    closes: 'Phase 2 N4 — template.inputSchema',
    toolName: 'template',
    args: JSON.parse('{"action":"list","__proto__":{"polluted":true}}'),
    expect: 'accept',
    assertData: (d) => Object.prototype.hasOwnProperty.call(d, '__proto__')
      ? 'BC27 FAIL: __proto__ leaked through template'
      : null,
  },
  {
    name: '18. BC27 — __proto__ stripped at services boundary',
    closes: 'Phase 2 N4 — services.inputSchema (top-level + arguments union)',
    toolName: 'services',
    args: JSON.parse('{"action":"call","targetService":"x","tool":"y","__proto__":{"polluted":true},"arguments":{"__proto__":{"nested":true},"safe":"value"}}'),
    expect: 'accept',
    assertData: (d) => {
      if (Object.prototype.hasOwnProperty.call(d, '__proto__')) return 'BC27 FAIL: services top-level __proto__ leaked';
      if (d.arguments && Object.prototype.hasOwnProperty.call(d.arguments, '__proto__')) {
        return 'BC27 FAIL: services.arguments __proto__ leaked through z.record(z.any()) union arm';
      }
      return null;
    },
  },
  {
    name: '19. BC27 — __proto__ stripped at registry boundary',
    closes: 'Phase 2 N4 — registry.inputSchema',
    toolName: 'registry',
    args: JSON.parse('{"action":"list","__proto__":{"polluted":true}}'),
    expect: 'accept',
    assertData: (d) => Object.prototype.hasOwnProperty.call(d, '__proto__')
      ? 'BC27 FAIL: __proto__ leaked through registry'
      : null,
  },
  {
    name: '20. BC27 — perform parameters JSON-string pollution stripped (mcp-tool-arch F2)',
    closes: 'Phase 2 N4 — perform.inputSchema inner strip after JSON.parse at line 321',
    toolName: 'perform',
    // String-branch of perform.parameters union — schema's outer transform parses
    // this string, then the inner stripDangerousKeys catches __proto__ that
    // arrived JSON-serialized. Closes the mcp-tool-arch F2 coverage gap.
    args: { action: 'task.update', parameters: '{"__proto__":{"polluted":true},"taskId":"cmaaabbbcccdddeeefffggghh","status":"COMPLETED"}' },
    expect: 'accept',
    assertData: (d) => {
      if (!d.parameters || typeof d.parameters !== 'object') {
        return `expected d.parameters to be parsed object, got ${typeof d.parameters}`;
      }
      if (Object.prototype.hasOwnProperty.call(d.parameters, '__proto__')) {
        return 'BC27 FAIL: __proto__ leaked through perform.parameters JSON-string branch';
      }
      // Verify the safe key survived
      if (d.parameters.taskId !== 'cmaaabbbcccdddeeefffggghh') {
        return `safe key lost during strip: taskId=${d.parameters.taskId}`;
      }
      return null;
    },
  },
  {
    name: '21. BC27 DRIFT-DETECTION — DANGEROUS_KEYS in TS canonical equals JS inline copy (sec-ops F3)',
    closes: 'Locks in sync between lib/utils/sanitize-keys.ts and tool-schemas.js inlined helper',
    toolName: 'project', // unused; the assertion uses imported sets directly
    args: { action: 'pov.list' }, // unused; we need a passing call to enter assertData
    expect: 'accept',
    assertData: () => {
      const tsKeys = Array.from(TS_DANGEROUS_KEYS as Set<string>).sort();
      const jsKeys = Array.from(JS_DANGEROUS_KEYS as Set<string>).sort();
      if (tsKeys.length !== jsKeys.length) {
        return `DRIFT: TS has ${tsKeys.length} keys, JS has ${jsKeys.length}`;
      }
      for (let i = 0; i < tsKeys.length; i++) {
        if (tsKeys[i] !== jsKeys[i]) {
          return `DRIFT at index ${i}: TS=${tsKeys[i]} JS=${jsKeys[i]}. Update tool-schemas.js inline copy or canonical sanitize-keys.ts`;
        }
      }
      return null;
    },
  },
  {
    name: '22. BC27 — registry.register.capabilities JSON-string branch stripped (N1 closure)',
    closes: 'Phase 2 N4 fold-in — JSON.parse(str) branches now wrap with stripDangerousKeys',
    toolName: 'registry',
    args: {
      action: 'register',
      name: 'test-service',
      description: 'A test service for BC27 verification',
      endpoint: 'https://example.com/mcp',
      category: 'data-services',
      capabilities: '{"__proto__":{"polluted":true},"tools":["fetch"]}',
    },
    expect: 'accept',
    assertData: (d) => {
      if (!d.capabilities || typeof d.capabilities !== 'object') {
        return `expected d.capabilities to be parsed object, got ${typeof d.capabilities}`;
      }
      if (Object.prototype.hasOwnProperty.call(d.capabilities, '__proto__')) {
        return 'BC27 FAIL: __proto__ leaked through registry.register.capabilities JSON-string branch (N1 site)';
      }
      if (!Array.isArray(d.capabilities.tools) || d.capabilities.tools[0] !== 'fetch') {
        return `safe nested data lost: tools=${JSON.stringify(d.capabilities.tools)}`;
      }
      return null;
    },
  },
  {
    name: '14. IDEMPOTENCY — double-pass returns identical data',
    closes: 'Locks in dual-validation safety (SDK path may run schema twice via validateToolInput)',
    toolName: 'project',
    args: { action: 'task.context', includeHistory: 'true', includeAnalytics: 'false' },
    expect: 'accept',
    assertData: (d) => {
      // Second pass: feed the validated output back through the helper.
      const second = validateDispatchArgs('project', d);
      if (!second.ok) return `second pass rejected: ${JSON.stringify(second.errorResponse).slice(0, 200)}`;
      const eq = JSON.stringify(d) === JSON.stringify(second.data);
      return eq ? null
        : `idempotency broken: first=${JSON.stringify(d).slice(0, 100)} second=${JSON.stringify(second.data).slice(0, 100)}`;
    },
  },
  // Note: R6 (throw-on-bad-toolName) verified separately below — wrapped in try/catch
  // because the helper now THROWS on lookup miss (R6 / arch-review A3).

  // === NOTES ===
  // - Tests for project.pov.details and template.details happy-path are deferred to
  //   deploy-side integration smoke (per synthesis D7); they require a real POV/template
  //   in the DB and authenticated MCP transport, so they don't belong in a pure
  //   schema unit test.
  // - Test #13 is an INVERSION sentinel — accepts today, will fail when Phase 2 N4
  //   lands so the Phase 2 dev is forced to update the assertion.
];

async function run() {
  const results: Array<{ test: SmokeTest; pass: boolean; detail: string }> = [];

  for (const t of tests) {
    let pass = false;
    let detail = '';
    try {
      const result = validateDispatchArgs(t.toolName, t.args);
      if (t.expect === 'reject') {
        if (!result.ok) {
          pass = true;
          detail = 'rejected as expected';
        } else {
          pass = false;
          detail = `expected REJECT but got ACCEPT with data=${JSON.stringify(result.data).slice(0, 100)}`;
        }
      } else {
        // accept
        if (result.ok) {
          if (t.assertData) {
            const err = t.assertData(result.data);
            if (err === null) {
              pass = true;
              detail = 'accepted + assertion passed';
            } else {
              pass = false;
              detail = `accepted but assertion failed: ${err}`;
            }
          } else {
            pass = true;
            detail = 'accepted as expected';
          }
        } else {
          pass = false;
          detail = `expected ACCEPT but got REJECT: ${JSON.stringify(result.errorResponse).slice(0, 200)}`;
        }
      }
    } catch (err) {
      pass = false;
      detail = `THREW: ${(err as Error).message}`;
    }
    results.push({ test: t, pass, detail });
  }

  // Phase 2 workflow chunk — verify WorkflowHandlerInputSchema rejects/accepts
  // at the handler boundary (defense-in-depth on top of Phase 1 dispatcher safeParse).
  // These run as schema-level tests, not full handler-invocation tests, because
  // the handler requires constructor deps (prisma, engine, connection pool).
  const workflowTests = [
    {
      name: '23. WORKFLOW HANDLER — non-CUID taskId rejected at handler boundary (N1 closure)',
      input: { workflowName: 'foo', taskId: 'not-a-cuid' },
      expect: 'reject',
    },
    {
      name: '24. WORKFLOW HANDLER — non-CUID povId rejected at handler boundary',
      input: { workflowName: 'foo', povId: 'pov-fetch-style-not-bare-cuid' },
      expect: 'reject',
    },
    {
      name: '25. WORKFLOW HANDLER — bad executionMode rejected',
      input: { workflowName: 'foo', executionMode: 'magical-mode' },
      expect: 'reject',
    },
    {
      name: '26. WORKFLOW HANDLER — workflowName > 200 chars rejected (DoS bound)',
      input: { workflowName: 'a'.repeat(201) },
      expect: 'reject',
    },
    {
      name: '54. WORKFLOW HANDLER — maxTotalRetries: 5 carried through (F3 closure — was silently dropped)',
      input: { workflowName: 'foo', maxTotalRetries: 5 },
      expect: 'accept' as const,
      assertData: (d: any) => d.maxTotalRetries === 5 ? null
        : `F3 FAIL: maxTotalRetries=5 not preserved; got ${d.maxTotalRetries}`,
    },
    {
      name: '55. WORKFLOW HANDLER — maxTotalRetries out of range (>20) rejected',
      input: { workflowName: 'foo', maxTotalRetries: 21 },
      expect: 'reject' as const,
    },
    {
      name: '48. WORKFLOW.LIST — non-CUID povId rejected (W1 closure, defense-in-depth over W2 dispatcher gate)',
      input: { povId: 'not-a-cuid' },
      expect: 'reject' as const,
      schema: WorkflowListHandlerInputSchema,
    },
    {
      name: '49. WORKFLOW.LIST — workflowType > 100 chars rejected (W1 DoS bound closure)',
      input: { workflowType: 'a'.repeat(101) },
      expect: 'reject' as const,
      schema: WorkflowListHandlerInputSchema,
    },
    {
      name: '50. WORKFLOW.LIST — invalid status enum rejected',
      input: { status: 'NOT_A_STATUS' },
      expect: 'reject' as const,
      schema: WorkflowListHandlerInputSchema,
    },
    {
      name: '51. WORKFLOW.LIST — happy path with valid filters accepted + defaults applied',
      input: { povId: 'caaabbbcccdddeeefffggghhh', status: 'RUNNING', workflowType: 'data-pipeline' },
      expect: 'accept' as const,
      schema: WorkflowListHandlerInputSchema,
      assertData: (d: any) => {
        if (d.limit !== 20) return `limit default not applied; got ${d.limit}`;
        if (d.offset !== 0) return `offset default not applied; got ${d.offset}`;
        return null;
      },
    },
    {
      name: '52. WORKFLOW.LIST — limit > 100 rejected (W1 bound symmetry, convergent fold-in val-eng O3 + workflow-orchestration F1)',
      input: { limit: 101 },
      expect: 'reject' as const,
      schema: WorkflowListHandlerInputSchema,
    },
    {
      name: '53. WORKFLOW.LIST — limit < 1 rejected (W1 bound)',
      input: { limit: 0 },
      expect: 'reject' as const,
      schema: WorkflowListHandlerInputSchema,
    },
    {
      name: '27. WORKFLOW HANDLER — happy path with valid CUID accepted + defaults applied',
      // Handler-boundary intentionally permissive on steps shape — `steps: []` is
      // accepted here. The engine schema (orchestration-params.ts) does the stricter
      // `min(1)` check after workflowName lookup resolves named-workflow steps.
      // Per workflow-orchestration Phase 2 chunk review F1 — document the boundary
      // semantics so Phase 4 collapse doesn't accidentally flip this to reject.
      input: { workflowName: 'my-workflow', taskId: 'caaabbbcccdddeeefffggghhh', steps: [] },
      expect: 'accept',
      // Verify schema defaults are applied
      assertData: (d: any) => {
        if (d.executionMode !== 'sequential') return `executionMode default not applied; got ${d.executionMode}`;
        if (d.failureStrategy !== 'stop') return `failureStrategy default not applied; got ${d.failureStrategy}`;
        if (d.timeout !== 60000) return `timeout default not applied; got ${d.timeout}`;
        return null;
      },
    },
    {
      name: '28. WORKFLOW HANDLER — timeout below engine min(1000) rejected (convergent F2/W3)',
      input: { workflowName: 'foo', timeout: 500 },
      expect: 'reject',
    },
    {
      name: '29. WORKFLOW HANDLER — timeout above engine max(600000) rejected (10min cap)',
      input: { workflowName: 'foo', timeout: 700000 },
      expect: 'reject',
    },
    {
      name: '30. WORKFLOW HANDLER — __proto__ stripped at handler boundary (BC27 boy-scout)',
      input: JSON.parse('{"workflowName":"foo","__proto__":{"polluted":true}}'),
      expect: 'accept',
      assertData: (d: any) => Object.prototype.hasOwnProperty.call(d, '__proto__')
        ? 'BC27 FAIL: __proto__ leaked through WorkflowHandlerInputSchema (boy-scout fold-in regression)'
        : null,
    },
  ];
  for (const wt of workflowTests) {
    let pass = false;
    let detail = '';
    try {
      // Test uses its own schema if specified (W1 closure — WorkflowListHandlerInputSchema),
      // otherwise defaults to WorkflowHandlerInputSchema (workflow.execute action).
      const schema = (wt as any).schema || WorkflowHandlerInputSchema;
      const parsed = schema.safeParse(wt.input);
      if (wt.expect === 'reject') {
        if (!parsed.success) { pass = true; detail = 'rejected as expected'; }
        else { pass = false; detail = `expected REJECT but got ACCEPT: ${JSON.stringify(parsed.data).slice(0, 100)}`; }
      } else {
        if (parsed.success) {
          if (wt.assertData) {
            const err = wt.assertData(parsed.data);
            if (err === null) { pass = true; detail = 'accepted + assertion passed'; }
            else { pass = false; detail = `accepted but assertion failed: ${err}`; }
          } else {
            pass = true; detail = 'accepted as expected';
          }
        } else {
          pass = false; detail = `expected ACCEPT but got REJECT: ${JSON.stringify(parsed.error.errors).slice(0, 200)}`;
        }
      }
    } catch (err) {
      pass = false; detail = `THREW: ${(err as Error).message}`;
    }
    results.push({
      test: { name: wt.name, closes: 'Phase 2 workflow chunk — handler-boundary safeParse', toolName: 'workflow', args: wt.input, expect: wt.expect as any },
      pass, detail,
    });
  }

  // Phase 2 chunk 2 — service-update-handler smoke tests
  // Verify N5 + #29 + #30 closure at the handler boundary.
  const serviceUpdateTests = [
    {
      name: '31. SERVICE-UPDATE — capabilities JSON-string with __proto__ stripped (N5 closure)',
      input: {
        serviceId: 'caaabbbcccdddeeefffggghhh',
        updates: {
          capabilities: '{"__proto__":{"polluted":true},"tools":["fetch"]}',
        },
      },
      expect: 'accept',
      assertData: (d: any) => {
        const caps = d.updates?.capabilities;
        if (!caps || typeof caps !== 'object') return `expected capabilities parsed; got ${typeof caps}`;
        if (Object.prototype.hasOwnProperty.call(caps, '__proto__')) {
          return 'N5 FAIL: __proto__ leaked through JSON-string branch (BC27+BC2 compound regression)';
        }
        if (!Array.isArray(caps.tools) || caps.tools[0] !== 'fetch') {
          return `safe nested data lost: tools=${JSON.stringify(caps.tools)}`;
        }
        return null;
      },
    },
    {
      name: '32. SERVICE-UPDATE — capabilities object with __proto__ stripped',
      // Finding C hardening (mcp-hub Phase 2 chunk 2, 2026-05-17). The
      // JSON.parse('{"__proto__":...}') construction here produces an OWN
      // property named `__proto__` (not a prototype mutation) per ECMA-262
      // §25.5.1 / V8/Node ≥12 — `hasOwnProperty('__proto__')` returns true
      // before strip, false after. The assertion below relies on this
      // behavior. If a future engine changes the semantics
      // (https://tc39.es/proposal-array-grouping/ etc.), this assertion may
      // need to switch to:
      //   Object.assign({}, parsed, { __proto__: {...} })
      // for explicit own-property semantics. Documented to reduce surprise
      // for future readers debugging assertion failures on engine upgrades.
      input: {
        serviceId: 'caaabbbcccdddeeefffggghhh',
        updates: {
          capabilities: JSON.parse('{"__proto__":{"polluted":true},"tools":["fetch"]}'),
        },
      },
      expect: 'accept',
      assertData: (d: any) => {
        const caps = d.updates?.capabilities;
        return caps && Object.prototype.hasOwnProperty.call(caps, '__proto__')
          ? 'BC27 FAIL: __proto__ leaked through object branch'
          : null;
      },
    },
    {
      name: '33. SERVICE-UPDATE — sensitive ownerId in updates rejected by .strict() (#29 closure)',
      input: {
        serviceId: 'caaabbbcccdddeeefffggghhh',
        updates: { ownerId: 'caaabbbcccdddeeefffggghhh' },
      },
      expect: 'reject',
    },
    {
      name: '34. SERVICE-UPDATE — sensitive id in updates rejected by .strict() (#29 closure)',
      input: {
        serviceId: 'caaabbbcccdddeeefffggghhh',
        updates: { id: 'caaabbbcccdddeeefffggghhh' },
      },
      expect: 'reject',
    },
    {
      name: '35. SERVICE-UPDATE — healthCheckPath path-traversal rejected by schema (#30 closure)',
      input: {
        serviceId: 'caaabbbcccdddeeefffggghhh',
        updates: { healthCheckPath: '/../etc/passwd' },
      },
      expect: 'reject',
    },
    {
      name: '36. SERVICE-UPDATE — healthCheckPath with protocol rejected by schema (#30 closure)',
      input: {
        serviceId: 'caaabbbcccdddeeefffggghhh',
        updates: { healthCheckPath: 'https://evil.com/health' },
      },
      expect: 'reject',
    },
    {
      name: '37. SERVICE-UPDATE — happy path with valid healthCheckPath accepted',
      input: {
        serviceId: 'caaabbbcccdddeeefffggghhh',
        updates: { healthCheckPath: '/api/status' },
      },
      expect: 'accept',
    },
    {
      name: '38. SERVICE-UPDATE — bad semver version rejected',
      input: {
        serviceId: 'caaabbbcccdddeeefffggghhh',
        updates: { version: 'not.semver' },
      },
      expect: 'reject',
    },
    {
      name: '39. SERVICE-UPDATE — invalid status enum rejected',
      input: {
        serviceId: 'caaabbbcccdddeeefffggghhh',
        updates: { status: 'TOTALLY_INVALID' },
      },
      expect: 'reject',
    },
    {
      name: '40. SERVICE-UPDATE — empty permissions object accepted (mcp-hub Finding B)',
      input: {
        serviceId: 'caaabbbcccdddeeefffggghhh',
        updates: { permissions: {} },
      },
      expect: 'accept',
    },
    {
      name: '41. SERVICE-UPDATE — user-initiated ERROR status rejected (mcp-hub Q3 confirmation)',
      input: {
        serviceId: 'caaabbbcccdddeeefffggghhh',
        updates: { status: 'ERROR' },
      },
      expect: 'reject',
    },
  ];

  // Phase 3 advance — F1/Q4 depth-N strip + W2 services-dispatcher CUID povId tests.
  const phase3AdvanceTests = [
    {
      name: '45. F1/Q4 — depth-1 nested __proto__ stripped at services.call.arguments (depth-N closure)',
      input: {
        action: 'call',
        targetService: 'some-service',
        tool: 'some-tool',
        arguments: { user: { profile: { __proto__: { polluted: true } } }, safe: 'value' },
      },
      toolName: 'services',
      expect: 'accept' as const,
      assertData: (d: any) => {
        const args = d.arguments;
        if (!args || typeof args !== 'object') return `expected arguments object; got ${typeof args}`;
        // Top-level still has user.profile structure
        if (!args.user || !args.user.profile) return 'safe nested structure lost';
        // But the __proto__ at depth-1 nested is GONE
        if (Object.prototype.hasOwnProperty.call(args.user.profile, '__proto__')) {
          return 'F1/Q4 FAIL: nested __proto__ leaked through shallow strip (should be deep-stripped)';
        }
        return null;
      },
    },
    {
      name: '46. F1/Q4 DRIFT-DETECTION — deepStripDangerousKeys behavior parity TS vs JS inline (depth-2 test)',
      input: { action: 'call', targetService: 'x', tool: 'y' },
      toolName: 'services',
      expect: 'accept' as const,
      assertData: () => {
        // Test both implementations strip the same nested __proto__
        const fixture = JSON.parse('{"a":{"b":{"__proto__":{"polluted":true},"safe":"value"}}}');
        const tsResult = JSON.stringify(tsDeepStrip(fixture));
        const jsResult = JSON.stringify(jsDeepStrip(fixture));
        if (tsResult !== jsResult) {
          return `DRIFT: TS=${tsResult.slice(0, 100)} JS=${jsResult.slice(0, 100)}`;
        }
        // Verify __proto__ actually stripped
        const parsed = JSON.parse(jsResult);
        if (Object.prototype.hasOwnProperty.call(parsed.a.b, '__proto__')) {
          return 'deepStripDangerousKeys did NOT strip nested __proto__';
        }
        if (parsed.a.b.safe !== 'value') return 'deepStripDangerousKeys lost safe sibling';
        return null;
      },
    },
    {
      name: '47. W2 — services-dispatcher CUID_PARAM_NAMES now includes povId (consistency with analytics-dispatcher)',
      input: { action: 'workflow.list', povId: 'malformed-not-a-cuid' },
      toolName: 'services',
      expect: 'reject' as const,
    },
  ];
  for (const pt of phase3AdvanceTests) {
    let pass = false;
    let detail = '';
    try {
      // For #47, we test via the dispatcher's CUID check, not the schema directly.
      // Phase 1's dispatch-with-schema runs the consolidated schema first which
      // accepts povId as z.string().optional(). The GS12 CUID loop on the dispatcher
      // rejects it. But since we can't easily invoke the dispatcher without setting
      // up the full constructor deps, we instead verify the CUID_PARAM_NAMES
      // array now includes povId via a require + array check.
      if (pt.name.startsWith('47.')) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        // Repo-relative, not absolute: a hardcoded /home/steve/... path resolves
        // only on one developer's machine and fails on any CI runner.
        const src = fs.readFileSync(
          require('path').resolve(__dirname, '../lib/mcp/server/tools/dispatchers/services-dispatcher.js'),
          'utf8'
        );
        const hasPovId = /CUID_PARAM_NAMES\s*=\s*\[[^\]]*['"]povId['"][^\]]*\]/.test(src) && /CUID_PARAM_NAMES\s*=\s*\[[^\]]*['"]pov_id['"][^\]]*\]/.test(src);
        if (hasPovId) { pass = true; detail = 'services-dispatcher CUID_PARAM_NAMES now includes povId/pov_id (W2 closure)'; }
        else { pass = false; detail = 'W2 FAIL: services-dispatcher CUID_PARAM_NAMES missing povId/pov_id'; }
      } else {
        const result = validateDispatchArgs(pt.toolName, pt.input);
        if (pt.expect === 'reject') {
          if (!result.ok) { pass = true; detail = 'rejected as expected'; }
          else { pass = false; detail = `expected REJECT got ACCEPT`; }
        } else {
          if (result.ok) {
            if (pt.assertData) {
              const err = pt.assertData(result.data);
              if (err === null) { pass = true; detail = 'accepted + assertion passed'; }
              else { pass = false; detail = `accepted but assertion failed: ${err}`; }
            } else { pass = true; detail = 'accepted as expected'; }
          } else {
            pass = false; detail = `expected ACCEPT got REJECT: ${JSON.stringify(result.errorResponse).slice(0, 200)}`;
          }
        }
      }
    } catch (err) {
      pass = false; detail = `THREW: ${(err as Error).message}`;
    }
    results.push({
      test: { name: pt.name, closes: 'Phase 3 advance — F1/Q4 + W2', toolName: pt.toolName, args: pt.input, expect: pt.expect },
      pass, detail,
    });
  }

  // Phase 2 chunk 4 N3 closure tests #42-44 superseded by Phase 3 C1 tests
  // #56-62 + #73-74 below — same semantic (authType validated at the dispatch
  // boundary) now enforced at L1 via tool-schemas.js registry schema after
  // mcp-hub-validation.ts deletion (Phase 3 C1 Commit 3, 2026-05-16).
  for (const ut of serviceUpdateTests) {
    let pass = false;
    let detail = '';
    try {
      const parsed = ServiceUpdateHandlerInputSchema.safeParse(ut.input);
      if (ut.expect === 'reject') {
        if (!parsed.success) { pass = true; detail = 'rejected as expected'; }
        else { pass = false; detail = `expected REJECT but got ACCEPT: ${JSON.stringify(parsed.data).slice(0, 100)}`; }
      } else {
        if (parsed.success) {
          if (ut.assertData) {
            const err = ut.assertData(parsed.data);
            if (err === null) { pass = true; detail = 'accepted + assertion passed'; }
            else { pass = false; detail = `accepted but assertion failed: ${err}`; }
          } else {
            pass = true; detail = 'accepted as expected';
          }
        } else {
          pass = false; detail = `expected ACCEPT but got REJECT: ${JSON.stringify(parsed.error.errors).slice(0, 200)}`;
        }
      }
    } catch (err) {
      pass = false; detail = `THREW: ${(err as Error).message}`;
    }
    results.push({
      test: { name: ut.name, closes: 'Phase 2 chunk 2 — service-update-handler boundary', toolName: 'service-update', args: ut.input, expect: ut.expect as any },
      pass, detail,
    });
  }

  // Phase 3 C1 Commit 1 — L1 validation tests for migrated constraints.
  // These verify the migration from mcp-hub-validation.ts → CONSOLIDATED_SCHEMAS
  // works correctly. Both schemas exist in commit 1; L2 is deleted in commit 3.
  const phase3C1Tests = [
    // === Registry.register migrated constraints ===
    {
      name: '56. L1 REGISTRY.REGISTER — uppercase name rejected (kebab regex migration)',
      input: { action: 'register', name: 'MyService', description: 'long enough description ok', endpoint: 'https://example.com/mcp', version: '1.0.0', category: 'data-services' },
      toolName: 'registry',
      expect: 'reject' as const,
    },
    {
      name: '57. L1 REGISTRY.REGISTER — description with HTML rejected (charset regex)',
      input: { action: 'register', name: 'valid-name', description: 'bad <script>alert</script>', endpoint: 'https://example.com/mcp', version: '1.0.0', category: 'data-services' },
      toolName: 'registry',
      expect: 'reject' as const,
    },
    {
      name: '58. L1 REGISTRY.REGISTER — data: endpoint rejected (mcp/http refine)',
      input: { action: 'register', name: 'valid-name', description: 'long enough description ok', endpoint: 'data:text/plain,xxx', version: '1.0.0', category: 'data-services' },
      toolName: 'registry',
      expect: 'reject' as const,
    },
    {
      name: '59. L1 REGISTRY.REGISTER — non-semver version rejected',
      input: { action: 'register', name: 'valid-name', description: 'long enough description ok', endpoint: 'https://example.com/mcp', version: 'v1.0.0-beta', category: 'data-services' },
      toolName: 'registry',
      expect: 'reject' as const,
    },
    {
      name: '60. L1 REGISTRY.REGISTER — happy path accepted + authType defaults to NONE',
      input: { action: 'register', name: 'valid-name', description: 'long enough description ok', endpoint: 'https://example.com/mcp', version: '1.0.0', category: 'data-services' },
      toolName: 'registry',
      expect: 'accept' as const,
      assertData: (d: any) => d.authType === 'NONE' ? null : `BC76 N3 REGRESSION: authType default not applied; got ${JSON.stringify(d.authType)}`,
    },
    // === Fan-out test — sec-ops + LEAD's critical concern ===
    {
      name: '61. L1 REGISTRY.LIST — authType default does NOT fan-out (LEAD option A action-discriminator)',
      input: { action: 'list' },
      toolName: 'registry',
      expect: 'accept' as const,
      assertData: (d: any) => d.authType === undefined ? null : `FAN-OUT FAIL: authType=${JSON.stringify(d.authType)} leaked into registry.list; expected undefined`,
    },
    {
      name: '62. L1 REGISTRY.UPDATE — authType default does NOT fan-out to update',
      input: { action: 'update', serviceId: 'caaabbbcccdddeeefffggghhh', updates: { description: 'updated description ok' } },
      toolName: 'registry',
      expect: 'accept' as const,
      assertData: (d: any) => d.authType === undefined ? null : `FAN-OUT FAIL: authType=${JSON.stringify(d.authType)} leaked into registry.update`,
    },
    // === Services.call migrated refines ===
    {
      name: '63. L1 SERVICES.CALL — 25KB+ arguments rejected (DoS refine migration)',
      input: { action: 'call', targetService: 'svc', tool: 't', arguments: { big: 'x'.repeat(25_001) } },
      toolName: 'services',
      expect: 'reject' as const,
    },
    {
      name: '64. L1 SERVICES.CALL — 24KB arguments accepted (boundary)',
      input: { action: 'call', targetService: 'svc', tool: 't', arguments: { ok: 'x'.repeat(24_000) } },
      toolName: 'services',
      expect: 'accept' as const,
    },
    {
      name: '65. L1 SERVICES.CALL — <script> injection in arguments rejected',
      input: { action: 'call', targetService: 'svc', tool: 't', arguments: { x: '<script>alert(1)</script>' } },
      toolName: 'services',
      expect: 'reject' as const,
    },
    {
      name: '66. L1 SERVICES.CALL — data: base64 injection in arguments rejected (sec-ops cross-trust)',
      input: { action: 'call', targetService: 'svc', tool: 't', arguments: { x: 'data:text/html;base64,PHNjcmlwdD4=' } },
      toolName: 'services',
      expect: 'reject' as const,
    },
    {
      name: '67. L1 SERVICES.CALL — inline event handler injection rejected (sec-ops cross-trust)',
      input: { action: 'call', targetService: 'svc', tool: 't', arguments: { html: '<img onerror=alert(1)>' } },
      toolName: 'services',
      expect: 'reject' as const,
    },
    {
      name: '68. L1 SERVICES.CALL — file: URL injection rejected (sec-ops cross-trust)',
      input: { action: 'call', targetService: 'svc', tool: 't', arguments: { uri: 'file:///etc/passwd' } },
      toolName: 'services',
      expect: 'reject' as const,
    },
    {
      name: '69. L1 SERVICES.CALL — dynamic import() injection rejected (sec-ops cross-trust)',
      input: { action: 'call', targetService: 'svc', tool: 't', arguments: { code: 'import("evil.js")' } },
      toolName: 'services',
      expect: 'reject' as const,
    },
    {
      name: '70. L1 SERVICES.CALL — false positive check (prose containing word "script")',
      input: { action: 'call', targetService: 'svc', tool: 't', arguments: { prose: 'this is a documentation snippet about my script-based pipeline' } },
      toolName: 'services',
      expect: 'accept' as const,
    },
    // === workflow.cancel.reason.max migration ===
    {
      name: '71. L1 WORKFLOW.CANCEL — reason > 500 chars rejected (migrated FIELD_LIMITS.SHORT_TEXT)',
      input: { action: 'workflow.cancel', executionId: 'cqqqsamplecuid1234567890zx', reason: 'x'.repeat(501) },
      toolName: 'services',
      expect: 'reject' as const,
    },
    {
      name: '72. L1 WORKFLOW.CANCEL — reason at 500 chars accepted (boundary)',
      input: { action: 'workflow.cancel', executionId: 'cqqqsamplecuid1234567890zx', reason: 'x'.repeat(500) },
      toolName: 'services',
      expect: 'accept' as const,
    },
    // === Phase 3 C1 Commit 3 — unique authType coverage migrated from #42-44 ===
    {
      name: '73. L1 REGISTRY.REGISTER — invalid authType rejected (enum, N3 closure superseded)',
      input: { action: 'register', name: 'valid-name', description: 'long enough description ok', endpoint: 'https://example.com/mcp', version: '1.0.0', category: 'data-services', authType: 'TOTALLY_WRONG' },
      toolName: 'registry',
      expect: 'reject' as const,
    },
    {
      name: '74. L1 REGISTRY.REGISTER — explicit authType=API_KEY preserved through transform (default applies only when undefined)',
      input: { action: 'register', name: 'valid-name', description: 'long enough description ok', endpoint: 'https://example.com/mcp', version: '1.0.0', category: 'data-services', authType: 'API_KEY' },
      toolName: 'registry',
      expect: 'accept' as const,
      assertData: (d: any) => d.authType === 'API_KEY' ? null : `TRANSFORM REGRESSION: explicit authType=API_KEY overwritten to ${JSON.stringify(d.authType)}`,
    },
  ];
  for (const t of phase3C1Tests) {
    let pass = false;
    let detail = '';
    try {
      const schema = CONSOLIDATED_SCHEMAS[t.toolName].inputSchema;
      const parsed = schema.safeParse(t.input);
      if (t.expect === 'reject') {
        if (!parsed.success) { pass = true; detail = 'rejected as expected'; }
        else { pass = false; detail = `expected REJECT but got ACCEPT: ${JSON.stringify(parsed.data).slice(0, 100)}`; }
      } else {
        if (parsed.success) {
          if ((t as any).assertData) {
            const err = (t as any).assertData(parsed.data);
            if (err === null) { pass = true; detail = 'accepted + assertion passed'; }
            else { pass = false; detail = `accepted but assertion failed: ${err}`; }
          } else { pass = true; detail = 'accepted as expected'; }
        } else { pass = false; detail = `expected ACCEPT got REJECT: ${JSON.stringify(parsed.error.errors).slice(0, 200)}`; }
      }
    } catch (err) { pass = false; detail = `THREW: ${(err as Error).message}`; }
    results.push({
      test: { name: t.name, closes: 'Phase 3 C1 — L1 migration verification', toolName: t.toolName, args: t.input, expect: t.expect as any },
      pass, detail,
    });
  }

  // R6 — verify the helper THROWS on bad toolName (config-drift bug surfaces loud).
  // Done outside the main loop because it's an exception-asserting test, not a
  // schema-accept/reject test.
  let throwTestPass = false;
  let throwTestDetail = '';
  try {
    validateDispatchArgs('nonexistent_tool_typo', { action: 'pov.list' });
    throwTestPass = false;
    throwTestDetail = 'expected throw on missing CONSOLIDATED_SCHEMAS entry; got silent return';
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('CONSOLIDATED_SCHEMAS') && msg.includes('nonexistent_tool_typo')) {
      throwTestPass = true;
      throwTestDetail = `threw as expected: ${msg.slice(0, 100)}`;
    } else {
      throwTestPass = false;
      throwTestDetail = `threw but message unexpected: ${msg}`;
    }
  }
  results.push({
    test: {
      name: '15. THROW-ON-CONFIG-DRIFT — bad toolName throws (per arch-review A3)',
      closes: 'Phantom-canonical-variant defense — lookup miss is loud, not silent',
      toolName: 'nonexistent_tool_typo',
      args: { action: 'pov.list' },
      expect: 'reject', // semantic only; actual mechanism is throw
    },
    pass: throwTestPass,
    detail: throwTestDetail,
  });

  // sec-ops Finding B (Phase 3 C1, 2026-05-16) — assertEndpointSafe runtime
  // SSRF gate. Unit-style tests on the helper function directly (not via
  // dispatch boundary — SSRF is runtime, not Zod-statically-validateable).
  // BLOCKED_DOMAINS cases enumerated per follow-up doc.
  const { assertEndpointSafe } = require('../lib/mcp/server/tools/hub/hub-utilities');
  const endpointSafetyTests = [
    {
      name: '75. ASSERT-ENDPOINT-SAFE — AWS metadata endpoint rejected (169.254.169.254)',
      endpoint: 'http://169.254.169.254/mcp',
      opts: { action: 'register' },
      expect: 'throw' as const,
    },
    {
      name: '76. ASSERT-ENDPOINT-SAFE — localhost endpoint rejected',
      endpoint: 'http://localhost:5432/mcp',
      opts: { action: 'register' },
      expect: 'throw' as const,
    },
    {
      name: '77. ASSERT-ENDPOINT-SAFE — RFC 1918 private endpoint rejected (10.0.0.1)',
      endpoint: 'http://10.0.0.1/mcp',
      opts: { action: 'register' },
      expect: 'throw' as const,
    },
    {
      name: '78. ASSERT-ENDPOINT-SAFE — IPv6 loopback endpoint rejected ([::1])',
      endpoint: 'http://[::1]/mcp',
      opts: { action: 'register' },
      expect: 'throw' as const,
    },
    {
      name: '79. ASSERT-ENDPOINT-SAFE — public HTTPS endpoint accepted (happy path)',
      endpoint: 'https://example.com/mcp',
      opts: { action: 'register' },
      expect: 'accept' as const,
    },
    {
      name: '80. ASSERT-ENDPOINT-SAFE — exempt service bypasses check even with private IP (update path)',
      endpoint: 'http://10.0.0.1/mcp',
      // SSRF_EXEMPT_SERVICES at lib/mcp/server/config/service-call-policy.js
      // matches by name OR id. snowflake-service is a seeded internal first-
      // party service in that allowlist (Docker-bootstrapped on platform install).
      opts: { existingService: { id: 'snowflake-service', name: 'snowflake-service' }, action: 'update' },
      expect: 'accept' as const,
    },
  ];
  for (const et of endpointSafetyTests) {
    let pass = false;
    let detail = '';
    try {
      assertEndpointSafe(et.endpoint, et.opts);
      if (et.expect === 'accept') { pass = true; detail = 'accepted as expected'; }
      else { pass = false; detail = `expected THROW but accepted: ${et.endpoint}`; }
    } catch (err) {
      const msg = (err as Error).message;
      if (et.expect === 'throw') {
        if (msg.includes('blocked')) { pass = true; detail = `rejected: ${msg.slice(0, 80)}`; }
        else { pass = false; detail = `threw but unexpected message: ${msg}`; }
      } else {
        pass = false; detail = `expected ACCEPT but threw: ${msg}`;
      }
    }
    results.push({
      test: { name: et.name, closes: 'sec-ops Finding B — SSRF asymmetry register vs update', toolName: 'registry.register', args: { endpoint: et.endpoint }, expect: et.expect === 'throw' ? 'reject' : 'accept' },
      pass, detail,
    });
  }

  // Phase 4 (2026-05-16) — engine.validate() invariants Zod can't express.
  // Conditional mode 1-3 steps + retry budget interaction.
  const { OrchestrationEngine } = require('../lib/services/workflow/core/orchestration-engine');
  const engine = new OrchestrationEngine();
  const engineValidateTests = [
    {
      name: '81. ENGINE.VALIDATE — conditional mode with 4 steps rejected (invariant #3)',
      params: {
        executionMode: 'conditional',
        steps: [
          { service: 's', tool: 't' },
          { service: 's', tool: 't' },
          { service: 's', tool: 't' },
          { service: 's', tool: 't' },
        ],
      },
      expect: 'invalid' as const,
      contains: '1-3 steps',
    },
    {
      name: '82. ENGINE.VALIDATE — conditional mode with 3 steps accepted (invariant #3 boundary)',
      params: {
        executionMode: 'conditional',
        steps: [
          { service: 's', tool: 't' },
          { service: 's', tool: 't' },
          { service: 's', tool: 't' },
        ],
      },
      expect: 'valid' as const,
    },
    {
      name: '83. ENGINE.VALIDATE — sum(step.retries) > maxTotalRetries rejected (invariant #4)',
      params: {
        executionMode: 'sequential',
        maxTotalRetries: 5,
        steps: [
          { service: 's', tool: 't', retries: 4 },
          { service: 's', tool: 't', retries: 3 }, // 4 + 3 = 7 > 5
        ],
      },
      expect: 'invalid' as const,
      contains: 'exceeds maxTotalRetries',
    },
    {
      name: '84. ENGINE.VALIDATE — sum(step.retries) <= maxTotalRetries accepted (invariant #4 boundary)',
      params: {
        executionMode: 'sequential',
        maxTotalRetries: 10,
        steps: [
          { service: 's', tool: 't', retries: 4 },
          { service: 's', tool: 't', retries: 4 }, // 4 + 4 = 8 <= 10
        ],
      },
      expect: 'valid' as const,
    },
  ];
  for (const et of engineValidateTests) {
    let pass = false;
    let detail = '';
    try {
      const result = engine.validate(et.params);
      if (et.expect === 'valid') {
        if (result.isValid) { pass = true; detail = 'accepted as expected'; }
        else { pass = false; detail = `expected VALID but got errors: ${result.errors.join('; ')}`; }
      } else {
        if (!result.isValid) {
          if (et.contains && !result.errors.some((e: string) => e.includes(et.contains!))) {
            pass = false; detail = `rejected but expected message containing "${et.contains}", got: ${result.errors.join('; ')}`;
          } else {
            pass = true; detail = `rejected: ${result.errors.join('; ').slice(0, 100)}`;
          }
        } else {
          pass = false; detail = 'expected INVALID but got isValid=true';
        }
      }
    } catch (err) {
      pass = false; detail = `THREW: ${(err as Error).message}`;
    }
    results.push({
      test: { name: et.name, closes: 'Phase 4 engine.validate() invariants (3 conditional mode, 4 retry budget)', toolName: 'workflow.execute', args: et.params as any, expect: et.expect === 'invalid' ? 'reject' : 'accept' },
      pass, detail,
    });
  }

  // Sec-ops Finding C (2026-05-17) — depth + leaf-count caps on forwarded args.
  // Symmetric coverage: services.call.arguments AND services.steps[].arguments.
  // Build a depth-9 nested object + a 101-leaf flat object for boundary testing.
  function nestObj(depth: number): any {
    let o: any = 'leaf';
    for (let i = 0; i < depth; i++) o = { x: o };
    return o;
  }
  const deepDepth9 = nestObj(9);
  const deepDepth8 = nestObj(8);
  const leaf101: Record<string, number> = {};
  for (let i = 0; i < 101; i++) leaf101[`k${i}`] = i;
  const leaf100: Record<string, number> = {};
  for (let i = 0; i < 100; i++) leaf100[`k${i}`] = i;

  const argsShapeTests = [
    {
      name: '85. ARGS-SHAPE — services.call args depth-9 rejected (depth-bomb)',
      input: { action: 'call', targetService: 'svc', tool: 't', arguments: deepDepth9 },
      toolName: 'services',
      expect: 'reject' as const,
    },
    {
      name: '86. ARGS-SHAPE — services.call args depth-8 accepted (depth boundary)',
      input: { action: 'call', targetService: 'svc', tool: 't', arguments: deepDepth8 },
      toolName: 'services',
      expect: 'accept' as const,
    },
    {
      name: '87. ARGS-SHAPE — services.call args 101 leaves rejected (leaf-bomb)',
      input: { action: 'call', targetService: 'svc', tool: 't', arguments: leaf101 },
      toolName: 'services',
      expect: 'reject' as const,
    },
    {
      name: '88. ARGS-SHAPE — services.call args 100 leaves accepted (leaf boundary)',
      input: { action: 'call', targetService: 'svc', tool: 't', arguments: leaf100 },
      toolName: 'services',
      expect: 'accept' as const,
    },
    {
      name: '89. ARGS-SHAPE — services.steps[].args depth-9 rejected (symmetric coverage)',
      input: { action: 'workflow.execute', steps: [{ service: 's', tool: 't', arguments: deepDepth9 }] },
      toolName: 'services',
      expect: 'reject' as const,
    },
    {
      name: '90. ARGS-SHAPE — services.steps[].args depth-8 accepted (symmetric boundary)',
      input: { action: 'workflow.execute', steps: [{ service: 's', tool: 't', arguments: deepDepth8 }] },
      toolName: 'services',
      expect: 'accept' as const,
    },
    {
      name: '91. ARGS-SHAPE — services.steps[].args 101 leaves rejected (symmetric)',
      input: { action: 'workflow.execute', steps: [{ service: 's', tool: 't', arguments: leaf101 }] },
      toolName: 'services',
      expect: 'reject' as const,
    },
    {
      name: '92. ARGS-SHAPE — services.steps[].args 100 leaves accepted (symmetric boundary)',
      input: { action: 'workflow.execute', steps: [{ service: 's', tool: 't', arguments: leaf100 }] },
      toolName: 'services',
      expect: 'accept' as const,
    },
  ];
  for (const t of argsShapeTests) {
    let pass = false;
    let detail = '';
    try {
      const schema = CONSOLIDATED_SCHEMAS[t.toolName].inputSchema;
      const parsed = schema.safeParse(t.input);
      if (t.expect === 'reject') {
        if (!parsed.success) { pass = true; detail = 'rejected as expected'; }
        else { pass = false; detail = `expected REJECT but got ACCEPT`; }
      } else {
        if (parsed.success) { pass = true; detail = 'accepted as expected'; }
        else { pass = false; detail = `expected ACCEPT but got REJECT: ${JSON.stringify(parsed.error.errors).slice(0, 200)}`; }
      }
    } catch (err) {
      pass = false; detail = `THREW: ${(err as Error).message}`;
    }
    results.push({
      test: { name: t.name, closes: 'sec-ops Finding C — depth/leaf caps with symmetric coverage', toolName: t.toolName, args: t.input as any, expect: t.expect },
      pass, detail,
    });
  }

  // Phase 3 D (2026-05-18) — action-correlated required-fields refine on
  // registry. Closes the architectural-review F3 concern: schema layer
  // couldn't express "required-when-action=X" today, so handler-level
  // checks were the only enforcement. Schema now enforces; handlers stay
  // as defense-in-depth.
  const registryActionRefinedTests = [
    {
      name: '99. REGISTRY.DELETE — confirm missing rejected (load-bearing GDPR safeguard)',
      input: { action: 'delete', serviceId: 'caaabbbcccdddeeefffggghhh' },
      expect: 'reject' as const,
      // 2026-07-27: was pinned to 'confirm: true is required', a phrasing the
      // refine no longer uses. The GUARD never regressed — both cases still
      // reject; only the message was reworded to be more actionable. Re-pinned
      // to the actionable token the caller must act on, which is the part least
      // likely to be reworded again. See [[feedback_string_pinned_tests]]:
      // rewriting a user-facing message means auditing the string assertions
      // that pin it in the same commit.
      contains: 'confirm: true',
    },
    {
      name: '100. REGISTRY.DELETE — confirm: false rejected (boundary)',
      input: { action: 'delete', serviceId: 'caaabbbcccdddeeefffggghhh', confirm: false },
      expect: 'reject' as const,
      contains: 'confirm: true',
    },
    {
      name: '101. REGISTRY.DELETE — confirm: true accepted',
      input: { action: 'delete', serviceId: 'caaabbbcccdddeeefffggghhh', confirm: true },
      expect: 'accept' as const,
    },
    {
      name: '102. REGISTRY.REGISTER — missing name rejected',
      input: { action: 'register', endpoint: 'https://example.com/mcp', description: 'long enough description ok', version: '1.0.0', category: 'data-services' },
      expect: 'reject' as const,
      contains: 'name is required',
    },
    {
      name: '103. REGISTRY.REGISTER — missing endpoint rejected',
      input: { action: 'register', name: 'valid-name', description: 'long enough description ok', version: '1.0.0', category: 'data-services' },
      expect: 'reject' as const,
      contains: 'endpoint is required',
    },
    {
      name: '104. REGISTRY.TOOLS — missing serviceId AND service_name rejected',
      input: { action: 'tools' },
      expect: 'reject' as const,
      contains: 'requires serviceId or service_name',
    },
    {
      name: '105. REGISTRY.TOOLS — serviceId provided accepted',
      input: { action: 'tools', serviceId: 'caaabbbcccdddeeefffggghhh' },
      expect: 'accept' as const,
    },
    {
      name: '106. REGISTRY.UPDATE — missing serviceId AND service_name rejected',
      input: { action: 'update', updates: { description: 'longer than 10 chars' } },
      expect: 'reject' as const,
      contains: 'requires serviceId or service_name',
    },
  ];
  for (const t of registryActionRefinedTests) {
    let pass = false;
    let detail = '';
    try {
      const schema = CONSOLIDATED_SCHEMAS.registry.inputSchema;
      const parsed = schema.safeParse(t.input);
      if (t.expect === 'reject') {
        if (!parsed.success) {
          if (t.contains && !parsed.error.errors.some((e: any) => (e.message || '').includes(t.contains!))) {
            pass = false; detail = `rejected but wrong message; got: ${JSON.stringify(parsed.error.errors).slice(0, 200)}`;
          } else {
            pass = true; detail = `rejected: ${parsed.error.errors.map((e: any) => e.message).join('; ').slice(0, 100)}`;
          }
        } else {
          pass = false; detail = `expected REJECT but got ACCEPT`;
        }
      } else {
        if (parsed.success) { pass = true; detail = 'accepted as expected'; }
        else { pass = false; detail = `expected ACCEPT but got REJECT: ${JSON.stringify(parsed.error.errors).slice(0, 200)}`; }
      }
    } catch (err) {
      pass = false; detail = `THREW: ${(err as Error).message}`;
    }
    results.push({
      test: { name: t.name, closes: 'Phase 3 D — action-correlated required fields refine', toolName: 'registry', args: t.input as any, expect: t.expect },
      pass, detail,
    });
  }

  // Phase 1.5 (2026-05-17) — wrapWithSchema lifts GS14 enforcement to the
  // embedded-server registration site. Verify the wrapper runs safeParse +
  // returns the standard errorResponse on failure, AND invokes the inner
  // handler with the validated data on success.
  const { wrapWithSchema } = require('../lib/mcp/server/tools/dispatchers/dispatch-with-schema');
  let wrapPassReject = false; let wrapPassAccept = false; let wrapPassThrow = false;
  let wrapDetailReject = ''; let wrapDetailAccept = ''; let wrapDetailThrow = '';
  // Test wrapper rejects bad input + returns errorResponse (not throws)
  try {
    const wrapped = wrapWithSchema('project', async (validatedArgs: any) => {
      return { unexpected: 'handler should NOT have been called', args: validatedArgs };
    });
    const result = await wrapped({ action: 'bogus.action' }, {});
    if (result && result.isError === true && Array.isArray(result.content)) {
      wrapPassReject = true; wrapDetailReject = 'returned errorResponse, did not invoke handler';
    } else {
      wrapPassReject = false; wrapDetailReject = `handler was invoked OR wrong shape: ${JSON.stringify(result).slice(0, 100)}`;
    }
  } catch (err) { wrapPassReject = false; wrapDetailReject = `THREW unexpectedly: ${(err as Error).message}`; }
  results.push({
    test: { name: '96. WRAP-WITH-SCHEMA — bad args returns errorResponse (handler NOT invoked)',
            closes: 'Phase 1.5 — structural GS14 enforcement at registration', toolName: 'wrapWithSchema',
            args: { action: 'bogus.action' }, expect: 'reject' },
    pass: wrapPassReject, detail: wrapDetailReject,
  });
  // Test wrapper invokes inner handler with validated data on success
  try {
    let receivedArgs: any = null;
    const wrapped = wrapWithSchema('project', async (validatedArgs: any) => {
      receivedArgs = validatedArgs;
      return { content: [{ type: 'text', text: 'ok' }] };
    });
    await wrapped({ action: 'pov.list' }, {});
    if (receivedArgs && receivedArgs.action === 'pov.list') {
      wrapPassAccept = true; wrapDetailAccept = 'handler invoked with validated args';
    } else {
      wrapPassAccept = false; wrapDetailAccept = `handler received unexpected args: ${JSON.stringify(receivedArgs).slice(0, 100)}`;
    }
  } catch (err) { wrapPassAccept = false; wrapDetailAccept = `THREW: ${(err as Error).message}`; }
  results.push({
    test: { name: '97. WRAP-WITH-SCHEMA — valid args invoke handler with validated data',
            closes: 'Phase 1.5 — wrapper passes through validated.data', toolName: 'wrapWithSchema',
            args: { action: 'pov.list' }, expect: 'accept' },
    pass: wrapPassAccept, detail: wrapDetailAccept,
  });
  // Test wrapper throws on unknown toolName (config drift defense — same as direct validateDispatchArgs)
  try {
    const wrapped = wrapWithSchema('nonexistent_tool_typo', async () => ({ ok: true }));
    await wrapped({ action: 'x' }, {});
    wrapPassThrow = false; wrapDetailThrow = 'expected THROW on unknown toolName but did not throw';
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('CONSOLIDATED_SCHEMAS') && msg.includes('nonexistent_tool_typo')) {
      wrapPassThrow = true; wrapDetailThrow = `threw as expected: ${msg.slice(0, 80)}`;
    } else {
      wrapPassThrow = false; wrapDetailThrow = `threw but unexpected message: ${msg}`;
    }
  }
  results.push({
    test: { name: '98. WRAP-WITH-SCHEMA — config drift throws (unknown toolName via wrapper)',
            closes: 'Phase 1.5 — config-drift defense preserved through wrapper', toolName: 'nonexistent_tool_typo',
            args: { action: 'x' }, expect: 'reject' },
    pass: wrapPassThrow, detail: wrapDetailThrow,
  });

  // Phase 2 chunk 2 deferred — F1 + Finding D (shipped 2026-05-17).
  // F1: registry.register.capabilities.tools[].inputSchema is DB-persisted
  // (mCPTool.capabilities JSON column) AND re-served via registry.tools.
  // Cross-trust through the DB — shallow strip would leave depth-1+
  // pollution intact. Swap to deepStripDangerousKeys at L1.
  let f1Pass = false; let f1Detail = '';
  try {
    const schema = CONSOLIDATED_SCHEMAS.registry.inputSchema;
    const parsed = schema.safeParse({
      action: 'register',
      name: 'svc',
      description: 'long enough description for the schema regex check',
      endpoint: 'https://example.com/mcp',
      version: '1.0.0',
      category: 'data-services',
      capabilities: {
        tools: [{
          name: 'tool1',
          inputSchema: {
            type: 'object',
            properties: { nested: { __proto__: { polluted: true } } },
          },
        }],
      },
    });
    if (!parsed.success) { f1Pass = false; f1Detail = `parse rejected: ${JSON.stringify(parsed.error.errors).slice(0, 200)}`; }
    else {
      const props = parsed.data.capabilities?.tools?.[0]?.inputSchema?.properties;
      const nested = props?.nested;
      if (nested && Object.prototype.hasOwnProperty.call(nested, '__proto__')) {
        f1Pass = false;
        f1Detail = `F1 FAIL: depth-1 __proto__ survived in inputSchema.properties.nested`;
      } else {
        f1Pass = true;
        f1Detail = 'depth-1 __proto__ in tools[].inputSchema.properties.nested stripped';
      }
    }
  } catch (err) { f1Pass = false; f1Detail = `THREW: ${(err as Error).message}`; }
  results.push({
    test: { name: '94. F1 — registry.register tools[].inputSchema.properties depth-1 strip',
            closes: 'F1 — registry.register capabilities DB-persisted; shallow → deep',
            toolName: 'registry', args: { action: 'register', capabilities: '...' }, expect: 'accept' },
    pass: f1Pass, detail: f1Detail,
  });

  // Finding D — empty updates {} should reject (was silent no-op timestamp bump).
  let dPass = false; let dDetail = '';
  try {
    const parsed = ServiceUpdateHandlerInputSchema.safeParse({
      serviceId: 'caaabbbcccdddeeefffggghhh',
      updates: {},
    });
    if (!parsed.success && parsed.error.errors.some((e: any) =>
        (e.message || '').includes('updates must contain at least one field'))) {
      dPass = true; dDetail = 'rejected as expected';
    } else if (!parsed.success) {
      dPass = false; dDetail = `rejected but wrong message: ${JSON.stringify(parsed.error.errors).slice(0, 200)}`;
    } else {
      dPass = false; dDetail = 'expected REJECT but got ACCEPT — empty updates passed';
    }
  } catch (err) { dPass = false; dDetail = `THREW: ${(err as Error).message}`; }
  results.push({
    test: { name: '95. SERVICE-UPDATE — empty updates {} rejected (Finding D no-op closure)',
            closes: 'Finding D — empty updates was silent no-op timestamp bump',
            toolName: 'service-update', args: { updates: {} }, expect: 'reject' },
    pass: dPass, detail: dDetail,
  });

  // F3 TS-side closure (2026-05-17) — MCPOrchestrationParamsSchema must
  // propagate `maxTotalRetries` from caller to validated data. This is the
  // canonical engine schema used by mcpOrchestrationHandler.ts (REST API
  // entry); before this fix, mcpOrchestrationHandler.ts:201 hardcoded
  // maxTotalRetries:10, silently dropping caller input. The schema parse
  // is the guarantee that params.maxTotalRetries exists when the handler
  // passes it to engine.execute.
  const { MCPOrchestrationParamsSchema: EngineSchema } = require('../lib/services/workflow/types/orchestration-params');
  let f3tsPass = false; let f3tsDetail = '';
  try {
    const parsed = EngineSchema.safeParse({
      steps: [{ service: 's', tool: 't', arguments: {} }],
      maxTotalRetries: 5,
    });
    if (parsed.success && parsed.data.maxTotalRetries === 5) {
      f3tsPass = true; f3tsDetail = 'parsed and propagated maxTotalRetries=5';
    } else if (parsed.success) {
      f3tsPass = false; f3tsDetail = `parsed but maxTotalRetries=${parsed.data.maxTotalRetries} not 5`;
    } else {
      f3tsPass = false; f3tsDetail = `parse failed: ${JSON.stringify(parsed.error.errors).slice(0, 200)}`;
    }
  } catch (err) { f3tsPass = false; f3tsDetail = `THREW: ${(err as Error).message}`; }
  results.push({
    test: { name: '93. F3 TS-SIDE — MCPOrchestrationParamsSchema preserves maxTotalRetries (mcpOrchestrationHandler.ts:201 closure)',
            closes: 'F3 parallel — TS REST orchestration path',
            toolName: 'workflow.execute', args: { maxTotalRetries: 5 }, expect: 'accept' },
    pass: f3tsPass, detail: f3tsDetail,
  });

  // Report
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  console.log('\n=== Phase 1 Smoke Test Results ===\n');
  for (const r of results) {
    const sigil = r.pass ? '✅' : '❌';
    console.log(`${sigil} ${r.test.name}`);
    console.log(`   closes: ${r.test.closes}`);
    console.log(`   detail: ${r.detail}\n`);
  }
  console.log(`\nSummary: ${passed}/${results.length} passed (${failed} failed)\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Smoke test runner crashed:', err);
  process.exit(2);
});
