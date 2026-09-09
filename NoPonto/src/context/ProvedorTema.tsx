import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme as useEsquemaSistema } from "react-native";
import {
  ESTILO_MAPA_PADRAO,
  EstiloMapaId,
  validarEstiloMapa,
} from "@/src/constants/estilosMapa";
import { NomeTema, temas } from "@/src/constants/tema";
import {
  PreferenciaTema,
  carregarEstiloMapa,
  carregarPreferenciaLateralidade,
  carregarPreferenciaTema,
  PreferenciaLateralidade,
  salvarEstiloMapa,
  salvarPreferenciaLateralidade,
  salvarPreferenciaTema,
} from "@/src/services/storage";

type TemaContexto = {
  temaAtual: NomeTema;
  preferenciaTema: PreferenciaTema;
  definirPreferenciaTema: (preferencia: PreferenciaTema) => Promise<void>;
  alternarTema: () => Promise<void>;
  definirTema: (tema: NomeTema) => Promise<void>;
  estiloMapaAtual: EstiloMapaId;
  definirEstiloMapa: (estiloMapa: EstiloMapaId) => Promise<void>;
  preferenciaLateralidade: PreferenciaLateralidade;
  definirPreferenciaLateralidade: (preferencia: PreferenciaLateralidade) => Promise<void>;
  carregandoTema: boolean;
};

export const TemaContext = createContext<TemaContexto | undefined>(undefined);

export function ProvedorTema({ children }: PropsWithChildren) {
  const esquemaSistema = useEsquemaSistema();
  const [preferenciaTema, setPreferenciaTema] =
    useState<PreferenciaTema>("sistema");
  const [estiloMapaAtual, setEstiloMapaAtual] =
    useState<EstiloMapaId>(ESTILO_MAPA_PADRAO);
  const [preferenciaLateralidade, setPreferenciaLateralidade] = useState<PreferenciaLateralidade>("destro");
  const [carregandoTema, setCarregandoTema] = useState(true);

  const temaSistema: NomeTema = esquemaSistema === "dark" ? "escuro" : "claro";

  const temaAtual = useMemo<NomeTema>(() => {
    if (preferenciaTema === "sistema") {
      return temaSistema;
    }

    return preferenciaTema;
  }, [preferenciaTema, temaSistema]);

  useEffect(() => {
    let ativo = true;

    const iniciar = async () => {
      const [preferenciaSalva, estiloSalvo, lateralidadeSalva] = await Promise.all([
        carregarPreferenciaTema(),
        carregarEstiloMapa(),
        carregarPreferenciaLateralidade(),
      ]);

      if (!ativo) {
        return;
      }

      if (preferenciaSalva) {
        setPreferenciaTema(preferenciaSalva);
      }

      setEstiloMapaAtual(validarEstiloMapa(estiloSalvo));
      setPreferenciaLateralidade(lateralidadeSalva);

      setCarregandoTema(false);
    };

    iniciar();

    return () => {
      ativo = false;
    };
  }, []);

  const definirPreferenciaTema = useCallback(
    async (preferencia: PreferenciaTema) => {
      setPreferenciaTema(preferencia);
      await salvarPreferenciaTema(preferencia);
    },
    [],
  );

  const definirTema = useCallback(
    async (tema: NomeTema) => {
      await definirPreferenciaTema(tema);
    },
    [definirPreferenciaTema],
  );

  const definirEstiloMapa = useCallback(async (estiloMapa: EstiloMapaId) => {
    const estiloValidado = validarEstiloMapa(estiloMapa);
    setEstiloMapaAtual(estiloValidado);
    await salvarEstiloMapa(estiloValidado);
  }, []);

  const definirPreferenciaLateralidade = useCallback(async (preferencia: PreferenciaLateralidade) => {
    setPreferenciaLateralidade(preferencia);
    await salvarPreferenciaLateralidade(preferencia);
  }, []);

  const alternarTema = useCallback(async () => {
    const proximoTema: NomeTema = temaAtual === "claro" ? "escuro" : "claro";
    await definirPreferenciaTema(proximoTema);
  }, [temaAtual, definirPreferenciaTema]);

  const valor = useMemo(
    () => ({
      temaAtual,
      preferenciaTema,
      definirPreferenciaTema,
      alternarTema,
      definirTema,
      estiloMapaAtual,
      definirEstiloMapa,
      preferenciaLateralidade,
      definirPreferenciaLateralidade,
      carregandoTema,
    }),
    [
      temaAtual,
      preferenciaTema,
      definirPreferenciaTema,
      alternarTema,
      definirTema,
      estiloMapaAtual,
      definirEstiloMapa,
      preferenciaLateralidade,
      definirPreferenciaLateralidade,
      carregandoTema,
    ],
  );

  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>;
}

export function useTema() {
  const contexto = useContext(TemaContext);

  if (!contexto) {
    throw new Error("useTema deve ser usado dentro de ProvedorTema");
  }

  const tema = temas[contexto.temaAtual];

  return {
    ...contexto,
    tema,
    cores: tema.cores,
  };
}
