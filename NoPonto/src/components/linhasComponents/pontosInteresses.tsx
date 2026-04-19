import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTema } from "@/src/hooks/useTema";
import {
  ShoppingBag,
  Train,
  Bus,
  Hospital,
  LucideIcon,
  School,
  MapPin,
  CornerUpLeft,
} from "lucide-react-native";
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  FadeOutDown,
  LinearTransition,
} from "react-native-reanimated";

interface Ponto {
  id: number;
  title: string;
}

interface Props {
  pontos?: Ponto[];
  scrollDown?: () => void;
}

// Função para decidir o ícone baseado no nome
function iconPorTitulo(title: string): LucideIcon {
  if (title.toLowerCase().includes("shopping")) return ShoppingBag;
  if (title.toLowerCase().includes("hospital")) return Hospital;
  if (title.toLowerCase().includes("estação")) return Train;
  if (title.toLowerCase().includes("terminal")) return Bus;
  if (
    title.toLowerCase().includes("colégio") ||
    title.toLowerCase().includes("escola") ||
    title.toLowerCase().includes("universidade")
  )
    return School;
  if (title.toLowerCase().includes("saída")) return CornerUpLeft;

  return MapPin; // ícone padrão
}

export default function PontosInteresses({ pontos, scrollDown }: Props) {
  const { cores } = useTema();
  const [mostrar, setMostrar] = useState(false);

  const texto = mostrar ? "Ver menos" : "Ver mais";

  function apertarMostrar() {
    const novoMostrar = !mostrar;
    setMostrar(novoMostrar);
    console.log("Mostrar pontos de interesse:", novoMostrar);
    if (scrollDown && novoMostrar) {
      scrollDown();
    }
  }

  const pontosExibidos = mostrar ? pontos : pontos?.slice(0, 4);

  return (
    <View>
      <View className="flex-row">
        <Text
          className="m-5 mt-2 mb-4 font-semibold text-lg"
          style={{ color: cores.textoPrimario }}
        >
          Pontos de Interesse
        </Text>

        {pontos?.length! <= 4 ? null : (
          <Pressable
            onPress={() => {
              apertarMostrar();
            }}
            className="m-5 mt-0 mb-4 font-semibold text-lg ml-auto px-3 p-5 py-2 rounded-2xl shadow-md"
            style={{ backgroundColor: cores.fundoPrimario }}
          >
            <Text
              className="font-semibold"
              style={{ color: cores.textoInverso }}
            >
              {texto}
            </Text>
          </Pressable>
        )}
      </View>

      <Animated.View
        entering={FadeIn.duration(500)}
        exiting={FadeOut.duration(500)}
        layout={LinearTransition}
        className="mx-5 rounded-2xl shadow-md overflow-hidden"
        style={{
          backgroundColor: cores.fundoCard,
          borderColor: cores.borda,
          borderWidth: 1,
        }}
      >
        {pontosExibidos?.map((ponto, index) => {
          const Icon = iconPorTitulo(ponto.title);
          return (
            <Animated.View
              entering={FadeInUp.duration(400)
                .delay(index * 100)
                .springify()}
              exiting={FadeOutDown.duration(200)}
              layout={LinearTransition.springify()}
              key={ponto.id}
              className="p-4 border-b relative rounded-2xl"
              style={{ borderColor: cores.bordaSuave }}
            >
              <Icon
                color={cores.iconeSecundario}
                style={{
                  position: "absolute",
                  width: 20,
                  height: 20,
                  marginLeft: 18,
                  marginTop: 12,
                }}
              />
              <View>
                <Text
                  className="font-semibold px-[40px]"
                  style={{ color: cores.textoPrimario }}
                >
                  {ponto.title}
                </Text>
              </View>
            </Animated.View>
          );
        })}
      </Animated.View>
    </View>
  );
}
