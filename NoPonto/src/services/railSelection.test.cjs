const assert = require("node:assert/strict");
const test = require("node:test");
const { criarHarness } = require("../hooks/radarTestHarness.cjs");

function service() {
  const h = criarHarness();
  const calls = [];
  const response = { generatedAtUtc: "2026-11-07T12:00:00Z", vehicles: [] };
  const rail = h.carregar("../services/railRealtime.ts", {
    "@/src/services/api": { api: { get: async (...args) => {
      calls.push(args); return { ok: true, data: response };
    } } },
    "@/src/utils/railGeometry": { PromiseCache: class {} },
  });
  return { ...rail, calls, response };
}

test("rail request sends repeated selected lines and preserves legacy filters", async () => {
  const rail = service();
  assert.equal(await rail.fetchRailSnapshot({ linhaIds: ["first", "second", "first"],
    linhaId: "first", sentidoId: "direction" }), rail.response);
  const [endpoint, options] = rail.calls[0];
  const url = new URL(endpoint, "https://api.invalid");
  assert.equal(url.pathname, "/rail/vehicles/snapshot");
  assert.deepEqual(url.searchParams.getAll("linhaIds"), ["first", "second"]);
  assert.deepEqual(options.params, { linhaId: "first", sentidoId: "direction" });
});

test("rail request with empty selection performs no HTTP request", async () => {
  const rail = service();
  assert.equal(await rail.fetchRailSnapshot({ linhaIds: [] }), null);
  assert.equal(rail.calls.length, 0);
});

test("rail request without line array preserves old endpoint and parameters", async () => {
  const rail = service();
  await rail.fetchRailSnapshot();
  await rail.fetchRailSnapshot({ linhaId: "first", sentidoId: "direction" });
  assert.deepEqual(rail.calls, [
    ["/rail/vehicles/snapshot", { params: {} }],
    ["/rail/vehicles/snapshot", { params: { linhaId: "first", sentidoId: "direction" } }],
  ]);
});

test("rail selection survives the real API URL builder alongside direction filters", async () => {
  const h = criarHarness();
  const api = h.carregar("../services/api.ts", {
    "@/src/config/env": { config: { API_BASE_URL: "https://api.invalid" } },
  });
  const rail = h.carregar("../services/railRealtime.ts", {
    "@/src/services/api": api,
    "@/src/utils/railGeometry": { PromiseCache: class {} },
  });
  const previousFetch = global.fetch;
  const urls = [];
  const response = { generatedAtUtc: "2026-11-07T12:00:00Z", vehicles: [] };
  global.fetch = async url => {
    urls.push(new URL(url));
    return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => response };
  };
  try {
    assert.deepEqual(await rail.fetchRailSnapshot({ linhaIds: ["first", "second"],
      sentidoId: "direction" }), response);
    assert.equal(urls.length, 1);
    assert.equal(urls[0].pathname, "/rail/vehicles/snapshot");
    assert.deepEqual(urls[0].searchParams.getAll("linhaIds"), ["first", "second"]);
    assert.equal(urls[0].searchParams.get("sentidoId"), "direction");
  } finally { global.fetch = previousFetch; }
});

function hook() {
  const h = criarHarness();
  const calls = [];
  const useRail = h.carregar("useRailRealtime.ts", {
    "@/src/config/env": { config: { RAIL_DEMO: false, RAIL_POLL_INTERVAL_MS: 5000 } },
    "@/src/services/railRealtime": {
      fetchRailSnapshot: async filters => { calls.push(filters); return { vehicles: [] }; },
      getRailGeometry: async () => { throw new Error("Empty response must not load geometry"); },
    },
  }).useRailRealtime;
  return { h, calls, useRail };
}

test("rail hook empty selection skips polling and resumes when selected", async () => {
  const { h, calls, useRail } = hook();
  let selection = [];
  h.render(() => useRail({ enabled: true, linhaIds: selection }));
  await h.avancar(15000);
  assert.equal(calls.length, 0);
  assert.equal(h.timerCount, 0);
  selection = ["second", "first", "first"];
  h.render(); await h.flush();
  assert.deepEqual(calls, [{ linhaId: undefined, sentidoId: undefined, linhaIds: ["first", "second"] }]);
  selection = [];
  h.render(); await h.avancar(15000);
  assert.equal(calls.length, 1);
  assert.equal(h.timerCount, 0);
  h.unmount();
});

test("rail hook keeps five second polling, background pause and cleanup", async () => {
  const { h, calls, useRail } = hook();
  h.render(() => useRail({ enabled: true, linhaIds: ["first"] }));
  await h.flush();
  assert.equal(calls.length, 1);
  await h.avancar(4999);
  assert.equal(calls.length, 1);
  await h.avancar(1);
  assert.equal(calls.length, 2);
  h.estado("background"); await h.avancar(10000);
  assert.equal(calls.length, 2);
  h.estado("active"); await h.avancar(5000);
  assert.equal(calls.length, 3);
  h.unmount(); await h.avancar(10000);
  assert.equal(calls.length, 3);
  assert.equal(h.timerCount, 0);
});
