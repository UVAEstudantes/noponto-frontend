import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  indicadoresPadrao,
  validarPreferenciasIndicadores,
  type PreferenciasIndicadores,
} from "../constants/indicadores";

const CHAVE = "@preferenciasIndicadores:v1";
const Contexto = createContext<{
  preferencias: PreferenciasIndicadores;
  carregando: boolean;
  erro: string | null;
  atualizar: (alteracao: Partial<PreferenciasIndicadores>) => void;
} | null>(null);

export function ProvedorIndicadores({ children }: PropsWithChildren) {
  const [preferencias, setPreferencias] = useState(indicadoresPadrao);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const atual = useRef(indicadoresPadrao);
  const fila = useRef(Promise.resolve());
  useEffect(() => {
    let ativo = true;
    void AsyncStorage.getItem(CHAVE)
      .then((texto) => {
        if (!ativo) return;
        if (texto) {
          atual.current = validarPreferenciasIndicadores(JSON.parse(texto));
          setPreferencias(atual.current);
        }
      })
      .catch((error) => {
        console.warn("[Indicadores] Erro ao carregar preferências:", error);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, []);
  const atualizar = useCallback(
    (alteracao: Partial<PreferenciasIndicadores>) => {
      const proxima = validarPreferenciasIndicadores({
        ...atual.current,
        ...alteracao,
      });
      atual.current = proxima;
      setPreferencias(proxima);
      setErro(null);
      // Ordem de escrita preservada mesmo durante toques rapidos.
      fila.current = fila.current
        .then(() => AsyncStorage.setItem(CHAVE, JSON.stringify(proxima)))
        .then(() => setErro(null))
        .catch((error) => {
          console.warn("[Indicadores] Erro ao salvar preferências:", error);
          setErro("Não foi possível salvar. Selecione novamente para tentar.");
        });
    },
    [],
  );
  return (
    <Contexto.Provider value={{ preferencias, carregando, erro, atualizar }}>
      {children}
    </Contexto.Provider>
  );
}
export function useIndicadores() {
  const valor = useContext(Contexto);
  if (!valor)
    throw new Error(
      "useIndicadores deve ser usado dentro de ProvedorIndicadores",
    );
  return valor;
}
