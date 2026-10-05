import type { CategoriaTransporteV2 } from "@/src/types/estruturaV2";
import { categoriaLinhaV2 } from "@/src/types/estruturaV2";

export const normalizarBusca = (value: string) => value.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();

const titleCase = (value: string) => value.toLocaleLowerCase("pt-BR")
  .replace(/(^|\s)(\p{L})/gu, (_, space, letter) => `${space}${letter.toLocaleUpperCase("pt-BR")}`);

export interface LinhaBuscaApresentacao {
  displayName: string;
  displaySubtitle: string;
  searchTokens: string[];
}
export interface LinhaBuscaFonte { codigo: string; nome: string; tipoRota?: string | null;
  modal?: string | null; terminalA?: string | null; terminalB?: string | null }

export function apresentarLinhaBusca(
  linha: LinhaBuscaFonte,
  categoria: CategoriaTransporteV2,
): LinhaBuscaApresentacao {
  const raw = `${linha.nome || ""}`.trim();
  const semPrefixo = raw.replace(/^(TREM|RAMAL|LINHA|BRT)[-_\s]+/i, "")
    .replace(/^EXTENS[AÃ]O[-_\s]+/i, "").replace(/[-_]+/g, " ").trim();
  const displayName = categoria === "trem"
    ? titleCase(semPrefixo || linha.codigo)
    : linha.codigo;
  const extensao = /extens/i.test(`${raw} ${linha.tipoRota}`);
  const displaySubtitle = categoria === "trem"
    ? `${extensao ? "Extensão" : "Ramal"} ${displayName}`
    : raw;
  return {
    displayName,
    displaySubtitle,
    searchTokens: [...new Set([displayName, displaySubtitle, raw, linha.codigo]
      .map(normalizarBusca).filter(Boolean))],
  };
}

export function filtrarCatalogoBusca<T extends LinhaBuscaFonte>(
  linhas: T[], query: string, categoria: CategoriaTransporteV2,
) {
  const needle = normalizarBusca(query);
  if (!needle) return [];
  return linhas.filter((linha) => apresentarLinhaBusca(linha, categoria).searchTokens
    .some((token) => token.includes(needle)));
}
export function filtrarLinhasPorCategoria<T extends LinhaBuscaFonte>(linhas: T[], categoria: CategoriaTransporteV2) {
  return linhas.filter((linha) => categoriaLinhaV2({
    tipoRota: linha.tipoRota ?? "", modal: linha.modal ?? "",
  }) === categoria);
}

export function placeholderPodeAlternar(query: string) { return query.trim().length === 0; }
export function deveFecharBuscaAoOcultarTeclado(selecionandoResultado: boolean) {
  return !selecionandoResultado;
}
export function apresentarResultadosBackend<T extends LinhaBuscaFonte>(linhas: T[], categoria: CategoriaTransporteV2) {
  return linhas.map((linha) => ({ linha, ...apresentarLinhaBusca(linha, categoria) }));
}
