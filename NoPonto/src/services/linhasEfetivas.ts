import type { LinhaSelecionadaInfo } from "../hooks/useMobilidadeRio";
import type { LinhaFavorita } from "./favoritos";
import type { CategoriaTransporteV2 } from "../types/estruturaV2";

export const LIMITE_FAVORITAS_VISIVEIS = 10;
export type ViewModeMapa = "normal" | "favoritos";
export type SearchCategoryMapa = CategoriaTransporteV2 | "todos";
const cores = { onibus: "#F59E0B", brt: "#0EA5E9", trem: "#A855F7", metro: "#14B8A6" };
const ramais: Record<string, string> = { deodoro: "#ba0c2f", santa_cruz: "#64a70b",
  japeri: "#92c1e9", saracuruna: "#de7c00", belford_roxo: "#5c068c",
  paracambi: "#00a3e0", guapimirim: "#f1b500", vila_inhomirim: "#c4b000" };

export function configuracaoFavorita(favorita: LinhaFavorita): LinhaSelecionadaInfo {
  const nome = `${favorita.codigo} ${favorita.nome}`.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
  const corRamal = favorita.modal === "trem"
    ? Object.entries(ramais).find(([ramal]) => nome.includes(ramal))?.[1] : undefined;
  return { linhaId: favorita.linhaId, linhaCodigo: favorita.codigo || favorita.nome,
    nomeExibicao: favorita.nome, subtitulo: favorita.nome, modal: favorita.modal,
    cor: corRamal ?? cores[favorita.modal], ativa: true, modoSentido: "ambos", mostrarParadas: true };
}

// A configuração persistida sempre prevalece; favoritas novas são apenas apresentação em memória.
export function configurarFavoritas(favoritas: readonly LinhaFavorita[], selecionadas: readonly LinhaSelecionadaInfo[],
  temporarias: Readonly<Record<string, LinhaSelecionadaInfo>>) {
  const salvas = new Map(selecionadas.map((linha) => [linha.linhaId, linha]));
  return favoritas.map((favorita) => salvas.get(favorita.linhaId)
    ?? temporarias[favorita.linhaId] ?? configuracaoFavorita(favorita));
}

// null = exibir todas se couberem. Acima do limite, aguardar escolha explícita, sem slice silencioso.
export function favoritasVisiveis(configuradas: readonly LinhaSelecionadaInfo[], escolha: readonly string[] | null) {
  const elegiveis = configuradas.filter((linha) => linha.ativa);
  const requerEscolha = elegiveis.length > LIMITE_FAVORITAS_VISIVEIS;
  if (escolha === null) return requerEscolha ? [] : elegiveis;
  const ids = new Set(escolha);
  const escolhidas = elegiveis.filter((linha) => ids.has(linha.linhaId));
  return escolhidas.length <= LIMITE_FAVORITAS_VISIVEIS ? escolhidas : [];
}

export function linhasEfetivas(viewMode: ViewModeMapa, normalModal: CategoriaTransporteV2,
  selecionadas: readonly LinhaSelecionadaInfo[], favoritas: readonly LinhaSelecionadaInfo[], escolha: readonly string[] | null) {
  return viewMode === "favoritos" ? favoritasVisiveis(favoritas, escolha)
    : selecionadas.filter((linha) => linha.modal === normalModal);
}

export function ehFerroviaria(linha: Pick<LinhaSelecionadaInfo, "modal">) {
  return linha.modal === "trem" || linha.modal === "metro";
}
