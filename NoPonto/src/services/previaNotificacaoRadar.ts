import type { LinhaSelecionadaInfo } from '../hooks/useMobilidadeRio';
import type { useConsultaEventosParada } from '../hooks/useConsultaEventosParada';
import type { ItinerarioLinha } from '../types/transporte';
import type { ItinerarioPadraoVersaoV2 } from '../types/estruturaV2';
import { terminalRadarVehicles, type TerminalPresence } from './terminalTracking';
import { chaveContextoRadar, paradaDetalhadaRadar, type ParadaRadar } from './radarParada';
import { filtrarCandidatosNotificacao, produzirConteudoNotificacao,
  selecionarItensNotificacao, type DiagnosticoCandidatoRadar, type ContextoNotificacaoRadar, type PoliticaNotificacaoRadar } from './notificacoesRadar';

export interface EntradaPreviaNotificacaoRadar {
  parada: ParadaRadar | null;
  modal: string;
  consulta: Pick<ReturnType<typeof useConsultaEventosParada>, 'eventos' | 'recebidoEm' | 'agora'
    | 'temResposta' | 'contextoConsulta' | 'statusConsulta'>;
  linhas: readonly LinhaSelecionadaInfo[];
  itinerarios: Readonly<Record<string, ItinerarioLinha | null>>;
  realtime: Readonly<Record<string, ItinerarioPadraoVersaoV2>>;
  presencasFisicas: readonly TerminalPresence[];
  linhasPrioritarias?: readonly string[];
  politica?: PoliticaNotificacaoRadar;
  diagnosticar?: (diagnostico: DiagnosticoCandidatoRadar) => void;
  veiculosObservados?: readonly { linhaId: string; veiculoId: string }[];
}

/** Adapta somente snapshots já consultados. Não consulta, agenda ou envia nada. */
export function criarPreviaNotificacaoRadar(entrada: EntradaPreviaNotificacaoRadar) {
  const { parada, modal, consulta, linhas, itinerarios, realtime, presencasFisicas,
    linhasPrioritarias = [], politica = {} } = entrada;
  if (entrada.diagnosticar) {
    const observados = [...(entrada.veiculosObservados ?? []), ...presencasFisicas.map(v => ({ linhaId: v.lineId, veiculoId: v.order }))];
    observados.filter((v, index, todos) => todos.findIndex(i => i.linhaId === v.linhaId && i.veiculoId === v.veiculoId) === index)
      .filter(v => !consulta.eventos.some(e => e.linhaId === v.linhaId
        && (e.vehicleId ?? e.codigoVeiculo)?.trim().toUpperCase() === v.veiculoId.trim().toUpperCase()))
      .forEach(v => entrada.diagnosticar?.({ eventoId: `mapa:${v.linhaId}:${v.veiculoId}`, veiculoId: v.veiculoId,
        linhaId: v.linhaId, motivo: 'mapa_sem_evento_da_parada_ETA_nao_comparavel' }));
  }
  if (!parada || !consulta.temResposta || consulta.statusConsulta === 'pausado'
    || consulta.statusConsulta === 'indisponivel'
    || consulta.contextoConsulta !== chaveContextoRadar(parada, modal)) {
    consulta.eventos.forEach(e => entrada.diagnosticar?.({ eventoId: e.eventId, veiculoId: e.vehicleId ?? e.codigoVeiculo ?? null,
      linhaId: e.linhaId, motivo: 'contexto_indisponivel_ou_consulta_pausada' }));
    return null;
  }

  // O Radar também inclui linhas piloto não selecionadas e todos os seus sentidos.
  // Reutiliza a seleção existente e cruza com o contexto efetivamente consultado.
  const selecionada = paradaDetalhadaRadar(parada.parada, linhas, modal, itinerarios, realtime);
  const semMetadado = new Set<string>();
  consulta.eventos.filter(e => !selecionada?.vinculos.some(v => v.linhaId === e.linhaId && v.sentidoId === e.sentidoId && v.padraoVersaoId === e.padraoVersaoId))
    .forEach(e => entrada.diagnosticar?.({ eventoId: e.eventId, veiculoId: e.vehicleId ?? e.codigoVeiculo ?? null,
      linhaId: e.linhaId, motivo: 'linha_sentido_ou_versao_fora_da_selecao' }));
  const vinculos = (selecionada?.vinculos ?? []).filter(v => parada.vinculos.some(p =>
    p.linhaId === v.linhaId && p.sentidoId === v.sentidoId && p.padraoVersaoId === v.padraoVersaoId))
    .flatMap(vinculo => {
      const estrutura = Object.values(realtime).find(p => p.linhaId === vinculo.linhaId
        && p.sentidoId === vinculo.sentidoId && p.padraoVersaoId === vinculo.padraoVersaoId)
        ?? itinerarios[vinculo.linhaId]?.padroesV2?.find(p =>
          p.sentidoId === vinculo.sentidoId && p.padraoVersaoId === vinculo.padraoVersaoId);
      // Sem metadado do padrão, não é possível garantir compatibilidade operacional.
      if (!estrutura?.padraoOperacionalId) consulta.eventos.filter(e => e.linhaId === vinculo.linhaId && e.padraoVersaoId === vinculo.padraoVersaoId)
        .forEach(e => { semMetadado.add(e.eventId); entrada.diagnosticar?.({ eventoId: e.eventId, veiculoId: e.vehicleId ?? e.codigoVeiculo ?? null, linhaId: e.linhaId, motivo: 'metadado_operacional_ausente' }); });
      return estrutura?.padraoOperacionalId
        ? [{ ...vinculo, padraoOperacionalId: estrutura.padraoOperacionalId }] : [];
    });
  if (!vinculos.length) return null;
  const contexto: ContextoNotificacaoRadar = {
    paradaId: parada.parada.paradaId, paradaNome: parada.parada.nome, vinculos,
    linhasPrioritarias: linhasPrioritarias.filter(id => vinculos.some(v => v.linhaId === id)),
  };
  // Evidência física original: não transforma presença ou intervalo físico em ETA.
  const candidatos = filtrarCandidatosNotificacao(consulta.eventos, contexto,
    consulta.recebidoEm, consulta.agora, politica, presencasFisicas,
    entrada.diagnosticar ? d => entrada.diagnosticar!({ ...d, motivo: semMetadado.has(d.eventoId) ? 'metadado_operacional_ausente' : d.motivo }) : undefined);
  const conteudo = produzirConteudoNotificacao(contexto, candidatos, consulta.recebidoEm, consulta.agora);
  const { itens } = selecionarItensNotificacao(conteudo);
  candidatos.forEach(c => entrada.diagnosticar?.({ eventoId: c.evento.eventId,
    veiculoId: c.evento.vehicleId ?? c.evento.codigoVeiculo ?? null, linhaId: c.evento.linhaId,
    motivo: itens.some(i => i.id === c.evento.eventId) ? 'incluido_na_notificacao' : 'elegivel_fora_das_tres_vagas' }));
  presencasFisicas.filter(v => !consulta.eventos.some(e => e.linhaId === v.lineId
    && (e.vehicleId ?? e.codigoVeiculo)?.trim().toUpperCase() === v.order.trim().toUpperCase()))
    .forEach(v => entrada.diagnosticar?.({ eventoId: `mapa:${v.lineId}:${v.order}`, veiculoId: v.order, linhaId: v.lineId,
      motivo: v.state === 'A caminho' || v.state === 'Saindo do terminal' ? 'mapa_estimativa_fisica_sem_evento_da_parada' : 'presenca_fisica_sem_evento_da_parada' }));
  // Espera física não vira chegada/saída; exige origem, padrão e frescor já validados.
  if (consulta.agora >= consulta.recebidoEm && consulta.agora - consulta.recebidoEm <= (politica.idadeMaximaMs ?? 300000)) {
    conteudo.terminal = terminalRadarVehicles(presencasFisicas, contexto.paradaId, vinculos, [], consulta.agora)
      .filter(v => v.state === 'No terminal' && v.terminalId === contexto.paradaId
        && (v.knownPattern != null || v.corridors.every(c => vinculos.some(l => l.linhaId === v.lineId && l.padraoVersaoId === c.pattern))))
      .map(v => ({ id: v.key, linhaId: v.lineId, codigo: v.code,
        desde: v.dwellSince != null && Number.isFinite(v.dwellSince) && v.dwellSince <= v.physicalAt ? v.dwellSince : undefined }))
      .filter((v, index, todos) => todos.findIndex(i => i.id === v.id) === index)
      .sort((a, b) => a.id.localeCompare(b.id));
    conteudo.terminal.forEach(t => {
      const v = presencasFisicas.find(v => v.key === t.id)!;
      entrada.diagnosticar?.({ eventoId: `mapa:${v.lineId}:${v.order}`, linhaId: v.lineId, veiculoId: v.order, motivo: 'presenca_terminal_exibida_sem_ETA' });
    });
  }
  return { contexto, candidatos, conteudo };
}

export type PreviaNotificacaoRadar = ReturnType<typeof criarPreviaNotificacaoRadar>;
