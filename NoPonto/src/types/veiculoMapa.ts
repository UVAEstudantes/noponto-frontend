import type { CategoriaTransporteV2 } from "./estruturaV2";
import { rotuloConfianca } from "@/src/services/confiancaApresentacao";

export type RuntimeVeiculoMapa = "rodoviario" | "ferroviario";
export type StatusFonteFerroviaria = "Programado" | "Estimado" | "Ao vivo" | "Indisponível";

export interface VeiculoMapa {
  idVisual: string;
  runtime: RuntimeVeiculoMapa;
  modal: "onibus" | "trem";
  tipoRota: CategoriaTransporteV2;
  linhaId?: string | null;
  sentidoId?: string | null;
  padraoOperacionalId?: string | null;
  padraoVersaoId: string | null;
  codigoVeiculoOuTrem?: string | null;
  codigoLinha?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  posicaoNaRota?: number | null;
  comprimentoRotaMetros?: number | null;
  atualizadoEm?: string | null;
  fontePosicao?: string | null;
  qualidadePosicao?: string | null;
  statusFonte?: StatusFonteFerroviaria | null;
  proximaParada?: string | null;
  distanciaProximaParadaMetros?: number | null;
  proximaOcorrenciaParadaPadraoId?: string | null;
  raw: unknown;
}

export function statusFonteFerroviaria(
  source?: string | null,
  quality?: string | null,
): StatusFonteFerroviaria {
  return rotuloConfianca(source, quality);
}
