export interface PreferenciasRadarEspera { prioritarias: string[]; janelaMinutos: number }

/** Whitelist de preferências; dados de sessão nunca atravessam o armazenamento. */
export function normalizarPreferenciasRadar(valor: unknown): PreferenciasRadarEspera {
  const p = valor as Partial<PreferenciasRadarEspera> | null;
  const janela = p?.janelaMinutos;
  return {
    prioritarias: Array.isArray(p?.prioritarias)
      ? [...new Set(p.prioritarias.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [],
    janelaMinutos: typeof janela === 'number' && Number.isInteger(janela) && janela >= 2 && janela <= 15 ? janela : 10,
  };
}
