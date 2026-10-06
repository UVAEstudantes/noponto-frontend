import { api } from "./api";
import type { RailVehicleForMap } from "./railRealtime";
import type { VeiculoMapaRodoviario } from "./veiculosMapa";
import { rotuloConfianca } from "./confiancaApresentacao";

export type TipoEventoParada = "ARRIVAL" | "DEPARTURE";

export interface EventoParadaDto {
  eventId: string; eventType: TipoEventoParada; linhaId: string; codigoLinha: string;
  modal: "onibus" | "trem"; tipoRota: "onibus" | "brt" | "trem"; sentidoId: string;
  padraoOperacionalId?: string | null; padraoVersaoId: string; paradaId: string;
  ocorrenciaParadaPadraoId: string; vehicleId?: string | null; railVehicleId?: string | null;
  expectedRunId?: string | null; codigoVeiculo?: string | null; trainCode?: string | null;
  scheduledAt?: string | null; estimatedAt?: string | null; secondsUntilEvent?: number | null;
  source: string; quality: string; lastRealtimeEvidenceUtc?: string | null;
  isEstimated: boolean; distanciaRestanteMetros?: number | null;
  stationRole?: "Origin" | "Intermediate" | "Destination";
  nextVehiclesMode?: "Departures" | "Arrivals";
}

export interface ContextoEventosParada {
  linhas: { linhaId: string; padraoVersaoIds: string[] }[];
}

export function filtrarEventosPorContexto(
  eventos: EventoParadaDto[],
  contexto: ContextoEventosParada,
) {
  const linhas = new Map(
    contexto.linhas.map((linha) => [linha.linhaId, new Set(linha.padraoVersaoIds)]),
  );
  return eventos.filter((evento) => {
    const padroes = linhas.get(evento.linhaId);
    if (!padroes) return false;
    return padroes.size === 0 || padroes.has(evento.padraoVersaoId);
  });
}

export async function buscarEventosParada(paradaId: string) {
  const result = await api.get<EventoParadaDto[]>(`/paradas/${paradaId}/eventos`);
  if (!result.ok) throw new Error(result.error ?? "Falha ao carregar eventos da parada");
  return ordenarEventosParada(result.data ?? []);
}

export function ordenarEventosParada(eventos: EventoParadaDto[]) {
  const time = (event: EventoParadaDto) => {
    const value = event.estimatedAt ?? event.scheduledAt;
    if (value) return new Date(value).getTime();
    return event.secondsUntilEvent == null ? Number.POSITIVE_INFINITY : event.secondsUntilEvent * 1000;
  };
  return [...eventos].sort((a, b) => time(a) - time(b) || a.eventId.localeCompare(b.eventId));
}

export function rotuloQualidadeEvento(event: EventoParadaDto) {
  return rotuloConfianca(event.source, event.quality);
}

export function modoListaEventos(eventos: readonly EventoParadaDto[]) {
  return eventos.length > 0
    && eventos.every((event) => event.nextVehiclesMode === "Departures")
    ? "Departures" as const
    : "Arrivals" as const;
}

export type ReferenciaVeiculoRenderizado =
  | { runtime: "rodoviario"; ordem: string }
  | { runtime: "ferroviario"; idVisual: string; railVehicleId: string; railRunId: string };

export function localizarVeiculoDoEvento(event: EventoParadaDto,
  road: readonly VeiculoMapaRodoviario[], rail: readonly RailVehicleForMap[]): ReferenciaVeiculoRenderizado | null {
  if (event.modal === "trem") {
    const found = rail.find((vehicle) =>
      (event.railVehicleId != null && vehicle.railVehicleId === event.railVehicleId)
      || (event.expectedRunId != null && vehicle.railRunId === event.expectedRunId));
    return found ? { runtime: "ferroviario", idVisual: `rail:${found.railVehicleId || found.railRunId}`,
      railVehicleId: found.railVehicleId, railRunId: found.railRunId } : null;
  }
  const identity = event.vehicleId ?? event.codigoVeiculo;
  const found = identity ? road.find((vehicle) => vehicle.ordem === identity) : null;
  return found ? { runtime: "rodoviario", ordem: found.ordem } : null;
}
