import { useTema } from "@/src/hooks/useTema";
import { LucideIcon } from "lucide-react-native";
import React from "react";
import { TextInput, View } from "react-native";
import { useAnimatedPlaceholder } from "@/src/hooks/useAnimatedPlaceholder";

interface Props {
  icon?: LucideIcon;
  placeholder?: string;
  className?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  accessibilityLabel?: string;
  placeholderSuggestions?: string[];
  embedded?: boolean;
}

export default function InputBusca(props: Props) {
  const { cores } = useTema();
  const animatedPlaceholder = useAnimatedPlaceholder(props.placeholderSuggestions ?? [],
    Boolean(props.placeholderSuggestions?.length) && !props.value);

  return (
    <View className={`w-full ${props.className}`}>
      <TextInput
        className={`${props.embedded ? "rounded-none" : "rounded-3xl"} h-12 w-full px-12 mr-12`}
        style={{
          backgroundColor: props.embedded ? "transparent" : cores.fundoInput,
          color: cores.textoPrimario,
          borderColor: "transparent",
          borderWidth: 0,
          outlineWidth: 0,
          elevation: 0,
        }}
        underlineColorAndroid="transparent"
        placeholder={animatedPlaceholder || props.placeholder}
        placeholderTextColor={cores.textoSecundario}
        value={props.value}
        onChangeText={props.onChangeText}
        accessibilityLabel={props.accessibilityLabel ?? props.placeholder}
        returnKeyType="search"
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
