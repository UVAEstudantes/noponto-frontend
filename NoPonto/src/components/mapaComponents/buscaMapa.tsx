import { useTema } from "@/src/hooks/useTema";
import { Search, X } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface BuscaMapaProps {
  value: string;
  onChangeText: (value: string) => void;
  onClose: () => void;
}

export default function BuscaMapa({
  value,
  onChangeText,
  onClose,
}: BuscaMapaProps) {
  const { cores } = useTema();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const focusTimeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 120);

    return () => clearTimeout(focusTimeout);
  }, []);

  return (
    <View
      style={{
        position: "absolute",
        top: insets.top + 12,
        left: 12,
        right: 12,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: cores.fundoInput,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: cores.borda,
        height: 48,
        paddingHorizontal: 14,
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 4,
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
        }}
        placeholder="Buscar linhas ou destinos"
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
    </View>
  );
}
