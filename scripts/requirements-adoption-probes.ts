/**
 * Adoption PROBES P0–P6 (execution-facts review F1/F2, 2026-10-10; owner decision G1 A). Shared by the unit suite.
 *
 * Fixture: the VT-33 run-2 answered draft (Reviewer APPROVED 92; the published spec's source) + its objective + the
 * owner's ROW-ITEM map. "Before" = that draft with padding lines added to ONE section so size fails; every "corrected"
 * variant removes the padding (the honest size repair) and makes ONE extra edit. Expected under the G1 A rule:
 *   P0 control                         → adopted
 *   P1 delete a decision row           → refused (regressed: coverage)
 *   P2 widen the granted action        → ADOPTED  (known blind spot — content no check measures; G4 F2b)
 *   P3 swap an approver email          → ADOPTED  (known blind spot)
 *   P4 gut the Acceptance body         → ADOPTED  (known blind spot)
 *   P5 no owner map + delete item-13 row → refused (the frozen map keeps the obligation; clauses/citations may not fall)
 *   P6 add an invented row key         → refused (coverage.errorsTotal may not rise)
 * A probe that flips is a DECISION, never a fixture edit: update this table and the pattern doc together.
 */
import * as fs from 'fs';
import * as path from 'path';

export const PROBE_DIR = path.join(__dirname, '..', '.claude', 'skills', 'requirements-spec', 'work', 'log-archive-namespace-read-2026-10-09');
export const PROBE_DRAFT = fs.readFileSync(path.join(PROBE_DIR, 'draft-answered', 'report.md'), 'utf8');
export const PROBE_OBJECTIVE = fs.readFileSync(path.join(PROBE_DIR, 'objective-answered.txt'), 'utf8');
export const PROBE_MAP = JSON.parse(fs.readFileSync(path.join(PROBE_DIR, 'row-item-map.json'), 'utf8'));

function sectionBounds(lines: string[], startsWith: string): [number, number] {
  const a = lines.findIndex((l) => l.startsWith(startsWith));
  if (a < 0) throw new Error(`probe fixture: no section ${startsWith}`);
  let b = lines.length;
  for (let i = a + 1; i < lines.length; i++) if (lines[i].startsWith('## ')) { b = i; break; }
  return [a, b];
}

/** The draft with N padding lines inside the rationale section (size fails; nothing else moves). n = 230 since R1
 *  (2026-10-12): the limit is the Program Architect's 64,000 (65,323 padded; was 70 → 50,152 against 50,000). */
export function padded(text: string, n = 230): string {
  const L = text.split('\n');
  const [a] = sectionBounds(L, '## Why this is sequenced');
  const pad = Array.from({ length: n }, (_, i) => `Padding sentence ${i + 1} restates the sequencing rationale in more words than it needs to carry.`);
  return [...L.slice(0, a + 1), ...pad, ...L.slice(a + 1)].join('\n');
}

function dropLine(text: string, re: RegExp): string {
  const L = text.split('\n');
  const i = L.findIndex((l) => re.test(l));
  if (i < 0) throw new Error(`probe fixture: no line matches ${re}`);
  return [...L.slice(0, i), ...L.slice(i + 1)].join('\n');
}

function editSection(text: string, startsWith: string, fn: (body: string[]) => string[]): string {
  const L = text.split('\n');
  const [a, b] = sectionBounds(L, startsWith);
  return [...L.slice(0, a + 1), ...fn(L.slice(a + 1, b)), ...L.slice(b)].join('\n');
}

export interface Probe { id: string; corrected: string; ownerMap: boolean; expectAdopted: boolean; expectReason?: string }

export function probes(): Probe[] {
  const base = PROBE_DRAFT;
  return [
    { id: 'P0 control', corrected: base, ownerMap: true, expectAdopted: true },
    { id: 'P1 delete the item-4 decision row', corrected: dropLine(base, /^\| kubernetes-gitops\.population \|/), ownerMap: true, expectAdopted: false, expectReason: 'regressed' },
    { id: 'P2 s3:GetObject → s3:* in the Pipeline 2 body', corrected: editSection(base, '## Pipeline 2 objective', (b) => b.map((l) => l.split('s3:GetObject').join('s3:*'))), ownerMap: true, expectAdopted: true },
    { id: 'P3 swap the terraform approver email in Approvals', corrected: editSection(base, '## Approvals', (b) => b.map((l) => l.split('jacob.wilcox@paichart.com').join('someone.else@paichart.com'))), ownerMap: true, expectAdopted: true },
    { id: 'P4 Acceptance body → "See above."', corrected: editSection(base, '## Acceptance', () => ['', 'See above.', '']), ownerMap: true, expectAdopted: true },
    { id: 'P5 no owner map + delete the item-13 decision row', corrected: dropLine(base, /^\| kubernetes-gitops\.writes \|/), ownerMap: false, expectAdopted: false, expectReason: 'regressed' },
    { id: 'P6 add an invented row key', corrected: base.replace(/^(\| kubernetes-gitops\.writes \|.*)$/m, '$1\n| terraform-iac.invented-thing | an invented question | — | something | (declared — item 13: "The cluster leg is read-and-publish") |'), ownerMap: true, expectAdopted: false, expectReason: 'regressed' },
  ];
}
