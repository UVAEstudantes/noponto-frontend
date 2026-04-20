export type ModalApiTransporte = "onibus" | "brt";

export type CoordenadaMapa = [number, number];

export interface LinhaTempoReal {
  id: string;
  nome: string;
  modal: ModalApiTransporte;
  sentido: string;
  intervalo: string;
  tarifa: number;
}

export interface VeiculoTempoReal {
  id: string;
  modal: ModalApiTransporte;
  linha: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  velocidade: number;
  direcao: number | null;
  sentido?: string;
  trajeto?: string;
}

export interface ItinerarioLinha {
  linha: string;
  modal: ModalApiTransporte;
  segmentos: CoordenadaMapa[][];
  ida?: CoordenadaMapa[];
  volta?: CoordenadaMapa[];
  destinoIda?: string;
  destinoVolta?: string;
}
