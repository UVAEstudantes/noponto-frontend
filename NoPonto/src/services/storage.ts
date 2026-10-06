import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ESTILO_MAPA_PADRAO,
  EstiloMapaId,
  validarEstiloMapa,
} from "@/src/constants/estilosMapa";
import { NomeTema } from "@/src/constants/tema";

export type PreferenciaTema = NomeTema | "sistema";
export type PreferenciaLateralidade = "destro" | "canhoto";

const CHAVE_TEMA = "@temaSelecionado";
const CHAVE_PREFERENCIA_TEMA = "@preferenciaTema";
const CHAVE_ESTILO_MAPA = "@estiloMapaSelecionado";
const CHAVE_MODAL_SELECIONADO = "@modalSelecionado";
const CHAVE_LATERALIDADE = "@preferenciaLateralidade";

const ehPreferenciaTemaValida = (
  valor: string | null,
): valor is PreferenciaTema => {
  return valor === "sistema" || valor === "claro" || valor === "escuro";
};

export const salvarLinhas = async (linha: any[]) => {
  try {
    await AsyncStorage.setItem("@linhasSelecionadas", JSON.stringify(linha));
  } catch (error) {
    console.error("Erro ao salvar a linha:", error);
  }
};

export const carregarLinhasSalvas = async () => {
  try {
    const linhaString = await AsyncStorage.getItem("@linhasSelecionadas");
    return linhaString ? JSON.parse(linhaString) : [];
  } catch (error) {
    console.error("Erro ao carregar a linha:", error);
    return [];
  }
};

export const salvarPreferenciaTema = async (preferencia: PreferenciaTema) => {
  try {
    await AsyncStorage.setItem(CHAVE_PREFERENCIA_TEMA, preferencia);

    if (preferencia === "claro" || preferencia === "escuro") {
      await AsyncStorage.setItem(CHAVE_TEMA, preferencia);
    } else {
      await AsyncStorage.removeItem(CHAVE_TEMA);
    }
  } catch (error) {
    console.error("Erro ao salvar preferencia de tema:", error);
  }
};

export const carregarPreferenciaTema =
  async (): Promise<PreferenciaTema | null> => {
    try {
      const preferenciaSalva = await AsyncStorage.getItem(
        CHAVE_PREFERENCIA_TEMA,
      );

      if (ehPreferenciaTemaValida(preferenciaSalva)) {
        return preferenciaSalva;
      }

      return null;
    } catch (error) {
      console.error("Erro ao carregar preferencia de tema:", error);
      return null;
    }
  };

export const salvarTema = async (tema: NomeTema) => {
  await salvarPreferenciaTema(tema);
};

export const carregarTema = async (): Promise<NomeTema | null> => {
  const preferencia = await carregarPreferenciaTema();

  if (preferencia === "claro" || preferencia === "escuro") {
    return preferencia;
  }

  return null;
};

export const alternarTema = async (temaAtual: NomeTema) => {
  const proximoTema: NomeTema = temaAtual === "claro" ? "escuro" : "claro";
  await salvarPreferenciaTema(proximoTema);
  return proximoTema;
};

export const salvarEstiloMapa = async (estiloMapa: EstiloMapaId) => {
  try {
    await AsyncStorage.setItem(CHAVE_ESTILO_MAPA, estiloMapa);
  } catch (error) {
    console.error("Erro ao salvar estilo do mapa:", error);
  }
};

export const carregarEstiloMapa = async (): Promise<EstiloMapaId> => {
  try {
    const estiloSalvo = await AsyncStorage.getItem(CHAVE_ESTILO_MAPA);
    return validarEstiloMapa(estiloSalvo);
  } catch (error) {
    console.error("Erro ao carregar estilo do mapa:", error);
    return ESTILO_MAPA_PADRAO;
  }
};

export const salvarPreferenciaLateralidade = async (
  preferencia: PreferenciaLateralidade,
) => {
  try {
    await AsyncStorage.setItem(CHAVE_LATERALIDADE, preferencia);
  } catch (error) {
    console.error("Erro ao salvar preferencia de lateralidade:", error);
  }
};

export const carregarPreferenciaLateralidade =
  async (): Promise<PreferenciaLateralidade> => {
    try {
      return (await AsyncStorage.getItem(CHAVE_LATERALIDADE)) === "canhoto"
        ? "canhoto"
        : "destro";
    } catch (error) {
      console.error("Erro ao carregar preferencia de lateralidade:", error);
      return "destro";
    }
  };

export const salvarModalSelecionado = async (modalId: string) => {
  try {
    await AsyncStorage.setItem(CHAVE_MODAL_SELECIONADO, modalId);
  } catch (error) {
    console.error("Erro ao salvar modal selecionado:", error);
  }
};

export const carregarModalSelecionado = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(CHAVE_MODAL_SELECIONADO);
  } catch (error) {
    console.error("Erro ao carregar modal selecionado:", error);
    return null;
  }
};

// export const limparLinhasSalvas = async () => {
//     try {
//         await AsyncStorage.removeItem('@linhasSelecionadas');
//     } catch (error) {
//         console.error('Erro ao limpar as linhas salvas:', error);
//     }
// };

// export const salvarFiltro = async (filtro: string) => {
//     try{
//         await AsyncStorage.setItem('@filtroBusca', filtro);
//     } catch (error) {
//         console.error('Erro ao salvar o filtro:', error);
//     }
// };

// export const carregarFiltro = async () => {
//     try {
//         const filtro = await AsyncStorage.getItem('@filtroBusca');
//         return filtro || '';
//     } catch (error) {
//         console.error('Erro ao carregar o filtro:', error);
//         return '';
//     }
// };
