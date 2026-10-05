import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CategoriaTransporteV2 } from "@/src/types/estruturaV2";
import type { LinhaSimplesDto, OpcaoBusca } from "@/src/types/transporte";
import { apresentarLinhaBusca, normalizarBusca } from "./searchPresentation";

const KEY = "@noponto/search-history-v1";
export const SEARCH_HISTORY_LIMIT = 30;

export interface SearchHistoryItem {
  linhaId: string;
  categoria: CategoriaTransporteV2;
  codigo: string;
  nome: string;
  tipoRota?: string;
  modalId: string;
  modal?: string;
  lastSelectedAt: number;
  selectionCount: number;
}

export function atualizarHistorico(items: SearchHistoryItem[], linha: LinhaSimplesDto,
  categoria: CategoriaTransporteV2, now = Date.now()) {
  const existing = items.find((item) => item.linhaId === linha.id && item.categoria === categoria);
  const next: SearchHistoryItem = {
    linhaId: linha.id, categoria, codigo: linha.codigo, nome: linha.nome,
    tipoRota: linha.tipoRota, modalId: linha.modalId, modal: linha.modal,
    lastSelectedAt: now, selectionCount: (existing?.selectionCount ?? 0) + 1,
  };
  return [next, ...items.filter((item) =>
    item.linhaId !== linha.id || item.categoria !== categoria)]
    .sort((a, b) => {
      const ageA = Math.max(0, now - a.lastSelectedAt) / 86_400_000;
      const ageB = Math.max(0, now - b.lastSelectedAt) / 86_400_000;
      return (b.selectionCount * 2 - ageB) - (a.selectionCount * 2 - ageA);
    }).slice(0, SEARCH_HISTORY_LIMIT);
}

export function historicoPorCategoria(items: SearchHistoryItem[], categoria: CategoriaTransporteV2,
  limit = 6) { return items.filter((item) => item.categoria === categoria).slice(0, limit); }

export function filtrarHistoricoBusca(items: SearchHistoryItem[], categoria: CategoriaTransporteV2,
  query: string, limit = 6) {
  const needle = normalizarBusca(query);
  return items.filter((item) => item.categoria === categoria)
    .filter((item) => !needle || [item.codigo, item.nome]
      .some((value) => normalizarBusca(value).includes(needle)))
    .slice(0, limit);
}

export function removerResultadosJaRecentes<T extends { linha: { id: string } }>(
  resultados: T[], recentes: readonly SearchHistoryItem[],
) {
  const ids = new Set(recentes.map((item) => item.linhaId));
  return resultados.filter((item) => !ids.has(item.linha.id));
}

export function historicoParaOpcao(item: SearchHistoryItem): OpcaoBusca {
  const linha: LinhaSimplesDto = { id: item.linhaId, codigo: item.codigo, nome: item.nome,
    tipoRota: item.tipoRota, modalId: item.modalId, modal: item.modal };
  const presentation = apresentarLinhaBusca(linha, item.categoria);
  return { linha, nomeExibicao: presentation.displayName, ...presentation };
}

export function normalizarHistoricoPersistido(value: unknown): SearchHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SearchHistoryItem => Boolean(
    item && typeof item === "object"
      && typeof item.linhaId === "string" && item.linhaId.length
      && (item.categoria === "onibus" || item.categoria === "brt" || item.categoria === "trem")
      && typeof item.codigo === "string" && typeof item.nome === "string"
      && typeof item.modalId === "string"
      && Number.isFinite(item.lastSelectedAt) && Number.isFinite(item.selectionCount),
  )).slice(0, SEARCH_HISTORY_LIMIT);
}

export async function carregarHistoricoBusca() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return normalizarHistoricoPersistido(parsed);
  } catch { return []; }
}

export async function registrarSelecaoBusca(linha: LinhaSimplesDto, categoria: CategoriaTransporteV2) {
  const next = atualizarHistorico(await carregarHistoricoBusca(), linha, categoria);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
