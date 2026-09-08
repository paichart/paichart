/* eslint-disable no-console -- test script: prints its own ✅/❌ ledger by design */
/** test:pov-create-status — E19: pov.create accepts `status` (default PROJECTED) and rejects an invalid one loudly; it is never silently stripped. */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
import { MCPParameterSchemas } from '../lib/validation/mcp-action-validation';
let passed = 0; const fails: string[] = [];
const check = (l: string, c: boolean) => { c ? passed++ : fails.push(l); };
const schema = (MCPParameterSchemas as Record<string, { safeParse: (v: unknown) => { success: boolean; data?: Record<string, unknown> } }>)['pov.create'];
const base = { title: 'T', description: 'D', countryName: 'Australia' };
const ok = schema.safeParse({ ...base, status: 'IN_PROGRESS' });
check('status IN_PROGRESS accepted and PRESENT after parse', ok.success && ok.data?.status === 'IN_PROGRESS');
check('status omitted → absent (handler defaults to PROJECTED)', schema.safeParse(base).success && schema.safeParse(base).data?.status === undefined);
check('invalid status rejected loudly', schema.safeParse({ ...base, status: 'DONE' }).success === false);
console.log(`\n${fails.length ? '❌' : '✅'} test:pov-create-status — ${passed} passed, ${fails.length} failed`);
for (const f of fails) console.log(`   ❌ ${f}`);
process.exit(fails.length ? 1 : 0);
