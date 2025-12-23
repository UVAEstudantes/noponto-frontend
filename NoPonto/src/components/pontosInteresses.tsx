import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  ShoppingBag,
  Train,
  Bus,
  Hospital,
  Medal,
  TrainFrontTunnel,
  BusFront,
  LucideIcon,
  Store,
  School,
  LogOut,
  MapPin,
  ArrowLeft,
  CornerUpLeft,
} from "lucide-react-native";

interface Ponto {
  id: number;
  title: string;
}

interface Props {
  pontos?: Ponto[];
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

export default function PontosInteresses({ pontos }: Props) {
  const [mostrar, setMostrar] = useState(false);

  const texto = mostrar ? "Ver menos" : "Ver mais";

  function apertarMostrar() {
    setMostrar(!mostrar);
    console.log("Mostrar pontos de interesse:", !mostrar);
  }

  const pontosExibidos = mostrar ? pontos : pontos?.slice(0, 4);

  return (
    <View>
      <View className="flex-row">
        <Text className="m-5 mt-2 mb-4 font-semibold text-lg">
          Pontos de Interesse
        </Text>

        {pontos?.length! <= 4 ? null : (
          <Pressable
            onPress={apertarMostrar}
            className="m-5 mt-0 mb-4 font-semibold text-lg ml-auto bg-customYellow px-3 p-5 py-2 rounded-2xl shadow-md"
          >
            <Text className="font-semibold">{texto}</Text>
          </Pressable>
        )}
      </View>

      <View className="mx-5 bg-white rounded-2xl shadow-md overflow-hidden">
        {pontosExibidos?.map((ponto) => {
          const Icon = iconPorTitulo(ponto.title);
          return (
            <View
              key={ponto.id}
              className="p-4 border-b border-gray-200 relative rounded-2xl"
            >
              <Icon
                color="#8E8E93"
                style={{
                  position: "absolute",
                  width: 20,
                  height: 20,
                  marginLeft: 18,
                  marginTop: 12,
                }}
              />
              <View>
                <Text className="color-customBlack font-semibold px-[40px]">
                  {ponto.title}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
