/**
 * The `## Consumed Values` contract is ONE family across every protocol that asks an Author to emit the block
 * (2026-11-28, protocol obligation audit F-N1 / duplicate family D8; owner sitting 1 decision 5).
 *
 * WHY. The block feeds a MACHINE check (`checkConsumedValues`, lib/agents/harness/derivation-containment.ts): the same
 * parser, the same kind-scoped comparison, for every domain. The paragraph telling an Author how to write it lives once per
 * protocol (each must read standalone — R5), and four copies drifted: on 2026-09-19 the network and observability copies
 * gained "It is a JSON ARRAY, even for a single value — a bare object is read as UNPARSEABLE", and terraform-iac and
 * kubernetes-gitops never did, although the parser refuses a bare object there too (`Array.isArray(parsed)`). Nothing
 * pinned the family, so the drift sat for two months until a reading audit found it.
 *
 * WHAT THIS PINS. The population is DERIVED (every protocol whose body tells the Author to "emit a fenced JSON block headed
 * `## Consumed Values`"), never listed, so a new consuming protocol joins automatically; a population under 4 fails (a
 * vacuous pass is the failure mode this guards against). Each member must carry every family sentence below.
 * Reads RENDERED text (PROTOCOLS), so interpolated constants count.
 *
 * COUNTED EXCEPTION — shrinks, never grows: terraform-iac + kubernetes-gitops lack the JSON-array sentence until the final
 * text release (CLOSE-OUT-PLAN Track C, Protocol 16). A listed protocol that GAINS the sentence fails until the exception
 * is deleted. Record: cline_docs/reviews/protocol-obligation-audit-2026-11-28/AUDIT.md (F-N1).
 */
const seed = require('./seed-protocol-prompts') as { PROTOCOLS: Array<{ name: string; promptText: string; status?: string }> };

const EMITS = 'emit a fenced JSON block headed \\`## Consumed Values\\`'.replace(/\\`/g, '`');

/** Family sentences: each states a property the machine check depends on. */
const FAMILY: Array<[string, string]> = [
  ['array', 'It is a JSON ARRAY, even for a single value'],
  ['closed kind set', 'CLOSED set `cidr` | `asn`'],
  ['copy from own artifact', 'COPY IT FROM YOUR OWN ARTIFACT'],
  ['the violation it produces', 'consumed-value-mismatch'],
  ['the absent case', 'Omit the block if your package applies no chained value'],
];

const KNOWN_MISSING: Record<string, string[]> = {
  'terraform-iac-protocol': ['array'],
  'kubernetes-gitops-protocol': ['array'],
};

let failed = 0;
const fail = (m: string) => { console.log(`❌ ${m}`); failed++; };

const members = seed.PROTOCOLS.filter((p) => (p.status ?? 'ACTIVE') === 'ACTIVE' && p.promptText.includes(EMITS));
if (members.length < 4) fail(`population is ${members.length} (expected ≥ 4): the emission sentence moved, so this test is scanning nothing`);

for (const p of members) {
  const exempt = KNOWN_MISSING[p.name] ?? [];
  for (const [key, sentence] of FAMILY) {
    const has = p.promptText.includes(sentence);
    if (exempt.includes(key)) {
      if (has) fail(`${p.name} now carries the "${key}" sentence — DELETE its KNOWN_MISSING entry (exceptions shrink, never linger)`);
      else console.log(`⚪ ${p.name}: "${key}" sentence absent — EXEMPT until the final text release (audit F-N1)`);
    } else if (!has) {
      fail(`${p.name} lacks the "${key}" sentence: "${sentence}"`);
    }
  }
}
for (const name of Object.keys(KNOWN_MISSING)) {
  if (!members.some((p) => p.name === name)) fail(`KNOWN_MISSING names ${name}, which no longer emits the block — remove the entry`);
}

if (failed) process.exit(1);
console.log(`✅ Consumed Values family: ${members.length} protocols × ${FAMILY.length} sentences (${members.map((p) => p.name.replace('-protocol', '')).join(', ')})`);
