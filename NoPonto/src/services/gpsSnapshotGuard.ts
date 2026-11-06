import type { VeiculoMapaRodoviario } from "./veiculosMapa";
import { physicalAge, RETENTION_MS, LEGACY_RETENTION_MS, ROAD_PRESENCE_ENABLED } from "./roadPresence";
import { traceRoadPresence, tracesRoadVehicle } from './roadPresenceDiagnostics';

const SNAPSHOT_MAX_AGE_MS = ROAD_PRESENCE_ENABLED ? RETENTION_MS : LEGACY_RETENTION_MS;
// Request ordering is independent of visual retention.
const READ_WINDOW_MS = 180_000;

export function normalizarCodigoLinha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const codigo = value.trim().toUpperCase();
  return codigo.length > 0 && codigo.length <= 128 && !/[\p{Cc}\p{Cf}]/u.test(codigo) ? codigo : null;
}

export function codigoLinhaEsvaziada(payload: unknown): string | null {
  return payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? normalizarCodigoLinha((payload as Record<string, unknown>).codigoLinha) : null;
}

interface MarcaGps { timestamp: number; linha: string; removido: boolean; observacao: VeiculoMapaRodoviario }
interface LeituraLinha { codigo: string; criadaEm: number }

/** Ordering only: never renews GPS, fabricates position or changes presence/ETA. */
export class GpsSnapshotGuard {
  constructor(private readonly diagnosticStage = 'shared_gps_guard') {}
  private readonly marcas = new Map<string, MarcaGps>();
  private readonly leituras = new Map<string, LeituraLinha>();

  private podar(now: number) {
    for (const [id, marca] of this.marcas) {
      if (now - marca.timestamp > SNAPSHOT_MAX_AGE_MS) {
        traceRoadPresence(this.diagnosticStage,'gps_retention_expired',marca.observacao,{present:false});
        this.marcas.delete(id);
      }
    }
    for (const [codigo, leitura] of this.leituras) {
      if (now - leitura.criadaEm > READ_WINDOW_MS) this.leituras.delete(codigo);
    }
  }

  capturarLeitura(codigo: string): LeituraLinha {
    this.podar(Date.now());
    const atual = this.leituras.get(codigo);
    if (atual) return atual;
    const leitura = { codigo, criadaEm: Date.now() };
    // Evicting a token also invalidates its pending requests.
    if (this.leituras.size >= 5000) this.leituras.delete(this.leituras.keys().next().value!);
    this.leituras.set(codigo, leitura);
    return leitura;
  }

  leituraAtual(leitura: LeituraLinha): boolean {
    this.podar(Date.now());
    return this.leituras.get(leitura.codigo) === leitura;
  }

  invalidarLeituras(): void { this.leituras.clear(); }

  registrarVazio(codigo: string): void {
    this.podar(Date.now());
    this.leituras.delete(codigo);
    for (const marca of this.marcas.values()) {
      if (marca.linha === codigo) {
        marca.removido = true;
        traceRoadPresence(this.diagnosticStage,'explicit_line_empty',marca.observacao,{present:false});
      }
    }
  }

  filtrarSnapshot(posicoes: readonly VeiculoMapaRodoviario[], now = Date.now()): VeiculoMapaRodoviario[] {
    this.podar(now);
    const aceitas: VeiculoMapaRodoviario[] = [];
    // A batch may repeat an identity, including in reverse chronological order.
    const porId = new Map<string, VeiculoMapaRodoviario>();
    for (const p of posicoes) {
      const age = physicalAge(p,now);
      if (age === null || age > SNAPSHOT_MAX_AGE_MS) {
        traceRoadPresence(this.diagnosticStage,age===null?'invalid_physical_observation':'gps_retention_expired',p,{present:false});continue;
      }
      const atual = porId.get(p.idVisual);
      if (!atual || Date.parse(p.atualizadoEm!)>Date.parse(atual.atualizadoEm!)) porId.set(p.idVisual,p);
    }
    for (const p of porId.values()) {
      const linha = normalizarCodigoLinha(p.linha);
      const idade = physicalAge(p, now);
      if (!linha || idade === null || idade > SNAPSHOT_MAX_AGE_MS) {
        traceRoadPresence(this.diagnosticStage,'invalid_line_or_gps',p,{present:false});continue;
      }
      const timestamp = Date.parse(p.atualizadoEm!);
      const marca = this.marcas.get(p.idVisual);
      if (marca && (timestamp < marca.timestamp
        || (timestamp === marca.timestamp && (marca.removido || marca.linha !== linha)))) {
        traceRoadPresence(this.diagnosticStage,timestamp<marca.timestamp?'regressive_gps':marca.removido?'explicit_removal_blocks_equal_gps':'equal_gps_line_conflict',p,{present:false});continue;
      }
      if (!marca && this.marcas.size >= 5000) {
        traceRoadPresence(this.diagnosticStage,'guard_capacity',p,{present:false});continue;
      }
      // An equal timestamp is the same physical observation, even if other fields changed.
      const observacao = marca && timestamp===marca.timestamp ? marca.observacao : p;
      this.marcas.set(p.idVisual, { timestamp, linha, removido: false, observacao });
      this.leituras.delete(linha);
      aceitas.push(observacao);
      if(tracesRoadVehicle(observacao))traceRoadPresence(this.diagnosticStage,marca&&timestamp===marca.timestamp?'same_gps_observation_reused':'new_physical_gps_accepted',observacao,
        {present:true,previousLine:marca?.linha ?? null,previousGpsAt:marca?new Date(marca.timestamp).toISOString():null});
    }
    return aceitas;
  }
}

// Shared by SignalR and REST so one source cannot undo an observed removal.
export const gpsSnapshotGuard = new GpsSnapshotGuard();
