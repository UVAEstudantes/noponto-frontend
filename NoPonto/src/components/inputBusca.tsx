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
  const integrated = props.embedded === true;
  const animatedPlaceholder = useAnimatedPlaceholder(props.placeholderSuggestions ?? [],
    Boolean(props.placeholderSuggestions?.length) && !props.value);

  return (
    <View className={integrated ? undefined : `w-full ${props.className ?? ""}`}
      style={integrated ? { width: "100%", backgroundColor: "transparent" } : undefined}>
      <TextInput
        className={integrated ? undefined : "rounded-3xl shadow-md h-12 w-full px-12 mr-12"}
        style={integrated ? {
          width: "100%",
          height: 48,
          paddingLeft: 48,
          paddingRight: 48,
          paddingVertical: 0,
          margin: 0,
          backgroundColor: "transparent",
          color: cores.textoPrimario,
          borderColor: "transparent",
          borderWidth: 0,
          borderRadius: 0,
          outlineWidth: 0,
          elevation: 0,
        } : {
          backgroundColor: cores.fundoInput,
          color: cores.textoPrimario,
          borderColor: cores.borda,
          borderWidth: 1,
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
