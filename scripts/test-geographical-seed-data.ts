/* eslint-disable no-console -- test script: prints its own ✅/❌ ledger by design */
/**
 * test:geographical-seed-data — the shipped data/geographical-default.json is valid against the Prisma enums, and
 * the seed script is data-driven (no inline data block that could drift from the file). Pure: no DB.
 */
import * as fs from 'fs';
import * as path from 'path';
const { validateGeographicalData: validateRaw, DEFAULT_FILE } = require('../scripts/seed-geographical-data.js');
const validateGeographicalData = (d: unknown): string[] => validateRaw(d);

const ROOT = path.resolve(__dirname, '..');
let passed = 0; const fails: string[] = [];
const check = (label: string, cond: boolean) => { cond ? passed++ : fails.push(label); };

const data = JSON.parse(fs.readFileSync(DEFAULT_FILE, 'utf8'));
const problems: string[] = validateGeographicalData(data);
check(`shipped file is valid (${problems.join('; ') || 'no problems'})`, problems.length === 0);
check('shipped file covers the four theatres', ['NORTH_AMERICA', 'LAC', 'EMEA', 'APJ'].every((t) => Array.isArray(data[t]) && data[t].length > 0));
const countries = Object.values(data).flat() as Array<{ code: string; regions?: unknown[] }>;
check(`shipped file has 15 countries (got ${countries.length}) — update RUNNING.md / the run sheet if this changes`, countries.length === 15);

// negative controls — the validator must actually fail
check('rejects an unknown theatre (enum)', validateGeographicalData({ AFRICA: [] }).some((p) => /unknown theatre/.test(p)));
check('rejects a bad region type', validateGeographicalData({ EMEA: [{ name: 'X', code: 'XX', regions: [{ name: 'r', type: 'MIDDLE' }] }] }).some((p) => /type must be/.test(p)));
check('accepts a custom (null-type) region', validateGeographicalData({ EMEA: [{ name: 'X', code: 'XX', regions: [{ name: 'r', type: null }] }] }).length === 0);
check('rejects a duplicate code', validateGeographicalData({ EMEA: [{ name: 'A', code: 'XX' }, { name: 'B', code: 'XX' }] }).some((p) => /duplicate/.test(p)));
check('rejects a lower-case / long code', validateGeographicalData({ EMEA: [{ name: 'A', code: 'usa' }, { name: 'B', code: 'ABCD' }] }).filter((p) => /2–3 upper-case/.test(p)).length === 2);
check('accepts a 3-letter pseudo-code (SEA is in the shipped data)', validateGeographicalData({ APJ: [{ name: 'Southeast Asia', code: 'SEA' }] }).length === 0);
check('rejects an array at the top level', validateGeographicalData([]).length === 1);

// static: the script has no inline data block
const src = fs.readFileSync(path.join(ROOT, 'scripts/seed-geographical-data.js'), 'utf8');
check('seed script is data-driven (no inline `const geographicalData = {`)', !/const geographicalData = \{/.test(src));
check('seed script exits non-zero on error', /process\.exit\(1\)/.test(src));

console.log(`\n${fails.length ? '❌' : '✅'} test:geographical-seed-data — ${passed} passed, ${fails.length} failed`);
for (const f of fails) console.log(`   ❌ ${f}`);
process.exit(fails.length ? 1 : 0);
