import assert from "node:assert/strict";
import test from "node:test";
import { chegadasDoRadar } from "./apresentacaoRadar";
import type { EventoParadaDto } from "./eventosParada";
import type { RailVehicleForMap } from "./railRealtime";
import type { VeiculoMapaRodoviario } from "./veiculosMapa";

const recebidoEm = Date.parse("2026-10-10T12:00:00Z");
const evento: EventoParadaDto = { eventId: "scheduled-run", linhaId: "linha", codigoLinha: "Santa Cruz",
  modal: "trem", tipoRota: "trem", sentidoId: "ida", padraoVersaoId: "v1", paradaId: "parada",
  ocorrenciaParadaPadraoId: "oc", eventType: "DEPARTURE", nextVehiclesMode: "Departures",
  expectedRunId: "run-1", source: "ScheduledEstimated", quality: "ScheduleOnly", isEstimated: true,
  scheduledAt: "2026-10-10T12:02:00Z", distanciaRestanteMetros: null };

test("ParadaSheet recebe identidade, saída e qualidade sem transformar programação em ao vivo", () => {
  const [chegada] = chegadasDoRadar([evento], null, [], recebidoEm, recebidoEm + 30000, [], []);
  assert.equal(chegada.id, evento.eventId);
  assert.equal(chegada.eventType, "DEPARTURE");
  assert.equal(chegada.nextVehiclesMode, "Departures");
  assert.equal(chegada.qualidade, "Programado");
  assert.equal(chegada.etaSeg, 90);
  assert.equal(chegada.distanciaMetros, null);
  assert.equal(chegada.referenciaDisponivel, false);
});
test("foco ferroviário depende do ExpectedRun renderizado, sem aproximação por linha", () => {
  const rail = [{ railVehicleId: "rv-1", railRunId: "run-1", platformLabel: "2" }] as RailVehicleForMap[];
  assert.equal(chegadasDoRadar([evento], null, [], recebidoEm, recebidoEm, [], rail)[0].referenciaDisponivel, true);
  assert.equal(chegadasDoRadar([{ ...evento, expectedRunId: "run-inexistente" }], null, [], recebidoEm,
    recebidoEm, [], rail)[0].referenciaDisponivel, false);
});
test("evento rodoviário preserva distância operacional e identidade exata", () => {
  const road = [{ ordem: "A123" }] as VeiculoMapaRodoviario[];
  const rodoviario = { ...evento, modal: "onibus" as const, tipoRota: "brt" as const,
    vehicleId: "A123", expectedRunId: null, distanciaRestanteMetros: 350 };
  const [chegada] = chegadasDoRadar([rodoviario], null, [], recebidoEm, recebidoEm, road, []);
  assert.equal(chegada.referenciaDisponivel, true);
  assert.equal(chegada.distanciaMetros, 350);
  assert.equal(chegadasDoRadar([{ ...rodoviario, vehicleId: "outro" }], null, [], recebidoEm,
    recebidoEm, road, [])[0].referenciaDisponivel, false);
});
