import type { LinhaSelecionadaInfo } from "../hooks/useMobilidadeRio";
import type { ItinerarioLinha, Parada } from "../types/transporte";
import { rotuloSentidoPublico, type ItinerarioPadraoVersaoV2 } from "../types/estruturaV2";
import type { EventoParadaDto } from "./eventosParada";

export const RAIO_RADAR_METROS = 1000;
export const HISTERESE_RADAR_METROS = 60;
export interface VinculoParada { linhaId: string; sentidoId: string; padraoVersaoId: string; destino: string }
export interface ParadaRadar { parada: Parada; distancia: number; vinculos: VinculoParada[] }
export interface CoordenadasRadar { latitude: number; longitude: number }

export function distanciaGeografica(a: CoordenadasRadar, b: CoordenadasRadar) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad)
    * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function paradasElegiveisRadar(linhas: readonly LinhaSelecionadaInfo[], modal: string,
  itinerarios: Record<string, ItinerarioLinha | null>, local: CoordenadasRadar | null,
  realtime: Record<string, ItinerarioPadraoVersaoV2> = {}, raio = RAIO_RADAR_METROS): ParadaRadar[] {
  if (!local) return [];
  const porId = new Map<string, ParadaRadar>();
  for (const linha of linhas.filter((item) => item.ativa && (modal === "todos" || item.modal === modal))) {
    const padroes = itinerarios[linha.linhaId]?.padroesV2 ?? [];
    const sentidos = [...new Set(padroes.map((item) => item.sentidoId))];
    const sentido = linha.modoSentido === "ida" ? sentidos[0]
      : linha.modoSentido === "volta" ? sentidos[1] : null;
    if (linha.modoSentido !== "ambos" && !sentido) continue;
    const estruturas = Object.values(realtime).filter((item) => item.linhaId === linha.linhaId);
    const todos = [...padroes, ...estruturas.map((item) => ({
      sentidoId: item.sentidoId, sentidoNome: rotuloSentidoPublico(item),
      padraoVersaoId: item.padraoVersaoId,
      paradas: item.ocorrencias.map((ocorrencia) => ({ ...ocorrencia, codigo: ocorrencia.codigoParada })),
    }))];
    for (const padrao of todos.filter((item) => !sentido || item.sentidoId === sentido)) {
      for (const parada of padrao.paradas) {
        const distancia = distanciaGeografica(local, parada);
        if (!Number.isFinite(distancia) || distancia > raio) continue;
        const candidato: ParadaRadar = porId.get(parada.paradaId) ?? { parada, distancia, vinculos: [] };
        if (!candidato.vinculos.some((item) => item.linhaId === linha.linhaId
          && item.padraoVersaoId === padrao.padraoVersaoId && item.sentidoId === padrao.sentidoId)) {
          candidato.vinculos.push({ linhaId: linha.linhaId, sentidoId: padrao.sentidoId,
            padraoVersaoId: padrao.padraoVersaoId, destino: padrao.sentidoNome });
        }
        porId.set(parada.paradaId, candidato);
      }
    }
  }
  return [...porId.values()].sort((a, b) => a.distancia - b.distancia
    || a.parada.paradaId.localeCompare(b.parada.paradaId));
}

export function escolherParadaAutomatica(candidatos: readonly ParadaRadar[], atualId?: string | null) {
  const proxima = candidatos[0];
  const atual = candidatos.find((item) => item.parada.paradaId === atualId);
  return atual && proxima && atual.distancia - proxima.distancia < HISTERESE_RADAR_METROS
    ? atual : proxima ?? null;
}

export function resolverParadaMonitorada(candidatos: readonly ParadaRadar[], atualId: string | null,
  manualId?: string | null) {
  return manualId ? candidatos.find((item) => item.parada.paradaId === manualId) ?? null
    : escolherParadaAutomatica(candidatos, atualId);
}

export function instanteEventoRadar(evento: EventoParadaDto, recebidoEm: number): number | null {
  const data = evento.estimatedAt ?? evento.scheduledAt;
  if (data) {
    const instante = Date.parse(data);
    if (Number.isFinite(instante)) return instante;
  }
  return evento.secondsUntilEvent == null || !Number.isFinite(evento.secondsUntilEvent)
    ? null : recebidoEm + evento.secondsUntilEvent * 1000;
}

export function eventosValidosRadar(eventos: readonly EventoParadaDto[], parada: ParadaRadar | null,
  recebidoEm: number, agora: number): EventoParadaDto[] {
  if (!parada) return [];
  const ids = new Set<string>();
  return eventos.filter((evento) => {
    const instante = instanteEventoRadar(evento, recebidoEm);
    if (instante != null && instante < agora) return false;
    if (evento.paradaId !== parada.parada.paradaId || ids.has(evento.eventId)) return false;
    if (!parada.vinculos.some((item) => item.linhaId === evento.linhaId
      && item.sentidoId === evento.sentidoId && item.padraoVersaoId === evento.padraoVersaoId)) return false;
    ids.add(evento.eventId);
    return true;
  }).sort((a, b) => (instanteEventoRadar(a, recebidoEm) ?? Infinity)
    - (instanteEventoRadar(b, recebidoEm) ?? Infinity) || a.eventId.localeCompare(b.eventId));
}

export function doisEventosRadar(eventos: readonly EventoParadaDto[], recebidoEm = Date.now()) {
  if (!eventos.length) return [];
  const comTempo = eventos.filter((item) => instanteEventoRadar(item, recebidoEm) != null);
  const disponiveis = comTempo.length >= 2 ? comTempo : eventos;
  const outro = disponiveis.find((item) => item.linhaId !== disponiveis[0].linhaId);
  return [disponiveis[0], ...(outro ? [outro] : disponiveis.slice(1, 2))];
}
