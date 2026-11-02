#!/usr/bin/env ts-node
/**
 * held-k8s 1i (K-6 extended; sec-ops B2, EF S-7) — R10 POSITIVE CONTROLS over the lab repo, and a MEASUREMENT of what R10 does
 * to real GitOps secret shapes. Runs the platform's OWN capture pieces in capture order (held-bytes-capture.ts): the
 * `secret-manifest` refusal (G-5), the legacy text checks, then `canonicalBase` with R10 ON — never a re-implementation.
 *
 * WHY: a Git-sourced held base is valid for the operator's Git check (K-8) only when R10 placed nothing (`redactedCount = 0`).
 * So the workload a spec names must redact NOTHING, and the bait must redact SOMETHING — checked by tooling, not by eye.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/check-held-r10-lab-repo.ts --repo <path to a clone of paichart-lab-configs>
 *     ⇒ CONTROLS: k8s/sample-workloads.yaml held with redactedCount 0; k8s/secret-fixture.yaml refused `secret-manifest`
 *        and, run through R10 alone, redactedCount ≥ 1. Exit 0 pass · 1 fail · 2 usage.
 *   npx ts-node -r tsconfig-paths/register scripts/check-held-r10-lab-repo.ts --measure
 *   npx ts-node -r tsconfig-paths/register scripts/check-held-r10-lab-repo.ts --terraform <dir> [<dir> ...]
 *     ⇒ held-terraform T-12: per file, capture's outcome (path refusals first) and every line R10 changes. Never a pass/fail.
 *     ⇒ MEASUREMENT (never a pass/fail): SOPS, SealedSecret, kustomize secretGenerator literals, Helm values + template. Prints
 *        what capture would do with each. Secret-shaped inputs are BUILT AT RUNTIME (gitleaks discipline).
 */
import * as fs from 'fs';
import * as path from 'path';
import { isPlaintextSecretManifest, heldPathRefusal, isTerraformStateOrPlanJson } from '../lib/services/held-bytes-capture';
import { canonicalBase, checkLegacyText } from '../lib/agents/harness/held-bytes/canonical-text';
import { R10_VERSION, redactArtifactSecrets } from '../lib/agents/harness/redact-artifact-secrets';

export type CaptureOutcome =
  | { held: true; redactedCount: number; redactorVersion: string }
  | { held: false; refusal: string };

/** What held-bytes capture would do with this text (R10 on), in capture's order. `filePath` (held-terraform T-3/T-4): the
 *  path refusals run FIRST, exactly as in prepareHeldCapture; omitted ⇒ the text checks only (the k8s callers). */
export function captureOutcome(text: string, filePath?: string): CaptureOutcome {
  const byPath = heldPathRefusal(filePath);
  if (byPath) return { held: false, refusal: byPath };
  if (isTerraformStateOrPlanJson(text)) return { held: false, refusal: 'state-file' };
  if (isPlaintextSecretManifest(text)) return { held: false, refusal: 'secret-manifest' };
  const legacy = checkLegacyText(text);
  if (legacy) return { held: false, refusal: legacy };
  const base = canonicalBase(text, { redact: true });
  if (!base.ok) return { held: false, refusal: base.refusal };
  return { held: true, redactedCount: base.redactedCount, redactorVersion: base.redactorVersion };
}

function controls(repo: string): number {
  const read = (p: string) => fs.readFileSync(path.join(repo, p), 'utf8');
  let fail = 0;
  const line = (ok: boolean, msg: string) => { console.log(`  ${ok ? '✅' : '❌'} ${msg}`); if (!ok) fail = 1; };
  const wl = captureOutcome(read('k8s/sample-workloads.yaml'));
  line(wl.held && wl.redactedCount === 0, `k8s/sample-workloads.yaml — held, redactedCount 0 (got ${JSON.stringify(wl)})`);
  const fxText = read('k8s/secret-fixture.yaml');
  const fx = captureOutcome(fxText);
  line(!fx.held && fx.refusal === 'secret-manifest', `k8s/secret-fixture.yaml — refused secret-manifest, never stored (got ${JSON.stringify(fx)})`);
  const fxR10 = redactArtifactSecrets(fxText).redactedCount;
  line(fxR10 >= 1, `k8s/secret-fixture.yaml — R10 alone redacts ≥ 1 (the positive control; got ${fxR10})`);
  // every OTHER file a k8s spec could name: report, never fail (network/terraform are other domains' fixtures)
  for (const f of fs.readdirSync(path.join(repo, 'k8s')).filter((x) => !['sample-workloads.yaml', 'secret-fixture.yaml'].includes(x))) {
    console.log(`  · k8s/${f} — ${JSON.stringify(captureOutcome(read(`k8s/${f}`)))}`);
  }
  // held-terraform T-5 (2026-10-21): the file a terraform spec names (main.tf) is held CLEAN; the inventory tags (fixtures.tf, never
  // named by a spec) still carry the R10 bait. Skipped by name on a checkout from before the split.
  if (fs.existsSync(path.join(repo, 'terraform/fixtures.tf'))) {
    const tm = captureOutcome(read('terraform/main.tf'), '/terraform/main.tf');
    line(tm.held && tm.redactedCount === 0, `terraform/main.tf — held, redactedCount 0 (got ${JSON.stringify(tm)})`);
    const tfx = read('terraform/fixtures.tf');
    const tfxR10 = redactArtifactSecrets(tfx).redactedCount;
    line(tfxR10 >= 1, `terraform/fixtures.tf — R10 redacts ≥ 1 (the positive control; got ${tfxR10})`);
    line(!/CONNECTED_OUTPUT|ARTIFACT_SECRET|\bR9\b|\bR10\b|\bK1\b|redact/i.test(read('terraform/main.tf') + tfx),
      'terraform/main.tf + fixtures.tf — no platform env var or mechanism name in a file agents quote (LL-17)');
  } else console.log('  · terraform/fixtures.tf absent — a pre-split checkout; terraform controls skipped by name');
  console.log(`${fail ? '❌' : '✅'} R10 lab-repo controls (${R10_VERSION})`);
  return fail;
}

function measure(): number {
  // Built at runtime — no literal credential lives in this file.
  const pw = ['hun', 'ter', '2-', 'lit'].join('');
  const tok = ['ghp', '_', 'A'.repeat(36)].join('');
  const ct = (n: number) => 'ENC[AES256_GCM,data:' + 'Qk'.repeat(n) + ',iv:' + 'x'.repeat(22) + '=,tag:' + 'y'.repeat(22) + '==,type:str]';
  const cases: Array<[string, string]> = [
    ['SOPS-encrypted Secret (ciphertext only)', `apiVersion: v1\nkind: Secret\nmetadata:\n  name: db\nstringData:\n  password: ${ct(20)}\nsops:\n  kms: []\n  lastmodified: "2026-10-18T00:00:00Z"\n  mac: ${ct(8)}\n  version: 3.8.1\n`],
    ['SOPS-encrypted values file (not a Secret kind)', `db:\n  password: ${ct(20)}\nsops:\n  mac: ${ct(8)}\n  version: 3.8.1\n`],
    ['SealedSecret (encryptedData)', `apiVersion: bitnami.com/v1alpha1\nkind: SealedSecret\nmetadata:\n  name: db\nspec:\n  encryptedData:\n    password: AgB${'q'.repeat(300)}==\n`],
    ['ExternalSecret (a reference, no value)', `apiVersion: external-secrets.io/v1beta1\nkind: ExternalSecret\nmetadata:\n  name: db\nspec:\n  secretStoreRef: { name: vault, kind: ClusterSecretStore }\n  data:\n    - secretKey: password\n      remoteRef: { key: prod/db, property: password }\n`],
    ['kustomize secretGenerator literals (a plaintext credential)', `secretGenerator:\n  - name: db\n    literals:\n      - password=${pw}\n      - token=${tok}\n`],
    ['Helm values (credential-shaped keys)', `db:\n  host: db.svc\n  password: "${pw}"\napi:\n  token: "${tok}"\n`],
    ['Helm template referencing values (no value)', `apiVersion: v1\nkind: Secret\nmetadata:\n  name: db\nstringData:\n  password: {{ .Values.db.password | quote }}\n`],
  ];
  console.log(`MEASUREMENT — what capture does with GitOps secret shapes (R10 ${R10_VERSION}). Not a gate: read each line.`);
  for (const [name, text] of cases) {
    const o = captureOutcome(text);
    const leaked = o.held && (text.includes(pw) || text.includes(tok)) && redactArtifactSecrets(text).redacted.match(new RegExp(`${pw}|${tok}`)) !== null;
    console.log(`  · ${name}: ${JSON.stringify(o)}${leaked ? '  ⚠️ a plaintext credential would be HELD' : ''}`);
  }
  return 0;
}

/**
 * held-terraform T-12 (TERRAFORM-PHASE0-INVENTORY §3, R10-EXPR-RHS): a MEASUREMENT over a terraform corpus (the lab repo's
 * `terraform/`, a public module checkout). For every file a terraform spec could name: what capture would do (path refusals first),
 * and EVERY line R10 changes, so each change can be read as a real secret (correct) or an over-redaction (a false refusal waiting
 * to happen: the held base reads not-applicable and the Author cannot edit that line). Never a pass/fail.
 * ⚠️ It PRINTS each changed line IN CLEAR (sec-ops step-1 N1) — run it over public corpora only, never a private repo into a shared log.
 */
function measureTerraform(dirs: string[]): number {
  const TF = /\.(tf|tf\.json|tfvars|tfvars\.json|hcl)$|\.tfstate/i;
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return e.name === '.git' ? [] : walk(p);
    return TF.test(e.name) ? [p] : [];
  });
  let files = 0; let held = 0; let withChanges = 0; let changedLines = 0;
  const refusals: Record<string, number> = {};
  console.log(`MEASUREMENT — what capture + R10 (${R10_VERSION}) do to a terraform corpus. Not a gate: read each changed line.`);
  for (const dir of dirs) {
    for (const f of walk(dir).sort()) {
      files++;
      const rel = '/' + path.relative(dir, f).split(path.sep).join('/');
      const text = fs.readFileSync(f, 'utf8');
      const o = captureOutcome(text, rel);
      if (!o.held) { refusals[o.refusal] = (refusals[o.refusal] ?? 0) + 1; console.log(`  · ${dir}${rel}: refused ${o.refusal}`); continue; }
      held++;
      if (o.redactedCount === 0) continue;
      withChanges++;
      console.log(`  · ${dir}${rel}: held, redactedCount ${o.redactedCount}`);
      const a = text.split('\n'); const b = redactArtifactSecrets(text).redacted.split('\n');
      a.forEach((l, i) => { if (l !== b[i]) { changedLines++; console.log(`      L${i + 1}: ${l.trim().slice(0, 140)}`); } });
    }
  }
  console.log(`SUMMARY files ${files} · held ${held} (${withChanges} with an R10 change, ${changedLines} lines) · refused ${JSON.stringify(refusals)}`);
  return 0;
}

export function main(argv: string[]): number {
  const i = argv.indexOf('--repo');
  if (argv.includes('--measure')) return measure();
  const t = argv.indexOf('--terraform');
  if (t >= 0) return measureTerraform(argv.slice(t + 1).filter((a) => !a.startsWith('--')));
  if (i >= 0 && argv[i + 1]) return controls(argv[i + 1]);
  console.error('usage: --repo <clone of paichart-lab-configs> | --measure | --terraform <dir> [<dir> ...]');
  return 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
