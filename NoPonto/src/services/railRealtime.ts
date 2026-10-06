import { api } from "@/src/services/api";
import {
  GeoJsonCoordinate,
  PreparedRailGeometry,
  PromiseCache,
  prepareRailGeometry,
} from "@/src/utils/railGeometry";

export interface RailVehicleSnapshot {
  railRunId: string;
  railVehicleId: string;
  trainCode: string;
  linhaId: string;
  sentidoId: string;
  padraoVersaoId: string;
  state: "InSegment" | "Dwell" | "AwaitingDeparture" | "TerminalHold";
  previousOccurrenceId?: string | null;
  nextOccurrenceId?: string | null;
  distanceAtReferenceMetres: number;
  referenceTimeUtc: string;
  targetDistanceMetres: number;
  targetTimeUtc: string;
  destination?: string | null;
  trainType?: string | null;
  platform?: string | null;
  positionSource: string;
  positionQuality: string;
  freshUntilUtc: string;
  lastRealtimeEvidenceUtc?: string | null;
  isEstimated: true;
  isClamped: boolean;
  isAtOriginTerminal?: boolean;
  scheduledDepartureAtUtc?: string | null;
  estimatedDepartureAtUtc?: string | null;
  secondsToDeparture?: number | null;
  lineName?: string | null;
  destinationName?: string | null;
  destinationStationId?: string | null;
  platformLabel?: string | null;
  nextStationName?: string | null;
  estimatedArrivalAtNextStationUtc?: string | null;
  secondsToNextStation?: number | null;
  operationalStatus?: "Live" | "Estimated" | "Scheduled";
}

export interface RailSnapshotResponse {
  generatedAtUtc: string;
  vehicles: RailVehicleSnapshot[];
}

export interface RailVehicleForMap extends RailVehicleSnapshot {
  geometry: PreparedRailGeometry;
}

const geometryCache = new PromiseCache<PreparedRailGeometry | null>();

export async function fetchRailSnapshot(filters?: {
  linhaId?: string;
  sentidoId?: string;
}) {
  const params: Record<string, string> = {};
  if (filters?.linhaId) params.linhaId = filters.linhaId;
  if (filters?.sentidoId) params.sentidoId = filters.sentidoId;
  const result = await api.get<RailSnapshotResponse>(
    "/rail/vehicles/snapshot",
    { params },
  );
  return result.ok && result.data ? result.data : null;
}

export function getRailGeometry(padraoVersaoId: string) {
  return geometryCache.get(padraoVersaoId, () =>
    api
      .get<{ geoJson?: { type?: string; coordinates?: GeoJsonCoordinate[] } }>(
        `/veiculos/padrao-versao/${padraoVersaoId}/geometria`,
      )
      .then((result) => {
        const geoJson = result.data?.geoJson;
        if (
          !result.ok ||
          geoJson?.type !== "LineString" ||
          !Array.isArray(geoJson.coordinates)
        )
          return null;
        return prepareRailGeometry(geoJson.coordinates);
      })
      .catch(() => null),
  );
}

export function clearRailGeometryCacheForTests() {
  geometryCache.clear();
}
