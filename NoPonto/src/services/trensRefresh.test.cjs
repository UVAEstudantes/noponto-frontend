/* global __dirname */
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(relative, dependencies) {
  const filename = path.resolve(__dirname, relative);
  const mod = new Module(filename, module);
  mod.require = (id) => {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error(`Unexpected dependency: ${id}`);
  };
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return mod.exports;
}
function fixture(status = 200, result = 'Updated', retryAfter = '300', options = {}) {
  const values = new Map(); let calls = 0;
  if (options.storedId !== undefined) values.set('trens.installation.v1', options.storedId);
  const requests = [], logs = [];
  const storage = { getItem: async k => values.get(k) ?? null, setItem: async (k,v) => { values.set(k,v); } };
  const oldFetch = global.fetch, oldDev = global.__DEV__, oldInfo = console.info;
  global.__DEV__ = !!options.dev; console.info = (...args) => logs.push(args);
  global.fetch = async (url, init) => {
    calls++; requests.push({ url, init });
    if (options.syncFetchError) throw new TypeError('fetch unavailable');
    if (options.waitForAbort) await new Promise((_, reject) => {
      const abort = () => { const error = new Error('The operation was aborted'); error.name = 'AbortError'; reject(error); };
      if (init.signal.aborted) abort(); else init.signal.addEventListener('abort', abort, { once: true });
    });
    if (status === 0) { const error = new Error(options.errorMessage ?? 'offline'); error.name = options.errorName ?? 'TypeError'; throw error; }
    return { status, ok: status >= 200 && status < 300,
      headers: { get: name => name.toLowerCase() === 'retry-after' ? retryAfter : 'application/json' },
      text: async () => { if (options.bodyError) throw options.bodyError;
        return options.body ?? JSON.stringify({ status: result, retryAfterSeconds: 300 }); } };
  };
  const service = load('./trensRefresh.ts', {
    '@react-native-async-storage/async-storage': storage, 'expo-crypto': { randomUUID: () => '11111111-1111-1111-1111-111111111111' },
    'expo-secure-store': { getItemAsync: async () => options.secureStoreRecord ?? null },
    'react-native': { Platform: { OS: options.platform ?? 'web' } }, '@/src/config/env': { config: { API_BASE_URL: 'https://example.test' } },
  });
  return { ...service, values, requests, logs, calls: () => calls, restore: () => {
    global.fetch = oldFetch; console.info = oldInfo;
    if (oldDev === undefined) delete global.__DEV__; else global.__DEV__ = oldDev;
  } };
}
test('refresh maps backend results to friendly messages and persists installation cooldown', async () => {
  for (const [status, expected] of [['Updated', /Atualizado agora/], ['Reused', /Usando dados recentes já consultados/],
    ['InvalidContext', /Sentido indisponível/], ['Unavailable', /Falha na atualização\. Dados anteriores preservados/]]) {
    const f = fixture(200, status);
    try {
      assert.match(await f.refreshTrens('stop', 'direction'), expected);
      assert.match(await f.refreshTrens('other', 'other'), /Aguarde \d+ s para atualizar novamente/);
      assert.equal(f.calls(), 1);
      assert.ok(Number(f.values.get('trens.refresh.prazo')) > Date.now());
    } finally { f.restore(); }
  }
});

test('refresh works when AbortSignal.timeout is unavailable and clears its timer', async () => {
  const f = fixture();
  const oldTimeout = AbortSignal.timeout, oldSetTimeout = global.setTimeout, oldClearTimeout = global.clearTimeout;
  let cleared = false;
  try {
    AbortSignal.timeout = undefined;
    global.clearTimeout = id => { cleared = true; oldClearTimeout(id); };
    assert.equal(await f.refreshTrens('stop', 'direction'), 'Atualizado agora.');
    assert.equal(f.requests.length, 1);
    assert.ok(f.requests[0].init.signal instanceof AbortSignal);
    assert.equal(cleared, true);
  } finally {
    AbortSignal.timeout = oldTimeout; global.setTimeout = oldSetTimeout; global.clearTimeout = oldClearTimeout; f.restore();
  }
});

test('refresh aborts at timeout, classifies it, and clears its timer', async () => {
  const f = fixture(0, 'Updated', '300', { dev: true, waitForAbort: true });
  const oldSetTimeout = global.setTimeout, oldClearTimeout = global.clearTimeout;
  let cleared = false;
  try {
    global.setTimeout = callback => { callback(); return 1; };
    global.clearTimeout = () => { cleared = true; };
    assert.match(await f.refreshTrens('stop', 'direction'), /Falha na atualização/);
    assert.equal(f.logs.find(args => args[1] === 'error')?.[2].kind, 'timeout');
    assert.equal(cleared, true);
  } finally { global.setTimeout = oldSetTimeout; global.clearTimeout = oldClearTimeout; f.restore(); }
});

test('synchronous fetch failure does not start the cooldown', async () => {
  const f = fixture();
  const oldSetTimeout = global.setTimeout;
  try {
    global.setTimeout = () => { throw new TypeError('timer unavailable'); };
    await f.refreshTrens('stop', 'direction');
    assert.equal(f.values.has('trens.refresh.prazo'), false);
    assert.equal(f.calls(), 0);
  } finally { global.setTimeout = oldSetTimeout; f.restore(); }
});
test('RateLimited reports and persists the backend cooldown', async () => {
  const f = fixture(200, 'RateLimited');
  try {
    assert.equal(await f.refreshTrens('stop', 'direction'), 'Aguarde 300 s para atualizar novamente.');
    assert.ok(Number(f.values.get('trens.refresh.prazo')) >= Date.now() + 299000);
  } finally { f.restore(); }
});
test('refresh handles 429, 503 and network failure without returning replacement events', async () => {
  for (const [status, expected] of [[429, /Aguarde 300 s para atualizar novamente/], [503, /Falha na atualização\. Dados anteriores preservados/],
    [0, /Falha na atualização\. Dados anteriores preservados/]]) {
    const f = fixture(status);
    try { assert.match(await f.refreshTrens('stop', 'direction'), expected); }
    finally { f.restore(); }
  }
});

test('regenerates malformed and zero persisted installation IDs before POST', async () => {
  for (const storedId of ['not-a-uuid', '00000000-0000-0000-0000-000000000000']) {
    const f = fixture(200, 'Updated', '300', { storedId });
    try {
      await f.refreshTrens('stop', 'direction');
      const body = JSON.parse(f.requests[0].init.body);
      assert.equal(body.instalacaoId, '11111111-1111-1111-1111-111111111111');
      assert.equal(f.values.get('trens.installation.v1'), body.instalacaoId);
      assert.notEqual(body.instalacaoId, storedId);
    } finally { f.restore(); }
  }
});

test('valid SecureStore installation ID replaces an invalid AsyncStorage value', async () => {
  const secureId = '22222222-2222-2222-2222-222222222222';
  const f = fixture(200, 'Updated', '300', { storedId: 'bad-id', platform: 'android',
    secureStoreRecord: JSON.stringify({ instalacaoId: secureId }) });
  try {
    await f.refreshTrens('stop', 'direction');
    assert.equal(JSON.parse(f.requests[0].init.body).instalacaoId, secureId);
    assert.equal(f.values.get('trens.installation.v1'), secureId);
  } finally { f.restore(); }
});

test('development trace summarizes HTTP errors without exposing installation ID', async () => {
  const installationId = '33333333-3333-3333-3333-333333333333';
  const f = fixture(400, 'InvalidContext', '300', { storedId: installationId, dev: true,
    body: JSON.stringify({ status: 'InvalidContext', diagnostic: 'invalid_ids', observationCount: 0 }) });
  try {
    assert.match(await f.refreshTrens('stop-id', 'sense-id'), /Falha na atualização/);
    const find = event => f.logs.find(args => args[0] === '[trem-refresh]' && args[1] === event)?.[2];
    assert.deepEqual(find('request'), { method: 'POST', url: 'https://example.test/paradas/stop-id/trens/refresh',
      exists: true, uuidValid: true, nonZero: true });
    const response = find('response');
    assert.equal(response.httpStatus, 400); assert.equal(response.contentType, 'application/json');
    assert.equal(response.body.diagnostic, 'invalid_ids'); assert.equal(response.body.observationCount, 0);
    assert.equal(find('result').reason, 'http_400'); assert.equal(find('result').diagnostic, 'invalid_ids');
    assert.doesNotMatch(JSON.stringify(f.logs), new RegExp(installationId));
  } finally { f.restore(); }
});

test('development trace distinguishes timeout and response parsing errors', async () => {
  const timeout = fixture(0, 'Updated', '300', { dev: true, errorName: 'TimeoutError', errorMessage: 'request timed out' });
  try {
    assert.match(await timeout.refreshTrens('stop', 'direction'), /Falha na atualização/);
    const error = timeout.logs.find(args => args[0] === '[trem-refresh]' && args[1] === 'error')?.[2];
    assert.equal(error.kind, 'timeout'); assert.equal(error.name, 'TimeoutError'); assert.equal(error.message, 'request timed out');
  } finally { timeout.restore(); }
  const malformed = fixture(200, 'Updated', '300', { dev: true, body: 'not-json' });
  try {
    assert.match(await malformed.refreshTrens('stop', 'direction'), /Falha na atualização/);
    assert.equal(malformed.logs.find(args => args[0] === '[trem-refresh]' && args[1] === 'parse-error')?.[2].phase, 'response_body');
  } finally { malformed.restore(); }
});

test('response read errors retain HTTP status and content type in development logs', async () => {
  const f = fixture(400, 'InvalidContext', '300', { dev: true, bodyError: new Error('stream closed') });
  try {
    assert.match(await f.refreshTrens('stop', 'direction'), /Falha na atualização/);
    const error = f.logs.find(args => args[0] === '[trem-refresh]' && args[1] === 'error')?.[2];
    assert.equal(error.kind, 'response_read'); assert.equal(error.httpStatus, 400);
    assert.equal(error.contentType, 'application/json'); assert.equal(error.message, 'stream closed');
  } finally { f.restore(); }
});

test('production mode emits no refresh diagnostics', async () => {
  const f = fixture(200, 'Updated');
  try {
    await f.refreshTrens('stop', 'direction');
    assert.deepEqual(f.logs, []);
  } finally { f.restore(); }
});
