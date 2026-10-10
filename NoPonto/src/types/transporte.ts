export type ModalApiTransporte = "onibus" | "brt" | "trem" | "metro";

export type CoordenadaMapa = [number, number];

/** Modo de exibição do itinerário no mapa */
export type ModoSentido = "ambos" | "ida" | "volta";

// ===== Runtime Types =====

export interface LinhaTempoReal {
  id: string;
  nome: string;
  modal: ModalApiTransporte;
  sentido: string;
  intervalo: string;
  tarifa: number;
}

export type VeiculoTempoReal =
  import("@/src/services/veiculosMapa").VeiculoMapaRodoviario;

export interface ItinerarioLinha {
  linha: string;
  modal: ModalApiTransporte;
  /**
   * Dois segmentos: [0] = ida, [1] = volta.
   * Cada segmento é uma lista de coordenadas [lat, lng].
   */
  segmentos: CoordenadaMapa[][];
  paradas?: Parada[];
  paradasPorItinerario?: Record<string, Parada[]>;
  sentidoIdIda?: string;
  sentidoIdVolta?: string;
  /** itinerarioId do backend para o sentido IDA */
  itinerarioIdIda?: string;
  /** itinerarioId do backend para o sentido VOLTA */
  itinerarioIdVolta?: string;
  /** Nome do sentido para cada itinerarioId */
  itinerarioSentidoMap?: Record<string, string>;
  /** Indica se as paradas vieram no payload */
  incluiParadas?: boolean;
  /** Estruturas V2 carregadas sem reduzir sentidos/padrões a ida/volta. */
  padroesV2?: PadraoLinhaV2[];
}

export interface PadraoLinhaV2 {
  sentidoId: string;
  sentidoNome: string;
  padraoOperacionalId: string;
  padraoVersaoId: string;
  rotulo: string;
  segmentoIndice: number;
  paradas: Parada[];
}

// ===== Backend API Response Types =====

export interface PaginatedResponse<T> {
  pagina: number;
  tamanhoPagina: number;
  totalRegistros: number;
  totalPaginas: number;
  itens: T[];
}

export interface LinhaSimplesDto {
  id: string;
  nome: string;
  codigo: string;
  modalId: string;
  tipoRota?: string;
  modal?: string;
  consorcio?: string | null;
  terminalA?: string | null;
  terminalB?: string | null;
}

export type LinhasResponse = PaginatedResponse<LinhaSimplesDto>;

export interface ModalTransporteDto {
  id: string;
  nome: string;
}

export interface SentidoSimples {
  id: string;
  nome: string;
  linhaId: string;
  linhaNome: string;
}

export type SentidosResponse = PaginatedResponse<SentidoSimples>;

export interface TarifaAtualDto {
  tarifa: number;
  validoDe: string;
  validoAte: string;
  fonte?: string | null;
}

export interface ItinerarioDetalheDto {
  itinerarioId: string;
  distanciaMetros?: number | null;
  quantidadeParadas?: number | null;
}

export interface SentidoDetalheDto {
  sentidoId: string;
  nome: string;
  itinerarios: ItinerarioDetalheDto[];
}

export interface LinhaDetalhesDto {
  linhaId: string;
  linhaNome: string;
  codigo: string;
  tarifaAtual?: TarifaAtualDto | null;
  sentidos: SentidoDetalheDto[];
}

export interface ItinerarioPorLinhaDto {
  id: string;
  linhaId: string;
  sentidoId: string;
}

export interface GeometriaItem {
  ordem: number;
  latitude: number;
  longitude: number;
}

export interface Parada {
  paradaId: string;
  codigo?: string;
  nome: string;
  ordem: number;
  latitude: number;
  longitude: number;
  posicaoLinha: number;
}

export interface ItinerarioMapaDto {
  itinerarioId: string;
  linhaNome: string;
  sentidoNome: string;
  geometria: GeometriaItem[];
  paradas?: Parada[];
}

/**
 * Novo formato do endpoint /itinerarios/por-linha/{linhaId}/mapa
 */
export interface ItinerarioPorLinhaMapaDto {
  linhaId: string;
  linhaNome: string;
  itinerarios: ItinerarioMapaDto[];
}

/**
 * Opção de busca — representa a linha inteira (não por sentido).
 */
export interface OpcaoBusca {
  linha: LinhaSimplesDto;
  /** Nome de exibição, ex: "838 - Terminal Campo Grande" */
  nomeExibicao: string;
  displayName: string;
  displaySubtitle: string;
  searchTokens: string[];
}

export interface ParadaProximaDto {
  paradaId: string;
  nome: string;
  latitude: number;
  longitude: number;
  distanciaMetros: number;
}

export interface ProximoVeiculoParadaDto {
  ordem: string;
  codigoLinha: string;
  status: number;
  itinerarioId: string;
  latitude: number;
  longitude: number;
  timestampGps: string;
  proximaParadaNome: string;
  distanciaProximaParadaMetros: number;
  etaProximaParadaSegundos: number;
  etaConfianca: string;
  distanciaParadaMetros: number;
  etaParadaSegundos: number;
  horarioChegadaPrevisto: string;
  horarioChegadaPrevistoLocal: string;
}

export interface PosicaoVeiculo {
  ordem: string;
  codigoLinha: string;
  latitude: number;
  longitude: number;
  velocidade: number;
  timestampGps: string;
  timestampServidor: string;
  latitudeAnterior?: number | null;
  longitudeAnterior?: number | null;
  timestampAnterior?: string | null;
  linhaId?: string | null;
  sentidoId?: string | null;
  padraoOperacionalId?: string | null;
  padraoVersaoId?: string | null;
  topologiaPadrao?: string | null;
  proximaOcorrenciaParadaPadraoId?: string | null;
  posicaoNaRota?: number | null;
  comprimentoRotaMetros?: number | null;
  bearing?: number | null;
  proximaParadaNome?: string | null;
  distanciaProximaParadaMetros?: number | null;
  velocidadeMedia?: number | null;
  status?: number;
}

export interface VeiculosLinhaDto {
  codigoLinha: string;
  totalVeiculos: number;
  posicoes: PosicaoVeiculo[];
}

// ===== POI Types =====

export interface PoiDto {
  poiId: string;
  paradaId: string;
  ordemParada: number;
  nomeParada: string;
  nome: string;
  categoria: string;
  prioridade: number;
  latitude: number;
  longitude: number;
  distanciaMetros: number;
}

export interface PoiParadaDto {
  poiId: string;
  paradaId: string;
  nome: string;
  categoria: string;
  prioridade: number;
  latitude: number;
  longitude: number;
  distanciaMetros: number;
}
