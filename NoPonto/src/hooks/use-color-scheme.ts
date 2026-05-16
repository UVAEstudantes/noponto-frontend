import { TemaContext } from "@/src/context/ProvedorTema";
import { useContext } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";

export function useColorScheme() {
	const temaContexto = useContext(TemaContext);
	const esquemaSistema = useRNColorScheme();

	if (temaContexto?.temaAtual === "escuro") {
		return "dark";
	}

	if (temaContexto?.temaAtual === "claro") {
		return "light";
	}

	return esquemaSistema;
}
