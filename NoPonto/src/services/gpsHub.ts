import { config } from "@/src/config/env";
import {
  adaptarPosicaoRodoviariaV2,
  PosicaoRodoviariaV2Dto,
  VeiculoMapaRodoviario,
} from "./veiculosMapa";
import * as signalR from "@microsoft/signalr";
import { codigoLinhaEsvaziada, gpsSnapshotGuard } from "./gpsSnapshotGuard";

const HUB_URL = config.GPS_HUB_URL;

let connection: signalR.HubConnection | null = null;
const donosInscricoes = new Map<symbol, Set<string>>();
const inscritas = new Set<string>();
let sincronizacao: Promise<void> = Promise.resolve();
let conexaoPendente: Promise<void> | null = null;
let geracaoConexao = 0;

// Um único hub e união das inscrições dos consumidores ativos. Reconciliar serialmente evita
// que uma resposta atrasada reinscreva uma linha removida enquanto o invoke estava em andamento.
export function atualizarInscricoesGps(dono: symbol, codigos: readonly string[]): Promise<void> {
  if (codigos.length) donosInscricoes.set(dono, new Set(codigos));
  else donosInscricoes.delete(dono);
  return reconciliarInscricoesGps();
}
export function reconciliarInscricoesGps(): Promise<void> {
  sincronizacao = sincronizacao.catch(() => undefined).then(async () => {
    await conectarGpsHub();
    if (!await aguardarConexao()) return;
    const desejadas = () => new Set([...donosInscricoes.values()].flatMap((ids) => [...ids]));
    for (const codigo of [...inscritas]) {
      if (!desejadas().has(codigo)) {
        const geracao = geracaoConexao;
        try {
          await connection!.invoke("CancelarLinha", codigo);
          if (geracao === geracaoConexao) inscritas.delete(codigo);
        }
        catch (error) { console.warn("Falha ao cancelar inscrição GPS", error); }
      }
    }
    for (const codigo of desejadas()) {
      if (inscritas.has(codigo) || !desejadas().has(codigo)) continue;
      const geracao = geracaoConexao;
      try {
        await connection!.invoke("InscreverseLinha", codigo);
        if (geracao === geracaoConexao) inscritas.add(codigo);
      }
      catch (error) { console.warn("Falha ao inscrever linha GPS", error); }
    }
  });
  return sincronizacao;
}

const subscribers = new Set<(veiculos: VeiculoMapaRodoviario[]) => void>();
const emptySubscribers = new Set<(codigoLinha: string) => void>();

export function obterDiagnosticoGpsHub() {
  return { subscribers: subscribers.size, connectionState: connection?.state ?? "NotCreated" };
}

/**
 * Estrutura completa do payload SignalR (PosicaoVeiculoDto) — atualizada.
 */
export function iniciarGpsHub(
  onUpdate: (veiculos: VeiculoMapaRodoviario[]) => void,
  onEmpty?: (codigoLinha: string) => void,
): signalR.HubConnection {
  subscribers.add(onUpdate);
  if (onEmpty) emptySubscribers.add(onEmpty);
  if (__DEV__) console.log("[GpsHub] listener adicionado", obterDiagnosticoGpsHub());

  if (connection) return connection;

  connection = new signalR.HubConnectionBuilder()
    .withUrl(HUB_URL)
    .withAutomaticReconnect()
    .build();

  connection.on("PosicaoAtualizada", (payload: PosicaoRodoviariaV2Dto[]) => {
    if (!Array.isArray(payload) || payload.length === 0) return;
    const veiculos = gpsSnapshotGuard.filtrarSnapshot(payload
      .filter((raw) => raw && typeof raw.ordem === "string" && raw.ordem.trim()
        && codigoLinhaEsvaziada(raw) !== null)
      .map((raw) => adaptarPosicaoRodoviariaV2(raw)));
    if (veiculos.length === 0) return;
    console.log("🚍 realtime recebido:", veiculos.length);
    subscribers.forEach((fn) => fn(veiculos));
  });

  connection.on("LinhaEsvaziada", (payload: unknown) => {
    const codigo = codigoLinhaEsvaziada(payload);
    if (!codigo) return;
    gpsSnapshotGuard.registrarVazio(codigo);
    emptySubscribers.forEach((fn) => fn(codigo));
  });

  connection.onreconnecting(() => { gpsSnapshotGuard.invalidarLeituras(); console.log("🔄 reconectando SignalR..."); });
  connection.onreconnected(() => { gpsSnapshotGuard.invalidarLeituras(); geracaoConexao++; inscritas.clear(); void reconciliarInscricoesGps(); console.log("✅ reconectado"); });
  connection.onclose(() => { gpsSnapshotGuard.invalidarLeituras(); geracaoConexao++; inscritas.clear(); console.log("❌ conexão encerrada"); });

  return connection;
}

export function removerGpsHubListener(
  onUpdate: (veiculos: VeiculoMapaRodoviario[]) => void,
  onEmpty?: (codigoLinha: string) => void,
): void {
  subscribers.delete(onUpdate);
  if (onEmpty) emptySubscribers.delete(onEmpty);
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

  conexaoPendente ??= connection.start().then(() => {
    gpsSnapshotGuard.invalidarLeituras();
    geracaoConexao++; inscritas.clear(); console.log("✅ SignalR conectado");
  }).catch((err) => { console.error("Erro ao conectar SignalR", err); })
    .finally(() => { conexaoPendente = null; });
  await conexaoPendente;
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
