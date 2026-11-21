#!/usr/bin/env ts-node
/**
 * `planWitness` — the platform's check of a Terraform Author's `Plan witness` block (lib/agents/harness/plan-witness.ts;
 * terraform-witness step-back, 2026-11-18). CI-safe: no DB, no git, no private path — every fixture is hand-built in this file.
 *
 *   S  the stop sentence: the constant, the version table, what is normalised, verbatim / altered / absent
 *   K  the key read, through the SHIPPING applier (`computeEditApplication`): every HCL shape pinned to its names or to a NAMED
 *      unreadable reason (the 6 shapes the stored corpus holds and the 17 it does not — CORPUS-W2-W4.md)
 *   W  the fact on whole packages: the L-CS-T plant shapes (altered sentence, no witness, witness missing `policy`, whole `tags` map,
 *      key-level witness with fmt re-alignment, a create, the `lifecycle` unreadable case, a hard-wrapped sentence)
 *   R  the §6 render, line for line (the Reviewer's text keys on these lines)
 *   N  through the real chokepoint (`stampExecutionNets`): stamped at terraform-iac 1.17.0, NOT stamped below it or elsewhere; the
 *      stored fact hands a replay back the same fact with no held blob
 *   C  the held-edit carrier: the stop-sentence force, its scope and its precedence
 *   P  pins: registry tail, operator tail, summary whitelist, the chainer's reader set, the closed reason list
 *
 * Mutation-checked at build (PLAN-WITNESS-BUILD.md §6): each rule was broken once and the named test went red.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/test-plan-witness.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x:y@127.0.0.1:1/z';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
import { computeEditApplication } from '../lib/agents/harness/held-bytes/apply';
import {
  PLAN_WITNESS_STOP_SENTENCES, PLAN_WITNESS_UNREADABLE_REASONS, PLAN_WITNESS_REASON_WORDS, PLAN_WITNESS_RENDER_HEAD, PLAN_WITNESS_FORCE_REASONS,
  planWitnessSentenceEntry, planWitnessStopSentenceFor, planWitnessApplies, planWitnessProtocolHasSentence, stopSentenceState, normaliseForStopSentence,
  planWitnessBlock, computePlanWitnessKeys, computePlanWitness, planWitnessKeysFromFact, planWitnessForceReason, renderPlanWitnessForPrompt,
  planWitnessKeysOrNull, readPlanWitnessKeys, type PlanWitnessKeys,
} from '../lib/agents/harness/plan-witness';
import { canonicalProtocolName } from '../lib/agents/harness/program-protocol';
import { stampExecutionNets } from '../lib/services/execution-nets';
import { MECHANICAL_NETS } from '../lib/agents/harness/mechanical-nets';
import { RESULT_JSON_OPERATOR_TAIL_KEYS, RESULT_JSON_SUMMARY_KEYS } from '../lib/services/execution-artifacts';
import { PLAN_WITNESS_READERS } from '../lib/agents/harness/context-chainer';
import { renderPipelineContextSection } from '../lib/agents/harness/render-pipeline-context';
import { applyHeldEditCarrier, heldEditOutcomeLine } from '../lib/agents/harness/held-edit-carrier';
import { buildConfigSourcesSnapshot, resolveLegConfigSources, CONFIG_SOURCES_SNAPSHOT_KEY } from '../lib/agents/harness/config-sources';
import { legProtocolHasConfigLane } from '../lib/agents/harness/held-bytes/variant';
import { authoritativeReadStub, type StubExecution } from './fixtures/authoritative-read-stub';

let passed = 0; let failed = 0;
const pending: Array<{ d: string; fn: () => Promise<void> | void }> = [];
const test = (d: string, fn: () => Promise<void> | void) => { pending.push({ d, fn }); };
function eq(a: unknown, b: unknown, what = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c: unknown, what: string): asserts c { if (!c) throw new Error(what); }

const TF = 'terraform-iac-protocol';
const ENTRY = planWitnessSentenceEntry(TF, '1.17.0')!;
const STOP = ENTRY.sentence;

// ── fixtures: a small invented estate (not production data) ─────────────────────────────────────────────────────────
const MAIN_TF = `# Fixture estate for the plan-witness suite.
resource "aws_s3_bucket" "reports" {
  bucket = "example-reports"
  tags = merge({
    team = "data"
    env  = "prod"
  }, local.common_tags)
}

resource "aws_s3_bucket" "cold" {
  bucket = "example-cold"

  tags = {
    team = "data"
    tier = "cold"
  }
}

resource "random_password" "db" {
  length = 24
}
`;
const file = (text: string, p = '/terraform/main.tf', handle = 'H1') => ({ handle, path: p, state: 'rendered' as const, baseText: text, viewText: text, rewrittenLines: [], redactorVersion: 'paichart.r10/12' });
const edit = (search: string, replace: string, handle = 'H1') => `<<<<<<< SEARCH ${handle}\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;
const pkg = (edits: string[], witness: string | null, sentence: string | null = STOP) => [
  '# Change package', '', '## Held File Edits', '', ...edits.flatMap((e) => [e, '']), '## Held File Rollback', '', 'restore H1', '',
  '## Validation', '', 'terraform validate', '',
  ...(witness === null ? [] : ['## Plan witness', '', witness, '', ...(sentence === null ? [] : [`*${sentence}*`, ''])]),
  '## Rollback plan', '', 'Revert the commit.', '',
].join('\n');
/** Package text → the shipping applier → the key read → the fact. */
function run(text: string, files = [file(MAIN_TF)]) {
  const app = computeEditApplication(text, { files, r9Version: 'paichart.r9/1' });
  const keys = computePlanWitnessKeys(app, files);
  return { app, keys, fact: computePlanWitness(text, ENTRY, keys) };
}
/** One edit on a base file → its edit entry. */
function read(base: string, search: string, replace: string, p = '/terraform/main.tf') {
  const r = run(pkg([edit(search, replace)], null, null), [file(base, p)]);
  ok(r.app.state === 'applied', `fixture edit not applied: ${r.app.state} ${JSON.stringify(r.app.refused)}`);
  eq(r.keys.edits.length, 1, 'edits: ');
  return r.keys.edits[0];
}
const names = (e: ReturnType<typeof read>) => e.resources.map((r) => `${r.address} ${r.change} +[${r.sets}] -[${r.removes}] ~[${r.realigned}] =[${r.unchanged}]`).join(' | ');
const res = (body: string, head = 'resource "aws_instance" "web" {') => `${head}\n${body}\n}\n`;

// ── S: the stop sentence ────────────────────────────────────────────────────────────────────────────────────────────
test('S1 the constant: one sentence at terraform-iac 1.17.0, pinned by sha (the lab input it was diffed against at build)', () => {
  eq(Object.keys(PLAN_WITNESS_STOP_SENTENCES), [TF]);
  eq(Object.keys(PLAN_WITNESS_STOP_SENTENCES[TF]), ['1.17.0']);
  eq(createHash('sha256').update(STOP, 'utf8').digest('hex'), '747a5795d02f5d2396274684bd3196a60b06093b6d4060165573427a2c46fb54');
  ok(STOP.startsWith("If the team's CI plan takes any other action") && STOP.includes('— a revert included —') && STOP.endsWith('another merged change).'), 'wording');
  ok(!/[*_]/.test(STOP), 'the sentence carries no emphasis character (the normalisation drops them)');
  eq(planWitnessStopSentenceFor('terraform-iac', '1.17.0'), STOP);
  let threw = false; try { planWitnessStopSentenceFor('terraform-iac', '1.16.0'); } catch { threw = true; }
  ok(threw, 'an unknown version must throw for the seed');
});
test('S2 the version key: stamped at/above 1.17.0 only; the entry is the greatest release at or below the composed version', () => {
  eq(planWitnessSentenceEntry(TF, '1.16.0'), null);
  eq(planWitnessSentenceEntry(TF, '1.16.9'), null);
  eq(planWitnessSentenceEntry(TF, '1.17.0')?.sentenceVersion, '1.17.0');
  eq(planWitnessSentenceEntry('terraform-iac', '1.18.2')?.sentenceVersion, '1.17.0');
  eq(planWitnessSentenceEntry(TF, '2.0.0')?.sentenceVersion, '1.17.0');
  for (const other of ['kubernetes-gitops-protocol', 'some-other-protocol', 'toString', 'constructor', '', null, 7]) eq(planWitnessSentenceEntry(other, '9.9.9'), null, `${String(other)}: `);
  for (const v of [undefined, null, '', 'latest', 17]) eq(planWitnessSentenceEntry(TF, v), null, `version ${String(v)}: `);
  eq(planWitnessApplies({ delta: { name: 'terraform-iac', version: '1.17.0' } })?.protocol, TF);
  eq(planWitnessApplies({ delta: { name: 'terraform-iac-protocol', version: '1.16.0' } }), null);
  for (const pi of [null, undefined, {}, { delta: null }, { delta: { name: 'terraform-iac' } }, 'x']) eq(planWitnessApplies(pi), null);
  const has = planWitnessProtocolHasSentence;
  ok(has('terraform-iac') && has(TF), 'terraform has a sentence, under either spelling');
  ok(!has('kubernetes-gitops-protocol') && !has(null) && !has('toString') && !has(''), 'no other protocol has one');
});
test('S3 the module restates the protocol-name suffix rule: equal to canonicalProtocolName on every spelling it meets', () => {
  const short = 'terraform-iac';
  eq(planWitnessSentenceEntry(short, '1.17.0')?.protocol, canonicalProtocolName(short));
  eq(planWitnessSentenceEntry(TF, '1.17.0')?.protocol, canonicalProtocolName(TF));
});
test('S4 verbatim: byte-exact, and exact after the stated normalisation (hard wrap, emphasis, blockquote)', () => {
  eq(stopSentenceState(`x\n${STOP}\ny`, STOP), { state: 'verbatim', form: 'byte-exact' });
  eq(stopSentenceState(`x\n*${STOP}*\ny`, STOP), { state: 'verbatim', form: 'byte-exact' });
  const words = STOP.split(' '); const wrapped = [words.slice(0, 14).join(' '), words.slice(14, 30).join(' '), words.slice(30).join(' ')];
  eq(stopSentenceState(wrapped.join('\n'), STOP), { state: 'verbatim', form: 'normalised' });
  eq(stopSentenceState(wrapped.map((l) => `> ${l}`).join('\n'), STOP), { state: 'verbatim', form: 'normalised' });
  eq(stopSentenceState(wrapped.join('\n   '), STOP), { state: 'verbatim', form: 'normalised' });
  eq(stopSentenceState(STOP.replace('stop and do not apply', '**stop and do not apply**'), STOP), { state: 'verbatim', form: 'normalised' });
  eq(stopSentenceState(`_${STOP.replace('  ', ' ')}_`.replace('these resources,', 'these  resources,'), STOP), { state: 'verbatim', form: 'normalised' });
});
test('S5 altered: a word, a dash or an apostrophe changed is NOT normalised away', () => {
  const alt = (t: string) => stopSentenceState(`## Plan witness\n\n*${t}*\n`, STOP).state;
  eq(alt(STOP.replace(' — a revert included —', '')), 'altered'); // the L-CS-T R-STOP-ALTERED plant
  eq(alt(STOP.replace(/—/g, '-')), 'altered');
  eq(alt(STOP.replace('do not apply', 'do not merge')), 'altered');
  eq(alt(STOP.replace('any other resource', 'any resource')), 'altered');
  eq(alt(STOP.replace("team's CI plan takes", "team's CI plan  takes").replace('map key', 'map-key')), 'altered');
  eq(alt(STOP.slice(0, 120)), 'altered'); // cut short
  eq(alt(STOP.replace("team's", 'team’s')), 'absent'); // a curly apostrophe changes the anchor too: not the sentence, and not "begins like it"
});
test('S6 absent: no sentence and nothing that begins like it', () => {
  eq(stopSentenceState('## Plan witness\n\n- `a.b` — update in place.\n', STOP), { state: 'absent' });
  eq(stopSentenceState('', STOP), { state: 'absent' });
  eq(stopSentenceState('If the plan differs, stop.', STOP), { state: 'absent' });
  eq(normaliseForStopSentence('> a  *b*\n>  _c_\n d'), 'a b c d');
});
test('S7 the witness block: an ATX heading at any level, or a bold-only line; ends at the next heading of the same or a higher level', () => {
  eq(planWitnessBlock('# A\n## Plan witness\nx\n### sub\ny\n## Next\nz'), 'x\n### sub\ny');
  eq(planWitnessBlock('#### (b2) Plan witness (Drift)\nx\n#### Next\nz'), 'x');
  eq(planWitnessBlock('intro\n**Plan witness**\nx\ny\n## Next\nz'), 'x\ny');
  eq(planWitnessBlock('**Plan witness:**\nx\n**Rollback**\nz'), 'x');
  eq(planWitnessBlock('# A\nThe Plan witness is below.\nx'), null); // prose mentioning it is not a heading
  eq(planWitnessBlock('## Validation\nx'), null);
});

// ── K: the key read, through the shipping applier ───────────────────────────────────────────────────────────────────
test('K1 simple `key = value`: the changed and the added argument are named; the resource comes from the file, not the edit', () => {
  const e = read(MAIN_TF, '  length = 24', '  length  = 32\n  special = true');
  eq([e.state, names(e)], ['read', 'random_password.db edit +[length,special] -[] ~[] =[]']);
});
test('K2 map key in `tags = { … }`: the key is named with its map; the re-aligned sibling is listed as spacing-only and as unchanged', () => {
  const e = read(MAIN_TF, '    team = "data"\n    tier = "cold"', '    team  = "data"\n    tier  = "warm"\n    owner = "data-platform"');
  eq([e.state, names(e)], ['read', 'aws_s3_bucket.cold edit +[tags.tier,tags.owner] -[] ~[tags.team] =[tags.team]']);
});
test('K3 map key inside a `merge(…)` argument: named `tags.<key>`; the siblings come from the FILE (the SEARCH holds none)', () => {
  const e = read(MAIN_TF, '  }, local.common_tags)', '  }, local.common_tags, {\n    owner = "platform-team"\n  })');
  eq([e.state, names(e)], ['read', 'aws_s3_bucket.reports edit +[tags.owner] -[] ~[] =[tags.team,tags.env]']);
});
test('K4 a new attribute holding a `jsonencode(…)` document is named whole; no inner key is a name', () => {
  const e = read(MAIN_TF, '  bucket = "example-cold"', '  bucket = "example-cold"\n  policy = jsonencode({\n    Version = "2012-10-17"\n    Statement = [\n      {\n        Effect    = "Allow"\n        Principal = { AWS = "arn:aws:iam::000000000000:role/w" }\n        Action    = "s3:PutObject"\n      }\n    ]\n  })');
  eq([e.state, names(e)], ['read', 'aws_s3_bucket.cold edit +[policy] -[] ~[] =[]']);
});
test('K5 a new resource appended inside another resource\'s hunk: the NEW address, action only; the anchor resource is not named', () => {
  const e = read(MAIN_TF, '  }, local.common_tags)\n}', '  }, local.common_tags)\n}\n\n# write grant\nresource "aws_s3_bucket_policy" "reports" {\n  bucket = aws_s3_bucket.reports.id\n  policy = jsonencode({ Version = "2012-10-17" })\n}');
  eq([e.state, names(e)], ['read', 'aws_s3_bucket_policy.reports create +[] -[] ~[] =[]']);
});
test('K6 an update AND a new resource in one edit block: both read (the lexical prototype read the create only)', () => {
  const e = read(MAIN_TF, '  length = 24\n}', '  length = 32\n}\n\nresource "aws_s3_bucket" "extra" {\n  bucket = "example-extra"\n}');
  eq([e.state, names(e)], ['read', 'aws_s3_bucket.extra create +[] -[] ~[] =[] | random_password.db edit +[length] -[] ~[] =[]']);
});
test('K7 a `lifecycle` block is a meta-argument: UNREADABLE, named (the one undecidable production edit)', () => {
  const e = read(MAIN_TF, '  }, local.common_tags)\n}', '  }, local.common_tags)\n\n  lifecycle {\n    prevent_destroy = true\n  }\n}');
  eq([e.state, e.reason, e.resources.length], ['unreadable', 'meta-argument', 0]);
});
test('K8 `count` / `for_each` / `depends_on` / `provider` at the top of a resource: meta-argument', () => {
  for (const [a, b] of [['  count = 1', '  count = 2'], ['  for_each = var.a', '  for_each = var.b'], ['  provider = aws.a', '  provider = aws.b']]) {
    const e = read(res(`${a}\n  ami = "x"`), a, b);
    eq([e.state, e.reason], ['unreadable', 'meta-argument'], `${a}: `);
  }
});
test('K9 an attribute of an EXISTING nested block is named with its block', () => {
  const base = res('  ami = "x"\n  root_block_device {\n    volume_size = 20\n    encrypted   = true\n  }');
  const e = read(base, '    volume_size = 20', '    volume_size = 40');
  eq([e.state, names(e)], ['read', 'aws_instance.web edit +[root_block_device.volume_size] -[] ~[] =[root_block_device.encrypted]']);
});
test('K10 one of several sibling nested blocks of one name: block-set-element (no key identifies which)', () => {
  const base = res('  ingress {\n    from_port = 80\n  }\n  ingress {\n    from_port = 443\n  }', 'resource "aws_security_group" "web" {');
  eq([read(base, '    from_port = 443', '    from_port = 8443').reason], ['block-set-element']);
});
test('K11 an edit INSIDE an existing jsonencode document names the attribute whole (the prototype named the inner key)', () => {
  const base = res('  policy = jsonencode({\n    Statement = [{\n      Action = "s3:GetObject"\n      Effect = "Allow"\n    }]\n  })', 'resource "aws_s3_bucket_policy" "p" {');
  const e = read(base, '      Action = "s3:GetObject"', '      Action = "s3:*"');
  eq([e.state, names(e)], ['read', 'aws_s3_bucket_policy.p edit +[policy] -[] ~[] =[]']);
});
test('K12 heredoc documents: a JSON body and a `KEY = value` body both name the attribute whole', () => {
  const j = res('  policy = <<EOT\n{\n  "Action": "s3:GetObject"\n}\nEOT\n  bucket = "b"', 'resource "aws_s3_bucket_policy" "p" {');
  eq(names(read(j, '  "Action": "s3:GetObject"', '  "Action": "s3:*"')), 'aws_s3_bucket_policy.p edit +[policy] -[] ~[] =[]');
  const u = res('  user_data = <<-EOT\n    PORT = 80\n  EOT\n  ami = "x"');
  eq(names(read(u, '    PORT = 80', '    PORT = 8080')), 'aws_instance.web edit +[user_data] -[] ~[] =[]');
  // the line after the heredoc is read normally again
  eq(names(read(u, '  ami = "x"', '  ami = "y"')), 'aws_instance.web edit +[ami] -[] ~[] =[]');
});
test('K13 a list element added or removed names the list attribute whole', () => {
  const base = res('  cidr_blocks = [\n    "10.0.0.0/24",\n  ]', 'resource "aws_security_group_rule" "r" {');
  eq(names(read(base, '    "10.0.0.0/24",', '    "10.0.0.0/24",\n    "10.99.0.0/27",')), 'aws_security_group_rule.r edit +[cidr_blocks] -[] ~[] =[]');
  eq(names(read(base.replace('"10.0.0.0/24",', '"10.0.0.0/24",\n    "10.1.0.0/24",'), '    "10.1.0.0/24",\n  ]', '  ]')), 'aws_security_group_rule.r edit +[] -[cidr_blocks] ~[] =[]');
});
test('K14 a `dynamic` block: dynamic-block', () => {
  const base = res('  dynamic "ingress" {\n    for_each = var.ports\n    content {\n      from_port = ingress.value\n    }\n  }', 'resource "aws_security_group" "web" {');
  eq(read(base, '      from_port = ingress.value', '      from_port = ingress.value\n      protocol  = "tcp"').reason, 'dynamic-block');
});
test('K15 a REMOVED attribute and a removed map key are named in `removes`', () => {
  const base = res('  ami           = "x"\n  monitoring    = true\n  tags = {\n    team = "a"\n    tier = "cold"\n  }');
  eq(names(read(base, '  ami           = "x"\n  monitoring    = true', '  ami           = "x"')), 'aws_instance.web edit +[] -[monitoring] ~[] =[]');
  eq(names(read(base, '    team = "a"\n    tier = "cold"', '    team = "a"')), 'aws_instance.web edit +[] -[tags.tier] ~[] =[tags.team]');
});
test('K16 comments: a comment-only edit and a trailing comment set nothing; a spacing-only line is listed and sets nothing', () => {
  const base = res('  ami = "x"\n  monitoring = true');
  eq(names(read(base, '  ami = "x"', '  # the image\n  ami = "x"')), '');
  eq(names(read(base, '  ami = "x"', '  ami = "x" # pinned')), '');
  eq(names(read(base, '  ami = "x"', '  ami = "x" // pinned')), '');
  eq(names(read(base, '  ami = "x"\n  monitoring = true', '  ami        = "x"\n  monitoring = false')), 'aws_instance.web edit +[monitoring] -[] ~[ami] =[]');
  eq(read(base, '  ami = "x"', '  # the image\n  ami = "x"').state, 'read');
});
test('K17 a `#` inside a string is not a comment: the value change is read', () => {
  const base = res('  ami = "x#1"');
  eq(names(read(base, '  ami = "x#1"', '  ami = "x#2"')), 'aws_instance.web edit +[ami] -[] ~[] =[]');
});
test('K18 a map or block written on one line: one-line-collection', () => {
  const base = res('  tags = { team = "a", tier = "cold" }');
  eq(read(base, '  tags = { team = "a", tier = "cold" }', '  tags = { team = "a", tier = "cold", owner = "x" }').reason, 'one-line-collection');
  // a one-line LIST or call is one value of its attribute: read
  const l = res('  azs = ["a", "b"]');
  eq(names(read(l, '  azs = ["a", "b"]', '  azs = ["a", "b", "c"]')), 'aws_instance.web edit +[azs] -[] ~[] =[]');
});
test('K19 `variable` / `locals` / `module` / `data` / `output` / `provider` and a top-level assignment: non-resource-block', () => {
  for (const [base, a, b] of [
    ['variable "size" {\n  default = 24\n}\n', '  default = 24', '  default = 32'],
    ['locals {\n  owner = "a"\n}\n', '  owner = "a"', '  owner = "b"'],
    ['module "vpc" {\n  cidr = "10.0.0.0/16"\n}\n', '  cidr = "10.0.0.0/16"', '  cidr = "10.1.0.0/16"'],
    ['data "aws_ami" "a" {\n  owners = ["x"]\n}\n', '  owners = ["x"]', '  owners = ["y"]'],
    ['output "o" {\n  value = 1\n}\n', '  value = 1', '  value = 2'],
    ['provider "aws" {\n  region = "a"\n}\n', '  region = "a"', '  region = "b"'],
    ['region = "a"\n', 'region = "a"', 'region = "b"'],
    ['resource "a" "b" {\n  x = 1\n}\n', '}', '}\n\nvariable "v" {\n  default = 1\n}'],
  ]) eq(read(base, a, b).reason, 'non-resource-block', `${base.split('\n')[0]}: `);
});
test('K20 a quoted map key is read; lines MOVED between two maps read as a removal and an addition under each name', () => {
  const q = res('  tags = {\n    "cost-center" = "a"\n  }');
  eq(names(read(q, '    "cost-center" = "a"', '    "cost-center" = "b"')), 'aws_instance.web edit +[tags.cost-center] -[] ~[] =[]');
  const m = res('  tags = {\n    owner = "a"\n  }\n  volume_tags = {\n    team = "a"\n  }');
  const e = read(m, '  tags = {\n    owner = "a"\n  }\n  volume_tags = {\n    team = "a"\n  }', '  tags = {\n    team = "a"\n  }\n  volume_tags = {\n    owner = "a"\n  }');
  eq([e.state, names(e)], ['read', 'aws_instance.web edit +[tags.team,volume_tags.owner] -[tags.owner,volume_tags.team] ~[] =[]']);
  // the line's own text is unchanged and only its MAP changed: still a removal under one name and an addition under the other
  const r = res('  tags = {\n    owner = "a"\n  }');
  eq(names(read(r, '  tags = {\n    owner = "a"', '  volume_tags = {\n    owner = "a"')), 'aws_instance.web edit +[volume_tags.owner] -[tags.owner] ~[] =[]');
});
test('K21 the same key name in two resources: only the edited resource is named', () => {
  const base = `${res('  tags = {\n    owner = "a"\n  }', 'resource "aws_s3_bucket" "one" {')}${res('  tags = {\n    owner = "a"\n  }', 'resource "aws_s3_bucket" "two" {')}`;
  const r = run(pkg([`<<<<<<< SEARCH H1\nresource "aws_s3_bucket" "two" {\n  tags = {\n    owner = "a"\n=======\nresource "aws_s3_bucket" "two" {\n  tags = {\n    owner = "b"\n>>>>>>> REPLACE`], null, null), [file(base)]);
  eq(names(r.keys.edits[0]), 'aws_s3_bucket.two edit +[tags.owner] -[] ~[] =[]');
});
test('K22 an expression added to a map\'s construction (a new `merge` argument): expression-in-map', () => {
  eq(read(MAIN_TF, '  }, local.common_tags)', '  }, local.common_tags, local.extra_tags)').reason, 'expression-in-map');
});
test('K23 file-level limits are named: a `/* */` comment, an open string, a non-.tf file, a missing view', () => {
  eq(read(`/* header */\n${res('  ami = "x"')}`, '  ami = "x"', '  ami = "y"').reason, 'block-comment');
  eq(read(res('  note = "open\n  ami = "x"'), '  ami = "x"', '  ami = "y"').reason, 'brackets-unbalanced');
  eq(read(res('  ami = "x"'), '  ami = "x"', '  ami = "y"', '/terraform/prod.tfvars').reason, 'not-hcl-file');
  const f = file(res('  ami = "x"'));
  const app = computeEditApplication(pkg([edit('  ami = "x"', '  ami = "y"')], null, null), { files: [f], r9Version: 'paichart.r9/1' });
  eq(computePlanWitnessKeys(app, []).edits[0].reason, 'view-unavailable');
});
test('K24 a refused edit block is `edit-not-applied`; a block applied at two places (`count`) is one edit', () => {
  const r = run(pkg([edit('  no such line', '  x = 1')], null, null));
  eq([r.app.state, r.keys.edits.map((e) => [e.block, e.state, e.reason])], ['refused', [[1, 'unreadable', 'edit-not-applied']]]);
  const base = `${res('  tags = {\n    owner = "a"\n  }', 'resource "aws_s3_bucket" "one" {')}${res('  tags = {\n    owner = "a"\n  }', 'resource "aws_s3_bucket" "two" {')}`;
  const two = run(pkg(['<<<<<<< SEARCH H1 count=2\n    owner = "a"\n=======\n    owner = "b"\n>>>>>>> REPLACE'], null, null), [file(base)]);
  eq([two.app.state, two.keys.edits.length, names(two.keys.edits[0])], ['applied', 1, 'aws_s3_bucket.one edit +[tags.owner] -[] ~[] =[] | aws_s3_bucket.two edit +[tags.owner] -[] ~[] =[]']);
});
test('K25 a new FILE (`create` block): its resources are creates; a non-resource block in it is unreadable', () => {
  const mk = (body: string) => run(['## Held File Edits', '', `<<<<<<< create H2 on H1 /terraform/policy.tf\n${body}\n>>>>>>> create`, '', '## Held File Rollback', '', 'restore H1'].join('\n'));
  const a = mk('resource "aws_s3_bucket_policy" "p" {\n  bucket = "b"\n}');
  eq(a.app.state, 'applied', `fixture: ${JSON.stringify(a.app.refused)} `);
  eq([a.keys.edits[0].block, a.keys.edits[0].handle, a.keys.edits[0].state, names(a.keys.edits[0])], [0, 'H2', 'read', 'aws_s3_bucket_policy.p create +[] -[] ~[] =[]']);
  eq(mk('variable "v" {\n  default = 1\n}').keys.edits[0].reason, 'non-resource-block');
  eq(renderPlanWitnessForPrompt(computePlanWitness('## Plan witness\n- `aws_s3_bucket_policy.p` — create.\n', ENTRY, a.keys) as never)![4], '  - New file (H2): read — `aws_s3_bucket_policy.p` block added (action only).');
});
test('K26 never throws and never guesses: garbage in is a named state or null; the stored shape round-trips', () => {
  eq(planWitnessKeysOrNull(null, []), null);
  eq(planWitnessKeysOrNull({ state: 'applied', files: 7 } as never, []), null);
  const r = run(pkg([edit('  length = 24', '  length = 32')], null, null));
  eq(readPlanWitnessKeys(JSON.parse(JSON.stringify(r.keys))), r.keys);
  for (const bad of [null, 7, {}, { reader: 'other', edits: [] }, { reader: r.keys.reader, edits: [{ block: 1, state: 'unreadable', reason: 'made-up' }] }, { reader: r.keys.reader, edits: [{ block: 1, state: 'maybe' }] }]) eq(readPlanWitnessKeys(bad), null);
});

// ── W: the fact on whole packages (the L-CS-T plant shapes) ─────────────────────────────────────────────────────────
const OWNER_EDIT = edit('    team = "data"\n    tier = "cold"', '    team  = "data"\n    tier  = "cold"\n    owner = "data-platform"');
const POLICY_EDIT = edit('  bucket = "example-cold"', '  bucket = "example-cold"\n  policy = jsonencode({\n    Version = "2012-10-17"\n  })');
const W_KEYS = '- `aws_s3_bucket.cold` — update in place. Map key this change sets: `tags.owner` = `"data-platform"` (added). Derived key by key: `tags.owner → tags_all.owner` = `"data-platform"`.';
const W_POLICY = '- `aws_s3_bucket.cold` — update in place. Attribute this change sets: `policy` = the document above.';
test('W1 a key-level witness with fmt re-alignment: clean, and the re-aligned keys are stated (the R-KEYS over-block shape)', () => {
  const { fact } = run(pkg([OWNER_EDIT], W_KEYS));
  eq([fact.stopSentence, fact.stopSentenceForm, fact.witnessBlock, fact.listsCover], ['verbatim', 'byte-exact', 'present', 'all-edits']);
  eq([fact.missing, fact.missingResources, fact.wholeValueKeys, fact.realigned], [[], [], [], ['aws_s3_bucket.cold: tags.team', 'aws_s3_bucket.cold: tags.tier']]);
  eq(fact.keys, { checked: true, reader: 'paichart.hcl-keys/1', packageState: 'applied', editsTotal: 1, editsRead: 1, editsUnreadable: 0 });
});
test('W2 the altered stop sentence (missing "— a revert included —"): `altered`, everything else unchanged', () => {
  const { fact } = run(pkg([OWNER_EDIT], W_KEYS, STOP.replace(' — a revert included —', '')));
  eq([fact.stopSentence, fact.stopSentenceForm, fact.missing, fact.wholeValueKeys], ['altered', undefined, [], []]);
});
test('W3 no witness: sentence `absent`, block `absent`, and the lists are NOT compared (never an empty "none")', () => {
  const { fact } = run(pkg([OWNER_EDIT], null));
  eq([fact.stopSentence, fact.witnessBlock, fact.listsCover, fact.missing], ['absent', 'absent', 'not-checked', []]);
  eq(fact.keys.checked, true);
});
test('W4 a witness that omits `policy` (the R-INCOMPLETE plant): `missing` names it', () => {
  const { fact } = run(pkg([POLICY_EDIT], '- `aws_s3_bucket.cold` — update in place.'));
  eq([fact.stopSentence, fact.missing, fact.missingResources, fact.listsCover], ['verbatim', ['aws_s3_bucket.cold: policy'], [], 'all-edits']);
  eq(run(pkg([POLICY_EDIT], W_POLICY)).fact.missing, []);
});
test('W5 the stop sentence\'s own words are not the witness\'s names (`provider`, `action`, `key` …)', () => {
  const base = res('  provider_name = "a"\n  key = "a"');
  const { fact } = run(pkg([edit('  key = "a"', '  key = "b"')], '- `aws_instance.web` — update in place.'), [file(base)]);
  eq(fact.missing, ['aws_instance.web: key']);
});
test('W6 the whole `tags` map in the witness (the R-WHOLE-MAP plant): the unchanged siblings it gives a value for are listed', () => {
  const { fact } = run(pkg([OWNER_EDIT], '- `aws_s3_bucket.cold` — update in place. Attribute this change sets: `tags` = `{ team = "data", tier = "cold", owner = "data-platform" }`. Derived: `tags → tags_all` = the same map.'));
  eq([fact.missing, fact.wholeValueKeys], [[], ['aws_s3_bucket.cold: tags.team', 'aws_s3_bucket.cold: tags.tier']]);
  // naming an unchanged key WITHOUT giving it a value is not a whole-value witness
  eq(run(pkg([OWNER_EDIT], `${W_KEYS} The keys \`tags.team\` and \`tags.tier\` are not set by this change.`)).fact.wholeValueKeys, []);
  eq(run(pkg([OWNER_EDIT], `${W_KEYS}\n\n\`\`\`json\n{"team": "data"}\n\`\`\``)).fact.wholeValueKeys, ['aws_s3_bucket.cold: tags.team']);
});
test('W7 a create: the action only — no attribute is required; the address must be in the block', () => {
  const create = edit('  }, local.common_tags)\n}', '  }, local.common_tags)\n}\n\nresource "aws_s3_bucket_policy" "reports" {\n  bucket = aws_s3_bucket.reports.id\n  policy = jsonencode({ Version = "2012-10-17" })\n}');
  eq(run(pkg([create], '- `aws_s3_bucket_policy.reports` — create.')).fact.missing, []);
  const no = run(pkg([create], '- one new bucket policy — create.')).fact;
  eq([no.missing, no.missingResources], [[], ['aws_s3_bucket_policy.reports']]);
});
test('W8 the `lifecycle` edit alone: nothing was read, so nothing is compared (`no-edit-read`), never "none missing"', () => {
  const { fact } = run(pkg([edit('  }, local.common_tags)\n}', '  }, local.common_tags)\n\n  lifecycle {\n    prevent_destroy = true\n  }\n}')], '- `aws_s3_bucket.reports` — no plan action.'));
  eq([fact.stopSentence, fact.listsCover, fact.missing, fact.keys], ['verbatim', 'no-edit-read', [], { checked: true, reader: 'paichart.hcl-keys/1', packageState: 'applied', editsTotal: 1, editsRead: 0, editsUnreadable: 1 }]);
});
test('W9 one edit read and one not: the lists cover the read edit ONLY, and the fact says so', () => {
  const { fact } = run(pkg([edit('  length = 24', '  length = 32'), edit('  }, local.common_tags)\n}', '  }, local.common_tags)\n\n  lifecycle {\n    prevent_destroy = true\n  }\n}')], '- `random_password.db` — replace.'));
  eq([fact.listsCover, fact.missing, fact.edits.map((e) => [e.block, e.state, e.reason ?? null])], ['read-edits-only', ['random_password.db: length'], [[1, 'read', null], [2, 'unreadable', 'meta-argument']]]);
});
test('W10 a hard-wrapped stop sentence is `verbatim` (form `normalised`); no key read handed over ⇒ `no-key-read`, sentence still checked', () => {
  const words = STOP.split(' '); const wrapped = `${words.slice(0, 20).join(' ')}\n${words.slice(20, 45).join(' ')}\n${words.slice(45).join(' ')}`;
  const text = pkg([OWNER_EDIT], `${W_KEYS}\n\n${wrapped}`, null);
  eq([run(text).fact.stopSentence, run(text).fact.stopSentenceForm, run(text).fact.missing], ['verbatim', 'normalised', []]);
  const f = computePlanWitness(text, ENTRY, null);
  eq([f.stopSentence, f.keys, f.listsCover, f.edits], ['verbatim', { checked: false, reason: 'no-key-read' }, 'not-checked', []]);
  eq(computePlanWitness(text, ENTRY, { reader: 'x' }).keys, { checked: false, reason: 'no-key-read' });
});

// ── R: the §6 render (reworded 2026-11-18 after the re-lab) ─────────────────────────────────────────────────────────
const HEAD = '- **Plan witness — platform check** (computed by the platform from the package text and its kept-file edits; no model checked it):';
const LIFECYCLE_EDIT = edit('  }, local.common_tags)\n}', '  }, local.common_tags)\n\n  lifecycle {\n    prevent_destroy = true\n  }\n}');
const W_WHOLE = '- `aws_s3_bucket.cold` — update in place. Attribute this change sets: `tags` = `{ team = "data", tier = "cold", owner = "data-platform" }`.';
const render = (text: string, files?: Parameters<typeof run>[1]) => renderPlanWitnessForPrompt(run(text, files).fact as never)!;
test('R1 the clean key-level package (the R-KEYS shape), line for line: the outcome first, every list with its count, no closing line', () => {
  eq(render(pkg([OWNER_EDIT], W_KEYS)), [
    HEAD,
    '  - Result: no fault found; every edit was read.',
    '  - Stop sentence: `verbatim`.',
    '  - `Plan witness` block: present.',
    '  - Edit block 1 (H1): read — `aws_s3_bucket.cold` edited; sets `tags.owner`; re-spaced lines, which change no value: `tags.team`, `tags.tier`.',
    '  - Resources the block does not name (0): none.',
    '  - Missing from the block (0): none.',
    '  - Unchanged keys the block gives a value for (0): none.',
  ]);
});
test('R2 a witness missing `policy` (the R-INCOMPLETE shape): the fault is counted in the first line and on its list, and the platform says it returns the package', () => {
  eq(render(pkg([POLICY_EDIT], '- `aws_s3_bucket.cold` — update in place.')), [
    HEAD,
    '  - Result: 1 fault(s) found — listed below; every edit was read.',
    '  - Stop sentence: `verbatim`.',
    '  - `Plan witness` block: present.',
    '  - Edit block 1 (H1): read — `aws_s3_bucket.cold` edited; sets `policy`.',
    '  - Resources the block does not name (0): none.',
    '  - Missing from the block (1): `aws_s3_bucket.cold: policy` — the edits set or remove each of these and the block does not contain it.',
    '  - Unchanged keys the block gives a value for (0): none.',
    '  - The platform returns this package for revision on this ground, whatever the review concludes: `witness-incomplete`.',
  ]);
});
test('R3 the whole `tags` map (the R-WHOLE-MAP shape): each entry carries its own reason, and a re-spaced line is said NOT to excuse it', () => {
  eq(render(pkg([OWNER_EDIT], W_WHOLE)), [
    HEAD,
    '  - Result: 2 fault(s) found — listed below; every edit was read.',
    '  - Stop sentence: `verbatim`.',
    '  - `Plan witness` block: present.',
    '  - Edit block 1 (H1): read — `aws_s3_bucket.cold` edited; sets `tags.owner`; re-spaced lines, which change no value: `tags.team`, `tags.tier`.',
    '  - Resources the block does not name (0): none.',
    '  - Missing from the block (0): none.',
    '  - Unchanged keys the block gives a value for (2): `aws_s3_bucket.cold: tags.team` (the edits leave its value unchanged — its line is only re-spaced; the block states a value for it), `aws_s3_bucket.cold: tags.tier` (the edits leave its value unchanged — its line is only re-spaced; the block states a value for it).',
    '  - The platform returns this package for revision on this ground, whatever the review concludes: `witness-whole-value`.',
  ]);
  // the same fault with no re-spacing in the edit: the plain reason
  const plain = render(pkg([edit('    tier = "cold"', '    tier = "cold"\n    owner = "data-platform"')], W_WHOLE));
  eq(plain[7], '  - Unchanged keys the block gives a value for (2): `aws_s3_bucket.cold: tags.team` (the edits leave its value unchanged; the block states a value for it), `aws_s3_bucket.cold: tags.tier` (the edits leave its value unchanged; the block states a value for it).');
});
test('R4 an altered stop sentence, a resource the block does not name, a create', () => {
  const alt = render(pkg([POLICY_EDIT], W_POLICY, STOP.replace(' — a revert included —', '')));
  eq([alt[1], alt[2], alt[alt.length - 1]], [
    '  - Result: 1 fault(s) found — listed below; every edit was read.',
    "  - Stop sentence: `altered` — the package has a sentence that begins like the protocol's stop sentence and is not that sentence word for word.",
    '  - The platform returns this package for revision on this ground, whatever the review concludes: `stop-sentence-altered`.',
  ]);
  const create = edit('  length = 24\n}', '  length = 24\n}\n\nresource "aws_s3_bucket" "extra" {\n  bucket = "e"\n}');
  eq(render(pkg([create], '- `aws_s3_bucket.extra` — create.'))[4], '  - Edit block 1 (H1): read — `aws_s3_bucket.extra` block added (action only).');
  // a resource fault ALONE is never forced: the closing line says the review must block on it
  const res = render(pkg([create], '- one new bucket — create.'));
  eq([res[1], res[5], res[res.length - 1]], [
    '  - Result: 1 fault(s) found — listed below; every edit was read.',
    '  - Resources the block does not name (1): `aws_s3_bucket.extra` — the edits touch each of these and the block does not name it.',
    '  - The platform does not return this package for revision on the fault(s) above; block on them in your review.',
  ]);
});
test('R5 no witness: two faults, the names NOT compared, and the stop-sentence ground returns the package', () => {
  eq(render(pkg([OWNER_EDIT], null)), [
    HEAD,
    "  - Result: 2 fault(s) found — listed below; the edits' names were not compared (there is no block).",
    "  - Stop sentence: `absent` — the package does not contain the protocol's stop sentence.",
    '  - `Plan witness` block: absent.',
    '  - Edit block 1 (H1): read — `aws_s3_bucket.cold` edited; sets `tags.owner`; re-spaced lines, which change no value: `tags.team`, `tags.tier`.',
    '  - Names compared with the block: not compared — there is no `Plan witness` block.',
    '  - The platform returns this package for revision on this ground, whatever the review concludes: `stop-sentence-absent`.',
  ]);
});
test('R6 an unreadable edit: the first line says how many were NOT read; a fault in the read part is listed and is NOT forced', () => {
  const clean = render(pkg([edit('  length = 24', '  length = 32'), LIFECYCLE_EDIT], '- `random_password.db` — replace; `length` = 32.'));
  eq(clean, [
    HEAD,
    '  - Result: no fault found in what was read; 1 edit(s) NOT read — check those against the diff yourself.',
    '  - Stop sentence: `verbatim`.',
    '  - `Plan witness` block: present.',
    '  - Edit block 1 (H1): read — `random_password.db` edited; sets `length`.',
    '  - Edit block 2 (H1): not read (the edit sets a meta-argument) — the platform does not know which attributes this edit sets; check this edit against the diff yourself.',
    '  - Resources the block does not name (0): none.',
    '  - Missing from the block (0): none.',
    '  - Unchanged keys the block gives a value for (0): none.',
  ]);
  const faulty = render(pkg([edit('  length = 24', '  length = 32'), LIFECYCLE_EDIT], '- `random_password.db` — replace.'));
  eq([faulty[1], faulty[7], faulty[faulty.length - 1]], [
    '  - Result: 1 fault(s) found in what was read — listed below; 1 edit(s) NOT read — check those against the diff yourself.',
    '  - Missing from the block (1): `random_password.db: length` — the edits set or remove each of these and the block does not contain it.',
    '  - The platform does not return this package for revision on the fault(s) above; block on them in your review.',
  ]);
  const only = render(pkg([LIFECYCLE_EDIT], '- `aws_s3_bucket.reports` — no plan action.'));
  eq([only[1], only[only.length - 1]], ['  - Result: no fault found in what was read; 1 edit(s) NOT read — check those against the diff yourself.', '  - Names compared with the block: not compared — no edit was read.']);
  ok(!only.some((l) => l.endsWith('none.')), 'a package with no edit read must not print a "none" list');
});
test('R7 `checked:false` (the net\'s errorFact), no key read, and a package with no kept-file edit', () => {
  eq(renderPlanWitnessForPrompt({ version: 1, checked: false, reason: 'enrichment-error' }), [`${PLAN_WITNESS_RENDER_HEAD} not-checked: the platform could not run this check (enrichment-error). Check the Plan witness block and its stop sentence yourself.`]);
  eq(renderPlanWitnessForPrompt(computePlanWitness(pkg([OWNER_EDIT], W_KEYS), ENTRY, null) as never), [
    HEAD,
    '  - Result: no fault found; the kept-file edits were NOT read — check the block against the diff yourself.',
    '  - Stop sentence: `verbatim`.',
    '  - `Plan witness` block: present.',
    '  - Kept-file edits: not read — the platform has no reading of which attributes the edits set. Check the block against the diff yourself.',
  ]);
  // no key read + an altered sentence: the platform cannot see whether an edit was applied, so it does not claim the return
  const alt = renderPlanWitnessForPrompt(computePlanWitness(pkg([OWNER_EDIT], W_KEYS, STOP.replace('stop', 'halt')), ENTRY, null) as never)!;
  eq([alt[1], alt[alt.length - 1]], ['  - Result: 1 fault(s) found — listed below; the kept-file edits were NOT read — check the block against the diff yourself.',
    '  - The platform does not return this package for revision on the fault(s) above; block on them in your review.']);
  // a package that applies no kept-file edit (out of the force's scope): sentence absent ⇒ a fault the review must block on
  const none = render(['# Package', '', 'No held edit here.', '', '## Plan witness', '', '- nothing changes.'].join('\n'));
  eq(none, [
    HEAD,
    '  - Result: 1 fault(s) found — listed below; the package applies no kept-file edit.',
    "  - Stop sentence: `absent` — the package does not contain the protocol's stop sentence.",
    '  - `Plan witness` block: present.',
    '  - Kept-file edits: none applied in this package.',
    '  - Names compared with the block: not compared — no edit was read.',
    '  - The platform does not return this package for revision on the fault(s) above; block on them in your review.',
  ]);
  eq([renderPlanWitnessForPrompt(null), renderPlanWitnessForPrompt(undefined), renderPlanWitnessForPrompt([] as never)], [null, null, null]);
});
test('R8 the wording goals: no gap list can read as a covered list, and "set nothing" is gone from the re-spaced line', () => {
  const all = [render(pkg([OWNER_EDIT], W_KEYS)), render(pkg([POLICY_EDIT], '- `aws_s3_bucket.cold` — update in place.')), render(pkg([OWNER_EDIT], W_WHOLE)), render(pkg([OWNER_EDIT], null))].flat();
  ok(all.every((l) => !/^ {2}- (Resources|Missing|Unchanged)/.test(l) || /\(\d+\): /.test(l)), 'every list line carries its count');
  ok(all.filter((l) => l.startsWith('  - Result: ')).length === 4 && all.every((l, i2) => !l.startsWith('  - Result: ') || all[i2 - 1] === HEAD), 'the outcome is the first line under the head');
  ok(!all.some((l) => /Names the edits set or remove that the block does not contain|spacing-only|Coverage:/.test(l)), 'the old strings are gone');
});
test('R9 rendered in §6 from the carried Author entry, once; never from an inherited (cross-pipeline) entry', () => {
  const fact = run(pkg([OWNER_EDIT], W_KEYS)).fact;
  const entry = { taskId: 't-a', taskTitle: 'Author', agentRole: 'config_change_author', confidenceScore: 80, finalResponse: 'pkg', executionId: 'e1', truncated: false, originalChars: 3, source: 'result.json', degraded: false, planWitness: fact };
  const out = renderPipelineContextSection({ chainedFrom: [entry] }).join('\n');
  ok(out.includes(PLAN_WITNESS_RENDER_HEAD) && out.includes('  - Result: no fault found; every edit was read.'), out.slice(0, 600));
  eq(out.split(PLAN_WITNESS_RENDER_HEAD).length - 1, 1);
  ok(!renderPipelineContextSection({ chainedFrom: [{ ...entry, inheritedFromLeg: 'leg-x' }] }).join('\n').includes(PLAN_WITNESS_RENDER_HEAD), 'an inherited entry must not render it');
  const { planWitness: _drop, ...bare } = entry; void _drop;
  ok(!renderPipelineContextSection({ chainedFrom: [bare] }).join('\n').includes('Plan witness — platform check'), 'no fact ⇒ no line');
});

// ── N: through the real chokepoint ──────────────────────────────────────────────────────────────────────────────────
function stubDb() {
  return new Proxy({}, { get: (_t, prop) => (prop === '$queryRaw' || prop === '$queryRawUnsafe' ? async () => [] : new Proxy({}, { get: () => async () => null })) }) as never;
}
const OWNING_LEG = { kind: 'leg' as const, legId: 'leg-1', heldCapable: true, ownStageId: 'stage-1', gitFileSource: true, configSourceProtocol: null as string | null };
async function stamp(o: { role?: string; delta?: Record<string, unknown> | null; text: string; keys?: unknown; type?: string }) {
  const resultJson: Record<string, unknown> = { toolCalls: [], ...(o.delta === null ? {} : { protocolInjection: { delta: o.delta ?? { name: 'terraform-iac-protocol', version: '1.17.0' } } }) };
  const warns: string[] = [];
  await stampExecutionNets(stubDb(), {
    task: { id: 'author-1', type: o.type ?? 'ACTION', metadata: { pipelineStageId: 'stage-1' }, inputContext: {} },
    agentRole: o.role ?? 'config_change_author', harnessMode: null, finalResponse: o.text, executionId: 'exec-1',
    logger: { warn: (_o, m) => { warns.push(m); } }, owningLeg: OWNING_LEG as never,
    held: { editApplication: { version: 1, state: 'applied' }, baseHeldHandles: ['H1'], ...(o.keys !== undefined ? { planWitnessKeys: o.keys } : {}) },
  }, resultJson);
  return { resultJson, warns };
}
test('N1 a terraform-iac 1.17.0 Author: `planWitness` is stamped by stampExecutionNets, from the key read the core handed over', async () => {
  const text = pkg([POLICY_EDIT], '- `aws_s3_bucket.cold` — update in place.');
  const direct = run(text);
  const { resultJson } = await stamp({ text, keys: direct.keys });
  eq(resultJson.planWitness, direct.fact);
  eq((resultJson.planWitness as { missing: string[] }).missing, ['aws_s3_bucket.cold: policy']);
});
test('N2 NOT stamped: below 1.17.0, another protocol, no stamped protocol, another role, a PIPELINE task', async () => {
  const text = pkg([POLICY_EDIT], W_POLICY); const keys = run(text).keys;
  for (const [what, o] of [
    ['terraform 1.16.0', { delta: { name: 'terraform-iac-protocol', version: '1.16.0' } }],
    ['terraform 1.15.0 short name', { delta: { name: 'terraform-iac', version: '1.15.0' } }],
    ['kubernetes 1.19.0', { delta: { name: 'kubernetes-gitops-protocol', version: '1.19.0' } }],
    ['network 1.27.0', { delta: { name: 'network-provisioning-protocol', version: '1.27.0' } }],
    ['no protocolInjection', { delta: null }],
    ['the Harvester', { role: 'infra_state_harvester' }],
    ['the Reviewer', { role: 'change_reviewer' }],
    ['the Architect', { role: 'infra_change_architect' }],
  ] as Array<[string, Record<string, unknown>]>) {
    const { resultJson } = await stamp({ text, keys, ...o });
    ok(!('planWitness' in resultJson), `${what}: planWitness must not be stamped, got ${JSON.stringify(resultJson.planWitness)}`);
  }
});
test('N3 a later 1.x version stamps with the 1.17.0 sentence; no key read handed over is a named state, never a pass', async () => {
  const text = pkg([OWNER_EDIT], W_KEYS);
  const later = (await stamp({ text, keys: run(text).keys, delta: { name: 'terraform-iac', version: '1.18.0' } })).resultJson.planWitness as Record<string, unknown>;
  eq([later.sentenceVersion, later.stopSentence, later.protocol], ['1.17.0', 'verbatim', TF]);
  const none = (await stamp({ text })).resultJson.planWitness as Record<string, unknown>;
  eq([none.stopSentence, none.keys, none.listsCover], ['verbatim', { checked: false, reason: 'no-key-read' }, 'not-checked']);
});
test('N4 replay needs no held blob: the stored fact hands back the key read, and the net re-stamps the SAME bytes', async () => {
  for (const text of [pkg([OWNER_EDIT], W_KEYS), pkg([POLICY_EDIT], '- `aws_s3_bucket.cold` — update in place.', STOP.replace('stop', 'halt')), pkg([edit('  length = 24', '  length = 32'), edit('  }, local.common_tags)\n}', '  }, local.common_tags)\n\n  lifecycle {\n    prevent_destroy = true\n  }\n}')], 'x'), pkg([OWNER_EDIT], null)]) {
    const first = (await stamp({ text, keys: run(text).keys })).resultJson.planWitness;
    const stored = JSON.parse(JSON.stringify(first));
    const again = (await stamp({ text, keys: planWitnessKeysFromFact(stored) })).resultJson.planWitness;
    eq(JSON.stringify(again), JSON.stringify(first));
  }
  eq(planWitnessKeysFromFact({ version: 1, checked: true, keys: { checked: false, reason: 'no-key-read' }, edits: [] }), null);
  eq(planWitnessKeysFromFact({ version: 1, checked: false, reason: 'enrichment-error' }), null);
});

// ── C: the held-edit carrier (the stop-sentence force) ──────────────────────────────────────────────────────────────
const STAGE = 'stage-v'; const AUTH_EXEC = 'ex-author';
const TFLEG = { id: 'leg-v', type: 'PIPELINE', title: 'Buckets (protocol: terraform-iac)', metadata: { protocol: 'terraform-iac-protocol', pipelineStageId: STAGE } };
const OBSLEG = { id: 'leg-v', type: 'PIPELINE', title: 'Ingress (protocol: observability-config)', metadata: { protocol: 'observability-config-protocol', pipelineStageId: STAGE } };
const applied = { version: 1, state: 'applied', candidateDigest8: 'abcd1234' };
const rendered = { version: 1, state: 'rendered', authorExecutionId: AUTH_EXEC, candidateDigest8: 'abcd1234' };
// LL-CS-27 (2026-11-18): the fixture leg must read the same whether or not terraform-iac still awaits its Config-sources text. While
// it awaits, the carrier never reads a declaration; once the text ships, a Terraform leg IS a Config-sources leg and the carrier's
// Config-sources force runs BEFORE the stop sentence. So the leg carries a REAL, parsed declaration (its first-execution snapshot and
// the matching body) whose one `git-file` line is HELD by the authoritative Harvester's capture — the Config force is silent in both
// states and the stop sentence is what these cases test. `captureRefs: []` un-holds the file (the precedence case, C7).
const TF_BODY = '## Config sources\nmain-tf: git-file — service github-service ; paichart/paichart-configs/terraform/main.tf\n';
const TF_SNAPSHOT = buildConfigSourcesSnapshot('terraform-iac', resolveLegConfigSources({ protocol: 'terraform-iac-protocol', contractValue: undefined, taskBody: TF_BODY }), '2026-11-18T00:00:00.000Z');
const TF_HELD_REFS = [{ target: 'github:paichart:paichart-configs', path: '/terraform/main.tf' }];
function world(author: Record<string, unknown> | null, reviewer: Record<string, unknown> | null, witness: unknown, o: { olderAuthorWitness?: unknown; throwOnWitness?: boolean; newerAuthorAfterFirstRead?: unknown; captureRefs?: Array<{ target: string; path: string }>; notPinned?: number } = {}) {
  const sqls: string[] = [];
  const execs: StubExecution[] = [
    { id: AUTH_EXEC, taskId: 't-author', createdAt: new Date(1_700_000_000_000), result: { agentRole: 'config_change_author', finalResponse: 'pkg', ...(author ? { editApplication: author } : {}), ...(witness !== undefined ? { planWitness: witness } : {}) } },
    { id: 'ex-rev', taskId: 't-rev', createdAt: new Date(1_700_000_001_000), result: { agentRole: 'change_reviewer', finalResponse: 'review', reviewerVerdict: { approved: true, blocking: [] }, ...(reviewer ? { reviewedEditDiff: reviewer } : {}) } },
    { id: 'ex-harv', taskId: 't-harv', createdAt: new Date(1_699_999_999_000), result: { agentRole: 'infra_state_harvester', finalResponse: 'harvest', heldBytes: { version: 1 } } },
    ...(o.olderAuthorWitness !== undefined ? [{ id: 'ex-author-old', taskId: 't-author', createdAt: new Date(1_699_999_000_000), result: { agentRole: 'config_change_author', finalResponse: 'old', editApplication: applied, planWitness: o.olderAuthorWitness } } as StubExecution] : []),
  ];
  // a NEWER Author execution that lands between the carrier's two reads of the Author (the editApplication read, then the fact read)
  const racer: StubExecution = { id: 'ex-author-new', taskId: 't-author', createdAt: new Date(1_700_000_002_000), result: { agentRole: 'config_change_author', finalResponse: 'new', editApplication: applied, planWitness: o.newerAuthorAfterFirstRead } };
  const stub = authoritativeReadStub(o.newerAuthorAfterFirstRead !== undefined ? [...execs, racer] : execs);
  let authorSelections = 0; let legRowReads = 0;
  const db: any = {
    ...stub,
    agentExecution: { ...stub.agentExecution, findMany: async (args: { where?: Record<string, unknown> }) => {
      const rows = await stub.agentExecution.findMany(args);
      if (args?.where?.taskId !== 't-author' || o.newerAuthorAfterFirstRead === undefined) return rows;
      authorSelections++;
      return authorSelections === 1 ? rows.filter((r: { id: string }) => r.id !== racer.id) : rows;
    } },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      // the carrier's read of the leg's governing Config-sources declaration (made only once terraform-iac is a Config-sources
      // protocol). It arrives as ONE Prisma.sql object, not a template-strings array — answer it before treating the call as one.
      if (JSON.stringify(strings).includes(CONFIG_SOURCES_SNAPSHOT_KEY)) { legRowReads++; return [{ description: TF_BODY, contract: null, snapshot: TF_SNAPSHOT, protocolStamped: true }]; }
      const sql = strings.join('?'); sqls.push(sql);
      if (o.throwOnWitness && sql.includes("->>'planWitness'")) throw new Error('db down');
      return stub.$queryRaw(strings, ...values);
    },
    task: { findMany: async () => [
      { id: 't-harv', title: 'Harvest x', agentRole: 'infra_state_harvester', type: 'ACTION' },
      { id: 't-author', title: 'Author x', agentRole: 'config_change_author', type: 'ACTION' },
      { id: 't-rev', title: 'Review x', agentRole: 'change_reviewer', type: 'ACTION' }], findUnique: async () => null },
    heldCaptureRefusal: { count: async () => o.notPinned ?? 0, findFirst: async () => null },
    heldFileRef: { findMany: async (a: { where: { kind: string } }) => (a.where.kind === 'CAPTURE' ? (o.captureRefs ?? TF_HELD_REFS) : [{ legTaskId: 'leg-v' }]) },
  };
  return { db, witnessReads: () => sqls.filter((s) => s.includes("->>'planWitness'")).length, legRowReads: () => legRowReads };
}
const merge = (outcome = 'approved') => ({ pipelineStageId: STAGE, qualityGate: { outcome, reviewerScore: 80 } }) as Record<string, any>;
const witnessFact = (stopSentence: string, extra: Record<string, unknown> = {}) => ({ version: 1, checked: true, protocol: TF, sentenceVersion: '1.17.0', stopSentence, witnessBlock: 'present', ...extra });
const deps = { isHeldCapableLeg: () => true };
test('C1 the force: an approved Terraform leg whose Author\'s stop sentence is altered or absent becomes needs-revision, with the named reason', async () => {
  for (const [state, reason] of [['altered', 'stop-sentence-altered'], ['absent', 'stop-sentence-absent']] as const) {
    const { db } = world(applied, rendered, witnessFact(state)); const m = merge();
    const r = await applyHeldEditCarrier(db, TFLEG, m, deps);
    eq([r, m.qualityGate.outcome, m.qualityGate.heldEdit], [{ applied: true, forced: true }, 'needs-revision', { state: 'applied', reviewerSaw: 'rendered', agentOutcome: 'approved', forced: true, inScope: true, reason }], `${state}: `);
    eq(heldEditOutcomeLine(m.qualityGate.heldEdit), `Platform outcome: needs-revision — edit application \`applied\` / reviewer \`rendered\` / reason \`${reason}\`; the leg's approval was overridden by the platform.`);
  }
  eq(PLAN_WITNESS_FORCE_REASONS, { altered: 'stop-sentence-altered', absent: 'stop-sentence-absent', incomplete: 'witness-incomplete', wholeValue: 'witness-whole-value' });
});
test('C2 no force: a verbatim sentence with clean lists; and a missing name or whole-value key where NOT every edit was read (the by-eye fallback stands)', async () => {
  for (const w of [witnessFact('verbatim'), witnessFact('verbatim', { listsCover: 'all-edits', missing: [], wholeValueKeys: [], missingResources: ['a.b'], realigned: ['a.b: tags.team'] }), witnessFact('verbatim', { missing: ['a.b: policy'], wholeValueKeys: ['a.b: tags.team'], listsCover: 'read-edits-only', edits: [{ block: 1, handle: 'H1', state: 'unreadable', reason: 'meta-argument', resources: [] }] })]) {
    const { db } = world(applied, rendered, w); const m = merge();
    eq([await applyHeldEditCarrier(db, TFLEG, m, deps), m.qualityGate.outcome, 'reason' in m.qualityGate.heldEdit], [{ applied: true, forced: false }, 'approved', false]);
  }
});
test('C3 "could not read" never forces: no stamp (every leg below 1.17.0), the errorFact, an unparseable or foreign-version stamp, a failed read', async () => {
  for (const [what, w, o] of [
    ['no stamp', undefined, {}], ['errorFact', { version: 1, checked: false, reason: 'enrichment-error' }, {}], ['a string', 'altered', {}],
    ['another version', { ...witnessFact('absent'), version: 2 }, {}], ['the read throws', witnessFact('absent'), { throwOnWitness: true }],
  ] as Array<[string, unknown, { throwOnWitness?: boolean }]>) {
    const { db } = world(applied, rendered, w, o); const m = merge();
    eq([await applyHeldEditCarrier(db, TFLEG, m, deps), m.qualityGate.outcome, m.qualityGate.heldEdit.reason], [{ applied: true, forced: false }, 'approved', undefined], `${what}: `);
  }
  eq([planWitnessForceReason(null), planWitnessForceReason({}), planWitnessForceReason(witnessFact('verbatim')), planWitnessForceReason(witnessFact('altered')), planWitnessForceReason({ ...witnessFact('absent'), checked: false })], [null, null, null, 'stop-sentence-altered', null]);
});
test('C4 precedence: the stop sentence is LAST — the package\'s own reason, and a Reviewer that saw no diff, keep their names', async () => {
  for (const [a, rv, reason] of [[{ version: 1, state: 'refused' }, rendered, 'refused'], [applied, null, 'reviewer-saw-no-diff'], [applied, { ...rendered, candidateDigest8: 'ffff0000' }, 'reviewed-stale-author']] as Array<[Record<string, unknown>, Record<string, unknown> | null, string]>) {
    const { db } = world(a, rv, witnessFact('absent')); const m = merge();
    await applyHeldEditCarrier(db, TFLEG, m, deps);
    eq([m.qualityGate.outcome, m.qualityGate.heldEdit.reason], ['needs-revision', reason], `${reason}: `);
  }
});
test('C5 scope: an out-of-scope package (no held grammar) is not forced by the stop sentence; a needs-revision write is not "forced"', async () => {
  const { db } = world({ version: 1, state: 'no-edits', blocksTotal: 0, rollbackRestores: 0 }, null, witnessFact('absent')); const m = merge();
  eq([await applyHeldEditCarrier(db, TFLEG, m, deps), m.qualityGate.outcome, m.qualityGate.heldEdit.inScope, m.qualityGate.heldEdit.reason], [{ applied: true, forced: false }, 'approved', false, undefined]);
  const w2 = world(applied, rendered, witnessFact('altered')); const m2 = merge('needs-revision');
  eq([await applyHeldEditCarrier(w2.db, TFLEG, m2, deps), m2.qualityGate.heldEdit.forced, m2.qualityGate.heldEdit.reason], [{ applied: true, forced: false }, false, 'stop-sentence-altered']);
});
test('C6 population: a leg of another protocol never reads the fact; the fact must be the SELECTED Author execution\'s own', async () => {
  const k = world(applied, rendered, witnessFact('absent')); const m = merge();
  eq([await applyHeldEditCarrier(k.db, OBSLEG, m, deps), m.qualityGate.outcome, k.witnessReads()], [{ applied: true, forced: false }, 'approved', 0]);
  const t = world(applied, rendered, witnessFact('altered')); await applyHeldEditCarrier(t.db, TFLEG, merge(), deps);
  eq(t.witnessReads(), 1, 'one read on a Terraform leg: ');
  // the newest Author execution has no fact; an older one's altered fact must not force
  const o = world(applied, rendered, undefined, { olderAuthorWitness: witnessFact('altered') }); const mo = merge();
  eq([await applyHeldEditCarrier(o.db, TFLEG, mo, deps), mo.qualityGate.outcome], [{ applied: true, forced: false }, 'approved']);
  // a newer Author execution lands between the two reads: its fact is not the selected Author's, so it does not force this write
  const n = world(applied, rendered, witnessFact('verbatim'), { newerAuthorAfterFirstRead: witnessFact('altered') }); const mn = merge();
  eq([await applyHeldEditCarrier(n.db, TFLEG, mn, deps), mn.qualityGate.outcome, n.witnessReads()], [{ applied: true, forced: false }, 'approved', 1]);
});

test('C7 precedence, stated: a force above the stop sentence keeps its own reason — `source-not-pinned` always; the Config-sources force wherever Terraform is a Config-sources protocol', async () => {
  // (a) holds in BOTH states of the awaiting list: a refused off-pin read on the authoritative Harvester outranks the stop sentence
  const p = world(applied, rendered, witnessFact('absent'), { notPinned: 1 }); const mp = merge();
  eq([await applyHeldEditCarrier(p.db, TFLEG, mp, deps), mp.qualityGate.outcome, mp.qualityGate.heldEdit.reason], [{ applied: true, forced: true }, 'needs-revision', 'source-not-pinned']);
  // (b) the declared Git file is NOT held. Where terraform-iac is a Config-sources protocol the Config force names it and wins; while
  // terraform-iac still awaits its text the carrier reads no declaration, so the stop sentence is the reason. Both arms are pinned.
  const live = legProtocolHasConfigLane({ title: TFLEG.title, metadata: TFLEG.metadata });
  const c = world(applied, rendered, witnessFact('absent'), { captureRefs: [] }); const mc = merge();
  await applyHeldEditCarrier(c.db, TFLEG, mc, deps);
  if (live) eq([mc.qualityGate.outcome, mc.qualityGate.heldEdit.reason, mc.qualityGate.heldEdit.gitFilesNotHeld, c.legRowReads()], ['needs-revision', 'git-file-not-held', ['main-tf'], 1]);
  else eq([mc.qualityGate.outcome, mc.qualityGate.heldEdit.reason, c.legRowReads()], ['needs-revision', 'stop-sentence-absent', 0]);
  // the fixture's own claim: with the file held, the declaration read (when made) is silent and the stop sentence is the reason
  const h = world(applied, rendered, witnessFact('absent')); const mh = merge();
  await applyHeldEditCarrier(h.db, TFLEG, mh, deps);
  eq([mh.qualityGate.heldEdit.reason, h.legRowReads()], ['stop-sentence-absent', live ? 1 : 0]);
  console.log(`   (C7 ran with terraform-iac ${live ? 'LIVE as a Config-sources protocol' : 'AWAITING its Config-sources text'})`);
});

test('C7b (Config sources STEP 3 P1) the same carrier fixture in BOTH awaiting states of the Terraform row, through the carrier\'s own parameter — neither reason moved with the observability row', async () => {
  const TFP = 'terraform-iac-protocol';
  // every awaiting list a tree can ship: the one shipped today (observability awaiting), none awaiting, Terraform awaiting, both awaiting
  const lists: Array<[string, readonly string[] | undefined, boolean]> = [
    ['as shipped', undefined, true], ['no row awaiting', [], true], ['Terraform awaiting', [TFP], false], ['Terraform and observability awaiting', [TFP, 'observability-config-protocol'], false]];
  for (const [name, configAwaiting, tfLive] of lists) {
    const d = { ...deps, ...(configAwaiting ? { configAwaiting } : {}) };
    // the declared Git file NOT held
    const c = world(applied, rendered, witnessFact('absent'), { captureRefs: [] }); const mc = merge();
    await applyHeldEditCarrier(c.db, TFLEG, mc, d);
    eq([mc.qualityGate.outcome, mc.qualityGate.heldEdit.reason, c.legRowReads()], tfLive ? ['needs-revision', 'git-file-not-held', 1] : ['needs-revision', 'stop-sentence-absent', 0], `${name}, file not held: `);
    // the file held: the declaration read is silent and the stop sentence is the reason, in every state
    const h = world(applied, rendered, witnessFact('absent')); const mh = merge();
    await applyHeldEditCarrier(h.db, TFLEG, mh, d);
    eq([mh.qualityGate.heldEdit.reason, h.legRowReads()], ['stop-sentence-absent', tfLive ? 1 : 0], `${name}, file held: `);
    // a refused off-pin read outranks both, in every state
    const p = world(applied, rendered, witnessFact('absent'), { notPinned: 1 }); const mp = merge();
    await applyHeldEditCarrier(p.db, TFLEG, mp, d);
    eq(mp.qualityGate.heldEdit.reason, 'source-not-pinned', `${name}, off-pin read: `);
  }
});

test('C8 the list forces (owner 2026-11-18): every edit read + a missing name ⇒ `witness-incomplete`; + a whole-value key ⇒ `witness-whole-value`', async () => {
  const full = (extra: Record<string, unknown>) => witnessFact('verbatim', { listsCover: 'all-edits', missing: [], wholeValueKeys: [], missingResources: [], ...extra });
  for (const [what, w, reason] of [
    ['missing', full({ missing: ['a.b: policy'] }), 'witness-incomplete'],
    ['whole value', full({ wholeValueKeys: ['a.b: tags.team'] }), 'witness-whole-value'],
    ['both lists ⇒ incomplete first', full({ missing: ['a.b: policy'], wholeValueKeys: ['a.b: tags.team'] }), 'witness-incomplete'],
    ['altered sentence outranks both lists', { ...full({ missing: ['a.b: policy'], wholeValueKeys: ['a.b: tags.team'] }), stopSentence: 'altered' }, 'stop-sentence-altered'],
  ] as Array<[string, Record<string, unknown>, string]>) {
    const { db } = world(applied, rendered, w); const m = merge();
    eq([await applyHeldEditCarrier(db, TFLEG, m, deps), m.qualityGate.outcome, m.qualityGate.heldEdit.reason], [{ applied: true, forced: true }, 'needs-revision', reason], `${what}: `);
  }
  eq(heldEditOutcomeLine({ forced: true, state: 'applied', reviewerSaw: 'rendered', reason: 'witness-incomplete' }), "Platform outcome: needs-revision — edit application `applied` / reviewer `rendered` / reason `witness-incomplete`; the leg's approval was overridden by the platform.");
});
test('C9 the list forces never fire: lists not covering every edit, an absent block, missingResources / realigned alone, a not-checked fact, another fact version', async () => {
  const lists = { missing: ['a.b: policy'], wholeValueKeys: ['a.b: tags.team'], missingResources: ['a.b'] };
  for (const [what, w] of [
    ['read-edits-only', witnessFact('verbatim', { listsCover: 'read-edits-only', ...lists })],
    ['no-edit-read', witnessFact('verbatim', { listsCover: 'no-edit-read', ...lists })],
    ['not-checked', witnessFact('verbatim', { listsCover: 'not-checked', ...lists })],
    ['listsCover missing', witnessFact('verbatim', lists)],
    ['resources + realigned only', witnessFact('verbatim', { listsCover: 'all-edits', missing: [], wholeValueKeys: [], missingResources: ['a.b'], realigned: ['a.b: tags.team'] })],
    ['lists not arrays', witnessFact('verbatim', { listsCover: 'all-edits', missing: 'a.b: policy', wholeValueKeys: 3 })],
    ['checked false', { ...witnessFact('verbatim', { listsCover: 'all-edits', ...lists }), checked: false }],
    ['version 2', { ...witnessFact('verbatim', { listsCover: 'all-edits', ...lists }), version: 2 }],
  ] as Array<[string, Record<string, unknown>]>) {
    const { db } = world(applied, rendered, w); const m = merge();
    eq([await applyHeldEditCarrier(db, TFLEG, m, deps), m.qualityGate.outcome, m.qualityGate.heldEdit.reason], [{ applied: true, forced: false }, 'approved', undefined], `${what}: `);
  }
});
test('C10 the list forces keep the stop sentence\'s scope and place: out-of-scope package, another reason first, another protocol, a needs-revision write', async () => {
  const w = witnessFact('verbatim', { listsCover: 'all-edits', missing: ['a.b: policy'], wholeValueKeys: [] });
  // no held edit (out of scope): not forced
  const o = world({ version: 1, state: 'no-edits', blocksTotal: 0, rollbackRestores: 0 }, null, w); const mo = merge();
  eq([await applyHeldEditCarrier(o.db, TFLEG, mo, deps), mo.qualityGate.outcome, mo.qualityGate.heldEdit.inScope], [{ applied: true, forced: false }, 'approved', false]);
  // the package's own reason, a Reviewer that saw no diff, and an off-pin read keep their names
  for (const [a, rv, opt, reason] of [[{ version: 1, state: 'partial' }, rendered, {}, 'partial'], [applied, null, {}, 'reviewer-saw-no-diff'], [applied, rendered, { notPinned: 1 }, 'source-not-pinned']] as Array<[Record<string, unknown>, Record<string, unknown> | null, { notPinned?: number }, string]>) {
    const x = world(a, rv, w, opt); const mx = merge();
    await applyHeldEditCarrier(x.db, TFLEG, mx, deps);
    eq([mx.qualityGate.outcome, mx.qualityGate.heldEdit.reason], ['needs-revision', reason], `${reason}: `);
  }
  // a leg of another protocol never reads the fact
  const k = world(applied, rendered, w); const mk = merge();
  eq([await applyHeldEditCarrier(k.db, OBSLEG, mk, deps), mk.qualityGate.outcome, k.witnessReads()], [{ applied: true, forced: false }, 'approved', 0]);
  // a needs-revision write names the reason and is not "forced"
  const n2 = world(applied, rendered, w); const mn2 = merge('needs-revision');
  eq([await applyHeldEditCarrier(n2.db, TFLEG, mn2, deps), mn2.qualityGate.heldEdit.forced, mn2.qualityGate.heldEdit.reason], [{ applied: true, forced: false }, false, 'witness-incomplete']);
});
test('C11 end to end on real fact objects: the plant shapes force by name, the clean and the partly-read packages do not', async () => {
  const cases: Array<[string, string, string | null]> = [
    ['witness missing policy', pkg([POLICY_EDIT], '- `aws_s3_bucket.cold` — update in place.'), 'witness-incomplete'],
    ['whole tags map', pkg([OWNER_EDIT], W_WHOLE), 'witness-whole-value'],
    ['key-level witness with re-spaced lines', pkg([OWNER_EDIT], W_KEYS), null],
    ['complete policy witness', pkg([POLICY_EDIT], W_POLICY), null],
    ['a missing name beside an unreadable edit', pkg([edit('  length = 24', '  length = 32'), LIFECYCLE_EDIT], '- `random_password.db` — replace.'), null],
    ['a resource the block does not name', pkg([edit('  length = 24\n}', '  length = 24\n}\n\nresource "aws_s3_bucket" "extra" {\n  bucket = "e"\n}')], '- one new bucket — create.'), null],
  ];
  for (const [what, text, reason] of cases) {
    const fact = JSON.parse(JSON.stringify(run(text).fact));
    eq(planWitnessForceReason(fact), reason, `${what} (helper): `);
    const { db } = world(applied, rendered, fact); const m = merge();
    await applyHeldEditCarrier(db, TFLEG, m, deps);
    eq([m.qualityGate.outcome, m.qualityGate.heldEdit.reason ?? null], [reason ? 'needs-revision' : 'approved', reason], `${what}: `);
  }
});

// ── P: pins ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test('P1 the registry: `planWitness` — appended last at its build, and since Config sources STEP 3 P3 (2026-11-21) followed ONLY by `fileSourceCompare`: one leaf-persist point, conditional, with a §6 render and no card segment', () => {
  eq(MECHANICAL_NETS.slice(-2).map((n) => n.name), ['planWitness', 'fileSourceCompare']);
  const last = MECHANICAL_NETS[MECHANICAL_NETS.length - 2];
  eq([last.name, last.point, last.conditionalStampReason, last.renderCard, typeof last.renderPrompt, typeof last.summaryExcludedReason], ['planWitness', 'leaf-persist', 'not-plan-witness-version', null, 'function', 'string']);
  eq(MECHANICAL_NETS.filter((n) => n.name === 'planWitness').length, 1);
  eq(last.errorFact(), { version: 1, checked: false, reason: 'enrichment-error' });
});
test('P2 placement: the operator tail, appended last; NOT on the summary whitelist (nor nested under editApplication)', () => {
  eq(RESULT_JSON_OPERATOR_TAIL_KEYS.slice(-2), ['planWitness', 'fileSourceCompare']);   // + fileSourceCompare (STEP 3 P3), appended after it
  ok(!(RESULT_JSON_SUMMARY_KEYS as readonly string[]).includes('planWitness'), 'planWitness on the summary whitelist');
  ok(!fs.readFileSync(path.join(__dirname, '..', 'lib/agents/harness/held-bytes/edit-fact.ts'), 'utf8').includes('planWitness'), 'the editApplication fact must not carry it');
});
test('P3 delivery: carried to the leg Reviewer only, from a leaf dependency only', () => {
  eq([...PLAN_WITNESS_READERS], ['change_reviewer']);
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/agents/harness/context-chainer.ts'), 'utf8');
  ok(/const planWitness = !isPipelinePredecessor && stampedWitness[\s\S]{0,160}PLAN_WITNESS_READERS\.has/.test(src), 'the carry is not gated on leaf + reader');
  ok(src.includes('...(planWitness ? { planWitness } : {}),'), 'the entry field is not conditional');
});
test('P4 the unreadable reasons are a CLOSED list, each with its words; the module imports nothing at runtime (client-safe)', () => {
  eq([...PLAN_WITNESS_UNREADABLE_REASONS].sort(), Object.keys(PLAN_WITNESS_REASON_WORDS).sort());
  eq(PLAN_WITNESS_UNREADABLE_REASONS.length, 13);
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/agents/harness/plan-witness.ts'), 'utf8');
  // The ONE runtime import is the stop-sentence module, which itself imports nothing — the protocol seed imports THAT module, because the
  // deploy compiles the seed and everything it reaches under prisma/tsconfig.seed.json (test:seed-config-compiles, 2026-11-19).
  eq((src.match(/^import .*$/gm) ?? []).filter((l) => !l.startsWith('import type ')),
    ["import { TERRAFORM_PROTOCOL, canonical, PLAN_WITNESS_STOP_SENTENCES, planWitnessStopSentenceFor } from './plan-witness-stop-sentence';"]);
  const sent = fs.readFileSync(path.join(__dirname, '..', 'lib/agents/harness/plan-witness-stop-sentence.ts'), 'utf8');
  eq(sent.match(/^import .*$/gm) ?? [], []);
  const seed = fs.readFileSync(path.join(__dirname, 'seed-protocol-prompts.ts'), 'utf8');
  ok(seed.includes("from '../lib/agents/harness/plan-witness-stop-sentence'") && !seed.includes("from '../lib/agents/harness/plan-witness'"), 'the seed imports the dependency-free module, never plan-witness.ts');
});
test('P6 MI-13 carries the version key pair for pair, and counts the stamps by stop-sentence state', () => {
  const sh = fs.readFileSync(path.join(__dirname, 'report-mechanism-inventory.sh'), 'utf8');
  const i = sh.indexOf('🔴 a planWitness stamp on an execution composed below');
  ok(i >= 0, 'the 🔴 planWitness version line exists');
  const block = sh.slice(i, i + 700);
  for (const [p, versions] of Object.entries(PLAN_WITNESS_STOP_SENTENCES)) {
    const first = Object.keys(versions).sort()[0];
    ok(block.includes(`'${p}'`) && block.includes(`'{${first.split('.').join(',')}}'::int[]`), `MI-13 must carry ${p} ≥ ${first}`);
  }
  ok(sh.includes("⚪ planWitness stamps (Terraform Authors) by stop sentence / witness block") && sh.includes("· planWitness: edits not read, by reason: "), 'the ⚪ lines');
});
test('P5 the core hands the key read over as a PLAIN property, version-keyed on the built resultJson; the replay hydrates it from the stored fact', () => {
  const core = fs.readFileSync(path.join(__dirname, '..', 'lib/services/execution-core.ts'), 'utf8');
  ok(/if \(planWitnessApplies\(\(resultJson as Record<string, unknown>\)\.protocolInjection\)\) \{\s*heldStamps\.planWitnessKeys = planWitnessKeysOrNull\(pkg\.application, step\.files\);/.test(core), 'the core does not build the key read under the version key');
  const replay = fs.readFileSync(path.join(__dirname, 'replay-nets.ts'), 'utf8');
  ok(replay.includes('planWitnessKeysFromFact(parsed.planWitness)'), 'the replay does not hydrate the key read');
});

(async () => {
  for (const t of pending) {
    try { await t.fn(); passed++; console.log(`✅ ${t.d}`); } catch (e) { failed++; console.log(`❌ ${t.d}\n   ${(e as Error).message}`); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

// (kept for the type checker: the keys type is part of the suite's surface)
export type { PlanWitnessKeys };
