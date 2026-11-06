import type { LinhaSelecionadaInfo } from '../hooks/useMobilidadeRio';
import type { useConsultaEventosParada } from '../hooks/useConsultaEventosParada';
import type { ItinerarioLinha } from '../types/transporte';
import type { ItinerarioPadraoVersaoV2 } from '../types/estruturaV2';
import type { TerminalPresence } from './terminalTracking';
import { chaveContextoRadar, paradaDetalhadaRadar, type ParadaRadar } from './radarParada';
import { filtrarCandidatosNotificacao, produzirConteudoNotificacao,
  type ContextoNotificacaoRadar, type PoliticaNotificacaoRadar } from './notificacoesRadar';

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
}

/** Adapta somente snapshots já consultados. Não consulta, agenda ou envia nada. */
export function criarPreviaNotificacaoRadar(entrada: EntradaPreviaNotificacaoRadar) {
  const { parada, modal, consulta, linhas, itinerarios, realtime, presencasFisicas,
    linhasPrioritarias = [], politica = {} } = entrada;
  if (!parada || !consulta.temResposta || consulta.statusConsulta === 'pausado'
    || consulta.statusConsulta === 'indisponivel'
    || consulta.contextoConsulta !== chaveContextoRadar(parada, modal)) return null;

  // O Radar também inclui linhas piloto não selecionadas e todos os seus sentidos.
  // Reutiliza a seleção existente e cruza com o contexto efetivamente consultado.
  const selecionada = paradaDetalhadaRadar(parada.parada, linhas, modal, itinerarios, realtime);
  const vinculos = (selecionada?.vinculos ?? []).filter(v => parada.vinculos.some(p =>
    p.linhaId === v.linhaId && p.sentidoId === v.sentidoId && p.padraoVersaoId === v.padraoVersaoId))
    .flatMap(vinculo => {
      const estrutura = Object.values(realtime).find(p => p.linhaId === vinculo.linhaId
        && p.sentidoId === vinculo.sentidoId && p.padraoVersaoId === vinculo.padraoVersaoId)
        ?? itinerarios[vinculo.linhaId]?.padroesV2?.find(p =>
          p.sentidoId === vinculo.sentidoId && p.padraoVersaoId === vinculo.padraoVersaoId);
      // Sem metadado do padrão, não é possível garantir compatibilidade operacional.
      return estrutura?.padraoOperacionalId
        ? [{ ...vinculo, padraoOperacionalId: estrutura.padraoOperacionalId }] : [];
    });
  if (!vinculos.length) return null;
  const contexto: ContextoNotificacaoRadar = {
    paradaId: parada.parada.paradaId, vinculos,
    linhasPrioritarias: linhasPrioritarias.filter(id => vinculos.some(v => v.linhaId === id)),
  };
  // Evidência física original: não transforma presença ou intervalo físico em ETA.
  const candidatos = filtrarCandidatosNotificacao(consulta.eventos, contexto,
    consulta.recebidoEm, consulta.agora, politica, presencasFisicas);
  return { contexto, candidatos,
    conteudo: produzirConteudoNotificacao(contexto, candidatos, consulta.recebidoEm, consulta.agora) };
}

export type PreviaNotificacaoRadar = ReturnType<typeof criarPreviaNotificacaoRadar>;
