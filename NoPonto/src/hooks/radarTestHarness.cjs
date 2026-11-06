/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

// Harness determinístico do ciclo de hooks/efeitos; não simula layout nem runtime nativo.
function criarHarness() {
  const slots = [], listeners = new Set(), timers = new Map();
  let indice = 0, effects = [], dirty = false, renderFn, output, timerId = 0;
  let now = Date.parse("2026-10-23T12:00:00Z");
  const igual = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: "Fragment",
    useRef(value) { const i = indice++; return slots[i] ??= { current: value }; },
    useState(value) {
      const i = indice++;
      slots[i] ??= { value: typeof value === "function" ? value() : value };
      return [slots[i].value, (next) => {
        const value = typeof next === "function" ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useMemo(fn, deps) {
      const i = indice++;
      if (!slots[i] || !igual(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useReducer(reducer, initial) {
      const [value, setValue] = react.useState(initial);
      return [value, (action) => setValue((state) => reducer(state, action))];
    },
    useEffect(fn, deps) {
      const i = indice++;
      if (!slots[i] || !igual(slots[i].deps, deps)) {
        const cleanup = slots[i]?.cleanup;
        slots[i] = { deps };
        effects.push(() => { cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const appState = { currentState: "active", addEventListener(_name, fn) {
    listeners.add(fn); return { remove: () => listeners.delete(fn) };
  } };
  const env = {
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay, interval: delay }); return id; },
    clearInterval(id) { timers.delete(id); },
  };
  const render = (fn = renderFn, executarEfeitos = true) => {
    renderFn = fn;
    let ciclos = 0;
    do {
      indice = 0; dirty = false; output = renderFn();
      if (!executarEfeitos) return output;
      const queue = effects; effects = []; queue.forEach((effect) => effect());
      if (++ciclos > 30) throw new Error("Render sem estabilidade");
    } while (dirty);
    return output;
  };
  const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
    return render();
  };
  return { react, appState, env, render, flush,
    get output() { return output; }, get now() { return now; }, get timerCount() { return timers.size; },
    async avancar(ms) {
      const target = now + ms;
      while (true) {
        const next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, t] = next;
        now = t.at;
        if (t.interval) t.at += t.interval; else timers.delete(id);
        t.fn(); await flush();
      }
      now = target; return flush();
    },
    estado(value) { appState.currentState = value; listeners.forEach((fn) => fn(value)); return render(); },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
    carregar(relative, mocks = {}) {
      const filename = path.resolve(__dirname, relative);
      const mod = new Module(filename, module);
      const realRequire = Module.createRequire(filename);
      mod.require = (id) => id === "react" ? react : id === "@test/clock" ? env
        : Object.hasOwn(mocks, id) ? mocks[id] : id === "react-native" ? { AppState: appState } : realRequire(id);
      mod._compile('const { Date, setTimeout, clearTimeout, setInterval, clearInterval } = require("@test/clock");\n'
        + ts.transpileModule(fs.readFileSync(filename, "utf8"), { fileName: filename,
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, filename);
      return mod.exports;
    },
  };
}

function adiada() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
module.exports = { criarHarness, adiada };
