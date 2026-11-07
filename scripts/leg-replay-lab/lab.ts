#!/usr/bin/env ts-node
/**
 * LEG REPLAY LAB — does a protocol text change lower refusals? Measured offline, without a live program run.
 *
 * For a chosen persisted `config_change_author` execution (a NODE), the lab rebuilds the Author's exact prompt with
 * the platform's own builders, substitutes a CANDIDATE protocol text, calls the real model N times, runs the
 * shipping nets on each package, chains it into the REAL Reviewer prompt (rebuilt the same way), runs the Reviewer,
 * and parses its verdict with the shipping parser. Old and new texts run on the same nodes, so the refusal counts
 * are comparable.
 *
 *   npm run lab:leg-replay -- build-candidates --experiment <dir> [--refresh-baseline]   # pin baseline texts, materialize variants
 *   npm run lab:leg-replay -- fidelity --experiment <dir>                               # rebuild vs what ran; $0
 *   npm run lab:leg-replay -- run --experiment <dir>                                    # DRY RUN (default): prompts + controls + estimate, $0
 *   npm run lab:leg-replay -- run --experiment <dir> --spend [--max-usd 40] [--n 5] [--only O5,O7] [--variants baseline,gap1] [--concurrency 4] [--no-warm-first] [--batch]
 *   npm run lab:leg-replay -- run --node <authorExecutionId> --protocol-text <file> [--spend]   # ad hoc: one node, one candidate text
 *   npm run lab:leg-replay -- summarize --run <runDir>                                   # re-summarize saved samples, $0
 *   npm run lab:leg-replay -- snapshot (--experiment <dir> | --nodes a,b) [--refresh]      # prefetch / re-fetch node snapshots (read-only), one line each
 *   npm run lab:leg-replay -- snapshot --nodes a,b --source local-db:<lab_db> --dump <file>  # L-CS-N: a SELF-HOST snapshot from a locally restored dump (provenance stamped)
 *   npm run lab:leg-replay -- vlg-self-test [--mutate device-blind|plant-blind|warn-blind|gitread-blind|held-blind|stop-blind]  # VALUE-LEG-GIT scorer (score-vlg.ts), both directions, $0
 *   npm run lab:leg-replay -- vlg-score --run <runDir>[,<runDir>] [--experiment <dir>]   # VALUE-LEG-GIT readings + do-not-ship proxies, $0
 *   npm run lab:leg-replay -- vlg-fixtures                                             # VALUE-LEG-GIT: device pools + frozen harvest calls (cache/vlg/), cached snapshots only, $0
 *   npm run lab:leg-replay -- cs-fixtures --experiment <dir>                           # L-CS-N: PRE-redaction self-host device pool (rig per entry), identity + reversal + witness proved, $0
 *   npm run lab:leg-replay -- frozen-cmp --experiment <dir> --run <dryRunDir> [--only R] [--variants rb]   # a base arm's Reviewer prompt = the frozen production rebuild, byte for byte, $0
 *   npm run lab:leg-replay -- csn-self-test [--experiment <dir>] [--mutate held-blind|held-loose|alloc-regex|alloc-blind|dv-regex|ref-blind|nopkg-blind|limit-blind|overlap-blind|reason-blind|void-blind|warn-blind]  # L-CS-N scorer, $0
 *   npm run lab:leg-replay -- csn-score --run <runDir>[,<runDir>] --experiment <dir>   # L-CS-N readings + do-not-ship proxies (score-csn.ts), $0
 *   npm run lab:leg-replay -- standing-self-test                                     # standing bench (golden/standing-bench.json): each frozen record reproduces its STORED (wrong) outcome, $0
 *   npm run lab:leg-replay -- provenance-check --experiment <dir> --source local-db:<lab_db>  # L-CS-N: self-host nodes ran the pinned texts + tiers; persisted verdict reproduces, $0
 *   npm run lab:leg-replay -- n2-score --run <runs,> --experiment <dir>                  # L-N2 Author readings (score-n2) + the node-driven Reviewer bench (score-reviewer-bench); n2-self-test · bench-self-test
 *   npm run lab:leg-replay -- chain-identity-diff --experiment <dir> --node <id|authorExecId>  # why a control reads chain patch identity ✗, $0
 *   npm run lab:leg-replay -- oa-score --run <runs,> --experiment <dir>                  # L-OA Author readings (score-oa) + the node-driven Reviewer bench; oa-self-test
 *   npm run lab:leg-replay -- score-self-test --experiment <dir>                       # requirements scorer reproduces stage A, $0
 *   npm run lab:leg-replay -- score --run <runDir> --experiment <dir>                  # requirements scores + gate inputs, $0
 *   npm run lab:leg-replay -- blind --run <runDir> --out <dir>                         # arm-blind copies for the hand read, $0
 *   npm run lab:leg-replay -- z49-self-test --experiment <dir>                         # Z49 stanza/row scorer on persisted + planted drafts, $0
 *   npm run lab:leg-replay -- z49-score --run <runDir>[,<runDir>] --experiment <dir>   # Z49 gate inputs (G-STANZA, G-ROW, G-NOWORSE), $0
 *   npm run lab:leg-replay -- g4-self-test --experiment <dir>                          # group 4 scorer on persisted + planted drafts, $0
 *   npm run lab:leg-replay -- g4-score --run <runDir>[,<runDir>] --experiment <dir>    # group 4 gate inputs (G-ITEM, G-SCOPE, G-EMPTY, G-COLL, G-PREMISE, G-NOWORSE), $0
 *   npm run lab:leg-replay -- g4-noworse-dump --experiment <dir> --check-at <c> --out <f>  # P8: G-NOWORSE findings under this tree's code, $0
 *   npm run lab:leg-replay -- quote-self-test --experiment <dir>                       # harvester quote score on persisted + planted harvests, $0
 *   npm run lab:leg-replay -- edits-score --run <runDir>[,<runDir>] --experiment <dir>    # L-5 G1 edit scores + gate inputs, $0
 *   npm run lab:leg-replay -- held-id-check                                            # G-HOLD-ID: L-1 base hashes = prod held_blobs (read-only), $0
 *   npm run lab:leg-replay -- g2-self-test [--mutate ignore-plant|cites-scope]          # G2 Reviewer-bench scorer, both directions, $0
 *   npm run lab:leg-replay -- g2-score --run <runDir>[,<runDir>] --experiment <dir>    # G2 gate inputs (G-COLL-SEEN, G-REV-DEF, G-REV-OK, G-STATE), $0
 *   npm run lab:leg-replay -- g3-self-test [--mutate ignore-plant|no-diff-rule|remit-blind|no-platform-render|pair-blind]  # G3 Reviewer-bench scorer, both directions, $0
 *   npm run lab:leg-replay -- g3-score --run <runDir>[,<runDir>] --experiment <dir>    # G3 gate inputs + readings (a) diff-rule (b) remit (c) partial, $0
 *   npm run lab:leg-replay -- k1-self-test [--mutate ignore-guess|defaults-blind|drift-blind]  # L-K1 scorer (score-k1.ts), both directions, $0
 *   npm run lab:leg-replay -- k1-score --run <runDir>[,<runDir>] --experiment <dir> [--arm k1] [--base-arm base]  # L-K1 gate inputs, $0
 *   npm run lab:leg-replay -- t2-self-test [--mutate trivial-blind]                        # L-T2 scorer (score-t2.ts): HCL ARCH-QUOTE, both directions, $0
 *   npm run lab:leg-replay -- t2-score --run <runDir>[,<runDir>] --experiment <dir>   # L-T2 gate inputs (score-k2 Author/Reviewer + HCL ARCH-QUOTE + score-t1 G-T-REF), $0
 *   npm run lab:leg-replay -- t1-self-test [--mutate path-blind|bypass-blind|cause-blind|negation-blind|diff-blind|trap-blind|ref-blind|refused-blind]  # L-T1 scorer (score-t1.ts), both directions, $0
 *   npm run lab:leg-replay -- t1-score --run <runDir>[,<runDir>] --experiment <dir>   # L-T1 gate inputs (PATH, DESC/STATE, NOGUESS, QUOTE, HEAD, DIFF, CAUSE, REF, NOFALSE, HALT, ARCH), $0
 *   npm run lab:leg-replay -- k2-self-test [--mutate sgdoc-blind|diff-lenient|cause-blind|ambig-blind|negation-blind|newdoc-quote|count-blind]  # L-K2 scorer (score-k2.ts), both directions, $0
 *   npm run lab:leg-replay -- k2-score --run <runDir>[,<runDir>] --experiment <dir>    # L-K2 gate inputs (G1 edit scores + SG-DOC, SG-DIFF, G-AMBIG, DRIFT-CAUSE …), $0
 *   npm run lab:leg-replay -- n1-fixtures --experiment <dir>                           # L-N1 B4/B6: device pool from cached snapshots (identity-proved) + the shipping refusal text, $0
 *   npm run lab:leg-replay -- n1-self-test [--mutate reg-blind|hand-blind|path-blind|undeclared-blind|ref-blind|stop-blind|base-blind|cause-blind|negation-blind|ctrlx-blind|arch-blind|live-read-blind]  # L-N1 scorer (score-n1.ts), $0
 *   npm run lab:leg-replay -- n1-score --run <runDir>[,<runDir>] --experiment <dir>   # L-N1 gate inputs (REG, NOHAND, PATH, BASE, CANARY, CTRLX + revise gates), $0
 *   npm run lab:leg-replay -- nb1-self-test [--mutate secret-blind|value-blind|unpinned-blind|src-blind|first-blind|nopkg-blind|nofalse-blind]  # L-NB1 scorer (score-nb1.ts), $0
 *   npm run lab:leg-replay -- nb1-score --run <runDir>[,<runDir>] --experiment <dir>  # L-NB1 gate inputs (SECRET-RAW, B5-QUOTE, B3 unpinned, B2-FIRST, NOPKG, NOFALSE + L-N1 regression), $0
 *   npm run lab:leg-replay -- nb2-fixtures --experiment <dir>                          # L-NB2: device pool from ONE cached Harvester snapshot (identity-proved) + named canary plants (proved by un-planting), $0
 *   npm run lab:leg-replay -- nb2-self-test [--mutate source-blind|clear-blind|void-blind|author-blind]  # L-NB2 scorer (score-nb2.ts), $0
 *   npm run lab:leg-replay -- nb2-score --run <runDir>[,<runDir>] --experiment <dir>  # L-NB2 gate inputs (nb1 gates + per-quote source split, clear-quote MISS, Author B5, VOID rule), $0
 *   npm run lab:leg-replay -- golden-build --experiment <dir>                         # NO-REGRESSION golden companion <dir>/golden-v<N> (golden-set.ts), $0
 *   npm run lab:leg-replay -- golden-score --run <runDir>[,<runDir>] --experiment <dir>/golden-v<N>  # per golden case: REPRODUCED / FLIPPED (+ direction), $0
 *   npm run lab:leg-replay -- golden-self-test                                        # every golden case recomputes its stored outcome, $0 · golden-pin = owner re-freeze (read-only)
 *   npm run lab:leg-replay -- fixture-fetch --repo <owner/repo> --commit <40 hex> --paths a,b --out <dir>  # L-K-a fixture via the operator's gh (read-only)
 *   npm run lab:leg-replay -- fixture-id-check --fixture <dir> --probe <probe.json>     # G-FIXTURE-ID: fixture render = admin probe, byte for byte, $0
 *
 * DISCIPLINE: dry run unless `--spend`; the cost estimate prints before any call; `--max-usd` stops the run when the
 * running cost would exceed it; every output is saved (rule 8: diff ONE failing case before believing a rate); the
 * run manifest records the code commit, the dirty tracked files, the flags and the sha256 of every input text, and
 * re-checks them at the end (rule 7: know which code produced a number). Production is read-only throughout.
 */
// The platform modules reach lib/prisma.ts transitively. The lab never queries it (the nets use replay-prisma.ts),
// so a dry run needs no database; a placeholder URL makes any accidental real query fail loudly instead.
// lib/prisma.ts connects EAGERLY at import and process.exit(1)s on failure; PAICHART_SKIP_DB_CONNECT is its documented
// opt-out for processes that import it transitively and never query it (2026-07-27).
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgresql://leg-replay-lab:never@127.0.0.1:1/never_connects';
if (!process.env.PAICHART_SKIP_DB_CONNECT) process.env.PAICHART_SKIP_DB_CONNECT = 'true';
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'warn';

import { NO_HELD_EDIT_HEADING, isHeldRenderFactLine } from '../../lib/agents/harness/held-bytes/render-held';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { loadSnapshot, fetchProtocolRows, fetchTemplateRows, utc, type Snapshot } from './snapshot';
import { rebuildPrompt, fidelityChecks, parsedResult, persistedSingleCallInput, sha256, templateTextAsRun, type ProtocolText, type RebuiltPrompt } from './rebuild';
import { runAuthorLeafNets, runLegSynthesizeNets, summarizeFacts } from './nets';
import { patchReviewerContext, patchHarvesterEntry } from './chain';
import type { LiveResult } from './live';
import { storedCallsOf, createRecordedToolServer, recordedToolsReport, isFileCall, type StoredCall } from './recorded-tools';
import { scoreHarvesterQuotes } from './score-quote';
import { findCommitForVersion, protocolTextAtCommit } from './protocol-history';
import { parseReviewerVerdict, locateTerminalVerdict } from '../../lib/agents/harness/parse-verdict';
import { buildExecutionResultJson } from '../../lib/services/execution-artifacts';
import { appendReviewerWarningsSection } from '../../lib/services/report-warnings-section';
import { parseConfidenceScore } from '../../lib/agents/harness/parse-confidence';
import { costForExecution } from '../../lib/services/llm/model-pricing';
import { capabilitiesFor } from '../../lib/services/llm/model-capabilities';
import { isRequirementsFormCheckEligible } from '../../lib/agents/harness/requirements-form-check';
import { computeRequirementsFormCheckStamp, failingTriggerChecks, requirementsInputsFromHarnessRow, REQUIREMENTS_FORM_CORRECTION_FLAG } from '../../lib/agents/harness/requirements-form-correction';
import { harnessRowWithOwnerMap, readOwnerMap } from './score-requirements';
import { applyEdits, type EditSpec } from './edits';
import { snapshotWithInputEdits } from './input-edits';
import { installCheckDataAt, checkDataLabel } from './check-at';
import { buildLabHeldStore, labHeldViewFields, labResolveHeldFiles, type LabHeldStore } from './held-store';
import { heldVariantProtocolAt, snapshotWithVariantBinding, snapshotWithHeldJoin, type VariantBindingReport } from './variant-binding';
import { patchAuthorContext } from './chain';
import { withComputedHarvesterComparison } from './device-comparison-patch';
import { withComputedLiveEvidence, loadLiveEvidenceComputer } from './live-evidence-patch';
import { armKindGate, bindKindGate, resetKindGate, withArmKindGate, kindGateCheck, type ArmKindGate } from './kind-gate';
import { buildEditApplicationFact } from '../../lib/agents/harness/held-bytes/edit-fact';
import { editDiffEntryFields } from '../../lib/agents/harness/held-chain';
import { r9VersionInEffect } from '../../lib/agents/harness/sanitize-chained-output';
import { isHeldEditCorrectionEnabled, HELD_EDIT_CORRECTION_FLAG } from '../../lib/agents/harness/held-edit-correction';
import type { OwningLegResolution } from '../../lib/agents/harness/held-bytes/variant';
import { LAB_SAMPLE_PREFIX, loadLabSample, pureStamp, sampleReproduces } from './lab-sample';
import { loadFileFixture, createFixtureToolServer, fixtureToolsReport, fixtureCaptureReadiness, LAB_PERSIST_LOGGER, type LoadedFixture } from './fixture-tools';
import { loadHarvesterLabSample, loadFrozenHarvest, HARVESTER_SOURCE_FROZEN_PREFIX } from './harvester-source';
import { loadNetworkFixture, createNetworkToolServer, networkToolsReport, type NetworkFixtureSpec, type LoadedNetworkFixture } from './network-fixtures';
export { applyEdits };

const REPO = path.resolve(__dirname, '..', '..');
const RUNS_DIR = path.join(__dirname, 'runs');

// ───────────────────────────── experiment config ─────────────────────────────

/** `authorPlant` (L0b, 2026-10-08): an EditSpec file (appliesTo `author:<authorExecutionId>`) applied with the same
 *  exactly-once replace ops to the Author package BEFORE the leaf nets and the chain — a planted defect or restatement
 *  on an otherwise real package. A non-unique or missing anchor fails the dry run. */
/** `reviewerExecutionId` (L-R1, 2026-10-09): name the node's reviewer instead of deriving it (the snapshot pairs by the
 *  shipping REVIEWER_ROLES set otherwise). `ownerRowItemMap` (requirements_author): a v1 owner-map JSON file, placed in a
 *  COPY of the harness row's `metadata.requirementsRowItemMap` for the in-run form check only — never in a prompt. */
/** `inputEdits` (L-Z1, 2026-10-10): an EditSpec applied exactly once to each of its targets (`leg:description`,
 *  `author-task:description`, `reviewer-task:description`) on a DEEP COPY of the cached snapshot — what the node's agents
 *  were GIVEN changes, in every variant alike (see input-edits.ts). */
/** `harvesterOnly` + `tools: 'recorded'` (2026-10-13, VERBATIM-QUOTE-OMISSION group C): the node's execution (named in
 *  `authorExecutionId`, the snapshot's subject slot) is a HARVESTER, replayed alone — no Reviewer, no chain — with every
 *  tool call served from its production record (recorded-tools.ts). Scored offline by score-quote.ts. `tools` defaults to
 *  the stub; `recorded` is allowed on any node but only a harvester has calls worth serving. */
/** `scoring` (Stage B G1, L-5): the node's pre-registered edit scoring — score-edits.ts NodeScoring. */
/** `architectOnly` (Stage B G1, L-8): the node's execution is an ARCHITECT, replayed alone (no Reviewer, no chain), its Harvester
 *  entry carrying `heldIndex` on a held arm (L-8b). Scored by score-edits.ts `scoreArchitect` (ARCH-QUOTE / ARCH-HANDLE). */
/** L-9 (Stage B G2): `authorSourceByVariant` names, per arm, where this node's fixed Author comes from — `'persisted'` or
 *  `'lab-sample:<run>/<node>/<arm>/<i>'` (lab-sample.ts) — overriding the arm's `authorSource` for this node only (each node's
 *  fixed Author is a different sample). `reviewerBaseEdit`: an EditSpec (appliesTo `held-base:H<n>`) applied to the held files
 *  the REVIEWER-side recompute reads, never to the Author's — the named-state case (the shipping `editDiffEntryFields` then
 *  reads its own `diff-recompute-mismatch`). `diffMustShow`: lines the rendered platform diff must carry (the plant, verbatim). */
/** held-k8s 1k (LAB-DESIGN-model-evaluation.md §1): `fileFixture` (L-K-a) — a fixture folder (fixture-tools.ts) serving this HARVESTER
 *  node's `github-service.get_file_contents` reads beside its recorded cluster reads; `fixturePlants` (L-K-b) — EditSpec files
 *  (appliesTo `fixture:<repo path>`) applied exactly once to a copy of it. `harvesterSourceByVariant` (L-K-c) — per arm, an
 *  ARCHITECT node's Harvester entry: 'persisted' | 'lab-sample:<run>/<H node>/<H arm>/<i>' | 'frozen:<file>' (harvester-source.ts).
 *  `scoring` on these nodes is score-k1.ts K1Scoring. */
/** L-N1 (held-network step 2): `networkFixture` — the B4 device tier, B5 catalogue tier and B6 register refusal (network-fixtures.ts) in front of
 *  a HARVESTER node's recorded tier. */
interface NodeSpec { /** VALUE-LEG-GIT L-VLG-a (value-lane.ts): simulate the Device-sources snapshot production's writer takes at the leg's FIRST execution, over the (input-edited) leg row. */ deviceSourcesSnapshot?: 'first-execution'; /** VALUE-LEG-GIT L-VLG-b: a frozen harvest (committed text + toolCalls) replaces a VALUE leg's stored Harvester, its device facts computed by the shipping nets. */ valueHarvest?: import('./value-lane').ValueHarvestSpec; /** L-CS-N (owner 2026-11-05): replace the frozen Harvester's calls by Git reads served from a fixture (git-harvest-plant.ts). */ harvestFromFixture?: import('./git-harvest-plant').HarvestFromFixture; /** L-CS-N ADDENDUM (h): replace the frozen Harvester's calls by a step-3 Harvester LAB SAMPLE's calls (git-harvest-plant.ts withSampleHarvest). */ harvestFromSample?: string; /** L-CS-N: re-stamp a PERSISTED (planted) Author purely over the arm's held files (the L-9 pure applier), as the edit step would. */ restampPersisted?: boolean; /** L-CS-N: score-csn.ts readings for this node (CsnScoring). */ csn?: import('./score-csn').CsnScoring; /** L-CS-N (ME-B3): the node's rows come from a self-host install — its cached snapshot must carry that provenance (and a node without it must not). */ provenance?: 'self-host'; /** L-CS-N: the stored verdict the provenance check must reproduce (R-FWA3: approved/92). */ provenanceExpect?: { approved: boolean; confidence: number }; /** ME-P2-6: arms of a planted node that DELIBERATELY run without the plant (named, never silent). */ unplantedArms?: string[]; networkFixture?: NetworkFixtureSpec; fileFixture?: string; fixturePlants?: string[]; harvesterSourceByVariant?: Record<string, string>; authorSourceByVariant?: Record<string, string>; reviewerBaseEdit?: string; diffMustShow?: string[]; architectOnly?: boolean; scoring?: import('./score-edits').NodeScoring | import('./score-k1').K1Scoring; id: string; authorExecutionId: string; kind: string; originalVersion?: string; variants: string[]; why?: string; authorPlant?: string; expect?: string; reviewerExecutionId?: string; ownerRowItemMap?: string; n?: number; nByVariant?: Record<string, number>; inputEdits?: string; harvesterOnly?: boolean; tools?: 'stub' | 'recorded' }
interface Measure { name: string; kind: 'count' | 'expected-output-blocks'; regex?: string; flags?: string; contentRegex?: string; lineRegex?: string; why?: string }
interface Experiment {
  label: string; n: number; flags: Record<string, string>;
  baseline: {
    protocols: Record<string, { file: string; version: string; sha256: string }>;
    /** TODAY's template rows, pinned by id (build-candidates fetches them read-only from production). When the node's
     *  Reviewer (or Author) ran on a template listed here, that pinned text is its system base in EVERY variant —
     *  instead of the copy a past pre-fix node froze — and `templateEdits` apply on top of it (L0c, 2026-10-08). */
    templates?: Record<string, { file: string; name: string; role: string; sha256: string }>;
  };
  /** `edits` change the PROTOCOL text (appliesTo: protocol names); `templateEdits` change the role GUIDANCE inside the
   *  frozen template promptTemplate (appliesTo: `role:<agentRole>`) — e.g. the gap-2 qualifier READ.md §6 says must be in
   *  the replayed prompt. Both use the same exactly-once replace ops. */
  /** `authorSource: 'persisted'` (L0a, 2026-10-08): no Author call is made — the persisted package (plus the node's
   *  `authorPlant`, if any) stands in, with its persisted confidence / qualityMetrics / formCheck. $0, no variance:
   *  the Reviewer is the only thing that varies. Default 'live'. */
  /** `requirementsFormCorrection` (L-R3, 2026-10-09): the 2b correction turn ON/OFF for THIS arm, independent of the
   *  process env — so `opusBase` vs `opusLoop` differ only in this lever. Unset ⇒ the env (REQUIREMENTS_FORM_CORRECTION_ENABLED).
   *  Setting it on any arm while `flags` also sets the env is refused (two sources for one lever). */
  /** `requirementsCheckAt` (L-Z2, 2026-10-10): the in-run requirements check (and its scoring) runs on the generated
   *  registry + template data AT THIS COMMIT for this arm; unset ⇒ HEAD's. Groups of different data run one after the
   *  other, never interleaved (check-at.ts). */
  /** PLATFORM-HELD-BYTES Stage B (L-2): `protocolName` + `protocolSource: 'commit:<sha>'` run the arm under the held variant
   *  (the seed's render at that commit, refused unless that commit's obs base = the pinned baseline), on a REBOUND snapshot copy,
   *  with the Author's Harvester entry carrying `heldView` (L-1 + L-3) and the shipping edit step in the loop.
   *  `heldEditCorrection`: the edit step's one correction turn for THIS arm (unset ⇒ HELD_EDIT_CORRECTION_ENABLED; both set is
   *  refused — one lever, two sources). `authorOnly`: no Reviewer call (G1 scores the Author mechanically). */
  variants: Record<string, { edits: string[]; templateEdits?: string[]; dropTemplateDirective?: boolean; authorModel?: string; reviewerModel?: string; authorEffort?: string; reviewerEffort?: string; authorSource?: 'live' | 'persisted'; requirementsFormCorrection?: boolean; requirementsCheckAt?: string;
    protocolName?: string; protocolSource?: string; heldEditCorrection?: boolean; authorOnly?: boolean;
    /** held-k8s step 3 (L-K-e, L-K2): a JOINED domain's held arm — no variant. The protocol is the arm's own candidate (baseline +
     *  edits), the leg keeps its protocol stamp, and the Author/Reviewer template constraints are the OWNING seed's
     *  (`scripts/<heldJoinSeed>.ts` buildTemplateRow, this tree). The held store, view, edit step and diff are the same as a
     *  `protocolName` arm. Refused unless this tree's lib makes the leg held-capable (snapshotWithHeldJoin). Never with protocolName. */
    heldJoinSeed?: string;
    /** Config sources L-CS-N (kind-gate.ts, S3/F15): bind push 1a's `live-read` kind gate for THIS arm — 'open' (the 1.26.0 candidate)
     *  or 'closed' (the 1.25.0 base); unset ⇒ the tree's constant. Arms with different gates never interleave (run() groups by gate). */
    liveReadKind?: 'open' | 'closed';
    /** L-CS-N: a persisted held Author's leaf nets read its stored `editApplication` + the held handles (see prepare). */
    persistedEditApplication?: boolean;
    /** L-CS-a: the protocol version this arm's text SHIPS as (production's population rule reads it; e.g. "1.26.0"). */
    composedVersion?: string;
    /** NB1 (G15): bind each leg-role template's CONSTRAINTS to its owning seed's row in this tree (a template-constraint lever; non-held
     *  arms, architectOnly cells today). Text reach checks every changed row is in the prompt. */
    constraintsSeed?: string }>;
  nodes: NodeSpec[]; measures: Measure[];
  /** L-CS-a: refuse the dry run when the shipping liveEvidence function is not in this tree (an arm would measure a §6 without it). */
  requireLiveEvidence?: boolean;
}

/** MODEL OVERRIDE (2026-10-07): a variant may run the Author and/or Reviewer on a different model than the persisted run.
 *  The model is the load-bearing identity in normalizeModelConfig, so it is set on BOTH the rebuilt prompt's `model` and its
 *  `llmConfigSource.model`; capabilitiesFor() is called here so an unknown model fails LOUD in the $0 dry run, not mid-spend.
 *  maxTokens is clamped to the model's ceiling downstream exactly as in production. Every call's served model is recorded
 *  (sample.json calls[].model), and the variant's models are in the run manifest (nodes.<id>.variants.<v>.models). */
export function withModel(p: RebuiltPrompt, model: string | null, effort: string | null = null): RebuiltPrompt {
  if (!model && !effort) return p;
  const m = model ?? p.model;
  const caps = capabilitiesFor(m);
  // EFFORT OVERRIDE (2026-10-07): production's tool loop sends `effort ?? 'high'` for every model, so an unset effort IS
  // high. An override must be a level the model accepts EXACTLY — no silent clamp (clampEffort would turn a typo into a
  // different experiment). Recorded in llmConfigSource.effort, which normalizeModelConfig reads.
  if (effort && !caps.allowedEfforts.includes(effort as any)) throw new Error(`effort "${effort}" is not accepted by ${m} (allowed: ${caps.allowedEfforts.join(', ') || 'none'})`);
  return { ...p, model: m, llmConfigSource: { ...p.llmConfigSource, model: m, ...(effort ? { effort } : {}) } };
}
function effortOf(p: RebuiltPrompt): string { return ((p.llmConfigSource as any)?.effort as string) ?? 'high'; }
function shortModel(m: string | null | undefined): string { return (m ?? '?').replace(/^claude-/, ''); }

function loadExperiment(dir: string): Experiment { return JSON.parse(fs.readFileSync(path.join(dir, 'experiment.json'), 'utf8')); }

function variantFile(exp: Experiment, name: string, variant: string): string {
  const b = exp.baseline.protocols[name];
  return variant === 'baseline' ? b.file : b.file.replace(/\.baseline\.md$/, `.${variant}.md`);
}

/** Pin the baseline texts (from the CURRENT prod rows, read-only) and materialize every variant from its edits. */
function buildCandidates(dir: string, refresh: boolean) {
  const exp = loadExperiment(dir);
  const names = Object.keys(exp.baseline.protocols);
  const missing = names.filter((n) => refresh || !fs.existsSync(path.join(dir, exp.baseline.protocols[n].file)));
  if (missing.length) {
    const rows = fetchProtocolRows(missing);
    for (const n of missing) {
      const row = rows.find((r) => r.name === n);
      if (!row) throw new Error(`${n}: no production row`);
      if (row.version !== exp.baseline.protocols[n].version) throw new Error(`${n}: production is ${row.version}, the experiment pins ${exp.baseline.protocols[n].version} — update the experiment deliberately`);
      fs.mkdirSync(path.dirname(path.join(dir, exp.baseline.protocols[n].file)), { recursive: true });
      fs.writeFileSync(path.join(dir, exp.baseline.protocols[n].file), row.promptText);
      console.log(`  pinned ${n}@${row.version} from the production row (updatedAt ${row.updatedAt})`);
    }
  }
  const manifest: Record<string, unknown> = {};
  for (const n of names) {
    const base = fs.readFileSync(path.join(dir, exp.baseline.protocols[n].file), 'utf8');
    exp.baseline.protocols[n].sha256 = sha256(base);
    manifest[`${n}:baseline`] = { file: exp.baseline.protocols[n].file, sha256: sha256(base), chars: base.length };
    for (const [v, spec] of Object.entries(exp.variants)) {
      if (v === 'baseline') continue;
      const edits: EditSpec[] = spec.edits.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
      const { text, applied } = applyEdits(base, edits, n);
      if (!applied.length) continue;
      const f = variantFile(exp, n, v);
      fs.writeFileSync(path.join(dir, f), text);
      manifest[`${n}:${v}`] = { file: f, sha256: sha256(text), chars: text.length, edits: applied, deltaChars: text.length - base.length };
      console.log(`  ${n} ${v}: ${applied.join('+')} → ${f} (+${text.length - base.length} chars)`);
    }
  }
  // Templates (L0c): pin today's rows, then prove every variant's templateEdits apply exactly once to each pinned row
  // of the role they target (the anchors fail HERE, at $0, rather than mid-run).
  const tpls = exp.baseline.templates ?? {};
  const tIds = Object.keys(tpls);
  const tMissing = tIds.filter((id) => refresh || !fs.existsSync(path.join(dir, tpls[id].file)));
  if (tMissing.length) {
    const rows = fetchTemplateRows(tMissing);
    for (const id of tMissing) {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error(`template ${id}: no production row`);
      if (row.name !== tpls[id].name || row.defaultRole !== tpls[id].role) throw new Error(`template ${id}: production is "${row.name}"/${row.defaultRole}, the experiment pins "${tpls[id].name}"/${tpls[id].role}`);
      fs.mkdirSync(path.dirname(path.join(dir, tpls[id].file)), { recursive: true });
      fs.writeFileSync(path.join(dir, tpls[id].file), row.promptTemplate);
      console.log(`  pinned template ${row.name} (${id}) from the production row (updatedAt ${row.updatedAt})`);
    }
  }
  for (const id of tIds) {
    const base = fs.readFileSync(path.join(dir, tpls[id].file), 'utf8');
    tpls[id].sha256 = sha256(base);
    manifest[`template:${id}:baseline`] = { file: tpls[id].file, name: tpls[id].name, sha256: sha256(base), chars: base.length };
    for (const [v, spec] of Object.entries(exp.variants)) {
      if (!spec.templateEdits?.length) continue;
      const edits: EditSpec[] = spec.templateEdits.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
      const { text, applied } = applyEdits(base, edits, `role:${tpls[id].role}`);
      if (!applied.length) continue;
      manifest[`template:${id}:${v}`] = { sha256: sha256(text), chars: text.length, edits: applied, deltaChars: text.length - base.length };
      console.log(`  template ${tpls[id].name} ${v}: ${applied.join('+')} (+${text.length - base.length} chars)`);
    }
  }
  // Plants (L0b): each must apply exactly once to its node's persisted package.
  for (const nd of exp.nodes.filter((x) => x.authorPlant)) {
    const r = plantFor(dir, nd, parsedResult(loadSnapshot(nd.authorExecutionId).author)!.finalResponse, undefined, true);
    if (!r.editId) { console.log(`  plant ${nd.id}: ${nd.authorPlant} targets lab samples only (checked at the dry run)`); continue; }
    manifest[`plant:${nd.id}`] = { file: nd.authorPlant, edit: r.editId, sha256: sha256(r.text), deltaChars: r.deltaChars };
    console.log(`  plant ${nd.id}: ${nd.authorPlant} (${r.deltaChars >= 0 ? '+' : ''}${r.deltaChars} chars)`);
  }
  // Input edits (L-Z1): each must apply exactly once to every target it names, on a copy of the snapshot.
  for (const nd of exp.nodes.filter((x) => x.inputEdits)) {
    const r = snapshotWithInputEdits(dir, nd, loadSnapshot(nd.authorExecutionId, { reviewerExecutionId: nd.reviewerExecutionId ?? null })).report!;
    manifest[`inputEdits:${nd.id}`] = r;
    console.log(`  input edit ${nd.id}: ${r.edit} → ${Object.entries(r.targets).map(([t, x]) => `${t} ${x.beforeChars}→${x.afterChars}`).join(' · ')}`);
  }
  // Check data (L-Z2): every pinned commit must resolve and carry the generated data.
  for (const [v, spec] of Object.entries(exp.variants)) {
    if (!spec.requirementsCheckAt) continue;
    const d = installCheckDataAt(spec.requirementsCheckAt);
    installCheckDataAt(null);
    manifest[`requirementsCheckAt:${v}`] = { commit: spec.requirementsCheckAt, ...d };
    console.log(`  ${v}: in-run check data ${d.source} (registry ${d.registrySha256.slice(0, 12)}, template ${d.templateSha256.slice(0, 12)})`);
  }
  fs.writeFileSync(path.join(dir, 'experiment.json'), JSON.stringify(exp, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'protocols', 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✅ candidates built; sha256 pinned in experiment.json and protocols/MANIFEST.json`);
}

/** The protocol text a node runs under for a variant. Verifies the pinned sha and re-derives the variant from its edits. */
function protocolFor(exp: Experiment, dir: string, snap: Snapshot, variant: string): ProtocolText {
  const pi = parsedResult(snap.author)?.protocolInjection;
  const name: string | undefined = pi?.delta?.name;
  if (!name) throw new Error(`${snap.author.exec.id}: no persisted protocol binding`);
  if (variant === 'historical') {
    const ver = pi.delta.version;
    const b = exp.baseline.protocols[name];
    if (b && b.version === ver) return { name, version: ver, text: fs.readFileSync(path.join(dir, b.file), 'utf8'), source: `historical=baseline-file@${ver}` };
    const c = findCommitForVersion(name, ver, utc(snap.author.exec.startTime).toISOString());
    if (!c) throw new Error(`historical: no seed commit renders ${name}@${ver} (commits before 88a3939c are not renderable)`);
    return { name, version: ver, text: protocolTextAtCommit(name, c).text, source: `historical=commit:${c.slice(0, 12)}@${ver}` };
  }
  const b = exp.baseline.protocols[name];
  if (!b) throw new Error(`experiment pins no baseline for ${name}`);
  const base = fs.readFileSync(path.join(dir, b.file), 'utf8');
  if (b.sha256 && sha256(base) !== b.sha256) throw new Error(`${b.file}: sha256 differs from the pinned value — the baseline file was edited`);
  if (variant === 'baseline') return { name, version: b.version, text: base, source: `baseline:${b.file}` };
  const spec = exp.variants[variant];
  if (!spec) throw new Error(`no variant ${variant}`);
  const edits: EditSpec[] = spec.edits.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const derived = applyEdits(base, edits, name);
  // A variant whose protocol edits do not target this protocol (or a guidance-only variant) runs the baseline text.
  if (!derived.applied.length) return { name, version: b.version, text: base, source: `${variant}:baseline-text (no protocol edit for ${name})` };
  const f = path.join(dir, variantFile(exp, name, variant));
  if (!fs.existsSync(f)) throw new Error(`${f} missing — run build-candidates`);
  if (fs.readFileSync(f, 'utf8') !== derived.text) throw new Error(`${f} differs from baseline + edits — rebuild candidates (a hand edit to the materialized file is not a candidate)`);
  return { name, version: `${b.version}+${variant}`, text: derived.text, source: `${variant}:${variantFile(exp, name, variant)}` };
}

/**
 * L-6 (Stage B): `--fake-llm fixture:<dir>` — TEST ONLY, $0. A held arm's Author answers from `<dir>/<node>.md` (or
 * `<dir>/<node>.<variant>.md`); every LATER model call of that sample (the edit step's correction turn, #90) answers from
 * `<dir>/<node>.correction.md` when present, else the same text. Each fixture is a canned package — a correct edit set, a
 * non-unique SEARCH, a redacted-line touch, a whole-file retype — whose expected state/refusal the lab test pins.
 */
export function heldFixtureFake(dir: string) {
  return (job: Pick<Job, 'node' | 'variant' | 'snap'>) => {
    const first = [path.join(dir, `${job.node.id}.${job.variant}.md`), path.join(dir, `${job.node.id}.md`)].find((f) => fs.existsSync(f));
    if (!first) throw new Error(`fixture ${dir}: no ${job.node.id}.md`);
    const later = path.join(dir, `${job.node.id}.correction.md`);
    const texts = [fs.readFileSync(first, 'utf8'), fs.existsSync(later) ? fs.readFileSync(later, 'utf8') : fs.readFileSync(first, 'utf8')];
    let k = 0;
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
    return async () => {
      const text = texts[Math.min(k++, texts.length - 1)];
      return { text, stopReason: 'end_turn', functionCalls: [], rawContentBlocks: [{ type: 'text', text }], usage, metadata: { model: job.snap.author.exec.modelUsed } };
    };
  };
}

/** Stage B (L-2): the held variant's text at its build commit, refused unless that commit's obs base = the pinned baseline. */
function heldProtocolFor(exp: Experiment, dir: string, spec: { protocolName?: string; protocolSource?: string }): ProtocolText {
  const b = exp.baseline.protocols['observability-config-protocol'];
  if (!b) throw new Error('a held-variant arm needs the observability-config baseline pinned (D-L: the variant is built over it)');
  if (!spec.protocolSource) throw new Error('a held-variant arm needs protocolSource: commit:<sha>');
  return heldVariantProtocolAt(spec.protocolName!, spec.protocolSource, { text: fs.readFileSync(path.join(dir, b.file), 'utf8'), version: b.version });
}

/** L-CS-a (ME-B4 gate, 2026-11-04): the protocol version production would stamp for this arm — `variants.<arm>.composedVersion` (a
 *  candidate arm declares the version its text ships as, e.g. 1.26.0), else the arm's protocol version (`1.25.0`, or `1.25.0+<arm>`,
 *  whose numeric prefix the population rule reads). */
/** O-2(a): the protocol injection production would stamp on this arm's executions — the arm's composed delta. */
/** VALUE-LEG-GIT: a node on the value lane (its nets read the leg row through replay-prisma `legReads`). */
/** key-order-insensitive copy for the constraintsSeed no-change guard (jsonb order is not content). */
function jsonbKeyOrderLab(v: unknown): unknown { return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, jsonbKeyOrderLab((v as any)[k])])) : v; }
export function isValueLaneNode(node: { deviceSourcesSnapshot?: string; valueHarvest?: unknown }): boolean { return !!(node.deviceSourcesSnapshot || node.valueHarvest); }
async function applyValueLane(dir: string, node: NodeSpec, snap: Snapshot): Promise<{ snap: Snapshot; report: Record<string, any> | null }> {
  if (!isValueLaneNode(node)) return { snap, report: null };
  const { withFirstExecutionSnapshot, withValueHarvest } = await import('./value-lane');
  let s = snap; const report: Record<string, any> = {};
  if (node.deviceSourcesSnapshot) {
    if (node.deviceSourcesSnapshot !== 'first-execution') throw new Error(`${node.id}: deviceSourcesSnapshot must be 'first-execution'`);
    const r = withFirstExecutionSnapshot(s);
    if (r.report.state === 'already-snapshotted' || r.report.state === 'no-leg' || r.report.state === 'not-device-source-protocol') throw new Error(`${node.id}: deviceSourcesSnapshot — ${r.report.state}`);
    s = r.snap; report.firstExecutionSnapshot = r.report;
  }
  if (node.valueHarvest) { const r = await withValueHarvest(dir, s, node.valueHarvest); s = r.snap; report.valueHarvest = r.report; }
  return { snap: s, report };
}
export function armProtocolInjection(exp: Pick<Experiment, 'variants'>, v: string, protocol: { name: string; version: string | null }): { delta: { name: string; version: string } } {
  return { delta: armComposedProtocol(exp, v, protocol) };
}
export function armComposedProtocol(exp: Pick<Experiment, 'variants'>, v: string, protocol: { name: string; version: string | null }): { name: string; version: string } {
  return { name: protocol.name, version: exp.variants[v]?.composedVersion ?? protocol.version ?? '' };
}

/** held-k8s (L-K-e): the arm's held binding — a variant (`protocolName`, obs Stage B) or a joined domain (`heldJoinSeed`). */
function heldArmOf(exp: Experiment, v: string): { kind: 'variant' | 'join'; spec: Experiment['variants'][string] } | null {
  const spec = exp.variants[v];
  if (!spec) return null;
  if (spec.protocolName && spec.heldJoinSeed) throw new Error(`variant ${v}: protocolName and heldJoinSeed are two held bindings — name one`);
  return spec.protocolName ? { kind: 'variant', spec } : spec.heldJoinSeed ? { kind: 'join', spec } : null;
}
function heldArmProtocol(exp: Experiment, dir: string, snap: Snapshot, v: string, arm: NonNullable<ReturnType<typeof heldArmOf>>): ProtocolText {
  return arm.kind === 'variant' ? heldProtocolFor(exp, dir, arm.spec) : protocolFor(exp, dir, snap, v);
}
function heldArmBinding(snap: Snapshot, arm: NonNullable<ReturnType<typeof heldArmOf>>): { snap: Snapshot; report: VariantBindingReport; protocolName: string } {
  if (arm.kind === 'variant') return { ...snapshotWithVariantBinding(snap, arm.spec.protocolName!), protocolName: arm.spec.protocolName! };
  const b = snapshotWithHeldJoin(snap, arm.spec.heldJoinSeed!);
  return { ...b, protocolName: b.report.legProtocol };
}

/** L0b: the node's planted package. The EditSpec must target `author:<authorExecutionId>` and apply exactly once.
 *  L-9 (G2): a plant may also (or instead) target a node's `lab-sample:<ref>` source; each op names its form with op-level
 *  `appliesTo` (the same defect, written once per Author form). `target` picks the form; every target the spec lists must be one
 *  of THIS node's Author sources (a plant aimed at another node still fails). A spec that does not list `target` is the identity
 *  for that form (`optional`), else a failure. */
export function plantTargets(node: Pick<NodeSpec, 'authorExecutionId' | 'authorSourceByVariant'>): string[] {
  return [`author:${node.authorExecutionId}`, ...Object.values(node.authorSourceByVariant ?? {}).filter((s) => s.startsWith(LAB_SAMPLE_PREFIX))];
}
/**
 * ME-P2-6 (G3 entry, 2026-10-16): every arm of a planted node either RECEIVES the plant or is NAMED unplanted. `plantFor(…,
 * optional = true)` returns the identity for an Author form the spec does not list, and a LIVE arm never sees a plant at all, so
 * without this an arm could run unplanted with only the per-arm report's `plant: null` to say so — a gate miss on a must-refuse
 * cell, a silently wrong contrast on a measured base cell. Returns the arms that would run unplanted unannounced; run() refuses
 * them before any call (dry run included). Arm → Author form: `persisted` ⇒ `author:<authorExecutionId>`, `lab-sample:…` ⇒
 * itself, `live` ⇒ none (no plant can apply).
 */
export function plantArmGaps(dir: string, node: Pick<NodeSpec, 'id' | 'authorExecutionId' | 'authorPlant' | 'authorSourceByVariant' | 'variants' | 'unplantedArms'>,
  armSource: (v: string) => string, onlyVariants: string[] | null): string[] {
  if (!node.authorPlant) return [];
  const spec: EditSpec = JSON.parse(fs.readFileSync(path.join(dir, node.authorPlant), 'utf8'));
  const gaps: string[] = [];
  for (const v of node.variants) {
    if (onlyVariants && !onlyVariants.includes(v)) continue;
    if (node.unplantedArms?.includes(v)) continue;
    const src = armSource(v);
    const form = src === 'persisted' ? `author:${node.authorExecutionId}` : src.startsWith(LAB_SAMPLE_PREFIX) ? src : null;
    if (!form) gaps.push(`${v} (live Author — a plant never applies)`);
    else if (!spec.appliesTo.includes(form)) gaps.push(`${v} (${form} not in the plant's appliesTo)`);
  }
  return gaps;
}
export function plantFor(dir: string, node: Pick<NodeSpec, 'id' | 'authorExecutionId' | 'authorPlant' | 'authorSourceByVariant'>, persisted: string,
  target = `author:${node.authorExecutionId}`, optional = false): { text: string; editId: string | null; deltaChars: number } {
  if (!node.authorPlant) return { text: persisted, editId: null, deltaChars: 0 };
  const spec: EditSpec = JSON.parse(fs.readFileSync(path.join(dir, node.authorPlant), 'utf8'));
  const own = plantTargets(node);
  const stray = spec.appliesTo.filter((t) => !own.includes(t));
  if (stray.length || !spec.appliesTo.length) throw new Error(`${node.id}: plant ${node.authorPlant} does not target author:${node.authorExecutionId}${stray.length ? ` (it targets ${stray.join(', ')})` : ''}`);
  if (!spec.appliesTo.includes(target)) {
    if (optional) return { text: persisted, editId: null, deltaChars: 0 };
    throw new Error(`${node.id}: plant ${node.authorPlant} does not target ${target}`);
  }
  const r = applyEdits(persisted, [spec], target);
  if (!r.applied.length) throw new Error(`${node.id}: plant ${node.authorPlant} does not target ${target}`);
  return { text: r.text, editId: spec.id, deltaChars: r.text.length - persisted.length };
}

/**
 * LAB-PLANT-PRESENCE-CHECK (rank 3, 2026-10-19; lab-cost-reduction ANSWER §2 R-C — the VOID class, $10.85 over L12–L17): a planted
 * arm's rendered Reviewer prompt must CARRY the plant, compared with its unplanted TWIN (same arm, same text, the unplanted package).
 * Refused before any call when the two prompts are identical, when a line the plant adds (in an op's `new`, not its `old`) is not
 * more frequent in the planted prompt, or when a line it removes is not less frequent. Lines that differ OUTSIDE the plant's own
 * lines are derived renders (the rendered held diff, leaf facts): counted and named for the dry-run reader, never refused.
 */
export function plantPresence(spec: EditSpec, twinUser: string, plantedUser: string, target?: string): { ok: boolean; failures: string[]; outsidePlant: string[] } {
  const count = (t: string) => { const m = new Map<string, number>(); for (const l of t.split('\n')) m.set(l, (m.get(l) ?? 0) + 1); return m; };
  const tw = count(twinUser); const pl = count(plantedUser);
  const failures: string[] = []; const own = new Set<string>();
  if (twinUser === plantedUser) failures.push('the planted prompt is byte-identical to its unplanted twin');
  // Only the ops that apply to THIS arm's Author form (an op may name a subset of the spec's targets — G2 R-COLLATERAL).
  for (const op of spec.ops.filter((o) => !target || !o.appliesTo || o.appliesTo.includes(target))) {
    const d = lineDelta(op.old, op.new);
    for (const l of d.added.filter((x) => x.trim() !== '')) { own.add(l); if ((pl.get(l) ?? 0) <= (tw.get(l) ?? 0)) failures.push(`added line not in the planted prompt: ${l.trim().slice(0, 80)}`); }
    for (const l of d.removed.filter((x) => x.trim() !== '')) { own.add(l); if ((pl.get(l) ?? 0) >= (tw.get(l) ?? 0)) failures.push(`removed line still in the planted prompt as often as in the twin: ${l.trim().slice(0, 80)}`); }
  }
  const delta = lineDelta(twinUser, plantedUser);
  const outsidePlant = [...delta.added.map((l) => `+${l}`), ...delta.removed.map((l) => `-${l}`)].filter((l) => l.length > 1 && !own.has(l.slice(1)));
  return { ok: failures.length === 0, failures, outsidePlant };
}

/** Multiset line delta (order-free): lines only in `a` (removed) and only in `b` (added). Enough to name a lever's footprint. */
export function lineDelta(a: string, b: string): { removed: string[]; added: string[] } {
  const count = new Map<string, number>();
  for (const l of a.split('\n')) count.set(l, (count.get(l) ?? 0) + 1);
  const added: string[] = [];
  for (const l of b.split('\n')) { const c = count.get(l) ?? 0; if (c > 0) count.set(l, c - 1); else added.push(l); }
  const removed = [...count.entries()].flatMap(([l, c]) => Array(c).fill(l));
  return { removed, added };
}

/** L-9 (G2): the Reviewer-side held files with `reviewerBaseEdit` applied (base AND view of the named handle, each exactly once);
 *  the Author's stamp keeps the files it was computed over. */
export function reviewerSideFiles(dir: string, node: Pick<NodeSpec, 'id' | 'reviewerBaseEdit'>, files: import('../../lib/agents/harness/held-bytes/apply').HeldFileInput[]) {
  if (!node.reviewerBaseEdit) return files;
  const spec: EditSpec = JSON.parse(fs.readFileSync(path.join(dir, node.reviewerBaseEdit), 'utf8'));
  return files.map((f) => {
    const t = `held-base:${f.handle}`;
    if (!spec.appliesTo.includes(t)) return f;
    if (typeof f.baseText !== 'string' || typeof f.viewText !== 'string') throw new Error(`${node.id}: reviewerBaseEdit targets ${t}, which is not rendered`);
    return { ...f, baseText: applyEdits(f.baseText, [spec], t).text, viewText: applyEdits(f.viewText, [spec], t).text };
  });
}

/** The pinned template text for a template id, sha-checked (null when the experiment pins none for it). */
function pinnedTemplate(exp: Experiment, dir: string, templateId: string | null | undefined): string | null {
  const t = templateId ? exp.baseline.templates?.[templateId] : undefined;
  if (!t) return null;
  const text = fs.readFileSync(path.join(dir, t.file), 'utf8');
  if (t.sha256 && sha256(text) !== t.sha256) throw new Error(`${t.file}: sha256 differs from the pinned value — the template file was edited`);
  return text;
}

/** The Reviewer's result.json `reviewerVerdict` exactly as production builds it — the SHIPPING builder
 *  (buildExecutionResultJson), so `warnings` / `untranscribedLabelLines` / `evidenceGrading` nest as they do live. */
export function shippingReviewerVerdict(finalResponse: string, role = 'change_reviewer'): Record<string, any> | null {
  const rj = buildExecutionResultJson({
    taskId: 'lab', taskTitle: 'lab', agentRole: role, modelUsed: 'lab', finalResponse, confidenceScore: null,
    turnCount: 0, maxToolTurns: 1, toolCallResults: [], successfulToolCalls: 0, failedToolCalls: 0,
    executionTime: 0, tokensUsed: 0, correctionTurnUsed: false,
  } as any);
  return (rj.reviewerVerdict as Record<string, any>) ?? null;
}

/** The Author's stamped result as the chainer would carry it, for a PERSISTED package (L0a), optionally planted. */
function persistedAuthorResult(snap: Snapshot, text: string, leafStamped: Record<string, Record<string, unknown>>) {
  const ares = parsedResult(snap.author)!;
  const qm = ares.qualityMetrics ? { ...ares.qualityMetrics, responseLength: text.length } : null;
  // GOLDEN-REVIEWER-BYTE-FIDELITY (b), 2026-11-06: a VALUE leg's Derivation Architect is stamped `derivationContainment` at its OWN
  // persist (leaf-persist net), BEFORE its Reviewer runs, so production's derivation_reviewer saw the line. The replay cannot recompute
  // it (the net's $queryRaw is outside the replay stub), so an UNPLANTED persisted package carries its STORED stamp; a planted text
  // carries what the replayed leaf net stamped (none today), never the stored stamp of a different text. A change-leg Author's
  // stored result carries no such stamp (it is computed at the leg's SYNTHESIZE, after the review), so its bytes stand.
  const derivationContainment = text === ares.finalResponse ? (ares.derivationContainment ?? null) : (leafStamped.derivationContainment ?? null);
  return {
    finalResponse: text, confidenceScore: ares.confidenceScore ?? null, qualityMetrics: qm,
    markerPresence: leafStamped.markerPresence ?? null, rollbackContainment: leafStamped.rollbackContainment ?? null, derivationContainment,
    toolLoop: { formCheck: ares.toolLoop?.formCheck ?? null },
    validationToolCalls: leafStamped.validationToolCalls, gitDeviceComparison: leafStamped.gitDeviceComparison, liveEvidence: leafStamped.liveEvidence,
  };
}

// ───────────────────────────── reviewer warning measures (L0e, 2026-10-08) ─────────────────────────────

const LABEL_LINE = /NON-BLOCKING WARNING \(/;
/** Per-sample LEXICAL measures on the Reviewer's output for WARNINGS-INVISIBLE batch 2 (BATCH2-DRAFT §10.1 L0e).
 *  Facts about the text, never a verdict; every count names samples to READ. */
export function reviewerWarningMeasures(text: string, rv: Record<string, any> | null) {
  const lines = text.split('\n');
  const count = (re: RegExp) => lines.filter((l) => re.test(l)).length;
  const warnings: Array<{ id: string; text: string }> = Array.isArray(rv?.warnings) ? rv!.warnings : [];
  const blocking: string[] = Array.isArray(rv?.blocking) ? rv!.blocking : [];
  const term = locateTerminalVerdict(text);
  const body = term ? text.slice(0, term.index) : text;
  const IP = '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}';
  // Own enumeration proxy: an address range/span written out (a.b.c.d – a.b.c.d, or .N–.M), or one line naming ≥ 3
  // distinct IPv4 addresses (a member set). A proxy for "the reviewer built its own span" — read, never believe.
  const rangeRe = new RegExp(`${IP}(?:/\\d{1,2})?\\s*(?:–|—|-|to|through|\\.\\.)\\s*(?:${IP}|\\.\\d{1,3}\\b)|\\.\\d{1,3}\\s*(?:–|—)\\s*\\.\\d{1,3}\\b`);
  const ownEnumeration = body.split('\n').filter((l) => rangeRe.test(l) || new Set(l.match(new RegExp(IP, 'g')) ?? []).size >= 3).length;
  const restated = warnings.filter((w) => w.id === 'restated-conclusion');
  // D7 (arch M3) — hand read only: does the warning attribute the claim to the package, or restate it as the reviewer's own?
  const attribution = restated.map((w) => ({
    text: w.text,
    attribution: /\b(the package|the author|package['’]s|author['’]s)\b|\b(package|author)\b.{0,60}\b(states?|stated|restat\w*|says|claims?|asserts?|gloss\w*|writes|repeats?)\b/i.test(w.text) ? 'attributes-to-package' : 'unattributed',
  }));
  return {
    restatedLabel: count(/^NON-BLOCKING WARNING \(restated-conclusion\):/),
    reachLabel: count(/^NON-BLOCKING WARNING \(reachability-after-suppression\):/),
    restatedTranscribed: restated.length,
    reachTranscribed: warnings.filter((w) => w.id === 'reachability-after-suppression').length,
    otherTranscribed: warnings.filter((w) => w.id !== 'restated-conclusion' && w.id !== 'reachability-after-suppression').map((w) => w.id),
    labelInBlocking: blocking.filter((b) => /^\W*NON-BLOCKING WARNING/.test(b)).length,
    negatedLabel: lines.filter((l) => LABEL_LINE.test(l) && /\bnone\b|no restat|does not apply|not applicable|not warranted|no warning|\bno\b\W{0,3}NON-BLOCKING WARNING/i.test(l)).length,
    untranscribedLabelLines: typeof rv?.untranscribedLabelLines === 'number' ? rv!.untranscribedLabelLines : null,
    ownEnumeration,
    attribution,
    // Blocking-item proxies for D2 / D6 / H1 — READ each flagged sample.
    blockingOnlyRestatement: rv?.approved === false && blocking.length > 0 && blocking.every((b) => /restat|self-?verif|self-?assess|self-?grad|certif|narrative|gloss|conclusion/i.test(b)),
    blockingNamesMissingStep: blocking.some((b) => /acceptance check|no (?:validation )?step|missing (?:a )?(?:validation )?step|not proven|unproven|no step proves|validation step/i.test(b)),
    blockingSelfGradeWords: blocking.some((b) => /self-?verif|verification table|\btable\b/i.test(b)),
  };
}

/** §10.4 P-REACH pass, per sample: exactly one reach line → transcribed → leg fact registered → section line, no prefix. */
export function reachChainPass(m: ReturnType<typeof reviewerWarningMeasures>, legFact: Record<string, any> | null, section: string): boolean {
  const reg = (legFact?.reviewers ?? []).some((r: any) => (r.warnings ?? []).some((w: any) => w.id === 'reachability-after-suppression' && w.registered === true));
  return m.reachLabel === 1 && m.reachTranscribed === 1 && m.labelInBlocking === 0 && (legFact?.count ?? 0) >= 1 && reg
    && section.includes('- reachability-after-suppression — ') && !section.includes('NON-BLOCKING WARNING (');
}

// ───────────────────────────── measures, grouping ─────────────────────────────

export function computeMeasures(text: string, measures: Measure[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of measures) {
    if (m.kind === 'count') out[m.name] = (text.match(new RegExp(m.regex!, m.flags?.includes('g') ? m.flags : `${m.flags ?? ''}g`)) ?? []).length;
    else {
      const content = new RegExp(m.contentRegex!, 'im');
      let n = 0;
      // Fenced blocks introduced within 3 lines of an "Expected output/result" label.
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!/^\s*```/.test(lines[i])) continue;
        let j = i + 1; while (j < lines.length && !/^\s*```/.test(lines[j])) j++;
        const label = lines.slice(Math.max(0, i - 3), i).join('\n');
        if (/expected\s+(output|result)/i.test(label) && content.test(lines.slice(i + 1, j).join('\n'))) n++;
        i = j;
      }
      if (m.lineRegex) n += (text.match(new RegExp(m.lineRegex, 'gi')) ?? []).length;
      out[m.name] = n;
    }
  }
  return out;
}

/** LAB HEURISTIC, labelled as such: groups blocking items by subject for the summary. Items are saved verbatim. */
// Order is precedence. Calibrated on the 7 persisted verdicts of the 2026-10-07 nodes (each lands where READ.md §1 puts it:
// O1 self-comparison, O4 access-control coverage, O5/O7 validation form); a NEW item may land wrong — read the verbatim list.
export const BLOCKING_GROUPS: Array<[string, RegExp]> = [
  ['machine-parsed-block', /Consumed Values|Derived Values|Harvested Allocations|machine-parsed/i],
  ['self-comparison', /self-comparison|tautolog|can never fail|compares? .{0,40}(with|to) (a copy of )?itself/i],
  ['access-control-coverage', /admitted[- ]sender|denied[- ]sender|admitted (and|\/) denied|\badmitted\b.{0,60}\bprobe|negative probe|per (granted )?(port|listener)/i],
  ['validation-form', /expected output|literal|prose|presence|comparison shape|describ|character-for-character|quotable|PASS|FAIL|validation step/i],
  ['rollback', /rollback|restore/i],
  ['provenance-evidence', /harvest|evidence|unsourced|provenance|source/i],
];
export function groupOf(item: string): string {
  for (const [g, re] of BLOCKING_GROUPS) if (re.test(item)) return g;
  return 'other';
}

// ───────────────────────────── estimate ─────────────────────────────

/** Tokens-per-char measured on this node where the persisted execution was one LLM call; else the lab default. */
const DEFAULT_CHARS_PER_TOKEN = 2.67; // measured 2026-10-07: O7 author 154,104 prompt chars / 57,689 tokens
function promptChars(p: RebuiltPrompt) { return p.system.length + p.user.length + JSON.stringify(p.tools).length; }

function estimateCall(p: RebuiltPrompt, outTokens: number, charsPerToken: number, cached: boolean, model: string) {
  const inTok = Math.round(promptChars(p) / charsPerToken);
  const prefix = Math.round((p.system.length + JSON.stringify(p.tools).length) / charsPerToken);
  const tokens = cached
    ? { inputTokens: inTok - prefix, cacheReadTokens: prefix, cacheCreationTokens: 0, outputTokens: outTokens }
    : { inputTokens: inTok - prefix, cacheReadTokens: 0, cacheCreationTokens: prefix, outputTokens: outTokens };
  return { inTok, cost: costForExecution(tokens, model, new Date()).costUsd ?? 0 };
}

// ───────────────────────────── manifest (rule 7) ─────────────────────────────

function codeState() {
  const head = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD']).toString().trim();
  const dirty = execFileSync('git', ['-C', REPO, 'status', '--porcelain', '--', 'lib', 'scripts', 'prisma']).toString()
    .split('\n').filter(Boolean).filter((l) => !l.includes('scripts/leg-replay-lab/') && !l.includes('scripts/test-leg-replay-lab.ts'));
  const dirtyHashes: Record<string, string> = {};
  for (const l of dirty) {
    const f = l.slice(3).trim();
    try { dirtyHashes[f] = sha256(fs.readFileSync(path.join(REPO, f), 'utf8')); } catch { dirtyHashes[f] = 'unreadable'; }
  }
  return { head, dirty: dirtyHashes };
}

// ───────────────────────────── run ─────────────────────────────

interface PersistedAuthor { text: string; plantId: string | null; chainExecutionId: string; leafStamped: Record<string, Record<string, unknown>>; reviewer: RebuiltPrompt;
  /** L-9: the chained Author result (with its pure `editApplication` stamp); absent ⇒ built from the persisted result. */
  authorResult?: Record<string, any>; source?: string }
interface Job { node: NodeSpec; variant: string; protocol: ProtocolText; snap: Snapshot; author: RebuiltPrompt; reviewerBase: RebuiltPrompt | null; reviewerTemplate: string | null; dropTemplateDirective: boolean; reviewerModel: string | null; reviewerEffort: string | null;
  /** L0a: set when the variant's authorSource is 'persisted' — the package, its leaf stamps and the exact Reviewer prompt. */
  persistedAuthor: PersistedAuthor | null;
  /** L-R3: the arm's correction flag (null ⇒ the env decides). */
  requirementsFormCorrection: boolean | null;
  /** The harness row the in-run requirements check reads (the node's owner map placed in a copy); null for other roles. */
  requirementsHarnessRow: Record<string, any> | null;
  /** L-Z2: the commit whose in-run check data this arm runs (null ⇒ HEAD's). */
  checkAt: string | null;
  /** Recorded tools: the node's production calls (null ⇒ the stub). */
  stored: StoredCall[] | null;
  /** Stage B: the held-variant arm's binding (null on every other arm). */
  held: { store: LabHeldStore; snapV: Snapshot; protocolName: string; authorInputContext: Record<string, any>; owningLeg: OwningLegResolution; correctionEnabled: boolean } | null;
  /** Stage B G1: no Reviewer call on this arm. */
  authorOnly: boolean;
  /** Stage B G1 (L-8): an Architect cell. */
  architectOnly?: boolean;
  /** NB1: the constraints the arm's constraintsSeed bound (released vs candidate, per role) — text reach reads them. */
  constraintsBound?: { author: { released: Record<string, unknown> | null; candidate: Record<string, unknown> | null }; reviewer: { released: Record<string, unknown> | null; candidate: Record<string, unknown> | null } } | null;
  /** held-k8s 1k (L-K-a/b): the Harvester node's loaded (planted) file fixture. */
  fixture?: LoadedFixture | null;
  /** L-N1: the node's network fixture tiers (null ⇒ none). */
  network?: LoadedNetworkFixture | null;
  /** L-CS-N: the arm's bound `live-read` kind gate (null ⇒ the tree's constant). */
  kindGate?: ArmKindGate | null;
  /** O-2(a): the protocol injection production would stamp on this arm's executions (set for every job after prepare). */
  armProtocolInjection?: { delta: { name: string; version: string } } }

async function prepare(exp: Experiment, dir: string, nodes: NodeSpec[], variants: string[] | null, out: string, protocolOverride?: ProtocolText) {
  const jobs: Job[] = [];
  const nodeReports: Record<string, any> = {};
  for (const node of nodes) {
    if ((node.fileFixture || node.fixturePlants?.length) && !node.harvesterOnly) throw new Error(`${node.id}: fileFixture/fixturePlants serve a HARVESTER's reads — this node is not harvesterOnly`);
    if (node.fixturePlants?.length && !node.fileFixture) throw new Error(`${node.id}: fixturePlants without a fileFixture`);
    if (node.harvesterSourceByVariant && !node.architectOnly) throw new Error(`${node.id}: harvesterSourceByVariant feeds an ARCHITECT cell — this node is not architectOnly`);
    if (node.architectOnly) {
      const x = await prepareArchitect(exp, dir, node, variants, out);
      jobs.push(...x.jobs); nodeReports[node.id] = x.report;
      continue;
    }
    if (node.harvesterOnly) {
      const h = await prepareHarvester(exp, dir, node, variants, out);
      jobs.push(...h.jobs); nodeReports[node.id] = h.report;
      continue;
    }
    const { snap: snapE0, report: inputEditReport } = snapshotWithInputEdits(dir, node, loadSnapshot(node.authorExecutionId, { reviewerExecutionId: node.reviewerExecutionId ?? null }));
    // VALUE-LEG-GIT: the first-execution snapshot + the frozen value harvest (value-lane.ts), before every downstream build.
    const valueLane = await applyValueLane(dir, node, snapE0);
    const snap0 = valueLane.snap;
    const vlOpts = { legReads: isValueLaneNode(node) };
    // L-CS-N (owner 2026-11-05): a Git-only re-cast of the node's harvest (git-harvest-plant.ts) — on the copy, before every downstream build.
    const gitHarvest = node.harvestFromFixture ? await (await import('./git-harvest-plant')).withGitHarvest(snap0, dir, node.harvestFromFixture) : null;
    if (node.harvestFromFixture && node.harvestFromSample) throw new Error(`${node.id}: harvestFromFixture and harvestFromSample — one harvest, two sources`);
    // L-CS-N ADDENDUM (h): the sample must have read THIS node's arm text (every arm of such a node must read one text).
    let sampleHarvest: { snap: Snapshot; report: import('./git-harvest-plant').SampleHarvestReport } | null = null;
    if (node.harvestFromSample) {
      const shas = [...new Set(node.variants.map((v) => sha256(protocolFor(exp, dir, snap0, v).text)))];
      if (shas.length !== 1) throw new Error(`${node.id}: harvestFromSample needs every arm to read one protocol text (got ${shas.length})`);
      sampleHarvest = (await import('./git-harvest-plant')).withSampleHarvest(snap0, node.harvestFromSample, shas[0]);
    }
    const snap = gitHarvest ? gitHarvest.snap : sampleHarvest ? sampleHarvest.snap : snap0;
    if (!snap.reviewer) throw new Error(`${node.id}: no reviewer execution reviewed this author execution`);
    const nodeDir = path.join(out, node.id);
    fs.mkdirSync(nodeDir, { recursive: true });

    // ── CONTROL PASS, $0: the PERSISTED Author package through the shipping nets, the chain patch and the Reviewer
    //    rebuild; the PERSISTED Reviewer output through the shipping parser. Each step is compared with what ran.
    const ares = parsedResult(snap.author)!;
    const rres = parsedResult(snap.reviewer)!;
    const leaf = await runAuthorLeafNets(snap, ares.agentRole, ares.finalResponse, snap.author.exec.id);
    // L-R2 (2026-10-09): a net that does not APPLY to this role (markerPresence / rollbackContainment exclude ^requirements_)
    // and that production did not stamp either is a PASS, reported as n/a — not a mismatch and not a silent null===null.
    // E1 (2026-10-13 02:56:30Z, VERBATIM-QUOTE-OMISSION): every checked rollbackContainment stamp gains `witness`, and its
    // witness became the harvest's RAW tool results. A persisted stamp WITHOUT `witness` predates the cut: it is compared
    // with `witness` set aside, and a count that moved is a by-construction E1 move (BUILD-A-E.md §4), reported by name.
    const e1Strip = (k: string, f: any) => (k === 'rollbackContainment' && f && ares[k] && !('witness' in ares[k]) ? (({ witness, ...rest }: any) => rest)(f) : f);
    const factEq = (k: string) => JSON.stringify(e1Strip(k, leaf.stamped[k]) ?? null) === JSON.stringify(ares[k] ?? null);
    const leafNa = (k: string) => leaf.notApplicable.includes(k) && ares[k] == null && leaf.stamped[k] == null;
    const identityCtx = patchReviewerContext(snap, {
      executionId: snap.author.exec.id, finalResponse: ares.finalResponse, confidenceScore: ares.confidenceScore ?? null,
      qualityMetrics: ares.qualityMetrics ?? null, markerPresence: ares.markerPresence ?? null,
      rollbackContainment: ares.rollbackContainment ?? null, derivationContainment: ares.derivationContainment ?? null,
    });
    const rv = parseReviewerVerdict(rres.finalResponse);
    const persistedVerdict = rres.reviewerVerdict ?? null;
    const anyProtocol = protocolOverride ?? protocolFor(exp, dir, snap, node.variants[0]); // identity is protocol-independent
    const rFrozen = await rebuildPrompt(snap, 'reviewer', anyProtocol);
    const rPatched = await rebuildPrompt(snap, 'reviewer', anyProtocol, { inputContextOverride: identityCtx });
    // L0d control: the leg-synthesize reviewerWarnings net COMPUTES through replay-prisma (its fact, not its errorFact),
    // fed the persisted Author and the persisted Reviewer text with its verdict rebuilt by the SHIPPING builder.
    const ctlVerdict = shippingReviewerVerdict(rres.finalResponse, rres.agentRole ?? 'change_reviewer');
    const ctlLeg = await runLegSynthesizeNets(snap, [
      { taskId: snap.author.task.id, executionId: 'lab-control-a', resultJson: { finalResponse: ares.finalResponse } },
      { taskId: snap.reviewer.task.id, executionId: 'lab-control-r', resultJson: { finalResponse: rres.finalResponse, reviewerVerdict: ctlVerdict } },
    ]);
    const rwFact = (ctlLeg?.stamped.reviewerWarnings ?? null) as Record<string, any> | null;
    const rwNa = !!ctlLeg && ctlLeg.notApplicable.includes('reviewerWarnings') && !rwFact && (snap.leg?.metadata?.reviewerWarnings ?? null) == null;
    const rwOk = rwNa || (!!rwFact && !ctlLeg!.errors.reviewerWarnings && rwFact.reason !== 'enrichment-error' && rwFact.checked === true);
    // requirements_author: the in-run form check computes on the PERSISTED draft with the node's inputs (objective from
    // the harness row, owner map when the node names one) — the same stamp a live sample gets.
    const reqRow = isRequirementsFormCheckEligible(ares.agentRole, snap.author.task.type) ? harnessRowWithOwnerMap(snap, readOwnerMap(dir, node.ownerRowItemMap)) : null;
    let reqControl: Record<string, any> | null = null;
    if (reqRow) {
      const inputs = requirementsInputsFromHarnessRow(reqRow);
      const st: any = computeRequirementsFormCheckStamp({ text: ares.finalResponse, stopReason: 'end_turn', textSource: 'loop', inputs });
      const wantMap = node.ownerRowItemMap ? 'present' : 'absent';
      reqControl = { ok: st.checked === true && inputs.objectiveResolved && st.inputs.ownerRowItemMap === wantMap && st.clauses?.itemMapSource === (node.ownerRowItemMap ? 'owner-map' : 'draft-citations'),
        ownerRowItemMap: st.inputs.ownerRowItemMap, itemMapSource: st.clauses?.itemMapSource ?? null, objectiveChars: st.inputs.objectiveChars,
        persistedDraft: { view: st.size?.programViewDelivered ?? null, failing: st.checked ? failingTriggerChecks(st) : ['not-checked'] } };
    }
    if (rwFact) fs.writeFileSync(path.join(nodeDir, 'control.report-section.md'), appendReviewerWarningsSection('', rwFact).content);
    // L0b: the planted package (identity when the node has no plant).
    const plant = plantFor(dir, node, ares.finalResponse, undefined, true);
    if (plant.editId) fs.writeFileSync(path.join(nodeDir, 'planted.author.md'), plant.text);
    nodeReports[node.id] = {
      authorExecutionId: snap.author.exec.id, reviewerExecutionId: snap.reviewer.exec.id, kind: node.kind,
      persisted: { approved: persistedVerdict?.approved ?? null, blocking: persistedVerdict?.blocking ?? null, authorOutputTokens: snap.author.exec.outputTokens, reviewerOutputTokens: snap.reviewer.exec.outputTokens },
      controls: {
        leafNetsReproducePersisted: { markerPresence: factEq('markerPresence'), rollbackContainment: factEq('rollbackContainment'), errors: leaf.errors,
          rollbackContainmentPreE1: !!ares.rollbackContainment && !('witness' in ares.rollbackContainment),
          notApplicable: ['markerPresence', 'rollbackContainment'].filter(leafNa) },
        chainPatchIdentity: rFrozen.user === rPatched.user,
        shippingParserReproducesPersistedVerdict: !!rv && !!persistedVerdict && rv.approved === persistedVerdict.approved && JSON.stringify(rv.blocking) === JSON.stringify(persistedVerdict.blocking),
        legReviewerWarningsComputes: rwOk,
        legReviewerWarningsNotApplicable: rwNa,
        requirementsFormCheckComputes: reqControl,
      },
      legReviewerWarningsControl: { fact: rwFact ? { checked: rwFact.checked, reason: rwFact.reason, renderScope: rwFact.renderScope, count: rwFact.count, ids: rwFact.ids } : null, error: ctlLeg?.errors.reviewerWarnings ?? null, otherLegNetErrors: ctlLeg ? Object.keys(ctlLeg.errors).filter((k) => k !== 'reviewerWarnings') : null },
      plant: plant.editId ? { file: node.authorPlant, edit: plant.editId, deltaChars: plant.deltaChars, sha256: sha256(plant.text) } : null,
      inputEdits: inputEditReport ? { ...inputEditReport, sha256: sha256(fs.readFileSync(path.join(dir, inputEditReport.file), 'utf8')),
        approximation: 'the harness is not replayed: the edit writes into each child brief what the harness transcribes there' } : null,
      measuresOnPersisted: computeMeasures(ares.finalResponse, exp.measures),
      ...(gitHarvest ? { gitHarvest: gitHarvest.report } : {}), ...(sampleHarvest ? { sampleHarvest: sampleHarvest.report } : {}),
      ...(valueLane.report ? { valueLane: valueLane.report } : {}),
      variants: {},
    };
    fs.writeFileSync(path.join(nodeDir, 'persisted.author.md'), ares.finalResponse);
    fs.writeFileSync(path.join(nodeDir, 'persisted.reviewer.md'), rres.finalResponse);

    // ── per variant: the Author prompt (saved) and the Reviewer's system prompt under that text ──
    // `historical` (the text the node ORIGINALLY ran under) is available to every node on request: it is the
    // reproduction check — does the lab, under the original text, refuse at the rate production did?
    const wanted = protocolOverride ? ['custom']
      : [...node.variants, ...(variants?.includes('historical') ? ['historical'] : [])].filter((x) => !variants || variants.includes(x));
    for (const v of wanted) {
      if (exp.variants[v]?.constraintsSeed) throw new Error(`${node.id}/${v}: constraintsSeed is built for architectOnly cells only (bind it here before using it on a Reviewer node)`);
      bindKindGate(armKindGate(exp.variants[v], v)); // L-CS-N: every per-arm build step reads the arm's gate
      let protocol: ProtocolText;
      const heldArm = heldArmOf(exp, v);
      const heldSpec = heldArm?.spec ?? null;
      try { protocol = protocolOverride ?? (heldArm ? heldArmProtocol(exp, dir, snap, v, heldArm) : protocolFor(exp, dir, snap, v)); }
      catch (e) { if (v !== 'historical') throw e; nodeReports[node.id].variants[v] = { skipped: (e as Error).message }; console.log(`   · ${node.id} historical skipped — ${(e as Error).message}`); continue; }
      if (v === 'historical' && node.variants.includes('baseline') && sha256(protocol.text) === sha256(protocolFor(exp, dir, snap, 'baseline').text)) {
        nodeReports[node.id].variants[v] = { skipped: 'identical to baseline (the node ran under the pinned baseline text) — read its baseline row' };
        console.log(`   · ${node.id} historical skipped — identical to baseline`); continue;
      }
      const tplFor = (which: 'author' | 'reviewer') => {
        const files = exp.variants[v]?.templateEdits ?? [];
        const b = which === 'author' ? snap.author : snap.reviewer!;
        // L0c: a template pinned in the experiment (today's prod row) is the base in every variant, edited or not.
        const pinned = pinnedTemplate(exp, dir, b.template?.id);
        if (!files.length) return pinned;
        const role = parsedResult(b)?.agentRole ?? b.exec.config?.agentRole;
        const edits: EditSpec[] = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
        const r = applyEdits(pinned ?? templateTextAsRun(b), edits, `role:${role}`); // never an own-prompt task's directive
        return r.applied.length ? r.text : pinned;
      };
      const authorTemplate = tplFor('author');
      const reviewerTemplate = tplFor('reviewer');
      const armFlag = exp.variants[v]?.requirementsFormCorrection;
      if (typeof armFlag === 'boolean' && exp.flags?.[REQUIREMENTS_FORM_CORRECTION_FLAG] !== undefined) {
        throw new Error(`variant ${v} sets requirementsFormCorrection while experiment.flags sets ${REQUIREMENTS_FORM_CORRECTION_FLAG} — one lever, two sources; remove the flag`);
      }
      const checkAt = exp.variants[v]?.requirementsCheckAt ?? null;
      const authorModel = exp.variants[v]?.authorModel ?? null;
      const reviewerModel = exp.variants[v]?.reviewerModel ?? null;
      const authorEffort = exp.variants[v]?.authorEffort ?? null;
      const reviewerEffort = exp.variants[v]?.reviewerEffort ?? null;
      // Stage B (L-1 / L-2 / L-3): a held-variant arm runs on a REBOUND snapshot copy, its Author's Harvester entry carrying
      // the held view built from the frozen Harvester's stored tool calls. Every other arm: the snapshot as cached.
      let held: Job['held'] = null;
      let heldReport: Record<string, any> | null = null;
      let heldItems: Array<Record<string, any>> = [];
      if (heldSpec) {
        const store = buildLabHeldStore(snap);
        const heldFields = await labHeldViewFields(store);
        const bound0 = heldArmBinding(snap, heldArm!);
        // L-N2-c: a network leg whose stored Harvester predates gitDeviceComparison gets the stamp computed by the shipping function,
        // so the Author's transcription and the Reviewer's §6 see what production now sends (no-op off a Device-sources leg).
        const cmp = withComputedHarvesterComparison(bound0.snap);
        // L-CS-a: the Harvester's liveEvidence computed by the SHIPPING pure function (no-op off a Device-sources leg; `not-built`
        // and unchanged while lib/agents/harness/live-evidence.ts is absent — see live-evidence-patch.ts). Under the arm's kind gate.
        const le = withComputedLiveEvidence(cmp.snap, undefined, { protocol: armComposedProtocol(exp, v, protocol) });
        if (exp.requireLiveEvidence && le.report.state === 'not-built') throw new Error(`${node.id}/${v}: requireLiveEvidence — lib/agents/harness/live-evidence.ts is not in this tree (slot S-2: run on the merged push-1a tree)`);
        const bound = { ...bound0, snap: le.snap };
        // L-CS-a: the Author chains the Harvester entry, and config_change_author ∈ LIVE_EVIDENCE_READERS — the computed stamp rides it.
        const authorInputContext = patchAuthorContext(snap, le.fact ? { ...heldFields, liveEvidence: le.fact } : heldFields);
        const armFlag2 = heldSpec.heldEditCorrection;
        if (typeof armFlag2 === 'boolean' && exp.flags?.[HELD_EDIT_CORRECTION_FLAG] !== undefined) throw new Error(`variant ${v} sets heldEditCorrection while experiment.flags sets ${HELD_EDIT_CORRECTION_FLAG} — one lever, two sources`);
        held = { store, snapV: bound.snap, protocolName: bound.protocolName, authorInputContext,
          owningLeg: { kind: 'leg', legId: String(bound.snap.leg!.id), heldCapable: true, ownStageId: String(bound.snap.author.task.stage_id) },
          correctionEnabled: typeof armFlag2 === 'boolean' ? armFlag2 : isHeldEditCorrectionEnabled() };
        const items = (heldFields.heldView as Array<Record<string, any>>) ?? [];
        heldItems = items;
        heldReport = { binding: bound.report as VariantBindingReport, harvesterExecutionId: store.harvesterExecutionId, refs: store.refs.length, refusals: store.refusals.map((r) => r.refusal),
          handles: items.map((i) => ({ handle: i.handle, path: i.path, lines: i.lineCount ?? null, state: i.state ?? 'rendered', viewChars: typeof i.viewText === 'string' ? i.viewText.length : null, rewrittenLines: i.rewrittenLines?.length ?? 0 })),
          correction: typeof armFlag2 === 'boolean' ? `arm:${armFlag2 ? 'on' : 'off'}` : `env:${held.correctionEnabled ? 'on' : 'off'}`, gitDeviceComparison: cmp.report, liveEvidence: le.report };
        fs.mkdirSync(path.join(nodeDir, v), { recursive: true });
        // By HANDLE (the scorer reads them by handle): the held base (B) and the view the Author is shown (V).
        for (const it of items) {
          const ref = store.refs.find((r) => r.id === it.refId);
          if (ref) fs.writeFileSync(path.join(nodeDir, v, `held-base-${it.handle}.txt`), ref.content);
          if (typeof it.viewText === 'string') fs.writeFileSync(path.join(nodeDir, v, `held-view-${it.handle}.txt`), it.viewText);
        }
      }
      const asnap = held ? held.snapV : snap;
      const author = withModel(await rebuildPrompt(asnap, 'author', protocol, { templatePromptOverride: authorTemplate, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective,
        ...(held ? { inputContextOverride: held.authorInputContext } : {}) }), authorModel, authorEffort);
      const reviewerBase = withModel(await rebuildPrompt(asnap, 'reviewer', protocol, { templatePromptOverride: reviewerTemplate, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective }), reviewerModel, reviewerEffort);
      const vd = path.join(nodeDir, v);
      fs.mkdirSync(vd, { recursive: true });
      fs.writeFileSync(path.join(vd, 'author.system.md'), author.system);
      fs.writeFileSync(path.join(vd, 'author.user.md'), author.user);
      fs.writeFileSync(path.join(vd, 'reviewer.system.md'), reviewerBase.system);
      fs.writeFileSync(path.join(vd, 'protocol.md'), protocol.text);
      const fid = fidelityChecks(snap, 'author', author);
      nodeReports[node.id].variants[v] = {
        protocol: { name: protocol.name, version: protocol.version, source: protocol.source, sha256: sha256(protocol.text) },
        models: { author: author.model, reviewer: reviewerBase.model, authorEffort: effortOf(author), reviewerEffort: effortOf(reviewerBase), authorOverridden: !!(authorModel || authorEffort), reviewerOverridden: !!(reviewerModel || reviewerEffort) },
        authorPromptSha: author.hashes, reviewerSystemSha: reviewerBase.hashes.system,
        authorPreambleChars: author.fact.preambleChars, persistedPreambleChars: ares.protocolInjection?.preambleChars ?? null,
        fidelityFailures: fid.filter((c) => c.ok === false && c.name !== 'protocolInjection.preambleChars' && c.name !== 'protocolInjection.delta').map((c) => `${c.name}: ${c.detail}`),
        notes: author.notes,
        ...(heldReport ? { held: heldReport } : {}),
        authorOnly: !!exp.variants[v]?.authorOnly,
        ...(reqRow ? { requirementsFormCorrection: typeof armFlag === 'boolean' ? `arm:${armFlag ? 'on' : 'off'}` : `env:${process.env[REQUIREMENTS_FORM_CORRECTION_FLAG] === 'true' ? 'on' : 'off'}`,
          ownerRowItemMap: node.ownerRowItemMap ? { file: node.ownerRowItemMap, sha256: sha256(fs.readFileSync(path.join(dir, node.ownerRowItemMap), 'utf8')) } : null,
          requirementsCheck: checkDataLabel(checkAt) } : {}),
      };
      if (authorTemplate) fs.writeFileSync(path.join(vd, 'author.template.md'), authorTemplate);
      if (reviewerTemplate) fs.writeFileSync(path.join(vd, 'reviewer.template.md'), reviewerTemplate);
      nodeReports[node.id].variants[v].templateOverride = { author: authorTemplate ? sha256(authorTemplate) : null, reviewer: reviewerTemplate ? sha256(reviewerTemplate) : null };
      // L0a: a persisted Author is deterministic, so the Reviewer's EXACT prompt (package, leaf stamps, chain) is built
      // here at $0 and saved — the dry run shows the very bytes a --spend run sends.
      let persistedAuthor: PersistedAuthor | null = null;
      const authorSrc = node.authorSourceByVariant?.[v] ?? exp.variants[v]?.authorSource ?? 'live';
      if (authorSrc.startsWith(LAB_SAMPLE_PREFIX)) {
        // L-9 (Stage B G2): a G1 lab sample is the fixed Author; plants re-stamp PURELY; the Reviewer's diff is the shipping builder's.
        if (!held) throw new Error(`${node.id}/${v}: a lab-sample Author needs a held-variant arm (L-9 re-stamps over the arm's held files)`);
        const r9v = r9VersionInEffect();
        const loaded = loadLabSample(authorSrc, { authorExecutionId: snap.author.exec.id, protocolSha256: sha256(protocol.text), authorPrompt: { system: author.system, user: author.user } });
        const named = heldItems.filter((it) => it.state);
        if (named.length) throw new Error(`${node.id}/${v}: L-9 needs every held file rendered; ${named.map((it) => `${it.handle} ${it.state}`).join(', ')}`);
        const resolved = await labResolveHeldFiles(held.store, r9v)(heldItems as any, { authorTaskId: String(snap.author.task.id), authorStageId: (snap.author.task.stage_id as string) ?? null,
          scope: (snap.author.task.pov_id as string) ?? null, legTaskId: held.owningLeg.kind === 'leg' ? held.owningLeg.legId : null });
        const own = pureStamp(loaded.text, resolved.files, resolved.refs, r9v);
        const repro = sampleReproduces(loaded, own);
        if (!repro.ok) throw new Error(`L-9: ${authorSrc} does not reproduce its own stamp on this node's held files (${repro.detail})`);
        const sp = plantFor(dir, node, loaded.text, authorSrc, true);
        const stamp = sp.editId ? pureStamp(sp.text, resolved.files, resolved.refs, r9v) : own;
        const chainExecutionId = `lab-${node.id}-${v}-a`;
        const rFiles = reviewerSideFiles(dir, node, resolved.files);
        const editDiff = editDiffEntryFields({ authorExecutionId: chainExecutionId, stamped: stamp.fact, files: rFiles, r9Version: r9v, finalResponse: sp.text });
        // As the core hands it (EF-P2-3): the BASE-held handles = the verified refs' handles (one BASE row per ref).
        const leafS = await runAuthorLeafNets(held.snapV, ares.agentRole, sp.text, chainExecutionId, undefined, { editApplication: stamp.fact, baseHeldHandles: resolved.refs.map((r) => r.handle) }, armProtocolInjection(exp, v, protocol));
        const sa = loaded.sample.author ?? {};
        const authorResult: Record<string, any> = {
          finalResponse: sp.text, confidenceScore: sa.confidence ?? null,
          qualityMetrics: { totalTurns: sa.turns ?? 0, hitMaxTurns: false, responseLength: sp.text.length, toolCallSuccess: { total: (sa.toolCalls ?? []).length, failed: 0, succeeded: (sa.toolCalls ?? []).length } },
          markerPresence: leafS.stamped.markerPresence ?? null, rollbackContainment: leafS.stamped.rollbackContainment ?? null, derivationContainment: null,
          toolLoop: { formCheck: sa.formCheck ?? null }, editApplication: stamp.fact,
          validationToolCalls: leafS.stamped.validationToolCalls, gitDeviceComparison: leafS.stamped.gitDeviceComparison, liveEvidence: leafS.stamped.liveEvidence,
        };
        const ctx = patchReviewerContext(held.snapV, { executionId: chainExecutionId, ...authorResult, editDiff } as any);
        const reviewer = withModel(await rebuildPrompt(held.snapV, 'reviewer', protocol, { inputContextOverride: ctx, templatePromptOverride: reviewerTemplate, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective }), reviewerModel, reviewerEffort);
        fs.writeFileSync(path.join(vd, 'reviewer.user.md'), reviewer.user);
        fs.writeFileSync(path.join(vd, 'lab-sample.author.md'), sp.text);
        fs.writeFileSync(path.join(vd, 'editApplication.json'), JSON.stringify({ fact: stamp.fact, refusals: stamp.app.refusals }, null, 2));
        fs.writeFileSync(path.join(vd, 'editDiff.json'), JSON.stringify(editDiff, null, 2));
        const diffText = typeof editDiff.diffText === 'string' ? editDiff.diffText : null;
        const mustShow = (node.diffMustShow ?? []).map((line) => ({ line, inDiff: !!diffText && diffText.split('\n').includes(line) }));
        persistedAuthor = { text: sp.text, plantId: sp.editId, chainExecutionId, leafStamped: leafS.stamped, reviewer, authorResult, source: authorSrc };
        // $0 lever check: the same package (same facts) under the BASE binding and the base text, with no diff entry. The user
        // prompt delta must be exactly the rendered diff block (+ the binding's own title token); the system delta, protocol text.
        const { editApplication: _ea, ...cfResult } = authorResult;
        const cfCtx = patchReviewerContext(snap, { executionId: chainExecutionId, ...cfResult } as any);
        const cf = await rebuildPrompt(snap, 'reviewer', protocolFor(exp, dir, snap, 'baseline'), { inputContextOverride: cfCtx, templatePromptOverride: reviewerTemplate, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective });
        const leverDelta = lineDelta(cf.user, reviewer.user);
        // LAB-PLANT-PRESENCE-CHECK: the same build with the UNPLANTED sample (its own stamp) — the twin.
        let presence: ReturnType<typeof plantPresence> | null = null;
        if (sp.editId) {
          const twinDiff = editDiffEntryFields({ authorExecutionId: chainExecutionId, stamped: own.fact, files: rFiles, r9Version: r9v, finalResponse: loaded.text });
          const twinLeaf = await runAuthorLeafNets(held.snapV, ares.agentRole, loaded.text, chainExecutionId, undefined, { editApplication: own.fact, baseHeldHandles: resolved.refs.map((r) => r.handle) }, armProtocolInjection(exp, v, protocol));
          const twinCtx = patchReviewerContext(held.snapV, { executionId: chainExecutionId, ...authorResult, finalResponse: loaded.text, markerPresence: twinLeaf.stamped.markerPresence ?? null, rollbackContainment: twinLeaf.stamped.rollbackContainment ?? null, editApplication: own.fact, editDiff: twinDiff } as any);
          const twin = await rebuildPrompt(held.snapV, 'reviewer', protocol, { inputContextOverride: twinCtx, templatePromptOverride: reviewerTemplate, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective });
          presence = plantPresence(JSON.parse(fs.readFileSync(path.join(dir, node.authorPlant!), 'utf8')), twin.user, reviewer.user, authorSrc);
          if (!presence.ok) throw new Error(`${node.id}/${v}: LAB-PLANT-PRESENCE-CHECK — plant ${node.authorPlant} does not reach the Reviewer prompt: ${presence.failures.join(' | ')}`);
        }
        // G3 entry (decision 1, e574210d7): the variant Reviewer TEMPLATE may carry constraints the base row does not; they
        // render in the user prompt too (build-agent-prompt-body `• **k:** v`). Those lines are the template lever, reported
        // by name — derived from the two bound rows, never a free allow-list — and every other added line stays a finding.
        const baseC = (snap.reviewer?.template?.constraints ?? {}) as Record<string, unknown>;
        const varC = (held.snapV.reviewer?.template?.constraints ?? {}) as Record<string, unknown>;
        const constraintLines = Object.entries(varC).filter(([k, val]) => baseC[k] !== val).map(([k, val]) => `• **${k}:** ${val}`);
        const notHeld = leverDelta.added.filter((l) => !(diffText ?? '').split('\n').includes(l) && !/^### Held-file edits/.test(l) && !isHeldRenderFactLine(l) && !/^Rollback by reference: /.test(l) && !/^Refused by the platform \(not applied\): /.test(l) && l !== '');
        nodeReports[node.id].variants[v].authorSource = {
          leverDelta: { removed: leverDelta.removed, added: leverDelta.added.length,
            addedTemplateConstraint: notHeld.filter((l) => constraintLines.includes(l)),
            addedOutsideHeldBlock: notHeld.filter((l) => !constraintLines.includes(l)) },
          source: authorSrc, sampleSha256: loaded.textSha256, reproducesOwnStamp: repro, plant: sp.editId ? { edit: sp.editId, deltaChars: sp.deltaChars, sha256: sha256(sp.text), presence: { ok: presence!.ok, outsidePlantLines: presence!.outsidePlant.length, outsidePlant: presence!.outsidePlant.slice(0, 40) } } : null,
          stamp: { state: stamp.fact.state, applied: stamp.fact.applied, total: stamp.fact.total, refusedTotal: stamp.fact.refusedTotal, candidateDigest8: stamp.fact.candidateDigest8, correction: stamp.fact.correction },
          reviewerBaseEdit: node.reviewerBaseEdit ?? null,
          editDiff: { state: (editDiff.state as string) ?? 'rendered', mode: editDiff.mode ?? null, diffChars: diffText?.length ?? null, inReviewerPrompt: !!diffText && reviewer.user.includes(diffText) },
          diffMustShow: mustShow,
          namedStateHeadersInPrompt: (reviewer.user.match(/### Held-file edits — no diff rendered \(/g) ?? []).length,
          renderedDiffHeadersInPrompt: (reviewer.user.match(/### Held-file edits, as the platform applied them/g) ?? []).length,
          noEditAppliedHeadersInPrompt: (reviewer.user.match(/### Held-file edits — no held-file edit was applied \(/g) ?? []).length,
          noHeldEditHeadersInPrompt: reviewer.user.split(NO_HELD_EDIT_HEADING).length - 1, // Phase 10 W5
          leafFacts: summarizeFacts(leafS.stamped), leafNetErrors: leafS.errors, reviewerPromptSha: reviewer.hashes,
        };
      } else if (authorSrc === 'persisted' && node.restampPersisted) {
        // L-CS-N (owner 2026-11-05, R-FWA3-GIT-*): the persisted package (planted consistently) re-stamped PURELY over THIS arm's held files
        // (the L-9 applier, no correction turn), its editDiff built by the shipping builder, its leaf nets on the bound snapshot with the
        // arm's protocol injection — what the Reviewer would see had the edit step run on these files.
        if (!held) throw new Error(`${node.id}/${v}: restampPersisted needs a held arm`);
        const r9v = r9VersionInEffect();
        const named = heldItems.filter((it) => it.state);
        if (named.length) throw new Error(`${node.id}/${v}: restampPersisted needs every held file rendered; ${named.map((it) => `${it.handle} ${it.state}`).join(', ')}`);
        const resolved = await labResolveHeldFiles(held.store, r9v)(heldItems as any, { authorTaskId: String(snap.author.task.id), authorStageId: (snap.author.task.stage_id as string) ?? null,
          scope: (snap.author.task.pov_id as string) ?? null, legTaskId: held.owningLeg.kind === 'leg' ? held.owningLeg.legId : null });
        const stamp = pureStamp(plant.text, resolved.files, resolved.refs, r9v);
        const chainExecutionId = `lab-${node.id}-${v}-a`;
        const editDiff = editDiffEntryFields({ authorExecutionId: chainExecutionId, stamped: stamp.fact, files: resolved.files, r9Version: r9v, finalResponse: plant.text });
        const leafS = await runAuthorLeafNets(held.snapV, ares.agentRole, plant.text, chainExecutionId, undefined, { editApplication: stamp.fact, baseHeldHandles: resolved.refs.map((r) => r.handle) }, armProtocolInjection(exp, v, protocol));
        const authorResult: Record<string, any> = { ...persistedAuthorResult(snap, plant.text, leafS.stamped), editApplication: stamp.fact };
        const ctx = patchReviewerContext(held.snapV, { executionId: chainExecutionId, ...authorResult, editDiff } as any);
        const reviewer = withModel(await rebuildPrompt(held.snapV, 'reviewer', protocol, { inputContextOverride: ctx, templatePromptOverride: reviewerTemplate, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective }), reviewerModel, reviewerEffort);
        fs.writeFileSync(path.join(vd, 'reviewer.user.md'), reviewer.user);
        fs.writeFileSync(path.join(vd, 'restamped.author.md'), plant.text);
        fs.writeFileSync(path.join(vd, 'editApplication.json'), JSON.stringify({ fact: stamp.fact, refusals: stamp.app.refusals }, null, 2));
        fs.writeFileSync(path.join(vd, 'editDiff.json'), JSON.stringify(editDiff, null, 2));
        const diffText = typeof editDiff.diffText === 'string' ? editDiff.diffText : null;
        const mustShow = (node.diffMustShow ?? []).map((line) => ({ line, inDiff: !!diffText && diffText.split('\n').includes(line) }));
        const missing = mustShow.filter((m) => !m.inDiff);
        if (missing.length) throw new Error(`${node.id}/${v}: diffMustShow — ${missing.map((m) => m.line).join(' | ')} not in the rendered diff`);
        persistedAuthor = { text: plant.text, plantId: plant.editId, chainExecutionId, leafStamped: leafS.stamped, reviewer, authorResult, source: 'persisted-restamp' };
        nodeReports[node.id].variants[v].authorSource = { source: 'persisted-restamp', plant: plant.editId,
          stamp: { state: stamp.fact.state, applied: stamp.fact.applied, total: stamp.fact.total, refusedTotal: stamp.fact.refusedTotal, candidateDigest8: stamp.fact.candidateDigest8 },
          editDiff: { state: (editDiff.state as string) ?? 'rendered', diffChars: diffText?.length ?? null, inReviewerPrompt: !!diffText && reviewer.user.includes(diffText) }, diffMustShow: mustShow,
          leafFacts: summarizeFacts(leafS.stamped), leafNetErrors: leafS.errors, reviewerPromptSha: reviewer.hashes };
      } else if (authorSrc === 'persisted') {
        const chainExecutionId = plant.editId ? `lab-${node.id}-plant-a` : snap.author.exec.id;
        // L-CS-N (R-FWA3): a PERSISTED held Author whose production edit step stamped `editApplication` — on an arm that opts in
        // (`persistedEditApplication`), the leaf nets read that stamp and the held handles, as the core hands them at persist, so a
        // held-aware net (rollbackContainment `restore-is-held-base`) reproduces what the Reviewer saw. Off by default: every earlier
        // experiment's bytes stand.
        const peaOpt = !!exp.variants[v]?.persistedEditApplication && !!held && !plant.editId && ares.editApplication && typeof ares.editApplication === 'object';
        if (exp.variants[v]?.persistedEditApplication && !peaOpt) throw new Error(`${node.id}/${v}: persistedEditApplication needs a held arm, an unplanted persisted Author and a stored editApplication`);
        // L-CS-a (golden companion, 2026-11-05): where the arm's Harvester carries the COMPUTED liveEvidence (only on a released-version
        // arm — every earlier experiment reads `not-built`/`not-stamped-version`, so its bytes stand), the persisted Author's leaf nets read
        // the bound snapshot that carries it, or the Author transcription reads `harvester-not-stamped` (found on the golden dry run).
        const leSnap = heldReport?.liveEvidence?.state === 'computed' ? held!.snapV : snap;
        const leafP = peaOpt
          ? await runAuthorLeafNets(held!.snapV, ares.agentRole, plant.text, chainExecutionId, undefined, { editApplication: ares.editApplication, baseHeldHandles: heldItems.map((it) => String(it.handle)) }, armProtocolInjection(exp, v, protocol))
          : await runAuthorLeafNets(leSnap, ares.agentRole, plant.text, chainExecutionId, undefined, undefined, armProtocolInjection(exp, v, protocol), vlOpts);
        const ctx = patchReviewerContext(snap, { executionId: chainExecutionId, ...persistedAuthorResult(snap, plant.text, leafP.stamped) } as any);
        const reviewer = withModel(await rebuildPrompt(snap, 'reviewer', protocol, { inputContextOverride: ctx, templatePromptOverride: reviewerTemplate, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective }), reviewerModel, reviewerEffort);
        fs.writeFileSync(path.join(vd, 'reviewer.user.md'), reviewer.user);
        persistedAuthor = { text: plant.text, plantId: plant.editId, chainExecutionId, leafStamped: leafP.stamped, reviewer };
        // LAB-PLANT-PRESENCE-CHECK: the unplanted twin is the persisted package under the persisted execution id.
        let presence: ReturnType<typeof plantPresence> | null = null;
        if (plant.editId) {
          const twinLeaf = await runAuthorLeafNets(leSnap, ares.agentRole, ares.finalResponse, snap.author.exec.id, undefined, undefined, armProtocolInjection(exp, v, protocol), vlOpts);
          const twinCtx = patchReviewerContext(snap, { executionId: snap.author.exec.id, ...persistedAuthorResult(snap, ares.finalResponse, twinLeaf.stamped) } as any);
          const twin = await rebuildPrompt(snap, 'reviewer', protocol, { inputContextOverride: twinCtx, templatePromptOverride: reviewerTemplate, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective });
          presence = plantPresence(JSON.parse(fs.readFileSync(path.join(dir, node.authorPlant!), 'utf8')), twin.user, reviewer.user, `author:${node.authorExecutionId}`);
          if (!presence.ok) throw new Error(`${node.id}/${v}: LAB-PLANT-PRESENCE-CHECK — plant ${node.authorPlant} does not reach the Reviewer prompt: ${presence.failures.join(' | ')}`);
        }
        nodeReports[node.id].variants[v].authorSource = { source: 'persisted', plant: plant.editId, plantPresence: presence ? { ok: presence.ok, outsidePlantLines: presence.outsidePlant.length, outsidePlant: presence.outsidePlant.slice(0, 40) } : null, leafFacts: summarizeFacts(leafP.stamped), leafNetErrors: leafP.errors, reviewerPromptSha: reviewer.hashes };
      }
      jobs.push({ node, variant: v, protocol, snap, author, reviewerBase, reviewerTemplate, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective, reviewerModel, reviewerEffort, persistedAuthor,
        requirementsFormCorrection: typeof armFlag === 'boolean' ? armFlag : null, requirementsHarnessRow: reqRow, checkAt,
        stored: node.tools === 'recorded' ? storedCallsOf(snap.author) : null, held, authorOnly: !!exp.variants[v]?.authorOnly });
    }
  }
  return { jobs, nodeReports };
}

/**
 * A HARVESTER node (2026-10-13): no Reviewer, no chain. CONTROL PASS, $0: the persisted harvest through the SHIPPING
 * leaf nets with its persisted tool calls — `quoteFidelity` (harvest point) must compute (checked, no enrichment error)
 * and the lab's quote score must read the persisted harvest. The record a recorded-tools sample is served from is
 * summarised (calls, file calls, any persist-truncated result, which cannot be served).
 */
/** The Harvester prompt one arm builds for a (possibly input-edited) Harvester snapshot — shared by prepareHarvester and L-K-c,
 *  which must rebuild the SAME bytes to prove a lab sample is the H node's. */
async function harvesterArmPrompt(exp: Experiment, dir: string, snap: Snapshot, v: string): Promise<{ protocol: ProtocolText; author: RebuiltPrompt }> {
  const protocol = protocolFor(exp, dir, snap, v);
  // L-N1 (2026-10-24): a variant's templateEdits (role guidance) apply to a Harvester's pinned template too, exactly once, as on an
  // Author/Reviewer node (tplFor). A Harvester node whose template the experiment does not pin cannot take them (refused).
  let tpl = pinnedTemplate(exp, dir, snap.author.template?.id);
  const tEdits = exp.variants[v]?.templateEdits ?? [];
  if (tEdits.length) {
    if (!tpl) throw new Error(`${snap.author.exec.id}/${v}: templateEdits on a Harvester whose template (${snap.author.template?.id}) the experiment does not pin`);
    const role = parsedResult(snap.author)?.agentRole ?? 'infra_state_harvester';
    const r = applyEdits(tpl, tEdits.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as EditSpec), `role:${role}`);
    if (r.applied.length) tpl = r.text;
  }
  const author = withModel(await rebuildPrompt(snap, 'author', protocol, { templatePromptOverride: tpl, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective }),
    exp.variants[v]?.authorModel ?? null, exp.variants[v]?.authorEffort ?? null);
  return { protocol, author };
}

/** held-k8s 1k: a Harvester node's snapshot (with its brief input edit, L-K1) and its loaded, planted file fixture (L-K-a/b). */
function harvesterNodeInputs(dir: string, node: NodeSpec): { snap: Snapshot; inputEditReport: ReturnType<typeof snapshotWithInputEdits>['report']; fixture: LoadedFixture | null; network: LoadedNetworkFixture | null } {
  const { snap: snapE, report: inputEditReport } = snapshotWithInputEdits(dir, node, loadSnapshot(node.authorExecutionId));
  if (node.valueHarvest) throw new Error(`${node.id}: valueHarvest replaces a Harvester's output — a harvesterOnly node IS the Harvester`);
  // VALUE-LEG-GIT L-VLG-a: the first-execution snapshot over the input-edited leg (sync; shipping resolver + writer).
  let snap = snapE;
  if (node.deviceSourcesSnapshot) {
    const r = require('./value-lane').withFirstExecutionSnapshot(snapE) as { snap: Snapshot; report: { state: string } };
    if (r.report.state === 'already-snapshotted' || r.report.state === 'no-leg' || r.report.state === 'not-device-source-protocol') throw new Error(`${node.id}: deviceSourcesSnapshot — ${r.report.state}`);
    snap = r.snap;
  }
  const bad = Object.keys(inputEditReport?.targets ?? {}).filter((t) => t === 'reviewer-task:description');
  if (bad.length) throw new Error(`${node.id}: a harvesterOnly node has no Reviewer — input edit target ${bad.join(', ')} refused`);
  const fixture = node.fileFixture ? loadFileFixture(path.resolve(dir, node.fileFixture), (node.fixturePlants ?? []).map((f) => path.resolve(dir, f))) : null;
  const network = node.networkFixture ? loadNetworkFixture(dir, node.networkFixture) : null;
  return { snap, inputEditReport, fixture, network };
}

async function prepareHarvester(exp: Experiment, dir: string, node: NodeSpec, variants: string[] | null, out: string): Promise<{ jobs: Job[]; report: Record<string, any> }> {
  if (node.authorPlant || node.reviewerExecutionId || node.ownerRowItemMap) throw new Error(`${node.id}: a harvesterOnly node takes no plant, reviewer or owner map`);
  const { snap, inputEditReport, fixture, network } = harvesterNodeInputs(dir, node);
  const readiness = fixture ? await fixtureCaptureReadiness(fixture) : null;
  if (readiness?.failures.length) throw new Error(`${node.id}: fixture ${node.fileFixture} — the shipping capture does not hold ${readiness.failures.length} file(s) as served: ${readiness.failures.join(' | ')}`);
  const briefOps = node.inputEdits ? (JSON.parse(fs.readFileSync(path.join(dir, node.inputEdits), 'utf8')) as EditSpec).ops
    .filter((o) => (!o.appliesTo || o.appliesTo.includes('author-task:description')) && inputEditReport?.targets['author-task:description']) : [];
  const ares = parsedResult(snap.author)!;
  if (!/harvester$/.test(ares.agentRole ?? '')) throw new Error(`${node.id}: harvesterOnly, but ${node.authorExecutionId} ran as ${ares.agentRole}`);
  const nodeDir = path.join(out, node.id);
  fs.mkdirSync(nodeDir, { recursive: true });
  const stored = storedCallsOf(snap.author);
  const leaf = await runAuthorLeafNets(snap, ares.agentRole, ares.finalResponse, snap.author.exec.id, ares.toolCalls ?? [], undefined, undefined, { legReads: isValueLaneNode(node) });
  const qf = (leaf.stamped.quoteFidelity ?? null) as Record<string, any> | null;
  const score = scoreHarvesterQuotes(ares.finalResponse, ares.toolCalls ?? []);
  fs.writeFileSync(path.join(nodeDir, 'persisted.harvester.md'), ares.finalResponse);
  const report: Record<string, any> = {
    authorExecutionId: snap.author.exec.id, reviewerExecutionId: null, kind: node.kind, harvesterOnly: true, tools: node.tools ?? 'stub',
    persisted: { approved: null, blocking: null, authorOutputTokens: snap.author.exec.outputTokens, reviewerOutputTokens: null, chars: ares.finalResponse.length, stopReason: ares.toolLoop?.finalStopReason ?? null },
    controls: {
      leafNetsReproducePersisted: { markerPresence: JSON.stringify(leaf.stamped.markerPresence ?? null) === JSON.stringify(ares.markerPresence ?? null), rollbackContainment: true, errors: leaf.errors, notApplicable: leaf.notApplicable },
      quoteFidelityComputes: !!qf && qf.checked === true && !leaf.errors.quoteFidelity,
      // No Reviewer and no chain on a harvester node: those controls do not exist here (null, never a borrowed ✓).
      chainPatchIdentity: null, shippingParserReproducesPersistedVerdict: null, legReviewerWarningsComputes: null, legReviewerWarningsNotApplicable: null, requirementsFormCheckComputes: null,
    },
    persistedQuoteFidelity: qf ? { reason: qf.reason, disposition: qf.quoteFidelityDisposition?.disposition, blocks: qf.blocks, lanes: qf.lanes, claims: qf.claims } : null,
    persistedQuoteScore: { ...score, blocks: score.blocks.filter((b) => b.tool) },
    record: { calls: stored.length, fileCalls: stored.filter((c) => isFileCall(c.tool, c.args)).length, truncatedAtPersist: stored.filter((c) => c.truncatedAtPersist).length, failed: stored.filter((c) => !c.success).length },
    measuresOnPersisted: computeMeasures(ares.finalResponse, exp.measures),
    ...(inputEditReport ? { inputEdits: inputEditReport } : {}),
    ...(fixture ? { fixture: { dir: node.fileFixture, owner: fixture.spec.owner, repo: fixture.spec.repo, commit: fixture.spec.commit, source: fixture.spec.source ?? null,
      files: [...fixture.files.keys()], digest: fixture.digest, plants: fixture.plants, verbatimListings: Object.keys(fixture.spec.listings ?? {}),
      captureReadiness: { held: readiness!.held, of: readiness!.files, persistTruncated: readiness!.persistTruncated } } } : {}),
    variants: {},
  };
  const jobs: Job[] = [];
  for (const v of node.variants.filter((x) => !variants || variants.includes(x))) {
    bindKindGate(armKindGate(exp.variants[v], v)); // L-CS-N
    if (exp.variants[v]?.authorSource === 'persisted' || exp.variants[v]?.reviewerModel) throw new Error(`${node.id}/${v}: a harvester node takes protocol/template edits and an authorModel/authorEffort only`);
    const { protocol, author } = await harvesterArmPrompt(exp, dir, snap, v);
    // L-K1: the brief the harness would write must reach the rendered prompt verbatim, or the input edit measures nothing.
    const unseen = briefOps.filter((o) => !author.user.includes(o.new));
    if (unseen.length) throw new Error(`${node.id}/${v}: input edit ${node.inputEdits} does not reach the rendered Harvester prompt verbatim (${unseen.length} op(s)): ${unseen[0].new.slice(0, 80)}…`);
    const vd = path.join(nodeDir, v);
    fs.mkdirSync(vd, { recursive: true });
    fs.writeFileSync(path.join(vd, 'author.system.md'), author.system);
    fs.writeFileSync(path.join(vd, 'author.user.md'), author.user);
    fs.writeFileSync(path.join(vd, 'protocol.md'), protocol.text);
    const fid = fidelityChecks(snap, 'author', author);
    report.variants[v] = {
      protocol: { name: protocol.name, version: protocol.version, source: protocol.source, sha256: sha256(protocol.text) },
      models: { author: author.model, reviewer: null, authorEffort: effortOf(author), reviewerEffort: null, authorOverridden: !!(exp.variants[v]?.authorModel || exp.variants[v]?.authorEffort), reviewerOverridden: false },
      authorPromptSha: author.hashes, reviewerSystemSha: null,
      authorPreambleChars: author.fact.preambleChars, persistedPreambleChars: ares.protocolInjection?.preambleChars ?? null,
      fidelityFailures: fid.filter((c) => c.ok === false && c.name !== 'protocolInjection.preambleChars' && c.name !== 'protocolInjection.delta').map((c) => `${c.name}: ${c.detail}`),
      notes: author.notes,
    };
    jobs.push({ node, variant: v, protocol, snap, author, reviewerBase: null, reviewerTemplate: null, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective, reviewerModel: null, reviewerEffort: null,
      persistedAuthor: null, requirementsFormCorrection: null, requirementsHarnessRow: null, checkAt: exp.variants[v]?.requirementsCheckAt ?? null,
      stored: node.tools === 'recorded' ? stored : null, held: null, authorOnly: false, fixture, network });
  }
  return { jobs, report };
}

function estimate(jobs: Job[], defaultN: number, nOverride?: number) {
  let upper = 0; let expected = 0; let calls = 0;
  const rows: string[] = [];
  const cptByNode = new Map<string, number>();
  for (const j of jobs) {
    // Calibrated ONCE per node, on its first job's prompt, against the persisted single-call token count (when the
    // persisted execution was one call) — so a variant's longer text shows up as more tokens, not as the same number.
    if (!cptByNode.has(j.node.id)) {
      const single = persistedSingleCallInput(j.snap.author);
      cptByNode.set(j.node.id, single ? promptChars(j.author) / single : DEFAULT_CHARS_PER_TOKEN);
    }
    const cpt = cptByNode.get(j.node.id)!;
    const n = nOverride ?? j.node.nByVariant?.[j.variant] ?? j.node.n ?? defaultN;
    const aOut = j.snap.author.exec.outputTokens ?? 12000;
    if (!j.reviewerBase) {
      // A harvester node: one role, MANY turns (its calls are served). The single-call formula would undershoot by the
      // turn count, so the estimate is the PERSISTED execution's own token mix priced on the arm's model — per sample.
      const e = j.snap.author.exec;
      const per = costForExecution({ inputTokens: e.inputTokens ?? 0, outputTokens: e.outputTokens ?? aOut, cacheReadTokens: e.cacheReadTokens ?? 0, cacheCreationTokens: e.cacheCreationTokens ?? 0 }, j.author.model, new Date()).costUsd ?? 0;
      const n = nOverride ?? j.node.nByVariant?.[j.variant] ?? j.node.n ?? defaultN;
      upper += n * per; expected += n * per; calls += n * Math.max(1, (parsedResult(j.snap.author)?.toolLoop?.totalTurns ?? 0) + 1);
      rows.push(`  ${j.node.id.padEnd(7)} ${j.variant.padEnd(9)} ${j.architectOnly ? 'architect' : 'harvester'}[${shortModel(j.author.model)}/${effortOf(j.author)}, tools ${j.stored ? `recorded (${j.stored.length} stored calls)` : 'stub'}] persisted mix ${e.inputTokens ?? 0} in/${e.cacheCreationTokens ?? 0} write/${e.cacheReadTokens ?? 0} read/${e.outputTokens ?? 0} out · ${n}× ≈ $${(n * per).toFixed(2)}`);
      continue;
    }
    const rOut = j.snap.reviewer!.exec.outputTokens ?? 6000;
    // The Reviewer prompt grows by the replayed package; use the persisted package size as the expectation.
    // L0a: a persisted Author costs nothing, and the Reviewer's exact prompt (package included) is already built.
    const zero = { inTok: 0, cost: 0 };
    const rp = j.persistedAuthor?.reviewer ?? j.reviewerBase!;
    const aFirst = j.persistedAuthor ? zero : estimateCall(j.author, aOut, cpt, false, j.author.model);
    const aRest = j.persistedAuthor ? zero : estimateCall(j.author, aOut, cpt, true, j.author.model);
    const rFirst = j.authorOnly ? zero : estimateCall(rp, rOut, cpt, false, rp.model);
    const rRest = j.authorOnly ? zero : estimateCall(rp, rOut, cpt, true, rp.model);
    // L-R3: an arm with the 2b correction ON may add one full-document re-emission per sample. Priced as one more cached
    // Author call with the deliverable turn's output (the R4 rule's own conservative estimate) — counted as if EVERY
    // sample triggers (stage A: every Opus draft on these nodes would).
    const corr = j.requirementsFormCorrection === true && !j.persistedAuthor ? estimateCall(j.author, aOut, cpt, true, j.author.model) : zero;
    const jobUpper = n * (aFirst.cost + rFirst.cost + corr.cost);
    const jobExpected = aFirst.cost + rFirst.cost + (n - 1) * (aRest.cost + rRest.cost) + n * corr.cost;
    upper += jobUpper; expected += jobExpected; calls += ((j.persistedAuthor || j.authorOnly ? 1 : 2) + (corr.cost ? 1 : 0)) * n;
    rows.push(`  ${j.node.id.padEnd(7)} ${j.variant.padEnd(9)}${j.held ? ' [held variant]' : ''} author[${j.persistedAuthor ? `${j.persistedAuthor.source?.startsWith(LAB_SAMPLE_PREFIX) ? 'LAB SAMPLE' : 'PERSISTED'}${j.persistedAuthor.plantId ? `+plant ${j.persistedAuthor.plantId}` : ''}, $0]` : `${shortModel(j.author.model)}/${effortOf(j.author)}] ~${aFirst.inTok} in/${aOut} out${corr.cost ? ' +2b correction' : ''}`} · ${j.authorOnly ? 'no reviewer (authorOnly)' : `reviewer[${shortModel(j.reviewerBase.model)}/${effortOf(j.reviewerBase)}] ~${rFirst.inTok} in/${rOut} out`} · ${n}× ≈ $${jobExpected.toFixed(2)} (≤ $${jobUpper.toFixed(2)} uncached)`);
  }
  return { upper, expected, calls, rows };
}

/**
 * LAB-WARM-FIRST (rank 4, 2026-10-19; lab-cost-reduction ANSWER §3b — ≈ 7% of L12–L17 spend was a sibling WRITING the cache prefix
 * its cell's other samples were writing at the same moment): every cell's sample 1 is queued first, and a sibling (i > 1) waits
 * until its cell's sample 1 has had its FIRST model call answered (the prompt-cache write) or has ended. Not model-visible: request
 * bytes are unchanged; only start times move. No deadlock — every sample 1 is queued before any sibling, so a waiting sibling's
 * sample 1 has already started. `--no-warm-first` restores the old order.
 */
export function warmFirstOrder<T extends { i: number }>(xs: T[]): T[] { return [...xs.filter((x) => x.i === 1), ...xs.filter((x) => x.i !== 1)]; }
export function warmGate<K>() {
  const m = new Map<K, { done: Promise<void>; open: () => void }>();
  const get = (k: K) => { let e = m.get(k); if (!e) { let open!: () => void; const done = new Promise<void>((res) => { open = res; }); e = { done, open }; m.set(k, e); } return e; };
  return { wait: (k: K) => get(k).done, open: (k: K) => get(k).open() };
}
/** Wrap a per-sample function: siblings wait for their cell's gate; sample 1 opens it when it ends (its first call opens it earlier). */
export function warmed<K, T extends { i: number; job: K }>(gate: ReturnType<typeof warmGate<K>>, on: boolean, fn: (t: T) => Promise<void>) {
  return async (t: T) => { if (on && t.i > 1) await gate.wait(t.job); try { await fn(t); } finally { if (t.i === 1) gate.open(t.job); } };
}

async function pool<T>(items: T[], k: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, k) }, async () => { while (i < items.length) { const t = items[i++]; await fn(t); } }));
}

async function run(args: Args) {
  const dir = args.experiment ? path.resolve(args.experiment) : null;
  let exp: Experiment;
  let nodes: NodeSpec[];
  let protocolOverride: ProtocolText | undefined;
  if (dir) {
    exp = loadExperiment(dir);
    nodes = exp.nodes.filter((nd) => !args.only || args.only.includes(nd.id));
  } else if (args.node) {
    if (!args.protocolText) throw new Error('--node needs --protocol-text <file>');
    const snap = loadSnapshot(args.node);
    const pi = parsedResult(snap.author)?.protocolInjection;
    const text = fs.readFileSync(args.protocolText, 'utf8');
    protocolOverride = { name: pi.delta.name, version: `${pi.delta.version}+file`, text, source: `file:${args.protocolText}` };
    exp = { label: 'adhoc', n: 5, flags: { CONNECTED_OUTPUT_SANITIZE_ENABLED: 'true', FORM_CORRECTION_ENABLED: 'true' }, baseline: { protocols: {} }, variants: {}, nodes: [], measures: [] };
    nodes = [{ id: args.node.slice(0, 10), authorExecutionId: args.node, kind: 'adhoc', variants: ['custom'] }];
  } else throw new Error('run needs --experiment <dir> or --node <authorExecutionId> --protocol-text <file>');
  // NO-REGRESSION-GOLDEN-SET (Protocol 16, 2026-10-31): an agent-text/model lab declares the golden set it replays, and a
  // paid run is refused without that declaration. The golden cells themselves run as the lab's companion (golden-set.ts).
  let goldenSpendRefusal: string | null = null; // thrown below, beside the other pre-call spend refusals
  if (dir) {
    const g = await import('./golden-set');
    if (g.labNeedsGolden(exp as any)) {
      const problems = g.validateGoldenDeclaration(exp as any, g.loadGoldenSet());
      const companion = path.join(dir, `golden-${(exp as any).goldenSet?.version ?? g.loadGoldenSet().version}`);
      if (problems.length && args.spend) goldenSpendRefusal = `GOLDEN SET: --spend refused —\n  - ${problems.join('\n  - ')}`;
      console.log(problems.length ? `⚠️  GOLDEN SET: ${problems.join(' | ')} (a --spend run is refused until this is fixed)`
        : `🥇 GOLDEN SET ${(exp as any).goldenSet.version}: replay it beside this lab — golden-build --experiment ${path.relative(REPO, dir)} · run --experiment ${path.relative(REPO, companion)} · golden-score`);
    }
  }
  // STANDING BENCH (owner G4-c, 2026-11-04): a lab whose lever reaches a standing node's reader carries it (refused at --spend).
  let standingSpendRefusal: string | null = null;
  if (dir) {
    const sb = await import('./standing-bench');
    const problems = sb.standingBenchProblems(exp as any, dir);
    if (problems.length) {
      console.log(`⚠️  STANDING BENCH: ${problems.join(' | ')} (a --spend run is refused until this is fixed)`);
      if (args.spend) standingSpendRefusal = `STANDING BENCH: --spend refused —\n  - ${problems.join('\n  - ')}`;
    }
  }
  const n = args.n ?? exp.n;
  for (const [k, v] of Object.entries(exp.flags)) process.env[k] = v;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = args.out ? path.resolve(args.out) : path.join(RUNS_DIR, `${stamp}-${exp.label}${args.spend ? '' : args.fakeLlm ? '-fake' : '-dry'}`);
  fs.mkdirSync(out, { recursive: true });
  const code = codeState();
  console.log(`🧪 leg replay lab — ${exp.label} · ${args.spend ? 'LIVE (--spend)' : args.fakeLlm ? 'FAKE MODEL, $0' : 'DRY RUN, $0'} · n=${n} · out ${path.relative(REPO, out)}`);
  console.log(`   code ${code.head.slice(0, 12)}${Object.keys(code.dirty).length ? ` + ${Object.keys(code.dirty).length} modified/untracked file(s) under lib/ scripts/ prisma/ (lab excluded): ${Object.keys(code.dirty).join(', ')}` : ' (clean)'}`);

  // ME-P2-6: refuse an arm that would run without its node's plant unless the node names it in `unplantedArms` — before any call.
  for (const nd of nodes) {
    const gaps = plantArmGaps(dir ?? '', nd, (v) => nd.authorSourceByVariant?.[v] ?? exp.variants[v]?.authorSource ?? 'live', args.variants ?? null);
    if (gaps.length) throw new Error(`${nd.id}: plant ${nd.authorPlant} would leave arm(s) unplanted: ${gaps.join('; ')} — list the arm's Author form in the plant, or name it in the node's unplantedArms`);
  }
  { const pr = provenanceRefusals(nodes, (id) => loadSnapshot(id)); if (pr.length) throw new Error(`PROVENANCE: ${pr.join(' | ')}`); }
  // L-CS-N: prepare binds the kind gate per arm; it is reset whatever prepare does (resolve or throw).
  const { jobs, nodeReports } = await prepare(exp, dir ?? '', nodes, args.variants ?? null, out, protocolOverride).finally(resetKindGate);
  // NB1 (2026-11-07): TEXT REACH — every arm's edited protocols and template edits are in every prompt that composes them (refused otherwise).
  if (dir && !protocolOverride) {
    const tr = await import('./text-reach');
    const specs = new Map<string, import('./text-reach').ReachArm>();
    const problems: string[] = []; let checked = 0;
    for (const j of jobs) {
      if (!specs.has(j.variant)) specs.set(j.variant, tr.armReachSpec(dir, exp as any, j.variant));
      const roleOf = (b: any) => parsedResult(b)?.agentRole ?? b?.exec?.config?.agentRole ?? null;
      const prompts: import('./text-reach').ReachPrompt[] = [{ label: `${j.node.id}/${j.variant} author.system`, role: roleOf(j.snap.author), system: j.author.system }];
      const rv = j.persistedAuthor?.reviewer ?? j.reviewerBase;
      if (rv && j.snap.reviewer && !j.authorOnly && !j.architectOnly) prompts.push({ label: `${j.node.id}/${j.variant} reviewer.system`, role: roleOf(j.snap.reviewer), system: rv.system });
      checked += prompts.length;
      problems.push(...tr.textReachProblems(specs.get(j.variant)!, prompts));
      if (j.constraintsBound) {
        // NB1 (2026-11-07): an arm that declares constraintsSeed but whose binding changes NO row is refused — on a tree without the candidate
        // seed (e.g. main after the revert) the check would otherwise pass silently with the released constraints.
        const c = j.constraintsBound.author;
        if (JSON.stringify(jsonbKeyOrderLab(c.released)) === JSON.stringify(jsonbKeyOrderLab(c.candidate))) problems.push(`${j.node.id}/${j.variant}: constraintsSeed binds NO change on this tree (the seed's constraints equal the released row) — run on the candidate commit`);
        problems.push(...tr.constraintReachProblems(`${j.node.id}/${j.variant} author.system`, j.author.system, j.constraintsBound.author));
      }
    }
    if (problems.length) throw new Error(`TEXT REACH: a candidate text does not reach a prompt that composes it —\n  - ${problems.join('\n  - ')}`);
    console.log(`   text reach ✓ — every edited protocol and template edit is in every prompt that composes it (${checked} prompts)`);
  }
  // L-CS-N (S3): each job carries its arm's gate; on an OPEN arm a planted `live-read` block that does not resolve `parsed` is refused.
  for (const j of jobs) {
    j.kindGate = armKindGate(exp.variants[j.variant], j.variant);
    j.armProtocolInjection = armProtocolInjection(exp, j.variant, j.protocol);
    if (j.kindGate === null) continue;
    const kg = await withArmKindGate(j.kindGate, () => kindGateCheck(j.held?.snapV ?? j.snap, j.kindGate!, `${j.node.id}/${j.variant}`));
    const vr = nodeReports[j.node.id]?.variants?.[j.variant];
    if (vr) vr.kindGate = kg;
    if (kg.refusal) throw new Error(`KIND GATE: ${kg.refusal}`);
    console.log(`   ${j.node.id}/${j.variant}: live-read kind gate ${j.kindGate}${kg.leg?.liveReadLine ? ` · leg ${kg.leg.state} (${kg.leg.liveReadEntries} live-read)` : ''}${kg.brief?.liveReadLine ? ` · brief ${kg.brief.state} (${kg.brief.liveReadEntries} live-read)` : ''}${kg.closedArmUnknownKind ? ' · closed arm reads live-read as unknown-kind (the 1.25.0 reading)' : ''}`);
  }
  for (const [id, r] of Object.entries(nodeReports)) {
    const c = r.controls;
    if (r.architectOnly) {
      console.log(`   ${id.padEnd(7)} architect cell: no Reviewer, no chain, no net to compare — prompts saved per arm${Object.values<any>(r.variants).some((vr) => vr.held) ? ' (held arm: heldIndex on the Harvester entry)' : ''}`);
      for (const [v, vr] of Object.entries<any>(r.variants)) if (vr.harvesterSource) console.log(`      ${v}: Harvester entry from ${vr.harvesterSource.source} (reaches the prompt ✓${vr.harvesterSource.reproducesFrozenPrompt === true ? ' · persisted text ⇒ prompt = frozen ✓' : vr.harvesterSource.reproducesFrozenPrompt === false ? ' · persisted text but prompt ≠ frozen ✗' : ''})`);
      for (const [v, vr] of Object.entries<any>(r.variants)) if (vr.fidelityFailures?.length) console.log(`      ⚠️ ${v}: ${vr.fidelityFailures.join(' | ')}`);
      continue;
    }
    if (r.harvesterOnly) {
      const q = r.persistedQuoteFidelity; const sc = r.persistedQuoteScore;
      if (r.fixture) console.log(`   ${id.padEnd(7)} file fixture ${r.fixture.owner}/${r.fixture.repo}@${r.fixture.commit.slice(0, 12)} · ${r.fixture.files.length} file(s) · digest ${r.fixture.digest.slice(0, 12)}${r.fixture.plants.length ? ` · plants ${r.fixture.plants.map((x: any) => `${x.id}→${x.path} (${x.deltaChars >= 0 ? '+' : ''}${x.deltaChars})`).join(', ')}` : ''} · shipping capture holds ${r.fixture.captureReadiness.held}/${r.fixture.captureReadiness.of}${r.fixture.captureReadiness.persistTruncated.length ? ` · persist-truncated (> 50,000 JSON chars): ${r.fixture.captureReadiness.persistTruncated.join(', ')}` : ''}`);
      if (r.inputEdits) console.log(`      input edit ${r.inputEdits.edit}: ${Object.entries<any>(r.inputEdits.targets).map(([t, x]) => `${t} ${x.beforeChars}→${x.afterChars}`).join(' · ')} (${Object.values<any>(r.inputEdits.targets).some((x) => x.copies) ? `raw plant in every stored copy, re-read: ${Object.values<any>(r.inputEdits.targets).flatMap((x) => x.copies ?? []).join(', ')}` : "reaches every arm's prompt verbatim ✓"})`);
      console.log(`   ${id.padEnd(7)} harvester control pass: markerPresence reproduces ${c.leafNetsReproducePersisted.markerPresence ? '✓' : '✗'} · quoteFidelity computes on the persisted harvest ${c.quoteFidelityComputes ? '✓' : '✗'} (${q?.reason ?? '—'}, ${q?.disposition ?? '—'}) · quote score: file blocks ${sc.fileBlocks}, strict-clean ${sc.fileBlocksStrictClean}, prometheus ${sc.prometheusBlocks}, edited ${sc.editedLines} · tools ${r.tools} — record ${r.record.calls} calls, ${r.record.fileCalls} file, ${r.record.truncatedAtPersist} truncated at persist, ${r.record.failed} failed`);
      for (const [v, vr] of Object.entries<any>(r.variants)) if (vr.fidelityFailures?.length) console.log(`      ⚠️ ${v}: ${vr.fidelityFailures.join(' | ')}`);
      continue;
    }
    const na = (k: string) => (c.leafNetsReproducePersisted.notApplicable ?? []).includes(k) ? 'n/a ✓' : (c.leafNetsReproducePersisted[k] ? '✓' : '✗');
    const rq = c.requirementsFormCheckComputes;
    console.log(`   ${id.padEnd(7)} control pass: leaf nets reproduce persisted [markerPresence ${na('markerPresence')} rollbackContainment ${na('rollbackContainment')}] · chain patch identity ${c.chainPatchIdentity ? '✓' : '✗'} · shipping parser = persisted verdict ${c.shippingParserReproducesPersistedVerdict ? '✓' : '✗'} · leg reviewerWarnings computes ${c.legReviewerWarningsNotApplicable ? 'n/a ✓' : c.legReviewerWarningsComputes ? '✓' : '✗'}${rq ? ` · requirements form check computes ${rq.ok ? '✓' : '✗'} (map ${rq.ownerRowItemMap}/${rq.itemMapSource}, persisted view ${rq.persistedDraft.view}, failing ${rq.persistedDraft.failing.join(',') || 'none'})` : ''}${r.plant ? ` · plant ${r.plant.edit} (${r.plant.deltaChars >= 0 ? '+' : ''}${r.plant.deltaChars})` : ''} (persisted ${r.persisted.approved === true ? 'APPROVED' : r.persisted.approved === false ? 'REFUSED' : '—'})`);
    for (const [v, vr] of Object.entries<any>(r.variants)) if (vr.requirementsFormCorrection) console.log(`      ${v}: author ${shortModel(vr.models?.author)}/${vr.models?.authorEffort} · 2b correction ${vr.requirementsFormCorrection} · ${vr.requirementsCheck}`);
    if (r.inputEdits) console.log(`      input edit ${r.inputEdits.edit}: ${Object.entries<any>(r.inputEdits.targets).map(([t, x]) => `${t} ${x.beforeChars}→${x.afterChars}`).join(' · ')}`);
    for (const [v, vr] of Object.entries<any>(r.variants)) if (vr.fidelityFailures?.length) console.log(`      ⚠️ ${v}: ${vr.fidelityFailures.join(' | ')}`);
    for (const [v, vr] of Object.entries<any>(r.variants)) { const pp = vr.authorSource?.plant?.presence ?? vr.authorSource?.plantPresence; if (pp) console.log(`      ${v}: plant reaches the Reviewer prompt vs its unplanted twin ✓ · ${pp.outsidePlantLines} derived line(s) differ outside the plant (manifest; read them)`); }
  }
  const est = estimate(jobs, n, args.n);
  console.log(`\n💲 ESTIMATE (${jobs.length} node×variant, ${est.calls} model calls + any 50-69 diagnostic retries / form corrections):`);
  est.rows.forEach((r) => console.log(r));
  console.log(`   total ≈ $${est.expected.toFixed(2)} expected with prompt caching within a node×variant · ≤ $${est.upper.toFixed(2)} if nothing caches`);

  const manifest = {
    label: exp.label, startedAt: new Date().toISOString(), spend: !!args.spend, fakeLlm: args.fakeLlm ?? null, n, flags: exp.flags, warmFirst: !args.noWarmFirst,
    batch: args.batch ? { transport: 'message-batches', roles: 'author, reviewer, architect (harvester standard)', cacheTtl: '1h', dropped: 'betas + fallbacks where the provider sends them (Opus 5.5)', divergences: ['served tier = batch', 'loop deadline extended (time-budget decisions read ample time)', 'no server-side refusal fallback'] } : null,
    code, experimentDir: dir ? path.relative(REPO, dir) : null, nodes: nodeReports, estimate: { expectedUsd: est.expected, upperUsd: est.upper, calls: est.calls },
  };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (!args.spend && !args.fakeLlm) {
    console.log(`\n✅ dry run complete — prompts, protocol texts and control results saved under ${path.relative(REPO, out)}. No model was called.`);
    console.log('   Add --spend (and ANTHROPIC_API_KEY in your shell) to run it; --max-usd caps the spend.');
    return;
  }

  // --fake-llm persisted (TEST ONLY, $0): the "model" answers every Author call with the PERSISTED Author package and
  // every Reviewer call with the PERSISTED review, so the whole live path — loop, post-loop, nets, chain patch,
  // Reviewer rebuild, verdict parse, leg nets, summary — runs and must reproduce the persisted verdicts.
  if (args.fakeLlm && args.fakeLlm !== 'persisted' && args.fakeLlm !== 'transport' && !args.fakeLlm.startsWith('fixture:')) throw new Error('--fake-llm supports "persisted", "transport" or "fixture:<dir>"');
  // LAB-BATCH-TRANSPORT: `--batch` is paid only; `--fake-llm transport` is its $0 byte proof (the SHIPPING provider builds every request,
  // the capture records it beside its batch params and answers with a canned reply — nothing reaches the network).
  if (args.batch && !args.spend) throw new Error('--batch needs --spend (its $0 proof is --fake-llm transport)');
  const transportProof = args.fakeLlm === 'transport';
  const providerFake = !!args.fakeLlm && !transportProof; // a fake that REPLACES the provider (persisted / fixture)
  if (args.fakeLlm && args.spend) throw new Error('--fake-llm and --spend are exclusive');
  if (args.spend && (process.env.LAB_TEST_SPEND_MUTATION || process.env.LAB_TEST_FAKE_OUTPUT_TOKENS)) throw new Error('LAB_TEST_* variables are TEST ONLY — refusing to spend with them set');
  if (goldenSpendRefusal) throw new Error(goldenSpendRefusal);
  if (standingSpendRefusal) throw new Error(standingSpendRefusal);
  const apiKey = transportProof ? 'sk-ant-lab-transport-capture-not-a-key' : args.fakeLlm ? 'fake' : (process.env.ANTHROPIC_API_KEY ?? '');
  if (!args.fakeLlm && !apiKey.startsWith('sk-ant-')) throw new Error('ANTHROPIC_API_KEY is not set to an Anthropic key in this shell — refusing to spend');
  const maxUsd = args.maxUsd ?? Math.ceil(est.upper * 1.25);
  console.log(args.fakeLlm ? '\n▶ FAKE model (persisted outputs) — $0, exercises the live path only' : `\n▶ spending, cap $${maxUsd} (--max-usd) · concurrency ${args.concurrency ?? 4}${args.noWarmFirst ? ' · warm-first OFF' : ' · warm-first (sample 1 of each cell writes the cache first)'}`);
  const { runLive, fakeGenerateText } = await import('./live');
  const fake = (b: 'author' | 'reviewer', snap: Snapshot) => providerFake
    ? fakeGenerateText(parsedResult(b === 'author' ? snap.author : snap.reviewer)!.finalResponse, (b === 'author' ? snap.author : snap.reviewer!).exec.modelUsed) : undefined;
  // L-6: `--fake-llm fixture:<dir>` answers a held arm's Author from a canned package (null ⇒ the persisted fake).
  const heldFake = args.fakeLlm?.startsWith('fixture:') ? heldFixtureFake(path.resolve(args.fakeLlm.slice('fixture:'.length))) : null;
  const { installBatchTransport, inBatchScope } = await import('./batch-transport');
  const captures: import('./batch-transport').CaptureRecord[] = [];
  const transport = transportProof ? installBatchTransport({ mode: 'capture', ttl: '1h', onCapture: (r) => captures.push(r) })
    : args.batch ? installBatchTransport({ mode: 'batch', ttl: '1h', log: (m) => console.log(m) }) : null;
  // Author / Reviewer / Architect samples run in the batch scope; Harvesters (many turns, cache-read heavy) stay standard.
  const batchScoped = <T extends { job: Job }>(fn: (t: T) => Promise<void>) => (t: T) => inBatchScope(!!transport && (!!t.job.architectOnly || !!t.job.reviewerBase), () => fn(t));
  if (transport) for (const j of jobs) if (j.requirementsHarnessRow && (j.architectOnly || j.reviewerBase)) throw new Error(`${j.node.id}: LAB-BATCH-TRANSPORT refuses a requirements_author node (its 2b time decision reads the wall clock)`);
  let spent = 0;
  let stopped = false;
  const warmFirst = !args.noWarmFirst;
  const warm = warmGate<Job>();
  const samples: Array<{ job: Job; i: number }> = [];
  // A node may carry its own n (e.g. Z1 n=3), or one per variant (`nByVariant`, 2026-10-12 group 4: base TZ n=1 beside
  // g4 TZ n=3); --n on the command line overrides every node.
  for (const job of jobs) for (let i = 1; i <= (args.n ?? job.node.nByVariant?.[job.variant] ?? job.node.n ?? n); i++) samples.push({ job, i });
  // L-Z2: samples whose arms run different in-run check data never interleave — one data group at a time, HEAD's data
  // restored after each. Groups run in first-appearance order of their arms.
  const groups = new Map<string, Array<{ job: Job; i: number }>>();
  // L-CS-N: the live-read kind gate is module state too — the group key carries it, so arms with different gates never interleave.
  for (const s of samples) { const k = `${s.job.checkAt ?? ''}\u0000${s.job.kindGate ?? ''}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(s); }
  const checkGroups: Array<{ checkAt: string | null; registrySha256: string; templateSha256: string; samples: number }> = [];
  for (const [gk, groupSamples] of groups) {
  const [k, gateKey] = gk.split('\u0000');
  bindKindGate((gateKey || null) as ArmKindGate | null);
  if (gateKey) console.log(`   ▸ live-read kind gate ${gateKey} — ${groupSamples.length} sample(s)`);
  const installed = installCheckDataAt(k || null);
  checkGroups.push({ checkAt: k || null, registrySha256: installed.registrySha256, templateSha256: installed.templateSha256, samples: groupSamples.length });
  if (groups.size > 1 || k) console.log(`   ▸ in-run check data ${installed.source} (registry ${installed.registrySha256.slice(0, 12)}) — ${groupSamples.length} sample(s)`);
  await pool(warmFirst ? warmFirstOrder(groupSamples) : groupSamples, args.concurrency ?? 4, warmed(warm, warmFirst, batchScoped(async ({ job, i }) => {
    if (stopped) return;
    if (spent >= maxUsd) { stopped = true; console.log(`   ⛔ cap reached ($${spent.toFixed(2)} ≥ $${maxUsd}) — stopping before further calls`); return; }
    const sd = path.join(out, job.node.id, job.variant, `sample-${String(i).padStart(2, '0')}`);
    fs.mkdirSync(sd, { recursive: true });
    const sample: Record<string, any> = { node: job.node.id, variant: job.variant, i, startedAt: new Date().toISOString() };
    // SPEND METER (L-K2 defect, 2026-10-19): every model call adds its cost the moment it returns (runLive `onCall`), synchronously.
    // The old `spent += await runXSample(…)` read `spent` BEFORE the await, so concurrent samples overwrote each other (invocation 3
    // recorded $1.59 for $6.79 of calls). A sample that THROWS has still counted every call it made; its sample.json carries them.
    const meter = { usd: 0, calls: [] as unknown[] };
    const onCall = (c: { costUsd: number | null }) => {
      const x = c.costUsd ?? 0;
      if (process.env.LAB_TEST_SPEND_MUTATION === 'racy') return; // TEST ONLY (LK10): the racy form below, so the pin can fail on it
      meter.usd += x; spent += x; meter.calls.push(c);
      if (i === 1) warm.open(job); // LAB-WARM-FIRST: the prefix is cached once the first call is answered
    };
    const failed = (e: unknown) => {
      sample.error = e instanceof Error ? e.message : String(e);
      if (sample.costUsd === undefined) { sample.costUsd = meter.usd; sample.calls = sample.calls ?? meter.calls; sample.costFromMeter = true; }
      console.log(`   💥 ${job.node.id} ${job.variant} #${i}: ${sample.error} · $${meter.usd.toFixed(3)} of calls counted`);
    };
    const racy = async (p: Promise<number>) => { if (process.env.LAB_TEST_SPEND_MUTATION === 'racy') spent += await p; else await p; };
    if (job.architectOnly) {
      try { await racy(runArchitectSample(job, i, sd, sample, apiKey, providerFake, onCall)); }
      catch (e) { failed(e); }
      fs.writeFileSync(path.join(sd, 'sample.json'), JSON.stringify(sample, null, 2));
      return;
    }
    if (!job.reviewerBase) {
      try { await racy(runHarvesterSample(job, i, sd, sample, apiKey, providerFake, onCall)); }
      catch (e) { failed(e); }
      fs.writeFileSync(path.join(sd, 'sample.json'), JSON.stringify(sample, null, 2));
      return;
    }
    try {
      const pa = job.persistedAuthor;
      let aId = `lab-${job.node.id}-${job.variant}-${i}-a`;
      let a: LiveResult;
      let leaf: { stamped: Record<string, Record<string, unknown>>; errors: Record<string, string> };
      let authorResult: Record<string, any>;
      let reviewer: RebuiltPrompt;
      let heldFact: Record<string, unknown> | null = null;
      if (pa) {
        // L0a: no Author call. The persisted (planted) package, its leaf stamps and the Reviewer prompt were fixed at prepare.
        aId = pa.chainExecutionId;
        const ares = parsedResult(job.snap.author)!;
        a = { finalResponse: pa.text, finalStopReason: ares.toolLoop?.finalStopReason ?? null, turns: 0, toolCalls: [], formCheck: ares.toolLoop?.formCheck ?? null,
          requirementsFormCheck: ares.toolLoop?.requirementsFormCheck ?? null, toolCallRecords: [],
          confidenceScore: ares.confidenceScore ?? null, diagnosticRetryUsed: false, correctionTurnUsed: false, truncationRetryUsed: false, calls: [], costUsd: 0, durationMs: 0 };
        leaf = { stamped: pa.leafStamped, errors: {} };
        authorResult = pa.authorResult ?? persistedAuthorResult(job.snap, pa.text, pa.leafStamped);
        reviewer = pa.reviewer;
      } else {
        const r9v = r9VersionInEffect();
        a = await runLive(job.author, { executionId: aId, taskId: job.snap.author.task.id, taskType: job.snap.author.task.type, apiKey,
          requirementsHarnessRow: job.requirementsHarnessRow ?? job.snap.leg, generateTextOverride: job.held && heldFake ? heldFake(job) : fake('author', job.snap),
          ...(job.requirementsFormCorrection !== null ? { requirementsFormCorrectionEnabled: job.requirementsFormCorrection } : {}),
          ...(job.held ? { heldEdit: { owningLeg: job.held.owningLeg, inputContext: job.held.authorInputContext, povId: job.snap.author.task.pov_id ?? null,
            resolveHeldFiles: labResolveHeldFiles(job.held.store, r9v), correctionEnabled: job.held.correctionEnabled, r9Version: r9v } } : {}), onCall });
        // Stage B: the variant Author's stamp, built as the core builds it (refWrite named for the lab: it writes no rows).
        if (job.held && !a.editStep) throw new Error('held-variant arm: the shipping edit step did not run (eligibility) — the binding is wrong');
        heldFact = job.held && a.editStep ? buildEditApplicationFact({ app: a.editStep.application, heldFiles: a.editStep.files, refWrite: 'lab-not-written',
          textSource: a.editStep.textSource, correction: a.editStep.correction, baseShaByHandle: Object.fromEntries(a.editStep.refs.map((r) => [r.handle, r.blobSha256])) }) : null;
        if (a.editStep) {
          fs.writeFileSync(path.join(sd, 'editApplication.json'), JSON.stringify({ fact: heldFact, refusals: a.editStep.application.refusals, files: a.editStep.application.files.map(({ candidateText, hunks, ...f }) => f), correction: a.editStep.correction }, null, 2));
          for (const f of a.editStep.application.files) if (f.state === 'applied' && typeof f.candidateText === 'string') fs.writeFileSync(path.join(sd, `candidate-${f.handle}.txt`), f.candidateText);
        }
        leaf = await runAuthorLeafNets(job.held?.snapV ?? job.snap, job.author.role, a.finalResponse, aId, undefined,
          heldFact && a.editStep ? { editApplication: heldFact, baseHeldHandles: a.editStep.refs.map((r) => r.handle) } : undefined, job.armProtocolInjection);
        authorResult = {
          finalResponse: a.finalResponse, confidenceScore: a.confidenceScore,
          qualityMetrics: { totalTurns: a.turns, hitMaxTurns: a.turns >= job.author.maxToolTurns, responseLength: a.finalResponse.length, toolCallSuccess: { total: a.toolCalls.length, failed: 0, succeeded: a.toolCalls.length } },
          markerPresence: leaf.stamped.markerPresence ?? null, rollbackContainment: leaf.stamped.rollbackContainment ?? null, derivationContainment: null,
          toolLoop: { formCheck: a.formCheck, ...(a.requirementsFormCheck ? { requirementsFormCheck: a.requirementsFormCheck } : {}) },
          ...(heldFact ? { editApplication: heldFact } : {}),
          validationToolCalls: leaf.stamped.validationToolCalls, gitDeviceComparison: leaf.stamped.gitDeviceComparison, liveEvidence: leaf.stamped.liveEvidence,
        };
        if (job.authorOnly) {
          // Stage B G1: the Author is scored mechanically; no Reviewer call, no chain.
          fs.writeFileSync(path.join(sd, 'author.md'), a.finalResponse);
          Object.assign(sample, {
            authorOnly: true, authorSource: { source: 'live' }, editApplication: heldFact,
            author: { confidence: a.confidenceScore, stopReason: a.finalStopReason, turns: a.turns, toolCalls: a.toolCalls, diagnosticRetryUsed: a.diagnosticRetryUsed, formCheck: a.formCheck, chars: a.finalResponse.length, durationMs: a.durationMs },
            leafFacts: summarizeFacts(leaf.stamped), leafNetErrors: leaf.errors, measures: computeMeasures(a.finalResponse, exp.measures),
            // L-N2: the network Author facts score-n2 reads whole (summarizeFacts keeps one line).
            ...(leaf.stamped.validationToolCalls ? { validationToolCalls: leaf.stamped.validationToolCalls } : {}),
            calls: a.calls.map((c) => ({ role: 'author', ...c })), costUsd: a.costUsd,
          });
          console.log(`   ${heldFact ? (heldFact.state === 'applied' ? '✅' : '⚠️') : '·'} ${job.node.id} ${job.variant} #${i} · ${heldFact ? `editApplication ${heldFact.state} (${heldFact.applied}/${heldFact.total})` : `author ${a.finalResponse.length} chars`} · $${a.costUsd.toFixed(3)} · running $${spent.toFixed(2)}`);
          fs.writeFileSync(path.join(sd, 'sample.json'), JSON.stringify(sample, null, 2));
          return;
        }
        // L-4: the Reviewer's chained Author entry carries the platform's recomputed diff (shipping pure builder).
        const editDiff = heldFact && a.editStep ? editDiffEntryFields({ authorExecutionId: aId, stamped: heldFact, files: a.editStep.files, r9Version: r9v, finalResponse: a.finalResponse }) : null;
        const rsnap = job.held?.snapV ?? job.snap;
        const ctx = patchReviewerContext(rsnap, { executionId: aId, ...authorResult, ...(editDiff ? { editDiff } : {}) } as any);
        reviewer = withModel(await rebuildPrompt(rsnap, 'reviewer', job.protocol, { inputContextOverride: ctx, templatePromptOverride: job.reviewerTemplate, dropTemplateDirective: job.dropTemplateDirective }), job.reviewerModel, job.reviewerEffort);
      }
      fs.writeFileSync(path.join(sd, 'author.md'), a.finalResponse);
      if (a.requirementsCorrection) {
        // The read needs both sides of every attempted correction, adopted or not (author.md is the deliverable).
        fs.writeFileSync(path.join(sd, 'author.pre-correction.md'), a.requirementsCorrection.preCorrectionText);
        if (a.requirementsCorrection.correctionPrompt !== null) fs.writeFileSync(path.join(sd, 'correction-message.md'), a.requirementsCorrection.correctionPrompt);
        if (a.requirementsCorrection.correctedRaw !== null) fs.writeFileSync(path.join(sd, 'author.correction-raw.md'), a.requirementsCorrection.correctedRaw);
      }
      fs.writeFileSync(path.join(sd, 'reviewer.user.md'), reviewer.user);
      const rId = `lab-${job.node.id}-${job.variant}-${i}-r`;
      const r = await runLive(reviewer, { executionId: rId, taskId: job.snap.reviewer!.task.id, taskType: job.snap.reviewer!.task.type, apiKey, generateTextOverride: fake('reviewer', job.snap), onCall });
      fs.writeFileSync(path.join(sd, 'reviewer.md'), r.finalResponse);
      const verdict = parseReviewerVerdict(r.finalResponse);
      // The Reviewer's stamped verdict as production nests it (warnings included) — what the leg nets read (L0d).
      const rVerdict = shippingReviewerVerdict(r.finalResponse, reviewer.role);
      // A held-variant arm's leg nets read the REBOUND leg (the variant predicate keys on its protocol stamp).
      const leg = await runLegSynthesizeNets(job.held?.snapV ?? job.snap, [
        { taskId: job.snap.author.task.id, executionId: aId, resultJson: authorResult },
        { taskId: job.snap.reviewer!.task.id, executionId: rId, resultJson: { finalResponse: r.finalResponse, reviewerVerdict: rVerdict } },
      ], job.armProtocolInjection);
      const rwFact = (leg?.stamped.reviewerWarnings ?? null) as Record<string, any> | null;
      const section = rwFact ? appendReviewerWarningsSection('', rwFact).content : '';
      fs.writeFileSync(path.join(sd, 'report-section.md'), section);
      const wm = reviewerWarningMeasures(r.finalResponse, rVerdict);
      const persistedFirst = persistedSingleCallInput(job.snap.author);
      const firstIn = a.calls[0] ? a.calls[0].inputTokens + a.calls[0].cacheReadTokens + a.calls[0].cacheCreationTokens : null;
      Object.assign(sample, {
        verdict: verdict ? { approved: verdict.approved, blocking: verdict.blocking, warnings: rVerdict?.warnings ?? null, untranscribedLabelLines: rVerdict?.untranscribedLabelLines ?? null } : null,
        authorSource: pa ? { source: pa.source ?? 'persisted', plant: pa.plantId } : { source: 'live' },
        ...(pa?.authorResult?.editApplication ? { editApplication: pa.authorResult.editApplication } : {}),
        warningMeasures: wm,
        legReviewerWarnings: rwFact, legReviewerWarningsError: leg?.errors.reviewerWarnings ?? null,
        reachChainPass: reachChainPass(wm, rwFact, section),
        reviewerConfidence: parseConfidenceScore(r.finalResponse),
        author: { confidence: a.confidenceScore, stopReason: a.finalStopReason, turns: a.turns, toolCalls: a.toolCalls, diagnosticRetryUsed: a.diagnosticRetryUsed, formCheck: a.formCheck, chars: a.finalResponse.length,
          ...(a.requirementsFormCheck ? { requirementsFormCheck: a.requirementsFormCheck, requirementsFormCorrectionEnabledSource: a.requirementsFormCorrectionEnabledSource ?? null } : {}), durationMs: a.durationMs },
        reviewer: { stopReason: r.finalStopReason, turns: r.turns, toolCalls: r.toolCalls, diagnosticRetryUsed: r.diagnosticRetryUsed },
        leafFacts: summarizeFacts(leaf.stamped), leafNetErrors: leaf.errors,
        legFacts: leg ? summarizeFacts(leg.stamped) : null, legNetErrors: leg?.errors ?? null,
        measures: computeMeasures(a.finalResponse, exp.measures),
        tokenFidelity: { persistedSingleCallInput: persistedFirst, replayFirstCallInput: firstIn,
          comparable: job.variant === 'baseline' && job.protocol.version === (parsedResult(job.snap.author)?.protocolInjection?.delta?.version) },
        calls: [...a.calls.map((c) => ({ role: 'author', ...c })), ...r.calls.map((c) => ({ role: 'reviewer', ...c }))],
        costUsd: a.costUsd + r.costUsd,
      });
      console.log(`   ${verdict?.approved === true ? '✅' : verdict?.approved === false ? '❌' : '❔'} ${job.node.id} ${job.variant} #${i} · ${verdict ? (verdict.approved ? 'APPROVED' : `REFUSED (${verdict.blocking.length} blocking)`) : 'NO PARSEABLE VERDICT'} · $${(a.costUsd + r.costUsd).toFixed(3)} · running $${spent.toFixed(2)}`);
    } catch (e) {
      failed(e);
    }
    fs.writeFileSync(path.join(sd, 'sample.json'), JSON.stringify(sample, null, 2));
  })));
  }
  installCheckDataAt(null);
  resetKindGate();
  transport?.uninstall();
  if (transportProof) {
    // The $0 byte proof: every request the shipping provider built, beside its batch params; the ONLY permitted differences are
    // betas/fallbacks where production sent them and the two cache TTL leaves (batch-transport.ts header).
    const bad = captures.filter((c) => c.unexpected.length);
    const rows = captures.map(({ body: _b, params: _p, ...r }) => r);
    fs.writeFileSync(path.join(out, 'batch-proof.json'), JSON.stringify({ requests: rows.length, unexpected: bad.length, rows }, null, 2));
    fs.mkdirSync(path.join(out, 'batch-proof'), { recursive: true });
    for (const c of captures) { fs.writeFileSync(path.join(out, 'batch-proof', `${String(c.n).padStart(3, '0')}.production.json`), JSON.stringify(c.body, null, 2)); fs.writeFileSync(path.join(out, 'batch-proof', `${String(c.n).padStart(3, '0')}.batch.json`), JSON.stringify(c.params, null, 2)); }
    const by = new Map<string, { n: number; dropped: Set<string>; diff: Set<string> }>();
    for (const c of captures) { const k = `${c.model}${c.beta ? ' (beta route)' : ''}`; const e = by.get(k) ?? { n: 0, dropped: new Set(), diff: new Set() }; e.n++; c.dropped.forEach((d) => e.dropped.add(d)); c.diff.forEach((d) => e.diff.add(d)); by.set(k, e); }
    console.log(`\n📦 LAB-BATCH-TRANSPORT byte proof: ${captures.length} request(s) captured, ${bad.length} with an unexpected difference`);
    for (const [k, e] of by) console.log(`   ${k}: ${e.n} request(s) · dropped [${[...e.dropped].join(', ') || '—'}] · differing paths [${[...e.diff].join(', ') || '—'}]`);
    for (const c of bad) console.log(`   🔴 request ${c.n} (${c.model}): unexpected ${c.unexpected.join(', ')}`);
    if (!captures.length || bad.length) process.exitCode = 1;
  }
  const end = codeState();
  const drift = end.head !== code.head || JSON.stringify(end.dirty) !== JSON.stringify(code.dirty);
  // Run-end spend check: the meter must equal Σ sample.json costUsd (every sample, failed ones included). The manifest records BOTH.
  const sampleSum = sumSampleCosts(out);
  const spendMismatch = Math.abs(sampleSum - spent) > 0.005;
  if (spendMismatch) console.log(`   🔴 SPEND MISMATCH: the run's meter reads $${spent.toFixed(4)} but its sample.json files sum to $${sampleSum.toFixed(4)} — trust the SAMPLE SUM; the lab spend counter is wrong`);
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ ...manifest, endedAt: new Date().toISOString(), spentUsd: Math.max(spent, sampleSum), meterUsd: spent, sampleSumUsd: sampleSum, spendMismatch, codeAtEnd: end, codeChangedDuringRun: drift, checkGroups }, null, 2));
  if (drift) console.log('   ⚠️ RULE 7: the code or a dirty tracked file CHANGED during the run — the results describe a moving target; re-run before quoting them.');
  summarize(out, exp.measures);
}

/** Σ `costUsd` over every `sample.json` under a run folder (the spend of record). */
export function sumSampleCosts(runDir: string): number {
  let t = 0;
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f); else if (e.name === 'sample.json') { try { t += Number(JSON.parse(fs.readFileSync(f, 'utf8')).costUsd ?? 0) || 0; } catch { /* unreadable sample */ } } } };
  if (fs.existsSync(runDir)) walk(runDir);
  return t;
}

/**
 * ONE harvester sample: the shipping loop with recorded (or stub) tools, the shipping result.json `toolCalls` builder over
 * the loop's records, the shipping leaf nets with those calls (the stamped `quoteFidelity`), and the lab quote score.
 * BYTES CHECK, every sample: each served result is compared with the stored one it came from — the bytes the loop received
 * must be the bytes production stored, and where production stamped R9 facts the replayed stamp must equal them.
 * `fake` ($0): the model re-issues the PRODUCTION calls in production order, then answers with the persisted harvest.
 */
/**
 * L-8 / L-8b (Stage B G1): an ARCHITECT node — one role, no Reviewer, no chain. CONTROL ($0): none beyond the prompt fidelity
 * checks (an Architect stamps no net the lab could compare). Per arm: the protocol (baseline, or the held variant via L-2), today's
 * pinned template, and on a held arm the frozen Harvester entry carrying `heldIndex` (handles, paths, line counts — never the file).
 */
/**
 * L-K-c: the Architect's Harvester entry rebuilt from `lab-sample:<run>/<H node>/<H arm>/<i>` (the H node must be a harvester node
 * of THIS experiment that replays the same production Harvester the Architect chains; harvester-source.ts proves the sample is
 * that node's) or from `frozen:<file>` (a hand-written fallback). The leaf stamps the chainer carries are the SHIPPING leaf nets
 * re-run over the replayed text (and, for a sample, its persisted-shape toolCalls) on the Harvester's own snapshot.
 */
async function architectHarvesterSource(exp: Experiment, dir: string, node: NodeSpec, snap: Snapshot, hsrc: string, opts: { heldArm?: boolean } = {}): Promise<{ ctx: Record<string, any>; report: Record<string, any>; sourceIsPersistedText: boolean;
  /** L-CS-N: a lab-sample harvest's served tool calls + its OWN leaf stamps (the held store and liveEvidence of a held Architect arm). */
  sample?: { executionId: string; taskId: string; povId: string | null; toolCalls: unknown[]; liveEvidence: Record<string, unknown> | null; leg: Record<string, any> | null } }> {
  const frozenEntry = (snap.author.exec.config?.inputContext?.chainedFrom ?? []).find((e: any) => e?.agentRole === 'infra_state_harvester');
  let sample: { executionId: string; taskId: string; povId: string | null; toolCalls: unknown[]; liveEvidence: Record<string, unknown> | null; leg: Record<string, any> | null } | undefined;
  if (!frozenEntry) throw new Error(`${node.id}: the Architect's frozen context has no Harvester entry`);
  let replayed: import('./chain').ReplayedAuthorResult;
  let report: Record<string, any>;
  let persistedText: string | null = null;
  if (hsrc.startsWith(LAB_SAMPLE_PREFIX)) {
    const m = /^lab-sample:[^/]+\/([^/]+)\/([^/]+)\/\d+$/.exec(hsrc);
    if (!m) throw new Error(`${node.id}: ${hsrc} is not lab-sample:<run>/<node>/<arm>/<i>`);
    const [, hId, hArm] = m;
    const hNode = exp.nodes.find((n) => n.id === hId);
    if (!hNode?.harvesterOnly) throw new Error(`${node.id}: ${hsrc} names ${hId}, which is not a harvester node of this experiment`);
    if (!hNode.variants.includes(hArm) || !exp.variants[hArm]) throw new Error(`${node.id}: ${hsrc} names arm ${hArm}, which ${hId} does not run`);
    if (hNode.authorExecutionId !== frozenEntry.executionId) throw new Error(`${node.id}: the Architect chains Harvester ${frozenEntry.executionId}; ${hId} replays ${hNode.authorExecutionId}`);
    const hin = harvesterNodeInputs(dir, hNode);
    const { protocol: hp, author: ha } = await harvesterArmPrompt(exp, dir, hin.snap, hArm);
    const loaded = loadHarvesterLabSample(hsrc, { harvesterExecutionId: hNode.authorExecutionId, protocolSha256: sha256(hp.text),
      harvesterPrompt: { system: ha.system, user: ha.user }, fixtureDigest: hin.fixture?.digest ?? null });
    const hres = parsedResult(hin.snap.author)!;
    const leaf = await runAuthorLeafNets(hin.snap, hres.agentRole, loaded.text, loaded.sampleExecutionId, loaded.toolCalls, undefined, armProtocolInjection(exp, hArm, hp));
    // The sample's liveEvidence is computed PURELY (the shipping function over the sample's served calls and the H node's declaration,
    // under the production population rule): the replayed leaf net cannot read the leg row (replay-prisma serves no device-sources read,
    // so its own stamp reads `device-sources-could-not-check`) — measured 2026-11-05 on the --fake-llm persisted run.
    const leSample = withComputedLiveEvidence({ ...hin.snap, childArtifacts: [] } as Snapshot, undefined, { protocol: armComposedProtocol(exp, hArm, hp) }, { toolCalls: (loaded.toolCalls ?? []) as unknown[] });
    sample = { executionId: loaded.sampleExecutionId, taskId: String(hin.snap.author.task.id), povId: (hin.snap.author.task.pov_id as string) ?? null,
      toolCalls: (loaded.toolCalls ?? []) as unknown[], liveEvidence: leSample.fact, leg: hin.snap.leg };
    replayed = { executionId: loaded.sampleExecutionId, finalResponse: loaded.text, confidenceScore: loaded.confidenceScore,
      qualityMetrics: { totalTurns: loaded.turns ?? 0, hitMaxTurns: (loaded.turns ?? 0) >= ha.maxToolTurns, responseLength: loaded.text.length,
        toolCallSuccess: { total: loaded.toolCallCount, failed: loaded.toolCallFailed, succeeded: loaded.toolCallCount - loaded.toolCallFailed } },
      markerPresence: leaf.stamped.markerPresence ?? null, rollbackContainment: leaf.stamped.rollbackContainment ?? null, derivationContainment: leaf.stamped.derivationContainment ?? null };
    report = { source: hsrc, harvesterNode: hId, harvesterArm: hArm, sampleSha256: loaded.textSha256, fixtureDigest: hin.fixture?.digest ?? null,
      identity: 'node/arm/i · same production Harvester · protocol sha · Harvester prompt byte-identical · fixture digest', leafFacts: summarizeFacts(leaf.stamped), leafNetErrors: leaf.errors };
    persistedText = hres.finalResponse;
  } else if (hsrc.startsWith(HARVESTER_SOURCE_FROZEN_PREFIX)) {
    const fz = loadFrozenHarvest(dir, hsrc);
    const hsnap = loadSnapshot(frozenEntry.executionId);
    const hres = parsedResult(hsnap.author)!;
    const leaf = await runAuthorLeafNets(hsnap, hres.agentRole, fz.text, `lab-frozen-${node.id}`, []);
    replayed = { executionId: `lab-frozen-${node.id}`, finalResponse: fz.text, confidenceScore: parseConfidenceScore(fz.text), qualityMetrics: null,
      markerPresence: leaf.stamped.markerPresence ?? null, rollbackContainment: leaf.stamped.rollbackContainment ?? null, derivationContainment: leaf.stamped.derivationContainment ?? null };
    report = { source: hsrc, file: fz.file, sha256: fz.textSha256, leafFacts: summarizeFacts(leaf.stamped), leafNetErrors: leaf.errors };
    persistedText = hres.finalResponse;
  } else throw new Error(`${node.id}: harvesterSourceByVariant "${hsrc}" — use persisted, lab-sample:<run>/<node>/<arm>/<i> or frozen:<file>`);
  // A held arm's lab-sample harvest REPLACES the production capture (its own store's heldIndex is set by the caller) — ARCH-LR, ADDENDUM (h).
  const { ctx } = patchHarvesterEntry(snap.author.exec as any, replayed, { dropProductionHeld: !!opts.heldArm && hsrc.startsWith(LAB_SAMPLE_PREFIX) });
  void sample;
  const patched = (ctx.chainedFrom as any[]).find((e) => e?.agentRole === 'infra_state_harvester');
  const probe = String(patched.finalResponse).split('\n').find((l: string) => l.trim().length >= 20) ?? String(patched.finalResponse).slice(0, 200);
  return { ctx, report: { ...report, probe, chainedChars: String(patched.finalResponse).length, truncated: patched.truncated }, sourceIsPersistedText: replayed.finalResponse === persistedText, ...(sample ? { sample } : {}) };
}

async function prepareArchitect(exp: Experiment, dir: string, node: NodeSpec, variants: string[] | null, out: string): Promise<{ jobs: Job[]; report: Record<string, any> }> {
  if (node.authorPlant || node.reviewerExecutionId || node.ownerRowItemMap || node.harvesterOnly) throw new Error(`${node.id}: an architectOnly node takes no plant, reviewer, owner map or harvesterOnly`);
  const { snap: snapE } = snapshotWithInputEdits(dir, node, loadSnapshot(node.authorExecutionId));
  const ares = parsedResult(snapE.author)!;
  // VALUE-LEG-GIT: a value leg's Derivation Architect may run alone too (its Harvester entry from a valueHarvest, or as stored).
  if (ares.agentRole !== 'infra_change_architect' && ares.agentRole !== 'derivation_architect') throw new Error(`${node.id}: architectOnly, but ${node.authorExecutionId} ran as ${ares.agentRole}`);
  if (ares.agentRole === 'derivation_architect' && node.harvesterSourceByVariant) throw new Error(`${node.id}: a value-leg Architect takes its harvest from valueHarvest, not harvesterSourceByVariant`);
  const vl = await applyValueLane(dir, node, snapE);
  const snap = vl.snap;
  const nodeDir = path.join(out, node.id);
  fs.mkdirSync(nodeDir, { recursive: true });
  fs.writeFileSync(path.join(nodeDir, 'persisted.architect.md'), ares.finalResponse);
  const report: Record<string, any> = { authorExecutionId: snap.author.exec.id, reviewerExecutionId: null, kind: node.kind, architectOnly: true,
    persisted: { approved: null, blocking: null, authorOutputTokens: snap.author.exec.outputTokens, reviewerOutputTokens: null },
    controls: { leafNetsReproducePersisted: { markerPresence: true, rollbackContainment: true, errors: {}, notApplicable: [] }, chainPatchIdentity: null, shippingParserReproducesPersistedVerdict: null, legReviewerWarningsComputes: null, legReviewerWarningsNotApplicable: null, requirementsFormCheckComputes: null },
    measuresOnPersisted: {}, variants: {}, ...(vl.report ? { valueLane: vl.report } : {}) };
  if (ares.agentRole === 'derivation_architect') {
    // L-VLG-c control: the PERSISTED Architect text through the shipping containment net on THIS (possibly re-harvested) snapshot.
    const { valueArchitectContainment, containmentLine } = await import('./value-lane');
    const c = await valueArchitectContainment(snap, ares.finalResponse, snap.author.exec.id);
    report.controls.persistedTextContainment = { line: containmentLine(c.fact), error: c.error,
      equalsStoredStamp: !node.valueHarvest ? JSON.stringify(c.fact) === JSON.stringify(ares.derivationContainment ?? null) : null };
  }
  const jobs: Job[] = [];
  const { patchHeldConsumerContext } = await import('./chain');
  const { labHeldIndexFields } = await import('./held-store');
  for (const v of node.variants.filter((x) => !variants || variants.includes(x))) {
    bindKindGate(armKindGate(exp.variants[v], v)); // L-CS-N
    const spec = exp.variants[v];
    const heldArm = heldArmOf(exp, v);
    const heldSpec = heldArm?.spec ?? null;
    const protocol = heldArm ? heldArmProtocol(exp, dir, snap, v, heldArm) : protocolFor(exp, dir, snap, v);
    let asnap = snap; let ctx: Record<string, any> | undefined; let held: Record<string, any> | null = null; let heldStore: LabHeldStore | null = null;
    let constraintsBound: Job['constraintsBound'] = null;
    if (spec?.constraintsSeed) {
      if (heldSpec) throw new Error(`${node.id}/${v}: constraintsSeed on a held arm — the held join already binds its seed's constraints`);
      const b = (await import('./variant-binding')).snapshotWithSeedConstraints(asnap, spec.constraintsSeed); asnap = b.snap; constraintsBound = b.constraints;
    }
    // L-K-c (held-k8s 1k): the Harvester entry this arm's Architect reads — an L-K1 lab sample or a frozen fallback.
    const hsrc = node.harvesterSourceByVariant?.[v] ?? 'persisted';
    let harvesterSource: Record<string, any> | null = null;
    let sourceIsPersistedText = false;
    let sampleHarvest: Awaited<ReturnType<typeof architectHarvesterSource>>['sample'] | undefined;
    if (hsrc !== 'persisted') {
      // L-CS-N (ARCH-LR): a held arm may take a LAB-SAMPLE harvest — its held index is built from THAT sample's served calls (the shipping
      // capture, under the arm's kind gate) and its liveEvidence is the sample's own leaf stamp. A frozen harvest on a held arm is still refused.
      if (heldSpec && !hsrc.startsWith(LAB_SAMPLE_PREFIX)) throw new Error(`${node.id}/${v}: harvesterSourceByVariant on a held arm — one Harvester entry, two sources`);
      const x = await architectHarvesterSource(exp, dir, node, snap, hsrc, { heldArm: !!heldSpec });
      ctx = x.ctx; harvesterSource = x.report; sourceIsPersistedText = x.sourceIsPersistedText; sampleHarvest = x.sample;
    }
    if (heldSpec && sampleHarvest) {
      const { buildLabHeldStoreFromResult, deviceLegOf: dl } = await import('./held-store');
      const { isGitFileSourceLeg } = await import('../../lib/agents/harness/held-bytes/variant');
      const store = heldStore = buildLabHeldStoreFromResult({ executionId: sampleHarvest.executionId, taskId: sampleHarvest.taskId, povId: sampleHarvest.povId,
        resultJson: JSON.stringify({ toolCalls: sampleHarvest.toolCalls }), gitFileSourceLeg: !!snap.leg && isGitFileSourceLeg(snap.leg as never), deviceLeg: dl(snap.leg as never) });
      if (exp.requireLiveEvidence && !loadLiveEvidenceComputer()) throw new Error(`${node.id}/${v}: requireLiveEvidence — lib/agents/harness/live-evidence.ts is not in this tree`);
      const fields: Record<string, unknown> = { ...labHeldIndexFields(store), ...(sampleHarvest.liveEvidence && typeof sampleHarvest.liveEvidence === 'object' ? { liveEvidence: sampleHarvest.liveEvidence } : {}) };
      asnap = heldArmBinding(snap, heldArm!).snap;
      ctx = { ...ctx!, chainedFrom: (ctx!.chainedFrom as any[]).map((e) => (e?.agentRole === 'infra_state_harvester' ? { ...e, ...fields } : e)) };
      held = { harvesterExecutionId: store.harvesterExecutionId, index: fields.heldIndex, refusals: store.refusals.map((r) => r.refusal), liveEvidence: sampleHarvest.liveEvidence ? { state: 'sample-leaf-stamp', summary: (sampleHarvest.liveEvidence as any).summary ?? null } : { state: 'none' } };
    } else if (heldSpec) {
      const store = heldStore = buildLabHeldStore(snap);
      const cmp = withComputedHarvesterComparison(snap);
      // L-CS-a: infra_change_architect ∈ LIVE_EVIDENCE_READERS — the computed stamp rides the Harvester entry (context-chainer.ts).
      const le = withComputedLiveEvidence(snap, undefined, { protocol: armComposedProtocol(exp, v, protocol) });
      if (exp.requireLiveEvidence && le.report.state === 'not-built') throw new Error(`${node.id}/${v}: requireLiveEvidence — lib/agents/harness/live-evidence.ts is not in this tree (slot S-2)`);
      // L-N2-c: the chainer carries a CHECKED comparison to the Architect on the Harvester entry (context-chainer.ts GIT_DEVICE_COMPARISON_READERS).
      const fields: Record<string, unknown> = { ...labHeldIndexFields(store), ...(cmp.fact && cmp.fact.checked === true ? { gitDeviceComparison: cmp.fact } : {}), ...(le.fact ? { liveEvidence: le.fact } : {}) };
      asnap = heldArmBinding(snap, heldArm!).snap;
      ctx = patchHeldConsumerContext(snap.author.exec as any, fields);
      held = { harvesterExecutionId: store.harvesterExecutionId, index: fields.heldIndex, gitDeviceComparison: cmp.report, liveEvidence: le.report } as any;
    }
    // NB1 blind-read fix (2026-11-07): the architect-only path applies the arm's templateEdits for its role, exactly as the normal path's
    // tplFor and the Harvester path do (it rendered the pinned template and dropped them — the derivation_architect BR-5 guidance never
    // reached the xv cells). Exactly-once: an arm edit that names this role and applies nowhere is refused.
    let archTpl = pinnedTemplate(exp, dir, snap.author.template?.id);
    const archTEdits = (spec?.templateEdits ?? []).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as EditSpec);
    if (archTEdits.length) {
      const target = `role:${ares.agentRole}`;
      const named = archTEdits.filter((e) => (e.appliesTo ?? []).includes(target));
      const r = applyEdits(archTpl ?? templateTextAsRun(snap.author), archTEdits, target);
      if (named.length && !r.applied.length) throw new Error(`${node.id}/${v}: templateEdits name ${target} but none applied to the Architect's template`);
      if (r.applied.length) archTpl = r.text;
    }
    const author = withModel(await rebuildPrompt(asnap, 'author', protocol, { templatePromptOverride: archTpl, dropTemplateDirective: !!spec?.dropTemplateDirective,
      ...(ctx ? { inputContextOverride: ctx } : {}) }), spec?.authorModel ?? null, spec?.authorEffort ?? null);
    const vd = path.join(nodeDir, v);
    fs.mkdirSync(vd, { recursive: true });
    fs.writeFileSync(path.join(vd, 'author.system.md'), author.system);
    fs.writeFileSync(path.join(vd, 'author.user.md'), author.user);
    fs.writeFileSync(path.join(vd, 'protocol.md'), protocol.text);
    if (heldStore) for (const r of heldStore.refs) {
      const h = (held!.index as Array<{ handle: string; path: string }>).find((x) => x.path === r.path)?.handle;
      if (h) fs.writeFileSync(path.join(vd, `held-base-${h}.txt`), r.content);
    }
    const fid = fidelityChecks(snap, 'author', author);
    if (harvesterSource) {
      // The replayed harvest must reach the Architect's prompt; and when its text IS the persisted harvest (e.g. a
      // `--fake-llm persisted` sample), the patched prompt must equal the frozen one byte for byte (the identity control).
      harvesterSource.inPrompt = author.user.includes(harvesterSource.probe);
      if (!harvesterSource.inPrompt) throw new Error(`${node.id}/${v}: the replayed harvest (${hsrc}) does not reach the Architect's rendered prompt`);
      if (sourceIsPersistedText) {
        const frozenPrompt = withModel(await rebuildPrompt(snap, 'author', protocol, { templatePromptOverride: pinnedTemplate(exp, dir, snap.author.template?.id), dropTemplateDirective: !!spec?.dropTemplateDirective }), spec?.authorModel ?? null, spec?.authorEffort ?? null);
        harvesterSource.reproducesFrozenPrompt = frozenPrompt.user === author.user && frozenPrompt.system === author.system;
      } else harvesterSource.reproducesFrozenPrompt = null;
      delete harvesterSource.probe;
    }
    report.variants[v] = { protocol: { name: protocol.name, version: protocol.version, source: protocol.source, sha256: sha256(protocol.text) },
      models: { author: author.model, reviewer: null, authorEffort: effortOf(author), reviewerEffort: null, authorOverridden: !!(spec?.authorModel || spec?.authorEffort), reviewerOverridden: false },
      authorPromptSha: author.hashes, reviewerSystemSha: null, authorPreambleChars: author.fact.preambleChars, persistedPreambleChars: ares.protocolInjection?.preambleChars ?? null,
      fidelityFailures: fid.filter((c) => c.ok === false && c.name !== 'protocolInjection.preambleChars' && c.name !== 'protocolInjection.delta').map((c) => `${c.name}: ${c.detail}`),
      notes: author.notes, ...(held ? { held } : {}), ...(harvesterSource ? { harvesterSource } : {}), authorOnly: true };
    jobs.push({ node, variant: v, protocol, snap, author, reviewerBase: null, reviewerTemplate: null, dropTemplateDirective: !!spec?.dropTemplateDirective, reviewerModel: null, reviewerEffort: null,
      persistedAuthor: null, requirementsFormCorrection: null, requirementsHarnessRow: null, checkAt: null, stored: null, held: null, authorOnly: true, architectOnly: true, constraintsBound });
  }
  return { jobs, report };
}

/** L-8: ONE Architect sample — the shipping loop with stub tools (an Architect has no stack contact), output saved for scoring. */
async function runArchitectSample(job: Job, i: number, sd: string, sample: Record<string, any>, apiKey: string, fake: boolean, onCall?: (c: any) => void): Promise<number> {
  const { runLive, fakeGenerateText } = await import('./live');
  const ares = parsedResult(job.snap.author)!;
  const a = await runLive(job.author, { executionId: `lab-${job.node.id}-${job.variant}-${i}-x`, taskId: job.snap.author.task.id, taskType: job.snap.author.task.type, apiKey,
    generateTextOverride: fake ? fakeGenerateText(ares.finalResponse, job.snap.author.exec.modelUsed) : undefined, onCall });
  fs.writeFileSync(path.join(sd, 'author.md'), a.finalResponse);
  // VALUE-LEG-GIT L-VLG-c (GOLDEN-VALUE-LIVE): a Derivation Architect sample gets the containment fact production stamps at its persist.
  if ((job.snap.author.task as Record<string, any>).agentRole === 'derivation_architect') {
    const { valueArchitectContainment, containmentLine } = await import('./value-lane');
    const c = await valueArchitectContainment(job.snap, a.finalResponse, `lab-${job.node.id}-${job.variant}-${i}-x`);
    sample.derivationContainment = c.fact; sample.derivationContainmentError = c.error;
    console.log(`   · ${job.node.id} ${job.variant} #${i} · containment ${containmentLine(c.fact)}${c.error ? ` · ERROR ${c.error}` : ''}`);
  }
  Object.assign(sample, { architectOnly: true, author: { confidence: a.confidenceScore, stopReason: a.finalStopReason, turns: a.turns, toolCalls: a.toolCalls, chars: a.finalResponse.length, durationMs: a.durationMs },
    calls: a.calls.map((c) => ({ role: 'architect', ...c })), costUsd: a.costUsd });
  console.log(`   · ${job.node.id} ${job.variant} #${i} · architect ${a.finalResponse.length} chars · $${a.costUsd.toFixed(3)}`);
  return a.costUsd;
}

async function runHarvesterSample(job: Job, i: number, sd: string, sample: Record<string, any>, apiKey: string, fake: boolean, onCall?: (c: any) => void): Promise<number> {
  const { runLive, fakeGenerateText, fakeReplayToolCalls, TOOL_STUB_RESULT } = await import('./live');
  const ares = parsedResult(job.snap.author)!;
  const recorded = job.stored ? createRecordedToolServer(job.stored, TOOL_STUB_RESULT) : null;
  // L-K-a: a file fixture answers the node's github-service reads; every other call goes to the recorded tier (or the stub).
  // L-N1: the network tiers (device pool / catalogue / register refusal) sit between the recorded tier and the Git fixture.
  const networkServer = job.network ? createNetworkToolServer(job.network, recorded, TOOL_STUB_RESULT) : null;
  const fixtureServer = job.fixture ? createFixtureToolServer(job.fixture, networkServer ?? recorded, TOOL_STUB_RESULT) : null;
  const server = fixtureServer ?? networkServer ?? recorded;
  const gen = fake ? (job.stored ? fakeReplayToolCalls(ares.toolCalls ?? [], ares.finalResponse, job.snap.author.exec.modelUsed) : fakeGenerateText(ares.finalResponse, job.snap.author.exec.modelUsed)) : undefined;
  const hId = `lab-${job.node.id}-${job.variant}-${i}-h`;
  const a = await runLive(job.author, { executionId: hId, taskId: job.snap.author.task.id, taskType: job.snap.author.task.type, apiKey, toolServer: server, generateTextOverride: gen, onCall });
  const toolCalls = (buildExecutionResultJson({
    taskId: job.snap.author.task.id, taskTitle: 'lab', agentRole: job.author.role, modelUsed: job.author.model, finalResponse: a.finalResponse, confidenceScore: a.confidenceScore,
    turnCount: a.turns, maxToolTurns: job.author.maxToolTurns, toolCallResults: a.toolCallRecords as any, successfulToolCalls: a.toolCallRecords.filter((t) => t.success).length,
    failedToolCalls: a.toolCallRecords.filter((t) => !t.success).length, executionTime: a.durationMs, tokensUsed: 0, correctionTurnUsed: a.correctionTurnUsed,
    // held-k8s 1k: a record over 50,000 JSON chars (a large fixture file — hub N-5) makes the builder LOG its preview cut; without a
    // logger that threw, so a Harvester sample reading a realistic large manifest would have errored instead of persisting.
    logger: LAB_PERSIST_LOGGER,
  } as any).toolCalls ?? []) as Array<Record<string, any>>;
  const leaf = await runAuthorLeafNets(job.snap, job.author.role, a.finalResponse, hId, toolCalls, undefined, job.armProtocolInjection, { legReads: isValueLaneNode(job.node) });
  const report = recorded ? recordedToolsReport(recorded.log, job.stored!) : null;
  const fixtureReport = fixtureServer ? fixtureToolsReport(fixtureServer.fixtureLog) : null;
  const networkReport = networkServer ? networkToolsReport(networkServer.netLog) : null;
  // Bytes check: served entries are matched to the loop records in call order (one log entry per executeToolOnServer call;
  // read_more never reaches the server, so it is skipped on the record side).
  const recs = (a.toolCallRecords as Array<Record<string, any>>).filter((t) => t.tool !== 'read_more');
  const bytes = { served: 0, identical: 0, r9Compared: 0, r9Equal: 0, mismatches: [] as string[] };
  if (recorded) recorded.log.forEach((e, k) => {
    if (e.storedIndex === null || e.tier === 'unserved-truncated') return;
    const st = job.stored![e.storedIndex]; const rec = recs[k];
    if (!st.success) return;
    bytes.served++;
    if (rec && JSON.stringify(rec.result) === JSON.stringify(st.result)) bytes.identical++; else bytes.mismatches.push(`call ${k} ← stored ${e.storedIndex}: result differs`);
    const prodRec = (ares.toolCalls ?? [])[e.storedIndex];
    if (rec && typeof prodRec?.rewritten === 'boolean') {
      bytes.r9Compared++;
      if (rec.rewritten === prodRec.rewritten && JSON.stringify(rec.rewriteClasses ?? []) === JSON.stringify(prodRec.rewriteClasses ?? [])
        && rec.resultTruncatedForLlm === prodRec.resultTruncatedForLlm && rec.resultChars === prodRec.resultChars) bytes.r9Equal++;
      else bytes.mismatches.push(`call ${k} ← stored ${e.storedIndex}: R9/LLM-cap facts differ (rewritten ${rec.rewritten}/${prodRec.rewritten}, chars ${rec.resultChars}/${prodRec.resultChars})`);
    }
  });
  const score = scoreHarvesterQuotes(a.finalResponse, toolCalls);
  const qf = (leaf.stamped.quoteFidelity ?? null) as Record<string, any> | null;
  const prodChars = ares.finalResponse.length;
  fs.writeFileSync(path.join(sd, 'harvester.md'), a.finalResponse);
  fs.writeFileSync(path.join(sd, 'toolCalls.json'), JSON.stringify(toolCalls, null, 2));
  Object.assign(sample, {
    harvesterOnly: true,
    // A sample counts only when its recorded tier (≥ 90% of file reads) AND its fixture tier (100% of repo reads) served it.
    valid: report || fixtureReport || networkReport ? (report?.valid ?? true) && (fixtureReport?.valid ?? true) && (networkReport?.valid ?? true) : null,
    fixtureTools: fixtureReport ? { ...fixtureReport, digest: job.fixture!.digest } : null,
    networkTools: networkReport,
    recordedTools: report ? { ...report, log: report.log.map((e) => `${e.tool}${e.innerTool ? `.${e.innerTool}` : e.action ? `.${e.action}` : ''}:${e.tier}${e.storedIndex !== null ? `@${e.storedIndex}` : ''}`) } : null,
    servedBytes: recorded ? bytes : null,
    quoteFidelity: qf, quoteScore: score,
    overLength: { chars: a.finalResponse.length, productionChars: prodChars, overTwiceProduction: a.finalResponse.length > 2 * prodChars, maxTokensStop: a.finalStopReason === 'max_tokens' },
    leafFacts: summarizeFacts(leaf.stamped), leafNetErrors: leaf.errors,
    // VALUE-LEG-GIT: the shipping device facts over this sample's calls (value lane: the leg row read through replay-prisma legReads).
    ...(isValueLaneNode(job.node) ? { deviceFacts: { deviceSourceReads: leaf.stamped.deviceSourceReads ?? null, gitDeviceComparison: leaf.stamped.gitDeviceComparison ?? null, liveEvidence: leaf.stamped.liveEvidence ?? null } } : {}),
    author: { confidence: a.confidenceScore, stopReason: a.finalStopReason, turns: a.turns, toolCalls: a.toolCalls, diagnosticRetryUsed: a.diagnosticRetryUsed, chars: a.finalResponse.length, durationMs: a.durationMs },
    calls: a.calls.map((c) => ({ role: 'harvester', ...c })),
    costUsd: a.costUsd,
  });
  const qfs = qf ? `${qf.reason}` : 'no fact';
  console.log(`   ${score.faithful ? '✅' : '⚠️'} ${job.node.id} ${job.variant} #${i} · quoteFidelity ${qfs} · file blocks ${score.fileBlocksStrictClean}/${score.fileBlocks} strict-clean · edited ${score.editedLines} · prom ${score.prometheusBlocks} (verbatim ${score.prometheusVerbatimLabelled})${report ? ` · tools ${report.fileServed}/${report.fileCalls} file served${report.valid ? '' : ' — INVALID'}` : ''}${fixtureReport ? ` · repo reads ${fixtureReport.served}/${fixtureReport.calls} served by the fixture${fixtureReport.valid ? '' : ' — INVALID'}` : ''}${recorded ? ` · bytes ${bytes.identical}/${bytes.served}` : ''} · $${a.costUsd.toFixed(3)}`);
  return a.costUsd;
}

// ───────────────────────────── summary ─────────────────────────────

function summarize(out: string, measures?: Measure[]) {
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  const rows: Array<Record<string, any>> = [];
  for (const node of Object.keys(manifest.nodes)) {
    const nd = path.join(out, node);
    for (const v of fs.readdirSync(nd).filter((d) => fs.statSync(path.join(nd, d)).isDirectory())) {
      const samples = fs.readdirSync(path.join(nd, v)).filter((d) => d.startsWith('sample-'))
        .map((d) => ({ dir: path.join(nd, v, d), s: JSON.parse(fs.readFileSync(path.join(nd, v, d, 'sample.json'), 'utf8')) }));
      if (!samples.length) continue;
      const ok = samples.filter((x) => !x.s.error);
      const refused = ok.filter((x) => x.s.verdict?.approved === false);
      const approved = ok.filter((x) => x.s.verdict?.approved === true);
      const noVerdict = ok.filter((x) => !x.s.verdict);
      if (refused.length + approved.length + noVerdict.length !== ok.length) throw new Error(`${node}/${v}: verdict buckets do not sum`);
      const groups: Record<string, number> = {};
      let items = 0;
      for (const x of refused) for (const b of x.s.verdict.blocking) { groups[groupOf(b)] = (groups[groupOf(b)] ?? 0) + 1; items++; }
      if (Object.values(groups).reduce((a, b) => a + b, 0) !== items) throw new Error(`${node}/${v}: blocking groups do not sum`);
      const verbatim = refused.flatMap((x) => x.s.verdict.blocking.map((b: string) => `${path.basename(x.dir)} [${groupOf(b)}] ${b}`));
      const meas: Record<string, string> = {};
      for (const m of Object.keys(ok[0]?.s.measures ?? {})) {
        const vals = ok.map((x) => x.s.measures[m] as number);
        meas[m] = `${vals.filter((x) => x > 0).length}/${vals.length} (Σ${vals.reduce((a, b) => a + b, 0)})`;
      }
      const facts: Record<string, Record<string, number>> = {};
      for (const x of ok) for (const [k, val] of Object.entries<string>({ ...(x.s.leafFacts ?? {}), ...Object.fromEntries(Object.entries(x.s.legFacts ?? {}).map(([kk, vv]) => [`leg.${kk}`, vv])) })) {
        facts[k] = facts[k] ?? {}; facts[k][val] = (facts[k][val] ?? 0) + 1;
      }
      const toolAsks = ok.reduce((s, x) => s + (x.s.author?.toolCalls?.length ?? 0) + (x.s.reviewer?.toolCalls?.length ?? 0), 0);
      const tok = ok.flatMap((x) => x.s.calls ?? []).reduce((a: any, c: any) => ({ in: a.in + c.inputTokens + c.cacheReadTokens + c.cacheCreationTokens, out: a.out + c.outputTokens }), { in: 0, out: 0 });
      const fid = ok.map((x) => x.s.tokenFidelity).filter((t) => t?.comparable && t.persistedSingleCallInput && t.replayFirstCallInput);
      // L0e: per-cell warning measures (samples named so each count can be READ; lexical proxies are flagged as such).
      const wmOf = (x: any) => x.s.warningMeasures ?? null;
      const withWm = ok.filter((x) => wmOf(x));
      const names = (f: (x: any) => boolean) => withWm.filter(f).map((x) => path.basename(x.dir));
      const sum = (f: (x: any) => number) => withWm.reduce((acc, x) => acc + (f(x) || 0), 0);
      const warn = withWm.length ? {
        samples: withWm.length,
        approvedWithRestatedTranscribed: names((x) => x.s.verdict?.approved === true && wmOf(x).restatedTranscribed >= 1).length,
        restatedLabelSamples: names((x) => wmOf(x).restatedLabel > 0).length, restatedLabelSum: sum((x) => wmOf(x).restatedLabel),
        restatedTranscribedSum: sum((x) => wmOf(x).restatedTranscribed),
        reachLabelSamples: names((x) => wmOf(x).reachLabel > 0).length, reachChainPass: names((x) => x.s.reachChainPass === true).length,
        labelInBlockingSum: sum((x) => wmOf(x).labelInBlocking), negatedLabelSum: sum((x) => wmOf(x).negatedLabel),
        untranscribedLabelLinesSum: sum((x) => wmOf(x).untranscribedLabelLines ?? 0),
        ownEnumerationSamples: names((x) => wmOf(x).ownEnumeration > 0).length,
        attributesToPackage: sum((x) => (wmOf(x).attribution ?? []).filter((a: any) => a.attribution === 'attributes-to-package').length),
        unattributed: sum((x) => (wmOf(x).attribution ?? []).filter((a: any) => a.attribution === 'unattributed').length),
        refusedOnlyRestatement_READ: names((x) => wmOf(x).blockingOnlyRestatement),
        refusedNamingMissingStep_READ: names((x) => x.s.verdict?.approved === false && wmOf(x).blockingNamesMissingStep),
        refusedSelfGradeWords_READ: names((x) => x.s.verdict?.approved === false && wmOf(x).blockingSelfGradeWords),
        otherIds: [...new Set(withWm.flatMap((x) => wmOf(x).otherTranscribed ?? []))],
        legFactComputed: names((x) => x.s.legReviewerWarnings && !x.s.legReviewerWarningsError && x.s.legReviewerWarnings.reason !== 'enrichment-error').length,
      } : null;
      rows.push({
        node, variant: v, kind: manifest.nodes[node].kind, n: samples.length, errors: samples.length - ok.length,
        refused: refused.length, approved: approved.length, noVerdict: noVerdict.length, groups, measures: meas, facts, toolAsks,
        tokensIn: tok.in, tokensOut: tok.out, costUsd: ok.reduce((s, x) => s + (x.s.costUsd ?? 0), 0),
        tokenFidelity: fid.map((t) => `${t.replayFirstCallInput - t.persistedSingleCallInput >= 0 ? '+' : ''}${t.replayFirstCallInput - t.persistedSingleCallInput}`).join(','),
        diffThisFirst: refused[0] ? path.relative(out, refused[0].dir) : null, verbatim, warn,
      });
    }
  }
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(rows, null, 2));
  // OLD vs NEW at a glance: one row per node, one column per variant (refused / samples with a verdict).
  const vnames = [...new Set(rows.map((r) => r.variant))];
  const pivot = [`| node | kind | persisted | ${vnames.join(' | ')} |`, `|---|---|---|${vnames.map(() => '---').join('|')}|`];
  for (const node of [...new Set(rows.map((r) => r.node))]) {
    const p = manifest.nodes[node].persisted.approved;
    pivot.push(`| ${node} | ${manifest.nodes[node].kind} | ${p === true ? 'approved' : p === false ? 'REFUSED' : '—'} | ${vnames.map((v) => {
      const r = rows.find((x) => x.node === node && x.variant === v);
      return r ? `${r.refused} / ${r.n - r.errors - r.noVerdict}${r.noVerdict ? ` (+${r.noVerdict} no verdict)` : ''}${r.errors ? ` (+${r.errors} err)` : ''}` : '—';
    }).join(' | ')} |`);
  }
  const md: string[] = [`# Leg replay lab — ${manifest.label}`, '', `code ${manifest.code.head.slice(0, 12)} · dirty ${Object.keys(manifest.code.dirty).length} · flags ${JSON.stringify(manifest.flags)} · spent $${(manifest.spentUsd ?? 0).toFixed(2)}${manifest.codeChangedDuringRun ? ' · ⚠️ CODE CHANGED DURING RUN' : ''}`, '',
    '## Refusals: old vs new (refused / samples with a parsed verdict)', '', ...pivot, '', '## Per node × variant', '',
    '| node | kind | variant | refused / n | no verdict | errors | blocking groups (lab heuristic) | tool asks | tokens in/out | $ | first-call token Δ vs persisted | diff first |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) md.push(`| ${r.node} | ${r.kind} | ${r.variant} | **${r.refused} / ${r.n - r.errors}** | ${r.noVerdict} | ${r.errors} | ${Object.entries(r.groups).map(([g, c]) => `${g} ${c}`).join(', ') || '—'} | ${r.toolAsks} | ${r.tokensIn}/${r.tokensOut} | ${r.costUsd.toFixed(2)} | ${r.tokenFidelity || '—'} | ${r.diffThisFirst ?? '—'} |`);
  md.push('', '## Measures (samples with a non-zero count / samples, Σ count)', '', `| node | variant | ${rows[0] ? Object.keys(rows[0].measures).join(' | ') : ''} |`, `|---|---|${rows[0] ? Object.keys(rows[0].measures).map(() => '---').join('|') : ''}|`);
  for (const r of rows) md.push(`| ${r.node} | ${r.variant} | ${Object.values(r.measures).join(' | ')} |`);
  if (rows.some((r) => r.warn)) {
    md.push('', '## Reviewer warnings (L0e — counts over samples; lexical proxies marked _READ are lists to read, never results)', '',
      '| node | variant | approved / n | approved + restated transcribed | restatedLabel (samples, Σ) | reachLabel samples | P-REACH chain pass | labelInBlocking Σ | negatedLabel Σ | untranscribed Σ | ownEnumeration samples | D7 attributes / unattributed (hand read) | refused, only restatement | refused, names missing step | refused, self-grade words | other ids | leg fact computed |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rows) if (r.warn) {
      const w = r.warn;
      md.push(`| ${r.node} | ${r.variant} | ${r.approved} / ${r.n - r.errors} | ${w.approvedWithRestatedTranscribed} | ${w.restatedLabelSamples}, Σ${w.restatedLabelSum} | ${w.reachLabelSamples} | ${w.reachChainPass} | ${w.labelInBlockingSum} | ${w.negatedLabelSum} | ${w.untranscribedLabelLinesSum} | ${w.ownEnumerationSamples} | ${w.attributesToPackage} / ${w.unattributed} | ${w.refusedOnlyRestatement_READ.join(' ') || '—'} | ${w.refusedNamingMissingStep_READ.join(' ') || '—'} | ${w.refusedSelfGradeWords_READ.join(' ') || '—'} | ${w.otherIds.join(' ') || '—'} | ${w.legFactComputed}/${w.samples} |`);
    }
  }
  // Harvester nodes (2026-10-13): quote score per cell. VALID samples only in the score columns; invalid ones are counted.
  const hv: string[] = [];
  for (const node of Object.keys(manifest.nodes).filter((k) => manifest.nodes[k].harvesterOnly)) {
    const nd = path.join(out, node);
    for (const v of fs.readdirSync(nd).filter((d) => fs.statSync(path.join(nd, d)).isDirectory())) {
      const ss = fs.readdirSync(path.join(nd, v)).filter((d) => d.startsWith('sample-')).map((d) => ({ name: d, s: JSON.parse(fs.readFileSync(path.join(nd, v, d, 'sample.json'), 'utf8')) }));
      if (!ss.length) continue;
      const ok = ss.filter((x) => !x.s.error);
      const valid = ok.filter((x) => x.s.valid !== false);
      const q = (f: (x: any) => boolean) => valid.filter((x) => f(x.s)).map((x) => x.name);
      const reasons: Record<string, number> = {};
      for (const x of valid) { const r = x.s.quoteFidelity?.reason ?? 'none'; reasons[r] = (reasons[r] ?? 0) + 1; }
      const bytes = ok.reduce((a, x) => ({ served: a.served + (x.s.servedBytes?.served ?? 0), identical: a.identical + (x.s.servedBytes?.identical ?? 0), r9c: a.r9c + (x.s.servedBytes?.r9Compared ?? 0), r9e: a.r9e + (x.s.servedBytes?.r9Equal ?? 0) }), { served: 0, identical: 0, r9c: 0, r9e: 0 });
      const tiers: Record<string, number> = {};
      for (const x of ok) for (const [t, c] of Object.entries<number>(x.s.recordedTools?.tiers ?? {})) tiers[t] = (tiers[t] ?? 0) + c;
      const list = (xs: string[]) => `${xs.length}${xs.length ? ` (${xs.join(' ')})` : ''}`;
      hv.push(`| ${node} | ${v} | ${ss.length} | ${ss.length - ok.length} | ${ok.length - valid.length} | ${list(q((s) => s.quoteScore?.faithful))} | ${Object.entries(reasons).map(([r, c]) => `${r} ${c}`).join(', ')} | ${list(q((s) => (s.quoteScore?.editedLines ?? 0) > 0))} | ${list(q((s) => (s.quoteScore?.addedInVerbatimFile ?? 0) > 0))} | ${list(q((s) => (s.quoteScore?.markerHeadings ?? 0) > 0))} | ${list(q((s) => s.overLength?.overTwiceProduction || s.overLength?.maxTokensStop))} | ${list(q((s) => (s.quoteScore?.prometheusVerbatimLabelled ?? 0) > 0))} | ${list(q((s) => (s.quoteScore?.prometheusChangedLines ?? 0) > 0))} | ${list(q((s) => (s.quoteScore?.verbatimLabelledExcerpts ?? 0) > 0))} | ${bytes.identical}/${bytes.served} · R9 ${bytes.r9e}/${bytes.r9c} | ${Object.entries(tiers).map(([t, c]) => `${t} ${c}`).join(', ') || '—'} |`);
    }
  }
  if (hv.length) md.push('', '## Harvester quote score (score columns over VALID samples; each count names its samples — READ them)', '',
    '| node | variant | n | errors | invalid (<90% file calls served) | faithful (strict, ≥1 file block) | quoteFidelity reason | edited line | added in verbatim file block | marker heading | over 2× / max_tokens | prometheus labelled verbatim | prometheus edited | verbatim-labelled excerpt | served bytes identical · R9 facts equal | tool tiers |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|', ...hv);
  md.push('', '## Blocking items, verbatim (the groups above are a lab heuristic — these are the evidence)', '');
  for (const r of rows) if (r.verbatim.length) { md.push(`### ${r.node} ${r.variant}`, ''); for (const b of r.verbatim) md.push(`- ${b.replace(/\n/g, ' ')}`); md.push(''); }
  md.push('', '## Net facts (value → samples)', '');
  for (const r of rows) md.push(`- **${r.node} ${r.variant}**: ${Object.entries(r.facts).map(([k, m]) => `${k} {${Object.entries(m as Record<string, number>).map(([vv, c]) => `${vv}: ${c}`).join('; ')}}`).join(' · ')}`);
  if (measures) md.push('', '## Measure definitions', '', ...measures.map((m) => `- \`${m.name}\` — ${m.why ?? ''}`));
  fs.writeFileSync(path.join(out, 'summary.md'), md.join('\n') + '\n');
  console.log('\n' + md.slice(0, 6 + pivot.length).join('\n'));
  console.log(`\n📄 ${path.relative(REPO, path.join(out, 'summary.md'))} · per-sample outputs under each node/variant/sample-NN`);
}

// ───────────────────────────── fidelity ─────────────────────────────

async function fidelity(args: Args): Promise<number> {
  const ids: string[] = args.experiment ? loadExperiment(path.resolve(args.experiment)).nodes.map((x) => x.authorExecutionId) : (args.nodes ?? []);
  const exp = args.experiment ? loadExperiment(path.resolve(args.experiment)) : null;
  let failures = 0;
  for (const id of ids) {
    const snap = loadSnapshot(id);
    let protocol: ProtocolText;
    try { protocol = protocolFor(exp ?? ({ baseline: { protocols: {} } } as any), args.experiment ? path.resolve(args.experiment) : '', snap, 'historical'); }
    catch (e) { console.log(`· ${id}: text it ran under is not recoverable — ${(e as Error).message}`); continue; }
    // B9 (2026-11-07): a Harvester node's snapshot `reviewer` is its LEG's Reviewer, which composes another protocol (a value leg's
    // derivation_reviewer reads network-derivation while its Harvester composes network-provisioning) — rebuild the Harvester only.
    const harvesterNode = /harvester$/.test(String(parsedResult(snap.author)?.agentRole ?? ''));
    if (harvesterNode) console.log(`· ${id} reviewer  skipped — a Harvester node; its leg Reviewer reads another protocol (fidelity it through its own node)`);
    for (const which of (harvesterNode ? ['author'] : ['author', 'reviewer']) as Array<'author' | 'reviewer'>) {
      const r = await rebuildPrompt(snap, which, protocol);
      const checks = fidelityChecks(snap, which, r);
      const bad = checks.filter((c) => c.ok === false && !c.name.startsWith('template.') && !c.name.startsWith('inputContext.'));
      failures += bad.length;
      console.log(`${bad.length ? '✗' : '✓'} ${id} ${which.padEnd(8)} ${protocol.source} · ${checks.filter((c) => c.ok === true).length} exact, ${checks.filter((c) => c.ok === null).length} not checkable` +
        `${bad.length ? ` · FAIL ${bad.map((c) => `${c.name} (${c.detail})`).join('; ')}` : ''}`);
      for (const c of checks.filter((x) => x.ok === false && (x.name.startsWith('template.') || x.name.startsWith('inputContext.')))) console.log(`     ⚠️ ${c.name}: ${c.detail}`);
    }
  }
  return failures;
}

// ───────────────────────────── snapshot (prefetch + one line per node, $0, read-only) ─────────────────────────────

/** L-CS-N: `--source local-db:<lab_db>` (+ `--dump <file>` for the sha, `--note`) — a self-host snapshot from a LOCAL restored dump. */
function snapshotSourceOf(args: Args): import('./snapshot').SnapshotSource {
  if (!args.source || args.source === 'prod') return { kind: 'prod' };
  const m = /^local-db:([a-z0-9_]+)$/.exec(args.source);
  if (!m) throw new Error(`--source must be prod or local-db:<lab_db> (got ${args.source})`);
  const dumpPath = args.dump ? path.resolve(args.dump) : null;
  const dumpSha256 = dumpPath ? require('crypto').createHash('sha256').update(fs.readFileSync(dumpPath)).digest('hex') : null;
  return { kind: 'local-db', db: m[1], dumpPath, dumpSha256, note: args.note };
}
/** L-CS-N: every node's cached snapshot provenance agrees with the node's declaration (a self-host row never stands in silently). */
export function provenanceRefusals(nodes: Array<Pick<NodeSpec, 'id' | 'authorExecutionId' | 'provenance'>>, load: (id: string) => Snapshot): string[] {
  const out: string[] = [];
  for (const nd of nodes) {
    const got = load(nd.authorExecutionId).provenance?.kind ?? null;
    const want = nd.provenance ?? null;
    if (got !== want) out.push(`${nd.id}: node declares provenance ${want ?? 'production'} but its cached snapshot is ${got ?? 'production'}`);
  }
  return out;
}

/** L-CS-N (ME-B3/F14): `provenance-check --experiment <dir> --source local-db:<lab_db>` — every self-host node's install ran the lab's
 *  pinned protocol/template texts and the production model tiers, and its persisted verdict reproduces. $0; reads the LOCAL db only. */
async function provenanceCheck(args: Args): Promise<number> {
  const dir = path.resolve(args.experiment!);
  const exp = loadExperiment(dir);
  const src = snapshotSourceOf(args);
  if (src.kind !== 'local-db') throw new Error('provenance-check needs --source local-db:<lab_db> (the restored self-host dump)');
  const { runReadOnlySqlLocal } = await import('./snapshot');
  const { selfHostProvenanceChecks } = await import('./self-host-provenance');
  const g = (await import('./golden-set')).loadGoldenSet() as any;
  const pins = { protocols: {} as Record<string, { version: string; sha256: string }>, templates: {} as Record<string, { role: string; sha256: string }> };
  for (const [k, v] of Object.entries<any>(g.pins?.protocols ?? {})) pins.protocols[k] = { version: v.version, sha256: v.sha256 };
  for (const [k, v] of Object.entries<any>(exp.baseline.protocols ?? {})) pins.protocols[k] = { version: v.version, sha256: v.sha256 };
  for (const v of Object.values<any>(g.pins?.templates ?? {})) pins.templates[v.name] ??= { role: v.role, sha256: v.sha256 };
  for (const v of Object.values<any>(exp.baseline.templates ?? {})) pins.templates[v.name] = { role: v.role, sha256: v.sha256 };
  const rows = runReadOnlySqlLocal(src.db, `SELECT row_to_json(t) FROM (SELECT name, version, encode(sha256(convert_to("promptText", 'UTF8')), 'hex') AS sha256 FROM agent_prompt_library) t;`)
    .split('\n').filter((l) => l.trim().startsWith('{')).map((l) => JSON.parse(l));
  let bad = 0;
  for (const nd of exp.nodes.filter((x) => x.provenance === 'self-host')) {
    const snap = loadSnapshot(nd.authorExecutionId);
    const checks = selfHostProvenanceChecks(snap, rows, pins, nd.provenanceExpect);
    for (const c of checks) { if (!c.ok) bad++; console.log(`   ${c.ok ? '✅' : '❌'} ${nd.id} ${c.name}: ${c.detail}`); }
  }
  console.log(bad ? `\n❌ PROVENANCE: ${bad} check(s) failed — those nodes are VOID` : '\n✅ PROVENANCE: every self-host node ran the lab-pinned instrument');
  return bad ? 1 : 0;
}

function snapshotInfo(args: Args) {
  const ids: string[] = args.experiment ? [...new Set(loadExperiment(path.resolve(args.experiment)).nodes.map((x) => x.authorExecutionId))] : (args.nodes ?? []);
  const source = snapshotSourceOf(args);
  for (const id of ids) {
    const s = loadSnapshot(id, { refresh: !!args.refresh, source });
    const a = parsedResult(s.author); const r = parsedResult(s.reviewer);
    console.log(`${id} ${a?.protocolInjection?.delta?.name ?? '?'}@${a?.protocolInjection?.delta?.version ?? '?'} · started ${s.author.exec.startTime}`
      + ` · reviewer ${s.reviewer?.exec.id ?? '—'} (${s.reviewer?.template?.name ?? '?'} ${s.reviewer?.template?.id ?? ''})`
      + ` · persisted ${r?.reviewerVerdict ? (r.reviewerVerdict.approved ? 'APPROVED' : 'REFUSED') : '—'} · leg ${s.leg?.id ?? '—'} ${s.leg?.metadata?.protocol ?? ''}`
      + (s.provenance ? ` · provenance ${s.provenance.kind} (${s.provenance.source}${s.provenance.dumpSha256 ? `, dump ${s.provenance.dumpSha256.slice(0, 12)}` : ''})` : ''));
  }
}

// ───────────────────────────── CLI ─────────────────────────────

interface Args { source?: string; dump?: string; note?: string; refresh?: boolean; cmd: string; experiment?: string; node?: string; nodes?: string[]; protocolText?: string; spend?: boolean; fakeLlm?: string; n?: number; only?: string[]; variants?: string[]; out?: string; maxUsd?: number; concurrency?: number; refreshBaseline?: boolean; run?: string; noWarmFirst?: boolean; batch?: boolean }
function parseArgs(argv: string[]): Args {
  const a: Args = { cmd: argv[0] ?? 'help' };
  const val = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  a.source = val('--source'); a.dump = val('--dump'); a.note = val('--note');
  a.experiment = val('--experiment'); a.node = val('--node'); a.protocolText = val('--protocol-text'); a.out = val('--out'); a.run = val('--run');
  a.spend = argv.includes('--spend'); a.fakeLlm = val('--fake-llm'); a.refreshBaseline = argv.includes('--refresh-baseline'); a.refresh = argv.includes('--refresh');
  if (val('--n')) a.n = Number(val('--n'));
  if (val('--max-usd')) a.maxUsd = Number(val('--max-usd'));
  if (val('--concurrency')) a.concurrency = Number(val('--concurrency'));
  if (argv.includes('--no-warm-first')) a.noWarmFirst = true;
  if (argv.includes('--batch')) a.batch = true;
  if (val('--only')) a.only = val('--only')!.split(',');
  if (val('--variants')) a.variants = val('--variants')!.split(',');
  if (val('--nodes')) a.nodes = val('--nodes')!.split(',');
  return a;
}

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    if (args.cmd === 'build-candidates') return buildCandidates(path.resolve(args.experiment!), !!args.refreshBaseline);
    if (args.cmd === 'fidelity') { const f = await fidelity(args); process.exit(f ? 1 : 0); }
    if (args.cmd === 'run') return run(args);
    if (args.cmd === 'summarize') return summarize(path.resolve(args.run!));
    if (args.cmd === 'snapshot') return snapshotInfo(args);
    if (args.cmd === 'provenance-check') { process.exitCode = await provenanceCheck(args); return; }
    if (args.cmd === 'standing-self-test') {
      const sb = await import('./standing-bench');
      const rows = sb.standingBenchSelfTest((id) => loadSnapshot(id));
      const gates = sb.standingGateSelfTest();
      for (const r of [...rows, ...gates]) console.log(`   ${r.ok ? '✅' : '❌'} ${r.id}: ${r.detail}`);
      process.exitCode = [...rows, ...gates].every((r) => r.ok) ? 0 : 1; return;
    }
    if (args.cmd === 'golden-pin') {
      const moved = (await import('./golden-set')).pinGolden();
      console.log(moved.length ? `golden-pin: moved —\n  ${moved.join('\n  ')}\n(an owner re-freeze: record it in the register before any lab uses it)` : 'golden-pin: every pin equals production');
      return;
    }
    if (args.cmd === 'golden-build') {
      const { dir, report } = (await import('./golden-set')).buildGoldenCompanion(path.resolve(args.experiment!));
      console.log(`🥇 golden companion → ${path.relative(REPO, dir)}: ${report.cells.length} cell(s) [${report.cells.map((c) => `${c.case}:${c.cell}`).join(', ')}]`);
      if (report.unreached.length) console.log(`   unreached (today's production text, $0): ${report.unreached.map((u) => `${u.case}×${u.arm}`).join(', ')}`);
      if (report.optedOut.length) console.log(`   opted out by pre-registration: ${report.optedOut.join(', ')}`);
      if (report.targets.length) console.log(`   targets (a flip is the intended change): ${report.targets.join(', ')}`);
      console.log(`   next: run --experiment ${path.relative(REPO, dir)} (dry) · --fake-llm persisted ($0) · --spend --max-usd <cap>; then golden-score`);
      return;
    }
    if (args.cmd === 'golden-score') {
      const g = await import('./golden-set');
      const r = g.scoreGolden(args.run!.split(',').map((x) => path.resolve(x)), path.resolve(args.experiment!), (c) => { const sn = loadSnapshot(c.authorExecutionId); return { qualityGate: sn.leg?.metadata?.qualityGate ?? null, editApplication: parsedResult(sn.author)?.editApplication ?? null, authorText: (parsedResult(sn.author)?.finalResponse as string | undefined) ?? null }; });
      g.printGoldenScore(r);
      // B12: the standing nodes golden-build carried (read by each case's gate; a miss is do-not-ship, a missing sample incomplete).
      const sbs = (await import('./standing-bench')).scoreStandingInRuns(args.run!.split(',').map((x) => path.resolve(x)), JSON.parse(fs.readFileSync(path.join(path.resolve(args.experiment!), 'experiment.json'), 'utf8')));
      for (const row of sbs.rows) console.log(`   ${row.met ? '✅' : '❌'} STANDING ${row.case} ${row.sample}: ${row.why}`);
      if (sbs.doNotShip.length) console.log(`\n❌ STANDING: DO-NOT-SHIP —\n  - ${sbs.doNotShip.join('\n  - ')}`);
      if (sbs.incomplete.length) console.log(`\n⚠️ STANDING: INCOMPLETE —\n  - ${sbs.incomplete.join('\n  - ')}`);
      process.exit(r.verdict.verdict === 'PASS' && !sbs.doNotShip.length && !sbs.incomplete.length ? 0 : 1);
    }
    if (args.cmd === 'golden-self-test') {
      const g = await import('./golden-set');
      const rows = g.goldenStoredSelfTest((id) => loadSnapshot(id));
      for (const r of rows) console.log(`   ${r.ok ? '✅' : '❌'} ${r.case}: ${r.detail}`);
      const bad = rows.filter((r) => !r.ok).length;
      console.log(bad ? `❌ golden self-test: ${bad} case(s) do not recompute their stored outcome` : `✅ golden self-test: all ${rows.length} cases recompute their stored outcome`);
      process.exit(bad ? 1 : 0);
    }
    if (args.cmd === 'n2-self-test') {
      const { n2SelfTest, N2_MUTATIONS } = await import('./score-n2');
      const r = n2SelfTest();
      const caught = N2_MUTATIONS.filter((m) => !n2SelfTest({ mutate: m }).ok);
      if (!r.ok || caught.length !== N2_MUTATIONS.length) { console.log(`❌ n2-self-test: ${r.failures.join('; ')} · mutations caught ${caught.length}/${N2_MUTATIONS.length}`); process.exit(1); }
      console.log(`✅ n2-self-test: the L-N2 scorer reads every case as pre-registered; ${caught.length}/${N2_MUTATIONS.length} mutations RED`);
      return;
    }
    if (args.cmd === 'n2-score') {
      const { scoreN2Runs } = await import('./score-n2');
      const { reviewerBenchGates } = await import('./score-reviewer-bench');
      const exp = JSON.parse(fs.readFileSync(path.join(path.resolve(args.experiment!), 'experiment.json'), 'utf8'));
      const runs = String(args.run).split(',').map((r) => path.resolve(r));
      console.log([...scoreN2Runs(runs, exp).md, '', ...reviewerBenchGates(runs, exp).md].join('\n'));
      return;
    }
    if (args.cmd === 'chain-identity-diff') {
      // $0, read-only (cached snapshot): WHY a node's control pass reads "chain patch identity ✗" — the Reviewer prompt rebuilt
      // from the FROZEN chain entry vs from the entry patched with the persisted Author (the exact identity patch run() applies).
      const dir = path.resolve(args.experiment!); const exp = loadExperiment(dir);
      const node = exp.nodes.find((n) => n.id === args.node || n.authorExecutionId === args.node);
      if (!node) throw new Error(`no node ${args.node}`);
      const snap = loadSnapshot(node.authorExecutionId, { reviewerExecutionId: node.reviewerExecutionId ?? null });
      const ares = parsedResult(snap.author)!;
      const identityCtx = patchReviewerContext(snap, {
        executionId: snap.author.exec.id, finalResponse: ares.finalResponse, confidenceScore: ares.confidenceScore ?? null,
        qualityMetrics: ares.qualityMetrics ?? null, markerPresence: ares.markerPresence ?? null,
        rollbackContainment: ares.rollbackContainment ?? null, derivationContainment: ares.derivationContainment ?? null,
      });
      const proto = protocolFor(exp, dir, snap, node.variants[0]);
      const rFrozen = await rebuildPrompt(snap, 'reviewer', proto);
      const rPatched = await rebuildPrompt(snap, 'reviewer', proto, { inputContextOverride: identityCtx });
      const frozenEntry = (snap.reviewer!.exec.config as any).inputContext.chainedFrom.find((e: any) => e.executionId === snap.author.exec.id);
      const patchedEntry = identityCtx.chainedFrom.find((e: any) => e.executionId === snap.author.exec.id);
      const keys = [...new Set([...Object.keys(frozenEntry), ...Object.keys(patchedEntry)])].filter((k) => JSON.stringify(frozenEntry[k] ?? null) !== JSON.stringify(patchedEntry[k] ?? null));
      console.log(`identity ${rFrozen.user === rPatched.user ? '✓' : '✗'} · entry keys that differ: ${keys.join(', ') || 'none'}`);
      for (const k of keys) console.log(`  ${k}: frozen ${JSON.stringify(frozenEntry[k] ?? null).slice(0, 160)} | patched ${JSON.stringify(patchedEntry[k] ?? null).slice(0, 160)}`);
      const d = lineDelta(rFrozen.user, rPatched.user);
      console.log(`reviewer.user lines only in frozen: ${d.removed.length} · only in patched: ${d.added.length}`);
      for (const l of d.removed.slice(0, 15)) console.log(`  - ${l.slice(0, 160)}`);
      for (const l of d.added.slice(0, 15)) console.log(`  + ${l.slice(0, 160)}`);
      return;
    }
    if (args.cmd === 'oa-self-test') {
      const { oaSelfTest, OA_MUTATIONS } = await import('./score-oa');
      const r = oaSelfTest();
      const caught = OA_MUTATIONS.filter((m) => !oaSelfTest({ mutate: m }).ok);
      if (!r.ok || caught.length !== OA_MUTATIONS.length) { console.log(`❌ oa-self-test: ${r.failures.join('; ')} · mutations caught ${caught.length}/${OA_MUTATIONS.length}`); process.exit(1); }
      console.log(`✅ oa-self-test: the L-OA scorer reads every case as pre-registered; ${caught.length}/${OA_MUTATIONS.length} mutations RED`);
      return;
    }
    if (args.cmd === 'oa-score') {
      const { scoreOARuns } = await import('./score-oa');
      const { reviewerBenchGates } = await import('./score-reviewer-bench');
      const exp = JSON.parse(fs.readFileSync(path.join(path.resolve(args.experiment!), 'experiment.json'), 'utf8'));
      const runs = String(args.run).split(',').map((r) => path.resolve(r));
      console.log([...scoreOARuns(runs, exp).md, '', ...reviewerBenchGates(runs, exp).md].join('\n'));
      return;
    }
    if (args.cmd === 'bench-self-test') {
      const { reviewerBenchSelfTest } = await import('./score-reviewer-bench');
      const r = reviewerBenchSelfTest();
      if (!r.ok) { console.log(`❌ bench-self-test: ${r.failures.join('; ')}`); process.exit(1); }
      console.log('✅ bench-self-test: the node-driven Reviewer bench table reads every case');
      return;
    }
    if (args.cmd === 'n1-self-test') {
      const { n1SelfTest } = await import('./score-n1');
      const mi = process.argv.indexOf('--mutate');
      const r = n1SelfTest({ mutate: mi > 0 ? process.argv[mi + 1] as any : undefined });
      if (!r.ok) { console.log(`❌ n1-self-test: ${r.failures.length} failure(s):\n  ${r.failures.join('\n  ')}`); process.exit(1); }
      console.log('✅ n1-self-test: the L-N1 scorer reads every case as pre-registered');
      return;
    }
    if (args.cmd === 'n1-score') {
      const { scoreN1Runs } = await import('./score-n1');
      const exp = JSON.parse(fs.readFileSync(path.join(path.resolve(args.experiment!), 'experiment.json'), 'utf8'));
      const runs = String(args.run).split(',').map((r) => path.resolve(r));
      const r = scoreN1Runs(runs, exp, (id) => parsedResult(loadSnapshot(id).author)?.toolCalls ?? []);
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 'nb1-self-test') {
      const { nb1SelfTest } = await import('./score-nb1');
      const mi = process.argv.indexOf('--mutate');
      const r = nb1SelfTest({ mutate: mi > 0 ? process.argv[mi + 1] as any : undefined });
      if (!r.ok) { console.log(`❌ nb1-self-test: ${r.failures.length} failure(s):\n  ${r.failures.join('\n  ')}`); process.exit(1); }
      console.log('✅ nb1-self-test: the L-NB1 scorer reads every case as pre-registered');
      return;
    }
    if (args.cmd === 'nb1-score') {
      const { scoreNB1Runs } = await import('./score-nb1');
      const exp = JSON.parse(fs.readFileSync(path.join(path.resolve(args.experiment!), 'experiment.json'), 'utf8'));
      const r = scoreNB1Runs(String(args.run).split(',').map((x) => path.resolve(x)), exp);
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 'n1-fixtures') {
      // L-N1 B4/B6 ($0): build the device pool from CACHED snapshots + the stored failed call, prove each inner result byte-identical
      // to its record, recompute the shipping descriptor refusal text. Writes <experiment>/fixtures/{device-pool,register-refusal}.json.
      const nf = await import('./network-fixtures');
      const dir = path.resolve(args.experiment!);
      const ids = ['cmu921lsc000pyxyg5wvk0wmg', 'cmuwbn2vm00g6yx9dwf1q6lit', 'cmty0uhif0035yxt8cuchirkg']; // N3 (config, list_devices) · DERIV · N2
      const sources = ids.map((id) => ({ executionId: id, toolCalls: (parsedResult(loadSnapshot(id).author)?.toolCalls ?? []) as Array<Record<string, any>> }));
      // Production tool results stay out of git (runs/ and cache/ are gitignored): the pool and the failure source live in cache/n1/.
      const cdir = path.join(__dirname, 'cache', 'n1'); fs.mkdirSync(cdir, { recursive: true });
      const ffile = path.join(cdir, 'device-failure-source.json');
      if (!fs.existsSync(ffile)) {
        const { runReadOnlySql } = await import('./snapshot');
        const out = runReadOnlySql(`SELECT json_build_object('executionId', a."executionId", 'index', (o.i-1), 'call', r) FROM agent_artifacts a, jsonb_array_elements((a.content::jsonb)->'toolCalls') WITH ORDINALITY o(r,i) WHERE a."executionId"='cmuw8ma1n003yyx9e588id5ma' AND a.name='result.json' AND (o.i-1)=6;`).trim();
        fs.writeFileSync(ffile, out + '\n');
      }
      const fsrc = JSON.parse(fs.readFileSync(ffile, 'utf8'));
      const serviceIds = sources.flatMap((s) => s.toolCalls.filter((c) => c.tool === 'registry').map((c) => c.result?.content?.[0]?.data?.serviceId).filter((x: unknown) => typeof x === 'string'));
      const pool = nf.buildDevicePool(sources, ['ceos-lab-readonly', ...serviceIds], { result: fsrc.call.result, from: { executionId: fsrc.executionId, index: fsrc.index } });
      const bad = nf.provePool(pool, new Map(sources.map((s) => [s.executionId, s.toolCalls])));
      if (bad.length) throw new Error(`device pool identity FAILED: ${bad.join(' | ')}`);
      const poolText = JSON.stringify(pool, null, 1) + '\n';
      fs.writeFileSync(path.join(cdir, 'device-pool.json'), poolText);
      console.log(`   device-pool.json sha256 ${sha256(poolText)} (pin it as networkFixture.devicePoolSha256)`);
      const message = await nf.shippingDescriptorRefusal();
      fs.writeFileSync(path.join(dir, 'fixtures', 'register-refusal.json'), JSON.stringify({ source: 'shipping resolveFromDescriptor (stubbed fetch: descriptor-fetch-failed, post-connect) -> validationError with the handler\'s own example/tip', message }, null, 2) + '\n');
      console.log(`✅ device pool: ${pool.entries.length} entries (${pool.entries.map((e) => `${e.tool}${e.getter ? ':' + e.getter : ''}${e.host ? '@' + e.host : ''}`).join(', ')}), each inner result byte-identical to its record; services ${pool.serviceNames.join(', ')}; failure ← ${fsrc.executionId}#${fsrc.index}`);
      console.log(`✅ B6 refusal text (${message.length} chars): ${message.split('\n')[0]}`);
      return;
    }
    if (args.cmd === 'nb2-self-test') {
      const { nb2SelfTest } = await import('./score-nb2');
      const mi = process.argv.indexOf('--mutate');
      const r = nb2SelfTest({ mutate: mi > 0 ? process.argv[mi + 1] as any : undefined });
      if (!r.ok) { console.log(`❌ nb2-self-test: ${r.failures.length} failure(s):\n  ${r.failures.join('\n  ')}`); process.exit(1); }
      console.log('✅ nb2-self-test: the L-NB2 scorer reads every case as pre-registered');
      return;
    }
    if (args.cmd === 'nb2-score') {
      const { scoreNB2Runs } = await import('./score-nb2');
      const exp = JSON.parse(fs.readFileSync(path.join(path.resolve(args.experiment!), 'experiment.json'), 'utf8'));
      const r = scoreNB2Runs(String(args.run).split(',').map((x) => path.resolve(x)), exp);
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 'nb2-fixtures') {
      // L-NB2 ($0): the device pool from ONE cached production Harvester snapshot (fixtures/device-plants.json `sourceExecutionId`), each
      // inner result proved byte-identical to its record, THEN the named plants (the lab canary where R10 left a placeholder), proved by
      // un-planting. Writes cache/nb2/device-pool-canary.json (production results stay out of git) and prints its sha256.
      const nf = await import('./network-fixtures');
      const dir = path.resolve(args.experiment!);
      const spec = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures', 'device-plants.json'), 'utf8')) as { sourceExecutionId: string; serviceNames: string[]; plants: import('./network-fixtures').DevicePlant[] };
      const src = { executionId: spec.sourceExecutionId, toolCalls: (parsedResult(loadSnapshot(spec.sourceExecutionId).author)?.toolCalls ?? []) as Array<Record<string, any>> };
      const proved = nf.buildDevicePool([src], spec.serviceNames);
      const bad = nf.provePool(proved, new Map([[src.executionId, src.toolCalls]]));
      if (bad.length) throw new Error(`device pool identity FAILED: ${bad.join(' | ')}`);
      const { pool, applied } = nf.plantDevicePool(proved, spec.plants);
      const bad2 = nf.provePlants(proved, pool, spec.plants);
      if (bad2.length) throw new Error(`plant proof FAILED: ${bad2.join(' | ')}`);
      const cdir = path.join(__dirname, 'cache', 'nb2'); fs.mkdirSync(cdir, { recursive: true });
      const poolText = JSON.stringify(pool, null, 1) + '\n';
      fs.writeFileSync(path.join(cdir, 'device-pool-canary.json'), poolText);
      console.log(`✅ proved pool: ${proved.entries.length} entries (${proved.entries.map((e) => `${e.tool}${e.getter ? ':' + e.getter : ''}${e.host ? '@' + e.host : ''}`).join(', ')}) ← ${src.executionId}, each inner result byte-identical to its record`);
      console.log(`✅ plants: ${applied.map((a) => `${a.host}/${a.getter} ×${a.count}`).join(', ')} — un-planting reproduces the proved pool byte for byte`);
      console.log(`   cache/nb2/device-pool-canary.json sha256 ${sha256(poolText)} (pin it as networkFixture.devicePoolSha256)`);
      return;
    }
    if (args.cmd === 'frozen-cmp') {
      // L-CS-N bytes proof ($0): the FROZEN production rebuild of a node's Reviewer (its stored inputContext, the pinned base text) vs a
      // dry-run arm's saved reviewer.system.md / reviewer.user.md, byte for byte. A base arm must be identical (production's prompt).
      const dir = path.resolve(args.experiment!); const exp = loadExperiment(dir);
      const runDir = path.resolve(args.run!); let bad = 0;
      for (const nd of exp.nodes.filter((x) => !args.only || args.only.includes(x.id))) {
        if (nd.harvesterOnly || nd.architectOnly) continue;
        const snap = loadSnapshot(nd.authorExecutionId, { reviewerExecutionId: nd.reviewerExecutionId ?? null });
        if (!snap.reviewer) continue;
        const fr = await rebuildPrompt(snap, 'reviewer', protocolFor(exp, dir, snap, 'baseline'));
        for (const v of (args.variants ?? nd.variants)) {
          const vd = path.join(runDir, nd.id, v); if (!fs.existsSync(path.join(vd, 'reviewer.user.md'))) continue;
          const sys = fs.readFileSync(path.join(vd, 'reviewer.system.md'), 'utf8') === fr.system;
          const usr = fs.readFileSync(path.join(vd, 'reviewer.user.md'), 'utf8') === fr.user;
          if (!sys || !usr) bad++;
          console.log(`   ${sys && usr ? '✅' : '≠ '} ${nd.id}/${v}: reviewer.system.md ${sys ? 'identical' : 'differs'} · reviewer.user.md ${usr ? 'identical' : 'differs'} to the frozen production rebuild`);
        }
      }
      process.exitCode = bad ? 1 : 0; return;
    }
    if (args.cmd === 'csn-self-test') {
      // L-CS-N scorer, both directions; with --experiment, the scope definition and the warning id are checked VERBATIM against the
      // materialized candidate text (one definition shared by text, bench and scorer — F3).
      const { csnSelfTest } = await import('./score-csn');
      const mi = process.argv.indexOf('--mutate');
      let candidateText: string | undefined;
      if (args.experiment) {
        const d = path.resolve(args.experiment); const pd = path.join(d, 'protocols');
        const f = fs.readdirSync(pd).find((x) => /\.rc\.md$/.test(x));
        if (!f) throw new Error('csn-self-test: no materialized candidate (*.rc.md) — run build-candidates');
        candidateText = fs.readFileSync(path.join(pd, f), 'utf8');
      }
      const r = csnSelfTest({ mutate: mi > 0 ? process.argv[mi + 1] as any : undefined, candidateText });
      if (!r.ok) { console.log(`❌ csn-self-test: ${r.failures.length} failure(s):\n  ${r.failures.join('\n  ')}`); process.exit(1); }
      console.log(`✅ csn-self-test: the L-CS-N scorer reads every case as pre-registered${candidateText ? ' (scope definition + warning id verbatim in the candidate)' : ''}`);
      return;
    }
    if (args.cmd === 'csn-score') {
      const { scoreCsnRuns } = await import('./score-csn');
      const exp = loadExperiment(path.resolve(args.experiment!));
      const r = scoreCsnRuns(args.run!.split(',').map((x) => path.resolve(x)), exp as any);
      console.log(r.md.join('\n'));
      console.log(r.doNotShip.length ? `\n❌ DO-NOT-SHIP (proxy — hand-read each):\n  - ${r.doNotShip.join('\n  - ')}` : '\n✅ no do-not-ship proxy hit (the hand read still decides)');
      return;
    }
    if (args.cmd === 'vlg-self-test' || args.cmd === 'vlg-score') {
      // VALUE-LEG-GIT scorer (score-vlg.ts), $0. The self-test reads cached snapshots + the committed experiment files only.
      const sv = await import('./score-vlg');
      const vmi = process.argv.indexOf('--mutate'); const vmut = vmi > 0 ? process.argv[vmi + 1] : null;
      const expDir = path.resolve(args.experiment ?? path.join(__dirname, 'inputs', '2026-11-06-value-leg-git'));
      const res = (id: string) => parsedResult(loadSnapshot(id).author)!;
      const h = res('cmw478njh002kyx2v0v0t3goy');
      if (args.cmd === 'vlg-self-test') {
        const rd = (f: string) => JSON.parse(fs.readFileSync(path.join(__dirname, 'cache', 'vlg', f), 'utf8'));
        const r = sv.vlgSelfTest(expDir, { storedHarvest: h.finalResponse, storedCalls: h.toolCalls ?? [], storedArchitect: res('cmw47bixl0032yx31135j69pn').finalResponse,
          c1Architect: res('cmvvz3xmh003hyx8jwcqt4xmp').finalResponse, gitOnlyCalls: rd('harvest-git-only.calls.json'), gitLiveCalls: rd('harvest-git-live.calls.json') }, (vmut as any) ?? null);
        console.log(r.lines.join('\n'));
        console.log(r.ok ? `✅ vlg-self-test${vmut ? ` (mutation ${vmut}) — NOT caught` : ''}: every reading as pre-registered` : `❌ vlg-self-test${vmut ? ` (mutation ${vmut}) caught` : ''}`);
        process.exitCode = r.ok ? 0 : 1;
        return;
      }
      const storedHeld = (node: string) => (node === 'A-C126' ? sv.heldSet(h.finalResponse) : []);
      const r = sv.scoreVlgRuns(args.run!.split(',').map((x) => path.resolve(x)), expDir, storedHeld);
      console.log(r.md.join('\n'));
      console.log(r.doNotShip.length ? `\n❌ DO-NOT-SHIP (proxy — hand-read each):\n  - ${r.doNotShip.join('\n  - ')}` : '\n✅ no do-not-ship proxy hit (the hand read still decides)');
      console.log(r.revise.length ? `⚠️ below a pre-registered count (hand read decides REVISE):\n  - ${r.revise.join('\n  - ')}` : (r.doNotShip.length ? '⚠️ no other cell below its count (a standing miss above is not counted here)' : '✅ every scored cell at its pre-registered count (proxy)'));
      return;
    }
    if (args.cmd === 'vlg-fixtures') {
      // VALUE-LEG-GIT ($0, cached snapshots + the committed Git fixture only): device pools + frozen harvest calls into cache/vlg/.
      const { buildVlgFixtures } = await import('./value-lane-fixtures');
      await buildVlgFixtures();
      return;
    }
    if (args.cmd === 'cs-fixtures') {
      // L-CS-N (F14, $0): the PRE-redaction device pool from the self-host Harvester snapshots named in fixtures/device-plants.json
      // (rig named per entry), proved by identity + reversal + the collision witness. Writes cache/cs-n/device-pool-<rig>.json
      // (self-host run data stays out of git) and prints its sha256.
      const nf = await import('./network-fixtures');
      const dir = path.resolve(args.experiment!);
      const spec = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures', 'device-plants.json'), 'utf8')) as import('./network-fixtures').RigPoolSpec;
      const sources = spec.sourceExecutionIds.map((id) => { const sn = loadSnapshot(id); if (sn.provenance?.kind !== 'self-host') throw new Error(`${id}: not a self-host snapshot`); return { executionId: id, toolCalls: (parsedResult(sn.author)?.toolCalls ?? []) as Array<Record<string, any>> }; });
      // The registry ids the devext Harvesters got back from `registry register` (a lab Harvester may call the service by that id).
      const serviceIds = sources.flatMap((x) => x.toolCalls.filter((c: any) => c.tool === 'registry').map((c: any) => c.result?.content?.[0]?.data?.serviceId).filter((y: unknown) => typeof y === 'string')) as string[];
      const r = nf.buildRigPool(sources, { ...spec, serviceNames: [...new Set([...spec.serviceNames, ...serviceIds])] });
      // LR-FAIL: the failure-mode answer is the stored, verbatim failed gateway result n1-fixtures cached (production rig, 502 outage) —
      // named per pool (failureRig), never fetched here.
      const failSpec = (spec as any).failureSource as string | undefined;
      if (failSpec) {
        const fsrc = JSON.parse(fs.readFileSync(path.join(__dirname, failSpec), 'utf8'));
        r.pool.failure = { result: fsrc.call.result, from: { executionId: fsrc.executionId, index: fsrc.index } };
        (r.pool as any).failureRig = (spec as any).failureRig ?? 'prod';
      }
      const cdir = path.join(__dirname, 'cache', 'cs-n'); fs.mkdirSync(cdir, { recursive: true });
      const poolText = JSON.stringify(r.pool, null, 1) + '\n';
      fs.writeFileSync(path.join(cdir, `device-pool-${spec.rig}.json`), poolText);
      console.log(`✅ proved pool (rig ${spec.rig}): ${r.pool.entries.length} entries (${r.pool.entries.map((e) => `${e.tool}${e.getter ? ':' + e.getter : ''}${e.host ? '@' + e.host : ''}${e.derived ? ' [derived]' : ''}`).join(', ')}) — each stored entry byte-identical to its record, each derived entry = its stored sub-object; service names ${r.pool.serviceNames.join(', ')}${r.pool.failure ? ` · failure mode from ${r.pool.failure.from.executionId}#${r.pool.failure.from.index} (${(r.pool as any).failureRig})` : ''}`);
      console.log(`✅ plants: ${r.applied.map((a) => `${a.host}/${a.getter} ×${a.count}`).join(', ')} — un-planting reproduces the proved pool byte for byte; 0 placeholders left`);
      console.log(`✅ witness: ${r.witness.join(' · ')}`);
      if ((r as any).restamped?.length) console.log(`✅ identity re-stamped (exactly once each): ${(r as any).restamped.join(', ')}`);
      console.log(`   cache/cs-n/device-pool-${spec.rig}.json sha256 ${sha256(poolText)} (pin it as networkFixture.devicePoolSha256)`);
      return;
    }
    if (args.cmd === 'score-self-test') {
      const { scoreSelfTest } = await import('./score-requirements');
      const r = scoreSelfTest(path.resolve(args.experiment!));
      console.log('| gen | served | view | coverage (registry-caused) | citations | clauses | lint | residue {{/🗑/author | failing | turn (flag ON) |\n|---|---|---|---|---|---|---|---|---|---|');
      r.rows.forEach((x) => console.log(x));
      console.log(`\nL-R5 report.md − Author text (program view delivered): ${r.reportDeltas.map((d) => `gen ${d.gen} ${d.delta >= 0 ? '+' : ''}${d.delta}`).join(' · ')} · max ${Math.max(...r.reportDeltas.map((d) => d.delta))}`);
      if (r.mismatches.length) { console.log(`\n❌ ${r.mismatches.length} mismatch(es) against stage A:\n  ${r.mismatches.join('\n  ')}`); process.exit(1); }
      console.log('\n✅ scorer reproduces stage A on all gens');
      return;
    }
    if (args.cmd === 'score') {
      const { scoreRun } = await import('./score-requirements');
      const r = scoreRun(path.resolve(args.run!), path.resolve(args.experiment!));
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 'z49-self-test') {
      const { z49SelfTest } = await import('./score-z49');
      const r = z49SelfTest(path.resolve(args.experiment!));
      console.log('| case | mode | stanza blocks/parse | statements (effect:keys) | forbidden keys | G-STANZA | request-path rows (leg:form/tier) | G-ROW | G-NOWORSE inputs |\n|---|---|---|---|---|---|---|---|---|');
      r.rows.forEach((x) => console.log(x));
      if (r.mismatches.length) { console.log(`\n❌ ${r.mismatches.length} mismatch(es):\n  ${r.mismatches.join('\n  ')}`); process.exit(1); }
      console.log('\n✅ Z49 scorer reads every case as pre-registered');
      return;
    }
    if (args.cmd === 'z49-score') {
      const { z49ScoreRun } = await import('./score-z49');
      const runs = args.run!.split(',').map((r) => path.resolve(r));
      const r = z49ScoreRun(runs, path.resolve(args.experiment!));
      fs.writeFileSync(path.join(runs[0], 'z49-scores.json'), JSON.stringify(r, null, 2));
      fs.writeFileSync(path.join(runs[0], 'z49-scores.md'), r.md.join('\n') + '\n');
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 'g4-self-test') {
      const { g4SelfTest } = await import('./score-g4');
      const r = g4SelfTest(path.resolve(args.experiment!));
      console.log('| case | item rows/viol. | restates/asks | enforcer-scope form:option | part hits | empty cites/no-change | premise | collateral | G-NOWORSE cov·cit·clauses·lint |\n|---|---|---|---|---|---|---|---|---|');
      r.rows.forEach((x) => console.log(x));
      if (r.mismatches.length) { console.log(`\n❌ ${r.mismatches.length} mismatch(es):\n  ${r.mismatches.join('\n  ')}`); process.exit(1); }
      console.log('\n✅ g4 scorer reads every case as pre-registered');
      return;
    }
    if (args.cmd === 'g4-score') {
      const { g4ScoreRun } = await import('./score-g4');
      const runs = args.run!.split(',').map((r) => path.resolve(r));
      const r = g4ScoreRun(runs, path.resolve(args.experiment!));
      fs.writeFileSync(path.join(runs[0], 'g4-scores.json'), JSON.stringify(r, null, 2));
      fs.writeFileSync(path.join(runs[0], 'g4-scores.md'), r.md.join('\n') + '\n');
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 'g4-noworse-dump') {
      // P8: run in BOTH trees with the same --check-at; the two files must be identical.
      const { g4NoWorseDump } = await import('./score-g4');
      const at = process.argv[process.argv.indexOf('--check-at') + 1];
      if (!process.argv.includes('--check-at') || !at || !args.out) throw new Error('usage: g4-noworse-dump --experiment <dir> --check-at <commit> --out <file>');
      const r = g4NoWorseDump(path.resolve(args.experiment!), at);
      fs.writeFileSync(path.resolve(args.out), JSON.stringify(r, null, 2) + '\n');
      console.log(`✅ ${Object.keys(r).length} drafts → ${args.out}`);
      return;
    }
    if (args.cmd === 'edits-score') {
      // L-5 (Stage B G1, $0): the edit scorer over one or more runs; writes g1-scores.{json,md} beside the first run.
      const { scoreG1Run } = await import('./score-edits');
      const runs = args.run!.split(',').map((r) => path.resolve(r));
      const reading = process.argv.includes('--corrected') ? 'corrected' : 'registered';
      const r = scoreG1Run(runs, loadExperiment(path.resolve(args.experiment!)) as never, reading);
      const sfx = reading === 'corrected' ? '.corrected' : '';
      fs.writeFileSync(path.join(runs[0], `g1-scores${sfx}.json`), JSON.stringify(r.rows, null, 2));
      fs.writeFileSync(path.join(runs[0], `g1-scores${sfx}.md`), r.md.join('\n') + '\n');
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 'k1-self-test') {
      // held-k8s 1k (L-K-d, $0): the L-K1 scorer both directions; each `--mutate <ignore-guess|defaults-blind|drift-blind>` must FAIL it (pinned).
      const { k1SelfTest } = await import('./score-k1');
      const i = process.argv.indexOf('--mutate');
      const r = k1SelfTest(i > 0 ? { mutate: process.argv[i + 1] as never } : {});
      console.log(r.ok ? '✅ L-K1 scorer reads every case as pre-registered' : `❌ L-K1 scorer self-test:\n   ${r.failures.join('\n   ')}`);
      process.exit(r.ok ? 0 : 1);
    }
    if (args.cmd === 'k1-score') {
      // held-k8s 1k (L-K-d, $0): gate inputs over one or more runs; writes k1-scores.{json,md} beside the first run.
      const { scoreK1Runs } = await import('./score-k1');
      const runs = args.run!.split(',').map((r) => path.resolve(r));
      const val = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
      const r = scoreK1Runs(runs, loadExperiment(path.resolve(args.experiment!)) as never, { arm: val('--arm'), baseArm: val('--base-arm') });
      fs.writeFileSync(path.join(runs[0], 'k1-scores.json'), JSON.stringify(r.cells, null, 2));
      fs.writeFileSync(path.join(runs[0], 'k1-scores.md'), r.md.join('\n') + '\n');
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 't2-self-test') {
      const { t2SelfTest } = await import('./score-t2');
      const i = process.argv.indexOf('--mutate');
      const r = t2SelfTest(i > 0 ? { mutate: process.argv[i + 1] as never } : {});
      console.log(r.ok ? '✅ L-T2 scorer reads every case as pre-registered' : `❌ L-T2 scorer self-test:\n   ${r.failures.join('\n   ')}`);
      process.exit(r.ok ? 0 : 1);
    }
    if (args.cmd === 't2-score') {
      const { scoreT2Run } = await import('./score-t2');
      const runs = args.run!.split(',').map((r) => path.resolve(r));
      const r = scoreT2Run(runs, loadExperiment(path.resolve(args.experiment!)) as never);
      fs.writeFileSync(path.join(runs[0], 't2-scores.md'), r.md.join('\n') + '\n');
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 't1-self-test') {
      // held-terraform step 2 (L-T1, $0): the terraform scorer both directions; each `--mutate <…>` must FAIL it (pinned LT1).
      const { t1SelfTest } = await import('./score-t1');
      const i = process.argv.indexOf('--mutate');
      const r = t1SelfTest(i > 0 ? { mutate: process.argv[i + 1] as never } : {});
      console.log(r.ok ? '✅ L-T1 scorer reads every case as pre-registered' : `❌ L-T1 scorer self-test:\n   ${r.failures.join('\n   ')}`);
      process.exit(r.ok ? 0 : 1);
    }
    if (args.cmd === 't1-score') {
      // held-terraform step 2 (L-T1, $0): gate inputs over one or more runs (crib + rest combine); writes t1-scores.{json,md} beside the first run.
      const { scoreT1Runs } = await import('./score-t1');
      const runs = args.run!.split(',').map((r) => path.resolve(r));
      const r = scoreT1Runs(runs, loadExperiment(path.resolve(args.experiment!)) as never);
      fs.writeFileSync(path.join(runs[0], 't1-scores.json'), JSON.stringify(r.cells, null, 2));
      fs.writeFileSync(path.join(runs[0], 't1-scores.md'), r.md.join('\n') + '\n');
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 'k2-self-test') {
      // held-k8s step 3 (L-K2, $0): the k8s additions both directions; each `--mutate <sgdoc-blind|diff-lenient|cause-blind|ambig-blind|negation-blind|newdoc-quote|count-blind>` must FAIL it.
      const { k2SelfTest } = await import('./score-k2');
      const i = process.argv.indexOf('--mutate');
      const r = k2SelfTest(i > 0 ? { mutate: process.argv[i + 1] as never } : {});
      console.log(r.ok ? '✅ L-K2 scorer reads every case as pre-registered' : `❌ L-K2 scorer self-test:\n   ${r.failures.join('\n   ')}`);
      process.exit(r.ok ? 0 : 1);
    }
    if (args.cmd === 'k2-score') {
      // held-k8s step 3 (L-K2, $0): G1 edit scores + the k8s additions (SG-DOC, SG-DIFF, strict base diffs, G-AMBIG, rollback form,
      // G-NONADMIN, reflectionPassSpentBy, DRIFT-CAUSE) over one or more runs; writes k2-scores.{json,md} beside the first run.
      const { scoreK2Run } = await import('./score-k2');
      const runs = args.run!.split(',').map((r) => path.resolve(r));
      const { k2ReviewerGates } = await import('./score-k2');
      const exp = loadExperiment(path.resolve(args.experiment!));
      const r = scoreK2Run(runs, exp as never);
      const rv = k2ReviewerGates(runs, exp as never);
      fs.writeFileSync(path.join(runs[0], 'k2-scores.json'), JSON.stringify({ gates: { ...r.gates, ...rv.gates }, samples: r.samples, harvest: r.harvest }, null, 2));
      const md = [...r.md, '', ...rv.md];
      fs.writeFileSync(path.join(runs[0], 'k2-scores.md'), md.join('\n') + '\n');
      console.log(md.join('\n'));
      return;
    }
    if (args.cmd === 'fixture-fetch') {
      // held-k8s 1k (L-K-a): a fixture from ONE commit through the operator's own gh (read-only); refuses a plaintext Secret.
      const { fixtureFetch } = await import('./fixture-tools');
      const val = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
      if (!val('--repo') || !val('--commit') || !val('--paths') || !args.out) throw new Error('usage: fixture-fetch --repo <owner/repo> --commit <40 hex> --paths a,b --out <dir>');
      const r = fixtureFetch({ repo: val('--repo')!, commit: val('--commit')!, paths: val('--paths')!.split(','), out: path.resolve(args.out) });
      console.log(`✅ ${r.written.length} file(s) → ${args.out} (blob ids agree with GitHub): ${r.written.join(', ')}`);
      return;
    }
    if (args.cmd === 'fixture-id-check') {
      // held-k8s 1k (G-FIXTURE-ID, $0): the fixture's INNER render vs an admin services.call capture, case by case.
      const { loadFileFixture, fixtureIdCheck } = await import('./fixture-tools');
      const val = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
      if (!val('--fixture') || !val('--probe')) throw new Error('usage: fixture-id-check --fixture <dir> --probe <probe.json>');
      const r = fixtureIdCheck(loadFileFixture(path.resolve(val('--fixture')!)), JSON.parse(fs.readFileSync(path.resolve(val('--probe')!), 'utf8')));
      console.log(r.lines.join('\n'));
      console.log(r.ok ? '✅ G-FIXTURE-ID holds: every case byte-identical' : '❌ G-FIXTURE-ID does not hold');
      process.exit(r.ok ? 0 : 1);
    }
    if (args.cmd === 'g3-self-test') {
      // Stage B G3 ($0): the G3 Reviewer-bench scorer, both directions per reading; each `--mutate <ignore-plant|no-diff-rule|
      // remit-blind|no-platform-render|pair-blind>` must FAIL it (pinned).
      const { g3SelfTest } = await import('./score-g3');
      const i = process.argv.indexOf('--mutate');
      const r = g3SelfTest(i > 0 ? { mutate: process.argv[i + 1] as never } : {});
      console.log(r.ok ? '✅ G3 scorer reads every case as pre-registered' : `❌ G3 scorer self-test:\n   ${r.failures.join('\n   ')}`);
      process.exit(r.ok ? 0 : 1);
    }
    if (args.cmd === 'g3-score') {
      // Stage B G3 ($0): readings (a)/(b)/(c) + gate inputs over one or more runs; writes g3-scores.{json,md} beside the first run.
      const { scoreG3Runs } = await import('./score-g3');
      const runs = args.run!.split(',').map((r) => path.resolve(r));
      const r = scoreG3Runs(runs, loadExperiment(path.resolve(args.experiment!)) as never);
      fs.writeFileSync(path.join(runs[0], 'g3-scores.json'), JSON.stringify(r.cells, null, 2));
      fs.writeFileSync(path.join(runs[0], 'g3-scores.md'), r.md.join('\n') + '\n');
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 'g2-self-test') {
      // Stage B G2 ($0): the Reviewer-bench scorer both directions; `--mutate <ignore-plant|cites-scope>` must FAIL it (pinned).
      const { g2SelfTest } = await import('./score-g2');
      const i = process.argv.indexOf('--mutate');
      const r = g2SelfTest(i > 0 ? { mutate: process.argv[i + 1] as never } : {});
      console.log(r.ok ? '✅ G2 scorer reads every case as pre-registered' : `❌ G2 scorer self-test:\n   ${r.failures.join('\n   ')}`);
      process.exit(r.ok ? 0 : 1);
    }
    if (args.cmd === 'g2-score') {
      // Stage B G2 ($0): reason-scored Reviewer bench over one or more runs; writes g2-scores.{json,md} beside the first run.
      const { scoreG2Runs } = await import('./score-g2');
      const runs = args.run!.split(',').map((r) => path.resolve(r));
      const r = scoreG2Runs(runs, loadExperiment(path.resolve(args.experiment!)) as never);
      fs.writeFileSync(path.join(runs[0], 'g2-scores.json'), JSON.stringify(r.cells, null, 2));
      fs.writeFileSync(path.join(runs[0], 'g2-scores.md'), r.md.join('\n') + '\n');
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 'held-id-check') {
      // G-HOLD-ID (PLATFORM-HELD-BYTES Stage B §4, $0, read-only): L-1's base hashes = production held_blobs on every held Harvester.
      const { heldIdentityCheck } = await import('./held-store');
      const { runReadOnlySql } = await import('./snapshot');
      const r = heldIdentityCheck(runReadOnlySql);
      console.log(`G-HOLD-ID: ${r.equal}/${r.refs} refs over ${r.executions} Harvester execution(s) reproduced (by redactorVersion: ${Object.entries(r.byVersion).map(([k, v]) => `${k} ${v}`).join(', ')})`);
      if (r.predatesDeviceLane.length) console.log(`ℹ named, not a mismatch (L-N2-a):\n   ${r.predatesDeviceLane.join('\n   ')}`);
      if (r.mismatches.length || r.refs === 0) { console.log(`❌ ${r.refs === 0 ? 'no held refs read — the check measured nothing' : r.mismatches.join('\n   ')}`); process.exit(1); }
      console.log('✅ G-HOLD-ID holds');
      return;
    }
    if (args.cmd === 'blind') {
      const { blindCopies } = await import('./score-requirements');
      console.log(`✅ ${blindCopies(path.resolve(args.run!), path.resolve(args.out!))} blind copies → ${args.out} (key: ${path.join(args.run!, 'blind-key.json')} — keep it from the reader)`);
      return;
    }
    console.log('usage: lab.ts build-candidates|fidelity|run|summarize — see the header of scripts/leg-replay-lab/lab.ts');
    process.exit(args.cmd === 'help' ? 0 : 1);
  })().catch((e) => { console.error(e); process.exit(1); });
}
