import { useEffect, useMemo, useState } from "react";
import { observePhysicalPresence } from "./gpsHub";
import { physicalAge, physicalSnapshotIsNewer, type PhysicalVehicle } from "./physicalPresenceContract";
export { physicalAge, type PhysicalVehicle } from "./physicalPresenceContract";

export const PHYSICAL_PRESENCE_ENABLED =
  process.env.EXPO_PUBLIC_PHYSICAL_PRESENCE_ENABLED === "true";
export const PHYSICAL_TERMINAL_STOPS = [
  "5144O00424T9", "5151O00177C0", "5134BB0042T9",
] as const;

interface PhysicalSnapshot {
  facilityStopId: string;
  generation: number;
  publishedAt: string;
  vehicles: PhysicalVehicle[];
}

function validSnapshot(raw: unknown): raw is PhysicalSnapshot {
  if (!raw || typeof raw !== "object") return false;
  const item = raw as Partial<PhysicalSnapshot>;
  return typeof item.facilityStopId === "string"
    && PHYSICAL_TERMINAL_STOPS.some((id) => id === item.facilityStopId)
    && Number.isSafeInteger(item.generation) && Array.isArray(item.vehicles);
}

export function usePhysicalPresence(enabled = true): PhysicalVehicle[] {
  const [snapshots, setSnapshots] = useState<Record<string, PhysicalSnapshot>>({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!PHYSICAL_PRESENCE_ENABLED || !enabled) {
      setSnapshots({});
      return;
    }
    const owner = Symbol("physical-presence-map-radar");
    const stop = observePhysicalPresence(owner, PHYSICAL_TERMINAL_STOPS, (raw) => {
      if (raw && typeof raw === "object" && "resetPhysicalPresence" in raw) {
        setSnapshots({}); return;
      }
      if (!validSnapshot(raw)) return;
      setNow(Date.now());
      setSnapshots((previous) => !physicalSnapshotIsNewer(raw, previous[raw.facilityStopId])
        ? previous : { ...previous, [raw.facilityStopId]: raw });
    });
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => { stop(); clearInterval(timer); };
  }, [enabled]);
  return useMemo(() => !enabled ? [] : Object.values(snapshots).flatMap((snapshot) => snapshot.vehicles.filter((v) => v && v.facilityStopId === snapshot.facilityStopId))
    .filter((vehicle) => Number.isFinite(vehicle.latitude) && Number.isFinite(vehicle.longitude)
      && vehicle.latitude >= -90 && vehicle.latitude <= 90
      && vehicle.longitude >= -180 && vehicle.longitude <= 180
      && physicalAge(vehicle, now).visible), [enabled, snapshots, now]);
}
