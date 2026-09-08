/* eslint-disable no-console -- test script: prints its own ✅/❌ ledger by design */
/** test:theatre-labels — every SalesTheatre enum value has a label in the one map; no display site keeps its own literal. */
import * as fs from 'fs';
import * as path from 'path';
import { SalesTheatre } from '@prisma/client';
import { THEATRE_LABELS, THEATRE_SHORT, THEATRE_ABBREV, theatreLabel, theatreShort } from '../lib/constants/theatre-labels';

const ROOT = path.resolve(__dirname, '..');
let passed = 0; const fails: string[] = [];
const check = (l: string, c: boolean) => { c ? passed++ : fails.push(l); };
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

for (const t of Object.values(SalesTheatre)) {
  check(`label for ${t}`, typeof THEATRE_LABELS[t] === 'string' && THEATRE_LABELS[t].length > 0);
  check(`short for ${t}`, typeof THEATRE_SHORT[t] === 'string' && THEATRE_SHORT[t].length > 0);
  check(`abbrev for ${t} is 2–4 caps`, /^[A-Z]{2,4}$/.test(THEATRE_ABBREV[t]));
}
check('NORTH_AMERICA reads "America" (Steve, 2026-09-08)', theatreLabel('NORTH_AMERICA') === 'America' && theatreShort('NORTH_AMERICA') === 'America');
check('unknown value falls back to spaced text, never throws', theatreLabel('NEW_THEATRE') === 'NEW THEATRE');

const sites = ['lib/utils/povColors.ts', 'components/dashboard/GeoDistributionWidget.tsx', 'components/pov/GeographicalFilter.tsx',
  'components/pov/POVDataVisualization.tsx', 'components/pov/SavedViewsPanel.tsx', 'components/pov/POVSearchAndFilters.tsx',
  'components/ui/GeographicalSelect.tsx'];
for (const f of sites) check(`${f} imports the map`, /@\/lib\/constants\/theatre-labels/.test(read(f)));
const walk = (d: string): string[] => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const literal = [...walk('lib'), ...walk('components'), ...walk('app')].filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('theatre-labels.ts') && /'North America'|"North America"/.test(read(f)));
check(`no display site keeps a 'North America' literal (${literal.join(', ') || 'none'})`, literal.length === 0);
const rawEnum = [...walk('components'), ...walk('app')].filter((f) => /\.tsx$/.test(f) && /theatre\.replace\(['"]_['"]/.test(read(f)));
check(`no theatre rendered as the raw enum with underscores spaced (${rawEnum.join(', ') || 'none'})`, rawEnum.length === 0);
check('bloomberg abbreviations derive from the map', /\.\.\.THEATRE_ABBREV/.test(read('lib/constants/bloomberg-styles.ts')));

console.log(`\n${fails.length ? '❌' : '✅'} test:theatre-labels — ${passed} passed, ${fails.length} failed`);
for (const f of fails) console.log(`   ❌ ${f}`);
process.exit(fails.length ? 1 : 0);
