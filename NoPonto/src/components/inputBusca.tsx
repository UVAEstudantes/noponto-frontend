import { useTema } from "@/src/hooks/useTema";
import { LucideIcon } from "lucide-react-native";
import React from "react";
import { TextInput, View } from "react-native";

interface Props {
  icon?: LucideIcon;
  placeholder?: string;
  className?: string;
  value?: string;
  onChangeText?: (text: string) => void;
}

export default function InputBusca(props: Props) {
  const { cores } = useTema();

  return (
    <View className={`w-full ${props.className}`}>
      <TextInput
        className="rounded-3xl h-12 w-full px-12 mr-12 shadow-md"
        style={{
          backgroundColor: cores.fundoInput,
          color: cores.textoPrimario,
          borderColor: cores.borda,
          borderWidth: 1,
        }}
        placeholder={props.placeholder}
        placeholderTextColor={cores.textoSecundario}
        value={props.value}
        onChangeText={props.onChangeText}
      />

      {props.icon && (
        <props.icon
          color={cores.iconeSecundario}
          style={{ position: "absolute", left: 10, top: 10 }}
        />
      )}
    </View>
  );
}
