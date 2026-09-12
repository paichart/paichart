/**
 * THE REGISTRY MIGRATION'S ACCEPTANCE (stage 2b, 2026-09-12).
 *
 * For every specimen leg, build `ctx` from ROWS PULLED OUT OF PRODUCTION, run the SHIPPING registry
 * loop, and assert each stamped fact is `JSON.stringify`-identical to the fact PRODUCTION ACTUALLY
 * STAMPED on that leg.
 *
 * ── WHY "WHAT PRODUCTION STAMPED" AND NOT "WHAT THE OLD CODE RETURNS" ──────────────────────────
 * Diffing against a frozen copy of the pre-migration code compares one set of assumptions with a
 * second copy of itself: if the old code and the new code are wrong the same way, the diff is clean
 * and the gate says nothing. Observed output is the only baseline that can disagree with both.
 *
 * ── SPECIMEN WINDOWS, AND WHY EVERY MISMATCH IS TRIAGED ───────────────────────────────────────
 * A leg stamped BEFORE a net's last behavioural change will legitimately differ — pre-H-2 legs
 * carry no `via` records, pre-2026-09-11 legs carry no nested `contractApplicability`. That is
 * exactly the kind of difference a tired reviewer waves through, and once one is waved through the
 * gate has been taught that differences are acceptable. So there is no "expected diff" list by
 * design: a mismatch here is a finding, and the response is to triage it, never to annotate it.
 *
 * Instead, `NET_SPECIMENS` declares ONE SPECIMEN SET PER NET (see it below). A leg that is not
 * declared for a net is NOT COMPARED for that net, and is PRINTED AND COUNTED as NOT COVERED. A net
 * with no in-window specimen at all is therefore loud, not absent — silence and coverage stay
 * distinguishable, which is the single property this gate rests on.
 *
 * Both properties are mutation-verified rather than asserted: falsely declaring one of the
 * currently-uncovered nets as covered produces 7 failures (so `'none'` is withholding a REAL
 * difference, not a phantom), and deleting a net's declaration throws (so a new net cannot arrive
 * without a window decision being made about it).
 *
 * Re-pull with `scripts/pull-net-equivalence-specimens.sh` (read-only). The fixture is committed so
 * the gate runs in CI with no database — an acceptance that needs prod credentials runs once and
 * then rots, which is what the out-of-CI suites in this repo keep demonstrating.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MECHANICAL_NETS } = require('../lib/agents/harness/mechanical-nets') as typeof import('../lib/agents/harness/mechanical-nets');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runNetsAtPoint } = require('../lib/agents/harness/net-registry') as typeof import('../lib/agents/harness/net-registry');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildNetContext } = require('../lib/agents/harness/net-context') as typeof import('../lib/agents/harness/net-context');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isProgramHarnessTask } = require('../lib/agents/harness/program-protocol') as typeof import('../lib/agents/harness/program-protocol');

interface Child {
  id: string; title: string; agentRole: string | null; type: string | null;
  description: string | null; inputContext: unknown; stageId: string | null;
  executionCount: number; finalResponse: string | null;
  /** Captured as TEXT, byte-for-byte as production wrote it — see the puller's two-cast note. */
  stamped: {
    markerPresence: string | null; rollbackContainment: string | null;
    /** What the HOIST's own read path returns in production (jsonb-ordered) — see the puller. */
    rollbackContainmentJsonbText: string | null;
  } | null;
}
interface Specimen {
  legTaskId: string;
  leg: { id: string; type: string; title: string; agentRole: string | null; metadata: unknown; inputContext: unknown };
  stageId: string | null;
  stage: { id: string; metadata: unknown } | null;
  programParentId: string | null;
  children: Child[];
  stampedLeg: Record<string, string | null>;
}

const FIXTURE = path.resolve(__dirname, 'fixtures/net-registry-equivalence/specimens.json');
const specimens: Specimen[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

let failed = 0;
const mismatches: string[] = [];
const check = (n: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${n}${ok ? '' : '\n     ' + extra}`);
  if (!ok) { failed++; mismatches.push(n); }
};

/**
 * Re-serialize production's stored text through JSON.parse -> JSON.stringify.
 *
 * WHAT THIS DOES AND DOES NOT NORMALIZE, because the distinction is the whole comparison: the
 * stored artifact is PRETTY-PRINTED by the artifact writer, and indentation is the writer's
 * business, not a net's. Key ORDER is the net's, and V8 preserves insertion order for non-numeric
 * keys across parse/stringify — so this is indifferent to whitespace and strict about order and
 * values. A deep-equal comparison here would have been the easy way out and would have silently
 * accepted the key-order drift this gate exists to catch.
 */
const canonical = (stored: string): string => JSON.stringify(JSON.parse(stored));

/**
 * ── SPECIMEN WINDOWS — DECLARED DATA, ONE SET PER NET ─────────────────────────────────────────
 *
 * The gate has always SAID that specimens are restricted per net to legs stamped after that net's
 * last behavioural change. Until 2026-09-12 it held ONE GLOBAL SET and enforced nothing, which is
 * the same class of defect this domain keeps catching elsewhere: a stated rule the implementation
 * does not enforce reads exactly like an enforced one.
 *
 * ⚠️ **DECLARED, NEVER DERIVED FROM THE ROWS UNDER TEST.** It would be easy to compute "in-window"
 * by noticing that production's stamp lacks a field the current code emits — and that would let a
 * behavioural change quietly redefine its own window, which is auto-accept wearing a filter's
 * clothes. Dates cannot do it either: the two undeployed commits and these four legs are all dated
 * 2026-09-11, so a date comparison cannot separate "ran before the deploy" from "ran after". What
 * actually decides it is human knowledge of what was deployed when, so it is written down as human
 * knowledge: an explicit list of leg ids per net, with the reason beside it.
 *
 * ⚠️ **`legs: 'none'` PRINTS AND COUNTS AS NOT COVERED.** A net with no in-window specimen must not
 * pass quietly — silence and coverage have to stay distinguishable, which is the single property
 * this whole gate rests on.
 *
 * MAINTENANCE: when a post-deploy leg is archived, add its id to the nets it now covers. There is
 * no map of temporary exemptions to remember to delete — a net is covered by the legs listed
 * against it, and by nothing else.
 */
const POST_H2_LEGS = [
  'cmtwhdi4d006qyx1rnnxkblay', 'cmtwh44dv002xyx1rdi2cygju',
  'cmtwfmqrz0005yx1rqhsvmpps', 'cmtwcpnwo0003yx2dvd6wxsbd',
];
/**
 * The FIRST POST-DEPLOY leg (observability R4 on the promstack rig, 2026-09-12, after the registry
 * reached production at `d43d44f9`). Its stamps were produced by the shipping registry on real
 * data — both invocation points fired and all six entries are accounted for — which is the only
 * property this gate needs from a specimen.
 *
 * ⚠️ ITS LEG VERDICT WAS NEEDS-REVISION 84, and that is recorded here rather than omitted. The
 * reviewer blocked on validation-step FORMATTING (a markdown table where the protocol requires the
 * fenced-command/fenced-expected shape — a clause the protocol itself names rejectable). A legitimate
 * catch, and irrelevant to specimen validity. It is stated so that nobody later reads GATE COVERAGE
 * as RUN QUALITY: this leg proves the registry stamps correctly, not that the run was good.
 */
const POST_DEPLOY_LEG = 'cmtxp5r6k0005yx61hg4owvlv';

const NET_SPECIMENS: Record<string,
  { legs: string[] | 'none'; why: string; unexercisedArms?: string[] }> = {
  'markerPresence@leaf-persist': { legs: [...POST_H2_LEGS, POST_DEPLOY_LEG],
    why: 'H-4 shipped 2026-09-10; every leg here ran after it' },
  'derivationContainment@leg-synthesize': { legs: [...POST_H2_LEGS, POST_DEPLOY_LEG],
    why: 'last behavioural change H-2 (2026-09-09); every leg here ran after it' },
  'rollbackContainment@leg-synthesize': { legs: [...POST_H2_LEGS, POST_DEPLOY_LEG],
    why: 'the HOIST shipped with net #3 on 2026-09-11 and these legs carry its stamp' },

  // ✅ CLOSED 2026-09-12 by the first post-deploy leg. The pre-deploy legs stay OUT: their stamps
  // predate the contractApplicability nesting, and adding them would be declaring something false.
  'dialectLint@leg-synthesize': { legs: [POST_DEPLOY_LEG],
    why: 'contractApplicability nesting (2dc4663a) reached production with the registry deploy; this '
       + 'leg carries the first stamp that has it nested ({basis: no-program-parent, expected: false})' },
  'contractPropagation@leg-synthesize': { legs: [POST_DEPLOY_LEG],
    why: 'same deploy, same nesting — contractApplicability is stamped on BOTH facts from one ctx derivation' },

  'rollbackContainment@leaf-persist': { legs: [POST_DEPLOY_LEG],
    why: 'lane-first arm precedence (8366c21e) reached production with the registry deploy; this leg\'s '
       + 'Author stamp was produced by that code',
    // ⚠️ SEE THE ARM NOTE BELOW: covered as a LEG, not as an ARM.
    unexercisedArms: ['lane-not-supported — needs a DESIRED-STATE leg (terraform-iac / kubernetes-gitops); '
       + 'this specimen is observability-config, which is ADJUDICATED (checked:true), so the lane arm never ran'] },
};

let notCovered = 0;
const uncovered: string[] = [];
const reportNotCovered = (label: string, why: string) => {
  console.log(`⚠️  NOT COVERED — ${label}\n     ${why}`);
  notCovered++; uncovered.push(label);
};

/**
 * ⚠️ THE WINDOW AND THE ARM ARE DIFFERENT AXES, and this mechanism only covers the first.
 *
 * `NET_SPECIMENS` answers "was this net's code exercised by this leg". It CANNOT answer "was this
 * ARM of that net exercised", because an arm is chosen by the data, not by the deploy. A net can be
 * fully in-window and still have an arm that no specimen has ever taken — and if that goes
 * unstated, a covered net reads as a fully exercised one. Rather than paper over the distinction,
 * `unexercisedArms` declares it and it PRINTS, on the same principle as NOT COVERED: what has not
 * been observed must be visible, not absent.
 *
 * The live case: `rollbackContainment@leaf-persist` is now covered by a real post-deploy leg, but
 * that leg is observability-config, which is ADJUDICATED — so `lane-not-supported` remains
 * UNOBSERVED in production. Closing the leg window did not close the arm, and one adjudicated stamp
 * must not be read as covering the lane arm. It needs a desired-state leg (terraform-iac or
 * kubernetes-gitops); the k8s rig is currently torn down.
 */
function reportUnexercisedArms(): void {
  for (const [netKey, w] of Object.entries(NET_SPECIMENS)) {
    for (const arm of w.unexercisedArms ?? []) {
      console.log(`⚠️  ARM NOT EXERCISED — ${netKey}\n     ${arm}`);
      notCovered++; uncovered.push(`${netKey} (arm: ${arm.split(' —')[0]})`);
    }
  }
}

/** Is this leg a declared specimen for this (name, point)? Declared data only — never the stamps. */
function covers(netKey: string, legId: string): boolean {
  const w = NET_SPECIMENS[netKey];
  if (!w) throw new Error(`net ${netKey} has no declared specimen set — add one (or 'none' with a reason)`);
  return w.legs !== 'none' && w.legs.includes(legId);
}
/**
 * A Prisma stand-in backed by the captured rows. It answers the queries the four enrichments
 * actually make, and THROWS on anything else — a stub that silently returns `[]` for an unexpected
 * query would make the gate pass by starving the net, which is worse than no gate at all.
 */
function stubPrisma(s: Specimen) {
  const byId = new Map<string, Child>(s.children.map((c) => [c.id, c]));
  return {
    task: {
      findMany: async (args: { where?: { stageId?: string; type?: string } }) => {
        if (args?.where?.stageId !== s.stageId) return [];
        const rows = args.where.type ? s.children.filter((c) => c.type === args.where!.type) : s.children;
        return rows.map((c) => ({
          id: c.id, title: c.title, agentRole: c.agentRole, description: c.description,
          inputContext: c.inputContext, stageId: c.stageId,
          _count: { executions: c.executionCount },
        }));
      },
      findUnique: async (args: { where: { id: string } }) => {
        if (args.where.id === s.leg.id) return { ...s.leg, stageId: null };
        const c = byId.get(args.where.id);
        return c ? { id: c.id, title: c.title, agentRole: c.agentRole, stageId: c.stageId, metadata: null } : null;
      },
      // The F12 lookup. The fixture captured the ANSWER, so the stub does not re-encode the
      // AND-lift that `findProgramParentForStage` owns — re-encoding it here would make the gate
      // test a copy of the query instead of the query.
      findFirst: async () => (s.programParentId ? { id: s.programParentId } : null),
    },
    stage: {
      findUnique: async (args: { where: { id: string } }) =>
        (s.stage && args.where.id === s.stage.id ? { id: s.stage.id, metadata: s.stage.metadata } : null),
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      const taskId = String(values[0]);
      const c = byId.get(taskId);
      if (sql.includes("->>'finalResponse'")) return [{ fr: c?.finalResponse ?? null }];
      if (sql.includes("->>'rollbackContainment'")) {
        // The JSONB rendering, matching production's own read path exactly.
        return [{ rc: c?.stamped?.rollbackContainmentJsonbText ?? null }];
      }
      throw new Error(`stub $queryRaw: unmodelled query — ${sql.slice(0, 90)}`);
    },
  } as never;
}

(async () => {
  check('E0: the specimen fixture is populated', specimens.length > 0, `${specimens.length} legs`);

  for (const s of specimens) {
    const programTier = s.leg.type === 'PIPELINE' && isProgramHarnessTask(s.leg as never);
    const prisma = stubPrisma(s);

    // ── LEG SYNTHESIZE: the four leg nets, replayed through the shipping loop ───────────────────
    const stamped: Record<string, unknown> = {};
    const ctx = buildNetContext({
      prisma, task: s.leg, agentRole: s.leg.agentRole, harnessMode: 'SYNTHESIZE',
      finalResponse: '', programTier,
    });
    await runNetsAtPoint('leg-synthesize', ctx, MECHANICAL_NETS, (n, f) => { stamped[n] = f; }, (n, e) => {
      check(`E-throw ${s.legTaskId} ${n}`, false, String(e));
    });

    // E1a: the SET of stamped keys, not just the values of the keys we thought to check. Without
    // this, a net whose `appliesTo` was wrongly WIDENED would stamp an extra fact on a leg that
    // production left bare, and a per-name value loop would never look at it — mutation-proven:
    // widening derivationContainment's predicate produced ZERO failures until this assertion existed.
    {
      const prodKeys = Object.entries(s.stampedLeg ?? {}).filter(([, v]) => v != null).map(([k]) => k).sort();
      const ourKeys = Object.keys(stamped).sort();
      check(`E1a ${s.legTaskId.slice(-6)}: stamps exactly the keys production stamped (no net over-applied)`,
        JSON.stringify(ourKeys) === JSON.stringify(prodKeys),
        `registry : ${ourKeys}\n     prod     : ${prodKeys}`);
    }

    for (const name of ['derivationContainment', 'dialectLint', 'contractPropagation', 'rollbackContainment']) {
      const prod = s.stampedLeg?.[name];
      if (prod == null) continue; // not stamped on this leg in production — out of window for that net
      const netKey = `${name}@leg-synthesize`;
      if (!covers(netKey, s.legTaskId)) {
        reportNotCovered(`${s.legTaskId.slice(-6)} · ${netKey}`, NET_SPECIMENS[netKey].why);
        continue;
      }
      check(`E1 ${s.legTaskId.slice(-6)} · ${name}: byte-identical to what production stamped`,
        JSON.stringify(stamped[name]) === canonical(prod),
        `registry : ${JSON.stringify(stamped[name])}\n     prod     : ${canonical(prod)}`);
    }

    // ── LEAF PERSIST: markerPresence and rollbackContainment on each captured child ─────────────
    for (const c of s.children) {
      if (!c.stamped) continue;
      const leafStamped: Record<string, unknown> = {};
      const leafCtx = buildNetContext({
        prisma,
        task: { id: c.id, type: c.type ?? 'ACTION', metadata: null, inputContext: c.inputContext },
        agentRole: c.agentRole, harnessMode: null, finalResponse: c.finalResponse, programTier: false,
      });
      await runNetsAtPoint('leaf-persist', leafCtx, MECHANICAL_NETS, (n, f) => { leafStamped[n] = f; },
        (n, e) => check(`E-throw ${c.id} ${n}`, false, String(e)));

      // Same over-application guard at the leaf point. This is the one that bites: widening
      // rollbackContainment's AUTHOR_LEAF_ROLE_RE would stamp the fact on Harvester and Architect
      // children, which production left bare — and a per-name value loop cannot see a key that is
      // absent from the baseline it iterates.
      {
        const prodKeys = Object.entries(c.stamped as Record<string, string | null>)
          .filter(([k, v]) => v != null && k !== 'rollbackContainmentJsonbText').map(([k]) => k).sort();
        const ourKeys = Object.keys(leafStamped).sort();
        check(`E2a ${c.id.slice(-6)}: stamps exactly the keys production stamped (no net over-applied)`,
          JSON.stringify(ourKeys) === JSON.stringify(prodKeys),
          `registry : ${ourKeys}\n     prod     : ${prodKeys}`);
      }

      for (const name of ['markerPresence', 'rollbackContainment']) {
        const prod = (c.stamped as Record<string, string | null>)[name];
        if (prod == null) continue;
        const netKey = `${name}@leaf-persist`;
        if (!covers(netKey, s.legTaskId)) {
          reportNotCovered(`${c.id.slice(-6)} · ${netKey}`, NET_SPECIMENS[netKey].why);
          continue;
        }
        check(`E2 ${c.id.slice(-6)} · ${name}: byte-identical to what production stamped`,
          JSON.stringify(leafStamped[name]) === canonical(prod),
          `registry : ${JSON.stringify(leafStamped[name])?.slice(0, 300)}\n     prod     : ${canonical(prod).slice(0, 300)}`);
      }
    }
  }

  reportUnexercisedArms();

  if (notCovered > 0) {
    console.log(`\n⚠️  ${notCovered} gap(s) this gate does NOT cover:`);
    uncovered.forEach((u) => console.log(`  · ${u}`));
    console.log('   A net is covered by the legs DECLARED against it in NET_SPECIMENS and by nothing else.');
    console.log('   Close one by archiving a post-deploy leg and ADDING its id there — there is no');
    console.log('   exemption map to remember to delete, which is how a temporary label becomes permanent.');
  }
  if (failed) {
    console.error(`\n${failed} MISMATCH(ES) — triage each one. Do NOT add it to an expected-diff list:`);
    mismatches.forEach((m) => console.error(`  · ${m}`));
    process.exit(1);
  }
  console.log(`\n✅ net-registry equivalence: every fact byte-identical to production across ${specimens.length} specimen legs`);
  process.exit(0);
})();
