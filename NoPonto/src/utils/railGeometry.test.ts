import assert from "node:assert/strict";
import test from "node:test";
import {
  PromiseCache,
  coordinateAtDistance,
  bearingAtDistance,
  haversineMetres,
  prepareRailGeometry,
  railDistanceAtTime,
} from "./railGeometry";

const line = prepareRailGeometry([
  [-43, -22],
  [-43, -21.999],
  [-42.999, -21.999],
]);

test("haversine and cumulative distances use metres", () => {
  const distance = haversineMetres([-43, -22], [-43, -21.999]);
  assert.ok(distance > 110 && distance < 112);
  assert.equal(line.cumulativeDistances[0], 0);
  assert.ok(line.cumulativeDistances[2] > line.cumulativeDistances[1]);
});

test("coordinateAtDistance follows segments and clamps both ends", () => {
  assert.deepEqual(coordinateAtDistance(line, -1), [-43, -22]);
  assert.deepEqual(
    coordinateAtDistance(line, line.totalLengthMetres + 1),
    [-42.999, -21.999],
  );
  const middle = coordinateAtDistance(line, line.segmentLengths[0] / 2)!;
  assert.ok(Math.abs(middle[0] + 43) < 1e-9);
  assert.ok(Math.abs(middle[1] + 21.9995) < 1e-6);
});

test("local tangent produces cardinal headings and reverses with direction", () => {
  const north = prepareRailGeometry([[0, 0], [0, 0.01]]);
  const east = prepareRailGeometry([[0, 0], [0.01, 0]]);
  const south = prepareRailGeometry([[0, 0.01], [0, 0]]);
  const west = prepareRailGeometry([[0.01, 0], [0, 0]]);
  assert.ok(Math.abs(bearingAtDistance(north, north.totalLengthMetres / 2)! - 0) < 0.1);
  assert.ok(Math.abs(bearingAtDistance(east, east.totalLengthMetres / 2)! - 90) < 0.1);
  assert.ok(Math.abs(bearingAtDistance(south, south.totalLengthMetres / 2)! - 180) < 0.1);
  assert.ok(Math.abs(bearingAtDistance(west, west.totalLengthMetres / 2)! - 270) < 0.1);
});

test("only fresh InSegment advances; stationary states and stale data freeze", () => {
  const reference = "2026-10-01T12:00:00Z";
  const target = "2026-10-01T12:02:00Z";
  const fresh = "2026-10-01T12:03:00Z";
  const half = Date.parse("2026-10-01T12:01:00Z");
  assert.equal(
    railDistanceAtTime("InSegment", 0, reference, 100, target, fresh, half),
    50,
  );
  for (const state of ["Dwell", "AwaitingDeparture", "TerminalHold"])
    assert.equal(
      railDistanceAtTime(state, 10, reference, 100, target, fresh, half),
      10,
    );
  assert.equal(
    railDistanceAtTime(
      "InSegment",
      10,
      reference,
      100,
      target,
      fresh,
      Date.parse("2026-10-01T12:04:00Z"),
    ),
    10,
  );
});

test("promise cache fetches each geometry key once", async () => {
  const cache = new PromiseCache<number>();
  let calls = 0;
  const factory = async () => ++calls;
  assert.equal(await cache.get("version-a", factory), 1);
  assert.equal(await cache.get("version-a", factory), 1);
  assert.equal(calls, 1);
  assert.equal(await cache.get("version-b", factory), 2);
});
