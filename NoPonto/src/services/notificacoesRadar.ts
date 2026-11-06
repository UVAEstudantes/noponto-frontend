import { filtrarEventosPorContexto, type EventoParadaDto } from './eventosParada';
import { chegadasDoRadar } from './apresentacaoRadar';
import { instanteEventoRadar } from './radarParada';
import { passengerRadar, RADAR_PHYSICAL_MAX_MS } from './radarPassenger';
import type { TerminalRadarVehicle } from './terminalTracking';

export interface ContextoNotificacaoRadar {
  paradaId: string;
  /** Somente vínculos das linhas selecionadas, no sentido monitorado. */
  vinculos: readonly { linhaId: string; sentidoId: string; padraoVersaoId: string;
    padraoOperacionalId?: string | null }[];
  linhasPrioritarias: readonly string[];
}
export interface PoliticaNotificacaoRadar {
  /** Padrão: 600 segundos, incluindo o limite. */
  janelaSegundos?: number;
  /** Padrão: RADAR_PHYSICAL_MAX_MS (5 minutos), também para a consulta recebida. */
  idadeMaximaMs?: number;
  /** Padrão: 60 segundos no horário previsto, sem contar a passagem do tempo. */
  mudancaMinimaSegundos?: number;
}
export interface CandidatoNotificacaoRadar {
  evento: EventoParadaDto;
  previstoEm: number;
  etaSeg: number;
}
export interface ItemNotificacaoRadar {
  id: string;
  linhaId: string;
  codigo: string;
  veiculoId: string | null;
  previstoEm: number;
  etaSeg: number;
  tipo: EventoParadaDto['eventType'];
  qualidade: string;
  confirmacao: 'previsao';
}
export interface ConteudoNotificacaoRadar {
  chaveContexto: string;
  destaque: ItemNotificacaoRadar | null;
  prioridades: ItemNotificacaoRadar[];
  alternativas: ItemNotificacaoRadar[];
}
const positivo = (valor: number | undefined, padrao: number) =>
  valor != null && Number.isFinite(valor) && valor > 0 ? valor : padrao;

/** Relógio e instante de recebimento são explícitos: nenhum acesso a estado externo. */
export function filtrarCandidatosNotificacao(eventos: readonly EventoParadaDto[],
  contexto: ContextoNotificacaoRadar, recebidoEm: number, agora: number,
  politica: PoliticaNotificacaoRadar = {}, fisicos: readonly TerminalRadarVehicle[] = []): CandidatoNotificacaoRadar[] {
  const idade = positivo(politica.idadeMaximaMs, RADAR_PHYSICAL_MAX_MS);
  if (!Number.isFinite(agora) || !Number.isFinite(recebidoEm)
    || recebidoEm > agora || agora - recebidoEm > idade) return [];
  const selecionados = filtrarEventosPorContexto([...eventos], { linhas:
    [...new Set(contexto.vinculos.map(v => v.linhaId))].map(linhaId => ({ linhaId,
      padraoVersaoIds: contexto.vinculos.filter(v => v.linhaId === linhaId).map(v => v.padraoVersaoId) })) });
  const ids = new Set<string>();
  const elegiveis = selecionados.filter(e => {
    if (e.paradaId !== contexto.paradaId || !contexto.vinculos.some(v =>
      v.linhaId === e.linhaId && v.sentidoId === e.sentidoId && v.padraoVersaoId === e.padraoVersaoId
      && (v.padraoOperacionalId == null || v.padraoOperacionalId === e.padraoOperacionalId))) return false;
    if (e.lastRealtimeEvidenceUtc != null) {
      const evidencia = Date.parse(e.lastRealtimeEvidenceUtc);
      if (!Number.isFinite(evidencia) || evidencia > agora || agora - evidencia > idade) return false;
    }
    return true;
  });
  // A presença física não cria candidatos; espera e viagem não confirmada não viram ETA.
  const permitidos = passengerRadar(fisicos, elegiveis, contexto.paradaId, agora)
    .flatMap(r => r.kind === 'arrival' ? [r.arrival] : []);
  return permitidos.flatMap(evento => {
    const veiculo = evento.vehicleId ?? evento.codigoVeiculo;
    if (fisicos.some(v => v.lineId === evento.linhaId && veiculo != null
      && v.order.trim().toUpperCase() === veiculo.trim().toUpperCase()
      && agora >= v.physicalAt && agora - v.physicalAt <= RADAR_PHYSICAL_MAX_MS
      && agora <= v.validUntil && !v.operationalConfirmed)) return [];
    const previstoEm = instanteEventoRadar(evento, recebidoEm);
    if (previstoEm == null || previstoEm < agora || ids.has(evento.eventId)
      || previstoEm - agora > positivo(politica.janelaSegundos, 600) * 1000) return [];
    ids.add(evento.eventId);
    return [{ evento, previstoEm, etaSeg: Math.ceil((previstoEm - agora) / 1000) }];
  });
}

export function classificarCandidatosNotificacao(candidatos: readonly CandidatoNotificacaoRadar[],
  linhasPrioritarias: readonly string[]) {
  const ordenados = [...candidatos].sort((a, b) => a.previstoEm - b.previstoEm
    || a.evento.eventId.localeCompare(b.evento.eventId));
  const prioridades = ordenados.filter(c => linhasPrioritarias.includes(c.evento.linhaId));
  const alternativas = ordenados.filter(c => !linhasPrioritarias.includes(c.evento.linhaId));
  return { prioridades, alternativas, destaque: prioridades[0] ?? alternativas[0] ?? null };
}

export function produzirConteudoNotificacao(contexto: ContextoNotificacaoRadar,
  candidatos: readonly CandidatoNotificacaoRadar[], recebidoEm: number, agora: number): ConteudoNotificacaoRadar {
  const classificados = classificarCandidatosNotificacao(candidatos, contexto.linhasPrioritarias);
  const item = (c: CandidatoNotificacaoRadar): ItemNotificacaoRadar => {
    const [apresentacao] = chegadasDoRadar([c.evento], null, [], recebidoEm, agora, [], []);
    return { id: c.evento.eventId, linhaId: c.evento.linhaId, codigo: apresentacao.codigo,
      veiculoId: c.evento.vehicleId ?? c.evento.railVehicleId ?? c.evento.expectedRunId
        ?? c.evento.codigoVeiculo ?? null,
      previstoEm: c.previstoEm, etaSeg: c.etaSeg, tipo: c.evento.eventType,
      qualidade: apresentacao.qualidade, confirmacao: 'previsao' };
  };
  return { chaveContexto: JSON.stringify([contexto.paradaId,
    contexto.vinculos.map(v => [v.linhaId, v.sentidoId, v.padraoVersaoId, v.padraoOperacionalId ?? null]).sort(),
    [...new Set(contexto.linhasPrioritarias)].sort()]),
    destaque: classificados.destaque ? item(classificados.destaque) : null,
    prioridades: classificados.prioridades.map(item), alternativas: classificados.alternativas.map(item) };
}

/** N2 deve guardar o último conteúdo aceito; oscilações ignoradas não movem a referência. */
export function compararConteudoNotificacao(anterior: ConteudoNotificacaoRadar | null,
  atual: ConteudoNotificacaoRadar, politica: PoliticaNotificacaoRadar = {}):
  { relevante: boolean; motivo: 'inicial' | 'contexto' | 'candidatos' | 'previsao' | 'sem-mudanca' } {
  if (!anterior) return { relevante: atual.destaque != null, motivo: 'inicial' };
  if (anterior.chaveContexto !== atual.chaveContexto) return { relevante: true, motivo: 'contexto' };
  const antes = [...anterior.prioridades, ...anterior.alternativas];
  const depois = [...atual.prioridades, ...atual.alternativas];
  if (antes.length !== depois.length || antes.some(a => !depois.some(b => b.id === a.id)))
    return { relevante: true, motivo: 'candidatos' };
  if (depois.some(b => {
    const a = antes.find(a => a.id === b.id)!;
    return a.tipo !== b.tipo || a.qualidade !== b.qualidade || a.veiculoId !== b.veiculoId
      || Math.abs(a.previstoEm - b.previstoEm) >= positivo(politica.mudancaMinimaSegundos, 60) * 1000;
  })) return { relevante: true, motivo: 'previsao' };
  return { relevante: false, motivo: 'sem-mudanca' };
}
