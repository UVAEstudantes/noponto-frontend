import test from "node:test";
import assert from "node:assert/strict";
import {
  localizarVeiculoDoEvento,
  filtrarEventosPorContexto,
  ordenarEventosParada,
  rotuloQualidadeEvento,
  modoListaEventos,
  type EventoParadaDto,
} from "./eventosParada";
import type { VeiculoMapaRodoviario } from "./veiculosMapa";
import type { RailVehicleForMap } from "./railRealtime";

const base: EventoParadaDto = {
  eventId: "event-a", eventType: "ARRIVAL", linhaId: "line", codigoLinha: "1",
  modal: "onibus", tipoRota: "onibus", sentidoId: "direction", padraoVersaoId: "version",
  paradaId: "stop", ocorrenciaParadaPadraoId: "occurrence", source: "RealtimeEstimated",
  quality: "OperationalEstimate", isEstimated: true,
};

test("renderiza qualidade sem transformar saída em chegada", () => {
  assert.equal(rotuloQualidadeEvento(base), "Ao vivo");
  assert.equal(rotuloQualidadeEvento({ ...base, eventType: "DEPARTURE",
    source: "ScheduledEstimated", quality: "ScheduleOnly" }), "Programado");
  assert.equal(rotuloQualidadeEvento({ ...base, source: "ScheduleEstimated",
    quality: "ScheduleAnchored" }), "Estimado");
});

test("lista usa saídas somente quando todos os eventos são da origem operacional", () => {
  const departure = { ...base, eventType: "DEPARTURE" as const,
    stationRole: "Origin" as const, nextVehiclesMode: "Departures" as const };
  const arrival = { ...base, eventId: "arrival", stationRole: "Intermediate" as const,
    nextVehiclesMode: "Arrivals" as const };
  assert.equal(modoListaEventos([departure]), "Departures");
  assert.equal(modoListaEventos([departure, arrival]), "Arrivals");
  assert.equal(modoListaEventos([{ ...arrival, stationRole: "Destination" }]), "Arrivals");
});

test("ordenação e refresh preservam eventId", () => {
  const later = { ...base, eventId: "stable", estimatedAt: "2026-10-04T15:00:00Z" };
  const sooner = { ...base, eventId: "sooner", scheduledAt: "2026-10-04T14:00:00Z" };
  assert.deepEqual(ordenarEventosParada([later, sooner]).map((x) => x.eventId), ["sooner", "stable"]);
  assert.equal(ordenarEventosParada([{ ...later, secondsUntilEvent: 10 }])[0].eventId, "stable");
});

test("evento rodoviário seleciona o marcador existente sem criar outro", () => {
  const road = [{ ordem: "A123" }] as VeiculoMapaRodoviario[];
  assert.deepEqual(localizarVeiculoDoEvento({ ...base, vehicleId: "A123" }, road, []),
    { runtime: "rodoviario", ordem: "A123" });
  assert.equal(road.length, 1);
});

test("schedule-only foca ExpectedRun renderizado sem TrainCode", () => {
  const rail = [{ railVehicleId: "expected-1", railRunId: "expected-1", trainCode: "" }] as RailVehicleForMap[];
  const ref = localizarVeiculoDoEvento({ ...base, modal: "trem", tipoRota: "trem",
    expectedRunId: "expected-1", railVehicleId: "expected-1", trainCode: null,
    source: "ScheduledEstimated", quality: "ScheduleOnly" }, [], rail);
  assert.deepEqual(ref, { runtime: "ferroviario", idVisual: "rail:expected-1",
    railVehicleId: "expected-1", railRunId: "expected-1" });
});

test("evento sem veículo renderizado permanece sem referência", () => {
  assert.equal(localizarVeiculoDoEvento({ ...base, vehicleId: "missing" }, [], []), null);
});

test("linha 838 selecionada mantém 838 e remove 624", () => {
  const eventos = [
    { ...base, eventId: "838", linhaId: "line-838", padraoVersaoId: "pattern-838" },
    { ...base, eventId: "624", linhaId: "line-624", padraoVersaoId: "pattern-624" },
  ];
  assert.deepEqual(filtrarEventosPorContexto(eventos, { linhas: [
    { linhaId: "line-838", padraoVersaoIds: ["pattern-838"] },
  ] }).map((x) => x.eventId), ["838"]);
});

test("duas linhas selecionadas mantêm eventos das duas", () => {
  const eventos = [
    { ...base, eventId: "838", linhaId: "line-838", padraoVersaoId: "p838" },
    { ...base, eventId: "624", linhaId: "line-624", padraoVersaoId: "p624" },
  ];
  assert.equal(filtrarEventosPorContexto(eventos, { linhas: [
    { linhaId: "line-838", padraoVersaoIds: ["p838"] },
    { linhaId: "line-624", padraoVersaoIds: ["p624"] },
  ] }).length, 2);
});

test("filtro respeita padrão visível, BRT e trem schedule-only", () => {
  const eventos = [
    { ...base, eventId: "hidden", linhaId: "line", padraoVersaoId: "hidden" },
    { ...base, eventId: "brt", linhaId: "line", padraoVersaoId: "visible", tipoRota: "brt" as const },
    { ...base, eventId: "rail", linhaId: "rail", padraoVersaoId: "rail-pattern",
      modal: "trem" as const, tipoRota: "trem" as const, source: "ScheduledEstimated", quality: "ScheduleOnly" },
  ];
  assert.deepEqual(filtrarEventosPorContexto(eventos, { linhas: [
    { linhaId: "line", padraoVersaoIds: ["visible"] },
    { linhaId: "rail", padraoVersaoIds: ["rail-pattern"] },
  ] }).map((x) => x.eventId), ["brt", "rail"]);
});

test("linha sem atendimento não recebe eventos", () => {
  assert.deepEqual(filtrarEventosPorContexto([{ ...base, linhaId: "other" }], {
    linhas: [{ linhaId: "selected", padraoVersaoIds: [] }],
  }), []);
});
