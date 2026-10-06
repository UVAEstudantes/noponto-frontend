import { useTema } from "@/src/hooks/useTema";
import { PreferenciaLateralidade } from "@/src/services/storage";
import {
  Bus,
  BusFront,
  Menu,
  Search,
  SlidersHorizontal,
  Train,
  TrainFront,
  X,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LocalButton from "./localButton";
import RotaButton from "./rotaButton";

interface MapControlsProps {
  lateralidade: PreferenciaLateralidade;
  modalAtivo?: string | null;
  location: any;
  mapRef: React.RefObject<any>;
  onOpenLines: () => void;
  onOpenSearch: () => void;
  onOpenFilter: () => void;
  disabled?: boolean;
}

function ActionButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
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

// O botão é o elemento fixo do layout (largura constante, 48px).
// O label é posicionado de forma ABSOLUTA ao lado do botão.
//
// POR QUE MEDIMOS O TEXTO MANUALMENTE:
// Nesse cenário (Text dentro de View position:absolute, dentro de um
// Animated.View, dentro de um contêiner de largura fixa 48px), o Yoga
// costuma medir o texto ANTES de resolver o positioning absoluto,
// usando a largura do contêiner pai (48px) como teto. O resultado é
// o texto quebrando linha numa largura minúscula e nunca sendo
// remedido depois — um bug conhecido de shrink-to-fit + absolute no
// RN/Android. Para contornar de forma confiável, renderizamos o texto
// UMA VEZ de forma invisível/sem quebra pra descobrir sua largura
// real via onLayout, guardamos essa largura em state, e só então
// mostramos a bolha com width explícita = largura medida.
const LABEL_MAX_WIDTH = 320;

// Folga de segurança somada à largura medida. O onLayout do medidor
// às vezes reporta uma largura um pouco menor que a que o texto
// realmente ocupa quando renderizado dentro da bolha final (variação
// de arredondamento/rasterização de fonte no Android), cortando os
// últimos 1-2 caracteres. Esse valor cobre essa diferença sem deixar
// sobra visível nos labels curtos.
const LABEL_WIDTH_BUFFER = 5;

function Hint({
  label,
  lado,
  mostrar,
  children,
}: {
  label: string;
  lado: "left" | "right";
  mostrar: boolean;
  children: React.ReactNode;
}) {
  const { cores } = useTema();
  const [montadoLabel, setMontadoLabel] = useState(false);
  const [largura, setLargura] = useState<number | null>(null);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (mostrar) {
      setMontadoLabel(true);
      opacity.value = withTiming(1, { duration: 160 });
    } else {
      opacity.value = withTiming(0, { duration: 160 }, (finished) => {
        if (finished) runOnJS(setMontadoLabel)(false);
      });
    }
  }, [mostrar, opacity]);

  // Sempre que o label muda, invalida a largura medida pra remedir.
  useEffect(() => {
    setLargura(null);
  }, [label]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: (1 - opacity.value) * 6 }],
  }));

  return (
    <View
      style={{
        width: 88,
        height: 48,
        justifyContent: "center",
        alignItems: lado === "right" ? "flex-end" : "flex-start",
        overflow: "visible",
      }}
    >
      {children}

      {/* Medidor invisível: renderiza o texto fora da tela, sem
          quebra de linha nem limite de largura, só pra capturar a
          largura natural via onLayout. */}
      {montadoLabel && largura === null && (
        <Text
          style={{
            position: "absolute",
            opacity: 0,
            fontSize: 12,
            fontWeight: "600",
          }}
          onLayout={(e) => {
            const medido = Math.ceil(e.nativeEvent.layout.width);
            setLargura(
              Math.min(medido + LABEL_WIDTH_BUFFER, LABEL_MAX_WIDTH)
            );
          }}
        >
          {label}
        </Text>
      )}

      {montadoLabel && largura !== null && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: "50%",
              marginTop: -13,
              [lado === "right" ? "right" : "left"]: 56,
            },
            animatedStyle,
          ]}
        >
          <View
            style={{
              backgroundColor: cores.fundoPainel,
              borderColor: cores.borda,
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 6,
              width: largura + 20, // + padding horizontal
            }}
          >
            <Text
              style={{
                color: cores.textoPrimario,
                fontSize: 12,
                fontWeight: "600",
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// Distância (px) que cada botão do grupo percorre em direção ao
// botão principal ao expandir/recolher. Funciona igual para
// destro/canhoto pois usa apenas translateY (eixo vertical).
const ITEM_TRAVEL = 36;

function GroupItem({
  progress,
  children,
}: {
  progress: SharedValue<number>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * ITEM_TRAVEL },
      { scale: 0.85 + progress.value * 0.15 },
    ],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function MapControls({
  lateralidade,
  modalAtivo,
  location,
  mapRef,
  onOpenLines,
  onOpenSearch,
  onOpenFilter,
  disabled = false,
}: MapControlsProps) {
  const { cores } = useTema();
  const insets = useSafeAreaInsets();
  const [aberto, setAberto] = useState(false);
  // "montado" continua true durante a animação de saída, evitando
  // que os itens desmontem antes do progress chegar a 0.
  const [montado, setMontado] = useState(false);
  const [mostrarDicas, setMostrarDicas] = useState(false);
  const progress = useSharedValue(0);
  const lado = lateralidade === "canhoto" ? "left" : "right";

  useEffect(() => {
    if (disabled) {
      setAberto(false);
      setMostrarDicas(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!mostrarDicas) return;
    const timeout = setTimeout(() => setMostrarDicas(false), 12_000);
    return () => clearTimeout(timeout);
  }, [mostrarDicas]);

  // Sequência: estado lógico (aberto) -> animação (progress) -> montagem (montado)
  useEffect(() => {
    if (aberto) {
      setMontado(true);
      progress.value = withTiming(1, { duration: 220 });
    } else {
      progress.value = withTiming(0, { duration: 180 }, (finished) => {
        if (finished) runOnJS(setMontado)(false);
      });
    }
  }, [aberto, progress]);

  const toggle = () =>
    setAberto((valor) => {
      const proximo = !valor;
      setMostrarDicas(proximo);
      return proximo;
    });

  const abrirAcao = (acao: () => void) => {
    setAberto(false);
    setMostrarDicas(false);
    acao();
  };

  const IconeLinhas =
    modalAtivo === "trem"
      ? Train
      : modalAtivo === "metro"
        ? TrainFront
        : modalAtivo === "onibus"
          ? BusFront
          : Bus;

  return (
    <View
      pointerEvents={disabled ? "none" : "box-none"}
      style={{
        position: "absolute",
        [lado]: 16,
        bottom: Math.max(insets.bottom + 70, 88),
        alignItems: lado === "right" ? "flex-end" : "flex-start",
        gap: 10,
        zIndex: 40,
        opacity: disabled ? 0 : 1,
      }}
    >
      <LocalButton location={location} mapRef={mapRef} />
      {montado && (
        <>
          <GroupItem progress={progress}>
            <Hint label="Rota" lado={lado} mostrar={mostrarDicas}>
              <RotaButton />
            </Hint>
          </GroupItem>
          <GroupItem progress={progress}>
            <Hint label="Linhas / veículos" lado={lado} mostrar={mostrarDicas}>
              <ActionButton
                label="Ver linhas no mapa"
                onPress={() => abrirAcao(onOpenLines)}
              >
                <IconeLinhas color={cores.iconePrimario} size={22} />
              </ActionButton>
            </Hint>
          </GroupItem>
          <GroupItem progress={progress}>
            <Hint label="Buscar" lado={lado} mostrar={mostrarDicas}>
              <ActionButton
                label="Buscar linhas ou destinos"
                onPress={() => abrirAcao(onOpenSearch)}
              >
                <Search color={cores.iconePrimario} size={22} />
              </ActionButton>
            </Hint>
          </GroupItem>
          <GroupItem progress={progress}>
            <Hint label="Filtro" lado={lado} mostrar={mostrarDicas}>
              <ActionButton
                label="Abrir filtros do mapa"
                onPress={() => abrirAcao(onOpenFilter)}
              >
                <SlidersHorizontal color={cores.iconePrimario} size={22} />
              </ActionButton>
            </Hint>
          </GroupItem>
        </>
      )}
      <ActionButton
        label={
          aberto ? "Recolher controles do mapa" : "Expandir controles do mapa"
        }
        onPress={toggle}
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