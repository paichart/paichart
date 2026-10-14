/**
 * test-registration-uniqueness.ts — REGISTRATION-UNIQUENESS-TOCTOU (2026-10-14).
 *
 * The registry checked service name/endpoint uniqueness by read-then-write; the DB enforced neither. The fix adds
 * unique indexes (mcp_tools_name_key, mcp_tools_endpoint_key) and maps a lost race (Prisma P2002) to the SAME error.
 *
 * Pins:
 *  A. The error text is BYTE-IDENTICAL to the pre-fix inline errors (rebuilt here from the original arguments).
 *  B. P2002 → field mapping on the meta.target shapes MEASURED on a real race (Prisma 6.19.3 / PostgreSQL).
 *  C. rethrowUniqueViolation: name → name error; endpoint → endpoint error naming the winner; winner gone →
 *     'another service'; anything else rethrown as the SAME object (never swallowed or rewrapped).
 *  D. Wiring (static): both register creates and the update write are caught; update pre-checks the endpoint excluding
 *     its own row; schema `name @unique`; the index script creates both UNIQUE indexes and is in the deploy wrapper.
 * No database needed. The live race was rehearsed on a scratch DB (exactly one of two concurrent creates wins).
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const U = require('../lib/mcp/server/tools/hub/registration-uniqueness.js');
const { validationError } = require('../lib/mcp/server/tools/hub/error-helpers.js');

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { passed++; console.log(`  ✅ ${name}`); } else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function main(): Promise<void> {
  console.log('🔐 registration uniqueness');

  // A. Byte-identical messages (arguments copied from the pre-fix inline checks).
  const args = { name: 'svc-a', endpoint: 'https://a.example/mcp', category: 'monitoring', description: 'A service description' };
  const origName = validationError(
    [`Service name '${args.name}' is already registered`],
    { name: 'my-unique-service-name', endpoint: args.endpoint, category: args.category, description: args.description },
    "Choose a unique service name. Use registry(action: 'list') to see your existing services."
  ).message;
  const origEp = validationError(
    [`Endpoint '${args.endpoint}' is already registered by service 'svc-owner'`],
    { name: 'my-new-service', endpoint: 'https://api.mynewservice.com/mcp', category: 'data-services', description: 'My service description' },
    'Each service must have a unique endpoint. Use a different endpoint or call the existing service.'
  ).message;
  check('A1 name-taken message byte-identical to the pre-fix inline error', U.nameTakenError(args).message === origName);
  check('A2 endpoint-taken message byte-identical to the pre-fix inline error', U.endpointTakenError(args.endpoint, 'svc-owner').message === origEp);

  // B. Field mapping on the measured shapes.
  const p2002 = (target: unknown) => Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { modelName: 'MCPTool', target } });
  check('B1 target ["name"] → name', U.uniqueViolationField(p2002(['name'])) === 'name');
  check('B2 target ["(configuration ->> \'endpoint\'::text)"] → endpoint', U.uniqueViolationField(p2002(["(configuration ->> 'endpoint'::text)"])) === 'endpoint');
  check('B3 index-name targets also map', U.uniqueViolationField(p2002('mcp_tools_name_key')) === 'name' && U.uniqueViolationField(p2002('mcp_tools_endpoint_key')) === 'endpoint');
  check('B4 another unique target → null (not ours)', U.uniqueViolationField(p2002(['audience'])) === null);
  const msgOnly = (m: string) => Object.assign(new Error(m), { code: 'P2002', meta: {} });
  check('B6 message-only shape (no target) maps by index name', U.uniqueViolationField(msgOnly('Unique constraint failed on the constraint: `mcp_tools_name_key`')) === 'name'
    && U.uniqueViolationField(msgOnly('Unique constraint failed on the constraint: `mcp_tools_endpoint_key`')) === 'endpoint'
    && U.uniqueViolationField(msgOnly('Unique constraint failed on the constraint: `other_key`')) === null);
  check('B5 non-P2002 → null', U.uniqueViolationField(Object.assign(new Error('x'), { code: 'P2025' })) === null && U.uniqueViolationField(null) === null);

  // C. rethrowUniqueViolation.
  const calls: unknown[] = [];
  const prismaWith = (owner: string | null) => ({ mCPTool: { findFirst: async (q: unknown) => { calls.push(q); return owner ? { name: owner } : null; } } });
  const warns: unknown[] = [];
  const log = { warn: (o: unknown) => warns.push(o) };
  const caught = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as Error; } };

  let e = await caught(U.rethrowUniqueViolation(p2002(['name']), { prisma: prismaWith(null), endpoint: args.endpoint, validatedArgs: args, log, op: 'register' }));
  check('C1 lost name race → the name-taken error', !!e && e.message === origName);
  e = await caught(U.rethrowUniqueViolation(p2002(["(configuration ->> 'endpoint'::text)"]), { prisma: prismaWith('svc-owner'), endpoint: args.endpoint, validatedArgs: args, log, op: 'register' }));
  check('C2 lost endpoint race → the endpoint-taken error naming the winner', !!e && e.message === origEp);
  e = await caught(U.rethrowUniqueViolation(p2002(['configuration_endpoint']), { prisma: prismaWith(null), endpoint: args.endpoint, validatedArgs: args, log, op: 'update', excludeId: 'cmself' }));
  check('C3 winner gone → "another service"', !!e && e.message === U.endpointTakenError(args.endpoint, 'another service', { forUpdate: true }).message);
  const last = calls[calls.length - 1] as { where: { NOT?: { id: string } } };
  check('C4 update lookup excludes the service\'s own row', last?.where?.NOT?.id === 'cmself');
  const other = Object.assign(new Error('boom'), { code: 'P2003' });
  e = await caught(U.rethrowUniqueViolation(other, { prisma: prismaWith(null), endpoint: args.endpoint, validatedArgs: args, log, op: 'register' }));
  check('C5 any other error is rethrown as the SAME object', e === other);
  // C7: update refusal — same first sentence as register, update-shaped example, marked for pass-through.
  const upErr = U.endpointTakenError(args.endpoint, 'svc-owner', { forUpdate: true });
  check('C7 update refusal: register\'s first line, update-shaped example, marked',
    upErr.message.split('\n')[0] === origEp.split('\n')[0] && upErr.message.includes('"service_name": "my-api"') && !upErr.message.includes('"category"')
    && upErr.isRegistryUniquenessError === true && U.nameTakenError(args).isRegistryUniquenessError === true);
  // C8: an UNRECOGNISED P2002 shape is attributed by re-reading, never passed through raw (boundary P1).
  const unknown = () => Object.assign(new Error('Invalid `prisma.mCPTool.create()` invocation in /srv/app/x.js:12 Unique constraint failed'), { code: 'P2002', meta: { modelName: 'MCPTool', target: ['something_new'] } });
  const nameP = { mCPTool: { findFirst: async (q: { where: { name?: string } }) => (q.where.name ? { id: 'cmx' } : null) } };
  e = await caught(U.rethrowUniqueViolation(unknown(), { prisma: nameP, endpoint: args.endpoint, validatedArgs: args, log, op: 'register' }));
  check('C8a unknown shape + name row exists → the name-taken error', !!e && e.message === origName);
  e = await caught(U.rethrowUniqueViolation(unknown(), { prisma: prismaWith('svc-owner'), endpoint: args.endpoint, validatedArgs: { name: 'free' }, log, op: 'update', excludeId: 'cmself' }));
  check('C8b unknown shape + endpoint owner exists → the endpoint-taken error', !!e && e.message === U.endpointTakenError(args.endpoint, 'svc-owner', { forUpdate: true }).message);
  e = await caught(U.rethrowUniqueViolation(unknown(), { prisma: prismaWith(null), endpoint: args.endpoint, validatedArgs: { name: 'free' }, log, op: 'register' }));
  check('C8c unattributable → a clean generic message, no Prisma text', !!e && e.message === U.ambiguousTakenError().message && !e.message.includes('prisma'));
  check('C6 each translated race logs one warn naming the field', warns.length === 6 && (warns[0] as { field: string }).field === 'name' && (warns[5] as { field: string }).field === 'unattributed');

  // D. Wiring.
  const reg = fs.readFileSync(path.join(ROOT, 'lib/mcp/server/tools/hub/service-registration-handler.js'), 'utf8');
  const upd = fs.readFileSync(path.join(ROOT, 'lib/mcp/server/tools/hub/service-update-handler.js'), 'utf8');
  const creates = (reg.match(/this\.prisma\.mCPTool\.create\(/g) || []).length;
  const caughtCreates = (reg.match(/\}\)\.catch\(\(err\) => rethrowUniqueViolation\(err, \{[^}]*op: 'register' \}\)\);/g) || []).length;
  check('D1 every register create is caught (2 of 2)', creates === 2 && caughtCreates === 2, `creates ${creates}, caught ${caughtCreates}`);
  check('D2 register pre-checks use the shared builders (no inline copy of the text)',
    reg.includes('throw nameTakenError(validatedArgs);') && reg.includes('throw endpointTakenError(validatedArgs.endpoint, existingEndpoint.name);')
    && !reg.includes('is already registered`]') );
  check('D3 update pre-checks the endpoint excluding its own row',
    upd.includes('await endpointOwnerName(this.prisma, safeUpdates.endpoint, finalServiceId)') && upd.includes('throw endpointTakenError(safeUpdates.endpoint, takenBy, { forUpdate: true })'));
  check('D3b update\'s outer catch passes a uniqueness refusal through un-wrapped (boundary U1)',
    /catch \(error\) \{\s*\n(\s*\/\/[^\n]*\n)*\s*if \(error && error\.isRegistryUniquenessError\) throw error;/.test(upd));
  check('D4 the update write is caught', /mCPTool\.update\([\s\S]{0,400}?\}\)\.catch\(\(err\) => rethrowUniqueViolation\(err, \{[\s\S]{0,200}?op: 'update'/.test(upd));

  const schema = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8');
  const model = schema.slice(schema.indexOf('model MCPTool {'), schema.indexOf('\n}', schema.indexOf('model MCPTool {')));
  check('D5 schema: MCPTool.name is @unique', /\n\s+name\s+String\s+@unique\b/.test(model));
  const script = fs.readFileSync(path.join(ROOT, 'scripts/create-mcp-tools-unique-indexes.sh'), 'utf8');
  check('D6 index script creates both UNIQUE indexes, CONCURRENTLY, on the expected keys',
    script.includes('CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS \\"mcp_tools_name_key\\" ON \\"mcp_tools\\" (\\"name\\")')
    && script.includes("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS \\\"mcp_tools_endpoint_key\\\" ON \\\"mcp_tools\\\" ((\\\"configuration\\\" ->> 'endpoint'))"));
  check('D7 index script aborts on existing duplicates', /exit 2/.test(script) && script.includes('HAVING count(*) > 1'));
  const wrapper = fs.readFileSync(path.join(ROOT, 'scripts/apply-raw-sql-indexes.sh'), 'utf8');
  check('D8 the deploy wrapper runs the index script', /^\s+"create-mcp-tools-unique-indexes\.sh"/m.test(wrapper));
  const deployPath = path.join(ROOT, 'scripts/deploy/blue-green-deploy.sh');
  if (!fs.existsSync(path.join(ROOT, 'cline_docs')) && !fs.existsSync(deployPath)) {
    console.log('  ⏭️  SKIPPED (named): D9 deploy ordering — the deploy script is private, absent in this checkout');
  } else {
    const deploy = fs.readFileSync(deployPath, 'utf8');
    const pre = deploy.indexOf('\nbash scripts/create-mcp-tools-unique-indexes.sh');
    const push = deploy.indexOf('if [ "${ACCEPT_DATA_LOSS:-no}" = "yes" ]; then');
    check('D9 the deploy runs the index script BEFORE db push', pre > 0 && push > 0 && pre < push);
  }
  const seed = fs.readFileSync(path.join(ROOT, 'scripts/seed-database.ts'), 'utf8');
  const sPre = seed.indexOf("'bash scripts/create-mcp-tools-unique-indexes.sh'"), sPush = seed.indexOf("'npx prisma db push --skip-generate'");
  check('D10 db:seed runs the index script BEFORE db push', sPre > 0 && sPush > 0 && sPre < sPush);
  check('D11 the script skips a fresh DB and rejects a partial index', script.includes("to_regclass('public.mcp_tools') IS NULL") && script.includes('is a PARTIAL index'));
  check('D12 the race warn line sanitises the endpoint', fs.readFileSync(path.join(ROOT, 'lib/mcp/server/tools/hub/registration-uniqueness.js'), 'utf8').includes('endpoint: sanitizeEndpointUrl(endpoint)'));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
