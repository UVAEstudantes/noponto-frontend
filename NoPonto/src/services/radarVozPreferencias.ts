export type VozRadar = "lia" | "caio" | "device";
export type TipoAnuncioRadar = "brief" | "standard" | "detailed";
export type PoliticaVeiculosRadar = "nearest" | "nextAndFavorites" | "allRelevant";
export type FrequenciaAvisosRadar = "essential" | "balanced" | "eachUpdate";
export type RotaSaidaVozRadar = {
  routeType: string;
  deviceName?: string | null;
  automaticHeadphone: boolean;
  authorized: boolean;
  requiresConfirmation: boolean;
};

const DIGITOS_POR_EXTENSO = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];

export function formatarCodigoLinhaParaFala(text: string) {
  return text.replace(/\b(linhas?)(\s+)(\d{3,})\b/giu, (_match, referencia: string, espaco: string, codigo: string) =>
    referencia + espaco + [...codigo].map((digit) => DIGITOS_POR_EXTENSO[Number(digit)]).join(" "),
  );
}

export function precisaConfirmarBluetoothRadar(route: RotaSaidaVozRadar | null): boolean {
  return route?.routeType === "bluetooth_a2dp" && !route.automaticHeadphone && !route.authorized;
}

export interface PreferenciasVozRadar {
  enabled: boolean;
  voiceId: VozRadar;
  announcementStyle: TipoAnuncioRadar;
  advanceMinutes: number;
  announceArriving: boolean;
  vehicleSelection: PoliticaVeiculosRadar;
  announcementFrequency: FrequenciaAvisosRadar;
  headphonesOnly: boolean;
  soundBeforeSpeech: boolean;
}

export const PREFERENCIAS_VOZ_RADAR_PADRAO: PreferenciasVozRadar = {
  enabled: false,
  voiceId: "lia",
  announcementStyle: "standard",
  advanceMinutes: 7,
  announceArriving: true,
  vehicleSelection: "allRelevant",
  announcementFrequency: "balanced",
  headphonesOnly: true,
  soundBeforeSpeech: false,
};

export function normalizarPreferenciasVozRadar(value: unknown): PreferenciasVozRadar {
  const p = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const legacyThresholds = Array.isArray(p.alertAtMinutes)
    ? p.alertAtMinutes.filter((minute): minute is number =>
      typeof minute === "number" && Number.isInteger(minute) && minute >= 0 && minute <= 30)
    : [];
  const advanceMinutes = typeof p.advanceMinutes === "number" && Number.isInteger(p.advanceMinutes)
    ? Math.max(1, Math.min(15, p.advanceMinutes))
    : Math.min(15, legacyThresholds.filter((minute) => minute > 0).sort((a, b) => b - a)[0] ?? PREFERENCIAS_VOZ_RADAR_PADRAO.advanceMinutes);
  return {
    enabled: typeof p.enabled === "boolean" ? p.enabled : false,
    voiceId: p.voiceId === "lia" || p.voiceId === "caio" || p.voiceId === "device" ? p.voiceId : "lia",
    announcementStyle: p.announcementStyle === "brief" || p.announcementStyle === "standard" || p.announcementStyle === "detailed"
      ? p.announcementStyle : "standard",
    advanceMinutes,
    announceArriving: typeof p.announceArriving === "boolean"
      ? p.announceArriving : Array.isArray(p.alertAtMinutes)
        ? legacyThresholds.includes(0) : PREFERENCIAS_VOZ_RADAR_PADRAO.announceArriving,
    vehicleSelection: p.vehicleSelection === "nearest" || p.vehicleSelection === "nextAndFavorites" || p.vehicleSelection === "allRelevant"
      ? p.vehicleSelection
      : p.vehicleSelection === "preferPriority" || p.vehicleSelection === "priorityOnly"
        ? "nextAndFavorites" : "allRelevant",
    announcementFrequency: p.announcementFrequency === "essential" || p.announcementFrequency === "balanced" || p.announcementFrequency === "eachUpdate"
      ? p.announcementFrequency
      : p.repeatIntervalMinutes === 0 ? "essential" : "balanced",
    headphonesOnly: typeof p.headphonesOnly === "boolean" ? p.headphonesOnly : true,
    soundBeforeSpeech: typeof p.soundBeforeSpeech === "boolean" ? p.soundBeforeSpeech : false,
  };
}
