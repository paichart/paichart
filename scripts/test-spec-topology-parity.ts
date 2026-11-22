/**
 * Config sources STEP 3 P5 (whole-diff review F6) — the $0 spec check (scripts/check-spec-topology.py, Python) RESTATES two of the
 * platform's rules: the source-line kinds and the never-held path rule. A restatement drifts: on 2026-11-22 it knew no `service-held`
 * kind, no device-inventory rule (live since 2026-10-23) and no password / key file names (live since 2026-11-21), and nothing
 * compared the two. This suite pins both lists EQUAL to the shipping tables — the check prints its own lists (`--rules-json`), and
 * every value is compared with the function the platform runs.
 *
 * Run: npm run test:spec-topology (second half). Needs python3 (as the first half does). No git, no database.
 */
import * as path from 'path';
import { execFileSync } from 'child_process';
import { CONFIG_SOURCE_KINDS_BY_PROTOCOL } from '../lib/agents/harness/config-sources';
import { DEVICE_SOURCE_KINDS } from '../lib/agents/harness/device-sources';

/* eslint-disable @typescript-eslint/no-var-requires */
const pin = require('../lib/mcp/server/config/git-file-source-pin') as {
  heldPathRefusal: (p: string) => string | null; KEY_MATERIAL_FILE_SUFFIXES: readonly string[]; SSH_IDENTITY_FILE_NAMES: readonly string[];
};
/* eslint-enable @typescript-eslint/no-var-requires */

let passed = 0; let failed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${(e as Error).message}`); } };
const eq = (a: unknown, b: unknown, what = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

// One path per rule of the shipping function, in both directions, plus look-alikes that must stay holdable.
const PATHS = [
  // Terraform state / plan / variables / CLI credentials
  'a/terraform.tfstate', 'a/terraform.tfstate.backup', 'a/x.tfplan', 'a/tfplan', 'a/tfplan.out', 'a/plan.out', 'a/tfplan.json', 'a/tfplan.binary', 'a/.terraform/modules/x.tf',
  'a/terraform.tfstate.d/prod/x', 'a/prod.tfvars', 'a/prod.auto.tfvars.json', 'home/.terraformrc', 'a/terraform.rc', 'a/.terraform.d/credentials.tfrc.json', 'a/.terraform.d/x', 'A/TERRAFORM.TFSTATE',
  // a device inventory: the names only under a `nornir` or `inventory` segment
  'nornir/hosts.yaml', 'nornir/groups.yml', 'inventory/defaults.yaml', 'x/inventory/y/hosts.yml', 'helm/defaults.yaml', 'k8s/hosts.yaml', 'nornir/other.yaml', 'inventory.yaml',
  // password files
  '.htpasswd', 'conf.d/.htpasswd', 'nginx/htpasswd.users', 'NGINX/.HTPASSWD', 'docs/about-htpasswd.md',
  // key material: every suffix and every identity name the platform lists, and case
  ...pin.KEY_MATERIAL_FILE_SUFFIXES.flatMap((x) => [`tls/server${x}`, `TLS/SERVER${x.toUpperCase()}`]), ...pin.SSH_IDENTITY_FILE_NAMES.flatMap((n) => [n, `.ssh/${n}`, `${n}.pub`]),
  // ordinary files that must stay holdable
  'terraform/main.tf', 'modules/vpc/variables.tf', 'docs/tfstate-notes.md', 'observability/otelcol/config.yaml', 'observability/nginx/otlp-ingress.conf', 'k8s/workloads.yaml',
  'docs/keys.md', 'a/keystore/readme.txt', 'a/pem/notes.txt', 'a/key', 'a/monkey.yaml', '', '/',
];

const out = JSON.parse(execFileSync('python3', [path.join(__dirname, 'check-spec-topology.py'), '--rules-json'], { input: JSON.stringify(PATHS), encoding: 'utf8' })) as { kinds: string[]; neverHeld: Record<string, boolean> };

test('STP1 the check\'s source-line kinds ARE the platform\'s: the Device kinds and every Config kind of every protocol, no more and no fewer', () => {
  const shipping = [...new Set<string>([...DEVICE_SOURCE_KINDS, ...Object.values(CONFIG_SOURCE_KINDS_BY_PROTOCOL).flat()])].sort();
  eq(out.kinds, shipping);
  if (!shipping.includes('service-held')) throw new Error('the shipping tables no longer carry `service-held` — this suite\'s reason for existing changed');
});
test('STP2 the check\'s never-held rule agrees with the platform\'s `heldPathRefusal` on every path of the corpus (each rule, both directions)', () => {
  const differ = PATHS.filter((p) => out.neverHeld[p] !== (pin.heldPathRefusal(p) !== null));
  eq(differ, [], 'paths the Python restatement and the shipping function judge differently: ');
  const refused = PATHS.filter((p) => pin.heldPathRefusal(p) !== null).length;
  if (refused < 40 || PATHS.length - refused < 15) throw new Error(`the corpus is one-sided: ${refused} refused of ${PATHS.length}`);
});
test('STP3 the corpus covers every refusal NAME the shipping function can return', () => {
  eq([...new Set(PATHS.map((p) => pin.heldPathRefusal(p)).filter((x): x is string => x !== null))].sort(), ['credentials-file', 'key-material-file', 'state-file', 'tfvars-file']);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
