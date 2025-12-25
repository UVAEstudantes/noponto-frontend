import {
  Icon,
  LucideIcon,
  Search,
  SlidersHorizontal,
} from "lucide-react-native";
import React from "react";
import { Pressable, TextInput, View } from "react-native";

interface Props {
  icon?: LucideIcon;
  placeholder?: string;
  className?: string;
  value?: string;
  onChangeText?: (text: string) => void;
}

export default function InputBusca(props: Props) {

  const colors = {
    customYellow: "#FFC107",
    customBlack: "#1E1E1E",
    customGray: "#F2F4F7",
    customDarkGray: "#808080ff",
  };

  return (
    <View className={`w-full ${props.className}`}>
      <TextInput
        className="bg-white rounded-3xl h-12 w-full px-12 mr-12"
        placeholder={props.placeholder}
        value={props.value}
        onChangeText={props.onChangeText}
      />

      {props.icon && (
        <props.icon
          color={colors.customDarkGray}
          style={{ position: "absolute", left: 10, top: 10 }}
        />
      )}
    </View>
  );
}
