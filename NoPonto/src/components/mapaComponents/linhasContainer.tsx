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
  SlidersHorizontal,
  Train,
  TrainFront,
  X,
} from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import { LinhaSelecionadaInfo } from "@/src/hooks/useMobilidadeRio";
import { ModoSentido } from "@/src/types/transporte";
import React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const MAX_LINHAS_VIEW = 10;

interface Props {
  linhasSelecionadas: LinhaSelecionadaInfo[];
  aoRemoverLinha: (linhaId: string) => void;
  aoToggleAtiva: (linhaId: string) => void;
  aoToggleSentido: (linhaId: string) => void;
  aoToggleParadas: (linhaId: string) => void;
  aoAtualizarCor: (linhaId: string, cor: string) => void;
  sentidosPorLinha?: Record<string, { ida?: string; volta?: string }>;
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
    [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")
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

function hslToRgb(h: number, s: number, l: number) {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (hh >= 0 && hh < 1) {
    r = c;
    g = x;
  } else if (hh >= 1 && hh < 2) {
    r = x;
    g = c;
  } else if (hh >= 2 && hh < 3) {
    g = c;
    b = x;
  } else if (hh >= 3 && hh < 4) {
    g = x;
    b = c;
  } else if (hh >= 4 && hh < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const m = lN - c / 2;
  return {
    r: (r + m) * 255,
    g: (g + m) * 255,
    b: (b + m) * 255,
  };
}

function hslToHex(h: number, s: number, l: number) {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function ringSegmentPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
) {
  const startOuter = polarToCartesian(cx, cy, rOuter, endAngle);
  const endOuter = polarToCartesian(cx, cy, rOuter, startAngle);
  const startInner = polarToCartesian(cx, cy, rInner, startAngle);
  const endInner = polarToCartesian(cx, cy, rInner, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;

  return [
    "M",
    startOuter.x,
    startOuter.y,
    "A",
    rOuter,
    rOuter,
    0,
    largeArc,
    0,
    endOuter.x,
    endOuter.y,
    "L",
    startInner.x,
    startInner.y,
    "A",
    rInner,
    rInner,
    0,
    largeArc,
    1,
    endInner.x,
    endInner.y,
    "Z",
  ].join(" ");
}

// ─── Constantes exportadas diretamente ────────────────────────────────────

export const PROXIMO_SENTIDO: Record<ModoSentido, ModoSentido> = {
  ambos: "ida",
  ida: "volta",
  volta: "ambos",
};

function rotuloSentido(
  modo: ModoSentido,
  sentido?: { ida?: string; volta?: string },
) {
  if (modo === "ida") return sentido?.ida || "Ida";
  if (modo === "volta") return sentido?.volta || "Volta";
  const ida = sentido?.ida;
  const volta = sentido?.volta;
  if (ida && volta && ida !== volta) return "Ambos";
  return ida || volta || "Ambos";
}

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
  aoAbrirConfig: () => void;
}

function LinhaCard({ linha, aoRemover, aoAbrirConfig }: LinhaCardProps) {
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

          {/* Botao de configuracao */}
          <View style={{ flexDirection: "row" }}>
            <Pressable
              onPress={aoAbrirConfig}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: accentCor,
                gap: 6,
              }}
            >
              <SlidersHorizontal color={escurecer(linha.cor, 0.1)} size={14} />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: escurecer(linha.cor, 0.1),
                }}
              >
                Configurar
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function ColorWheel({
  cor,
  onChange,
}: {
  cor: string;
  onChange: (cor: string) => void;
}) {
  const { cores } = useTema();
  const size = 190;
  const center = size / 2;
  const outer = 84;
  const inner = 52;
  const segments = 48;

  const parts = React.useMemo(() => {
    const list: { key: string; color: string; path: string }[] = [];
    for (let i = 0; i < segments; i += 1) {
      const start = (i / segments) * 360;
      const end = ((i + 1) / segments) * 360;
      const color = hslToHex((i / segments) * 360, 90, 52);
      list.push({
        key: `${i}-${color}`,
        color,
        path: ringSegmentPath(center, center, outer, inner, start, end),
      });
    }
    return list;
  }, [center, inner, outer, segments]);

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        {parts.map((p) => (
          <Path
            key={p.key}
            d={p.path}
            fill={p.color}
            onPress={() => onChange(p.color)}
          />
        ))}
        <Circle
          cx={center}
          cy={center}
          r={inner - 10}
          fill={cor}
          stroke="#FFFFFF"
          strokeWidth={2}
        />
      </Svg>
      <Text
        style={{
          marginTop: 6,
          fontSize: 11,
          fontWeight: "700",
          color: cores.textoSecundario,
        }}
      >
        {cor.toUpperCase()}
      </Text>
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
  aoAtualizarCor,
  sentidosPorLinha,
  aberto,
  aoToggleAberto,
}: Props) {
  const { cores, temaAtual } = useTema();
  const modalBase = cores.fundoPainel;
  const highlightAlpha = temaAtual === "escuro" ? 0.28 : 0.22;
  const largura = 290;
  const translateX = useSharedValue(-largura);
  const [linhaConfigId, setLinhaConfigId] = React.useState<string | null>(null);

  const linhaConfig = React.useMemo(
    () =>
      linhaConfigId
        ? (linhasSelecionadas.find((l) => l.linhaId === linhaConfigId) ?? null)
        : null,
    [linhaConfigId, linhasSelecionadas],
  );

  const sentidoAtual = React.useMemo(() => {
    if (!linhaConfig) return "";
    return rotuloSentido(
      linhaConfig.modoSentido,
      sentidosPorLinha?.[linhaConfig.linhaId],
    );
  }, [linhaConfig, sentidosPorLinha]);

  React.useEffect(() => {
    if (linhaConfigId && !linhaConfig) {
      setLinhaConfigId(null);
    }
  }, [linhaConfigId, linhaConfig]);

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
                aoAbrirConfig={() => setLinhaConfigId(linha.linhaId)}
              />
            ))
          )}
        </ScrollView>
      </Animated.View>
      <Modal
        transparent
        visible={Boolean(linhaConfig)}
        animationType="fade"
        onRequestClose={() => setLinhaConfigId(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Pressable
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            onPress={() => setLinhaConfigId(null)}
          />
          {linhaConfig && (
            <View
              style={{
                borderRadius: 20,
                padding: 16,
                backgroundColor: cores.fundoPainel,
                borderWidth: 1,
                borderColor: cores.borda,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: cores.textoPrimario,
                    }}
                  >
                    {linhaConfig.nomeExibicao}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: cores.textoSecundario,
                      marginTop: 2,
                    }}
                  >
                    {linhaConfig.linhaCodigo}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setLinhaConfigId(null)}
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

              <View style={{ marginTop: 14, gap: 8 }}>
                <Pressable
                  onPress={() => aoToggleAtiva(linhaConfig.linhaId)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: linhaConfig.ativa
                      ? misturar(linhaConfig.cor, modalBase, highlightAlpha)
                      : cores.fundoSecundario,
                    borderWidth: 1,
                    borderColor: cores.bordaSuave,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {linhaConfig.ativa ? (
                      <Eye color={linhaConfig.cor} size={16} />
                    ) : (
                      <EyeOff color={cores.textoSecundario} size={16} />
                    )}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: cores.textoPrimario,
                      }}
                    >
                      Visibilidade
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: linhaConfig.ativa
                        ? linhaConfig.cor
                        : cores.textoSecundario,
                    }}
                  >
                    {linhaConfig.ativa ? "Visivel" : "Oculto"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => aoToggleSentido(linhaConfig.linhaId)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: misturar(
                      linhaConfig.cor,
                      modalBase,
                      highlightAlpha,
                    ),
                    borderWidth: 1,
                    borderColor: cores.bordaSuave,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {linhaConfig.modoSentido === "ambos" ? (
                      <ArrowLeftRight
                        color={escurecer(linhaConfig.cor, 0.1)}
                        size={16}
                      />
                    ) : (
                      <MoveRight
                        color={escurecer(linhaConfig.cor, 0.1)}
                        size={16}
                        style={{
                          transform: [
                            {
                              scaleX:
                                linhaConfig.modoSentido === "volta" ? -1 : 1,
                            },
                          ],
                        }}
                      />
                    )}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: cores.textoPrimario,
                      }}
                    >
                      Sentido
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: escurecer(linhaConfig.cor, 0.1),
                    }}
                  >
                    {sentidoAtual}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => aoToggleParadas(linhaConfig.linhaId)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: linhaConfig.mostrarParadas
                      ? misturar(linhaConfig.cor, modalBase, highlightAlpha)
                      : cores.fundoSecundario,
                    borderWidth: 1,
                    borderColor: cores.bordaSuave,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {linhaConfig.mostrarParadas ? (
                      <MapPin color={linhaConfig.cor} size={16} />
                    ) : (
                      <MapPinOff color={cores.textoSecundario} size={16} />
                    )}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: cores.textoPrimario,
                      }}
                    >
                      Paradas
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: linhaConfig.mostrarParadas
                        ? linhaConfig.cor
                        : cores.textoSecundario,
                    }}
                  >
                    {linhaConfig.mostrarParadas ? "Ativas" : "Ocultas"}
                  </Text>
                </Pressable>
              </View>

              <View style={{ marginTop: 16 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: cores.textoPrimario,
                    marginBottom: 8,
                  }}
                >
                  Cor da linha
                </Text>
                <ColorWheel
                  cor={linhaConfig.cor}
                  onChange={(cor) => aoAtualizarCor(linhaConfig.linhaId, cor)}
                />
              </View>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

export default LinhasContainer;
