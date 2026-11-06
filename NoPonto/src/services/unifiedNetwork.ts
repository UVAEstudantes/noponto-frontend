export interface UnifiedCapabilities {
  schemaVersion: 1; enabled: boolean; canonical: boolean; lineCodes: string[];
}
export const isUnifiedCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(value);

export function parseUnifiedCapabilities(raw: unknown): UnifiedCapabilities | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as UnifiedCapabilities;
  return c.schemaVersion === 1 && typeof c.enabled === 'boolean' && typeof c.canonical === 'boolean'
    && Array.isArray(c.lineCodes) && c.lineCodes.length <= 600 && c.lineCodes.every(isUnifiedCode)
    && new Set(c.lineCodes).size === c.lineCodes.length ? c : null;
}
export function selectUnifiedCodes(requested: readonly string[], capabilities: UnifiedCapabilities | null,
  legacy: readonly string[]): string[] {
  const supported = new Set(capabilities ? capabilities.enabled ? capabilities.lineCodes : [] : legacy);
  // Only lines requested by a map or stop-scoped consumer, never the catalog itself.
  return [...new Set(requested)].filter(c => isUnifiedCode(c) && supported.has(c)).sort();
}
export function createUnifiedCapabilityReader(load: () => Promise<unknown>, now: () => number = Date.now) {
  let cached: UnifiedCapabilities | null = null; let until = 0;
  let pending: Promise<UnifiedCapabilities | null> | null = null;
  return (): Promise<UnifiedCapabilities | null> => {
    if (now() < until) return Promise.resolve(cached);
    if (pending) return pending;
    pending = Promise.resolve().then(load).then(parseUnifiedCapabilities).catch(() => null)
      .then(value => { cached = value; until = now() + (value ? 30_000 : 15_000); return value; })
      .finally(() => { pending = null; });
    return pending;
  };
}
