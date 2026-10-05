import { useTema } from "@/src/hooks/useTema";
import React from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const Rotinas = () => {
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
          Rotinas
        </Text>
        <Text
          className="mt-2 text-center"
          style={{ color: cores.textoSecundario }}
        >
          Salve os trajetos que você faz com frequência e acompanhe as melhores
          opções para seus deslocamentos do dia a dia.
        </Text>
        <Text className="mt-3 text-center text-sm" style={{ color: cores.textoSecundario }}>
          Em breve você poderá organizar trajetos como casa, trabalho, faculdade
          e outros destinos frequentes.
        </Text>
      </View>
    </SafeAreaView>
  );
};

export default Rotinas;
