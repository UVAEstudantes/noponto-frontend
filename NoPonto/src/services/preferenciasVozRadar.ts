import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  normalizarPreferenciasVozRadar,
  PREFERENCIAS_VOZ_RADAR_PADRAO,
  type RotaSaidaVozRadar,
  type PreferenciasVozRadar,
  type VozRadar,
} from "./radarVozPreferencias";
export * from "./radarVozPreferencias";

const CHAVE = "@noponto/radar-voice-preferences:v1";
const PACOTES_RADAR_NATIVO = new Set([
  "com.guilhermedesales.nononto.dev",
  "com.guilhermedesales.nononto.nativeprobe",
]);
const FAMILIAS: Record<Exclude<VozRadar, "device">, string> = {
  lia: "pt-br-x-pte",
  caio: "pt-br-x-ptd",
};

function radarNativoConfigurado() {
  return Platform.OS === "android"
    && Constants.expoConfig?.extra?.nativeRadarV1Enabled === true
    && PACOTES_RADAR_NATIVO.has(Constants.expoConfig.android?.package ?? "");
}

type ModuloRadarVoz = {
  saveVoicePreferences?: (json: string) => Promise<boolean>;
  isVoiceMuted?: () => Promise<boolean>;
  setVoiceMuted?: (muted: boolean) => Promise<boolean>;
  getVoiceOutputRouteStatus?: () => Promise<RotaSaidaVozRadar>;
  authorizeCurrentBluetoothOutput?: () => Promise<boolean>;
};

async function moduloRadarVoz(): Promise<ModuloRadarVoz | null> {
  if (!radarNativoConfigurado()) return null;
  try {
    const { requireNativeModule } = await import("expo-modules-core");
    return requireNativeModule<ModuloRadarVoz>("RadarNativeNotification");
  } catch {
    return null;
  }
}

export async function carregarPreferenciasVozRadar() {
  const value = await AsyncStorage.getItem(CHAVE);
  if (!value) return { ...PREFERENCIAS_VOZ_RADAR_PADRAO };
  try {
    return normalizarPreferenciasVozRadar(JSON.parse(value));
  } catch {
    return { ...PREFERENCIAS_VOZ_RADAR_PADRAO };
  }
}

/** AsyncStorage serves Expo Go; the same JSON is mirrored to SharedPreferences in Native Probe. */
export async function salvarPreferenciasVozRadar(value: PreferenciasVozRadar): Promise<boolean> {
  const preferences = normalizarPreferenciasVozRadar(value);
  const json = JSON.stringify(preferences);
  await AsyncStorage.setItem(CHAVE, json);
  if (!radarNativoConfigurado()) return true;
  const native = await moduloRadarVoz();
  return native?.saveVoicePreferences ? native.saveVoicePreferences(json) : false;
}

export async function consultarVozSilenciadaRadar(): Promise<boolean> {
  const native = await moduloRadarVoz();
  if (!native?.isVoiceMuted) return false;
  return native.isVoiceMuted().catch(() => false);
}

export async function definirVozSilenciadaRadar(muted: boolean): Promise<boolean> {
  if (!radarNativoConfigurado()) return true;
  const native = await moduloRadarVoz();
  return native?.setVoiceMuted ? native.setVoiceMuted(muted).catch(() => false) : false;
}

export async function consultarRotaSaidaVozRadar(): Promise<RotaSaidaVozRadar | null> {
  const native = await moduloRadarVoz();
  return native?.getVoiceOutputRouteStatus ? native.getVoiceOutputRouteStatus().catch(() => null) : null;
}

export async function autorizarRotaBluetoothVozRadar(): Promise<boolean> {
  const native = await moduloRadarVoz();
  return native?.authorizeCurrentBluetoothOutput ? native.authorizeCurrentBluetoothOutput().catch(() => false) : false;
}

function isPtBr(language: string) {
  return language.replace(/_/g, "-").toLowerCase().startsWith("pt-br");
}

function prioridadeLocal(voice: Speech.Voice) {
  const metadata = voice as Speech.Voice & {
    localService?: boolean;
    networkConnectionRequired?: boolean;
  };
  if (typeof metadata.localService === "boolean") return metadata.localService ? 0 : 2;
  if (typeof metadata.networkConnectionRequired === "boolean") return metadata.networkConnectionRequired ? 2 : 0;
  const identity = (voice.identifier + " " + voice.name).toLowerCase();
  if (/(?:^|[-_.])local(?:$|[-_.])/.test(identity)) return 0;
  if (/network|online/.test(identity)) return 2;
  return 1;
}

export type ResolucaoVozRadar = {
  voice: Speech.Voice | null;
  origem: "familia" | "fallback-pt-br" | "dispositivo" | "padrao";
};

export function resolverVozRadar(available: Speech.Voice[], voiceId: VozRadar): ResolucaoVozRadar {
  if (voiceId === "device") return { voice: null, origem: "dispositivo" };
  const ptBr = available.filter((voice) => isPtBr(voice.language));
  const family = FAMILIAS[voiceId];
  const familyVoices = ptBr.filter((voice) =>
    (voice.identifier + " " + voice.name).replace(/_/g, "-").toLowerCase().includes(family),
  );
  const rank = (a: Speech.Voice, b: Speech.Voice) =>
    prioridadeLocal(a) - prioridadeLocal(b)
      || Number(b.quality === Speech.VoiceQuality.Enhanced) - Number(a.quality === Speech.VoiceQuality.Enhanced);
  const voice = familyVoices.sort(rank)[0];
  if (voice) return { voice, origem: "familia" };
  const fallback = ptBr.sort(rank)[0];
  return fallback
    ? { voice: fallback, origem: "fallback-pt-br" }
    : { voice: null, origem: "padrao" };
}
