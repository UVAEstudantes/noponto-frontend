export type EstiloMapaId =
  | "padrao"
  | "aurora-urbana"
  | "grafite-suave"
  | "oceano-noturno"
  | "contraste-vivo";

export interface EstiloMapa {
  id: EstiloMapaId;
  nome: string;
  descricao: string;
  filtroLight: string;
  filtroDark: string;
}

export const ESTILO_MAPA_PADRAO: EstiloMapaId = "padrao";

export const estilosMapaDisponiveis: EstiloMapa[] = [
  {
    id: "padrao",
    nome: "Padrão",
    descricao: "Balanceado para leitura no claro e no escuro.",
    filtroLight: "none",
    filtroDark:
      "brightness(0.58) contrast(1.8) saturate(1) hue-rotate(125deg)",
  },
  {
    id: "aurora-urbana",
    nome: "Aurora Urbana",
    descricao: "Tons frios com contraste leve para rotas e vias.",
    filtroLight: "contrast(1.04) saturate(1.07) hue-rotate(6deg)",
    filtroDark:
      "brightness(0.62) contrast(1.2) saturate(1) hue-rotate(220deg)",
  },
  {
    id: "grafite-suave",
    nome: "Grafite Suave",
    descricao: "Visual discreto, ideal para foco nas linhas.",
    filtroLight: "grayscale(0.1) contrast(1.03)",
    filtroDark:
      "brightness(0.64) contrast(1.58) saturate(0.45) hue-rotate(120deg)",
  },
  {
    id: "oceano-noturno",
    nome: "Floresta Noturna",
    descricao: "Esverdeado moderno, sem escurecer demais o mapa.",
    filtroLight: "contrast(1.02) saturate(1.1) hue-rotate(10deg)",
    filtroDark:
      "brightness(0.7) contrast(1.18) saturate(1.0) hue-rotate(405deg)",
  },
  {
    id: "contraste-vivo",
    nome: "Contraste Vivo",
    descricao: "Destaque forte para ruas, limites e percursos.",
    filtroLight: "contrast(1.15) saturate(1.1)",
    filtroDark:
      "brightness(0.62) contrast(2.0) saturate(0.95) hue-rotate(125deg)",
  },
];

export function validarEstiloMapa(
  estiloMapa: string | null | undefined,
): EstiloMapaId {
  if (!estiloMapa) {
    return ESTILO_MAPA_PADRAO;
  }

  const estiloValido = estilosMapaDisponiveis.find(
    (estilo) => estilo.id === estiloMapa,
  );

  return estiloValido?.id ?? ESTILO_MAPA_PADRAO;
}
