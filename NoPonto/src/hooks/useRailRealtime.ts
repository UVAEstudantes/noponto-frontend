import { config } from "@/src/config/env";
import {
  fetchRailSnapshot,
  getRailGeometry,
  RailVehicleForMap,
  RailVehicleSnapshot,
} from "@/src/services/railRealtime";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

interface RailRealtimeArgs {
  enabled: boolean;
  linhaId?: string;
  linhaIds?: readonly string[];
  permitirDemo?: boolean;
  sentidoId?: string;
  demoPadraoVersaoIds?: string[];
}

function demoVehicle(
  padraoVersaoId: string,
  totalLengthMetres: number,
  startedAt: number,
): RailVehicleSnapshot {
  const elapsed = ((Date.now() - startedAt) / 1000) % 240;
  const start = Date.now();
  if (elapsed < 120)
    return base(
      "rail-demo-run",
      "InSegment",
      padraoVersaoId,
      0,
      totalLengthMetres * 0.75,
      start,
      start + (120 - elapsed) * 1000,
    );
  if (elapsed < 150)
    return base(
      "rail-demo-run",
      "Dwell",
      padraoVersaoId,
      totalLengthMetres * 0.75,
      totalLengthMetres * 0.75,
      start,
      start,
    );
  if (elapsed < 180)
    return base(
      "rail-demo-run",
      "InSegment",
      padraoVersaoId,
      totalLengthMetres * 0.75,
      totalLengthMetres,
      start,
      start + (180 - elapsed) * 1000,
    );
  return base(
    "rail-demo-run",
    "TerminalHold",
    padraoVersaoId,
    totalLengthMetres,
    totalLengthMetres,
    start,
    start,
  );
}

function base(
  runId: string,
  state: RailVehicleSnapshot["state"],
  pattern: string,
  distance: number,
  target: number,
  reference: number,
  targetTime: number,
): RailVehicleSnapshot {
  return {
    railRunId: runId,
    railVehicleId: "rail-demo-vehicle",
    trainCode: "US195-DEMO",
    linhaId: "00000000-0000-0000-0000-000000000000",
    sentidoId: "00000000-0000-0000-0000-000000000000",
    padraoVersaoId: pattern,
    state,
    distanceAtReferenceMetres: distance,
    referenceTimeUtc: new Date(reference).toISOString(),
    targetDistanceMetres: target,
    targetTimeUtc: new Date(targetTime).toISOString(),
    destination: "Teste visual",
    trainType: "demo",
    platform: null,
    positionSource: "RealtimeEstimated",
    positionQuality: "RealtimeAnchored",
    freshUntilUtc: new Date(
      Math.max(targetTime, reference) + 15_000,
    ).toISOString(),
    lastRealtimeEvidenceUtc: new Date(reference).toISOString(),
    isEstimated: true,
    isClamped: state === "TerminalHold",
  };
}

export function useRailRealtime({
  enabled,
  linhaId,
  sentidoId,
  linhaIds,
  permitirDemo = true,
  demoPadraoVersaoIds = [],
}: RailRealtimeArgs) {
  const [vehicles, setVehicles] = useState<RailVehicleForMap[]>([]);
  const demoStart = useRef(Date.now());
  const chaveLinhas = linhaIds ? [...linhaIds].sort().join("\n") : undefined;
  const demoPadraoVersaoId = demoPadraoVersaoIds[0];

  useEffect(() => {
    if (!enabled) {
      setVehicles([]);
      return;
    }
    setVehicles([]);
    const ids = chaveLinhas === undefined ? null : new Set(chaveLinhas.split("\n"));
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (!active || AppState.currentState !== "active") return schedule();
      try {
        const snapshot = await fetchRailSnapshot({ linhaId, sentidoId });
        let values = (snapshot?.vehicles ?? []).filter((vehicle) => !ids || ids.has(vehicle.linhaId));
        if (values.length === 0 && permitirDemo && config.RAIL_DEMO && demoPadraoVersaoId) {
          const geometry = await getRailGeometry(demoPadraoVersaoId);
          if (geometry)
            values = [
              demoVehicle(
                demoPadraoVersaoId,
                geometry.totalLengthMetres,
                demoStart.current,
              ),
            ];
        }
        const unicos = new Map(values.map((vehicle) => [vehicle.railVehicleId || vehicle.railRunId, vehicle]));
        const hydrated = await Promise.all(
          [...unicos.values()].map(async (vehicle) => {
            const geometry = await getRailGeometry(vehicle.padraoVersaoId);
            return geometry ? { ...vehicle, geometry } : null;
          }),
        );
        if (active)
          setVehicles(hydrated.filter((x): x is RailVehicleForMap => x !== null));
      } catch (error) {
        if (active) setVehicles([]);
        console.warn("Snapshot ferroviário temporariamente indisponível", error);
      } finally { schedule(); }
    };
    const schedule = () => {
      if (active) timer = setTimeout(poll, config.RAIL_POLL_INTERVAL_MS);
    };
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, linhaId, sentidoId, chaveLinhas, permitirDemo, demoPadraoVersaoId]);

  return vehicles;
}
