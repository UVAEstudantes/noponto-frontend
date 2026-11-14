const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.join(__dirname, 'gateway.ts');
const mod = new Module(filename, module);
mod.require = id => id === '../config/env' ? { config: { API_BASE_URL: 'https://primary.test', REQUEST_TIMEOUT_MS: 1000 } }
  : { dominioNgrok: host => host.endsWith('ngrok-free.dev') };
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { createGateway, createHealthNotices } = mod.exports;
function fixture() {
  let time = 1000000;
  const health = [true, true], calls = [];
  const transport = async (url, options) => {
    calls.push({ url, options });
    const index = url.includes('primary') ? 0 : 1;
    return new Response(url.endsWith('/health/live') ? JSON.stringify({ status: 'healthy' }) : 'denied', { status: url.endsWith('/health/live') ? health[index] ? 200 : 502 : url.includes('/health/') ? 404 : 401 });
  };
  const gateway = createGateway('https://primary.test', 'https://reserve.test', transport, () => time);
  return { gateway, health, calls, tick: async () => { time += 60000; await gateway.check(); } };
}
test('healthy primary and isolated failure retain primary', async () => {
  const f = fixture(); await f.gateway.check(true);
  assert.equal(f.gateway.snapshot().status, 'online');
  f.health[0] = false; await f.tick(); assert.equal(f.gateway.snapshot().active, 0);
  f.health[0] = true; await f.tick(); assert.equal(f.gateway.snapshot().active, 0);
});
test('persistent failures select tested reserve and recover after cooldown', async () => {
  const f = fixture(); await f.gateway.check(true); f.health[0] = false;
  await f.tick(); await f.tick(); assert.equal(f.gateway.snapshot().active, 0);
  await f.tick(); assert.equal(f.gateway.snapshot().active, 1);
  f.health[0] = true; await f.tick(); await f.tick(); assert.equal(f.gateway.snapshot().active, 1);
  await f.tick(); assert.equal(f.gateway.snapshot().active, 0);
});
test('startup second attempt and both gateways unavailable', async () => {
  const f = fixture(); f.health.fill(false); await f.gateway.check(true);
  assert.equal(f.calls.length, 3); assert.equal(f.gateway.snapshot().status, 'unavailable');
});
test('confirmed offline never labels backend and does not probe', async () => {
  const f = fixture(); f.gateway.setOffline(true); await f.gateway.check(true);
  assert.equal(f.calls.length, 0); assert.equal(f.gateway.snapshot().status, 'offline');
});
test('401 endpoint response neither changes gateway nor retries mutation', async () => {
  const f = fixture(); await f.gateway.check(true); const before = f.calls.length;
  const response = await f.gateway.request('https://primary.test/private', { method: 'POST' });
  assert.equal(response.status, 401); assert.equal(f.calls.length, before + 1); assert.equal(f.gateway.snapshot().active, 0);
});
test('concurrent checks coalesce and empty vehicle data cannot change source health', async () => {
  const f = fixture(); await Promise.all([f.gateway.check(true), f.gateway.check(true)]);
  assert.equal(f.calls.length, 3); assert.deepEqual(f.gateway.snapshot().sources, { sppo: 'unknown', brt: 'unknown' });
});
test('404 and 403 do not request health; 503 with healthy liveness retains primary', async () => {
  for (const status of [404, 403, 503]) {
    let calls = 0;
    const g = createGateway('https://primary.test', 'https://reserve.test', async url => {
      calls++; return new Response(url.endsWith('/health/live') ? JSON.stringify({ status: 'healthy' }) : 'error', { status: url.endsWith('/health/live') ? 200 : status });
    });
    await g.request('https://primary.test/endpoint');
    await new Promise(setImmediate);
    assert.equal(g.snapshot().active, 0);
    assert.equal(calls, status === 503 ? 4 : 1);
  }
});
test('caller cancellation is forwarded without triggering diagnostics or retry', async () => {
  const controller = new AbortController(); let calls = 0;
  const g = createGateway('https://primary.test', '', async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('cancelled'))));
  });
  const pending = g.request('https://primary.test/endpoint', { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, /cancelled/); assert.equal(calls, 1);
});
test('persistent WebSocket failure tests reserve handshake and confirms primary recovery', async () => {
  const previous = global.WebSocket;
  const sockets = [];
  global.WebSocket = class {
    constructor(url) { sockets.push(url); queueMicrotask(() => this.onopen?.()); }
    send() { queueMicrotask(() => this.onmessage?.({ data: '{}\u001e' })); }
    close() {}
  };
  try {
    const f = fixture(); await f.gateway.check(true);
    await f.gateway.hubFailure(); await f.gateway.hubFailure();
    assert.equal(f.gateway.snapshot().active, 0);
    await f.gateway.hubFailure(); assert.equal(f.gateway.snapshot().active, 1);
    assert.ok(sockets[0].startsWith('wss://reserve.test/'));
    await f.tick(); await f.tick(); assert.equal(f.gateway.snapshot().active, 1);
    await f.tick(); assert.equal(f.gateway.snapshot().active, 0);
    assert.ok(sockets.some(url => url.startsWith('wss://primary.test/')));
  } finally { global.WebSocket = previous; }
});

function monitored() {
  let time = 1000000;
  const data = { ready: 'healthy', sppo: 'healthy', brt: 'healthy', legacy: false };
  const calls = [];
  const g = createGateway('https://primary.test', 'https://reserve.test', async url => {
    calls.push(url);
    if (data.legacy) return new Response(url.endsWith('/') ? 'Hello World!' : '', { status: url.endsWith('/') ? 200 : 404 });
    if (url.endsWith('/health/live')) return Response.json({ status: 'healthy', checkedAt: new Date(time).toISOString() });
    if (url.endsWith('/health/ready')) return Response.json({ status: data.ready, dependencies: { postgres: { status: data.ready }, redis: { status: 'healthy' } } }, { status: data.ready === 'unhealthy' ? 503 : 200 });
    return Response.json({ status: 'degraded', sources: { sppo: { status: data.sppo, reason: null }, brt: { status: data.brt, reason: null } }, providers: { its: { status: 'unknown' }, gtfsRt: { status: 'unknown' } } });
  }, () => time);
  return { g, data, calls, notices: createHealthNotices(() => time), tick: async (ms = 60000) => { time += ms; await g.check(); } };
}
test('legacy API 404 health uses exact root response and unknown monitoring', async () => {
  const f = monitored(); f.data.legacy = true; await f.g.check(true);
  assert.equal(f.g.snapshot().status, 'online'); assert.equal(f.g.snapshot().active, 0);
  assert.equal(f.g.snapshot().readiness, 'unknown'); assert.equal(f.notices(f.g.snapshot()), null);
  assert.ok(f.calls.includes('https://primary.test/'));
});
test('updated healthy backend shares checks and caches service monitoring', async () => {
  const f = monitored(); await Promise.all([f.g.check(true), f.g.check(true)]);
  assert.equal(f.calls.length, 3); assert.equal(f.g.snapshot().readiness, 'healthy');
  assert.deepEqual(f.g.snapshot().sources, { sppo: 'healthy', brt: 'healthy' });
  await f.tick(10000); assert.equal(f.calls.length, 4); assert.equal(f.notices(f.g.snapshot()), null);
});
test('readiness 503 warns once and never switches gateway', async () => {
  const f = monitored(); f.data.ready = 'unhealthy'; f.data.sppo = 'unavailable';
  await f.g.check(true); await f.tick();
  assert.equal(f.g.snapshot().active, 0); assert.equal(f.g.snapshot().status, 'online');
  assert.equal(f.notices(f.g.snapshot()).key, 'dependencies');
  await f.tick(); assert.equal(f.notices(f.g.snapshot()), null);
  f.g.setOffline(true); assert.equal(f.notices(f.g.snapshot()).key, 'offline');
});
for (const mode of ['sppo', 'brt']) {
  test(`${mode} outage needs confirmation, preserves other mode and suppresses spam`, async () => {
    const f = monitored(); f.data[mode] = 'unavailable'; await f.g.check(true);
    assert.equal(f.notices(f.g.snapshot()), null); await f.tick();
    assert.equal(f.notices(f.g.snapshot()).key, mode);
    assert.equal(f.g.snapshot().sources[mode === 'sppo' ? 'brt' : 'sppo'], 'healthy');
    assert.equal(f.g.snapshot().active, 0);
    await f.tick(); assert.equal(f.notices(f.g.snapshot()), null);
    f.data[mode] = 'healthy'; await f.tick(); f.notices(f.g.snapshot()); await f.tick(); f.notices(f.g.snapshot());
    f.data[mode] = 'unavailable'; await f.tick(); await f.tick(); assert.equal(f.notices(f.g.snapshot()), null);
    f.data[mode] = 'healthy'; await f.tick(600000); f.notices(f.g.snapshot()); await f.tick(); f.notices(f.g.snapshot());
    f.data[mode] = 'unavailable'; await f.tick(); await f.tick(); assert.equal(f.notices(f.g.snapshot()).key, mode);
  });
}
test('unknown warmup and degraded sources never raise outage notices', async () => {
  const f = monitored(); f.data.sppo = 'unknown'; f.data.brt = 'degraded';
  await f.g.check(true); await f.tick(); assert.equal(f.notices(f.g.snapshot()), null);
  assert.deepEqual(f.g.snapshot().confirmed, { sppo: false, brt: false });
});

test('invalid monitoring responses remain unknown without affecting liveness', async () => {
  const g = createGateway('https://primary.test', '', async url => url.endsWith('/health/live')
    ? Response.json({ status: 'healthy' }) : new Response('<html>gateway error</html>', { status: 503 }));
  await g.check(true);
  assert.equal(g.snapshot().status, 'online'); assert.equal(g.snapshot().readiness, 'unknown');
  assert.deepEqual(g.snapshot().sources, { sppo: 'unknown', brt: 'unknown' });
});
test('offline during monitoring discards late dependency and source results', async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const g = createGateway('https://primary.test', '', async url => {
    if (url.endsWith('/health/live')) return Response.json({ status: 'healthy' });
    await wait;
    return Response.json({ status: 'unhealthy', sources: { sppo: { status: 'unavailable' }, brt: { status: 'unavailable' } } }, { status: 503 });
  });
  const check = g.check(true); await new Promise(setImmediate); g.setOffline(true); release(); await check;
  assert.equal(g.snapshot().status, 'offline'); assert.equal(g.snapshot().readiness, 'unknown');
  assert.deepEqual(g.snapshot().confirmed, { sppo: false, brt: false });
});
