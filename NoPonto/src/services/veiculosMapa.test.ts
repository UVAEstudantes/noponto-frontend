import assert from "node:assert/strict";
import test from "node:test";
import { prepareRailGeometry } from "../utils/railGeometry";
import {
  adaptarPosicaoRodoviariaV2,
  adaptarRailParaMapa,
  filtrarVeiculosFerroviariosVisiveis,
  filtrarVeiculosPorPadroesVisiveis,
  reconciliarSnapshotsRodoviarios,
  type PosicaoRodoviariaV2Dto,
} from "./veiculosMapa";
import type { RailVehicleForMap } from "./railRealtime";
import { CacheEstruturalPorVersao } from "./estruturaV2";

const road = (version: string): PosicaoRodoviariaV2Dto => ({
  ordem: `V-${version}`,
  codigoLinha: "006",
  linhaId: "line",
  sentidoId: "direction",
  padraoOperacionalId: `pattern-${version}`,
  padraoVersaoId: version,
  itinerarioId: "legacy-alias-must-not-win",
  latitude: -22,
  longitude: -43,
  velocidade: 20,
  timestampGps: "2026-10-03T12:00:00Z",
  timestampServidor: "2026-10-03T12:00:01Z",
});

test("per-line snapshots remove absent vehicles and upsert new ones", () => {
  const vehicle = (id: string, linha: string) => ({ id, linha });
  const first = [vehicle("A", "884"), vehicle("B", "884"), vehicle("X", "838")];
  const second = reconciliarSnapshotsRodoviarios(first,
    [vehicle("A", "884"), vehicle("C", "884")]);
  assert.deepEqual(second.map((x) => x.id).sort(), ["A", "C", "X"]);
  const third = reconciliarSnapshotsRodoviarios(second, [vehicle("D", "838")]);
  assert.deepEqual(third.map((x) => x.id).sort(), ["A", "C", "D"]);
});

test("road adapter uses V2 identities and represents BRT without virtual modal", () => {
  const vehicle = adaptarPosicaoRodoviariaV2({ ...road("version-a"), tipoRota: "brt" })!;
  assert.equal(vehicle.padraoVersaoId, "version-a");
  assert.equal(vehicle.sentidoId, "direction");
  assert.equal(vehicle.tipoRota, "brt");
  assert.equal(vehicle.modal, "onibus");
  assert.notEqual(vehicle.padraoVersaoId, vehicle.raw && road("x").itinerarioId);
});

test("rail direction filter keeps ALL and never reintroduces the other direction", () => {
  const a = { ...adaptarRailParaMapa(rail("RealtimeEstimated", "RealtimeAnchored")),
    linhaId: "line", sentidoId: "a", padraoVersaoId: "version-a" };
  const b = { ...a, railRunId: "run-b", idVisual: "rail:run-b",
    sentidoId: "b", padraoVersaoId: "version-b" };
  const all = [{ linhaId: "line", padraoVersaoIds: new Set(["version-a", "version-b"]) }];
  const onlyA = [{ linhaId: "line", sentidoId: "a", padraoVersaoIds: new Set(["version-a"]) }];
  assert.deepEqual(filtrarVeiculosFerroviariosVisiveis([a, b], all).map(x => x.sentidoId), ["a", "b"]);
  assert.deepEqual(filtrarVeiculosFerroviariosVisiveis([a, b], onlyA).map(x => x.sentidoId), ["a"]);
  assert.deepEqual(filtrarVeiculosFerroviariosVisiveis([b, a], onlyA).map(x => x.sentidoId), ["a"]);
});

test("vehicles from the same direction retain distinct pattern versions", () => {
  const vehicles = [
    adaptarPosicaoRodoviariaV2(road("version-a"))!,
    adaptarPosicaoRodoviariaV2(road("version-b"))!,
  ];
  assert.deepEqual(
    filtrarVeiculosPorPadroesVisiveis(vehicles, new Set(["version-b"]))
      .map((vehicle) => vehicle.padraoVersaoId),
    ["version-b"],
  );
});

const rail = (
  positionSource: string,
  positionQuality: string,
  trainCode = "",
): RailVehicleForMap => ({
  railRunId: "run-a",
  railVehicleId: "stable-vehicle",
  trainCode,
  linhaId: "line",
  sentidoId: "direction",
  padraoVersaoId: "version",
  state: "InSegment",
  distanceAtReferenceMetres: 10,
  referenceTimeUtc: "2026-10-03T12:00:00Z",
  targetDistanceMetres: 20,
  targetTimeUtc: "2026-10-03T12:01:00Z",
  positionSource,
  positionQuality,
  freshUntilUtc: "2026-10-03T12:02:00Z",
  lastRealtimeEvidenceUtc:
    positionSource === "ScheduledEstimated" ? null : "2026-10-03T12:00:00Z",
  isEstimated: true,
  isClamped: false,
  geometry: prepareRailGeometry([[-43, -22], [-43.1, -22.1]]),
});

test("rail semantics and identity survive schedule-only to live transition", () => {
  const scheduled = adaptarRailParaMapa(
    rail("ScheduledEstimated", "ScheduleOnly"),
  );
  const estimated = adaptarRailParaMapa(
    rail("ScheduleEstimated", "ScheduleAnchored", "T101"),
  );
  const live = adaptarRailParaMapa(
    rail("RealtimeEstimated", "RealtimeAnchored", "T101"),
  );
  assert.equal(scheduled.statusFonte, "Programado");
  assert.equal(scheduled.atualizadoEm, null);
  assert.equal(estimated.statusFonte, "Estimado");
  assert.equal(live.statusFonte, "Ao vivo");
  assert.equal(scheduled.idVisual, live.idVisual);
  assert.equal(scheduled.codigoVeiculoOuTrem, null);
  assert.equal(live.codigoVeiculoOuTrem, "T101");
});

test("explicit operational status wins without changing stable run identity", () => {
  const scheduled = adaptarRailParaMapa({ ...rail("Unknown", "Unknown"),
    operationalStatus: "Scheduled", lineName: "Santa Cruz",
    destinationName: "Central do Brasil", nextStationName: "Benjamim do Monte" });
  const live = adaptarRailParaMapa({ ...rail("Unknown", "Unknown", "US147"),
    operationalStatus: "Live" });
  assert.equal(scheduled.statusFonte, "Programado");
  assert.equal(scheduled.proximaParada, "Benjamim do Monte");
  assert.equal(live.statusFonte, "Ao vivo");
  assert.equal(scheduled.idVisual, live.idVisual);
});

test("structural cache loads each PadraoVersaoId only once", async () => {
  const cache = new CacheEstruturalPorVersao<string>();
  let loads = 0;
  const loader = async () => `geometry-${++loads}`;
  assert.equal(await cache.get("version-a", loader), "geometry-1");
  assert.equal(await cache.get("version-a", loader), "geometry-1");
  assert.equal(loads, 1);
  assert.equal(await cache.get("version-b", loader), "geometry-2");
});
