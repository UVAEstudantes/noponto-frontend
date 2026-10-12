/* global __dirname */
const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const {
  familiasIndicadores,
  estilosIndicadores,
  modaisIndicadores,
  indicadoresPadrao,
  validarPreferenciasIndicadores,
  estilosEfetivos,
} = require("../constants/indicadores.ts");
const { renderizarIndicador } = require("./apresentacaoIndicadores.ts");
const {
  buildMapWebViewScript,
} = require("../components/mapOSM/webview/mapScript.ts");

test("all nine combinations use actual SVGs, preserve structure and recolor only body accents", () => {
  for (const { id: estilo } of estilosIndicadores)
    for (const { id: modal } of modaisIndicadores) {
      const a = familiasIndicadores[estilo].assets[modal];
      const v = renderizarIndicador(estilo, modal, "#1976D2");
      assert.match(v.svg, /id="carroceria" fill="#1976D2"/);
      assert.equal(decodeURIComponent(v.uri.split(",")[1]), v.svg);
      assert.equal(
        v.svg.match(/viewBox="[^"]+"/)[0],
        a.svg.match(/viewBox="[^"]+"/)[0],
      );
      for (const glass of a.svg.matchAll(/stop-color="(#[0-9a-f]{6})"/gi)) {
        if (
          /^#(?:474b4c|171a1b|484c4d|16191a|44494b|15191b|42494c|171c1e)$/i.test(
            glass[1],
          )
        )
          assert.ok(v.svg.includes(glass[0]));
      }
      assert.ok(!v.svg.includes("#604100"));
      assert.strictEqual(v, renderizarIndicador(estilo, modal, "#1976d2"));
    }
  assert.equal(modaisIndicadores.length, 3);
});

test("classic reuses a single pin, composes distinct local pictograms and selects contrast", () => {
  assert.strictEqual(
    familiasIndicadores.classico.assets.onibus,
    familiasIndicadores.classico.assets.brt,
  );
  assert.strictEqual(
    familiasIndicadores.classico.assets.brt,
    familiasIndicadores.classico.assets.trem,
  );
  const variants = modaisIndicadores.map(
    ({ id }) => renderizarIndicador("classico", id, "#FFFFFF").svg,
  );
  assert.equal(new Set(variants).size, 3);
  assert.match(variants[0], /stroke="#111827"/);
  assert.match(
    renderizarIndicador("classico", "onibus", "#000000").svg,
    /stroke="#FFFFFF"/,
  );
  assert.match(
    renderizarIndicador("padrao", "onibus", "#abc").svg,
    /fill="#aabbcc"/,
  );
  assert.match(
    renderizarIndicador("padrao", "onibus", '"><script>bad</script>').svg,
    /fill="#FFC400"/,
  );
});

test("global mode does not destroy individual choices and corrupt styles fall back safely", () => {
  const prefs = {
    global: false,
    estiloGlobal: "classico",
    individuais: { onibus: "padrao", brt: "realista", trem: "classico" },
  };
  assert.deepEqual(estilosEfetivos(prefs), prefs.individuais);
  assert.deepEqual(estilosEfetivos({ ...prefs, global: true }), {
    onibus: "classico",
    brt: "classico",
    trem: "classico",
  });
  assert.deepEqual(
    estilosEfetivos({ ...prefs, global: false }),
    prefs.individuais,
  );
  const warn = console.warn;
  const avisos = [];
  console.warn = (...args) => avisos.push(args);
  try {
    assert.deepEqual(
      validarPreferenciasIndicadores({
        global: "bad",
        estiloGlobal: "__proto__",
        individuais: {},
      }),
      indicadoresPadrao,
    );
    assert.ok(avisos.length > 0);
  } finally {
    console.warn = warn;
  }
});

class Elemento {
  constructor() {
    this.sourceWrites = 0;
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.style = {
      setProperty: (k, v) => {
        this.style[k] = v;
      },
    };
    this.classList = { add() {}, remove() {} };
  }
  set src(value) {
    this.sourceWrites++;
    this.source = value;
  }
  get src() {
    return this.source;
  }
  appendChild(child) {
    this.children.push(child);
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  addEventListener(k, f) {
    this.listeners[k] = f;
  }
  querySelector(selector) {
    const cls = selector.slice(1);
    for (const child of this.children) {
      if ((child.className || "").split(" ").includes(cls)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}
function runtime() {
  const context = {
    window: {},
    document: { createElement: () => new Elemento() },
    console,
  };
  vm.createContext(context);
  const script = buildMapWebViewScript({
    latInicial: 0,
    lngInicial: 0,
    estilosJS: "",
    filtrosMapaJS: "",
    estiloMapaPadrao: "light",
  });
  assert.ok(!script.includes("</script>"));
  vm.runInContext(script, context);
  return context;
}
test("live style updates keep marker, popup, coordinates, selection and DOM listeners intact", () => {
  const c = runtime();
  c.map = { getBearing: () => 30 };
  const el = c.busIcon("#00AA00", 90, "brt");
  const inner = el.querySelector(".bus-inner");
  const image = inner.querySelector(".vehicle-art");
  const popup = { selected: true };
  const coord = [1, 2];
  const marker = { getElement: () => el, popup, coord };
  c.vehicleMarkers.bus = marker;
  c.vehicleHeadings.bus = 90;
  const click = () => {};
  el.addEventListener("click", click);
  c.window.updateIndicatorStyles({
    onibus: "padrao",
    brt: "classico",
    trem: "realista",
  });
  assert.strictEqual(c.vehicleMarkers.bus, marker);
  assert.strictEqual(marker.popup, popup);
  assert.strictEqual(marker.coord, coord);
  assert.strictEqual(el.listeners.click, click);
  assert.strictEqual(inner.querySelector(".vehicle-art"), image);
  assert.equal(inner.style["--h"], "60deg");
  assert.equal(image.style.transform, "rotate(-180deg)");
  assert.equal(image.style.top, "5px"); // Head center at parent (20,20).
  assert.equal(image.style.left, "4px");
  const uri = image.src;
  c.applyVehiclePresentation(el, "#00AA00", "brt");
  assert.equal(image.src, uri);
  c.applyVehiclePresentation(el, "#0000FF", "brt");
  assert.notEqual(image.src, uri);
  assert.match(decodeURIComponent(image.src), /fill="#0000FF"/);
  assert.equal(c.vehicleHeadings.bus, 90);
});

test("bearing compensation and shortest-angle rotation work for every family and cardinal direction", () => {
  const c = runtime();
  for (const { id: estilo } of estilosIndicadores)
    for (const bearing of [0, 45, 180]) {
      c.map = { getBearing: () => bearing };
      c.window.updateIndicatorStyles({
        onibus: estilo,
        brt: estilo,
        trem: estilo,
      });
      for (const heading of [0, 90, 180, 270]) {
        const el = c.busIcon("#123456", heading, "onibus");
        const visual = renderizarIndicador(estilo, "onibus", "#123456");
        const h = parseFloat(el.querySelector(".bus-inner").style["--h"]);
        const art = el.querySelector(".vehicle-art");
        const offset = Number(
          art.style.transform.match(/rotate\((-?\d+)deg\)/)[1],
        );
        const front = (visual.orientacao + h + offset + 360) % 360;
        assert.equal(front, (heading - bearing + 360) % 360);
        assert.equal(parseFloat(art.style.left) + visual.largura / 2, 20);
        assert.equal(parseFloat(art.style.top) + visual.ancoraY, 20);
      }
    }
  c.map = { getBearing: () => 0 };
  const el = c.busIcon("#123456", 359, "onibus");
  c.setHeading({ getElement: () => el }, 1);
  assert.equal(el.querySelector(".bus-inner").style["--h"], "361deg");
});

test("all rail states retain SVG, line color, heading and click handler across styles", () => {
  const c = runtime();
  c.lastMapData = {
    linhas: [{ linhaId: "line-1", modal: "trem", cor: "#663399" }],
  };
  for (const status of ["Live", "Estimated", "Scheduled"]) {
    const run = {
      linhaId: "line-1",
      lineName: "Japeri",
      operationalStatus: status,
    };
    assert.equal(c.railVisual(run).color, "#663399");
    assert.equal(c.railVisual(run).status, status);
    const el = c.railMarkerElement(run, "run-1");
    c.railMarkers["run-1"] = { getElement: () => el };
    const click = el.listeners.click;
    c.setHeading(c.railMarkers["run-1"], 90);
    for (const { id: estilo } of estilosIndicadores) {
      c.window.updateIndicatorStyles({
        onibus: "padrao",
        brt: "padrao",
        trem: estilo,
      });
      assert.strictEqual(el.listeners.click, click);
      assert.equal(el.querySelector(".bus-inner").style["--h"], "90deg");
      assert.equal(
        el.querySelector(".vehicle-art").src,
        renderizarIndicador(estilo, "trem", "#663399").uri,
      );
      assert.match(
        decodeURIComponent(el.querySelector(".vehicle-art").src),
        /fill="#663399"/,
      );
    }
  }
});

function providerHarness(storage) {
  const slots = [],
    effects = [];
  let index = 0;
  const react = {
    createContext: () => ({ Provider: "Provider" }),
    createElement: (type, props) => props.value,
    useState: (initial) => {
      const i = index++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (v) => {
          slots[i] = v;
        },
      ];
    },
    useRef: (initial) => {
      const i = index++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useEffect: (fn) => {
      if (!effects.length) effects.push(fn);
    },
    useCallback: (fn) => fn,
  };
  const filename = path.resolve(
    __dirname,
    "../context/ProvedorIndicadores.tsx",
  );
  const mod = new Module(filename, module);
  mod.require = (id) =>
    id === "react"
      ? react
      : id.includes("async-storage")
        ? storage
        : require("../constants/indicadores.ts");
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
  return {
    render: () => {
      index = 0;
      return mod.exports.ProvedorIndicadores({});
    },
    effects,
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
test("hundreds of markers only replace image sources for the modal whose style changed", () => {
  const c = runtime();
  const elements = [];
  for (let i = 0; i < 600; i++) {
    const modal = modaisIndicadores[i % 3].id;
    const el = c.busIcon("#3498DB", 0, modal);
    c.vehicleMarkers[i] = { getElement: () => el };
    elements.push(el);
  }
  c.window.updateIndicatorStyles({
    onibus: "padrao",
    brt: "realista",
    trem: "padrao",
  });
  elements.forEach((el, i) =>
    assert.equal(
      el.querySelector(".vehicle-art").sourceWrites,
      i % 3 === 1 ? 2 : 1,
    ),
  );
});

test("corrupt storage falls back and a failed write can be retried without blocking updates", async () => {
  let fail = true;
  let saved;
  const h = providerHarness({
    getItem: async () => "{invalid",
    setItem: async (key, value) => {
      if (fail) throw new Error("write failed");
      saved = value;
    },
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    h.render();
    h.effects[0]();
    await settle();
    assert.deepEqual(h.render().preferencias, indicadoresPadrao);
    h.render().atualizar({ estiloGlobal: "realista" });
    await settle();
    assert.equal(h.render().preferencias.estiloGlobal, "realista");
    assert.ok(h.render().erro);
    fail = false;
    h.render().atualizar({ estiloGlobal: "classico" });
    await settle();
    assert.equal(h.render().erro, null);
    assert.equal(JSON.parse(saved).estiloGlobal, "classico");
  } finally {
    console.warn = warn;
  }
});

test("preferences hydrate and persist ordered writes on a dedicated key across provider restart", async () => {
  const writes = [];
  const store = new Map([["@linhasSelecionadas", "unchanged"]]);
  const storage = {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      await settle();
      writes.push(key);
      store.set(key, value);
    },
  };
  const h = providerHarness(storage);
  h.render();
  h.effects[0]();
  await settle();
  let value = h.render();
  assert.equal(value.carregando, false);
  value.atualizar({
    individuais: { onibus: "realista", brt: "classico", trem: "padrao" },
  });
  value.atualizar({ global: false });
  value.atualizar({ estiloGlobal: "realista" });
  for (let i = 0; i < 8; i++) await settle();
  value = h.render();
  assert.equal(value.erro, null);
  assert.equal(store.get("@linhasSelecionadas"), "unchanged");
  assert.deepEqual(writes, Array(3).fill("@preferenciasIndicadores:v1"));
  const h2 = providerHarness(storage);
  h2.render();
  h2.effects[0]();
  await settle();
  assert.deepEqual(h2.render().preferencias, value.preferencias);
});
