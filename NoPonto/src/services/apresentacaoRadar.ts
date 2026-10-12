import type { ChegadaParadaInfo } from "../components/mapaComponents/paradaSheet";
import type { LinhaSelecionadaInfo } from "../hooks/useMobilidadeRio";
import type { RailVehicleForMap } from "./railRealtime";
import type { VeiculoMapaRodoviario } from "./veiculosMapa";
import { localizarVeiculoDoEvento, rotuloQualidadeEvento, type EventoParadaDto } from "./eventosParada";
import { instanteEventoRadar, type ParadaRadar } from "./radarParada";

export function chegadasDoRadar(eventos: readonly EventoParadaDto[], parada: ParadaRadar | null,
  linhas: readonly LinhaSelecionadaInfo[], recebidoEm: number, agora: number,
  road: readonly VeiculoMapaRodoviario[], rail: readonly RailVehicleForMap[]): ChegadaParadaInfo[] {
  return eventos.map((evento) => {
    const linha = linhas.find((item) => item.linhaId === evento.linhaId);
    const instante = instanteEventoRadar(evento, recebidoEm);
    const trem = rail.find((item) => (evento.railVehicleId && item.railVehicleId === evento.railVehicleId)
      || (evento.expectedRunId && item.railRunId === evento.expectedRunId));
    return {
      id: evento.eventId, linhaId: evento.linhaId, codigo: evento.codigoLinha,
      cor: linha?.cor ?? "#94A3B8", assinada: Boolean(linha),
      ordem: evento.codigoVeiculo ?? evento.trainCode ?? undefined,
      eventType: evento.eventType,
      nextVehiclesMode: evento.nextVehiclesMode ?? (evento.eventType === "DEPARTURE" ? "Departures" : "Arrivals"),
      referenciaDisponivel: localizarVeiculoDoEvento(evento, road, rail) != null,
      qualidade: rotuloQualidadeEvento(evento),
      etaSeg: instante == null ? null : Math.max(0, Math.ceil((instante - agora) / 1000)),
      distanciaMetros: evento.distanciaRestanteMetros != null && evento.distanciaRestanteMetros >= 0
        ? evento.distanciaRestanteMetros : null,
      horarioPrevistoLocal: instante == null ? null : new Date(instante).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      destino: trem?.destinationName ?? trem?.destination
        ?? parada?.vinculos.find((item) => item.linhaId === evento.linhaId && item.sentidoId === evento.sentidoId
          && item.padraoVersaoId === evento.padraoVersaoId)?.destino ?? null,
      plataforma: trem?.platformLabel ?? null,
      tipoServico: trem?.trainType ?? null,
    };
  });
}
