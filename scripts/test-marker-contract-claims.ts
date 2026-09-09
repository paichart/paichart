/**
 * The MACHINE-PARSED MARKER clause is a platform-behaviour claim in agent-facing prose (S5 class).
 * On 2026-08-21 it said "nested … reads the block as ABSENT"; the parser had been heading-tolerant
 * since 2026-07-18, and on 2026-09-09 a reviewer blocked a parsed-clean block by applying the stale
 * wording. This pins the claim to the parser it describes, both directions:
 *   1. the parser really does tolerate nesting/furniture and really does reject a retitled marker;
 *   2. every copy of the clause states that, and none says nesting reads ABSENT.
 */
import * as fs from 'fs';
import { parseFencedJsonBlock, DERIVED_VALUES_MARKER } from '../lib/agents/harness/derivation-containment';
let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; };
const body = '```json\n[{"kind":"cidr","value":"10.99.0.6/31","members":["10.99.0.6/32","10.99.0.7/32"]}]\n```\n';
check('parser: standalone ## Derived Values parses', parseFencedJsonBlock(`## Derived Values\n${body}`, DERIVED_VALUES_MARKER) !== null);
check('parser: NESTED ### Derived Values under another H2 parses', parseFencedJsonBlock(`## Pre-existing Allocations\ntext\n### Derived Values\n${body}`, DERIVED_VALUES_MARKER) !== null);
check('parser: emphasis furniture **Derived Values** parses', parseFencedJsonBlock(`**Derived Values**\n${body}`, DERIVED_VALUES_MARKER) !== null);
check('parser: ORDINAL furniture ### 6. Consumed Values parses (devext Run 4 block)', parseFencedJsonBlock(`### 6. Derived Values\n${body}`, DERIVED_VALUES_MARKER) !== null);
check('parser: ORDINAL furniture ## 6) / (6) parses', parseFencedJsonBlock(`## 6) Derived Values\n${body}`, DERIVED_VALUES_MARKER) !== null && parseFencedJsonBlock(`(6) Derived Values\n${body}`, DERIVED_VALUES_MARKER) !== null);
check('parser: RETITLED heading reads ABSENT', parseFencedJsonBlock(`## Pre-existing Allocations\n${body}`, DERIVED_VALUES_MARKER) === null);
check('parser: prose mention does not count', parseFencedJsonBlock(`the derived values are below\n${body}`, DERIVED_VALUES_MARKER) === null && parseFencedJsonBlock(`the 6 derived values are below\n${body}`, DERIVED_VALUES_MARKER) === null);
const seed = fs.readFileSync('scripts/seed-protocol-prompts.ts', 'utf8');
const tmpl = fs.readFileSync('lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts', 'utf8');
const clauses = seed.split('The heading is a MACHINE-PARSED MARKER').length - 1;
check('protocols carry the clause (network-provisioning + terraform-iac)', clauses === 2);
check('protocol clause: nesting does NOT blind the checker (stated)', (seed.match(/does NOT blind the checker/g) || []).length === 2);
check('protocol clause: no copy claims nesting reads ABSENT', !/nested under another heading, retitled, or merged into a combined section, the platform's containment checker reads the block as ABSENT/.test(seed));
check('author guidance: retitle/merge = ABSENT, nesting tolerated', /RETITLING one or MERGING it[\s\S]{0,400}heading-tolerant/.test(tmpl));
check('reviewer guidance: block on the fact, nesting is non-blocking', /NESTED under another section is NOT/.test(tmpl) && /outranks your reading/.test(tmpl));
check('no prose anywhere says nesting makes the checker read ABSENT', !/nesting one under another heading, retitling it, or merging it[^.]{0,120}read the block as ABSENT/.test(tmpl));
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\n✅ marker-contract claims match the parser');
