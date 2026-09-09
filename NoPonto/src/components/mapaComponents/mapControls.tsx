import { useTema } from "@/src/hooks/useTema";
import { PreferenciaLateralidade } from "@/src/services/storage";
import { List, Menu, Search, SlidersHorizontal, X } from "lucide-react-native";
import React, { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LocalButton from "./localButton";
import RotaButton from "./rotaButton";

interface MapControlsProps {
  lateralidade: PreferenciaLateralidade;
  location: any;
  mapRef: React.RefObject<any>;
  onOpenLines: () => void;
  onOpenSearch: () => void;
  onOpenFilter: () => void;
  disabled?: boolean;
}

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}

function ActionButton({ label, onPress, children }: ActionButtonProps) {
  const { cores } = useTema();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{
        width: 48,
        height: 48,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: cores.fundoPainel,
        borderWidth: 1,
        borderColor: cores.borda,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 4,
      }}
    >
      {children}
    </Pressable>
  );
}

export default function MapControls({
  lateralidade,
  location,
  mapRef,
  onOpenLines,
  onOpenSearch,
  onOpenFilter,
  disabled = false,
}: MapControlsProps) {
  const { cores } = useTema();
  const insets = useSafeAreaInsets();
  const [aberto, setAberto] = React.useState(false);
  const lado = lateralidade === "canhoto" ? "left" : "right";

  useEffect(() => {
    if (disabled) setAberto(false);
  }, [disabled]);

  const abrirAcao = (acao: () => void) => {
    setAberto(false);
    acao();
  };

  return (
    <View
      pointerEvents={disabled ? "none" : "box-none"}
      style={{
        position: "absolute",
        [lado]: 16,
        bottom: Math.max(insets.bottom + 70, 88),
        alignItems: "center",
        gap: 10,
        zIndex: 40,
        opacity: disabled ? 0 : 1,
      }}
    >
      <LocalButton location={location} mapRef={mapRef} />

      {aberto && (
        <>
          <Animated.View
            entering={FadeInDown.duration(160)}
            exiting={FadeOutDown.duration(120)}
          >
            <RotaButton />
          </Animated.View>
          <Animated.View
            entering={FadeInDown.duration(180)}
            exiting={FadeOutDown.duration(120)}
          >
            <ActionButton
              label="Ver linhas no mapa"
              onPress={() => abrirAcao(onOpenLines)}
            >
              <List color={cores.iconePrimario} size={22} />
            </ActionButton>
          </Animated.View>
          <Animated.View
            entering={FadeInDown.duration(200)}
            exiting={FadeOutDown.duration(120)}
          >
            <ActionButton
              label="Buscar linhas ou destinos"
              onPress={() => abrirAcao(onOpenSearch)}
            >
              <Search color={cores.iconePrimario} size={22} />
            </ActionButton>
          </Animated.View>
          <Animated.View
            entering={FadeInDown.duration(220)}
            exiting={FadeOutDown.duration(120)}
          >
            <ActionButton
              label="Abrir filtros do mapa"
              onPress={() => abrirAcao(onOpenFilter)}
            >
              <SlidersHorizontal color={cores.iconePrimario} size={22} />
            </ActionButton>
          </Animated.View>
        </>
      )}

      <ActionButton
        label={
          aberto ? "Recolher controles do mapa" : "Expandir controles do mapa"
        }
        onPress={() => setAberto((valor) => !valor)}
      >
        {aberto ? (
          <X color={cores.iconePrimario} size={22} />
        ) : (
          <Menu color={cores.iconePrimario} size={22} />
        )}
      </ActionButton>
    </View>
  );
}
