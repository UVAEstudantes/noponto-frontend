import {
  ArrowLeftRight,
  Bus,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  MapPin,
  MapPinOff,
  MoveRight,
  Train,
  TrainFront,
  X,
} from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import { LinhaSelecionadaInfo } from "@/src/hooks/useMobilidadeRio";
import { ModoSentido } from "@/src/types/transporte";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const MAX_LINHAS_VIEW = 5;

interface Props {
  linhasSelecionadas: LinhaSelecionadaInfo[];
  aoRemoverLinha: (linhaId: string) => void;
  aoToggleAtiva: (linhaId: string) => void;
  aoToggleSentido: (linhaId: string) => void;
  aoToggleParadas: (linhaId: string) => void;
  aberto: boolean;
  aoToggleAberto: () => void;
}

// ─── Manipulação de cor ────────────────────────────────────────────────────

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

function escurecer(hex: string, p = 0.35) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - p), g * (1 - p), b * (1 - p));
}

// ─── Constantes exportadas diretamente ────────────────────────────────────

export const PROXIMO_SENTIDO: Record<ModoSentido, ModoSentido> = {
  ambos: "ida",
  ida: "volta",
  volta: "ambos",
};

const ROTULO_SENTIDO: Record<ModoSentido, string> = {
  ambos: "↔ Ambos",
  ida: "→ Ida",
  volta: "← Volta",
};

// ─── Sub-componentes ───────────────────────────────────────────────────────

function IconeModal({ modal, cor }: { modal: string; cor: string }) {
  const c = escurecer(cor, 0.1);
  switch (modal.toLowerCase()) {
    case "trem":
      return <Train color={c} size={15} />;
    case "metro":
      return <TrainFront color={c} size={15} />;
    default:
      return <Bus color={c} size={15} />;
  }
}

interface LinhaCardProps {
  linha: LinhaSelecionadaInfo;
  aoRemover: () => void;
  aoToggleAtiva: () => void;
  aoToggleSentido: () => void;
  aoToggleParadas: () => void;
}

function LinhaCard({
  linha,
  aoRemover,
  aoToggleAtiva,
  aoToggleSentido,
  aoToggleParadas,
}: LinhaCardProps) {
  const { cores, temaAtual } = useTema();
  const fundo = temaAtual === "escuro" ? "#1E1E1E" : "#FFFFFF";
  const fundoCor = misturar(linha.cor, fundo, 0.1);
  const bordaCor = misturar(linha.cor, fundo, 0.35);
  const accentCor = misturar(linha.cor, fundo, 0.2);

  return (
    <View
      style={{
        marginBottom: 12,
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: linha.ativa ? fundoCor : cores.fundoSecundario,
        borderWidth: 1.5,
        borderColor: linha.ativa ? bordaCor : cores.bordaSuave,
      }}
    >
      <View style={{ flexDirection: "row" }}>
        {/* Barra colorida lateral */}
        <View
          style={{
            width: 4,
            backgroundColor: linha.ativa ? linha.cor : cores.borda,
          }}
        />

        <View style={{ flex: 1, padding: 12 }}>
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              marginBottom: 10,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: accentCor,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 10,
              }}
            >
              <IconeModal modal={linha.modal} cor={linha.cor} />
            </View>

            <Text
              style={{
                flex: 1,
                fontWeight: "700",
                fontSize: 13,
                lineHeight: 18,
                color: linha.ativa
                  ? cores.textoPrimario
                  : cores.textoSecundario,
              }}
              numberOfLines={2}
            >
              {linha.nomeExibicao}
            </Text>

            <Pressable
              onPress={aoRemover}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: cores.fundoSecundario,
                alignItems: "center",
                justifyContent: "center",
                marginLeft: 6,
              }}
            >
              <X color={cores.perigo} size={14} />
            </Pressable>
          </View>

          {/* Botões de ação */}
          <View style={{ flexDirection: "row", gap: 6 }}>
            {/* Visibilidade */}
            <Pressable
              onPress={aoToggleAtiva}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: linha.ativa
                  ? misturar(linha.cor, fundo, 0.25)
                  : cores.fundoSecundario,
                gap: 4,
              }}
            >
              {linha.ativa ? (
                <Eye color={linha.cor} size={14} />
              ) : (
                <EyeOff color={cores.textoSecundario} size={14} />
              )}
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: linha.ativa ? linha.cor : cores.textoSecundario,
                }}
              >
                {linha.ativa ? "Visível" : "Oculto"}
              </Text>
            </Pressable>

            {/* Sentido */}
            <Pressable
              onPress={aoToggleSentido}
              style={{
                flex: 1.4,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: accentCor,
                gap: 4,
              }}
            >
              {linha.modoSentido === "ambos" ? (
                <ArrowLeftRight color={escurecer(linha.cor, 0.1)} size={13} />
              ) : (
                <MoveRight
                  color={escurecer(linha.cor, 0.1)}
                  size={13}
                  style={{
                    transform: [
                      { scaleX: linha.modoSentido === "volta" ? -1 : 1 },
                    ],
                  }}
                />
              )}
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: escurecer(linha.cor, 0.1),
                }}
              >
                {ROTULO_SENTIDO[linha.modoSentido]}
              </Text>
            </Pressable>

            {/* Paradas */}
            <Pressable
              onPress={aoToggleParadas}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: linha.mostrarParadas
                  ? misturar(linha.cor, fundo, 0.25)
                  : cores.fundoSecundario,
                gap: 4,
              }}
            >
              {linha.mostrarParadas ? (
                <MapPin color={linha.cor} size={14} />
              ) : (
                <MapPinOff color={cores.textoSecundario} size={14} />
              )}
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: linha.mostrarParadas
                    ? linha.cor
                    : cores.textoSecundario,
                }}
              >
                {linha.mostrarParadas ? "Paradas" : "Ocultas"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Container principal ───────────────────────────────────────────────────

function LinhasContainer({
  linhasSelecionadas,
  aoRemoverLinha,
  aoToggleAtiva,
  aoToggleSentido,
  aoToggleParadas,
  aberto,
  aoToggleAberto,
}: Props) {
  const { cores } = useTema();
  const largura = 290;
  const translateX = useSharedValue(-largura);

  const estiloContainer = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const estiloBotao = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value + largura - 12 }],
  }));

  React.useEffect(() => {
    translateX.value = withSpring(aberto ? 0 : -largura, {
      damping: 32,
      stiffness: 110,
    });
  }, [aberto, translateX]);

  return (
    <>
      {/* Botão toggle */}
      <Animated.View
        style={[
          estiloBotao,
          { position: "absolute", top: "20%", left: 0, zIndex: 1 },
        ]}
      >
        <Pressable
          onPress={aoToggleAberto}
          hitSlop={{ top: 10, bottom: 10, right: 10, left: 0 }}
        >
          <View
            style={{
              borderTopRightRadius: 16,
              borderBottomRightRadius: 16,
              width: 44,
              height: 56,
              backgroundColor: cores.fundoPainel,
              borderWidth: 1,
              borderLeftWidth: 0,
              borderColor: cores.borda,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 6,
              elevation: 4,
            }}
          >
            {aberto ? (
              <ChevronLeft
                color={cores.iconePrimario}
                size={24}
                strokeWidth={2.5}
              />
            ) : (
              <ChevronRight
                color={cores.iconePrimario}
                size={24}
                strokeWidth={2.5}
              />
            )}
          </View>
        </Pressable>
      </Animated.View>

      {/* Container principal */}
      <Animated.View
        style={[
          estiloContainer,
          {
            position: "absolute",
            top: "18%",
            left: 0,
            width: largura,
            height: "66%",
            backgroundColor: cores.fundoPainel,
            borderTopRightRadius: 20,
            borderBottomRightRadius: 20,
            borderWidth: 1,
            borderLeftWidth: 0,
            borderColor: cores.borda,
            shadowColor: "#000",
            shadowOpacity: 0.2,
            shadowRadius: 12,
            elevation: 10,
            zIndex: 10,
            overflow: "hidden",
          },
        ]}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: cores.bordaSuave,
          }}
        >
          <Text
            style={{
              fontWeight: "700",
              fontSize: 15,
              color: cores.textoPrimario,
            }}
          >
            Linhas no Mapa
          </Text>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 3,
              borderRadius: 20,
              backgroundColor: cores.fundoSecundario,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: cores.textoSecundario,
              }}
            >
              {linhasSelecionadas.length}/{MAX_LINHAS_VIEW}
            </Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {linhasSelecionadas.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text
                style={{
                  color: cores.textoSecundario,
                  fontSize: 13,
                  textAlign: "center",
                  lineHeight: 20,
                }}
              >
                Nenhuma linha selecionada{"\n"}Busque uma linha no campo acima
              </Text>
            </View>
          ) : (
            linhasSelecionadas.map((linha) => (
              <LinhaCard
                key={linha.linhaId}
                linha={linha}
                aoRemover={() => aoRemoverLinha(linha.linhaId)}
                aoToggleAtiva={() => aoToggleAtiva(linha.linhaId)}
                aoToggleSentido={() => aoToggleSentido(linha.linhaId)}
                aoToggleParadas={() => aoToggleParadas(linha.linhaId)}
              />
            ))
          )}
        </ScrollView>
      </Animated.View>
    </>
  );
}

export default LinhasContainer;