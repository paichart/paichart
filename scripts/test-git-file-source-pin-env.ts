#!/usr/bin/env ts-node
/**
 * test-git-file-source-pin-env — LAB-CONFIGS Build 1 (owner D3, 2026-11-03).
 *
 * Pins:
 *   P1 GIT_FILE_SOURCE_PIN unset/empty ⇒ the platform default, byte-identical to the literal it replaced (stored held refs and
 *      every gate keep their bytes);
 *   P2 a valid `<owner>/<repo>` ⇒ that repo, lower-cased, `main` only;
 *   P3 a malformed value THROWS (the hub refuses to start with an unchosen boundary) — incl. a branch suffix, which is not
 *      configurable (every protocol passes ref:'main' verbatim);
 *   P4 every derived target equals the map: descriptor const, declaration targets, PLATFORM_GIT_TARGET — modules re-loaded
 *      with the env SET, so a second literal in these runtime modules fails here (MI-13's SQL measures the default — register MI13-PIN-LITERAL);
 *   P5 the self-host compose runs the SAME github-mcp-server digest and command as production's compose.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`✅ ${name}`); } catch (e: any) { failed++; console.log(`❌ ${name}\n   ${e?.message || e}`); }
}
function ok(c: unknown, m: string) { if (!c) throw new Error(m); }

const PIN = '../lib/mcp/server/config/git-file-source-pin';
const { parseGitFileSourcePinEnv, GIT_FILE_SOURCE_PINS, PLATFORM_GIT_TARGET, DEFAULT_GIT_FILE_SOURCE_PIN } = require(PIN);

test('P1 unset / empty / whitespace ⇒ the default pin, byte-identical to the old literal', () => {
  for (const raw of [undefined, '', '   ']) {
    const p = parseGitFileSourcePinEnv(raw);
    ok(JSON.stringify(p) === JSON.stringify({ owner: 'paichart', repo: 'paichart-configs', refs: ['main', 'refs/heads/main'] }), `raw=${JSON.stringify(raw)} → ${JSON.stringify(p)}`);
    ok(Object.isFrozen(p) && Object.isFrozen(p.refs), 'frozen');
  }
  ok(DEFAULT_GIT_FILE_SOURCE_PIN.owner === 'paichart' && DEFAULT_GIT_FILE_SOURCE_PIN.repo === 'paichart-configs', 'default constant');
  if (!process.env.GIT_FILE_SOURCE_PIN) {
    ok(PLATFORM_GIT_TARGET === 'github:paichart:paichart-configs', `target ${PLATFORM_GIT_TARGET}`);
    ok(GIT_FILE_SOURCE_PINS['github-service'].repo === 'paichart-configs', 'map default');
  }
});

test('P2 a valid owner/repo ⇒ that repo, lower-cased, main only', () => {
  const p = parseGitFileSourcePinEnv('Acme-Org/Net.Configs_2');
  ok(p.owner === 'acme-org' && p.repo === 'net.configs_2', JSON.stringify(p));
  ok(JSON.stringify(p.refs) === JSON.stringify(['main', 'refs/heads/main']), 'refs');
});

test('P3 malformed values throw (startup refuses), incl. a branch suffix', () => {
  for (const raw of ['acme', 'acme/', '/repo', 'a/b/c', 'acme/repo@release', 'acme repo/x', 'acme/rep%6f', '../x', 'a/..', 'acme/ré']) {
    let threw = false;
    try { parseGitFileSourcePinEnv(raw); } catch (e: any) { threw = /GIT_FILE_SOURCE_PIN is malformed/.test(e.message); }
    ok(threw, `did not refuse ${JSON.stringify(raw)}`);
  }
});

test('P4 with the env SET, every derived target equals the map (modules re-loaded: no second literal in the runtime modules)', () => {
  const mods = ['../lib/mcp/server/config/git-file-source-pin', '../lib/mcp/server/config/held-file-declaration',
    '../lib/agents/harness/held-bytes/descriptors'].map((m) => require.resolve(m));
  const saved = process.env.GIT_FILE_SOURCE_PIN;
  const drop = () => mods.forEach((m) => { delete require.cache[m]; });
  drop(); process.env.GIT_FILE_SOURCE_PIN = 'Acme/Cfg';
  try {
    const pin = require(mods[0]); const decl = require(mods[1]); const { PLATFORM_DEFAULT_DESCRIPTORS } = require(mods[2]);
    const gh = PLATFORM_DEFAULT_DESCRIPTORS.find((d: any) => d.service === 'github-service');
    const map = pin.GIT_FILE_SOURCE_PINS['github-service'];
    ok(map.owner === 'acme' && map.repo === 'cfg', `map ${JSON.stringify(map)}`);
    ok(pin.PLATFORM_GIT_TARGET === 'github:acme:cfg', `target ${pin.PLATFORM_GIT_TARGET}`);
    ok(gh.files[0].target.const === pin.PLATFORM_GIT_TARGET, `descriptor const ${gh.files[0].target.const}`);
    ok(decl.PLATFORM_DECLARATION_TARGETS.includes(pin.PLATFORM_GIT_TARGET)
      && !decl.PLATFORM_DECLARATION_TARGETS.includes('github:paichart:paichart-configs'), `declaration targets ${decl.PLATFORM_DECLARATION_TARGETS}`);
    const call = pin.checkGitArguments('github-service', { owner: 'Acme', repo: 'Cfg', path: 'a.yaml', ref: 'main' });
    ok(call.ok === true && call.pinned === true, `pinned read refused: ${JSON.stringify(call)}`);
    const off = pin.checkGitArguments('github-service', { owner: 'paichart', repo: 'paichart-configs', path: 'a.yaml' });
    ok(off.ok === false && off.field === 'owner', `the default repo must be OFF-pin once the env names another: ${JSON.stringify(off)}`);
  } finally {
    if (saved === undefined) delete process.env.GIT_FILE_SOURCE_PIN; else process.env.GIT_FILE_SOURCE_PIN = saved;
    drop();
  }
});

test('P5 the self-host compose runs production\'s github-mcp-server digest and command', () => {
  // The public export excludes production's docker-compose.yml (private infrastructure) but ships this test in the battery:
  // there is nothing to compare against, so P5 is skipped there by name (sec-ops Build 1 M-1).
  if (!existsSync(join(ROOT, 'docker-compose.yml'))) { console.log('   (skipped: no production docker-compose.yml in this tree — the public export)'); return; }
  const grab = (f: string) => {
    const t = readFileSync(join(ROOT, f), 'utf8');
    const i = t.indexOf('\n  github-mcp:'); ok(i >= 0, `${f}: no github-mcp service`);
    const block = t.slice(i, t.indexOf('\n  github:', i));
    const img = /image:\s*(\S+)/.exec(block)?.[1]; const cmd = /command:\s*(\[.*\])/.exec(block)?.[1];
    ok(img && cmd, `${f}: image/command not found`);
    return { img, cmd };
  };
  const prod = grab('docker-compose.yml'); const self = grab('docker-compose.self-host.yml');
  ok(prod.img === self.img, `image differs: ${self.img} vs production ${prod.img}`);
  ok(/@sha256:[0-9a-f]{64}$/.test(String(self.img)), 'self-host image must be pinned by digest');
  ok(prod.cmd === self.cmd, `command differs: ${self.cmd} vs production ${prod.cmd}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
