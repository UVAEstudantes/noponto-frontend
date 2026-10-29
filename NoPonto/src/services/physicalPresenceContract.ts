export interface PhysicalVehicle {
  key: string;
  modal: "onibus" | "brt";
  provider: string;
  originalVehicleId: string;
  latitude: number;
  longitude: number;
  physicalAt: string;
  speedKmh: number | null;
  lineId: string | null;
  serviceCode: string | null;
  lineState: string;
  lineValidatedAt: string | null;
  location: string;
  facilityStopId: string;
}

export function physicalAge(vehicle: PhysicalVehicle, now: number):
  { visible: boolean; delayed: boolean; opacity: number; seconds: number } {
  const seconds = (now - Date.parse(vehicle.physicalAt)) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 && seconds < 600
    ? { visible: true, delayed: seconds >= 300, opacity: seconds >= 300 ? 0.55 : 1, seconds }
    : { visible: false, delayed: false, opacity: 0, seconds };
}

// Eligibility for a separate terminal section at ANY stop served by this line.
// Facility identity stays on the item; it never becomes an arrival at the selected stop.
export function physicalRadarEligible(vehicle: PhysicalVehicle, modal: string,
  servedLineIds: readonly string[], now: number): boolean {
  return physicalAge(vehicle, now).visible && vehicle.speedKmh === 0
    && (modal === "todos" || modal === vehicle.modal)
    && vehicle.lineId != null && servedLineIds.includes(vehicle.lineId)
    && (vehicle.lineState === "Informed" || vehicle.lineState === "Inherited")
    && vehicle.facilityStopId.length > 0;
}

export function physicalFacilityName(stopId: string): string {
  return ({ "5144O00424T9": "Terminal Campo Grande", "5151O00177C0": "Terminal Magarça",
    "5134BB0042T9": "Terminal Deodoro" } as Record<string, string>)[stopId] ?? "terminal informado";
}

export function physicalSnapshotIsNewer(next: { publishedAt: string; generation: number },
  previous?: { publishedAt: string; generation: number }): boolean {
  const nextTime = Date.parse(next.publishedAt);
  if (!Number.isFinite(nextTime)) return false;
  if (!previous) return true;
  const previousTime = Date.parse(previous.publishedAt);
  return nextTime > previousTime || nextTime === previousTime && next.generation > previous.generation;
}
