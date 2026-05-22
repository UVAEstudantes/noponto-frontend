import { EstiloMapaId } from "@/src/constants/estilosMapa";
import { Parada } from "@/src/types/transporte";

// Tipos compartilhados do mapa OSM.
// Este arquivo concentra apenas contratos TypeScript para reduzir acoplamento
// entre o componente React Native (host da WebView) e os payloads usados no mapa.

export interface LinhaParaMostrar {
  nome: string;
  cor?: string;
  modal?: string;
  segmentos?: [number, number][][];
  coordenadas?: [number, number][];
  paradas?: Parada[];
  mostrarParadas?: boolean;
  modoSentido?: string;
  /**
   * Mapeamento de itinerarioId -> índice do segmento.
   * Permite o dead reckoning usar o segmento correto para cada veículo.
   * ex: { "uuid-ida": 0, "uuid-volta": 1 }
   */
  itinerarioSegmentoMap?: Record<string, number>;
  /**
   * Mapeamento de itinerarioId -> nome do sentido.
   * ex: { "uuid-ida": "Terminal Campo Grande" }
   */
  itinerarioSentidoMap?: Record<string, string>;
  posicoes?: {
    id?: string;
    ordem?: string;
    codigo?: string;
    latitude?: number | string;
    longitude?: number | string;
    direcao?: number | string | null;
    velocidade?: number | string;
    velocidadeMedia?: number | null;
    sentidoNome?: string;
    timestamp?: number | string;
    proximaParadaNome?: string | null;
    distanciaProximaParadaMetros?: number | null;
    status?: number;
    posicaoNaRota?: number | null;
    comprimentoRotaMetros?: number | null;
    itinerarioId?: string | null;
  }[];
}

export interface MapaOSMProps {
  location: any;
  linhasParaMostrar: LinhaParaMostrar[];
  darkMode?: boolean;
  showTraffic?: boolean;
  estiloMapa?: EstiloMapaId;
  onStopPress?: (parada: Parada) => void;
}

export interface MapaOSMRef {
  centerOnUser: () => void;
  fitToCoordinates: (
    coordinates: { latitude: number; longitude: number }[],
  ) => void;
  focarVeiculo: (payload: {
    ordem?: string;
    latitude?: number;
    longitude?: number;
    zoom?: number;
  }) => void;
  mostrarPoi: (payload: {
    poi: { lat: number; lng: number; nome?: string };
    parada?: { lat: number; lng: number; nome?: string } | null;
    distancia?: number | null;
    icone?: string;
    cor?: string;
  }) => void;
  limparPoi: () => void;
}