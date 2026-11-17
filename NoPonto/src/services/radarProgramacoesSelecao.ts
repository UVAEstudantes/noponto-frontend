import { api } from './api';
import { listarSentidosV2, listarPadroesV2, obterItinerarioPadraoVersaoV2 } from './estruturaV2';
import type { PaginatedResponse } from '../types/transporte';
import type { ContextoRemoto } from './radarRemotoCore';
export interface ParadaProgramacao { id: string; nome: string; latitude: number; longitude: number }
export interface LinhaParadaProgramacao { linhaId: string; codigo: string; nome: string; sentidoId: string; sentido: string }
export async function buscarParadasProgramacao(nome: string, page: number, signal?: AbortSignal) {
  const r = await api.get<PaginatedResponse<ParadaProgramacao>>('/paradas', { params: { nome: nome.trim(), page, pageSize: 15 }, signal });
  if (!r.ok || !r.data) throw new Error('Não foi possível buscar paradas.');
  return r.data;
}
export async function linhasParadaProgramacao(id: string) {
  const r = await api.get<LinhaParadaProgramacao[]>(`/paradas/${encodeURIComponent(id)}/linhas`);
  if (!r.ok || !Array.isArray(r.data)) throw new Error('Não foi possível carregar linhas.');
  return [...new Map(r.data.map(l => [l.linhaId,l])).values()];
}
export async function contextosLinhaProgramacao(paradaId: string, linha: LinhaParadaProgramacao) {
  const result: (ContextoRemoto & { destino: string })[] = [];
  for (const sentido of await listarSentidosV2(linha.codigo)) {
    if (sentido.linhaId !== linha.linhaId) continue;
    for (const padrao of await listarPadroesV2(sentido.id)) {
      if (!padrao.versaoAtualId) continue;
      const it = await obterItinerarioPadraoVersaoV2(padrao.versaoAtualId);
      if (!it || !it.ehVersaoAtual || it.linhaId !== linha.linhaId || it.sentidoId !== sentido.id) continue;
      const stops = [...it.ocorrencias].sort((a,b) => a.ordem-b.ordem);
      if (!stops.some(p => p.paradaId === paradaId) || stops.at(-1)?.paradaId === paradaId) continue;
      result.push({ linhaId: it.linhaId, sentidoId: it.sentidoId, padraoOperacionalId: it.padraoOperacionalId,
        padraoVersaoId: it.padraoVersaoId, destino: it.nomeSentido || sentido.nome });
    }
  }
  return result;
}
