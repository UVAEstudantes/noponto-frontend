import assert from "node:assert/strict";
import test from "node:test";
import { embaralharSugestoes, PLACEHOLDER_TIMING } from "./useAnimatedPlaceholder";

test("shuffle is deterministic with injected RNG and avoids immediate repetition", () => {
  const rng = () => 0;
  assert.deepEqual(embaralharSugestoes(["006", "884", "SV866"], rng), ["884", "SV866", "006"]);
  const next = embaralharSugestoes(["006", "884", "SV866"], rng, "884");
  assert.notEqual(next[0], "884");
});

test("placeholder timings stay inside the corrective UX targets", () => {
  assert.ok(PLACEHOLDER_TIMING.typing >= 95 && PLACEHOLDER_TIMING.typing <= 115);
  assert.ok(PLACEHOLDER_TIMING.deleting >= 55 && PLACEHOLDER_TIMING.deleting <= 75);
  assert.ok(PLACEHOLDER_TIMING.hold >= 1100 && PLACEHOLDER_TIMING.hold <= 1400);
});
