import type { RailVehicleForMap, RailVehicleSnapshot } from "./railRealtime";
import type { CategoriaTransporteV2 } from "@/src/types/estruturaV2";
import { inPresenceScope, physicalAge, RETENTION_MS, type PresenceScope } from './roadPresence';
import {
  statusFonteFerroviaria,
  type VeiculoMapa,
} from "@/src/types/veiculoMapa";

export interface PosicaoRodoviariaV2Dto {
  ordem: string;
  codigoLinha: string;
  tipoRota?: CategoriaTransporteV2 | null;
  linhaId?: string | null;
  sentidoId?: string | null;
  padraoOperacionalId?: string | null;
  padraoVersaoId?: string | null;
  topologiaPadrao?: string | null;
  proximaOcorrenciaParadaPadraoId?: string | null;
  latitude: number;
  longitude: number;
  velocidade: number;
  velocidadeMedia?: number | null;
  timestampGps: string;
  timestampServidor: string;
  latitudeAnterior?: number | null;
  longitudeAnterior?: number | null;
  timestampAnterior?: string | null;
  posicaoNaRota?: number | null;
  comprimentoRotaMetros?: number | null;
  itinerarioId?: string | null;
  bearing?: number | null;
  proximaParadaNome?: string | null;
  distanciaProximaParadaMetros?: number | null;
  status?: number;
}

export interface VeiculoMapaRodoviario extends VeiculoMapa {
  runtime: "rodoviario";
  modal: "onibus";
  padraoVersaoId: string | null;
  ordem: string;
  velocidade: number;
  velocidadeMedia?: number | null;
  direcao: number | null;
  status?: number;
  topologiaPadrao?: string | null;
  latitude: number;
  longitude: number;
  /** Aliases apenas de apresentação usados pelos componentes atuais. */
  id: string;
  linha: string;
  timestamp: number;
  proximaParadaNome?: string | null;
}

export type VeiculoMapaFerroviario = VeiculoMapa & RailVehicleForMap & {
  runtime: "ferroviario";
  modal: "trem";
  tipoRota: "trem";
  statusFonte: ReturnType<typeof statusFonteFerroviaria>;
  atualizadoEm: string | null;
};

function calcularDirecao(raw: PosicaoRodoviariaV2Dto): number | null {
  if (raw.bearing != null) return raw.bearing;
  if (raw.latitudeAnterior == null || raw.longitudeAnterior == null) return null;
  if (
    Math.abs(raw.latitude - raw.latitudeAnterior) < 1e-5 &&
    Math.abs(raw.longitude - raw.longitudeAnterior) < 1e-5
  ) return null;
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const dLon = toRad(raw.longitude - raw.longitudeAnterior);
  const y = Math.sin(dLon) * Math.cos(toRad(raw.latitude));
  const x = Math.cos(toRad(raw.latitudeAnterior)) * Math.sin(toRad(raw.latitude))
    - Math.sin(toRad(raw.latitudeAnterior)) * Math.cos(toRad(raw.latitude)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function adaptarPosicaoRodoviariaV2(
  raw: PosicaoRodoviariaV2Dto,
  tipoRota: CategoriaTransporteV2 = raw.tipoRota ?? "onibus",
): VeiculoMapaRodoviario {
  return {
    idVisual: `road:${raw.ordem}`,
    id: raw.ordem,
    runtime: "rodoviario",
    modal: "onibus",
    tipoRota,
    linhaId: raw.linhaId ?? null,
    sentidoId: raw.sentidoId ?? null,
    padraoOperacionalId: raw.padraoOperacionalId ?? null,
    padraoVersaoId: raw.padraoVersaoId ?? null,
    codigoVeiculoOuTrem: raw.ordem,
    codigoLinha: raw.codigoLinha.trim().toUpperCase(),
    linha: raw.codigoLinha.trim().toUpperCase(),
    latitude: raw.latitude,
    longitude: raw.longitude,
    posicaoNaRota: raw.posicaoNaRota ?? null,
    comprimentoRotaMetros: raw.comprimentoRotaMetros ?? null,
    atualizadoEm: raw.timestampGps,
    timestamp: new Date(raw.timestampGps).getTime(),
    fontePosicao: "RealtimeGps",
    qualidadePosicao: null,
    statusFonte: null,
    proximaParada: raw.proximaParadaNome ?? null,
    proximaParadaNome: raw.proximaParadaNome ?? null,
    distanciaProximaParadaMetros: raw.distanciaProximaParadaMetros ?? null,
    proximaOcorrenciaParadaPadraoId:
      raw.proximaOcorrenciaParadaPadraoId ?? null,
    ordem: raw.ordem,
    velocidade: raw.velocidade,
    velocidadeMedia: raw.velocidadeMedia ?? null,
    direcao: calcularDirecao(raw),
    status: raw.status ?? 0,
    topologiaPadrao: raw.topologiaPadrao ?? null,
    raw,
  };
}

/** Cada evento SignalR é um snapshot completo de uma linha. */
export function reconciliarSnapshotsRodoviarios<T extends { linha: string }>(
  atuais: readonly T[], recebidos: readonly T[],
  presence?: {enabled: boolean; now: number},
): T[] {
  if (recebidos.length === 0) return presence?.enabled ? atuais.filter(v=>{
    const age=physicalAge(v as unknown as VeiculoMapa,presence.now);return age!==null && age<=RETENTION_MS;
  }).slice(0,5000) : [...atuais];
  const porLinha = new Map<string, T[]>();
  recebidos.forEach((veiculo) => {
    const linha = veiculo.linha.trim().toUpperCase();
    const grupo = porLinha.get(linha) ?? [];
    grupo.push(veiculo);
    porLinha.set(linha, grupo);
  });
  const linhasAtualizadas = new Set(porLinha.keys());
  const receivedIds = new Set(recebidos.map(v=>(v as unknown as VeiculoMapa).idVisual));
  const result = atuais.filter((veiculo) =>
    !linhasAtualizadas.has(veiculo.linha.trim().toUpperCase())
      && (!presence?.enabled || !receivedIds.has((veiculo as unknown as VeiculoMapa).idVisual)))
    .concat(...porLinha.values());
  if (presence?.enabled) {
    const ids = new Set(result.map(v=>(v as unknown as VeiculoMapa).idVisual));
    for (const v of atuais) {
      const road = v as unknown as VeiculoMapa;
      const age = physicalAge(road,presence.now);
      if (!ids.has(road.idVisual) && age!==null && age<=RETENTION_MS) result.push(v);
    }
    return result.filter(v=>{const age=physicalAge(v as unknown as VeiculoMapa,presence.now);return age!==null && age<=RETENTION_MS;}).slice(0,5000);
  }
  return result;
}

export function adaptarRailParaMapa(
  vehicle: RailVehicleForMap,
): VeiculoMapaFerroviario {
  const statusFonte = vehicle.operationalStatus === "Live" ? "Ao vivo"
    : vehicle.operationalStatus === "Estimated" ? "Estimado"
    : vehicle.operationalStatus === "Scheduled" ? "Programado"
    : statusFonteFerroviaria(vehicle.positionSource, vehicle.positionQuality);
  const possuiEvidenciaRealtime = statusFonte !== "Programado"
    && Boolean(vehicle.lastRealtimeEvidenceUtc);
  return {
    ...vehicle,
    idVisual: `rail:${vehicle.railVehicleId || vehicle.railRunId}`,
    runtime: "ferroviario",
    modal: "trem",
    tipoRota: "trem",
    padraoOperacionalId: null,
    codigoVeiculoOuTrem: vehicle.trainCode || null,
    codigoLinha: null,
    latitude: null,
    longitude: null,
    posicaoNaRota: vehicle.distanceAtReferenceMetres,
    comprimentoRotaMetros: vehicle.geometry.totalLengthMetres,
    atualizadoEm: possuiEvidenciaRealtime
      ? (vehicle.lastRealtimeEvidenceUtc ?? null)
      : null,
    fontePosicao: vehicle.positionSource,
    qualidadePosicao: vehicle.positionQuality,
    statusFonte,
    proximaParada: vehicle.nextStationName ?? null,
    distanciaProximaParadaMetros: null,
    proximaOcorrenciaParadaPadraoId: vehicle.nextOccurrenceId ?? null,
    raw: vehicle as RailVehicleSnapshot,
  };
}

export function filtrarVeiculosPorPadroesVisiveis<T extends VeiculoMapa>(
  vehicles: T[],
  padroesVersoesVisiveis?: ReadonlySet<string> | null,
  presence?: PresenceScope,
) {
  if (presence?.enabled) return vehicles.filter(vehicle => inPresenceScope(vehicle,presence)
    && (!padroesVersoesVisiveis || (vehicle.padraoVersaoId != null
      ? padroesVersoesVisiveis.has(vehicle.padraoVersaoId)
        || (!!presence.knownVersions && !presence.knownVersions.has(vehicle.padraoVersaoId)) : true)));
  if (!padroesVersoesVisiveis) return vehicles;
  return vehicles.filter((vehicle) =>
    vehicle.padraoVersaoId != null
      && padroesVersoesVisiveis.has(vehicle.padraoVersaoId),
  );
}

export interface FiltroVeiculoFerroviario {
  linhaId: string;
  sentidoId?: string;
  padraoVersaoIds: ReadonlySet<string>;
}

export function filtrarVeiculosFerroviariosVisiveis<T extends {
  linhaId: string | null;
  sentidoId: string | null;
  padraoVersaoId: string | null;
}>(
  vehicles: T[],
  filtros: readonly FiltroVeiculoFerroviario[],
) {
  return vehicles.filter((vehicle) => filtros.some((filtro) =>
    vehicle.linhaId === filtro.linhaId
    && (!filtro.sentidoId || vehicle.sentidoId === filtro.sentidoId)
    && (filtro.padraoVersaoIds.size === 0
      || (vehicle.padraoVersaoId != null
        && filtro.padraoVersaoIds.has(vehicle.padraoVersaoId))),
  ));
}
