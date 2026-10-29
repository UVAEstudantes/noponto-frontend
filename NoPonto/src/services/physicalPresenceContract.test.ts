import assert from "node:assert/strict";
import test from "node:test";
import { physicalAge, physicalRadarEligible, physicalSnapshotIsNewer, type PhysicalVehicle } from "./physicalPresenceContract";

const now = Date.parse("2026-10-28T12:00:00Z");
const vehicle: PhysicalVehicle = {
  key: "Sppo:ZIRIX:0012", modal: "onibus", provider: "ZIRIX",
  originalVehicleId: "0012", latitude: -22, longitude: -43,
  physicalAt: new Date(now).toISOString(), speedKmh: 0,
  lineId: null, serviceCode: null, lineState: "Unknown",
  lineValidatedAt: null, location: "UncertainLocation", facilityStopId: "synthetic",
};

for (const [seconds, visible, delayed, opacity] of [
  [299, true, false, 1], [300, true, true, 0.55],
  [599, true, true, 0.55], [600, false, false, 0],
] as const) {
  test(`physical presence age ${seconds}s`, () => {
    assert.deepEqual(physicalAge(vehicle, now + seconds * 1000),
      { visible, delayed, opacity, seconds });
  });
}

test("invalid or future physical timestamps never become visible", () => {
  assert.equal(physicalAge({ ...vehicle, physicalAt: "bad" }, now).visible, false);
  assert.equal(physicalAge(vehicle, now - 1).visible, false);
});

test("terminal vehicle is eligible at another served stop only for matching modal and line", () => {
  const parked = { ...vehicle, lineId: "line-x", lineState: "Inherited" };
  assert.equal(physicalRadarEligible(parked, "onibus", ["line-x"], now), true);
  assert.equal(physicalRadarEligible(parked, "brt", ["line-x"], now), false);
  assert.equal(physicalRadarEligible(parked, "onibus", ["line-y"], now), false);
  assert.equal(physicalRadarEligible({ ...parked, speedKmh: null }, "onibus", ["line-x"], now), false);
  assert.equal(physicalRadarEligible({ ...parked, lineState: "Conflict" }, "onibus", ["line-x"], now), false);
});

test("snapshot restart accepts newer publication and rejects delayed previous generation", () => {
  const first = { publishedAt: new Date(now).toISOString(), generation: 99 };
  const restarted = { publishedAt: new Date(now + 1000).toISOString(), generation: 1 };
  assert.equal(physicalSnapshotIsNewer(restarted, first), true);
  assert.equal(physicalSnapshotIsNewer(first, restarted), false);
  assert.equal(physicalSnapshotIsNewer(first, first), false);
  assert.equal(physicalSnapshotIsNewer({ ...first, publishedAt: "bad" }), false);
});
