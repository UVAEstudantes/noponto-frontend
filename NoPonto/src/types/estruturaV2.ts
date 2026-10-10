export type CategoriaTransporteV2 = "onibus" | "brt" | "trem" | "metro";

export interface ModalV2 { id: string; nome: string }
export interface LinhaV2 {
  linhaId: string; codigo: string; nome: string; tipoRota: string;
  consorcio?: string | null; modalId: string; modal: string;
  terminalA?: string | null; terminalB?: string | null;
}
export interface SentidoV2 { id: string; linhaId: string; nome: string }
export interface PadraoOperacionalV2 {
  id: string; sentidoId: string; chave: string; tipoServico: string;
  nomePublico?: string | null; versaoAtualId?: string | null;
}
export interface GeometriaV2 { tipo: string; coordenadas: [number, number][] }
export interface OcorrenciaParadaV2 {
  ocorrenciaId: string; ordem: number; volta?: number | null; paradaId: string;
  codigoParada: string; nome: string; latitude: number; longitude: number;
  posicaoLinha: number; distanciaMetros?: number | null;
}
export interface ParadaV2 {
  id: string; codigo: string; nome: string; latitude: number; longitude: number;
  modalId?: string | null; tipoLocal: string; paradaPaiId?: string | null;
  plataforma?: string | null;
}
export interface PadraoVersaoV2 {
  id: string; numero: number; topologia: string; comprimentoMetros: number;
  publicadoEmUtc?: string | null; ehVersaoAtual: boolean;
}
export interface ItinerarioPadraoVersaoV2 {
  linhaId: string; codigoLinha: string; nomeLinha: string;
  sentidoId: string; nomeSentido: string;
  padraoOperacionalId: string; chavePadrao: string; tipoServico: string;
  nomePublico?: string | null; padraoVersaoId: string; numeroVersao: number;
  topologia: string; comprimentoMetros: number; publicadoEmUtc?: string | null;
  ehVersaoAtual: boolean; geometria: GeometriaV2; ocorrencias: OcorrenciaParadaV2[];
}

const normalizar = (value?: string | null) =>
  (value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export function categoriaModalV2(nome?: string | null): CategoriaTransporteV2 | undefined {
  const modal = normalizar(nome);
  if (modal === "brt" || modal === "bus rapid transit") return "brt";
  if (modal.includes("trem") || modal.includes("train")) return "trem";
  if (modal.includes("metro") || modal === "subway") return "metro";
  if (modal.includes("onibus") || modal === "bus") return "onibus";
  return undefined;
}

export function categoriaLinhaV2(
  linha: Pick<LinhaV2, "tipoRota" | "modal">,
): CategoriaTransporteV2 {
  // A identidade persistida prevalece sobre o tipo de serviço da linha.
  const persistido = categoriaModalV2(linha.modal);
  if (persistido) return persistido;
  if (normalizar(linha.tipoRota) === "brt") return "brt";
  return "onibus";
}

export function rotuloPadraoV2(padrao: PadraoOperacionalV2) {
  return padrao.nomePublico?.trim() || padrao.chave || `Padrão ${padrao.id.slice(0, 8)}`;
}

const SENTIDOS_TECNICOS = new Set(["forward", "reverse", "ida", "volta"]);

export function rotuloSentidoPublico(
  estrutura: Pick<ItinerarioPadraoVersaoV2, "nomeSentido" | "ocorrencias">,
  fallback = "Sentido",
) {
  const ocorrencias = [...estrutura.ocorrencias].sort((a, b) => a.ordem - b.ordem);
  const terminal = ocorrencias.at(-1)?.nome?.trim();
  if (terminal) return terminal;
  const nome = estrutura.nomeSentido?.trim();
  if (nome && !SENTIDOS_TECNICOS.has(normalizar(nome))) return nome;
  return fallback;
}
