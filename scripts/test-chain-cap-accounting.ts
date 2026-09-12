/**
 * CHAIN CAP ACCOUNTING (2026-09-12) — the total-context ceiling must measure the SERIALIZED ENTRY,
 * not `finalResponse` alone, and must trim ONLY `finalResponse`.
 *
 * WHY THIS FILE EXISTS. Until today `context-chainer.ts` summed `e.finalResponse.length` for the
 * 512 KB ceiling, so every carried FACT — `markerPresence`, `derivationContainment`,
 * `rollbackContainment`, and each net the registry adds — sat outside the accounting entirely.
 * Those facts are rendered into the §6 prompt and ARE chained context. The defect survived because
 * NO EXISTING TEST COULD TELL THE TWO ACCOUNTINGS APART: every chainer fixture either stays far
 * under the ceiling (where both agree) or carries no facts (where both agree). So test 1 below is
 * built specifically to separate them — it sits the finalResponse total *under* the ceiling and
 * asserts truncation fires anyway, which is false under the old arithmetic by construction.
 *
 * Test 3 is its mirror and is not optional: the same sizes with NO facts must NOT truncate, or the
 * "fix" is indistinguishable from having quietly lowered the ceiling.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chainDependencyContext, TOTAL_CONTEXT_CEILING, PER_PREDECESSOR_SOFT_CAP } =
  require('../lib/agents/harness/context-chainer') as typeof import('../lib/agents/harness/context-chainer');

let failed = 0;
const check = (n: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${n}${ok ? '' : '  ' + extra}`);
  if (!ok) failed++;
};

/** A fact roughly the size the shipping nets carry — the ~790-char honest-limits `scope` note. */
const SCOPE_NOTE = 'x'.repeat(790);
const FACTS = {
  markerPresence: {
    parser: 'parseFencedJsonBlock',
    harvestedAllocations: false, derivedValues: false, consumedValues: false,
  },
  derivationContainment: { checked: true, reason: 'ok', violations: [], scope: SCOPE_NOTE },
};

/**
 * DEPS predecessors, each with a finalResponse just under the per-predecessor cap and a total that
 * lands just under the ceiling — so any truncation observed is the ENTRY overhead, never the text.
 */
const DEPS = 4;
// Sized so the SAME text total lands on opposite sides of the ceiling depending only on whether
// facts ride along: no-facts serialized ≈ 522.8 KB (under), with-facts ≈ 526.6 KB (over). That
// window is the whole point of the fixture — it is what the old arithmetic could not see.
const FR_CHARS = 130500; // < PER_PREDECESSOR_SOFT_CAP (131072): the per-predecessor arm must not fire

function stub(withFacts: boolean) {
  const deps = Array.from({ length: DEPS }, (_, i) => ({
    id: `dep${i}`,
    title: `Predecessor ${i}`,
    agentRole: 'config_change_author',
    type: 'ACTION',
    status: 'COMPLETED',
    executionStatus: 'SUCCESS',
    agentTemplateId: 'tpl',
    metadata: {},
  }));
  // Plain ASCII: JSON.stringify adds no escape bytes, so the arithmetic in the assertions is exact.
  const content = JSON.stringify({
    finalResponse: 'a'.repeat(FR_CHARS),
    confidenceScore: 90,
    ...(withFacts ? FACTS : {}),
  });
  return {
    taskDependency: { findMany: async () => deps.map((d) => ({ dependsOn: d })) },
    agentExecution: {
      // The in-flight probe (status: { in: [...] }) must find nothing; the selector's candidate
      // query must find one SUCCESS execution per dependency.
      findFirst: async (args: { where?: { status?: { in?: string[] } } }) =>
        args?.where?.status?.in ? null : null,
      findMany: async (args: { where?: { taskId?: string } }) => [
        { id: `exec-${args?.where?.taskId}`, status: 'SUCCESS', createdAt: new Date(), supersededById: null },
      ],
    },
    agentArtifact: { findFirst: async () => ({ content }) },
    task: { findUnique: async () => null },
    stage: { findUnique: async () => null },
  } as unknown as Parameters<typeof chainDependencyContext>[1];
}

(async () => {
  ok: {
    check(
      'SETUP: per-predecessor cap is not the arm under test (each finalResponse is under it)',
      FR_CHARS < PER_PREDECESSOR_SOFT_CAP,
      `${FR_CHARS} vs ${PER_PREDECESSOR_SOFT_CAP}`
    );
    check(
      'SETUP: the finalResponse TOTAL is under the ceiling — old accounting cannot truncate here',
      DEPS * FR_CHARS < TOTAL_CONTEXT_CEILING,
      `${DEPS * FR_CHARS} vs ${TOTAL_CONTEXT_CEILING}`
    );
    break ok;
  }

  // ── 1. THE DISCRIMINATOR ────────────────────────────────────────────────────────────────────
  const withFacts = await chainDependencyContext('d1', stub(true));
  const entries = withFacts?.chainedFrom ?? [];
  check('1a: all predecessors chained (nothing dropped for space — truncate, never drop)',
    entries.length === DEPS, `chained ${entries.length}`);

  const frTotal = entries.reduce((s, e) => s + e.finalResponse.length, 0);
  const serializedTotal = entries.reduce((s, e) => s + JSON.stringify(e).length, 0);
  check(
    '1b: DISCRIMINATOR — carried facts push the SERIALIZED total over a ceiling the text total is under',
    DEPS * FR_CHARS < TOTAL_CONTEXT_CEILING && serializedTotal + (DEPS * FR_CHARS - frTotal) > TOTAL_CONTEXT_CEILING,
    `text ${DEPS * FR_CHARS}, serialized-after-trim ${serializedTotal}, ceiling ${TOTAL_CONTEXT_CEILING}`
  );
  check(
    '1c: truncation FIRED — which is false under the old finalResponse-only arithmetic, by construction',
    entries.some((e) => e.truncated === true),
    JSON.stringify(entries.map((e) => ({ id: e.taskId, len: e.finalResponse.length, t: e.truncated })))
  );
  check('1d: the TAIL is trimmed first — the foundational predecessor survives whole',
    entries[0].truncated !== true && entries[entries.length - 1].truncated === true,
    `head ${entries[0].truncated}, tail ${entries[entries.length - 1].truncated}`);

  // ── 2. FACTS ARE COUNTED BUT NEVER CUT ──────────────────────────────────────────────────────
  // A truncated fact is a corrupt fact, and a fact that vanished for space reads ABSENT — a
  // consumer then cannot tell "never stamped" from "dropped", which is the A1 class one layer up.
  for (const e of entries) {
    check(`2: facts intact on ${e.taskId} (counted, never trimmed)`,
      !!e.markerPresence
        && (e.derivationContainment as { scope?: string } | null)?.scope === SCOPE_NOTE,
      JSON.stringify({ mp: !!e.markerPresence, scopeLen: (e.derivationContainment as { scope?: string } | null)?.scope?.length }));
  }

  // ── 3. THE MIRROR — the fix must not read as a quietly lowered ceiling ───────────────────────
  // Identical text, identical count, facts removed. If this truncated too, test 1 would prove only
  // that the ceiling got stricter, not that FACTS are what crossed it.
  const noFacts = await chainDependencyContext('d1', stub(false));
  const plain = noFacts?.chainedFrom ?? [];
  const plainSerialized = plain.reduce((s2, e) => s2 + JSON.stringify(e).length, 0);
  check('3a: with facts removed the serialized total is UNDER the ceiling (the window is real)',
    plainSerialized < TOTAL_CONTEXT_CEILING, `${plainSerialized} vs ${TOTAL_CONTEXT_CEILING}`);
  check('3b: same sizes with NO facts → NO truncation (the ceiling itself is unchanged)',
    plain.length === DEPS && plain.every((e) => e.truncated !== true),
    JSON.stringify(plain.map((e) => ({ len: e.finalResponse.length, t: e.truncated }))));

  if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
  console.log('\n✅ chain cap accounting: serialized entry counted, finalResponse-only trimmed');
  process.exit(0);
})();
