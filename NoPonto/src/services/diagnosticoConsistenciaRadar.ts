import { chegadasDoRadar } from './apresentacaoRadar';
import { instanteEventoRadar, motivoExclusaoEventoRadar, type ParadaRadar } from './radarParada';
import type { EventoParadaDto } from './eventosParada';
import { passengerRadar } from './radarPassenger';
import { terminalRadarVehicles, type TerminalPresence } from './terminalTracking';
import type { PreviaNotificacaoRadar } from './previaNotificacaoRadar';

export interface SnapshotDiagnosticoRadar {
  parada: ParadaRadar | null;
  contextoConsulta: string;
  statusConsulta: string;
  eventos: readonly EventoParadaDto[];
  eventosRecebidos?: readonly EventoParadaDto[];
  recebidoEm: number;
  agora: number;
  presencasFisicas?: readonly TerminalPresence[];
}

/** Sob demanda: no máximo 12 eventos por representação, sem consulta ou log próprios. */
export function compararSnapshotsRadar(compacto: SnapshotDiagnosticoRadar | null,
  completo: SnapshotDiagnosticoRadar, espera: { paradaId: string | null; estado: string; previa: PreviaNotificacaoRadar },
  fisicos: readonly TerminalPresence[] = []) {
  const referencia = completo.agora;
  function representar(s: SnapshotDiagnosticoRadar, limite: number) {
    const chegadas = chegadasDoRadar(s.eventos, s.parada, [], s.recebidoEm, s.agora, [], []);
    const terminal = terminalRadarVehicles(s.presencasFisicas ?? fisicos, s.parada?.parada.paradaId, s.parada?.vinculos ?? [], chegadas, s.agora);
    const linhas = passengerRadar(terminal, chegadas, s.parada?.parada.paradaId, s.agora, limite);
    const originais = s.eventosRecebidos ?? s.eventos;
    return {
      paradaId: s.parada?.parada.paradaId ?? null, contexto: s.contextoConsulta,
      vinculos: s.parada?.vinculos ?? [], status: s.statusConsulta,
      recebidoEm: s.recebidoEm, referenciaEm: s.agora, totalRecebidos: originais.length,
      exibidos: linhas.map(r => r.kind === 'physical'
        ? { tipo: 'presenca_fisica', id: r.vehicle.key, veiculoId: r.vehicle.order, estado: r.vehicle.state, gpsEm: r.vehicle.physicalAt }
        : { tipo: 'evento_operacional', id: r.arrival.id, veiculoId: r.arrival.vehicleId, etaSeg: r.arrival.etaSeg }),
      eventos: originais.slice(0, 12).map(e => {
        const previstoEm = instanteEventoRadar(e, s.recebidoEm);
        const exibido = chegadas.find(c => c.id === e.eventId);
        return { eventId: e.eventId, vehicleId: e.vehicleId ?? e.codigoVeiculo ?? e.railVehicleId ?? null,
          viagemId: e.expectedRunId ?? null, ocorrenciaId: e.ocorrenciaParadaPadraoId,
          paradaId: e.paradaId, sentidoId: e.sentidoId, padraoOperacionalId: e.padraoOperacionalId,
          padraoVersaoId: e.padraoVersaoId, tipo: e.eventType, etaOriginal: e.secondsUntilEvent,
          estimatedAt: e.estimatedAt, scheduledAt: e.scheduledAt, evidenciaEm: e.lastRealtimeEvidenceUtc,
          previstoEm, etaApresentado: exibido?.etaSeg ?? null,
          etaNaReferenciaComum: previstoEm != null && previstoEm >= referencia ? Math.ceil((previstoEm - referencia) / 1000) : null,
          motivo: motivoExclusaoEventoRadar(e, s.parada, s.recebidoEm, s.agora)
            ?? (!exibido ? 'consulta_pausada_ou_evento_nao_disponivel'
              : previstoEm != null && previstoEm < s.agora ? 'ETA_vencido_nao_comprova_passagem'
              : linhas.some(r => r.kind === 'arrival' && r.arrival.id === e.eventId) ? 'exibido' : 'fora_do_resumo_ou_reconciliado_com_presenca'),
        };
      }),
    };
  }
  const antes = compacto ? representar(compacto, 2) : null;
  const atual = representar(completo, 12);
  const diferencas = antes?.eventos.map(a => {
    const b = atual.eventos.find(b => b.eventId === a.eventId);
    const motivo = antes.contexto !== atual.contexto ? 'contextos_distintos'
      : !b ? 'ausente_na_resposta_atual_ou_fora_do_limite_diagnostico'
      : a.vehicleId !== b.vehicleId || a.viagemId !== b.viagemId || a.tipo !== b.tipo
        || a.ocorrenciaId !== b.ocorrenciaId || a.sentidoId !== b.sentidoId
        || a.padraoVersaoId !== b.padraoVersaoId || a.padraoOperacionalId !== b.padraoOperacionalId ? 'identidade_contexto_ou_tipo_alterados'
      : a.previstoEm !== b.previstoEm ? 'previsao_alterada_entre_snapshots'
      : a.etaApresentado !== b.etaApresentado ? 'instantes_ou_elegibilidade_distintos' : 'mesma_previsao';
    return { eventId: a.eventId, motivo, antesEm: antes.referenciaEm, atualEm: atual.referenciaEm };
  }) ?? [];
  return { endpoint: `/paradas/${atual.paradaId ?? '?'}/eventos`, parametrosHTTP: 'somente paradaId; vínculos filtrados no frontend',
    referenciaComum: referencia, compacto: antes, completo: atual, diferencas,
    espera: { paradaId: espera.paradaId, estado: espera.estado, contextoElegivel: espera.previa?.contexto ?? null,
      candidatos: espera.previa?.candidatos.slice(0, 12).map(c => ({ eventId: c.evento.eventId,
        vehicleId: c.evento.vehicleId ?? c.evento.railVehicleId ?? null, previstoEm: c.previstoEm, etaSeg: c.etaSeg })) ?? [] },
  };
}
