import { useEffect, useState } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";
import { useTema } from "@/src/hooks/useTema";

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const { temaAtual } = useTema();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    if (temaAtual === "escuro") {
      return "dark";
    }

    return "light";
  }

  return colorScheme ?? "light";
}
