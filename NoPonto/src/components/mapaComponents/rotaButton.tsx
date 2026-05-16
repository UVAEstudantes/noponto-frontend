import { MapPinPlus } from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import React from "react";
import { Pressable } from "react-native";

export default function RotaButton() {
  const { cores } = useTema();

  function novaRota() {
    console.log("btn clicado");
  }

  return (
    <Pressable
      onPress={novaRota}
      className=" absolute right-8 bottom-[120px] bg-customYellow p-4 rounded-full"
      style={{ backgroundColor: cores.fundoPrimario }}
    >
      <MapPinPlus color={cores.textoInverso} size={32} />
    </Pressable>
  );
}
