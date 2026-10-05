import { config } from "@/src/config/env";
import {
  adaptarPosicaoRodoviariaV2,
  PosicaoRodoviariaV2Dto,
  VeiculoMapaRodoviario,
} from "./veiculosMapa";
import * as signalR from "@microsoft/signalr";

const HUB_URL = config.GPS_HUB_URL;

let connection: signalR.HubConnection | null = null;
const subscribers = new Set<(veiculos: VeiculoMapaRodoviario[]) => void>();

export function obterDiagnosticoGpsHub() {
  return { subscribers: subscribers.size, connectionState: connection?.state ?? "NotCreated" };
}

/**
 * Estrutura completa do payload SignalR (PosicaoVeiculoDto) — atualizada.
 */
export function iniciarGpsHub(
  onUpdate: (veiculos: VeiculoMapaRodoviario[]) => void,
): signalR.HubConnection {
  subscribers.add(onUpdate);
  if (__DEV__) console.log("[GpsHub] listener adicionado", obterDiagnosticoGpsHub());

  if (connection) return connection;

  connection = new signalR.HubConnectionBuilder()
    .withUrl(HUB_URL)
    .withAutomaticReconnect()
    .build();

  connection.on("PosicaoAtualizada", (payload: PosicaoRodoviariaV2Dto[]) => {
    const veiculos = Array.isArray(payload)
      ? payload.map((raw) => adaptarPosicaoRodoviariaV2(raw))
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
  onUpdate: (veiculos: VeiculoMapaRodoviario[]) => void,
): void {
  subscribers.delete(onUpdate);
  if (__DEV__) console.log("[GpsHub] listener removido", obterDiagnosticoGpsHub());
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

async function aguardarConexao(timeoutMs: number = 4000): Promise<boolean> {
  if (!connection) return false;

  const estadoAtual = () => connection?.state;
  if (estadoAtual() === signalR.HubConnectionState.Connected) return true;

  const start = Date.now();
  while (
    estadoAtual() === signalR.HubConnectionState.Connecting &&
    Date.now() - start < timeoutMs
  ) {
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return estadoAtual() === signalR.HubConnectionState.Connected;
}

export async function inscreverLinha(codigoLinha: string): Promise<void> {
  if (!connection) return;

  if (connection.state !== signalR.HubConnectionState.Connected) {
    await conectarGpsHub();
    const conectado = await aguardarConexao();
    if (!conectado) {
      console.warn("SignalR nao conectado para inscrever linha.");
      return;
    }
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

  if (connection.state !== signalR.HubConnectionState.Connected) {
    return;
  }

  try {
    await connection.invoke("CancelarLinha", codigoLinha);
    console.log("📴 cancelado:", codigoLinha);
  } catch (err) {
    console.error("Erro ao cancelar linha", err);
  }
}
