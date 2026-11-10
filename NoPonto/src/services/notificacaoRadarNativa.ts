import type { PreviaNotificacaoRadar } from './previaNotificacaoRadar';
import type { CandidatoNotificacaoRadar } from './notificacoesRadar';

export interface LinhaNotificacaoRadarNativa {
  codigo: string;
  prioritaria: boolean;
  eventType: 'ARRIVAL' | 'DEPARTURE';
  principal: string;
  proximas: string[];
}

export interface ApresentacaoRadarNativa {
  paradaNome: string;
  linhas: LinhaNotificacaoRadarNativa[];
  maisLinhas: number;
  maisPrevisoes: number;
}

const etaCurto = (segundos: number) => segundos < 60 ? 'Chegando' : `${Math.ceil(segundos / 60)} min`;

export function adaptarPreviaRadarNativa(previa: NonNullable<PreviaNotificacaoRadar>, prioritarias: readonly string[]): ApresentacaoRadarNativa {
  const eventoIds = new Set<string>();
  const veiculos = new Set<string>();
  const grupos = new Map<string, CandidatoNotificacaoRadar[]>();
  const linhasPrioritarias = new Set(prioritarias);

  for (const candidato of [...previa.candidatos].sort((a, b) => a.previstoEm - b.previstoEm
    || a.evento.eventId.localeCompare(b.evento.eventId))) {
    const evento = candidato.evento;
    if (!Number.isFinite(candidato.etaSeg) || candidato.etaSeg < 0 || eventoIds.has(evento.eventId)) continue;
    const chaveGrupo = JSON.stringify([evento.paradaId, evento.linhaId, evento.sentidoId,
      evento.padraoOperacionalId ?? null, evento.padraoVersaoId, evento.ocorrenciaParadaPadraoId, evento.eventType]);
    const identidadeVeiculo = evento.modal === 'trem'
      ? evento.expectedRunId ?? evento.railVehicleId ?? evento.trainCode
      : evento.vehicleId ?? evento.codigoVeiculo;
    const chaveVeiculo = identidadeVeiculo ? `${chaveGrupo}:${identidadeVeiculo.trim().toUpperCase()}` : null;
    if (chaveVeiculo && veiculos.has(chaveVeiculo)) continue;
    eventoIds.add(evento.eventId);
    if (chaveVeiculo) veiculos.add(chaveVeiculo);
    const gruposLinha = grupos.get(evento.linhaId) ?? [];
    gruposLinha.push(candidato);
    grupos.set(evento.linhaId, gruposLinha);
  }

  const porLinha = [...grupos.entries()].map(([linhaId, candidatos]) => {
    const contextos = new Map<string, typeof candidatos>();
    for (const candidato of candidatos) {
      const evento = candidato.evento;
      const chave = JSON.stringify([evento.paradaId, evento.sentidoId, evento.padraoOperacionalId ?? null,
        evento.padraoVersaoId, evento.ocorrenciaParadaPadraoId, evento.eventType]);
      const grupo = contextos.get(chave) ?? [];
      grupo.push(candidato);
      contextos.set(chave, grupo);
    }
    const compatíveis = [...contextos.values()].sort((a, b) => a[0].previstoEm - b[0].previstoEm);
    const grupoPrincipal = compatíveis[0];
    const exibidos = grupoPrincipal.slice(0, 3);
    const principal = exibidos[0];
    return {
      principalEm: principal.previstoEm,
      codigo: principal.evento.codigoLinha,
      prioritaria: linhasPrioritarias.has(linhaId),
      eventType: principal.evento.eventType,
      principal: principal.evento.eventType === 'DEPARTURE' ? `Saída em ${etaCurto(principal.etaSeg)}` : etaCurto(principal.etaSeg),
      proximas: exibidos.slice(1).map(item => etaCurto(item.etaSeg)),
      exibidos: exibidos.length,
      total: candidatos.length,
    };
  }).sort((a, b) => a.principalEm - b.principalEm
    || Number(b.prioritaria) - Number(a.prioritaria) || a.codigo.localeCompare(b.codigo));

  const visiveis = porLinha.slice(0, 2);
  return {
    paradaNome: previa.contexto.paradaNome ?? 'Parada',
    linhas: visiveis.map(({ codigo, prioritaria, eventType, principal, proximas }) =>
      ({ codigo, prioritaria, eventType, principal, proximas })),
    maisLinhas: Math.max(0, porLinha.length - visiveis.length),
    maisPrevisoes: Math.max(0, porLinha.reduce((n, linha) => n + linha.total, 0)
      - visiveis.reduce((n, linha) => n + linha.exibidos, 0)),
  };
}
