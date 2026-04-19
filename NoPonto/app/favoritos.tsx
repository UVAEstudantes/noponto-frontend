import { useTema } from "@/src/hooks/useTema";
import React from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const Favoritos = () => {
  const { cores } = useTema();

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1"
      style={{ backgroundColor: cores.fundoApp }}
    >
      <View className="flex-1 items-center justify-center px-6">
        <Text
          className="text-2xl font-bold"
          style={{ color: cores.textoPrimario }}
        >
          Favoritos
        </Text>
        <Text
          className="mt-2 text-center"
          style={{ color: cores.textoSecundario }}
        >
          Seus itens favoritos aparecerão aqui.
        </Text>
      </View>
    </SafeAreaView>
  );
};

export default Favoritos;
