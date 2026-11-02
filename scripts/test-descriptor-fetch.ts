/**
 * WI-B10 (2026-10-23) — the platform-side descriptor fetcher (lib/mcp/server/config/descriptor-fetch.js). Offline: the
 * https request and DNS lookup are injected fakes. Design §9.1 A + §10 A-6/A-11b/c; sec-ops B-3 probe list.
 */
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import * as net from 'net';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const f = require('../lib/mcp/server/config/descriptor-fetch.js');

let passed = 0; let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); } catch (e) { failed++; console.log(`  ❌ ${name}: ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, msg = '') { const A = JSON.stringify(a); const B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} expected ${B}, got ${A}`); }

type Reply = { status?: number; headers?: Record<string, string>; chunks?: (string | Buffer)[]; hang?: boolean; error?: boolean };
/** A fake https.request: records options, runs the injected lookup (so the address check is exercised), then replies. */
function fakeHttps(reply: Reply, seen: { options?: Record<string, unknown> } = {}) {
  return (options: Record<string, unknown>, onRes: (res: EventEmitter & Record<string, unknown>) => void) => {
    seen.options = options;
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    req.destroy = () => { /* noop */ };
    req.end = () => {
      // Like real Node: an IP-literal host is connected to directly — the lookup is NEVER called (sec-ops BUILD-B-1).
      if (net.isIP(options.hostname as string) !== 0) {
        if (reply.error) { setImmediate(() => req.emit('error', new Error('ECONNREFUSED'))); return; }
        if (reply.hang) return;
        const res = new EventEmitter() as EventEmitter & Record<string, unknown>;
        res.statusCode = reply.status ?? 200; res.headers = reply.headers ?? { 'content-type': 'application/json' };
        res.resume = () => { /* noop */ };
        onRes(res);
        setImmediate(() => { for (const c of reply.chunks ?? []) res.emit('data', Buffer.from(c)); res.emit('end'); });
        return;
      }
      (options.lookup as (h: string, o: object, cb: (e: Error | null, a?: unknown, fam?: number) => void) => void)(
        options.hostname as string, {}, (err) => {
          if (err) { setImmediate(() => req.emit('error', err)); return; }
          if (reply.error) { setImmediate(() => req.emit('error', new Error('ECONNREFUSED'))); return; }
          if (reply.hang) return;
          const res = new EventEmitter() as EventEmitter & Record<string, unknown>;
          res.statusCode = reply.status ?? 200; res.headers = reply.headers ?? { 'content-type': 'application/json' };
          res.resume = () => { /* noop */ };
          onRes(res);
          setImmediate(() => { for (const c of reply.chunks ?? []) res.emit('data', Buffer.from(c)); res.emit('end'); });
        });
    };
    return req;
  };
}
const dnsTo = (...addresses: [string, number][]) => (_h: string, _o: object, cb: (e: Error | null, a?: unknown) => void) =>
  cb(null, addresses.map(([address, family]) => ({ address, family })));
const PUBLIC = dnsTo(['185.199.108.133', 4]);
const URL_OK = 'https://raw.githubusercontent.com/acme/descriptors/main/devices.json';
const DESC = JSON.stringify({ name: 'acme-devices', endpoint: 'https://devices.acme.example/mcp' });

(async () => {
  console.log('\n── pre-connect refusals are NAMED ──');
  for (const [u, reason] of [
    ['http://x.example/a', 'descriptor-scheme'], ['https://u:p@x.example/a', 'descriptor-userinfo'],
    ['https://x.example/a?token=abc', 'descriptor-query'], ['https://x.example/a#frag', 'descriptor-query'], ['https://10.0.0.5/a', 'descriptor-address'],
    ['https://localhost/a', 'descriptor-address'], ['https://2130706433/a', 'descriptor-address'], ['not a url', 'descriptor-url-invalid'],
  ] as const) {
    await test(`${reason}: ${u}`, async () => { const r = await f.fetchDescriptor(u, { httpsRequest: fakeHttps({}), dnsLookup: PUBLIC }); eq([r.ok, r.reason, r.preConnect], [false, reason, true]); });
  }

  console.log('\n── resolved-address classifier (sec-ops B-3 probe list; each with a public control) ──');
  for (const [addr, fam] of [
    ['127.0.0.1', 4], ['169.254.169.254', 4], ['10.1.2.3', 4], ['224.0.0.1', 4], ['240.0.0.1', 4], ['255.255.255.255', 4], ['198.18.0.1', 4],
    ['::1', 6], ['::127.0.0.1', 6], ['::ffff:169.254.169.254', 6], ['2002:7f00:1::', 6], ['64:ff9b:1::7f00:1', 6], ['fec0::1', 6], ['ff02::1', 6],
    ['fd00::1', 6], ['fe80::1', 6], ['2001:db8::1', 6], ['2001::1', 6], ['garbage', 6],
  ] as const) {
    await test(`blocked: ${addr}`, () => eq(f.isBlockedAddress(addr, fam), true));
  }
  for (const [addr, fam] of [['185.199.108.133', 4], ['2606:4700::6810:84e5', 6], ['2002:b9c7:6c85::', 6]] as const) {
    await test(`public control allowed: ${addr}`, () => eq(f.isBlockedAddress(addr, fam), false));
  }
  await test('a public NAME resolving to loopback (127.0.0.1.nip.io class) is refused AFTER resolution, uniformly', async () => {
    const r = await f.fetchDescriptor('https://127.0.0.1.nip.io/x.json', { httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: dnsTo(['127.0.0.1', 4]) });
    eq([r.ok, r.reason, r.preConnect, r.cause], [false, 'descriptor-fetch-failed', false, 'blocked-address']);
  });
  await test('ANY blocked address in the answer set refuses (a mixed answer is not "one is public")', async () => {
    const r = await f.fetchDescriptor(URL_OK, { httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: dnsTo(['185.199.108.133', 4], ['10.0.0.1', 4]) });
    eq([r.ok, r.cause], [false, 'blocked-address']);
  });

  console.log('\n── response handling ──');
  await test('success: JSON object, raw-bytes sha, query-less url; strict TLS + identity + port 443 requested', async () => {
    const seen: { options?: Record<string, unknown> } = {};
    const r = await f.fetchDescriptor(URL_OK, { httpsRequest: fakeHttps({ headers: { 'content-type': 'text/plain; charset=utf-8' }, chunks: [DESC] }, seen), dnsLookup: PUBLIC });
    eq([r.ok, r.json.name, r.sha256, r.url], [true, 'acme-devices', createHash('sha256').update(DESC).digest('hex'), URL_OK]);
    const o = seen.options as Record<string, unknown>;
    eq([o.rejectUnauthorized, o.port, (o.headers as Record<string, string>)['Accept-Encoding'], o.agent, o.servername], [true, 443, 'identity', false, 'raw.githubusercontent.com']);
  });
  await test('3xx ⇒ descriptor-redirect (never followed)', async () => {
    const r = await f.fetchDescriptor(URL_OK, { httpsRequest: fakeHttps({ status: 302, headers: { location: 'https://10.0.0.1/' } }), dnsLookup: PUBLIC });
    eq([r.ok, r.reason], [false, 'descriptor-redirect']);
  });
  for (const [name, reply, cause] of [
    ['non-200', { status: 404 }, 'status-4xx'],
    ['wrong content-type', { headers: { 'content-type': 'text/html' }, chunks: ['<html>'] }, 'content-type'],
    ['encoded body', { headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' }, chunks: [DESC] }, 'content-encoding'],
    ['not JSON', { chunks: ['{oops'] }, 'not-json'],
    ['JSON array root', { chunks: ['[1]'] }, 'not-an-object'],
    ['over 256 KB', { chunks: ['{"a":"' + 'x'.repeat(300 * 1024) + '"}'] }, 'too-large'],
    ['connect refused', { error: true }, 'connect'],
  ] as const) {
    await test(`uniform failure: ${name}`, async () => {
      const r = await f.fetchDescriptor(URL_OK, { httpsRequest: fakeHttps(reply as Reply), dnsLookup: PUBLIC });
      eq([r.ok, r.reason, r.preConnect, r.cause], [false, 'descriptor-fetch-failed', false, cause]);
    });
  }
  await test('one deadline covers a hanging server', async () => {
    const r = await f.fetchDescriptor(URL_OK, { httpsRequest: fakeHttps({ hang: true }), dnsLookup: PUBLIC, deadlineMs: 50 });
    eq([r.ok, r.reason, r.cause], [false, 'descriptor-fetch-failed', 'deadline']);
  });
  await test('the agent-facing reason never carries status, body or address text', async () => {
    const r = await f.fetchDescriptor(URL_OK, { httpsRequest: fakeHttps({ status: 500, chunks: ['internal 10.0.0.9 secret'] }), dnsLookup: PUBLIC });
    eq(Object.keys(r).sort(), ['cause', 'ok', 'preConnect', 'reason']); eq(r.reason, 'descriptor-fetch-failed');
  });

  console.log('\n── IP-literal hosts: refused BEFORE connect (sec-ops BUILD-B-1 — Node skips the lookup for them) ──');
  for (const u of ['https://198.18.0.1/a', 'https://224.0.0.1/a', 'https://240.0.0.1/a', 'https://192.0.0.8/a', 'https://[::127.0.0.1]/a',
    'https://[2002:7f00:1::]/a', 'https://[64:ff9b:1::7f00:1]/a', 'https://[fec0::1]/a', 'https://[::ffff:169.254.169.254]/a', 'https://0x7f000001/a']) {
    let called = false;
    await test(`IP literal refused pre-connect: ${u}`, async () => {
      const r = await f.fetchDescriptor(u, { httpsRequest: (() => { called = true; return fakeHttps({ chunks: [DESC] }); })(), dnsLookup: PUBLIC });
      eq([r.ok, r.reason, r.preConnect], [false, 'descriptor-address', true]);
    });
    void called;
  }
  await test('control: a public IP literal passes the pre-connect check (and is fetched without a lookup)', async () => {
    let looked = false;
    const r = await f.fetchDescriptor('https://185.199.108.133/acme/devices.json', { httpsRequest: fakeHttps({ chunks: [DESC] }),
      dnsLookup: (_h: string, _o: object, cb: (e: Error | null, a?: unknown) => void) => { looked = true; cb(null, [{ address: '185.199.108.133', family: 4 }]); } });
    eq([r.ok, looked], [true, false]);
  });
  console.log('\n── REAL https.request (no fake): the fake cannot drift from Node again ──');
  await test('real https: an IP-literal blocked host never reaches a socket (pre-connect refusal)', async () => {
    const r = await f.fetchDescriptor('https://[::127.0.0.1]/a');
    eq([r.ok, r.reason, r.preConnect], [false, 'descriptor-address', true]);
  });
  await test('real https: a hostname IS resolved through the checked lookup, and a blocked answer fails before connect', async () => {
    let looked = 0;
    const r = await f.fetchDescriptor('https://descriptors.example/a.json', { deadlineMs: 3000,
      dnsLookup: (_h: string, _o: object, cb: (e: Error | null, a?: unknown) => void) => { looked++; cb(null, [{ address: '127.0.0.1', family: 4 }]); } });
    eq([r.ok, r.reason, looked >= 1], [false, 'descriptor-fetch-failed', true]);
  });

  console.log('\n── INTERNAL-FIT I-4/I-5/I-6 (owner 2026-10-24): operator allowlist, any port, http opt-in ──');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const al = require('../lib/utils/endpoint-allowlist.js');
  await test('I-5: any https port is fetched, on that port', async () => {
    const seen: { options?: Record<string, unknown> } = {};
    const r = await f.fetchDescriptor('https://descriptors.example:8443/a.json', { httpsRequest: fakeHttps({ chunks: [DESC] }, seen), dnsLookup: PUBLIC });
    eq([r.ok, seen.options?.port], [true, 8443]);
  });
  await test('I-6: plain http refused by default (hosted)', async () => {
    const r = await f.fetchDescriptor('http://descriptors.example/a.json', { httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: PUBLIC });
    eq([r.ok, r.reason, r.preConnect], [false, 'descriptor-scheme', true]);
  });
  await test('I-6: plain http fetched when the operator opts in; port 80; no TLS options', async () => {
    const seen: { options?: Record<string, unknown> } = {};
    const r = await f.fetchDescriptor('http://descriptors.example/a.json', { allowHttp: true, httpsRequest: fakeHttps({ chunks: [DESC] }, seen), dnsLookup: PUBLIC });
    eq([r.ok, seen.options?.port, 'rejectUnauthorized' in (seen.options ?? {}), r.url], [true, 80, false, 'http://descriptors.example/a.json']);
  });
  await test('I-4 control: allowlist UNSET — a private resolved address is still refused', async () => {
    al._resetForTests({});
    const r = await f.fetchDescriptor('https://git.corp.example/a.json', { httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: dnsTo(['10.20.30.40', 4]) });
    eq([r.ok, r.reason, r.cause], [false, 'descriptor-fetch-failed', 'blocked-address']);
  });
  await test('I-4: an internal hostname resolving to an ALLOWLISTED private address is fetched', async () => {
    al._resetForTests({ HUB_PRIVATE_ENDPOINT_ALLOWLIST: '10.20.0.0/16' });
    const r = await f.fetchDescriptor('https://git.corp.example/a.json', { httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: dnsTo(['10.20.30.40', 4]) });
    eq(r.ok, true);
  });
  await test('I-4: a resolved private address OUTSIDE the allowlist is refused', async () => {
    al._resetForTests({ HUB_PRIVATE_ENDPOINT_ALLOWLIST: '10.20.0.0/16' });
    const r = await f.fetchDescriptor('https://git.corp.example/a.json', { httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: dnsTo(['10.99.0.1', 4]) });
    eq([r.ok, r.cause], [false, 'blocked-address']);
  });
  await test('I-4: ONE blocked address among the resolved set refuses the fetch (allowlisted + unlisted)', async () => {
    al._resetForTests({ HUB_PRIVATE_ENDPOINT_ALLOWLIST: '10.20.0.0/16' });
    const r = await f.fetchDescriptor('https://git.corp.example/a.json', { httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: dnsTo(['10.20.30.40', 4], ['192.168.1.1', 4]) });
    eq([r.ok, r.cause], [false, 'blocked-address']);
  });
  await test('I-4: an allowlisted private IP-literal host passes pre-connect', async () => {
    al._resetForTests({ HUB_PRIVATE_ENDPOINT_ALLOWLIST: '10.20.0.0/16' });
    const r = await f.fetchDescriptor('https://10.20.30.40/a.json', { httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: PUBLIC });
    eq(r.ok, true);
  });
  await test('I-4: hard-deny (cloud metadata) is NEVER allowlistable, even inside an allowlisted CIDR', async () => {
    al._resetForTests({ HUB_PRIVATE_ENDPOINT_ALLOWLIST: '169.254.0.0/16' });
    const lit = await f.fetchDescriptor('https://169.254.169.254/a.json', { httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: PUBLIC });
    const res = await f.fetchDescriptor('https://meta.corp.example/a.json', { httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: dnsTo(['169.254.169.254', 4]) });
    eq([lit.ok, lit.reason, res.ok, res.cause], [false, 'descriptor-address', false, 'blocked-address']);
  });
  await test('I-4: this hub\'s own listener is never allowlistable (self-loop)', async () => {
    al._resetForTests({ HUB_PRIVATE_ENDPOINT_ALLOWLIST: '127.0.0.1:3000', PORT: '3000' });
    const r = await f.fetchDescriptor('https://127.0.0.1:3000/a.json', { httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: PUBLIC });
    eq([r.ok, r.reason], [false, 'descriptor-address']);
  });
  al._resetForTests({});

  console.log('\n── INTERNAL-FIT I-7 (sec-ops option b): a query only from a HUMAN; stored with values masked ──');
  await test('I-7: a query is refused by default (agent path) — pre-connect, named', async () => {
    const r = await f.fetchDescriptor('https://dev.azure.example/org/_apis/git/repositories/r/items?path=/d.json&api-version=7.1', { httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: PUBLIC });
    eq([r.ok, r.reason, r.preConnect], [false, 'descriptor-query', true]);
  });
  await test('I-7: with allowQuery the query is SENT, the returned url has none, the storedUrl masks every value', async () => {
    const seen: { options?: Record<string, unknown> } = {};
    const r = await f.fetchDescriptor('https://gitlab.corp.example/api/v4/projects/7/repository/files/d.json/raw?ref=main&private_token=SECRETTOKEN123', { allowQuery: true, httpsRequest: fakeHttps({ chunks: [DESC] }, seen), dnsLookup: PUBLIC });
    eq([r.ok, seen.options?.path, r.url, r.storedUrl], [true, '/api/v4/projects/7/repository/files/d.json/raw?ref=main&private_token=SECRETTOKEN123',
      'https://gitlab.corp.example/api/v4/projects/7/repository/files/d.json/raw', 'https://gitlab.corp.example/api/v4/projects/7/repository/files/d.json/raw?ref=***&private_token=***']);
    if (JSON.stringify({ url: r.url, storedUrl: r.storedUrl }).includes('SECRETTOKEN123')) throw new Error('token leaked into a returned URL');
  });
  await test('I-7: a fragment is refused even with allowQuery', async () => {
    const r = await f.fetchDescriptor('https://x.example/a.json?ref=main#frag', { allowQuery: true, httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: PUBLIC });
    eq([r.ok, r.reason], [false, 'descriptor-query']);
  });
  await test('I-7: a query URL still gets the address check (allowQuery is not an address bypass)', async () => {
    const r = await f.fetchDescriptor('https://10.9.9.9/a.json?ref=main', { allowQuery: true, httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: PUBLIC });
    eq([r.ok, r.reason], [false, 'descriptor-address']);
  });

  console.log('\n── I-7 condition 3.1/3.3: the ONE masking function (parsed keys; odd ⇒ ?***) and masked URLs are not fetchable ──');
  for (const [inp, want] of [
    ['https://g.example/f?private_token=S3CR3T&ref=main', 'https://g.example/f?private_token=***&ref=***'],
    ['https://g.example/f?a=1&a=2', 'https://g.example/f?a=***&a=***'],                 // repeated key kept, order kept
    ['https://g.example/f?a=1;b=2', 'https://g.example/f?***'],                         // ';' separator ⇒ whole query masked
    ['https://g.example/f?k%26x=1', 'https://g.example/f?***'],                         // key decoding to '&'
    ['https://g.example/f?a%3Db=1', 'https://g.example/f?***'],                         // key decoding to '='
    ['https://g.example/f?flag', 'https://g.example/f?***'],                            // bare param: it may BE the token (SF-1)
    ['https://g.example/f?3f9a8c7d6e5f', 'https://g.example/f?***'],                    // a bare secret is never stored
    ['https://g.example/f?ref=main&3f9a8c', 'https://g.example/f?***'],                 // one bare param masks the whole query
    ['https://g.example/f?k=', 'https://g.example/f?k=***'],                            // empty value keeps its key
    ['https://g.example/f?', 'https://g.example/f'],                                    // empty query
    ['https://g.example/f?=x', 'https://g.example/f?***'],                              // empty key
    [`https://g.example/f?${'k'.repeat(65)}=1`, 'https://g.example/f?***'],             // over-long key
    ['https://g.example:8443/f?t=1', 'https://g.example:8443/f?t=***'],                 // port kept
  ] as const) {
    await test(`mask: ${inp.slice(0, 70)}`, () => eq(f.maskQueryValues(new URL(inp)), want));
  }
  await test('3.3: a masked URL is refused by name, never fetched', async () => {
    let called = false;
    const r1 = await f.fetchDescriptor('https://g.example/f?private_token=***', { allowQuery: true, httpsRequest: (() => { called = true; return fakeHttps({ chunks: [DESC] }); })(), dnsLookup: PUBLIC });
    const r2 = await f.fetchDescriptor('https://g.example/f?***', { allowQuery: true, httpsRequest: fakeHttps({ chunks: [DESC] }), dnsLookup: PUBLIC });
    eq([r1.reason, r2.reason], ['descriptor-url-masked', 'descriptor-url-masked']); void called;
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
