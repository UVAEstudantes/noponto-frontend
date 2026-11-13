import type { TutorialMapRequest, TutorialMapEvent } from '../tutorial/tutorialMapContract';
import { EstiloMapaId } from "@/src/constants/estilosMapa";
import { Parada } from "@/src/types/transporte";
import type { RailVehicleForMap } from "@/src/services/railRealtime";
import type { PhysicalVehicle } from "@/src/services/physicalPresence";
import type { TerminalPresence } from '@/src/services/terminalTracking';

// Tipos compartilhados do mapa OSM.
// Este arquivo concentra apenas contratos TypeScript para reduzir acoplamento
// entre o componente React Native (host da WebView) e os payloads usados no mapa.

export interface LinhaParaMostrar {
  linhaId?: string;
  structureKey?: string;
  nome: string;
    descricao?: string;
  cor?: string;
  modal?: string;
  segmentos?: [number, number][][];
  coordenadas?: [number, number][];
  paradas?: Parada[];
  paradasPorPadrao?: Record<string, Parada[]>;
  terminaisOficiais?: string[];
  terminalPolicy?: Partial<Pick<import('@/src/services/gpsPresentationPolicy').GpsPresentationPolicy,'terminalRadiusMetres'|'terminalExitMetres'|'dwellMs'|'initialStops'|'initialMetres'>>;
  terminalPatternPolicy?:Record<string,{initialStops?:number;initialMetres?:number}>;
  terminalRegionPolicy?:Record<string,Partial<import('@/src/services/terminalTracking').TerminalRegionPolicy>>;
  mostrarParadas?: boolean;
  modoSentido?: string;
  /**
   * Mapeamento de padraoVersaoId -> índice do segmento.
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
    idVisual?: string;
    runtime?: "rodoviario" | "ferroviario";
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
    linhaId?: string | null;
    sentidoId?: string | null;
    padraoOperacionalId?: string | null;
    padraoVersaoId?: string | null;
    proximaOcorrenciaParadaPadraoId?: string | null;
    tipoRota?: string | null;
    atualizadoEm?: string | null;
    fontePosicao?: string | null;
    qualidadePosicao?: string | null;
    presencaEstado?: string;
    presencaRotulo?: string;
    presencaIdadeSegundos?: number;
    gpsAtrasado?: boolean;
    backendUnified?: boolean;
    lastObservedSpeedKmh?: number;
    speedObservedAt?: number;
    gpsWarning?: string|null;
    gpsOpacity?: number;
    projectionUntil?: number;
    projectionSpeedKmh?: number;
    projectionMaxMetres?: number;
    vehicleState?: string;
    locationUncertain?: boolean;
    operationConfirmed?: boolean;
    terminalPresence?: TerminalPresence;
    contextConfidence?: 'confirmed'|'retained'|'inferred';
    contextValidatedAt?: number;
    directionConfidence?:'origin';
    routeConfidence?:'origin'|'shared';
    physicalRoutePattern?:string;
    projectionSpeedKind?:'observed'|'displacement';
    physicalMotionState?:'moving'|'pause_pending'|'stopped';
    motionReason?:string;
    nextStopReason?:string;
    motionRemainingMetres?:number;
    estimatedSpeedKmh?:number;
    unifiedSource?: string;
    backendRevision?: number;
    backendMotionEligible?: boolean;
    backendValidUntil?: number;
    physicalOnly?: boolean;
    physicalLocation?: string;
    lineOrigin?: string;
  }[];
}

export interface MapaOSMProps {
  tutorialRequest?: TutorialMapRequest | null;
  onTutorialEvent?: (event: TutorialMapEvent) => void;
  onTerminalVehiclesChange?: (vehicles:TerminalPresence[])=>void;
  onReady?: () => void;
  location: any;
  linhasParaMostrar: LinhaParaMostrar[];
  darkMode?: boolean;
  showTraffic?: boolean;
  estiloMapa?: EstiloMapaId;
  onStopPress?: (parada: Parada) => void;
  railVehicles?: RailVehicleForMap[];
  physicalVehicles?: PhysicalVehicle[];
}

export interface MapaOSMRef {
  centerOnUser: () => void;
  fitToCoordinates: (
    coordinates: { latitude: number; longitude: number }[],
  ) => void;
  focarVeiculo: (payload: {
    ordem?: string;
    idVisual?: string;
    railVehicleId?: string;
    railRunId?: string;
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
