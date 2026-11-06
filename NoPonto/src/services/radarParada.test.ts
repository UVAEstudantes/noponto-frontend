import assert from "node:assert/strict";
import test from "node:test";
import type { LinhaSelecionadaInfo } from "../hooks/useMobilidadeRio";
import type { ItinerarioLinha, Parada, PadraoLinhaV2 } from "../types/transporte";
import type { EventoParadaDto } from "./eventosParada";
import { escolherParadaAutomatica, resolverParadaMonitorada, paradasElegiveisRadar,
  eventosValidosRadar, instanteEventoRadar, doisEventosRadar, paradaDetalhadaRadar, chaveContextoRadar } from "./radarParada";

const local = { latitude: 0, longitude: 0 };
const stop = (paradaId: string, latitude: number): Parada => ({ paradaId, nome: "Estação",
  ordem: 1, latitude, longitude: 0, posicaoLinha: 0 });
const a = stop("plataforma-ida", 0.001);
const b = stop("plataforma-volta", 0.0011);
const linha: LinhaSelecionadaInfo = { linhaId: "linha", linhaCodigo: "084", nomeExibicao: "084",
  cor: "#F59E0B", ativa: true, modal: "brt", modoSentido: "ambos", mostrarParadas: false };
const padrao = (id: string, sentidoId: string, destino: string, parada: Parada): PadraoLinhaV2 => ({
  sentidoId, sentidoNome: destino, padraoOperacionalId: id, padraoVersaoId: id,
  rotulo: destino, segmentoIndice: 0, paradas: [parada],
});
const itinerario: ItinerarioLinha = { linha: "084", modal: "brt", segmentos: [], incluiParadas: true,
  padroesV2: [padrao("v-ida", "ida", "Alvorada", a), padrao("v-volta", "volta", "Santa Cruz", b)] };
const itinerarios = { linha: itinerario };
const now = Date.parse("2026-10-10T12:00:00Z");
const evento: EventoParadaDto = { eventId: "e1", linhaId: "linha", codigoLinha: "084",
  padraoOperacionalId: 'v-ida',
  modal: "onibus", tipoRota: "brt", sentidoId: "ida", padraoVersaoId: "v-ida", paradaId: a.paradaId,
  ocorrenciaParadaPadraoId: "oc-1", eventType: "ARRIVAL", source: "RealtimeEstimated",
  quality: "OperationalEstimate", isEstimated: true, secondsUntilEvent: 60 };

test("detalhe mantém parada explícita fora do raio de descoberta sem selecionar outra", () => {
  assert.equal(paradasElegiveisRadar([linha], "brt", itinerarios, { latitude: 1, longitude: 1 }).length, 0);
  const detalhe = paradaDetalhadaRadar(a, [linha], "brt", itinerarios);
  assert.equal(detalhe?.parada, a);
  assert.deepEqual(detalhe?.vinculos.map((v) => [v.linhaId, v.sentidoId, v.padraoVersaoId]),
    [["linha", "ida", "v-ida"]]);
  assert.equal(paradaDetalhadaRadar(stop("sem-vinculo", 0), [linha], "brt", itinerarios), null);
});

test("detalhe fica indisponível para linha sentido ou modal incompatível e recupera a mesma parada", () => {
  assert.equal(paradaDetalhadaRadar(a, [{ ...linha, ativa: false }], "brt", itinerarios), null);
  assert.equal(paradaDetalhadaRadar(a, [{ ...linha, modoSentido: "volta" }], "brt", itinerarios), null);
  assert.equal(paradaDetalhadaRadar(a, [linha], "trem", itinerarios), null);
  assert.equal(paradaDetalhadaRadar(null, [linha], "brt", itinerarios), null);
  assert.equal(paradaDetalhadaRadar(a, [linha], "brt", itinerarios)?.parada, a);
});

test("chave de consulta distingue parada modal sentido e versão sem depender da ordem dos vínculos", () => {
  const contexto = paradaDetalhadaRadar(a, [linha], "brt", itinerarios)!;
  const chave = chaveContextoRadar(contexto, "brt");
  assert.notEqual(chaveContextoRadar({ ...contexto, vinculos: contexto.vinculos.map(v => ({ ...v, padraoOperacionalId: 'nova-operacao' })) }, 'brt'), chave);
  assert.notEqual(chaveContextoRadar({ ...contexto, parada: b }, "brt"), chave);
  assert.notEqual(chaveContextoRadar(contexto, "todos"), chave);
  assert.notEqual(chaveContextoRadar({ ...contexto,
    vinculos: [{ ...contexto.vinculos[0], sentidoId: "volta" }] }, "brt"), chave);
  assert.notEqual(chaveContextoRadar({ ...contexto,
    vinculos: [{ ...contexto.vinculos[0], padraoVersaoId: "v2" }] }, "brt"), chave);
  const outra = { ...contexto.vinculos[0], linhaId: "outra" };
  assert.equal(chaveContextoRadar({ ...contexto, vinculos: [outra, ...contexto.vinculos] }, "brt"),
    chaveContextoRadar({ ...contexto, vinculos: [...contexto.vinculos, outra] }, "brt"));
});

test("seleciona apenas a parada elegível, não a mais próxima de linha não selecionada", () => {
  const naoSelecionada = { ...itinerario, padroesV2: [padrao("outra", "ida", "Outro destino", stop("mais-perto", 0))] };
  const candidatos = paradasElegiveisRadar([linha], "brt", { ...itinerarios, outra: naoSelecionada }, local);
  assert.deepEqual(candidatos.map((item) => item.parada.paradaId), [a.paradaId, b.paradaId]);
});
test("plataformas próximas não são unidas e sentidos permanecem distintos", () => {
  const candidatos = paradasElegiveisRadar([linha], "brt", itinerarios, local);
  assert.equal(candidatos.length, 2);
  assert.deepEqual(candidatos.map((item) => item.vinculos[0].destino), ["Alvorada", "Santa Cruz"]);
  const volta = paradasElegiveisRadar([{ ...linha, modoSentido: "volta" }], "brt", itinerarios, local);
  assert.deepEqual(volta.map((item) => item.parada.paradaId), [b.paradaId]);
});
test("ônibus e BRT respeitam modal, atividade, raio e localização", () => {
  assert.equal(paradasElegiveisRadar([linha], "onibus", itinerarios, local).length, 0);
  assert.equal(paradasElegiveisRadar([{ ...linha, ativa: false }], "brt", itinerarios, local).length, 0);
  assert.equal(paradasElegiveisRadar([linha], "brt", itinerarios, null).length, 0);
  assert.equal(paradasElegiveisRadar([linha], "brt", itinerarios, { latitude: 1, longitude: 1 }).length, 0);
  assert.equal(paradasElegiveisRadar([{ ...linha, modal: "onibus" }], "onibus", itinerarios, local).length, 2);
});
test("ocultar marcadores não impede uso das ocorrências estruturais", () => {
  assert.equal(paradasElegiveisRadar([linha], "brt", itinerarios, local).length, 2);
  assert.equal(linha.mostrarParadas, false);
});
test("automático aplica histerese e manual não é substituído após GPS", () => {
  const candidatos = paradasElegiveisRadar([linha], "brt", itinerarios, local);
  assert.equal(escolherParadaAutomatica(candidatos, b.paradaId)?.parada.paradaId, b.paradaId);
  assert.equal(resolverParadaMonitorada(candidatos, null, b.paradaId)?.parada.paradaId, b.paradaId);
  const movidos = paradasElegiveisRadar([linha], "brt", itinerarios, { latitude: 0.0001, longitude: 0 });
  assert.equal(resolverParadaMonitorada(movidos, null, b.paradaId)?.parada.paradaId, b.paradaId);
  assert.equal(resolverParadaMonitorada([], null, b.paradaId), null);
  assert.equal(resolverParadaMonitorada(candidatos, null)?.parada.paradaId, a.paradaId);
});
test("troca automática ocorre quando uma parada ganha mais que a margem de estabilidade", () => {
  const candidatos = paradasElegiveisRadar([linha], "brt", itinerarios, local);
  assert.equal(escolherParadaAutomatica([{ ...candidatos[0], distancia: 10 },
    { ...candidatos[1], distancia: 200 }], b.paradaId)?.parada.paradaId, a.paradaId);
});
test("filtro exige parada linha sentido versao e operacao sem inferir passagem pelo ETA", () => {
  const parada = paradasElegiveisRadar([linha], "brt", itinerarios, local)[0];
  const invalidos = [
    { ...evento, eventId: "outra-linha", linhaId: "inativa" },
    { ...evento, eventId: "outra-parada", paradaId: b.paradaId },
    { ...evento, eventId: "outro-sentido", sentidoId: "volta" },
    { ...evento, eventId: "outra-versao", padraoVersaoId: "v-volta" },
    { ...evento, eventId: "outra-operacao", padraoOperacionalId: 'outra' },
  ];
  assert.deepEqual(eventosValidosRadar([evento, evento, ...invalidos], parada, now, now).map((item) => item.eventId), ["e1"]);
  assert.equal(eventosValidosRadar([evento], parada, now, now + 61000).length, 1);
  assert.equal(eventosValidosRadar([evento], parada, now, now + 300001).length, 0);
  assert.equal(eventosValidosRadar([evento], null, now, now).length, 0);
});
test("sem ETA ou distância mantém indisponibilidade, sem inventar previsão", () => {
  const desconhecido = { ...evento, secondsUntilEvent: null, distanciaRestanteMetros: null };
  assert.equal(instanteEventoRadar(desconhecido, now), null);
  const parada = paradasElegiveisRadar([linha], "brt", itinerarios, local)[0];
  assert.equal(eventosValidosRadar([desconhecido], parada, now, now).length, 1);
});
test("horários programados e estimados usam datas sem mudar origem e qualidade", () => {
  const programado = { ...evento, modal: "trem" as const, tipoRota: "trem" as const,
    eventType: "DEPARTURE" as const, source: "ScheduledEstimated", quality: "ScheduleOnly",
    scheduledAt: "2026-10-10T12:03:00Z", secondsUntilEvent: null };
  assert.equal(instanteEventoRadar(programado, now), now + 180000);
  assert.equal(programado.eventType, "DEPARTURE");
  assert.equal(programado.quality, "ScheduleOnly");
  assert.equal(instanteEventoRadar({ ...programado, estimatedAt: "2026-10-10T12:02:00Z" }, now), now + 120000);
});
test("compacto prioriza tempos válidos e representa outra linha quando possível", () => {
  const segunda = { ...evento, eventId: "e2", secondsUntilEvent: 120 };
  const outra = { ...evento, eventId: "e3", linhaId: "outra", secondsUntilEvent: 180 };
  assert.deepEqual(doisEventosRadar([evento, segunda, outra], now).map((item) => item.eventId), ["e1", "e3"]);
  assert.deepEqual(doisEventosRadar([evento, segunda, { ...outra, secondsUntilEvent: null }], now)
    .map((item) => item.eventId), ["e1", "e2"]);
});
