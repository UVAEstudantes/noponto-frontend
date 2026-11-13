const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.join(__dirname, "tutorialSteps.ts");
const m = new Module(filename, module);
m._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  filename,
);
const { readProgress, writeProgress, transition, scheduleExample, KEY, EMPTY } =
  m.exports;
test("persistence keeps independent flags and uses its own key", async () => {
  let saved;
  await writeProgress(
    {
      setItem: async (key, value) => {
        assert.equal(key, KEY);
        saved = value;
      },
    },
    { seen: true, completed: false, dismissed: true },
  );
  assert.deepEqual(await readProgress({ getItem: async () => saved }), {
    seen: true,
    completed: false,
    dismissed: true,
  });
});
test("missing invalid and failed storage reads recover", async () => {
  for (const raw of [null, "broken", '{"seen":"true"}'])
    assert.deepEqual(await readProgress({ getItem: async () => raw }), EMPTY);
  assert.deepEqual(
    await readProgress({
      getItem: async () => {
        throw Error("offline");
      },
    }),
    EMPTY,
  );
});
test("write failure does not reject", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    await assert.doesNotReject(
      writeProgress(
        {
          setItem: async () => {
            throw Error("full");
          },
        },
        EMPTY,
      ),
    );
  } finally {
    console.warn = warn;
  }
});
test("selection advances only the search and next cannot bypass selection", () => {
  assert.equal(transition("search", "next"), "search");
  assert.equal(transition("search", "selected"), "route");
  assert.equal(transition(null, "selected"), null);
  assert.equal(transition("invite", "selected"), "invite");
});
test("back skip and completion follow the journey", () => {
  assert.equal(transition("welcome", "next"), "invite");
  assert.equal(transition("invite", "next"), "search");
  assert.equal(transition("search", "back"), "invite");
  assert.equal(transition("route", "back"), "search");
  assert.equal(transition("search", "skip"), "route");
  assert.equal(transition("route", "next"), "done");
  assert.equal(transition("done", "next"), "vehiclesIntro");
});
test("example waits 25 seconds and cleanup cancels pending offer", () => {
  let callback,
    delay,
    cancelled,
    offered = false;
  const cleanup = scheduleExample(
    () => {
      offered = true;
    },
    (fn, ms) => {
      callback = fn;
      delay = ms;
      return 42;
    },
    (id) => {
      cancelled = id;
    },
  );
  assert.equal(delay, 25000);
  assert.equal(offered, false);
  callback();
  assert.equal(offered, true);
  cleanup();
  assert.equal(cancelled, 42);
});

test("example remains hidden before deadline and cancelled timer cannot offer", () => {
  let now = 0,
    pending,
    offered = 0;
  const schedule = (fn, delay) => {
    pending = { fn, due: now + delay };
    return 1;
  };
  const cancel = () => {
    pending = null;
  };
  const tick = (ms) => {
    now += ms;
    if (pending && now >= pending.due) {
      const fn = pending.fn;
      pending = null;
      fn();
    }
  };
  const cleanup = scheduleExample(() => offered++, schedule, cancel);
  tick(24999);
  assert.equal(offered, 0);
  tick(1);
  assert.equal(offered, 1);
  const stop = scheduleExample(() => offered++, schedule, cancel);
  tick(10000);
  stop();
  tick(25000);
  assert.equal(offered, 1);
  cleanup();
});


test("chapter five persistence rejects foreign sections and invalid resume targets", async () => {
  const result = await readProgress({getItem: async () => JSON.stringify({seen: true, chapters: [1,4,5,99], radarSections: ["5A", "bad", "5C"], radarResume: "search"})});
  assert.deepEqual(result.chapters, [1,4,5]);
  assert.deepEqual(result.radarSections, ["5A", "5C"]);
  assert.equal(result.radarResume, undefined);
  assert.equal(m.exports.radarBlocked("radarLines"), false);
  assert.equal(m.exports.radarBlocked("lineColor"), true);
  assert.equal(transition("linesDone", "next"), "radarIntro");
  assert.equal(transition("radarIntro", "back"), "linesDone");
});


test("full journey persistence keeps six chapters, skipped steps and manual replay separate", async () => {
  const saved = {seen: true, completed: true, dismissed: true, chapters: [1,2,3,4,5,6], radarSections: ["5A", "5B", "5C"], presentationFinished: true, journeyFinished: true, skippedSteps: ["vehicle"], manualReplays: 3};
  assert.deepEqual(await readProgress({getItem: async () => JSON.stringify(saved)}), saved);
  for (const step of ["transportIntro", "transportFilters", "transportBrt", "transportRail", "railStatus", "transportMap", "journeyDone"]) assert.equal(m.exports.radarBlocked(step), true);
  assert.equal(m.exports.radarBlocked("voicePreview"), false);
  assert.equal(m.exports.radarBlocked(null), false);
});
