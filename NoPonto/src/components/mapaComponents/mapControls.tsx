import { useTema } from "@/src/hooks/useTema";
import { identidadeModalMapa } from "@/src/constants/modaisMapa";
import { PreferenciaLateralidade } from "@/src/services/storage";
import React from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LocalButton from "./localButton";

interface MapControlsProps {
  lateralidade: PreferenciaLateralidade;
  modalAtivo?: string | null;
  location: any;
  mapRef: React.RefObject<any>;
  onOpenLines: () => void;
  disabled?: boolean;
}

export default function MapControls({ lateralidade, modalAtivo, location, mapRef,
  onOpenLines, disabled = false }: MapControlsProps) {
  const { cores } = useTema();
  const insets = useSafeAreaInsets();
  const lado = lateralidade === "canhoto" ? "left" : "right";
  const { Icon: IconeLinhas } = identidadeModalMapa(modalAtivo);

  return (
    <View pointerEvents={disabled ? "none" : "box-none"}
      style={{ position: "absolute", [lado]: Math.max(16, insets[lado] + 12),
        bottom: Math.max(insets.bottom + 70, 88), gap: 10,
        alignItems: lado === "right" ? "flex-end" : "flex-start",
        zIndex: 20, opacity: disabled ? 0 : 1 }}>
      <LocalButton location={location} mapRef={mapRef} />
      <Pressable onPress={onOpenLines} accessibilityRole="button"
        accessibilityLabel="Ver linhas no mapa" hitSlop={8}
        style={{ width: 48, height: 48, borderRadius: 999,
          alignItems: "center", justifyContent: "center",
          backgroundColor: cores.fundoPainel, borderWidth: 1, borderColor: cores.borda,
          shadowColor: cores.sombra, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}>
        <IconeLinhas color={cores.iconePrimario} size={22} />
      </Pressable>
    </View>
  );
}
