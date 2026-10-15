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
        "./startupDiagnostics": { startupLog: () => {} },
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
    assert.equal(cleared, 2);
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

test("disabled opening selects static without mounting a player; pending preference shows the logo on black", () => {
  const video = () => {
    throw new Error("Player must not mount");
  };
  const react = {
    useState: (value) => [value],
    useEffect: () => {},
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
      "./StartupLogo": "Logo",
      "./startupDiagnostics": { startupLog: () => {} },
      "./useStartupTransition": {},
    },
  );
  const staticTree = Overlay({
    animated: false,
    appReady: false,
    onComplete: () => {},
  });
  assert.notEqual(staticTree.type, video);
  assert.equal(Overlay({ animated: true }).type, video);
  const pending = StartupPendingOverlay();
  assert.equal(pending.type, "View");
  assert.equal(pending.props.style.backgroundColor, "#000000");
  assert.equal(pending.children[0].type, "Logo");
});

function videoHarness(initialStatus = "readyToPlay", deferEffects = false) {
  const callbacks = {};
  const timers = new Map();
  const cleanups = [];
  const reasons = [];
  const logs = [];
  let plays = 0;
  let pauses = 0;
  let removed = 0;
  let timerId = 0;
  let overlayEnded = false;
  const pendingEffects = [];
  let appStateHandler;
  let appStateRemoved = 0;
  const player = {
    status: initialStatus,
    playing: false,
    duration: 5,
    play: () => plays++,
    pause: () => pauses++,
    addListener: (name, callback) => {
      callbacks[name] = callback;
      return { remove: () => removed++ };
    },
  };
  const react = {
    useRef: (value) => ({ current: value }),
    useState: () => [overlayEnded, () => {}],
    useCallback: (callback) => callback,
    useEffect: (effect) => {
      if (deferEffects) pendingEffects.push(effect);
      else cleanups.push(effect());
    },
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  const originalSet = global.setTimeout;
  const originalClear = global.clearTimeout;
  global.setTimeout = (callback, delay) => {
    timers.set(++timerId, { callback, delay });
    return timerId;
  };
  global.clearTimeout = (id) => timers.delete(id);
  const { SplashVideoPlayer, default: Overlay } = load(
    "../components/startup/SplashVideoOverlay.tsx",
    {
      react,
      "react-native": {
        AppState: {
          currentState: "active",
          addEventListener: (name, callback) => {
            assert.equal(name, "change"); appStateHandler = callback;
            return { remove: () => appStateRemoved++ };
          },
        },
        Image: { resolveAssetSource: () => ({ uri: "assets_vids_splash" }) },
        Animated: { View: "AnimatedView" },
        StyleSheet: {
          create: (value) => value,
          absoluteFillObject: {},
          absoluteFill: {},
        },
      },
      "expo-splash-screen": { hideAsync: async () => logs.push("hide") },
      "expo-video": {
        useVideoPlayer: (_, setup) => {
          setup(player);
          return player;
        },
        VideoView: "Video",
      },
      "./SplashVideoBoundary": "Boundary",
      "./StartupLogo": "Logo",
      "./startupDiagnostics": {
        startupLog: (event) => logs.push(event),
        startupDiagnosticsEnabled: () => false,
      },
      "./useStartupTransition": { useStartupTransition: () => 1 },
      "../../../assets/vids/splash.mp4": 123,
    },
  );
  const tree = SplashVideoPlayer({
    onFinish: (reason) => reasons.push(reason),
  });
  return {
    tree,
    flushEffects: () =>
      pendingEffects.splice(0).forEach((effect) => cleanups.push(effect())),
    callbacks,
    appState: state => appStateHandler?.(state),
    get appStateRemoved() { return appStateRemoved; },
    timers,
    reasons,
    logs,
    player,
    get plays() {
      return plays;
    },
    get pauses() {
      return pauses;
    },
    get removed() {
      return removed;
    },
    overlay: (ended = false) => {
      overlayEnded = ended;

      return Overlay({ appReady: false, onComplete: () => {} });
    },
    restore: () => {
      cleanups.forEach((cleanup) => cleanup?.());
      global.setTimeout = originalSet;
      global.clearTimeout = originalClear;
    },
  };
}

test("Android splash hides on overlay layout before any first frame", () => {
  const h = videoHarness();
  try {
    h.overlay().props.onLayout();
    assert.ok(h.logs.includes("hide"));
    assert.ok(!h.logs.includes("video.firstFrame"));
  } finally {
    h.restore();
  }
});

test("normal video uses playToEnd, cancels both deadlines and cleans subscriptions", () => {
  const h = videoHarness();
  try {
    assert.equal(h.plays, 1);
    assert.equal([...h.timers.values()][0].delay, 3000);
    h.tree.props.onFirstFrameRender();
    assert.equal(h.timers.size, 1);
    assert.equal([...h.timers.values()][0].delay, 7000);
    h.callbacks.playToEnd();
    h.callbacks.playToEnd();
    assert.deepEqual(h.reasons, ["playToEnd"]);
    assert.equal(h.pauses, 1);
    assert.equal(h.timers.size, 0);
  } finally {
    h.restore();
  }
  assert.equal(h.removed, 4);
});

test("missing first frame, native error and missing end event each recover once", () => {
  for (const reason of [
    "firstFrameTimeout",
    "nativeError",
    "playbackTimeout",
    "initialError",
  ]) {
    const h = videoHarness(reason === "initialError" ? "error" : "readyToPlay");
    try {
      if (reason === "playbackTimeout") h.tree.props.onFirstFrameRender();
      if (reason === "nativeError")
        h.callbacks.statusChange({
          status: "error",
          error: { message: "raw resource missing" },
        });
      else if (reason !== "initialError") [...h.timers.values()][0].callback();
      h.callbacks.playToEnd();
      assert.deepEqual(h.reasons, [reason]);
      assert.equal(h.timers.size, 0);
      if (reason === "initialError") assert.equal(h.plays, 0);
    } finally {
      h.restore();
    }
  }
});

test("failed/completed video unmounts the player and shows the official loading fallback", () => {
  const h = videoHarness();
  try {
    const tree = h.overlay(true);
    assert.notEqual(tree.children[0]?.type, "Boundary");
    assert.equal(tree.children[0].children[0].type, "Logo");
  } finally {
    h.restore();
  }
});

test("a frame delivered before passive effects keeps the playback deadline", () => {
  const h = videoHarness("readyToPlay", true);
  try {
    h.tree.props.onFirstFrameRender();
    assert.equal([...h.timers.values()][0].delay, 7000);
    h.flushEffects();
    assert.equal(h.timers.size, 1);
    assert.equal([...h.timers.values()][0].delay, 7000);
    h.callbacks.playToEnd();
    assert.equal(h.timers.size, 0);
  } finally {
    h.restore();
  }
});


test("release startup diagnostics are silent unless explicitly enabled", () => {
  const previousDev = global.__DEV__;
  const previousFlag = process.env.EXPO_PUBLIC_STARTUP_DIAGNOSTICS;
  const previousInfo = console.info;
  const logs = [];
  try {
    console.info = (...args) => logs.push(args);
    global.__DEV__ = false;
    delete process.env.EXPO_PUBLIC_STARTUP_DIAGNOSTICS;
    const diagnostics = load("../components/startup/startupDiagnostics.ts", {});
    diagnostics.startupLog("disabled");
    assert.equal(logs.length, 0);
    process.env.EXPO_PUBLIC_STARTUP_DIAGNOSTICS = "1";
    diagnostics.startupLog("enabled");
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], "[Startup] enabled");
    process.env.EXPO_PUBLIC_STARTUP_DIAGNOSTICS = "0";
    diagnostics.startupLog("disabledAgain");
    assert.equal(logs.length, 1);
  } finally {
    console.info = previousInfo;
    if (previousDev === undefined) delete global.__DEV__; else global.__DEV__ = previousDev;
    if (previousFlag === undefined) delete process.env.EXPO_PUBLIC_STARTUP_DIAGNOSTICS;
    else process.env.EXPO_PUBLIC_STARTUP_DIAGNOSTICS = previousFlag;
  }
});


test("permission activity pause resumes the unfinished video on foreground without seeking", () => {
  const h = videoHarness("loading");
  try {
    assert.equal(h.plays, 1);
    h.player.status = "readyToPlay";
    h.callbacks.statusChange({ status: "readyToPlay", error: null });
    assert.equal(h.plays, 2, "readyToPlay explicitly confirms the play request");
    h.player.currentTime = 1.232;
    h.tree.props.onFirstFrameRender();
    h.appState("background");
    h.player.playing = false; // expo-video auto-pauses for GrantPermissionsActivity.
    assert.equal(h.timers.size, 0, "permission dialog must not consume the watchdog");
    h.appState("active");
    assert.equal(h.plays, 3);
    assert.equal(h.player.currentTime, 1.232, "resume must not rewind or replace the asset");
    assert.equal(h.pauses, 0);
    assert.ok(Math.abs([...h.timers.values()][0].delay - 5768) < 1);
    h.callbacks.playToEnd();
    h.appState("active");
    assert.equal(h.plays, 3, "late lifecycle events cannot replay a finished opening");
    assert.deepEqual(h.reasons, ["playToEnd"]);
  } finally { h.restore(); }
  assert.equal(h.appStateRemoved, 1);
});

test("loading while backgrounded waits for foreground and preserves the first-frame fallback", () => {
  const h = videoHarness("loading");
  try {
    h.appState("background");
    h.player.status = "readyToPlay";
    h.callbacks.statusChange({ status: "readyToPlay", error: null });
    assert.equal(h.plays, 1, "do not force playback behind another Activity");
    assert.equal(h.timers.size, 0);
    h.appState("active");
    assert.equal(h.plays, 2);
    assert.equal([...h.timers.values()][0].delay, 3000);
    [...h.timers.values()][0].callback();
    h.appState("active");
    assert.equal(h.plays, 2);
    assert.deepEqual(h.reasons, ["firstFrameTimeout"]);
  } finally { h.restore(); }
});


test("native player creation failure immediately delegates to the parent fallback", () => {
  let completed = 0;
  const { default: Boundary } = load("../components/startup/SplashVideoBoundary.tsx", {
    react: { Component: class { constructor(props) { this.props = props; } } },
    "./startupDiagnostics": { startupLog: () => {} },
  });
  const boundary = new Boundary({ children: "video", onComplete: () => completed++ });
  assert.equal(boundary.render(), "video");
  boundary.state = Boundary.getDerivedStateFromError();
  boundary.componentDidCatch(new Error("fixture: native creation failed"));
  assert.equal(completed, 1, "fallback cannot depend on another native layout event");
  assert.equal(boundary.render(), null);
});

test("laboratory surface override cannot change the release candidate surface", () => {
  const previous = process.env.EXPO_PUBLIC_STARTUP_SURFACE_TYPE;
  process.env.EXPO_PUBLIC_STARTUP_SURFACE_TYPE = "surfaceView";
  let h;
  try {
    h = videoHarness();
    assert.equal(h.tree.props.surfaceType, "textureView");
  } finally {
    h?.restore();
    if (previous === undefined) delete process.env.EXPO_PUBLIC_STARTUP_SURFACE_TYPE;
    else process.env.EXPO_PUBLIC_STARTUP_SURFACE_TYPE = previous;
  }
});
