import { api } from "./api";
import type { ParadaV2 } from "../types/estruturaV2";

const cache = new Map<string, Promise<ParadaV2 | null>>();
export function metadataParadaRadar(paradaId: string): Promise<ParadaV2 | null> {
  const existente = cache.get(paradaId);
  if (existente) return existente;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const consulta = api.get<ParadaV2>(`/paradas/${paradaId}`, { signal: controller.signal })
    .then((resposta) => {
      if (!resposta.ok || !resposta.data || resposta.data.id !== paradaId) {
        cache.delete(paradaId);
        return null;
      }
      return resposta.data;
    }).catch(() => { cache.delete(paradaId); return null; })
    .finally(() => clearTimeout(timeout));
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(paradaId, consulta);
  return consulta;
}
