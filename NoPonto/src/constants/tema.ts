export type NomeTema = "claro" | "escuro";

export interface CoresTema {
  fundoApp: string;
  fundoPainel: string;
  fundoCard: string;
  fundoInput: string;
  fundoNav: string;
  fundoSecundario: string;
  fundoPrimario: string;
  textoPrimario: string;
  textoSecundario: string;
  textoInverso: string;
  textoDestaque: string;
  iconePrimario: string;
  iconeSecundario: string;
  borda: string;
  bordaSuave: string;
  sombra: string;
  overlay: string;
  perigo: string;
  sucesso: string;
}

export interface TemaAplicacao {
  nome: NomeTema;
  cores: CoresTema;
}

export const temas: Record<NomeTema, TemaAplicacao> = {
  claro: {
    nome: "claro",
    cores: {
      fundoApp: "#F2F4F7",
      fundoPainel: "#FFFFFF",
      fundoCard: "#FFFFFF",
      fundoInput: "rgba(255,255,255,0.8)",
      fundoNav: "rgba(30, 30, 30, 0.9)",
      fundoSecundario: "#E4E4E4",
      fundoPrimario: "#FFC107",
      textoPrimario: "#1E1E1E",
      textoSecundario: "#8E8E93",
      textoInverso: "#F2F4F7",
      textoDestaque: "#FFC107",
      iconePrimario: "#FFC107",
      iconeSecundario: "#8E8E93",
      borda: "#DEDEDE",
      bordaSuave: "#E4E4E4",
      sombra: "#000000",
      overlay: "rgba(0, 0, 0, 0.18)",
      perigo: "#EF4444",
      sucesso: "#038B0F",
    },
  },
  escuro: {
    nome: "escuro",
    cores: {
      fundoApp: "#111315",
      fundoPainel: "#1A1D21",
      fundoCard: "#1E1E1E",
      fundoInput: "rgba(36,38,43,0.8)",
      fundoNav: "rgba(30, 30, 30, 1)",
      fundoSecundario: "#2C3036",
      fundoPrimario: "#FFC107",
      textoPrimario: "#F2F4F7",
      textoSecundario: "#B2BAC2",
      textoInverso: "#1E1E1E",
      textoDestaque: "#FFC107",
      iconePrimario: "#FFC107",
      iconeSecundario: "#D0D6DC",
      borda: "#343A40",
      bordaSuave: "#2A2F35",
      sombra: "#000000",
      overlay: "rgba(0, 0, 0, 0.45)",
      perigo: "#F87171",
      sucesso: "#22C55E",
    },
  },
};
