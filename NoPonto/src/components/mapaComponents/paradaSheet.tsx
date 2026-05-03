import { useTema } from "@/src/hooks/useTema";
import { Parada } from "@/src/types/transporte";
import { ChevronDown, ChevronUp, X } from "lucide-react-native";
import React, { useEffect } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export interface LinhaParadaInfo {
  linhaId: string;
  codigo: string;
  nomeExibicao: string;
  cor: string;
  ativa: boolean;
}

export interface ChegadaParadaInfo {
  linhaId: string;
  codigo: string;
  cor: string;
  etaSeg: number | null;
  distanciaMetros: number | null;
}

interface Props {
  visivel: boolean;
  parada: Parada | null;
  linhas: LinhaParadaInfo[];
  chegadas: ChegadaParadaInfo[];
  expandido: boolean;
  onToggleExpandir: () => void;
  onFechar: () => void;
}

function formatEta(segundos: number | null): string {
  if (segundos == null) return "--";
  const total = Math.max(0, Math.round(segundos));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min > 0) return `${min}m ${sec < 10 ? "0" : ""}${sec}s`;
  return `${sec}s`;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((x) => Math.round(x).toString(16).padStart(2, "0"))
      .join("")
  );
}

function misturar(hex: string, fundo: string, alpha: number) {
  const c = hexToRgb(hex);
  const f = hexToRgb(fundo);
  return rgbToHex(
    c.r * alpha + f.r * (1 - alpha),
    c.g * alpha + f.g * (1 - alpha),
    c.b * alpha + f.b * (1 - alpha),
  );
}

const ParadaSheet = ({
  visivel,
  parada,
  linhas,
  chegadas,
  expandido,
  onToggleExpandir,
  onFechar,
}: Props) => {
  const { cores } = useTema();
  const screenH = Dimensions.get("window").height;
  const COLLAPSED_H = Math.min(screenH * 0.28, 220);
  const EXPANDED_H = Math.min(screenH * 0.56, 460);

  const translateY = useSharedValue(screenH);
  const height = useSharedValue(COLLAPSED_H);
  const overlayOpacity = useSharedValue(0);
  const detailsOpacity = useSharedValue(0);

  useEffect(() => {
    if (visivel) {
      height.value = withSpring(expandido ? EXPANDED_H : COLLAPSED_H, {
        damping: 18,
        stiffness: 170,
      });
      translateY.value = withTiming(0, { duration: 220 });
      overlayOpacity.value = withTiming(expandido ? 1 : 0.5, {
        duration: 200,
      });
      detailsOpacity.value = withTiming(expandido ? 1 : 0, { duration: 180 });
    } else {
      translateY.value = withTiming(screenH, { duration: 220 });
      overlayOpacity.value = withTiming(0, { duration: 160 });
      detailsOpacity.value = withTiming(0, { duration: 120 });
    }
  }, [
    visivel,
    expandido,
    screenH,
    COLLAPSED_H,
    EXPANDED_H,
    height,
    translateY,
    overlayOpacity,
    detailsOpacity,
  ]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    height: height.value,
    transform: [{ translateY: translateY.value }],
  }));

  const detailsStyle = useAnimatedStyle(() => ({
    opacity: detailsOpacity.value,
  }));

  const hasLinhas = linhas.length > 0;
  const hasChegadas = chegadas.length > 0;

  return (
    <>
      <Animated.View
        pointerEvents={visivel ? "auto" : "none"}
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: cores.overlay,
          },
          overlayStyle,
        ]}
      >
        <Pressable style={{ flex: 1 }} onPress={onFechar} />
      </Animated.View>

      <Animated.View
        pointerEvents={visivel ? "auto" : "none"}
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: cores.fundoPainel,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            borderColor: cores.borda,
            shadowColor: "#000",
            shadowOpacity: 0.2,
            shadowRadius: 10,
            elevation: 12,
            overflow: "hidden",
          },
          sheetStyle,
        ]}
      >
        <View style={{ alignItems: "center", paddingTop: 10 }}>
          <View
            style={{
              width: 42,
              height: 5,
              borderRadius: 3,
              backgroundColor: cores.borda,
            }}
          />
        </View>

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: cores.textoPrimario,
              }}
              numberOfLines={2}
            >
              {parada?.nome ?? "Parada"}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: cores.textoSecundario,
                marginTop: 2,
              }}
            >
              {parada?.ordem != null ? `Parada #${parada.ordem}` : ""}
            </Text>
          </View>
          <Pressable
            onPress={onFechar}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: cores.fundoSecundario,
            }}
          >
            <X size={16} color={cores.textoSecundario} />
          </Pressable>
        </View>

        <View style={{ paddingTop: 4 }}>
          {hasLinhas ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 8,
                gap: 8,
              }}
            >
              {linhas.map((l) => {
                const fundo = misturar(l.cor, cores.fundoCard, 0.12);
                const borda = misturar(l.cor, cores.fundoCard, 0.35);
                return (
                  <View
                    key={l.linhaId}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: fundo,
                      borderWidth: 1,
                      borderColor: borda,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: l.cor,
                      }}
                    >
                      {l.codigo}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <Text
              style={{
                paddingHorizontal: 16,
                paddingBottom: 8,
                fontSize: 12,
                color: cores.textoSecundario,
              }}
            >
              Nenhuma linha assinada nesta parada.
            </Text>
          )}
        </View>

        <Pressable
          onPress={onToggleExpandir}
          style={{
            marginHorizontal: 16,
            marginTop: 2,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: cores.fundoSecundario,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: cores.textoPrimario,
            }}
          >
            {expandido ? "Ocultar detalhes" : "Ver proximos veiculos"}
          </Text>
          {expandido ? (
            <ChevronDown size={16} color={cores.textoPrimario} />
          ) : (
            <ChevronUp size={16} color={cores.textoPrimario} />
          )}
        </Pressable>

        {expandido && (
          <Animated.View
            style={[
              {
                flex: 1,
                paddingTop: 12,
                paddingHorizontal: 16,
              },
              detailsStyle,
            ]}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: cores.textoPrimario,
                marginBottom: 8,
              }}
            >
              Proximos veiculos (linhas assinadas)
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {hasChegadas ? (
                chegadas.map((c) => (
                  <View
                    key={c.linhaId}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      backgroundColor: cores.fundoCard,
                      borderWidth: 1,
                      borderColor: cores.bordaSuave,
                      marginBottom: 8,
                    }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: c.cor,
                        marginRight: 10,
                      }}
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: "700",
                        color: cores.textoPrimario,
                      }}
                    >
                      {c.codigo}
                    </Text>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: cores.textoPrimario,
                        }}
                      >
                        {formatEta(c.etaSeg)}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: cores.textoSecundario,
                          marginTop: 2,
                        }}
                      >
                        {c.distanciaMetros != null
                          ? `${Math.round(c.distanciaMetros)} m`
                          : ""}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text
                  style={{
                    fontSize: 12,
                    color: cores.textoSecundario,
                    marginTop: 4,
                  }}
                >
                  Sem previsão para as linhas assinadas.
                </Text>
              )}
            </ScrollView>
          </Animated.View>
        )}
      </Animated.View>
    </>
  );
};

export default ParadaSheet;
