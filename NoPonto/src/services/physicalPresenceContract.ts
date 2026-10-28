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
