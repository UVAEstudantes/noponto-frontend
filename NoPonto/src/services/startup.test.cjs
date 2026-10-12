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

function storage(mock) {
  return load("storage.ts", {
    "@react-native-async-storage/async-storage": mock,
    "@/src/constants/estilosMapa": {},
  });
}

test("shared transition waits for video end, exits immediately for a ready map, and recovers after 8s", () => {
  const originalTimeout = global.setTimeout;
  const originalClear = global.clearTimeout;
  let expired = false;
  let timeout;
  let starts = 0;
  let completed = 0;
  let stops = 0;
  let cleared = 0;
  const cleanups = [];
  global.setTimeout = (callback, delay) => {
    assert.equal(delay, 8000);
    timeout = callback;
    return 123;
  };
  global.clearTimeout = (id) => {
    assert.equal(id, 123);
    cleared++;
  };
  try {
    const { useStartupTransition } = load(
      "../components/startup/useStartupTransition.ts",
      {
        react: {
          useRef: (value) => ({ current: value }),
          useState: () => [
            expired,
            (value) => {
              expired = value;
            },
          ],
          useEffect: (callback) => {
            const cleanup = callback();
            if (cleanup) cleanups.push(cleanup);
          },
        },
        "react-native": {
          Animated: {
            Value: class {},
            timing: (_, config) => {
              assert.equal(config.duration, 220);
              return {
                start: (callback) => {
                  starts++;
                  callback({ finished: true });
                },
                stop: () => {
                  stops++;
                },
              };
            },
          },
        },
      },
    );
    const complete = () => completed++;
    useStartupTransition(false, true, complete);
    assert.equal(starts, 0); // Map ready does not cut the video short.
    useStartupTransition(true, true, complete);
    assert.equal(completed, 1); // No minimum five-second delay for static mode.
    useStartupTransition(true, false, complete);
    assert.equal(completed, 1);
    timeout();
    useStartupTransition(true, false, complete);
    assert.equal(completed, 2);
    cleanups.forEach((cleanup) => cleanup());
    assert.equal(cleared, 3);
    assert.equal(stops, 2);
  } finally {
    global.setTimeout = originalTimeout;
    global.clearTimeout = originalClear;
  }
});

test("opening defaults to video; only persisted false selects static; changes survive reload", async () => {
  let persisted = null;
  const mock = {
    getItem: async (key) => {
      assert.equal(key, "@animacaoAbertura");
      return persisted;
    },
    setItem: async (key, value) => {
      assert.equal(key, "@animacaoAbertura");
      persisted = value;
    },
  };
  const preferences = storage(mock);
  assert.equal(await preferences.carregarAnimacaoAbertura(), true);
  persisted = "invalid";
  assert.equal(await preferences.carregarAnimacaoAbertura(), true);
  await preferences.salvarAnimacaoAbertura(false);
  assert.equal(await storage(mock).carregarAnimacaoAbertura(), false);
  await preferences.salvarAnimacaoAbertura(true);
  assert.equal(await storage(mock).carregarAnimacaoAbertura(), true);
});

test("read failure falls back to video; write failure is reported to the caller", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const preferences = storage({
      getItem: async () => {
        throw new Error("read");
      },
      setItem: async () => {
        throw new Error("write");
      },
    });
    assert.equal(await preferences.carregarAnimacaoAbertura(), true);
    await assert.rejects(preferences.salvarAnimacaoAbertura(false), /write/);
  } finally {
    console.warn = warn;
  }
});

test("disabled opening selects static without mounting a player; pending opening is black", () => {
  const video = () => {
    throw new Error("Player must not mount");
  };
  const react = {
    useState: (value) => [value],
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  const { default: Overlay, StartupPendingOverlay } = load(
    "../components/startup/StartupOverlay.tsx",
    {
      react,
      "react-native": {
        View: "View",
        StyleSheet: { create: (styles) => styles, absoluteFillObject: {} },
      },
      "expo-splash-screen": {},
      "./SplashVideoOverlay": video,
      "./SplashVideoBoundary": "Boundary",
      "./useStartupTransition": {},
    },
  );
  const staticTree = Overlay({
    animated: false,
    appReady: false,
    onComplete: () => {},
  });
  assert.notEqual(staticTree.children[0].type, video);
  assert.equal(Overlay({ animated: true }).children[0].type, video);
  const pending = StartupPendingOverlay();
  assert.equal(pending.type, "View");
  assert.equal(pending.props.style.backgroundColor, "#000000");
});
