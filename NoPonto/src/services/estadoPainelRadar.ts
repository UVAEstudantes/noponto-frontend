export interface EstadoPainelRadar {
  modo: "aberto" | "manual" | "automatico";
  abertoPeloUsuario: boolean;
  vazios: number;
  positivos: number;
  contexto: string;
  amostra: string;
}
export const estadoInicialPainelRadar: EstadoPainelRadar = {
  modo: "aberto", abertoPeloUsuario: false, vazios: 0, positivos: 0, contexto: "", amostra: "",
};
export type AcaoPainelRadar = { tipo: "abrir" | "recolher" } | {
  tipo: "observar"; contexto: string; amostra: string; concluida: boolean; temEventos: boolean;
};

export function reduzirEstadoPainelRadar(estado: EstadoPainelRadar, acao: AcaoPainelRadar): EstadoPainelRadar {
  if (acao.tipo === "recolher") return { ...estado, modo: "manual", abertoPeloUsuario: false, vazios: 0, positivos: 0 };
  if (acao.tipo === "abrir") return { ...estado, modo: "aberto", abertoPeloUsuario: true, vazios: 0, positivos: 0 };
  if (acao.tipo !== "observar" || !acao.concluida) return estado;
  if (estado.amostra === acao.amostra && estado.contexto === acao.contexto) return estado;
  const anterior = estado.contexto === acao.contexto ? estado
    : { ...estado, contexto: acao.contexto, vazios: 0, positivos: 0 };
  const vazios = acao.temEventos ? 0 : anterior.vazios + 1;
  const positivos = acao.temEventos ? anterior.positivos + 1 : 0;
  // Abrir pela aba mantém o painel vazio acessível; a proteção termina quando há eventos.
  const abertoPeloUsuario = anterior.abertoPeloUsuario && !acao.temEventos;
  let modo = anterior.modo;
  if (modo !== "manual" && !abertoPeloUsuario) {
    if (vazios >= 2) modo = "automatico";
    else if (positivos >= 2) modo = "aberto";
  }
  return { ...anterior, modo, abertoPeloUsuario, vazios, positivos, amostra: acao.amostra };
}
