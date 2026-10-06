export type RotuloConfianca = "Ao vivo" | "Estimado" | "Programado";

export function rotuloConfianca(source?: string | null, quality?: string | null): RotuloConfianca {
  if (source === "ScheduledEstimated" || quality === "ScheduleOnly") return "Programado";
  if (source === "RealtimeGps" || source === "RealtimeEstimated"
    || quality === "RealtimeAnchored" || quality === "MultiSatelliteAnchored") return "Ao vivo";
  return "Estimado";
}
