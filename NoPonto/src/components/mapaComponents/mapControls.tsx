import { useTema } from "@/src/hooks/useTema";
import { identidadeModalMapa } from "@/src/constants/modaisMapa";
import { PreferenciaLateralidade } from "@/src/services/storage";
import React, { useEffect } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LocalButton from "./localButton";

interface MapControlsProps {
  lateralidade: PreferenciaLateralidade;
  modalAtivo?: string | null;
  location: any;
  mapRef: React.RefObject<any>;
  onOpenLines: () => void;
  disabled?: boolean;
  radarBottom?: number | null;
}

export default function MapControls({ lateralidade, modalAtivo, location, mapRef,
  onOpenLines, disabled = false, radarBottom }: MapControlsProps) {
  const { cores } = useTema();
  const insets = useSafeAreaInsets();
  const lado = lateralidade === "canhoto" ? "left" : "right";
  const { Icon: IconeLinhas } = identidadeModalMapa(modalAtivo);

  const normalBottom = Math.max(insets.bottom + 70, 88);
  const bottom = useSharedValue(normalBottom);
  useEffect(() => {
    bottom.value = withTiming(radarBottom ?? normalBottom, { duration: 260 });
  }, [radarBottom, normalBottom, bottom]);
  const positionStyle = useAnimatedStyle(() => ({ bottom: bottom.value }));

  return (
    <Animated.View pointerEvents={disabled ? "none" : "box-none"}
      style={[{ position: "absolute", [lado]: Math.max(16, insets[lado] + 12),
        gap: 10,
        alignItems: lado === "right" ? "flex-end" : "flex-start",
        zIndex: 20, opacity: disabled ? 0 : 1 }, positionStyle]}>
      <LocalButton location={location} mapRef={mapRef} />
      <Pressable onPress={onOpenLines} accessibilityRole="button"
        accessibilityLabel="Ver linhas no mapa" hitSlop={8}
        style={{ width: 48, height: 48, borderRadius: 999,
          alignItems: "center", justifyContent: "center",
          backgroundColor: cores.fundoPainel, borderWidth: 1, borderColor: cores.borda,
          shadowColor: cores.sombra, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}>
        <IconeLinhas color={cores.iconePrimario} size={22} />
      </Pressable>
    </Animated.View>
  );
}
