/**
 * NET REGISTRY — structural pins (stage 2b, 2026-09-12).
 *
 * These assert the properties the registry EXISTS to guarantee, and each one replaces a convention
 * that was previously re-remembered per net:
 *
 *   • every entry's `errorFact()` carries `checked:false` + `reason:'enrichment-error'` + a named
 *     BLOCKING disposition where the net has a disposition at all (the G3 lesson — the one arm
 *     meaning "things went wrong" must never render clean);
 *   • `(name, point)` is unique, and a duplicate THROWS at load rather than silently
 *     last-writer-wins under one key;
 *   • render-required is satisfiable only explicitly — a null slot needs a recorded reason;
 *   • every net's `name` is on `RESULT_JSON_SUMMARY_KEYS`, because registering a net and
 *     whitelisting its key are two different acts and the strict pick drops an unlisted key with no
 *     error (E3b).
 *
 * There is deliberately NO assertion here about the reasons `enrich` can return. A registry-level
 * reason allowlist is the exact mechanism that would break lane-first arm ordering, which is
 * per-net and load-bearing.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MECHANICAL_NETS } = require('../lib/agents/harness/mechanical-nets') as typeof import('../lib/agents/harness/mechanical-nets');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertRegistryWellFormed, runNetsAtPoint } = require('../lib/agents/harness/net-registry') as typeof import('../lib/agents/harness/net-registry');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RESULT_JSON_SUMMARY_KEYS } = require('../lib/services/execution-artifacts') as typeof import('../lib/services/execution-artifacts');

const CARD_SRC = require('fs').readFileSync(
  require('path').resolve(__dirname, '../lib/mcp/server/tools/advanced/lean-card-facts.js'), 'utf8');

let failed = 0;
const check = (n: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${n}${ok ? '' : '  ' + extra}`);
  if (!ok) failed++;
};

const DISPOSITION_KEYS = ['containmentDisposition', 'rollbackDisposition'];

(async () => {
  check('R0: the registry is non-empty and well-formed', (() => {
    try { assertRegistryWellFormed(MECHANICAL_NETS); return MECHANICAL_NETS.length > 0; }
    catch (e) { return `${e}` as unknown as boolean; }
  })() === true, `${MECHANICAL_NETS.length} entries`);

  // ── errorFact contract, asserted for EVERY entry rather than remembered per net ───────────────
  for (const net of MECHANICAL_NETS) {
    const f = net.errorFact() as Record<string, unknown>;
    check(`R1 ${net.name}@${net.point}: errorFact is checked:false + reason enrichment-error`,
      f.checked === false && f.reason === 'enrichment-error', JSON.stringify(f));

    const dispKey = DISPOSITION_KEYS.find((k) => k in f);
    if (dispKey) {
      const d = f[dispKey] as { disposition?: string; reason?: string };
      check(`R2 ${net.name}@${net.point}: errorFact's ${dispKey} is BLOCKING with a named reason`,
        d?.disposition === 'blocking' && typeof d?.reason === 'string' && d.reason.length > 0,
        JSON.stringify(d));
    }

    // PURE and zero-argument: two calls must be deep-equal and neither may touch the world.
    check(`R3 ${net.name}@${net.point}: errorFact() is pure (stable across calls)`,
      JSON.stringify(net.errorFact()) === JSON.stringify(f));

    check(`R4 ${net.name}@${net.point}: name is on RESULT_JSON_SUMMARY_KEYS (E3b — an unlisted key is dropped silently)`,
      (RESULT_JSON_SUMMARY_KEYS as readonly string[]).includes(net.name));

    check(`R5 ${net.name}@${net.point}: render decision is EXPLICIT (both slots set, or a recorded reason)`,
      (net.renderCard !== null && net.renderPrompt !== null) || !!net.renderNullReason);

    // R5b: a net cannot CLAIM a card render it does not have. `renderCard` names a file rather
    // than carrying a function (lean-card-facts.js is CommonJS and cannot require TypeScript), so
    // the declaration is only worth anything if something checks it — otherwise render-required
    // degrades into a field everyone sets to the truthy value and nobody verifies.
    if (net.renderCard === 'lean-card-facts') {
      check(`R5b ${net.name}@${net.point}: lean-card-facts.js actually renders it`,
        CARD_SRC.includes(net.name));
    }
  }

  // ── R6: a duplicate (name, point) THROWS. Mutation-shaped: build the bad registry and require
  // the failure, rather than asserting the good one passes (which proves nothing about the guard).
  check('R6: a duplicate (name, point) is refused at load, not silently last-writer-wins', (() => {
    try {
      assertRegistryWellFormed([MECHANICAL_NETS[0], MECHANICAL_NETS[0]]);
      return false;
    } catch { return true; }
  })());

  check('R6b: a null render slot WITHOUT a reason is refused (render-required cannot be met by omission)', (() => {
    try {
      assertRegistryWellFormed([{ ...MECHANICAL_NETS[0], renderCard: null, renderNullReason: undefined }]);
      return false;
    } catch { return true; }
  })());

  // ── R7: THE GUARANTEE. A net whose enrich throws still STAMPS — its errorFact. The only way to
  // produce nothing is to be absent from the registry.
  {
    const stamped: Record<string, unknown> = {};
    const thrower = {
      ...MECHANICAL_NETS[0],
      appliesTo: () => true,
      enrich: async () => { throw new Error('boom'); },
    };
    let sawError = false;
    await runNetsAtPoint(thrower.point, {} as never, [thrower], (n, f) => { stamped[n] = f; },
      () => { sawError = true; });
    check('R7: a throwing net still stamps its errorFact (inert only by returning an inert fact)',
      stamped[thrower.name] !== undefined
        && (stamped[thrower.name] as Record<string, unknown>).reason === 'enrichment-error'
        && sawError,
      JSON.stringify(stamped));
  }

  // ── R8: two invocation POINTS of one loop — the shape net #3 forced. A point filter that ignored
  // `point` would stamp the Author's compute at the leg SYNTHESIZE, which is the recomputation the
  // hoist exists to prevent.
  {
    const names = MECHANICAL_NETS.filter((n) => n.point === 'leaf-persist').map((n) => n.name);
    const legNames = MECHANICAL_NETS.filter((n) => n.point === 'leg-synthesize').map((n) => n.name);
    check('R8: at least one net registers at BOTH points under one name (rollbackContainment)',
      names.some((n) => legNames.includes(n)), `leaf ${names} · leg ${legNames}`);
  }

  if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
  console.log(`\n✅ net registry: ${MECHANICAL_NETS.length} entries, errorFact contract + uniqueness + render-required pinned`);
  process.exit(0);
})();
