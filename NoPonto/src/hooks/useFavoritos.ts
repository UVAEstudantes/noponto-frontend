import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
import { criarColecaoFavoritos } from "../services/favoritos";

const colecao = criarColecaoFavoritos(AsyncStorage);

export function useFavoritos() {
  const snapshot = useSyncExternalStore(colecao.subscribe, colecao.getSnapshot, colecao.getSnapshot);
  useEffect(() => { void colecao.hidratar(); }, []);
  return { ...snapshot, alternar: colecao.alternar, remover: colecao.remover,
    tentarNovamente: colecao.tentarNovamente };
}
