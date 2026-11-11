import type { ChegadaParadaInfo } from "../components/mapaComponents/paradaSheet";
import type { LinhaSelecionadaInfo } from "../hooks/useMobilidadeRio";
import type { RailVehicleForMap } from "./railRealtime";
import type { VeiculoMapaRodoviario } from "./veiculosMapa";
import { localizarVeiculoDoEvento, rotuloQualidadeEvento, type EventoParadaDto } from "./eventosParada";
import { instanteEventoRadar, type ParadaRadar } from "./radarParada";
import type { StatusConsultaParada } from "../hooks/useConsultaEventosParada";

export function resumoConsultaParada(status: StatusConsultaParada, atualizadoEm: number | null) {
  const horario = atualizadoEm == null ? null : new Date(atualizadoEm)
    .toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const ultimaConsulta = horario ? `Última consulta às ${horario}.` : "Nenhuma consulta concluída.";
  if (status === "indisponivel") return "Consulta indisponível neste contexto.";
  if (status === "carregando") return "Consultando próximos veículos…";
  if (status === "atualizando") return `Atualizando… ${ultimaConsulta}`;
  if (status === "erro") return `Falha ao atualizar. ${ultimaConsulta}`;
  if (status === "pausado") return `Consulta pausada. ${ultimaConsulta}`;
  return ultimaConsulta;
}

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
      modal: evento.modal, tipoRota: evento.tipoRota,
      vehicleId: evento.vehicleId ?? evento.codigoVeiculo ?? null,
      railVehicleId: evento.railVehicleId ?? null, expectedRunId: evento.expectedRunId ?? null,
      scheduledStopId: evento.scheduledStopId ?? null, operationalStatus: evento.operationalStatus ?? null,
      trainCode: evento.trainCode ?? null, lineName: evento.lineName ?? null,
      sentidoId: evento.sentidoId, padraoOperacionalId: evento.padraoOperacionalId,
      ocorrenciaParadaPadraoId: evento.ocorrenciaParadaPadraoId,
      padraoVersaoId:evento.padraoVersaoId,paradaId:evento.paradaId,
      cor: linha?.cor ?? "#94A3B8", assinada: Boolean(linha),
      ordem: evento.codigoVeiculo ?? evento.trainCode ?? undefined,
      eventType: evento.eventType,
      nextVehiclesMode: evento.nextVehiclesMode ?? (evento.eventType === "DEPARTURE" ? "Departures" : "Arrivals"),
      referenciaDisponivel: localizarVeiculoDoEvento(evento, road, rail) != null,
      qualidade: rotuloQualidadeEvento(evento),
      etaSeg: instante == null || instante < agora ? null : Math.ceil((instante - agora) / 1000),
      distanciaMetros: evento.distanciaRestanteMetros != null && evento.distanciaRestanteMetros >= 0
        ? evento.distanciaRestanteMetros : null,
      horarioPrevistoLocal: instante == null || instante < agora ? null : new Date(instante).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      destino: evento.destinationName ?? trem?.destinationName ?? trem?.destination
        ?? parada?.vinculos.find((item) => item.linhaId === evento.linhaId && item.sentidoId === evento.sentidoId
          && item.padraoVersaoId === evento.padraoVersaoId)?.destino ?? null,
      plataforma: trem?.platformLabel ?? null,
      tipoServico: evento.modal === "trem" ? trem?.trainType ?? "Trem" : trem?.trainType ?? null,
    };
  });
}

export function textoEtaOperacional(status: string | null | undefined, eventType: "ARRIVAL" | "DEPARTURE",
  etaSeconds: number | null, horarioPrevistoLocal?: string | null, isRail = false): string {
  if (etaSeconds == null) return "Sem previsão";
  const minutos = Math.max(0, Math.ceil(etaSeconds / 60));
  const eta = `${minutos} min`;
  if (status === "Scheduled") return eventType === "DEPARTURE"
    ? `Partida programada${horarioPrevistoLocal ? ` às ${horarioPrevistoLocal}` : ` em ${eta}`}`
    : `Horário programado${horarioPrevistoLocal ? ` às ${horarioPrevistoLocal}` : ` em ${eta}`}`;
  if (status === "Estimated" || (status != null && status !== "Live") || (isRail && status == null)) return eventType === "DEPARTURE"
    ? `Partida estimada em ${eta}` : `Chegada estimada em ${eta}`;
  if (status === "Live") return eventType === "DEPARTURE"
    ? `Previsão atualizada de partida em ${eta}` : `Previsão atualizada de chegada em ${eta}`;
  return `${eventType === "DEPARTURE" ? "Sai" : "Chega"} em ${eta}`;
}
