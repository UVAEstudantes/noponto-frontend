export type RotuloConfianca = "Ao vivo" | "Estimado" | "Programado";

export function rotuloConfianca(source?: string | null, quality?: string | null, operationalStatus?: string | null): RotuloConfianca {
  if (operationalStatus != null) {
    if (operationalStatus === "Scheduled") return "Programado";
    if (operationalStatus === "Estimated") return "Estimado";
    if (operationalStatus === "Live") return "Ao vivo";
    return "Estimado";
  }
  if (source === "ScheduledEstimated" || quality === "ScheduleOnly") return "Programado";
  if (source === "RealtimeGps" || source === "RealtimeEstimated"
    || quality === "RealtimeAnchored" || quality === "MultiSatelliteAnchored") return "Ao vivo";
  return "Estimado";
}
