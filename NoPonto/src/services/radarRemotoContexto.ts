import type { EntradaPreviaNotificacaoRadar } from './previaNotificacaoRadar';
import type { ConfiguracaoRemota } from './radarRemotoCore';
import { paradaDetalhadaRadar } from './radarParada';

/** Usa o mesmo recorte operacional do Radar local, sem converter presença em previsão. */
export function configurarRadarRemoto(entrada: EntradaPreviaNotificacaoRadar, selected: string[], priorities: string[], window: number): ConfiguracaoRemota | null {
  if (!entrada.parada || selected.length < 1 || selected.length > 20 || !Number.isInteger(window) || window < 2 || window > 15) return null;
  const selectedSet = new Set(selected);
  if (selectedSet.size !== selected.length) return null;
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
  const unique = [...new Map(contexts.map(c => [JSON.stringify(c), c])).values()];
  if (unique.length > 40 || selected.some(id => !unique.some(c => c.linhaId === id))) return null;
  return { paradaId: entrada.parada.parada.paradaId, contextos: unique, linhasSelecionadas: selected,
    linhasPrioritarias: priorities.filter(id => selectedSet.has(id)), antecedenciaMinutos: window };
}
