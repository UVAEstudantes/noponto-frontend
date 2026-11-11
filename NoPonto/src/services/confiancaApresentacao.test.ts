import assert from "node:assert/strict";
import test from "node:test";
import { rotuloConfianca } from "./confiancaApresentacao";
test("confidence mapping never exposes internal enums", () => {
  assert.equal(rotuloConfianca("ScheduledEstimated", "ScheduleOnly"), "Programado");
  assert.equal(rotuloConfianca("ScheduleEstimated", "ScheduleAnchored"), "Estimado");
  assert.equal(rotuloConfianca("RealtimeEstimated", "MultiSatelliteAnchored"), "Ao vivo");
});

test("explicit rail status takes precedence and unknown status cannot become live", () => {
  assert.equal(rotuloConfianca("RealtimeEstimated", "RealtimeAnchored", "Scheduled"), "Programado");
  assert.equal(rotuloConfianca("ScheduledEstimated", "ScheduleOnly", "Live"), "Ao vivo");
  assert.equal(rotuloConfianca("RealtimeEstimated", "RealtimeAnchored", "Unknown"), "Estimado");
});
