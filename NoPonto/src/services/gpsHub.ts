import { AppState, Platform } from "react-native";
import { config } from "@/src/config/env";
import {
  adaptarPosicaoRodoviariaV2,
  PosicaoRodoviariaV2Dto,
  VeiculoMapaRodoviario,
} from "./veiculosMapa";
import * as signalR from "@microsoft/signalr";
import { codigoLinhaEsvaziada, gpsSnapshotGuard } from "./gpsSnapshotGuard";
import { traceRoadBatch, traceRoadLineEmpty, traceRoadRaw } from './roadPresenceDiagnostics';

const HUB_URL = config.GPS_HUB_URL
  .replace(/^wss:/i, "https:")
  .replace(/^ws:/i, "http:");

let connection: signalR.HubConnection | null = null;
const donosInscricoes = new Map<symbol, Set<string>>();
const inscritas = new Set<string>();
let sincronizacao: Promise<void> = Promise.resolve();
let conexaoPendente: Promise<void> | null = null;
let geracaoConexao = 0;
const physicalListeners = new Set<(snapshot: unknown) => void>();
const physicalOwners = new Map<symbol, Set<string>>();
const physicalSubscribed = new Set<string>();
let physicalSynchronization: Promise<void> = Promise.resolve();
let suspenso = Platform.OS === 'android' && AppState.currentState === 'background';
let paradaPendente: Promise<void> = Promise.resolve();
const donoDireto = Symbol('gps-direct');
const linhasDiretas = new Set<string>();
const temDemanda = () => !suspenso && [...donosInscricoes.values(), ...physicalOwners.values()].some(ids => ids.size > 0);

function pararConexao(): Promise<void> {
  geracaoConexao++; inscritas.clear(); physicalSubscribed.clear();
  gpsSnapshotGuard.invalidarLeituras();
  paradaPendente = paradaPendente.catch(() => undefined).then(async () => {
    if (connection && connection.state !== signalR.HubConnectionState.Disconnected) await connection.stop();
  }).catch(error => console.warn('Falha ao suspender GPS', error));
  return paradaPendente;
}

function liberarSeOciosa(): void {
  void Promise.allSettled([sincronizacao, physicalSynchronization]).then(() => {
    if (!temDemanda()) return pararConexao();
  });
}

AppState.addEventListener('change', state => {
  if (Platform.OS !== 'android' || (state !== 'background' && state !== 'active')) return;
  const proximo = state === 'background';
  if (proximo === suspenso) return;
  suspenso = proximo;
  if (suspenso) void pararConexao();
  else { void reconciliarInscricoesGps(); void reconcilePhysicalPresence(); }
});

export function observePhysicalPresence(owner: symbol, stopIds: readonly string[],
  listener: (snapshot: unknown) => void): () => void {
  physicalListeners.add(listener);
  physicalOwners.set(owner, new Set(stopIds));
  // Reuse the one operational hub connection; no per-user HTTP polling.
  iniciarGpsHub(physicalNoop);
  void conectarGpsHub().then(reconcilePhysicalPresence).catch(() => console.warn('Inscrição física/unificada indisponível; aguardando reconexão.'));
  return () => {
    physicalListeners.delete(listener);
    physicalOwners.delete(owner);
    if (physicalOwners.size === 0) removerGpsHubListener(physicalNoop);
    void reconcilePhysicalPresence().catch(() => console.warn('Cancelamento físico/unificado indisponível.'));
  };
}
const physicalNoop = (_: VeiculoMapaRodoviario[]) => {};

function reconcilePhysicalPresence(): Promise<void> {
  physicalSynchronization = physicalSynchronization.catch(() => undefined).then(async () => {
    await conectarGpsHub();
    if (suspenso) return;
    if (connection?.state !== signalR.HubConnectionState.Connected) return;
    const geracao = geracaoConexao;
    const desired = () => new Set(suspenso || geracao !== geracaoConexao ? [] : [...physicalOwners.values()].flatMap((ids) => [...ids]));
    for (const id of [...physicalSubscribed]) if (!desired().has(id)) {
      await connection.invoke(id.startsWith('unified:') ? 'CancelarLocalizacaoUnificada' : 'CancelarPresencaFisica', id.startsWith('unified:') ? id.slice('unified:'.length) : id);
      if (geracao === geracaoConexao) physicalSubscribed.delete(id);
    }
    for (const id of desired()) if (!physicalSubscribed.has(id) && desired().has(id)) {
      try {
        await connection.invoke(id.startsWith('unified:') ? 'InscreverLocalizacaoUnificada' : 'InscreverPresencaFisica', id.startsWith('unified:') ? id.slice('unified:'.length) : id);
      } catch (error) {
        if (id.startsWith('unified:') && error instanceof Error && /unknown hub method|method.*does not exist|coorte indisponível/i.test(error.message)) {
          physicalListeners.forEach(listener => listener({ unifiedLocationUnavailable: true, lineCode: id.slice('unified:'.length) }));
          continue;
        }
        throw error;
      }
      if (geracao === geracaoConexao) physicalSubscribed.add(id);
    }
  }).catch(() => console.warn('Inscrição física/unificada indisponível; aguardando recuperação.'));
  liberarSeOciosa();
  return physicalSynchronization;
}

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
    if (suspenso) return;
    if (!await aguardarConexao()) return;
    const geracaoAtual = geracaoConexao;
    const desejadas = () => new Set(suspenso || geracaoAtual !== geracaoConexao ? [] : [...donosInscricoes.values()].flatMap((ids) => [...ids]));
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
  liberarSeOciosa();
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
    if (suspenso) return;
    if (!Array.isArray(payload) || payload.length === 0) return;
    traceRoadBatch('signalr_received',payload);
    const veiculos = gpsSnapshotGuard.filtrarSnapshot(payload
      .filter((raw) => {
        const valid=raw && typeof raw.ordem === "string" && raw.ordem.trim() && codigoLinhaEsvaziada(raw)!==null;
        if(!valid)traceRoadRaw('signalr_envelope',raw,'invalid_identity_or_line',false);
        return valid;
      })
      .map((raw) => adaptarPosicaoRodoviariaV2(raw)));
    if (veiculos.length === 0) return;
    subscribers.forEach((fn) => fn(veiculos));
  });

  connection.on("LinhaEsvaziada", (payload: unknown) => {
    if (suspenso) return;
    const codigo = codigoLinhaEsvaziada(payload);
    if (!codigo) return;
    traceRoadLineEmpty(codigo);
    gpsSnapshotGuard.registrarVazio(codigo);
    emptySubscribers.forEach((fn) => fn(codigo));
  });
  connection.on("PresencaFisicaAtualizada", (snapshot: unknown) => {
    if (suspenso) return;
    physicalListeners.forEach((listener) => listener(snapshot));
  });
  connection.on('LocalizacaoUnificadaAtualizada', (snapshot: unknown) => {
    if (suspenso) return;
    physicalListeners.forEach(listener => listener(snapshot));
  });

  connection.onreconnecting(() => { physicalListeners.forEach((fn) => fn({ resetPhysicalPresence: true })); gpsSnapshotGuard.invalidarLeituras(); console.log("🔄 reconectando SignalR..."); });
  connection.onreconnected(() => { gpsSnapshotGuard.invalidarLeituras(); geracaoConexao++; inscritas.clear(); physicalSubscribed.clear(); void reconciliarInscricoesGps(); void reconcilePhysicalPresence(); console.log("✅ reconectado"); });
  connection.onclose(() => { physicalListeners.forEach((fn) => fn({ resetPhysicalPresence: true })); gpsSnapshotGuard.invalidarLeituras(); geracaoConexao++; inscritas.clear(); physicalSubscribed.clear(); console.log("❌ conexão encerrada"); });

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
  await paradaPendente;
  if (!connection || !temDemanda()) return;

  if (conexaoPendente) { await conexaoPendente; return; }

  if (
    connection.state === signalR.HubConnectionState.Connected ||
    connection.state === signalR.HubConnectionState.Connecting
  ) {
    return;
  }

  conexaoPendente ??= connection.start().then(() => {
    gpsSnapshotGuard.invalidarLeituras();
    geracaoConexao++; inscritas.clear(); physicalSubscribed.clear(); console.log("✅ SignalR conectado");
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

// Direct subscriptions participate in ownership and cannot bypass AppState.
export async function inscreverLinha(codigoLinha: string): Promise<void> {
  linhasDiretas.add(codigoLinha);
  await atualizarInscricoesGps(donoDireto, [...linhasDiretas]);
}

export async function cancelarLinha(codigoLinha: string): Promise<void> {
  linhasDiretas.delete(codigoLinha);
  await atualizarInscricoesGps(donoDireto, [...linhasDiretas]);
}
