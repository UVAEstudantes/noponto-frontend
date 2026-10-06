import { useTema } from "@/src/hooks/useTema";
import { Search, X } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { Pressable, TextInput } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAnimatedPlaceholder } from "@/src/hooks/useAnimatedPlaceholder";

interface BuscaMapaProps {
  value: string;
  onChangeText: (value: string) => void;
  onClose: () => void;
  placeholder?: string;
  placeholderSuggestions?: string[];
  embedded?: boolean;
}

export default function BuscaMapa({
  value,
  onChangeText,
  onClose,
  placeholder = "Buscar linhas ou destinos",
  placeholderSuggestions = [],
  embedded = false,
}: BuscaMapaProps) {
  const { cores } = useTema();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const animatedPlaceholder = useAnimatedPlaceholder(placeholderSuggestions, value.length === 0);

  useEffect(() => {
    const focusTimeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 120);

    return () => clearTimeout(focusTimeout);
  }, []);

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutUp.duration(140)}
      style={{
        position: embedded ? "relative" : "absolute",
        top: embedded ? 0 : insets.top + 12,
        left: embedded ? 0 : 12,
        right: embedded ? 0 : 12,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: embedded ? "transparent" : cores.fundoInput,
        borderRadius: embedded ? 0 : 999,
        borderWidth: embedded ? 0 : 1,
        borderColor: cores.borda,
        height: 48,
        paddingHorizontal: 14,
        shadowColor: embedded ? "transparent" : "#000",
        shadowOpacity: embedded ? 0 : 0.12,
        shadowRadius: embedded ? 0 : 8,
        elevation: embedded ? 0 : 4,
        zIndex: 20,
      }}
    >
      <Search size={18} color={cores.iconeSecundario} />
      <TextInput
        ref={inputRef}
        autoFocus
        accessibilityLabel="Buscar linhas ou destinos"
        style={{
          flex: 1,
          marginHorizontal: 10,
          fontSize: 15,
          color: cores.textoPrimario,
          backgroundColor: "transparent",
          borderWidth: 0,
          outlineWidth: 0,
          elevation: 0,
          paddingVertical: 0,
        }}
        underlineColorAndroid="transparent"
        placeholder={animatedPlaceholder || placeholder}
        placeholderTextColor={cores.textoSecundario}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
      />
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fechar busca"
        hitSlop={8}
      >
        <X size={20} color={cores.iconeSecundario} />
      </Pressable>
    </Animated.View>
  );
}
