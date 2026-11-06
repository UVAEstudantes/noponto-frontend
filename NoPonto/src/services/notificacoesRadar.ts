import { filtrarEventosPorContexto, type EventoParadaDto } from './eventosParada';
import { chegadasDoRadar } from './apresentacaoRadar';
import { instanteEventoRadar } from './radarParada';
import { passengerRadar, RADAR_PHYSICAL_MAX_MS } from './radarPassenger';
import type { TerminalRadarVehicle } from './terminalTracking';

export interface ContextoNotificacaoRadar {
  paradaId: string;
  paradaNome?: string;
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
  paradaNome?: string;
  terminal?: { id: string; linhaId: string; codigo: string; desde?: number }[];
  destaque: ItemNotificacaoRadar | null;
  prioridades: ItemNotificacaoRadar[];
  alternativas: ItemNotificacaoRadar[];
}
export interface DiagnosticoCandidatoRadar { eventoId: string; veiculoId: string | null; linhaId: string; motivo: string }
const positivo = (valor: number | undefined, padrao: number) =>
  valor != null && Number.isFinite(valor) && valor > 0 ? valor : padrao;

/** Relógio e instante de recebimento são explícitos: nenhum acesso a estado externo. */
export function filtrarCandidatosNotificacao(eventos: readonly EventoParadaDto[],
  contexto: ContextoNotificacaoRadar, recebidoEm: number, agora: number,
  politica: PoliticaNotificacaoRadar = {}, fisicos: readonly TerminalRadarVehicle[] = [],
  diagnosticar?: (d: DiagnosticoCandidatoRadar) => void): CandidatoNotificacaoRadar[] {
  const reportar = (e: EventoParadaDto, motivo: string) => diagnosticar?.({ eventoId: e.eventId,
    veiculoId: e.vehicleId ?? e.codigoVeiculo ?? null, linhaId: e.linhaId, motivo });
  const idade = positivo(politica.idadeMaximaMs, RADAR_PHYSICAL_MAX_MS);
  if (!Number.isFinite(agora) || !Number.isFinite(recebidoEm)
    || recebidoEm > agora || agora - recebidoEm > idade) { eventos.forEach(e => reportar(e, 'consulta_vencida_ou_invalida')); return []; }
  eventos.filter(e => !contexto.vinculos.some(v => v.linhaId === e.linhaId)).forEach(e => reportar(e, 'linha_nao_selecionada'));
  eventos.filter(e => contexto.vinculos.some(v => v.linhaId === e.linhaId)
    && !contexto.vinculos.some(v => v.linhaId === e.linhaId && v.padraoVersaoId === e.padraoVersaoId))
    .forEach(e => reportar(e, 'versao_incompativel'));
  const selecionados = filtrarEventosPorContexto([...eventos], { linhas:
    [...new Set(contexto.vinculos.map(v => v.linhaId))].map(linhaId => ({ linhaId,
      padraoVersaoIds: contexto.vinculos.filter(v => v.linhaId === linhaId).map(v => v.padraoVersaoId) })) });
  const ids = new Set<string>();
  const elegiveis = selecionados.filter(e => {
    if (e.paradaId !== contexto.paradaId || !contexto.vinculos.some(v =>
      v.linhaId === e.linhaId && v.sentidoId === e.sentidoId && v.padraoVersaoId === e.padraoVersaoId
      && (v.padraoOperacionalId == null || v.padraoOperacionalId === e.padraoOperacionalId))) {
        reportar(e, e.paradaId !== contexto.paradaId ? 'parada_incompativel' : !contexto.vinculos.some(v => v.linhaId === e.linhaId && v.sentidoId === e.sentidoId) ? 'sentido_incompativel' : 'padrao_operacional_incompativel'); return false;
      }
    if (e.lastRealtimeEvidenceUtc != null) {
      const evidencia = Date.parse(e.lastRealtimeEvidenceUtc);
      if (!Number.isFinite(evidencia) || evidencia > agora || agora - evidencia > idade) { reportar(e, 'gps_vencido_ou_invalido'); return false; }
    }
    return true;
  });
  // A presença física não cria candidatos; espera e viagem não confirmada não viram ETA.
  // A reconciliação física trata chegadas. Uma saída explicitamente prevista no
  // contrato permanece saída, inclusive para um veículo confirmado no terminal.
  const permitidos = [...passengerRadar(fisicos, elegiveis.filter(e => e.eventType === 'ARRIVAL'), contexto.paradaId, agora)
    .flatMap(r => r.kind === 'arrival' ? [r.arrival] : []), ...elegiveis.filter(e => e.eventType === 'DEPARTURE')];
  elegiveis.filter(e => !permitidos.includes(e)).forEach(e => reportar(e, 'presenca_terminal_sem_previsao_operacional'));
  return permitidos.flatMap(evento => {
    const veiculo = evento.vehicleId ?? evento.codigoVeiculo;
    if (fisicos.some(v => v.lineId === evento.linhaId && veiculo != null
      && v.order.trim().toUpperCase() === veiculo.trim().toUpperCase()
      && agora >= v.physicalAt && agora - v.physicalAt <= RADAR_PHYSICAL_MAX_MS
      && agora <= v.validUntil && !v.operationalConfirmed)) { reportar(evento, 'viagem_nao_confirmada'); return []; }
    const previstoEm = instanteEventoRadar(evento, recebidoEm);
    const motivo = previstoEm == null ? 'eta_indisponivel' : previstoEm < agora ? 'previsao_passada'
      : ids.has(evento.eventId) ? 'evento_duplicado' : previstoEm - agora > positivo(politica.janelaSegundos, 600) * 1000 ? 'fora_da_janela' : null;
    if (motivo) { reportar(evento, motivo); return []; }
    ids.add(evento.eventId);
    reportar(evento, 'elegivel');
    return [{ evento, previstoEm: previstoEm!, etaSeg: Math.ceil((previstoEm! - agora) / 1000) }];
  });
}

/** Vagas de exibição independentes da comparação temporal de conteúdo. */
export function selecionarItensNotificacao(conteudo: ConteudoNotificacaoRadar, limite = 3) {
  const prioritarias = new Set(conteudo.prioridades.map(i => i.linhaId));
  const ordenados = [...conteudo.prioridades, ...conteudo.alternativas].sort((a, b) =>
    a.previstoEm - b.previstoEm || a.id.localeCompare(b.id));
  const unicos = ordenados.filter((i, index, todos) => todos.findIndex(outro =>
    outro.id === i.id || (i.veiculoId != null && outro.linhaId === i.linhaId && outro.veiculoId === i.veiculoId)) === index);
  const itens: ItemNotificacaoRadar[] = [];
  const adicionar = (i?: ItemNotificacaoRadar) => { if (i && itens.length < limite && !itens.includes(i)) itens.push(i); };
  adicionar(unicos[0]);
  adicionar(unicos.find(i => prioritarias.has(i.linhaId)));
  // Proximidade primeiro; diversidade desempata a mesma previsão.
  while (itens.length < limite) {
    const restantes = unicos.filter(i => !itens.includes(i));
    restantes.sort((a, b) => a.previstoEm - b.previstoEm
      || Number(itens.some(i => i.linhaId === a.linhaId)) - Number(itens.some(i => i.linhaId === b.linhaId))
      || a.id.localeCompare(b.id));
    if (!restantes.length) break;
    adicionar(restantes[0]);
  }
  itens.sort((a, b) => a.previstoEm - b.previstoEm || a.id.localeCompare(b.id));
  return { itens, adicionais: unicos.length - itens.length };
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
  return { paradaNome: contexto.paradaNome, chaveContexto: JSON.stringify([contexto.paradaId,
    contexto.vinculos.map(v => [v.linhaId, v.sentidoId, v.padraoVersaoId, v.padraoOperacionalId ?? null]).sort(),
    [...new Set(contexto.linhasPrioritarias)].sort()]),
    destaque: classificados.destaque ? item(classificados.destaque) : null,
    prioridades: classificados.prioridades.map(item), alternativas: classificados.alternativas.map(item) };
}

/** N2 deve guardar o último conteúdo aceito; oscilações ignoradas não movem a referência. */
export function compararConteudoNotificacao(anterior: ConteudoNotificacaoRadar | null,
  atual: ConteudoNotificacaoRadar, politica: PoliticaNotificacaoRadar = {}):
  { relevante: boolean; motivo: 'inicial' | 'contexto' | 'candidatos' | 'previsao' | 'sem-mudanca' } {
  if (!anterior) return { relevante: atual.destaque != null || !!atual.terminal?.length, motivo: 'inicial' };
  if (anterior.chaveContexto !== atual.chaveContexto) return { relevante: true, motivo: 'contexto' };
  if (JSON.stringify(anterior.terminal?.map(i => [i.id, i.desde])) !== JSON.stringify(atual.terminal?.map(i => [i.id, i.desde])))
    return { relevante: true, motivo: 'candidatos' };
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
