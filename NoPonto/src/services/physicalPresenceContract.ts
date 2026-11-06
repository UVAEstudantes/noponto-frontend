import {GPS_POLICY,gpsPresentation} from './gpsPresentationPolicy';
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
  const age=gpsPresentation(Date.parse(vehicle.physicalAt),now,GPS_POLICY);
  return age.visible
    ? { visible: true, delayed: age.delayed, opacity: age.opacity, seconds }
    : { visible: false, delayed: false, opacity: 0, seconds };
}

// Legacy endpoint guard only. Public radar uses terminalRadarVehicles, never this guard alone.
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


// Only reviewed geometry confirms interior; unknown precision never does.
export const physicalLocationLabels: Record<string, string> = {
  InsideReviewedGeometry: "No terminal",
  NearTerminal: "Próximo ao terminal",
  UncertainLocation: "Localização incerta · precisão GPS não confirmada",
  Outside: "Fora da área do terminal",
};
export function physicalLocationLabel(vehicle: PhysicalVehicle): string {
  return physicalLocationLabels[vehicle.location] ?? physicalLocationLabels.UncertainLocation;
}
