import type { EntradaPreviaNotificacaoRadar } from './previaNotificacaoRadar';
import type { ConfiguracaoRemota } from './radarRemotoCore';
import { paradaDetalhadaRadar } from './radarParada';

const chaveDirecao = (linhaId: string, sentidoId: string) => JSON.stringify([linhaId, sentidoId]);

export function direcoesDisponiveisRadar(entrada: EntradaPreviaNotificacaoRadar, selected: string[]) {
  if (!entrada.parada || entrada.modal !== 'trem') return [];
  const selectedSet = new Set(selected);
  const detailed = paradaDetalhadaRadar(entrada.parada.parada, entrada.linhas.filter(l => selectedSet.has(l.linhaId)),
    entrada.modal, entrada.itinerarios, entrada.realtime);
  const options = (detailed?.vinculos ?? []).filter(v => entrada.parada?.vinculos.some(p => p.linhaId === v.linhaId
    && p.sentidoId === v.sentidoId && p.padraoVersaoId === v.padraoVersaoId)).flatMap(v => {
      const route = Object.values(entrada.realtime).find(p => p.linhaId === v.linhaId && p.sentidoId === v.sentidoId && p.padraoVersaoId === v.padraoVersaoId)
        ?? entrada.itinerarios[v.linhaId]?.padroesV2?.find(p => p.sentidoId === v.sentidoId && p.padraoVersaoId === v.padraoVersaoId);
      if (!route?.padraoOperacionalId || 'ehVersaoAtual' in route && route.ehVersaoAtual === false
        || 'linhaId' in route && route.linhaId !== v.linhaId) return [];
      const occurrences = 'ocorrencias' in route ? [...route.ocorrencias].sort((a, b) => a.ordem - b.ordem)
        : [...route.paradas].sort((a, b) => a.ordem - b.ordem);
      const finalStop = occurrences.at(-1)?.paradaId;
      if (finalStop === entrada.parada?.parada.paradaId) return [];
      return [{ chave: chaveDirecao(v.linhaId, v.sentidoId), linhaId: v.linhaId, nome: v.destino || 'Sentido' }];
    });
  return [...new Map(options.map(option => [option.chave, option])).values()];
}

/** Usa o mesmo recorte operacional do Radar local, sem converter presença em previsão. */
export function configurarRadarRemoto(entrada: EntradaPreviaNotificacaoRadar, selected: string[], priorities: string[], window: number,
  selectedDirections?: string[]): ConfiguracaoRemota | null {
  if (!entrada.parada || selected.length < 1 || selected.length > 20 || !Number.isInteger(window) || window < 2 || window > 15) return null;
  const selectedSet = new Set(selected);
  if (selectedSet.size !== selected.length) return null;
  const directions = selectedDirections == null ? null : new Set(selectedDirections);
  const detailed = paradaDetalhadaRadar(entrada.parada.parada, entrada.linhas.filter(l => selectedSet.has(l.linhaId)),
    entrada.modal, entrada.itinerarios, entrada.realtime);
  const contexts = (detailed?.vinculos ?? []).filter(v => entrada.parada?.vinculos.some(p => p.linhaId === v.linhaId
    && p.sentidoId === v.sentidoId && p.padraoVersaoId === v.padraoVersaoId)).flatMap(v => {
      const route = Object.values(entrada.realtime).find(p => p.linhaId === v.linhaId && p.sentidoId === v.sentidoId && p.padraoVersaoId === v.padraoVersaoId)
        ?? entrada.itinerarios[v.linhaId]?.padroesV2?.find(p => p.sentidoId === v.sentidoId && p.padraoVersaoId === v.padraoVersaoId);
      if (!route?.padraoOperacionalId || 'ehVersaoAtual' in route && route.ehVersaoAtual === false
        || 'linhaId' in route && route.linhaId !== v.linhaId) return [];
      return [{ linhaId: v.linhaId, sentidoId: v.sentidoId,
        padraoOperacionalId: route.padraoOperacionalId, padraoVersaoId: v.padraoVersaoId }];
    });
  const unique = [...new Map(contexts.filter(c => directions == null || directions.has(chaveDirecao(c.linhaId, c.sentidoId)))
    .map(c => [JSON.stringify(c), c])).values()];
  if (unique.length > 40 || selected.some(id => !unique.some(c => c.linhaId === id))) return null;
  return { paradaId: entrada.parada.parada.paradaId, contextos: unique, linhasSelecionadas: selected,
    linhasPrioritarias: priorities.filter(id => selectedSet.has(id)), antecedenciaMinutos: window };
}
