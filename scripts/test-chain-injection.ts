/**
 * CROSS-PIPELINE DELIVERY (2026-09-16, Bug Class 84) — the chainer injects the owning leg's entries.
 *
 * What each case pins, and the state in which it goes RED:
 *   A3   a dep-free child with an injection gets a context (not null) — red if the early return
 *        still fires before the injection is considered ("the C4 arm").
 *   CTRL a dep-free child with NOTHING to inject stays null — red if the contract changed platform-wide.
 *   A4   completedDependencies / chainCapablePredecessors / totalDependencies are untouched by the
 *        injection and inheritedPredecessors equals the injected count — red if completedDependencies
 *        is chainedFrom.length again.
 *   A5   a taskId the child chained itself is NOT injected twice; the child's own entry wins; the skip
 *        is recorded.
 *   A6   a taskId in notChained is NOT injected; recorded.
 *   A8   own entries just under the ceiling + an injection that lands the total just OVER it:
 *        post-append totalChars <= TOTAL_CONTEXT_CEILING, the own entries are NOT cut, the injected
 *        entry's TEXT is cut and its FACTS survive. Red under "drop injected whole" (facts vanish) and
 *        red under "cap separately" (total > ceiling).
 *   RT   re-trimming an entry that already carries a marker leaves exactly ONE marker.
 *   A12  legCrossPipelineEntries > 0 with inheritedPredecessors 0 carries a recorded skip reason.
 *   POL  source policy: result.json and source-less entries are excluded, named; malformed named.
 *   ORD  the injected block sits at the HEAD in received order.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chainDependencyContext, classifyLegInjection, INJECTION_EXCLUDED_ROLES, TOTAL_CONTEXT_CEILING, PER_PREDECESSOR_SOFT_CAP } =
  require('../lib/agents/harness/context-chainer') as typeof import('../lib/agents/harness/context-chainer');
import * as fs from 'fs';
import * as path from 'path';

let failed = 0;
const check = (n: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${n}${ok ? '' : '  ' + extra}`);
  if (!ok) failed++;
};
const MARKER_RE = /\[CHAINED CONTEXT TRUNCATED: \d+ of \d+ chars\]/g;

const legEntry = (id: string, fr: string, extra: Record<string, unknown> = {}) => ({
  taskId: id, taskTitle: `Upstream leg ${id}`, agentRole: 'pipeline_harness_orchestrator',
  confidenceScore: 92, qualityMetrics: null, markerPresence: null, rollbackContainment: null,
  derivationContainment: { checked: true, violations: [], derivedValues: [{ kind: 'cidr', value: '10.244.0.4/30' }] },
  finalResponse: fr, executionId: `exec-${id}`, truncated: false, originalChars: fr.length,
  sanitized: false, neutralizedCount: 0, strippedControlChars: 0, source: 'report.md', ...extra,
});

/** Stub client: `deps` are this child's dependency rows (all COMPLETED/SUCCESS with an artifact). */
function stub(deps: Array<{ id: string; fr: string; inFlight?: boolean }>) {
  const rows = deps.map((d) => ({
    id: d.id, title: `Sibling ${d.id}`, agentRole: 'infra_state_harvester', type: 'ACTION', status: 'COMPLETED',
    executionStatus: 'SUCCESS', agentTemplateId: 'tpl', metadata: {}, stageId: 'stage1',
  }));
  const byId = Object.fromEntries(deps.map((d) => [d.id, d]));
  return {
    taskDependency: { findMany: async () => rows.map((r) => ({ dependsOn: r })) },
    agentExecution: {
      findFirst: async (args: { where?: { taskId?: string; status?: { in?: string[] } } }) =>
        args?.where?.status?.in ? (byId[args.where.taskId!]?.inFlight ? { id: 'exec-running' } : null) : null,
      findMany: async (args: { where?: { taskId?: string } }) => [
        { id: `exec-${args?.where?.taskId}`, status: 'SUCCESS', createdAt: new Date(), supersededById: null },
      ],
    },
    agentArtifact: {
      findFirst: async (args: { where?: { executionId?: string } }) => {
        const id = String(args?.where?.executionId).replace('exec-', '');
        return { content: JSON.stringify({ finalResponse: byId[id]?.fr ?? '', confidenceScore: 80 }) };
      },
    },
    task: { findUnique: async () => null },
    stage: { findUnique: async () => null },
  } as unknown as Parameters<typeof chainDependencyContext>[1];
}

(async () => {
  // ── A3 / CTRL — the dep-free arm ─────────────────────────────────────────────────────────────
  const depFree = await chainDependencyContext('child', stub([]), { inject: { legTaskId: 'leg1', entries: [legEntry('u1', 'upstream deliverable')] } });
  check('A3: dep-free child + injection → a context is returned (not null)', depFree !== null);
  check('A3: chainedFrom holds exactly the injected entry, stamped inheritedFromLeg + inheritedAt',
    depFree?.chainedFrom.length === 1 && depFree.chainedFrom[0].inheritedFromLeg === 'leg1' && typeof depFree.chainedFrom[0].inheritedAt === 'string',
    JSON.stringify(depFree?.chainedFrom.map((e) => ({ id: e.taskId, leg: e.inheritedFromLeg }))));
  check('A3/A4: dependency-derived counts are honest zeros; inheritedPredecessors 1; legCrossPipelineEntries 1',
    depFree?.pipelineMetadata.totalDependencies === 0 && depFree.pipelineMetadata.completedDependencies === 0
      && depFree.pipelineMetadata.chainCapablePredecessors === 0 && depFree.pipelineMetadata.inheritedPredecessors === 1
      && depFree.pipelineMetadata.legCrossPipelineEntries === 1 && depFree.pipelineMetadata.inheritedFromLeg === 'leg1',
    JSON.stringify(depFree?.pipelineMetadata));
  check('A3: the entry is a COPY (verbatim bytes, facts intact)',
    depFree?.chainedFrom[0].finalResponse === 'upstream deliverable' && (depFree.chainedFrom[0].derivationContainment as { derivedValues?: unknown[] })?.derivedValues?.length === 1);

  const ctrlNull = await chainDependencyContext('child', stub([]));
  check('CTRL: dep-free child with no inject option → null (contract unchanged)', ctrlNull === null);
  const ctrlEmpty = await chainDependencyContext('child', stub([]), { inject: { legTaskId: 'leg1', entries: [] } });
  check('CTRL: dep-free child, leg holds NO entries → null (no empty chainedFrom is ever written)', ctrlEmpty === null);
  const ctrlFiltered = await chainDependencyContext('child', stub([]), { inject: { legTaskId: 'leg1', entries: [legEntry('a1', 'x', { source: 'result.json' })] } });
  check('CTRL: dep-free child, every leg entry excluded by policy → null (nothing to inject)', ctrlFiltered === null);

  // ── A4 / A5 / ORD — a child WITH a sibling edge ──────────────────────────────────────────────
  const withSib = await chainDependencyContext('child', stub([{ id: 's1', fr: 'sibling harvest' }]),
    { inject: { legTaskId: 'leg1', entries: [legEntry('u1', 'upstream one'), legEntry('u2', 'upstream two'), legEntry('s1', 'a copy of the sibling via the leg')] } });
  check('A4: completedDependencies 1 === chainCapablePredecessors 1; totalDependencies 1 — untouched by 2 injections',
    withSib?.pipelineMetadata.completedDependencies === 1 && withSib.pipelineMetadata.chainCapablePredecessors === 1 && withSib.pipelineMetadata.totalDependencies === 1,
    JSON.stringify(withSib?.pipelineMetadata));
  check('A4: inheritedPredecessors equals the injected count (2), legCrossPipelineEntries 3',
    withSib?.pipelineMetadata.inheritedPredecessors === 2 && withSib.pipelineMetadata.legCrossPipelineEntries === 3);
  check('A5: the sibling the child chained itself appears ONCE — its own entry (no stamp) wins; skip recorded own-edge-wins',
    withSib?.chainedFrom.filter((e) => e.taskId === 's1').length === 1
      && withSib.chainedFrom.find((e) => e.taskId === 's1')?.inheritedFromLeg === undefined
      && withSib.pipelineMetadata.inheritedSkipped.some((k) => k.taskId === 's1' && k.reason === 'own-edge-wins'),
    JSON.stringify(withSib?.pipelineMetadata.inheritedSkipped));
  check('ORD: injected block at the HEAD in received order, own entries after',
    withSib?.chainedFrom.map((e) => e.taskId).join(',') === 'u1,u2,s1', withSib?.chainedFrom.map((e) => e.taskId).join(','));
  check('A5: notChained stays EMPTY — skips never fold into the gate-blocking list', withSib?.pipelineMetadata.notChained.length === 0);

  // ── A6 — an upstream the child holds an edge to that is IN FLIGHT ────────────────────────────
  const inflight = await chainDependencyContext('child', stub([{ id: 'u1', fr: 'stale', inFlight: true }]),
    { inject: { legTaskId: 'leg1', entries: [legEntry('u1', 'the leg\'s stale snapshot')] } });
  check('A6: a taskId in notChained is NOT injected; recorded in-not-chained; notChained keeps its one entry',
    inflight?.chainedFrom.length === 0 && inflight.pipelineMetadata.inheritedSkipped.some((k) => k.taskId === 'u1' && k.reason === 'in-not-chained')
      && inflight.pipelineMetadata.notChained.length === 1 && inflight.pipelineMetadata.inheritedPredecessors === 0,
    JSON.stringify(inflight?.pipelineMetadata));
  // A12 rides on the same fixture: leg held 1, inherited 0, reason recorded.
  check('A12: legCrossPipelineEntries 1 with inheritedPredecessors 0 → a recorded skip reason (no silent zero)',
    inflight?.pipelineMetadata.legCrossPipelineEntries === 1 && inflight.pipelineMetadata.inheritedSkipped.length === 1);

  // ── A8 — the ceiling, placed deliberately just over the line ────────────────────────────────
  // Four own entries just under the per-predecessor cap; serialized total ≈ 522.4 KB... that is OVER
  // 512 KB already — so size them to land the OWN total just UNDER, then inject one 8 KB entry that
  // lands the whole just OVER. If the injection were capped separately the total would exceed the
  // ceiling; if the injected entry were dropped whole its facts would vanish; if pass 2 trimmed the
  // own entries the harvest would carry a marker.
  const OWN = 4;
  const ownFr = 'a'.repeat(129000); // 4 × ~129.3 KB serialized ≈ 517 KB? no — measure, do not assume:
  const probe = await chainDependencyContext('child', stub(Array.from({ length: OWN }, (_, i) => ({ id: `o${i}`, fr: ownFr }))));
  const ownSerialized = (probe?.chainedFrom ?? []).reduce((s, e) => s + JSON.stringify(e).length, 0);
  check(`A8 SETUP: own total is UNDER the ceiling with no injection (${ownSerialized} vs ${TOTAL_CONTEXT_CEILING}) and nothing truncated`,
    ownSerialized < TOTAL_CONTEXT_CEILING && (probe?.chainedFrom ?? []).every((e) => e.truncated !== true) && ownFr.length < PER_PREDECESSOR_SOFT_CAP);
  const headroom = TOTAL_CONTEXT_CEILING - ownSerialized;
  const injFr = 'b'.repeat(headroom + 2000); // just over the remaining headroom
  const over = await chainDependencyContext('child', stub(Array.from({ length: OWN }, (_, i) => ({ id: `o${i}`, fr: ownFr }))),
    { inject: { legTaskId: 'leg1', entries: [legEntry('u1', injFr)] } });
  const overTotal = over?.pipelineMetadata.totalChars ?? -1;
  const injectedEntry = over?.chainedFrom.find((e) => e.inheritedFromLeg === 'leg1');
  check('A8 SETUP: the injection lands the untrimmed total OVER the ceiling (the fixture is over the line)',
    ownSerialized + JSON.stringify(legEntry('u1', injFr)).length > TOTAL_CONTEXT_CEILING);
  check(`A8: post-append totalChars (${overTotal}) <= TOTAL_CONTEXT_CEILING`, overTotal >= 0 && overTotal <= TOTAL_CONTEXT_CEILING);
  check('A8: the child\'s OWN entries are NOT cut to pay for the injection',
    (over?.chainedFrom ?? []).filter((e) => !e.inheritedFromLeg).every((e) => e.truncated !== true && e.finalResponse === ownFr));
  check('A8: the injected entry\'s TEXT is trimmed (truncated:true, marker present) — not dropped',
    !!injectedEntry && injectedEntry.truncated === true && MARKER_RE.test(injectedEntry.finalResponse));
  check('A8: the injected entry\'s FACTS survive the trim (derivedValues intact)',
    (injectedEntry?.derivationContainment as { derivedValues?: unknown[] })?.derivedValues?.length === 1);
  check('A8: anyTruncated reflects the payload (true) beside a total within the ceiling — no self-refuting pair',
    over?.pipelineMetadata.anyTruncated === true);
  check('A8: inheritedPredecessors still 1 — trimmed, never dropped', over?.pipelineMetadata.inheritedPredecessors === 1);

  // ── RT — re-trim of an entry that already carries a marker ──────────────────────────────────
  const preCut = legEntry('u1', 'c'.repeat(headroom + 2000) + '\n\n[CHAINED CONTEXT TRUNCATED: 200000 of 300000 chars]', { truncated: true, originalChars: 300000 });
  const retrim = await chainDependencyContext('child', stub(Array.from({ length: OWN }, (_, i) => ({ id: `o${i}`, fr: ownFr }))),
    { inject: { legTaskId: 'leg1', entries: [preCut] } });
  const rt = retrim?.chainedFrom.find((e) => e.inheritedFromLeg === 'leg1');
  const markers = (rt?.finalResponse.match(MARKER_RE) ?? []).length;
  check(`RT: an already-truncated injected entry re-trimmed carries exactly ONE marker (${markers}), "of 300000" preserved`,
    markers === 1 && /of 300000 chars\]$/.test(rt?.finalResponse ?? ''), (rt?.finalResponse ?? '').slice(-120));
  check('RT: total still within the ceiling', (retrim?.pipelineMetadata.totalChars ?? -1) <= TOTAL_CONTEXT_CEILING);

  // ── POL — the source policy + malformed entries ─────────────────────────────────────────────
  const cls = classifyLegInjection({ legTaskId: 'leg1', entries: [
    legEntry('r1', 'x', { source: 'result.json' }), legEntry('n1', 'x', { source: undefined }), legEntry('p1', 'x', { source: 'pipeline-index.json' }),
    legEntry('d1', 'x'), { taskId: 'm1' }, null, legEntry('st', 'x', { inheritedFromLeg: 'older-leg', inheritedAt: 'then' }),
  ] });
  check('POL: report.md + pipeline-index.json are candidates; result.json, source-less, malformed are skipped and NAMED',
    cls.candidates.map((c) => c.taskId).join(',') === 'p1,d1,st'
      && cls.skipped.some((k) => k.taskId === 'r1' && k.reason === 'not-cross-pipeline-source')
      && cls.skipped.some((k) => k.taskId === 'n1' && k.reason === 'not-cross-pipeline-source')
      && cls.skipped.some((k) => k.taskId === 'm1' && k.reason === 'malformed-entry')
      && cls.skipped.some((k) => k.taskId === '<malformed>' && k.reason === 'malformed-entry'),
    JSON.stringify(cls));
  check('POL: a stale stamp on the leg\'s entry is stripped so the IMMEDIATE leg is the stamped source',
    cls.candidates.find((c) => c.taskId === 'st')?.inheritedFromLeg === undefined);
  check('POL: a degraded upstream entry keeps its `degraded`/`source` so the renderer can qualify the heading',
    (() => { const d = classifyLegInjection({ legTaskId: 'l', entries: [legEntry('p1', 'x', { source: 'pipeline-index.json', degraded: true })] }).candidates[0]; return d?.degraded === true && d.source === 'pipeline-index.json'; })());

  // ── DENOMINATOR is the OFFERED count (pre-policy), not post-policy ───────────────────────────
  const offered = await chainDependencyContext('child', stub([{ id: 's1', fr: 'sibling' }]),
    { inject: { legTaskId: 'leg1', entries: [legEntry('r1', 'x', { source: 'result.json' }), legEntry('r2', 'x', { source: 'result.json' }), legEntry('r3', 'x', { source: 'result.json' })] } });
  check('DEN: three result.json entries offered → legCrossPipelineEntries 3, inheritedPredecessors 0, three named skips ("inherited 0 of 3", not "0 of 0")',
    offered?.pipelineMetadata.legCrossPipelineEntries === 3 && offered.pipelineMetadata.inheritedPredecessors === 0
      && offered.pipelineMetadata.inheritedSkipped.filter((k) => k.reason === 'not-cross-pipeline-source').length === 3,
    JSON.stringify(offered?.pipelineMetadata));

  // ── ROLE EXCLUSION — the pair that distinguishes a working predicate from a blind one ──────────
  // With `agentRole` unselected at prepare every role reads undefined: the null-role case would pass
  // while the exclusion did nothing. Only BOTH together prove the predicate fires.
  const harvOwnEdge = await chainDependencyContext('child', stub([{ id: 's1', fr: 'sibling' }]),
    { inject: { legTaskId: 'leg1', entries: [legEntry('u1', 'upstream')], childAgentRole: 'infra_state_harvester' } });
  check('ROLE: a named harvester (infra_state_harvester) with its own edge is EXCLUDED — 0 inherited, skip recorded role-excluded, offered 1',
    harvOwnEdge?.pipelineMetadata.inheritedPredecessors === 0 && harvOwnEdge.chainedFrom.every((e) => !e.inheritedFromLeg)
      && harvOwnEdge.pipelineMetadata.inheritedSkipped.some((k) => k.taskId === 'u1' && k.reason === 'role-excluded')
      && harvOwnEdge.pipelineMetadata.legCrossPipelineEntries === 1 && harvOwnEdge.pipelineMetadata.notChained.length === 0,
    JSON.stringify(harvOwnEdge?.pipelineMetadata));
  const harvDepFree = await chainDependencyContext('child', stub([]),
    { inject: { legTaskId: 'leg1', entries: [legEntry('u1', 'upstream')], childAgentRole: 'infra_state_harvester' } });
  check('ROLE: a DEP-FREE harvester is excluded → null (no hollow chainedFrom; the skip is LOG-ONLY — the named recording limit)', harvDepFree === null);
  for (const r of ['artifact_harvester', 'synthesis_source_acquirer', 'network_state_harvester', 'change_reviewer', 'publication_reviewer']) {
    const x = await chainDependencyContext('child', stub([]), { inject: { legTaskId: 'leg1', entries: [legEntry('u1', 'upstream')], childAgentRole: r } });
    check(`ROLE: ${r} excluded (dep-free → null)`, x === null && INJECTION_EXCLUDED_ROLES.has(r));
  }
  const nullRole = await chainDependencyContext('child', stub([]),
    { inject: { legTaskId: 'leg1', entries: [legEntry('u1', 'upstream')], childAgentRole: null } });
  check('ROLE: a NULL-agentRole child RECEIVES the injection (an exclusion list fails open on the unnamed — stated property)',
    nullRole?.pipelineMetadata.inheritedPredecessors === 1 && nullRole.chainedFrom[0]?.inheritedFromLeg === 'leg1');
  for (const r of ['infra_change_architect', 'config_change_author', 'some_new_domain_consumer']) {
    const x = await chainDependencyContext('child', stub([]), { inject: { legTaskId: 'leg1', entries: [legEntry('u1', 'upstream')], childAgentRole: r } });
    check(`ROLE: ${r} RECEIVES (consumers + anything new, by default)`, x?.pipelineMetadata.inheritedPredecessors === 1);
  }
  // RECONCILIATION TRIPWIRE (2026-09-17). Found because artifact-synthesis names its reviewer
  // `publication_reviewer`, so it sat OUTSIDE the literal list while `change_reviewer` — the same
  // seat in the four infra domains — was excluded. Zero live impact (artifact-synthesis has never
  // been a leg inside a program) but latent, and in the one direction where fail-open is the harm.
  // Every production role is asserted against the shape regex here so the next differently-named
  // harvester or reviewer fails THIS test rather than silently receiving an upstream deliverable.
  {
    const SHAPE = /review|harvest|acquir/i;
    // Measured 2026-09-17 on the production corpus: every agentRole appearing on a leg's children.
    // + 2026-09-24: the requirements-authoring pair, seeded after that measurement (so this list could
    // not see them). The pipeline has never run as a program leg; the reviewer is decided anyway.
    const PROD_ROLES = [
      'infra_state_harvester', 'artifact_harvester', 'synthesis_source_acquirer',
      'network_state_harvester', 'change_reviewer', 'publication_reviewer',
      'requirements_reviewer', 'requirements_author',
      'infra_change_architect', 'config_change_author', 'network_design_architect',
      'technical_writer', 'editorial_writer', 'program_architect',
      'security_analyst', 'business_analyst', 'data_analyst',
    ];
    const unreviewed = PROD_ROLES.filter((r) => SHAPE.test(r) && !INJECTION_EXCLUDED_ROLES.has(r));
    check(`ROLE TRIPWIRE: every shape-matching production role is an explicit decision (unreviewed: ${unreviewed.join(', ') || 'none'})`,
      unreviewed.length === 0);
    // And the tripwire must not be vacuous: it has to actually match the shapes it guards.
    check('ROLE TRIPWIRE: the shape regex is not inert — it matches harvester/reviewer/acquirer and NOT the consumers',
      SHAPE.test('infra_state_harvester') && SHAPE.test('change_reviewer') && SHAPE.test('synthesis_source_acquirer')
      && !SHAPE.test('infra_change_architect') && !SHAPE.test('config_change_author'));
  }

  // FU1 §3.3 (2026-09-25) — THE SEAM, end to end: chainer → §6 renderer. The upstream derived VALUE
  // now renders on the inherited entry, and the panel's D1 ruling (never hand a reviewer the raw
  // upstream value) rests entirely on the reviewer never HOLDING that entry. So pin it across the
  // seam rather than per layer: a reviewer with its own Author edge renders its Author and NO value
  // line; the Author, from the same leg, renders the value. Either half alone passes vacuously.
  {
    const { renderPipelineContextSection } =
      require('../lib/agents/harness/render-pipeline-context') as typeof import('../lib/agents/harness/render-pipeline-context');
    const LABEL = 'Derived values stamped by this upstream pipeline (platform fact)';
    const up = legEntry('u1', 'upstream deliverable', {
      derivationContainment: { checked: true, violations: [], derivedValues: [{ kind: 'cidr', value: '10.99.0.0/27' }],
        containmentDisposition: { disposition: 'benign', reason: 'checked-clean' } },
    });
    const as = async (role: string) => {
      const c = await chainDependencyContext('child', stub([{ id: 's1', fr: 'author package' }]),
        { inject: { legTaskId: 'leg1', entries: [up], childAgentRole: role } });
      return renderPipelineContextSection(c).join('\n');
    };
    for (const r of ['change_reviewer', 'publication_reviewer', 'requirements_reviewer']) {
      const out = await as(r);
      check(`FU1 SEAM: ${r} renders its own predecessor and NO upstream value line`,
        out.includes('author package') && !out.includes(LABEL) && !out.includes('10.99.0.0/27'), out.slice(0, 400));
    }
    for (const r of ['infra_change_architect', 'config_change_author']) {
      const out = await as(r);
      check(`FU1 SEAM: ${r} renders the upstream value as a fact`, out.includes(`**${LABEL}**: cidr 10.99.0.0/27`), out.slice(0, 600));
    }
  }

  check('ROLE: the list is spelled literally — it is NOT the HARNESS_LEAF_ROLE_RE shape (which would exclude the consumers)',
    !INJECTION_EXCLUDED_ROLES.has('infra_change_architect') && !INJECTION_EXCLUDED_ROLES.has('config_change_author') && !INJECTION_EXCLUDED_ROLES.has('program_architect'));

  // ── SOURCE PINS on the prepare wiring (the DB-bound A2 lives in the validation run) ───────────
  const prep = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/prepare-task-for-execution.ts'), 'utf8');
  const throwIdx = prep.indexOf('throw new CanNeverRunError(');
  const resolveIdx = prep.indexOf('resolveOwningLeg(prisma, contractCheck.stageId)');
  const chainIdx = prep.indexOf('chainDependencyContext(taskId, prisma, { inject })');
  check('PIN: prepare resolves the owning leg AFTER the CC7 throw and BEFORE the chain call, and passes `inject`',
    throwIdx > 0 && resolveIdx > throwIdx && chainIdx > resolveIdx);
  check('PIN: leg resolution is NON-PIPELINE only', /contractCheck\.type !== 'PIPELINE' && contractCheck\.stageId/.test(prep));
  // THE fail-open trap: a role predicate on a column prepare never SELECTED reads undefined for every
  // child and excludes nobody. Pin the select AND the pass-through.
  check('PIN: prepare SELECTS agentRole on the contractCheck read (else the exclusion is inert)',
    /select: \{[^}]*agentRole: true[^}]*\}/.test(prep.slice(prep.indexOf('const contractCheck = await prisma.task.findUnique'), prep.indexOf('const contractCheck = await prisma.task.findUnique') + 600)));
  check('PIN: prepare passes childAgentRole: contractCheck.agentRole into the injection', prep.includes('childAgentRole: contractCheck.agentRole'));
  // Anchor on the STATEMENT (`notChained.push`), never on prose — the comment above the catch
  // legitimately says "NEVER into notChained", and a prose-anchored pin would fail on its own warning.
  check('PIN: resolution failure never reaches notChained (the catch only logs)', /OWNING_LEG_RESOLUTION_FAILED/.test(prep) && !/notChained\.push/.test(prep));
  const chainer = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/context-chainer.ts'), 'utf8');
  check('PIN: ONE trim loop body (one definition), invoked twice (no hand-restricted second copy)',
    (chainer.match(/const trimTailToCeiling = /g) ?? []).length === 1 && (chainer.match(/trimTailToCeiling\(/g) ?? []).length === 2);
  check('PIN: completedDependencies is pinned BEFORE the unshift', chainer.indexOf('const completedDependencies = chainedFrom.length') < chainer.indexOf('chainedFrom.unshift(...injected)'));

  if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
  console.log('\n✅ cross-pipeline injection: dep-free arm, counts, de-dup, ceiling, policy');
  process.exit(0);
})();
