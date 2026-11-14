type Storage = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void>; getAllKeys(): Promise<readonly string[]> };
const prefix = "@itinerario-versao:v1:";
// Até 12 versões de 200 mil caracteres cada; metadados mutáveis ficam fora.
export async function itinerarioPersistido<T>(storage: Storage, versao: string, carregar: () => Promise<T | null>, valido: (v: unknown) => v is T): Promise<T | null> {
  const key = prefix + versao;
  try {
    const raw = await storage.getItem(key);
    if (raw) {
      try { const value: unknown = JSON.parse(raw); if (valido(value)) return value; } catch {}
      await storage.removeItem(key);
    }
  } catch { /* Falha local não impede carregar a rota. */ }
  const value = await carregar();
  if (value == null) return null;
  try {
    const raw = JSON.stringify(value);
    if (raw.length <= 200000) {
      await storage.setItem(key, raw);
      const keys = (await storage.getAllKeys()).filter(k => k.startsWith(prefix) && k !== key).sort();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - 11)).map(k => storage.removeItem(k)));
    }
  } catch { /* Cache é opcional, inclusive quando o armazenamento está cheio. */ }
  return value;
}
