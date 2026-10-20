import type { VeiculoMapaRodoviario } from "./veiculosMapa";
import { physicalAge, RETENTION_MS } from "./roadPresence";

export function normalizarCodigoLinha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const codigo = value.trim().toUpperCase();
  return codigo.length > 0 && codigo.length <= 128 && !/[\p{Cc}\p{Cf}]/u.test(codigo) ? codigo : null;
}

export function codigoLinhaEsvaziada(payload: unknown): string | null {
  return payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? normalizarCodigoLinha((payload as Record<string, unknown>).codigoLinha) : null;
}

interface MarcaGps { timestamp: number; linha: string; removido: boolean }
interface LeituraLinha { codigo: string; criadaEm: number }

/** Ordering only: never renews GPS, fabricates position or changes presence/ETA. */
export class GpsSnapshotGuard {
  private readonly marcas = new Map<string, MarcaGps>();
  private readonly leituras = new Map<string, LeituraLinha>();

  private podar(now: number) {
    for (const [id, marca] of this.marcas) {
      if (now - marca.timestamp > RETENTION_MS) this.marcas.delete(id);
    }
    for (const [codigo, leitura] of this.leituras) {
      if (now - leitura.criadaEm > RETENTION_MS) this.leituras.delete(codigo);
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
      if (marca.linha === codigo) marca.removido = true;
    }
  }

  filtrarSnapshot(posicoes: readonly VeiculoMapaRodoviario[], now = Date.now()): VeiculoMapaRodoviario[] {
    this.podar(now);
    const aceitas: VeiculoMapaRodoviario[] = [];
    for (const p of posicoes) {
      const linha = normalizarCodigoLinha(p.linha);
      const idade = physicalAge(p, now);
      if (!linha || idade === null || idade > RETENTION_MS) continue;
      const timestamp = Date.parse(p.atualizadoEm!);
      const marca = this.marcas.get(p.idVisual);
      if (marca && (timestamp < marca.timestamp
        || (timestamp === marca.timestamp && (marca.removido || marca.linha !== linha)))) continue;
      if (!marca && this.marcas.size >= 5000) continue;
      this.marcas.set(p.idVisual, { timestamp, linha, removido: false });
      this.leituras.delete(linha);
      aceitas.push(p);
    }
    return aceitas;
  }
}

// Shared by SignalR and REST so one source cannot undo an observed removal.
export const gpsSnapshotGuard = new GpsSnapshotGuard();
