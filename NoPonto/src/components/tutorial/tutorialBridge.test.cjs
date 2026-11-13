const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
function load(name) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.join(__dirname, name), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports, console, setTimeout, clearTimeout },
  );
  return exports;
}
const { TUTORIAL_MAP_BRIDGE } = load("../mapOSM/webview/tutorialBridge.ts");
const { mapTutorialRect } = load("tutorialMapContract.ts");
const { transition, unionTargets, radarBlocked, readProgress, KEY } =
  load("tutorialSteps.ts");
function runtime() {
  const sent = [],
    listeners = new Set(),
    frames = new Map(),
    timers = new Set(),
    cameras = [];
  let id = 0;
  const now = Date.now();
  function marker(data = {}, x = 130, y = 220) {
    return {
      _tutorial: {
        lineId: "line",
        lineName: "838",
        modal: "onibus",
        timestamp: now,
        ...data,
      },
      getLngLat: () => ({ lat: -22, lng: -43 }),
      getElement: () => ({
        style: { opacity: "1" },
        getBoundingClientRect: () => ({
          left: x,
          top: y,
          right: x + 40,
          bottom: y + 40,
        }),
      }),
    };
  }
  const popup = {
    isOpen: () => true,
    getElement: () => ({
      querySelector: () => null,
      getBoundingClientRect: () => ({
        left: 20,
        top: 100,
        right: 320,
        bottom: 210,
      }),
    }),
  };
  const context = {
    window: {
      innerWidth: 400,
      innerHeight: 800,
      ReactNativeWebView: { postMessage: (s) => sent.push(JSON.parse(s)) },
    },
    vehicleMarkers: { a: marker({ timestamp: now - 30000 }), b: marker() },
    vehiclePopups: { a: popup, b: popup },
    railMarkers: {},
    railRuns: {},
    physicalMarkers: {},
    activeRailPopupIdentity: null,
    activeRailPopup: null,
    lastMapData: {
      linhas: [{ linhaId: "line", modal: "onibus", modoSentido: "ambos" }],
    },
    mapReady: true,
    gpsPolicy: { publicMs: 480000 },
    autoFollow: true,
    map: {
      on: (e) => listeners.add(e),
      off: (e) => listeners.delete(e),
      getZoom: () => 14,
      project: () => ({ x: 150, y: 240 }),
      easeTo: (v) => cameras.push(v),
    },
    runInternal: (fn) => fn(),
    requestAnimationFrame: (fn) => {
      frames.set(++id, fn);
      return id;
    },
    cancelAnimationFrame: (i) => frames.delete(i),
    setInterval: (fn) => {
      timers.add(fn);
      return fn;
    },
    clearInterval: (fn) => timers.delete(fn),
    Date,
    Number,
    console,
  };
  vm.runInNewContext(TUTORIAL_MAP_BRIDGE, context);
  const request = {
    requestId: 1,
    lineId: "line",
    lineName: "838",
    modal: "onibus",
    mode: "marker",
    reducedMotion: true,
  };
  const flush = () => {
    const jobs = [...frames.values()];
    frames.clear();
    jobs.forEach((fn) => fn());
  };
  return { context, sent, listeners, timers, cameras, request, marker, flush };
}
test("chapters connect and skip does not fake vehicle selection", () => {
  assert.equal(transition("done", "next"), "vehiclesIntro");
  assert.equal(transition("vehiclesIntro", "next"), "vehicle");
  assert.equal(transition("vehicle", "next"), "vehicle");
  assert.equal(transition("vehicle", "vehicleSelected"), "vehicleDetails");
  assert.equal(transition("vehicle", "skip"), "vehiclesDone");
  assert.equal(transition("vehicleDetails", "back"), "vehicle");
  assert.equal(transition("noVehicles", "demo"), "vehicleDemo");
  assert.equal(transition("vehicleDemo", "next"), "vehiclesDone");
  assert.equal(transition("vehiclesDone", "next"), "stopsIntro");
});
test("chapter persistence migrates old completion and retains both completed chapters", async () => {
  const old = await readProgress({
    getItem: async (key) => {
      assert.equal(key, KEY);
      return JSON.stringify({ seen: true, completed: true });
    },
  });
  assert.deepEqual(Array.from(old.chapters), [1]);
  const newer = await readProgress({
    getItem: async () => JSON.stringify({ seen: true, chapters: [2, 1, 2, 8] }),
  });
  assert.deepEqual(Array.from(newer.chapters), [1, 2]);
});
test("search spotlight unions measured input and results without inventing empty area", () => {
  const input = { x: 12, y: 36, width: 376, height: 44 },
    results = { x: 12, y: 88, width: 376, height: 180 };
  assert.equal(unionTargets(input, null), input);
  assert.deepEqual(JSON.parse(JSON.stringify(unionTargets(input, results))), {
    x: 12,
    y: 36,
    width: 376,
    height: 232,
  });
});
test("vehicle bridge chooses newest real marker and emits actual click only with open popup", () => {
  const r = runtime();
  r.context.window.setTutorialVehicle(r.request);
  assert.equal(r.sent.at(-1).vehicleId, "road:b");
  assert.equal(r.sent.at(-1).status, "target");
  r.context.vehiclePopups.b.isOpen = () => false;
  r.context.tutorialVehicleClicked("road:b");
  r.flush();
  assert.equal(r.sent.at(-1).status, "target");
  r.context.vehiclePopups.b.isOpen = () => true;
  r.context.tutorialVehicleClicked("road:b");
  r.flush();
  assert.equal(r.sent.at(-1).status, "selected");
});
test("bridge missing vehicle and disappearance produce bounded fallback", () => {
  const r = runtime();
  r.context.vehicleMarkers = {};
  r.context.window.setTutorialVehicle(r.request);
  assert.equal(r.sent.at(-1).status, "unavailable");
  const q = runtime();
  q.context.window.setTutorialVehicle(q.request);
  q.context.vehicleMarkers = {};
  q.context.tutorialMeasure();
  assert.equal(q.sent.at(-1).status, "unavailable");
});
test("bridge filters other lines stale gps demo and ambiguous direction", () => {
  const r = runtime();
  r.context.vehicleMarkers = {
    other: r.marker({ lineId: "other" }),
    old: r.marker({ timestamp: Date.now() - 500000 }),
    demo: r.marker({ demo: true }),
  };
  r.context.window.setTutorialVehicle(r.request);
  assert.equal(r.sent.at(-1).status, "unavailable");
  r.context.lastMapData.linhas[0].modoSentido = "ida";
  r.context.physicalMarkers = { a: r.marker() };
  r.context.tutorialMeasure();
  assert.equal(r.sent.at(-1).status, "unavailable");
});
test("bridge camera moves at most once and respects reduced motion", () => {
  const r = runtime();
  r.context.map.project = () => ({ x: 900, y: 1000 });
  r.context.window.setTutorialVehicle(r.request);
  r.context.tutorialMeasure();
  assert.equal(r.cameras.length, 1);
  assert.equal(r.cameras[0].duration, 0);
});
test("details spotlight measures existing popup and reports its closure", () => {
  const r = runtime();
  r.context.window.setTutorialVehicle({
    ...r.request,
    mode: "details",
    vehicleId: "road:b",
  });
  assert.equal(r.sent.at(-1).rect.height, 110);
  r.context.vehiclePopups.b.isOpen = () => false;
  r.context.tutorialMeasure();
  assert.equal(r.sent.at(-1).status, "closed");
});
test("ending observation removes listeners timers and late click work", () => {
  const r = runtime();
  r.context.window.setTutorialVehicle(r.request);
  assert.equal(r.timers.size, 1);
  r.context.tutorialVehicleClicked("road:b");
  r.context.window.setTutorialVehicle(null);
  const count = r.sent.length;
  r.flush();
  assert.equal(r.listeners.size, 0);
  assert.equal(r.timers.size, 0);
  assert.equal(r.sent.length, count);
});
test("native conversion scales css pixels and rejects late or invalid rectangles", () => {
  const frame = { x: 10, y: 30, width: 400, height: 800 },
    event = {
      requestId: 8,
      rect: { x: 20, y: 30, width: 40, height: 50 },
      viewport: { width: 200, height: 400 },
    };
  assert.deepEqual(
    JSON.parse(JSON.stringify(mapTutorialRect(event, 8, frame))),
    { x: 50, y: 90, width: 80, height: 100 },
  );
  assert.equal(mapTutorialRect(event, 9, frame), null);
  assert.equal(
    mapTutorialRect(
      { ...event, rect: { ...event.rect, width: NaN } },
      8,
      frame,
    ),
    null,
  );
});
test("all implemented tutorials block radar presentation without changing sessions", () => {
  for (const step of [
    "welcome",
    "search",
    "route",
    "vehicle",
    "vehicleDetails",
    "noVehicles",
    "vehicleDemo",
    "vehiclesDone",
  ])
    assert.equal(radarBlocked(step), true);
  assert.equal(radarBlocked(null), false);
});

test("native rejects responses from an older request or out of order sequence", () => {
  const { acceptsTutorialEvent } = load("tutorialMapContract.ts");
  assert.equal(
    acceptsTutorialEvent({ requestId: 2, sequence: 3, status: "target" }, 2, 4),
    false,
  );
  assert.equal(
    acceptsTutorialEvent(
      { requestId: 1, sequence: 9, status: "selected" },
      2,
      4,
    ),
    false,
  );
  assert.equal(
    acceptsTutorialEvent(
      { requestId: 2, sequence: 5, status: "selected", vehicleId: "road:b" },
      2,
      4,
    ),
    true,
  );
  assert.equal(
    acceptsTutorialEvent({ requestId: 2, status: "unavailable" }, 2, 4),
    true,
  );
});
test("full map script embeds bridge without changing its javascript syntax", () => {
  const filename = path.resolve(__dirname, "../mapOSM/webview/mapScript.ts");
  const exports = {};
  const mocks = {
    "./tutorialBridge": { TUTORIAL_MAP_BRIDGE },
    "../../../services/physicalPresenceContract": {
      physicalLocationLabels: {},
    },
    "../../../constants/indicadores": { familiasIndicadores: [] },
    "../../../constants/indicadoresSvg.generated": {
      codigoRenderizadorIndicadores:
        "function criarRenderizadorIndicadores(){return function(){}}",
    },
    "../../../services/roadPresence": {
      DEAD_RECKONING_MS: 1000,
      ROAD_PROJECTION_HORIZON_MS: 1000,
      ROAD_PRESENCE_ENABLED: true,
    },
    "../../../services/gpsPresentationPolicy": {
      GPS_POLICY: { publicMs: 480000 },
    },
  };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      require: (name) => {
        assert.ok(name in mocks, name);
        return mocks[name];
      },
    },
  );
  const script = exports.buildMapWebViewScript({
    latInicial: -22,
    lngInicial: -43,
    estilosJS: "",
    filtrosMapaJS: "",
    estiloMapaPadrao: "light",
  });
  assert.doesNotThrow(() => new vm.Script(script));
  assert.match(script, /tutorialVehicleClicked\('road:'\+vKey\)/);
  assert.match(script, /tutorialVehicleClicked\('rail:'\+identity\)/);
  assert.match(script, /tutorialVehicleClicked\('physical:'\+v.key\)/);
});

test("radar component hides and folds presentation without invoking tracking controls", () => {
  const React = require("react"),
    effects = [],
    actions = [],
    acknowledged = [];
  const filename = path.resolve(__dirname, "../mapaComponents/radarParada.tsx");
  const exports = {};
  const mockReact = {
    ...React,
    useEffect: (fn) => effects.push(fn),
    useState: (v) => [v, () => {}],
    useRef: (v) => ({ current: v }),
    useReducer: (fn, initial) => [initial, (a) => actions.push(a)],
  };
  const mocks = {
    "../tutorial/TutorialProvider": { useTutorial: () => ({step: "search", chapter: 1}) },
    react: mockReact,
    "react-native": {
      Modal: "Modal",
      Platform: { OS: "android" },
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      StyleSheet: { create: (v) => v, absoluteFillObject: {} },
      Text: "Text",
      View: "View",
      useWindowDimensions: () => ({ width: 400, height: 800 }),
    },
    "react-native-reanimated": {
      useSharedValue: (v) => ({ value: v }),
      withTiming: (v) => v,
      useAnimatedStyle: (fn) => fn(),
      runOnJS: (fn) => fn,
    },
    "@/src/hooks/useTema": {
      useTema: () => ({ cores: {}, temaAtual: "claro" }),
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 24, bottom: 16 }),
    },
    "@/src/services/estadoPainelRadar": {
      estadoInicialPainelRadar: { modo: "aberto" },
    },
    "@/src/constants/modaisMapa": { identidadeModalMapa: () => ({}) },
    "@/src/services/apresentacaoRadar": { chegadasDoRadar: () => [] },
    "@/src/services/terminalTracking": { terminalRadarVehicles: () => [] },
  };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText,
    { exports, require: (name) => mocks[name] ?? {}, console },
  );
  let trackingCalls = 0;
  const tree = exports.default({
    bloqueadoPeloTutorial: true,
    visivel: true,
    abrirRadarSolicitacao: 4,
    onAberturaRadarConcluida: (id) => acknowledged.push(id),
    onControlsBottomChange: () => {},
    linhas: [],
    modal: "onibus",
    lateralidade: "destro",
    viewportHeight: 800,
    radar: { eventos: [], foraContexto: true, agora: 0 },
    acompanhamento: new Proxy({}, { get: () => () => trackingCalls++ }),
  });
  effects.forEach((fn) => fn());
  assert.equal(tree, null);
  assert.equal(trackingCalls, 0);
  assert.equal(
    actions.some((a) => a.tipo === "recolher"),
    true,
  );
  assert.equal(
    actions.some((a) => a.tipo === "abrir"),
    false,
  );
  assert.deepEqual(acknowledged, [4]);
});

function providerHarness(initial, location = {}) {
  const React = require("react"),
    slots = [];
  let cursor = 0,
    dirty = true,
    value,
    route = "/",
    pending = [];
  let stored = JSON.stringify(initial);
  const writes = [];
  const same = (a, b) =>
    a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const mock = {
    ...React,
    useState: (initial) => {
      const i = cursor++;
      if (!slots[i])
        slots[i] = {
          value: typeof initial === "function" ? initial() : initial,
        };
      return [
        slots[i].value,
        (next) => {
          const v = typeof next === "function" ? next(slots[i].value) : next;
          if (!Object.is(v, slots[i].value)) {
            slots[i].value = v;
            dirty = true;
          }
        },
      ];
    },
    useRef: (initial) => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { current: initial };
      return slots[i];
    },
    useMemo: (fn, deps) => {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps))
        slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useEffect: (fn, deps) => {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        slots[i]?.cleanup?.();
        slots[i] = { deps };
        pending.push(() => {
          slots[i].cleanup = fn();
        });
      }
    },
  };
  mock.useCallback = (fn, deps) => mock.useMemo(() => fn, deps);
  const filename = path.join(__dirname, "TutorialProvider.tsx"),
    exports = {};
  const mocks = {
    react: mock,
    "./tutorialSteps": load("tutorialSteps.ts"),
    "./tutorialMapContract": load("tutorialMapContract.ts"),
    "./initialLocation": load("initialLocation.ts"),
    "expo-location": location,
    "@react-native-async-storage/async-storage": {
      getItem: async () => stored,
      setItem: async (key, v) => {
        stored = v;
        writes.push(JSON.parse(v));
      },
    },
    "expo-router": {
      router: {
        navigate: (path) => {
          route = path;
          dirty = true;
        },
      },
      usePathname: () => route,
    },
    "react-native": {
      AccessibilityInfo: {
        isReduceMotionEnabled: async () => true,
        addEventListener: () => ({ remove() {} }),
      },
      AppState: {
        currentState: "active",
        addEventListener: () => ({ remove() {} }),
      },
      Keyboard: { dismiss() {} },
    },
  };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      require: (name) => {
        assert.ok(name in mocks, name);
        return mocks[name];
      },
      setTimeout,
      clearTimeout,
      console,
    },
  );
  async function flush() {
    for (let turn = 0; turn < 20; turn++) {
      if (dirty) {
        dirty = false;
        cursor = 0;
        value = exports.TutorialProvider({}).props.value;
        const jobs = pending;
        pending = [];
        jobs.forEach((fn) => fn());
      }
      await Promise.resolve();
    }
    assert.equal(dirty, false, "provider must settle without render loop");
    return value;
  }
  return {
    flush,
    get value() {
      return value;
    },
    writes,
    unmount: () => slots.forEach((slot) => slot?.cleanup?.()),
    navigate: (path) => {
      route = path;
      dirty = true;
    },
  };
}
test("provider replay keeps completed history and connects real vehicle selection through chapters", async () => {
  const h = providerHarness({
    seen: true,
    completed: true,
    chapters: [1],
    dismissed: false,
  });
  try {
    await h.flush();
    h.value.setReady(true);
    await h.flush();
    assert.equal(h.value.step, null);
    h.value.replay(2);
    await h.flush();
    assert.equal(h.value.step, "vehiclesIntro");
    assert.equal(h.value.progress.chapters[0], 1);
    h.value.setLineContext({
      lineId: "line",
      lineName: "838",
      modal: "onibus",
      key: "line:ambos",
    });
    await h.flush();
    h.value.advance("next");
    await h.flush();
    assert.equal(h.value.step, "vehicle");
    const id = h.value.mapRequest.requestId;
    h.value.onMapEvent({
      type: "tutorial_vehicle",
      requestId: id,
      sequence: 1,
      status: "selected",
      vehicleId: "road:b",
    });
    await h.flush();
    assert.equal(h.value.step, "vehicleDetails");
    h.value.onMapEvent({
      type: "tutorial_vehicle",
      requestId: id,
      sequence: 2,
      status: "unavailable",
    });
    await h.flush();
    assert.equal(h.value.step, "vehicleDetails");
    h.value.advance("next");
    await h.flush();
    assert.equal(h.value.step, "vehiclesDone");
    assert.deepEqual(Array.from(h.value.progress.chapters), [1, 2]);
    h.value.complete();
    await h.flush();
    assert.equal(h.value.step, null);
    assert.equal(h.value.spotlight, null);
    assert.equal(h.value.mapRequest, null);
    assert.deepEqual(h.writes.at(-1).chapters, [1, 2]);
  } finally {
    h.unmount();
  }
});
test("provider missing line reuses search and navigation ends all observation", async () => {
  const h = providerHarness({ seen: true });
  try {
    await h.flush();
    h.value.replay(2);
    await h.flush();
    h.value.advance("next");
    await h.flush();
    assert.equal(h.value.step, "search");
    h.value.advance("skip");
    await h.flush();
    assert.equal(h.value.step, "noVehicles");
    h.value.advance("demo");
    await h.flush();
    assert.equal(h.value.step, "vehicleDemo");
    h.navigate("/configuracao");
    await h.flush();
    assert.equal(h.value.step, null);
    assert.equal(h.value.spotlight, null);
    assert.equal(h.value.mapRequest, null);
  } finally {
    h.unmount();
  }
});

test("direct chapter two completion does not mark chapter one as completed", async () => {
  const h = providerHarness({ seen: true, completed: false });
  try {
    await h.flush();
    h.value.setLineContext({
      lineId: "line",
      lineName: "838",
      modal: "onibus",
      key: "one",
    });
    await h.flush();
    h.value.replay(2);
    await h.flush();
    h.value.advance("next");
    await h.flush();
    h.value.advance("skip");
    await h.flush();
    h.value.complete();
    await h.flush();
    assert.equal(h.writes.at(-1).completed, false);
    assert.deepEqual(h.writes.at(-1).chapters, [2]);
  } finally {
    h.unmount();
  }
});
test("closing real popup returns to marker and removed line invalidates old responses", async () => {
  const h = providerHarness({ seen: true });
  try {
    await h.flush();
    h.value.setLineContext({
      lineId: "line",
      lineName: "838",
      modal: "onibus",
      key: "one",
    });
    await h.flush();
    h.value.replay(2);
    await h.flush();
    h.value.advance("next");
    await h.flush();
    h.value.onMapEvent({
      requestId: h.value.mapRequest.requestId,
      sequence: 1,
      status: "selected",
      vehicleId: "road:b",
    });
    await h.flush();
    h.value.onMapEvent({
      requestId: h.value.mapRequest.requestId,
      sequence: 2,
      status: "closed",
    });
    await h.flush();
    assert.equal(h.value.step, "vehicle");
    const id = h.value.mapRequest.requestId;
    h.value.setLineContext(null);
    await h.flush();
    assert.equal(h.value.step, "search");
    h.value.onMapEvent({
      requestId: id,
      sequence: 3,
      status: "selected",
      vehicleId: "road:b",
    });
    await h.flush();
    assert.equal(h.value.step, "search");
    assert.equal(h.value.spotlight, null);
  } finally {
    h.unmount();
  }
});
test("visible vehicle still receives a useful initial zoom only once", () => {
  const r = runtime();
  r.context.window.setTutorialVehicle(r.request);
  r.context.tutorialMeasure();
  assert.equal(r.cameras.length, 1);
  assert.equal(r.cameras[0].zoom, 16);
  assert.ok(r.cameras[0].offset[1] < 0);
});
test("popup spotlight includes external padding instead of inner text card", () => {
  const r = runtime();
  const box = (left, top, right, bottom) => ({
    getBoundingClientRect: () => ({ left, top, right, bottom }),
  });
  const inner = box(30, 110, 310, 200),
    outer = box(20, 100, 320, 210);
  r.context.vehiclePopups.b.getElement = () => ({
    ...outer,
    querySelector: (selector) =>
      selector === ".maplibregl-popup-content" ? outer : inner,
  });
  r.context.window.setTutorialVehicle({
    ...r.request,
    mode: "details",
    vehicleId: "road:b",
  });
  assert.ok(r.sent.at(-1).rect.width >= 300);
  assert.ok(r.sent.at(-1).rect.height >= 110);
});

function withStops(r) {
  const stop = {
    key: "real-stop",
    lat: -22,
    lng: -43,
    modal: "onibus",
    parada: { paradaId: "stop-1", nome: "Praça" },
  };
  r.context.lastMapData.linhas[0].paradas = [stop.parada];
  r.context.stopCache = [
    stop,
    {
      ...stop,
      key: "other",
      parada: { paradaId: "other-line-stop", nome: "Outra linha" },
    },
  ];
  r.context.stopMarkersByKey = { "s:real-stop": { marker: r.marker() } };
  r.context.updateStopMarkers = () => {};
  return { ...r.request, kind: "stop" };
}
test("stop bridge uses a real stop from selected itinerary and cleans observation", () => {
  const r = runtime(),
    request = withStops(r);
  r.context.window.setTutorialVehicle(request);
  assert.equal(r.sent.at(-1).vehicleId, "stop:real-stop");
  assert.equal(r.sent.at(-1).status, "target");
  assert.equal(r.sent.at(-1).rect.width, 40);
  assert.equal(r.cameras[0].zoom, 16);
  r.context.stopCache = [];
  r.context.tutorialMeasure();
  assert.equal(r.sent.at(-1).status, "unavailable");
  r.context.window.setTutorialVehicle(null);
  assert.equal(r.listeners.size, 0);
  assert.equal(r.timers.size, 0);
});
test("camera respects manual movement and already useful framing", () => {
  const r = runtime();
  r.context.map.getZoom = () => 16;
  r.context.window.setTutorialVehicle(r.request);
  assert.equal(r.cameras.length, 0);
  r.context.tutorialUserMove({ originalEvent: {} });
  r.context.map.project = () => ({ x: 900, y: 900 });
  r.context.tutorialMeasure();
  assert.equal(r.cameras.length, 0);
});
test("chapter three requires real selection and connects to chapter four", () => {
  assert.equal(transition("vehiclesDone", "next"), "stopsIntro");
  assert.equal(transition("stopsIntro", "next"), "stop");
  assert.equal(transition("stop", "next"), "stop");
  assert.equal(transition("stop", "vehicleSelected"), "stop");
  assert.equal(transition("stop", "stopSelected"), "stopDetails");
  assert.equal(transition("stopDetails", "back"), "stop");
  assert.equal(transition("stopDetails", "next"), "stations");
  assert.equal(transition("stations", "next"), "stopsDone");
  assert.equal(transition("stopsDone", "next"), "linesIntro");
  assert.equal(transition("stop", "unavailable"), "noStops");
  assert.equal(transition("noStops", "demo"), "stopDemo");
  assert.equal(transition("noStops", "skip"), "stations");
  assert.equal(transition("stopDemo", "next"), "stations");
  assert.equal(radarBlocked("stopDetails"), true);
});
test("chapter three replay preserves history, accepts real stop selection, and clears native panel", async () => {
  const h = providerHarness({ seen: true, chapters: [1, 2], completed: true });
  try {
    await h.flush();
    h.value.setLineContext({
      lineId: "line",
      lineName: "838",
      modal: "onibus",
      key: "line",
    });
    h.value.replay(3);
    await h.flush();
    assert.equal(h.value.step, "stopsIntro");
    assert.equal(h.value.chapter, 3);
    h.value.advance("next");
    await h.flush();
    const oldId = h.value.mapRequest.requestId;
    assert.equal(h.value.mapRequest.kind, "stop");
    h.value.advance("next");
    await h.flush();
    assert.equal(h.value.step, "stop");
    h.value.stopSelected();
    await h.flush();
    assert.equal(h.value.step, "stopDetails");
    assert.equal(h.value.mapRequest, null);
    h.value.setStopTarget({ x: 0, y: 500, width: 400, height: 260 });
    await h.flush();
    assert.equal(h.value.spotlight, null);
    h.value.onMapEvent({ requestId: oldId, status: "unavailable" });
    await h.flush();
    assert.equal(h.value.step, "stopDetails");
    h.value.advance("next");
    await h.flush();
    assert.equal(h.value.step, "stations");
    assert.equal(h.value.spotlight, null);
    h.value.advance("next");
    await h.flush();
    assert.equal(h.value.step, "stopsDone");
    assert.deepEqual(Array.from(h.value.progress.chapters), [1, 2, 3]);
    h.value.complete();
    await h.flush();
    assert.equal(h.value.spotlight, null);
    assert.equal(h.value.mapRequest, null);
    assert.deepEqual(h.writes.at(-1).chapters, [1, 2, 3]);
    const reloaded = await readProgress({
      getItem: async () => JSON.stringify(h.writes.at(-1)),
    });
    assert.deepEqual(Array.from(reloaded.chapters), [1, 2, 3]);
  } finally {
    h.unmount();
  }
});
test("chapter three missing context reuses search and unavailable target allows demonstration", async () => {
  const h = providerHarness({ seen: true, chapters: [1, 2] });
  try {
    await h.flush();
    h.value.replay(3);
    await h.flush();
    h.value.advance("next");
    await h.flush();
    assert.equal(h.value.step, "search");
    h.value.setLineContext({
      lineId: "line",
      lineName: "838",
      modal: "onibus",
      key: "line",
    });
    h.value.advance("selected");
    await h.flush();
    assert.equal(h.value.step, "stopsIntro");
    h.value.advance("next");
    await h.flush();
    h.value.onMapEvent({
      requestId: h.value.mapRequest.requestId,
      status: "unavailable",
    });
    await h.flush();
    assert.equal(h.value.step, "noStops");
    assert.equal(h.value.spotlight, null);
    h.value.advance("demo");
    await h.flush();
    assert.equal(h.value.step, "stopDemo");
    h.value.end();
    await h.flush();
    assert.equal(h.value.step, null);
    assert.deepEqual(Array.from(h.value.progress.chapters), [1, 2]);
  } finally {
    h.unmount();
  }
});

test("chapter four transitions preserve optional interactions and connect to Radar", () => {
  const order = [
    "linesIntro",
    "lineControls",
    "lineDirection",
    "lineColor",
    "lineFavorite",
    "lineVisibility",
    "lineRemove",
    "lineTab",
    "linesDone",
  ];
  assert.equal(transition("stopsDone", "next"), order[0]);
  for (let i = 0; i < order.length; i++) {
    assert.equal(transition(order[i], "next"), order[i + 1] ?? "radarIntro");
    assert.equal(transition(order[i], "skip"), order[i + 1] ?? "radarIntro");
    assert.equal(transition(order[i], "back"), order[i - 1] ?? "stopsDone");
  }
});
test("chapter four replay persists completion, returns from Linhas, and clears modal spotlight", async () => {
  const h = providerHarness({
    seen: true,
    completed: true,
    chapters: [1, 2, 3],
  });
  try {
    await h.flush();
    h.value.setLineContext({
      lineId: "line",
      lineName: "838",
      modal: "onibus",
      key: "manage:line",
    });
    h.value.replay(4);
    await h.flush();
    assert.equal(h.value.step, "linesIntro");
    for (const expected of [
      "lineControls",
      "lineDirection",
      "lineColor",
      "lineFavorite",
      "lineVisibility",
      "lineRemove",
      "lineTab",
    ]) {
      h.value.advance("next");
      await h.flush();
      assert.equal(h.value.step, expected);
      assert.equal(h.value.mapRequest, null);
      h.value.setLineTarget({ x: 12, y: 120, width: 300, height: 50 });
      await h.flush();
      assert.equal(h.value.spotlight, null);
    }
    h.value.openLines();
    await h.flush();
    assert.equal(h.value.inLines, true);
    assert.equal(h.value.step, "lineTab");
    h.value.advance("next");
    await h.flush();
    assert.equal(h.value.inLines, false);
    assert.equal(h.value.step, "linesDone");
    assert.deepEqual(Array.from(h.value.progress.chapters), [1, 2, 3, 4]);
    h.value.setLineModalOpen(true);
    h.value.complete();
    await h.flush();
    assert.equal(h.value.step, null);
    assert.equal(h.value.spotlight, null);
    assert.equal(h.value.lineModalOpen, false);
    const restored = await readProgress({
      getItem: async () => JSON.stringify(h.writes.at(-1)),
    });
    assert.deepEqual(Array.from(restored.chapters), [1, 2, 3, 4]);
  } finally {
    h.unmount();
  }
});
test("chapter four missing selection reuses search and old native measurements cannot survive exit", async () => {
  const h = providerHarness({ seen: true, chapters: [1, 2, 3] });
  try {
    await h.flush();
    h.value.replay(4);
    await h.flush();
    h.value.advance("next");
    await h.flush();
    assert.equal(h.value.step, "search");
    h.value.setLineContext({
      lineId: "line",
      lineName: "838",
      modal: "onibus",
      key: "one",
    });
    h.value.advance("selected");
    await h.flush();
    assert.equal(h.value.step, "linesIntro");
    h.value.advance("next");
    await h.flush();
    const oldMeasure = h.value.setLineTarget;
    oldMeasure({ x: 10, y: 30, width: 200, height: 40 });
    await h.flush();
    assert.equal(h.value.spotlight, null);
    h.value.advance("next");
    await h.flush();
    assert.equal(h.value.spotlight, null);
    h.value.setLineModalOpen(true);
    await h.flush();
    h.value.setLineTarget({ x: 20, y: 50, width: 200, height: 80 });
    await h.flush();
    h.value.end();
    await h.flush();
    oldMeasure({ x: 10, y: 30, width: 200, height: 40 });
    await h.flush();
    assert.equal(h.value.spotlight, null);
    assert.equal(h.value.lineModalOpen, false);
    assert.deepEqual(Array.from(h.value.progress.chapters), [1, 2, 3]);
  } finally {
    h.unmount();
  }
});

test("popup observers refresh after expansion and disconnect when tutorial ends", () => {
  const r = runtime(),
    observations = [];
  class Observer {
    constructor(callback) {
      this.callback = callback;
      observations.push(this);
    }
    observe() {}
    disconnect() {
      this.closed = true;
    }
  }
  r.context.ResizeObserver = Observer;
  r.context.MutationObserver = Observer;
  let bottom = 210;
  const content = {
    getBoundingClientRect: () => ({ left: 20, top: 100, right: 320, bottom }),
  };
  const element = { querySelector: () => content };
  r.context.vehiclePopups.b.getElement = () => element;
  r.context.window.setTutorialVehicle({
    ...r.request,
    mode: "details",
    vehicleId: "road:b",
  });
  assert.equal(observations.length, 2);
  bottom = 330;
  observations[0].callback();
  r.flush();
  assert.equal(r.sent.at(-1).rect.height, 234);
  r.context.window.setTutorialVehicle(null);
  assert.ok(observations.every((o) => o.closed));
  const count = r.sent.length;
  observations[1].callback();
  r.flush();
  assert.equal(r.sent.length, count);
});


test("chapter five connects all sections without a line and persists completion and replay history", async () => {
  const h = providerHarness({seen: true, completed: true, dismissed: false, chapters: [1, 2, 3, 4]});
  try {
    await h.flush(); h.value.replay(5, "5A"); await h.flush();
    assert.equal(h.value.step, "radarIntro");
    const order = load("tutorialSteps.ts").RADAR_STEPS;
    for (let i = 0; i < order.length - 1; i++) {
      assert.equal(h.value.step, order[i]);
      assert.equal(h.value.mapRequest, null, "no map or transport requests for explanatory steps");
      h.value.advance(i % 2 ? "skip" : "next"); await h.flush();
    }
    assert.equal(h.value.step, "radarChapterDone");
    assert.deepEqual(Array.from(h.value.progress.radarSections), ["5A", "5B", "5C"]);
    assert.deepEqual(Array.from(h.value.progress.chapters), [1, 2, 3, 4, 5]);
    h.value.complete(); await h.flush();
    h.value.replay(5); await h.flush();
    assert.equal(h.value.step, "radarIntro", "completed replay starts at introduction");
    h.value.replay(5, "5B"); await h.flush();
    assert.equal(h.value.step, "notificationIntro");
    assert.deepEqual(Array.from(h.value.progress.chapters), [1, 2, 3, 4, 5]);
    h.value.end(); await h.flush();
    assert.equal(h.value.spotlight, null);
    assert.equal(h.value.radarHost, "root");
  } finally { h.unmount(); }
});

test("chapter five resumes only valid saved steps and keeps spotlight in its native window", async () => {
  const h = providerHarness({seen: true, chapters: [1], radarSections: ["5A"], radarResume: "notificationTiming"});
  try {
    await h.flush(); h.value.replay(5); await h.flush();
    assert.equal(h.value.step, "notificationTiming");
    h.value.setRadarHost("radar"); await h.flush();
    h.value.setRadarTarget({x: 10, y: 120, width: 350, height: 80}); await h.flush();
    assert.equal(h.value.spotlight, null);
    h.value.setRadarHost("confirmation"); await h.flush();
    assert.equal(h.value.spotlight, null);
    h.value.advance("back"); await h.flush();
    assert.equal(h.value.step, "notificationIntro");
    h.value.end(); await h.flush();
    assert.equal(h.value.spotlight, null);
    assert.equal(h.value.radarHost, "root");
  } finally { h.unmount(); }
});

test("chapter five section replay does not award unvisited sections", async () => {
  const h = providerHarness({seen: true, chapters: [1, 4]});
  try {
    await h.flush(); h.value.replay(5, "5C"); await h.flush();
    while (h.value.step !== "radarChapterDone") { h.value.advance("skip"); await h.flush(); }
    assert.deepEqual(Array.from(h.value.progress.radarSections), ["5C"]);
    assert.deepEqual(Array.from(h.value.progress.chapters), [1, 4]);
  } finally { h.unmount(); }
});


test("chapter six connects after Radar, preserves context and completes only its own history", async () => {
  const h = providerHarness({seen: true, chapters: [2, 4], radarSections: ["5A"]});
  try {
    await h.flush(); h.value.replay(6); await h.flush();
    assert.equal(h.value.step, "transportIntro");
    h.value.setLineId("chosen"); h.value.setLineContext({lineId: "chosen", lineName: "BRT", modal: "brt", key: "chosen:brt"}); await h.flush();
    for (const expected of ["transportFilters", "transportBrt", "transportRail", "railStatus", "transportMap", "journeyDone"]) {
      h.value.advance("next"); await h.flush(); assert.equal(h.value.step, expected);
      assert.equal(h.value.mapRequest, null); assert.equal(h.value.lineId, "chosen");
    }
    assert.deepEqual(Array.from(h.value.progress.chapters), [2, 4, 6]);
    h.value.complete(); await h.flush();
    assert.equal(h.value.progress.presentationFinished, true);
    assert.equal(h.value.progress.journeyFinished, undefined);
    assert.equal(h.value.spotlight, null);
    h.value.replay(6); await h.flush();
    assert.deepEqual(Array.from(h.value.progress.chapters), [2, 4, 6]);
    assert.equal(h.value.progress.manualReplays, 2);
    h.value.end(); await h.flush(); assert.equal(h.value.spotlight, null);
  } finally {h.unmount();}
  assert.equal(transition("radarChapterDone", "next"), "transportIntro");
  assert.equal(transition("transportIntro", "back"), "radarChapterDone");
});

test("all six completed chapters finalize the journey while skipped steps remain distinguishable", async () => {
  const h = providerHarness({seen: true, chapters: [1,2,3,4,5], skippedSteps: ["vehicle"], radarSections: ["5A", "5B", "5C"]});
  try {
    await h.flush(); h.value.replay(6); await h.flush();
    while (h.value.step !== "journeyDone") {h.value.advance("next"); await h.flush();}
    h.value.openTutorials(); await h.flush();
    assert.equal(h.value.step, null); assert.equal(h.value.progress.journeyFinished, true);
    assert.equal(h.value.progress.presentationFinished, true);
    assert.deepEqual(Array.from(h.value.progress.skippedSteps), ["vehicle"]);
    assert.deepEqual(Array.from(h.value.progress.chapters), [1,2,3,4,5,6]);
  } finally {h.unmount();}
});

test("chapter six missing results never blocks progression and late filter geometry cannot restore ended overlay", async () => {
  const h = providerHarness({seen: true});
  try {
    await h.flush(); h.value.replay(6); await h.flush();
    h.value.advance("next"); await h.flush();
    h.value.setFilterTarget({x: 200, y: 30, width: 100, height: 30}); h.value.filterSelected("trem"); await h.flush();
    assert.equal(h.value.spotlight, null);
    assert.equal(h.value.selectedFilter, "trem");
    h.value.advance("skip"); await h.flush();
    assert.ok(h.value.progress.skippedSteps.includes("transportFilters"));
    while (h.value.step !== "journeyDone") {h.value.advance("next"); await h.flush();}
    h.value.end(); await h.flush();
    h.value.setFilterTarget({x: 1, y: 1, width: 30, height: 30}); await h.flush();
    assert.equal(h.value.spotlight, null); assert.equal(h.value.mapRequest, null);
  } finally {h.unmount();}
});

test("Radar pending draft permits next and skip through chapter six without saving", async () => {
  for (const event of ["next", "skip"]) {
    const h = providerHarness({seen: true, chapters: [1, 2, 3, 4]});
    try {
      await h.flush(); h.value.replay(5); await h.flush();
      h.value.setRadarDraftPending(true); h.value.setRadarHost("radar"); await h.flush();
      for (const expected of load("tutorialSteps.ts").RADAR_STEPS) {
        assert.equal(h.value.step, expected);
        h.value.advance(event); await h.flush();
      }
      assert.equal(h.value.step, "transportIntro");
      assert.equal(h.value.radarHost, "root");
      assert.equal(h.value.radarDraftPending, true, "navigation must not save the draft");
      assert.ok(h.value.progress.chapters.includes(5));
      for (const expected of ["transportIntro", "transportFilters", "transportBrt", "transportRail", "railStatus", "transportMap"]) {
        assert.equal(h.value.step, expected); h.value.advance(event); await h.flush();
      }
      assert.equal(h.value.step, "journeyDone");
      assert.ok(h.value.progress.chapters.includes(6));
      h.value.complete(); await h.flush(); assert.equal(h.value.step, null);
    } finally {h.unmount();}
  }
});


test("skipping an entire vehicle chapter does not earn its completion", async () => {
  const h = providerHarness({seen: true, chapters: [1]});
  try {
    await h.flush(); h.value.replay(2); await h.flush();
    h.value.advance("skip"); await h.flush();
    assert.equal(h.value.step, "vehiclesDone");
    assert.deepEqual(Array.from(h.value.progress.chapters), [1]);
    assert.deepEqual(Array.from(h.value.progress.skippedSteps), ["vehiclesIntro"]);
  } finally {h.unmount();}
});

test("first welcome waits for permission without saving progress and replay never requests it", async () => {
  let resolvePermission, requests = 0;
  const h = providerHarness({seen: false}, {
    getForegroundPermissionsAsync: () => { requests++; return new Promise(resolve => { resolvePermission = resolve; }); },
  });
  try {
    await h.flush();
    assert.equal(requests, 0, "wait for opening");
    h.value.setReady(true);
    await h.flush();
    assert.equal(h.value.step, null);
    assert.equal(h.value.progress.seen, false);
    assert.equal(h.writes.length, 0);
    resolvePermission({granted: false, status: "denied", canAskAgain: false});
    await h.flush();
    assert.equal(h.value.step, "welcome");
    assert.equal(h.value.progress.seen, true);
    h.value.end();
    await h.flush();
    h.value.replay(1);
    await h.flush();
    assert.equal(requests, 1);
  } finally { h.unmount(); }
});

test("returning users skip automatic location and keep tutorial history", async () => {
  let requests = 0;
  const h = providerHarness({seen: true, chapters: [1]}, {
    getForegroundPermissionsAsync: async () => { requests++; return {granted: true}; },
  });
  try {
    await h.flush();
    h.value.setReady(true);
    await h.flush();
    assert.equal(requests, 0);
    assert.equal(h.value.step, null);
    assert.deepEqual(Array.from(h.value.progress.chapters), [1]);
  } finally { h.unmount(); }
});

function nativeRuntime() {
  const r = runtime(), layers = [{id: 'base'}, {id: 'routes'}, {id: 'routes-dash'}];
  r.context.linesSolidLayerId = 'routes';
  r.context.map.getLayer = id => layers.find(layer => layer.id === id);
  r.context.map.addLayer = (layer, before) => { layers.splice(layers.findIndex(x => x.id === before), 0, layer); };
  r.context.map.removeLayer = id => { layers.splice(layers.findIndex(x => x.id === id), 1); };
  function elementFor(marker) {
    const classes = new Set(['original']);
    const element = { style: {opacity: '1'}, classList: {add: name => classes.add(name), remove: name => classes.delete(name)},
      getBoundingClientRect: () => {throw Error('native highlight must not measure DOM');} };
    marker.getElement = () => element;
    return {element, classes};
  }
  Object.values(r.context.vehicleMarkers).forEach(elementFor);
  const selected = elementFor(r.context.vehicleMarkers.b);
  r.context.window.setTutorialVehicle({...r.request, kind: 'vehicle', nativeHighlight: true});
  return {...r, layers, selected, elementFor};
}

test('native vehicle highlight keeps routes above dim layer and sends no geometry during movement', () => {
  const r = nativeRuntime();
  assert.deepEqual(r.layers.map(x => x.id), ['base', 'tutorial-dim', 'routes', 'routes-dash']);
  assert.equal(r.layers[1].paint['background-opacity'], 0.35);
  assert.equal(r.selected.classes.has('tutorial-vehicle-focus'), true);
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].rect, null);
  assert.equal(r.timers.size, 0);
  assert.deepEqual([...r.listeners].sort(), ['movestart', 'styledata']);
  for (let i = 0; i < 5; i++) {
    r.context.tutorialUserMove({originalEvent: {}});
    r.context.tutorialSchedule(); // Data updates may recheck identity, without publishing positions.
    r.flush();
  }
  assert.equal(r.sent.length, 1);
  r.context.tutorialVehicleClicked('road:b');
  r.flush();
  assert.equal(r.sent.at(-1).status, 'selected');
  assert.equal(r.sent.at(-1).rect, null);
  r.context.window.setTutorialVehicle(null);
  assert.deepEqual([...r.selected.classes], ['original']);
  assert.deepEqual(r.layers.map(x => x.id), ['base', 'routes', 'routes-dash']);
  assert.equal(r.listeners.size, 0);
});

test('native vehicle highlight reapplies after style or marker recreation and cleans up on disappearance', () => {
  const r = nativeRuntime();
  r.layers.splice(1, 1);
  r.context.tutorialDimMap();
  assert.equal(r.layers[1].id, 'tutorial-dim');
  const replacement = r.marker();
  const next = r.elementFor(replacement);
  r.context.vehicleMarkers.b = replacement;
  r.context.tutorialSchedule(); r.flush();
  assert.deepEqual([...r.selected.classes], ['original']);
  assert.equal(next.classes.has('tutorial-vehicle-focus'), true);
  assert.equal(r.sent.length, 1);
  r.context.vehicleMarkers = {};
  r.context.tutorialSchedule(); r.flush();
  assert.equal(r.sent.at(-1).status, 'unavailable');
  assert.deepEqual([...next.classes], ['original']);
  assert.equal(r.layers.some(x => x.id === 'tutorial-dim'), false);
  r.context.window.setTutorialVehicle(null);
});

test('provider accepts native vehicle target without rectangle and preserves real popup transition', async () => {
  const h = providerHarness({seen: true});
  try {
    await h.flush();
    h.value.setLineContext({lineId: 'line', lineName: '838', modal: 'onibus', key: 'one'});
    h.value.replay(2); await h.flush();
    h.value.advance('next'); await h.flush();
    assert.equal(h.value.step, 'vehicle');
    assert.equal(h.value.mapRequest.nativeHighlight, true);
    const requestId = h.value.mapRequest.requestId;
    h.value.onMapEvent({type: 'tutorial_vehicle', requestId, sequence: 1, status: 'target', vehicleId: 'road:b'});
    await h.flush();
    assert.equal(h.value.step, 'vehicle');
    assert.equal(h.value.spotlight, null);
    h.value.onMapEvent({type: 'tutorial_vehicle', requestId, sequence: 2, status: 'selected', vehicleId: 'road:b'});
    await h.flush();
    assert.equal(h.value.step, 'vehicleDetails');
    assert.equal(h.value.mapRequest.nativeHighlight, true);
    assert.equal(h.value.mapRequest.vehicleId, 'road:b');
  } finally { h.unmount(); }
});

test('native popup continuity preserves dim layer without geometry or movement listeners', () => {
  const r = nativeRuntime();
  const dim = r.layers.find(x => x.id === 'tutorial-dim');
  const content = r.elementFor({}), replacement = r.elementFor({});
  let current = content.element, open = true;
  const closeListeners = new Set();
  const popup = {
    isOpen: () => open,
    getElement: () => ({querySelector: () => current}),
    on: (event, fn) => {assert.equal(event, 'close'); closeListeners.add(fn);},
    off: (event, fn) => {assert.equal(event, 'close'); closeListeners.delete(fn);},
  };
  r.context.vehiclePopups.b = popup;
  let removals = 0;
  const remove = r.context.map.removeLayer;
  r.context.map.removeLayer = id => {removals++; remove(id);};
  r.context.window.setTutorialVehicle({...r.request, requestId: 2, kind: 'vehicle', mode: 'details', vehicleId: 'road:b', nativeHighlight: true});
  assert.equal(r.layers.find(x => x.id === 'tutorial-dim'), dim);
  assert.equal(removals, 0);
  assert.deepEqual([...r.selected.classes], ['original']);
  assert.equal(content.classes.has('tutorial-vehicle-focus'), true);
  assert.equal(closeListeners.size, 1);
  assert.equal(r.timers.size, 0);
  assert.deepEqual([...r.listeners].sort(), ['movestart', 'styledata']);
  const count = r.sent.length;
  for (let i = 0; i < 3; i++) {r.context.tutorialUserMove({originalEvent: {}}); r.context.tutorialSchedule(); r.flush();}
  assert.equal(r.sent.length, count);
  assert.equal(r.sent.at(-1).rect, null);
  current = replacement.element;
  r.context.tutorialSchedule(); r.flush();
  assert.deepEqual([...content.classes], ['original']);
  assert.equal(replacement.classes.has('tutorial-vehicle-focus'), true);
  open = false;
  const lateClose = [...closeListeners][0];
  lateClose();
  assert.equal(r.sent.at(-1).status, 'closed');
  assert.deepEqual([...replacement.classes], ['original']);
  assert.equal(r.layers.find(x => x.id === 'tutorial-dim'), dim);
  r.context.window.setTutorialVehicle({...r.request, requestId: 3, kind: 'vehicle', nativeHighlight: true});
  assert.equal(closeListeners.size, 0);
  assert.equal(r.selected.classes.has('tutorial-vehicle-focus'), true);
  assert.equal(removals, 0);
  const afterBack = r.sent.length;
  lateClose();
  assert.equal(r.sent.length, afterBack, 'old popup closure cannot affect marker step');
  r.context.window.setTutorialVehicle(null);
  assert.equal(removals, 1);
  assert.equal(r.listeners.size, 0);
});

test('native popup exit removes highlight and detaches close listener', () => {
  const r = nativeRuntime(), content = r.elementFor({}), handlers = new Set();
  r.context.vehiclePopups.b = {
    isOpen: () => true, getElement: () => ({querySelector: () => content.element}),
    on: (_, fn) => handlers.add(fn), off: (_, fn) => handlers.delete(fn),
  };
  r.context.window.setTutorialVehicle({...r.request, mode: 'details', vehicleId: 'road:b', kind: 'vehicle', nativeHighlight: true});
  assert.equal(content.classes.has('tutorial-vehicle-focus'), true);
  r.context.window.setTutorialVehicle(null);
  assert.deepEqual([...content.classes], ['original']);
  assert.equal(handlers.size, 0);
  assert.equal(r.layers.some(x => x.id === 'tutorial-dim'), false);
});

test('native stop uses real marker without geometry and restores its appearance', () => {
  const r = nativeRuntime(), request = withStops(r);
  const selected = r.elementFor(r.context.stopMarkersByKey['s:real-stop'].marker);
  r.context.window.setTutorialVehicle({...request, requestId: 2, nativeHighlight: true});
  assert.equal(selected.classes.has('tutorial-vehicle-focus'), true);
  assert.equal(r.sent.at(-1).vehicleId, 'stop:real-stop');
  assert.equal(r.sent.at(-1).rect, null);
  assert.equal(r.timers.size, 0);
  assert.deepEqual([...r.listeners].sort(), ['movestart', 'styledata']);
  const count = r.sent.length;
  r.context.tutorialUserMove({originalEvent: {}});
  assert.equal(r.sent.length, count);
  r.context.window.setTutorialVehicle(null);
  assert.deepEqual([...selected.classes], ['original']);
  assert.equal(r.layers.some(x => x.id === 'tutorial-dim'), false);
  const missing = nativeRuntime();
  withStops(missing); missing.context.stopCache = [];
  missing.context.window.setTutorialVehicle({...request, nativeHighlight: true});
  assert.equal(missing.sent.at(-1).status, 'unavailable');
});

test('route halo uses existing source and selected line without changing original layers', () => {
  const r = nativeRuntime();
  r.context.linesSourceId = 'real-lines';
  r.context.window.setTutorialVehicle({...r.request, requestId: 2, kind: 'route', nativeHighlight: true});
  const halo = r.layers.find(x => x.id === 'tutorial-route-focus');
  assert.equal(halo.source, 'real-lines');
  assert.equal(JSON.stringify(halo.filter), JSON.stringify(['==', ['get', 'lineId'], 'line']));
  assert.equal(halo.paint['line-color'], '#FFC107');
  assert.deepEqual(r.layers.map(x => x.id), ['base', 'tutorial-dim', 'tutorial-route-focus', 'routes', 'routes-dash']);
  r.layers.splice(r.layers.indexOf(halo), 1);
  r.context.tutorialDimMap();
  assert.equal(r.layers.filter(x => x.id === 'tutorial-route-focus').length, 1);
  r.context.window.setTutorialVehicle(null);
  assert.deepEqual(r.layers.map(x => x.id), ['base', 'routes', 'routes-dash']);
});

test('stop panel readiness no longer waits for a measured rectangle', () => {
  const filename = path.join(__dirname, 'TutorialProvider.tsx');
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let arrow;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('const deadline = setTimeout')) arrow = node.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(arrow);
  const effect = vm.runInNewContext('(' + ts.transpileModule(arrow, {}).outputText.trim().replace(/;$/, '') + ')', {
    step: 'stopDetails', foreground: true, setTimeout: () => {throw Error('panel must not wait for a geometry timeout');},
  });
  effect();
});

test('route request ignores vehicle availability and preserves chapter progression', async () => {
  const h = providerHarness({seen: true});
  try {
    await h.flush(); h.value.setLineContext({lineId: 'line', lineName: '838', modal: 'onibus', key: 'route'});
    h.value.replay(1); await h.flush(); h.value.advance('selected'); await h.flush();
    assert.equal(h.value.step, 'route'); assert.equal(h.value.mapRequest.kind, 'route');
    h.value.onMapEvent({type: 'tutorial_vehicle', requestId: h.value.mapRequest.requestId, status: 'unavailable'});
    await h.flush(); assert.equal(h.value.step, 'route');
    h.value.advance('next'); await h.flush(); assert.equal(h.value.step, 'done');
  } finally {h.unmount();}
});
