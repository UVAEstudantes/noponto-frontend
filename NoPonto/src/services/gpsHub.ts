import { config } from "@/src/config/env";
import { VeiculoTempoReal } from "@/src/types/transporte";
import * as signalR from "@microsoft/signalr";

const HUB_URL = config.GPS_HUB_URL;

let connection: signalR.HubConnection | null = null;
const subscribers = new Set<(veiculos: VeiculoTempoReal[]) => void>();

/**
 * Estrutura completa do payload SignalR (PosicaoVeiculoDto) — atualizada.
 */
interface PosicaoVeiculoRaw {
  ordem: string;
  codigoLinha: string;
  latitude: number;
  longitude: number;
  velocidade: number;
  velocidadeMedia?: number | null;
  timestampGps: string;
  timestampServidor: string;
  latitudeAnterior?: number | null;
  longitudeAnterior?: number | null;
  timestampAnterior?: string | null;
  posicaoNaRota?: number | null;
  comprimentoRotaMetros?: number | null;
  itinerarioId?: string | null;
  bearing?: number | null;
  proximaParadaNome?: string | null;
  distanciaProximaParadaMetros?: number | null;
  /** 0 = Ativo, 1 = SemSinal, 2 = Inativo */
  status?: number;
}

/**
 * Converte o payload bruto do SignalR para VeiculoTempoReal.
 * Prioriza o campo `bearing` que o backend já calcula.
 * Se `bearing` for nulo, calcula a partir da posição anterior.
 */
function converterPosicao(raw: PosicaoVeiculoRaw): VeiculoTempoReal {
  // Usa o bearing do backend se disponível
  let direcao: number | null = raw.bearing ?? null;

  // Fallback: calcula a partir das posições anterior/atual
  if (
    direcao === null &&
    raw.latitudeAnterior != null &&
    raw.longitudeAnterior != null
  ) {
    const lat1 = raw.latitudeAnterior;
    const lon1 = raw.longitudeAnterior;
    const lat2 = raw.latitude;
    const lon2 = raw.longitude;

    if (Math.abs(lat2 - lat1) >= 1e-5 || Math.abs(lon2 - lon1) >= 1e-5) {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLon = toRad(lon2 - lon1);
      const y = Math.sin(dLon) * Math.cos(toRad(lat2));
      const x =
        Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
      const bearing = (Math.atan2(y, x) * 180) / Math.PI;
      direcao = (bearing + 360) % 360;
    }
  }

  return {
    id: raw.ordem,
    modal: "onibus",
    linha: raw.codigoLinha.trim().toUpperCase(),
    latitude: raw.latitude,
    longitude: raw.longitude,
    timestamp: new Date(raw.timestampGps).getTime(),
    velocidade: raw.velocidade,
    velocidadeMedia: raw.velocidadeMedia ?? null,
    direcao,
    posicaoNaRota: raw.posicaoNaRota ?? null,
    comprimentoRotaMetros: raw.comprimentoRotaMetros ?? null,
    itinerarioId: raw.itinerarioId ?? null,
    proximaParadaNome: raw.proximaParadaNome ?? null,
    distanciaProximaParadaMetros: raw.distanciaProximaParadaMetros ?? null,
    status: raw.status ?? 0,
  };
}

export function iniciarGpsHub(
  onUpdate: (veiculos: VeiculoTempoReal[]) => void,
): signalR.HubConnection {
  subscribers.add(onUpdate);

  if (connection) return connection;

  connection = new signalR.HubConnectionBuilder()
    .withUrl(HUB_URL)
    .withAutomaticReconnect()
    .build();

  connection.on("PosicaoAtualizada", (payload: PosicaoVeiculoRaw[]) => {
    const veiculos = Array.isArray(payload)
      ? payload.map(converterPosicao)
      : [];
    console.log("🚍 realtime recebido:", veiculos.length);
    subscribers.forEach((fn) => fn(veiculos));
  });

  connection.onreconnecting(() => console.log("🔄 reconectando SignalR..."));
  connection.onreconnected(() => console.log("✅ reconectado"));
  connection.onclose(() => console.log("❌ conexão encerrada"));

  return connection;
}

export function removerGpsHubListener(
  onUpdate: (veiculos: VeiculoTempoReal[]) => void,
): void {
  subscribers.delete(onUpdate);
}

export async function conectarGpsHub(): Promise<void> {
  if (!connection) return;

  if (
    connection.state === signalR.HubConnectionState.Connected ||
    connection.state === signalR.HubConnectionState.Connecting
  ) {
    return;
  }

  try {
    await connection.start();
    console.log("✅ SignalR conectado");
  } catch (err) {
    console.error("Erro ao conectar SignalR", err);
  }
}

export async function inscreverLinha(codigoLinha: string): Promise<void> {
  if (!connection) return;

  if (connection.state !== signalR.HubConnectionState.Connected) {
    await conectarGpsHub();
  }

  try {
    await connection.invoke("InscreverseLinha", codigoLinha);
    console.log("📡 inscrito na linha:", codigoLinha);
  } catch (err) {
    console.error("Erro ao inscrever linha", err);
  }
}

export async function cancelarLinha(codigoLinha: string): Promise<void> {
  if (!connection) return;

  try {
    await connection.invoke("CancelarLinha", codigoLinha);
    console.log("📴 cancelado:", codigoLinha);
  } catch (err) {
    console.error("Erro ao cancelar linha", err);
  }
}
