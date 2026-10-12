import { fontesIndicadores } from "./indicadoresSvg.generated";

export const modaisIndicadores = [
  { id: "onibus", nome: "Ônibus" },
  { id: "brt", nome: "BRT" },
  { id: "trem", nome: "Trem" },
] as const;
export type ModalIndicador = (typeof modaisIndicadores)[number]["id"];

type AssetIndicador = {
  svg: string;
  largura: number;
  altura: number;
  /** Ponto GPS em pixels de apresentacao. */
  ancoraY: number;
  orientacao: number;
  pictograma: boolean;
};
function asset(caminho: string, classico = false): AssetIndicador {
  const svg = fontesIndicadores[caminho];
  if (!svg) throw new Error(`Indicador ausente: ${caminho}`);
  return {
    svg,
    largura: classico ? 32 : 14,
    altura: classico ? 36 : 42,
    ancoraY: classico ? 15 : 21,
    orientacao: classico ? 180 : 0,
    pictograma: classico,
  };
}
const pin = asset("classico/pin.svg", true);
export const familiasIndicadores = {
  classico: { nome: "Clássico", assets: { onibus: pin, brt: pin, trem: pin } },
  padrao: {
    nome: "Padrão",
    assets: {
      onibus: asset("padrao/onibus.svg"),
      brt: asset("padrao/brt.svg"),
      trem: asset("padrao/trem.svg"),
    },
  },
  realista: {
    nome: "Realista",
    assets: {
      onibus: asset("realista/onibus.svg"),
      brt: asset("realista/brt.svg"),
      trem: asset("realista/trem.svg"),
    },
  },
};
export type EstiloIndicador = keyof typeof familiasIndicadores;
export const estilosIndicadores = Object.entries(familiasIndicadores).map(
  ([id, familia]) => ({
    id: id as EstiloIndicador,
    nome: familia.nome,
  }),
);
export type PreferenciasIndicadores = {
  global: boolean;
  estiloGlobal: EstiloIndicador;
  individuais: Record<ModalIndicador, EstiloIndicador>;
};
export const indicadoresPadrao: PreferenciasIndicadores = {
  global: true,
  estiloGlobal: "padrao",
  individuais: { onibus: "padrao", brt: "padrao", trem: "padrao" },
};
export function validarPreferenciasIndicadores(
  valor: unknown,
): PreferenciasIndicadores {
  const dados = valor as Partial<PreferenciasIndicadores> | null;
  const estilo = (v: unknown): EstiloIndicador => {
    if (typeof v === "string" && Object.prototype.hasOwnProperty.call(familiasIndicadores, v))
      return v as EstiloIndicador;
    console.warn("[Indicadores] Estilo inválido; usando Padrão:", v);
    return "padrao";
  };
  return {
    global: typeof dados?.global === "boolean" ? dados.global : true,
    estiloGlobal: estilo(dados?.estiloGlobal),
    individuais: Object.fromEntries(
      modaisIndicadores.map(({ id }) => [id, estilo(dados?.individuais?.[id])]),
    ) as PreferenciasIndicadores["individuais"],
  };
}
export function estilosEfetivos(preferencias: PreferenciasIndicadores) {
  return Object.fromEntries(
    modaisIndicadores.map(({ id }) => [
      id,
      preferencias.global
        ? preferencias.estiloGlobal
        : preferencias.individuais[id],
    ]),
  ) as PreferenciasIndicadores["individuais"];
}
