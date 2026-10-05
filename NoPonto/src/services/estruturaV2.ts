import { api } from "@/src/services/api";
import type {
  ItinerarioPadraoVersaoV2, LinhaV2, PadraoOperacionalV2, SentidoV2,
} from "@/src/types/estruturaV2";
import type { PaginatedResponse } from "@/src/types/transporte";

export class CacheEstruturalPorVersao<T> {
  private readonly values = new Map<string, Promise<T>>();

  get(key: string, loader: () => Promise<T>) {
    let value = this.values.get(key);
    if (!value) {
      value = loader();
      this.values.set(key, value);
    }
    return value;
  }

  clear() { this.values.clear(); }
}

const itinerariosPorVersao =
  new CacheEstruturalPorVersao<ItinerarioPadraoVersaoV2 | null>();

export interface FiltrosLinhasV2 {
  modalId?: string;
  tipoRota?: string;
  excluirTipoRota?: string;
  signal?: AbortSignal;
}
export async function listarLinhasV2(termo = "", page = 1, pageSize = 50,
  filtros: FiltrosLinhasV2 = {}) {
  const response = await api.get<PaginatedResponse<LinhaV2>>("/linhas", {
    params: { nome: termo, page, pageSize,
      ...(filtros.modalId ? { modalId: filtros.modalId } : {}),
      ...(filtros.tipoRota ? { tipoRota: filtros.tipoRota } : {}),
      ...(filtros.excluirTipoRota ? { excluirTipoRota: filtros.excluirTipoRota } : {}),
    },
    signal: filtros.signal,
  });
  return response.ok && response.data ? response.data.itens : [];
}

export async function listarSentidosV2(codigoLinha: string) {
  const response = await api.get<SentidoV2[]>(
    `/linhas/${encodeURIComponent(codigoLinha)}/sentidos`,
  );
  return response.ok && response.data ? response.data : [];
}

export async function listarPadroesV2(sentidoId: string) {
  const response = await api.get<PadraoOperacionalV2[]>(`/sentidos/${sentidoId}/padroes`);
  return response.ok && response.data ? response.data : [];
}

export function obterItinerarioPadraoVersaoV2(padraoVersaoId: string) {
  return itinerariosPorVersao.get(padraoVersaoId, () =>
    api
      .get<ItinerarioPadraoVersaoV2>(`/padroes-versoes/${padraoVersaoId}/itinerario`)
      .then((response) => response.ok && response.data ? response.data : null)
      .catch(() => null),
  );
}

export function limparCacheEstruturalV2ParaTestes() { itinerariosPorVersao.clear() }
