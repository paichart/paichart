/* eslint-disable no-console -- test script: prints its own ✅/❌ ledger by design */
/** test:phase-template-seed-idempotent — the phase-template seed never deletes on a default run (E18: a second db:seed emptied the table). Static, negative-controlled. */
import * as fs from 'fs';
import * as path from 'path';
const src = fs.readFileSync(path.join(__dirname, 'populate-phase-templates-improved.ts'), 'utf8');
let passed = 0; const fails: string[] = [];
const check = (l: string, c: boolean) => { c ? passed++ : fails.push(l); };
check('cleanup runs ONLY under --force-recreate', /if \(forceRecreate && !skipCleanup\) \{\s*await cleanupPhaseTemplates\(/.test(src));
check('the old skip-then-delete condition is gone', !/if \(!skipCleanup \|\| forceRecreate\) \{\s*await cleanupPhaseTemplates\(/.test(src));
check('the existence check still skips existing products on a default run', /existingTemplates\.length > 0 && !forceRecreate/.test(src));
console.log(`\n${fails.length ? '❌' : '✅'} test:phase-template-seed-idempotent — ${passed} passed, ${fails.length} failed`);
for (const f of fails) console.log(`   ❌ ${f}`);
process.exit(fails.length ? 1 : 0);
