export const CHAVE_PERFIL = "@noponto/perfil-local-v1";
export const coresAvatar = [
  "#14634C",
  "#315AA0",
  "#74519B",
  "#94571A",
  "#A03C58",
] as const;
export type PerfilLocal = { nome: string; cor: string };
export const perfilVazio: PerfilLocal = { nome: "", cor: coresAvatar[0] };
type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};
export function iniciaisPerfil(nome: string) {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => /[\p{L}\p{N}]/u.test(p));
  if (!partes.length) return "NP";
  const inicial = (parte: string) =>
    Array.from(parte).find((c) => /[\p{L}\p{N}]/u.test(c)) ?? "";
  return (
    inicial(partes[0]) +
    (partes.length > 1 ? inicial(partes[partes.length - 1]) : "")
  ).toLocaleUpperCase("pt-BR");
}
export function validarPerfil(value: unknown): PerfilLocal {
  if (!value || typeof value !== "object") throw Error("Perfil inválido.");
  const p = value as PerfilLocal;
  if (
    typeof p.nome !== "string" ||
    p.nome.length > 60 ||
    !coresAvatar.some((c) => c === p.cor)
  )
    throw Error("Perfil inválido.");
  return { nome: p.nome.trim().replace(/\s+/g, " "), cor: p.cor };
}
export async function carregarPerfil(storage: Storage): Promise<PerfilLocal> {
  const raw = await storage.getItem(CHAVE_PERFIL);
  return raw === null ? { ...perfilVazio } : validarPerfil(JSON.parse(raw));
}
export async function salvarPerfil(storage: Storage, perfil: PerfilLocal) {
  const validado = validarPerfil(perfil);
  await storage.setItem(CHAVE_PERFIL, JSON.stringify(validado));
  return validado;
}
