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
          className="mt-3 text-center"
          style={{ color: cores.textoSecundario }}
        >
          Crie viagens para os trajetos que fazem parte da sua rotina, como
          faculdade, trabalho, compromissos ou até um evento específico.
        </Text>

        <Text
          className="mt-3 text-center"
          style={{ color: cores.textoSecundario }}
        >
          Você poderá definir origem, destino, dias e horários e acompanhar as
          diferentes etapas do caminho, mesmo quando a viagem combinar ônibus,
          BRT, trem e metrô.
        </Text>

        <Text
          className="mt-3 text-center"
          style={{ color: cores.textoSecundario }}
        >
          Durante a viagem, o NoPonto poderá considerar os veículos em tempo
          real para mostrar quanto falta para a próxima etapa e estimar melhor
          o tempo até o destino, além de reunir informações como tarifas e
          duração de cada trecho.
        </Text>

        <Text
          className="mt-3 text-center"
          style={{ color: cores.textoSecundario }}
        >
          Quando houver atrasos, trânsito ou problemas que possam afetar o seu
          caminho, a rotina poderá ajudar você a perceber isso antes e comparar
          outras opções de trajeto.
        </Text>

        <Text
          className="mt-4 text-center text-sm"
          style={{ color: cores.textoSecundario }}
        >
          Em breve, suas viagens mais importantes poderão ficar organizadas
          aqui para você acompanhar o caminho antes de sair e durante todo o
          deslocamento.
        </Text>
      </View>
    </SafeAreaView>
  );
};

export default Rotinas;