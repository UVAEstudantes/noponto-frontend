import BotaoFavorito from "@/src/components/botaoFavorito";
import EstadoFavoritos from "@/src/components/estadoFavoritos";
import { useFavoritos } from "@/src/hooks/useFavoritos";
import { identidadeModalMapa } from "@/src/constants/modaisMapa";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Bus,
  BusFront,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Eye,
  EyeOff,
  MapPin,
  MapPinOff,
  Plus,
  Star,
  Train,
  TrainFront,
  Trash2,
  X,
} from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import { LinhaSelecionadaInfo } from "@/src/hooks/useMobilidadeRio";
import { ModoSentido } from "@/src/types/transporte";
import { apresentarLinhaBusca } from "@/src/services/searchPresentation";
import React from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

const MAX_LINHAS_VIEW = 10;

interface Props {
  linhasSelecionadas: LinhaSelecionadaInfo[];
  todasLinhasSelecionadas?: LinhaSelecionadaInfo[];
  visualizacaoFavoritos?: boolean;
  favoritasConfiguradas?: LinhaSelecionadaInfo[];
  favoritasVisiveisIds?: ReadonlySet<string>;
  aoEscolherVisibilidadeFavorita?: (id: string) => void;
  aoAdicionarFavorita?: (id: string) => void;
  aoRemoverLinha: (linhaId: string) => void;
  aoToggleAtiva: (linhaId: string) => void;
  aoToggleSentido: (linhaId: string) => void;
  aoSelecionarSentido?: (linhaId: string, modo: ModoSentido) => void;
  aoToggleParadas: (linhaId: string) => void;
  aoAtualizarCor: (linhaId: string, cor: string) => void;
  sentidosPorLinha?: Record<string, { ida?: string; volta?: string }>;
  aberto: boolean;
  aoToggleAberto: () => void;
  modalAtivo?: string | null;
  mostrarBotaoToggle?: boolean;
  opcoesModal?: { id: string; nome: string }[];
  modalSelecionadoId?: string | null;
  aoSelecionarModal?: (modalId: string) => void;
  aoAdicionarLinha?: () => void;
  aoRecolher?: () => void;
  limiteLinhasAtingido?: boolean;
}

// ─── Utilitários de cor ────────────────────────────────────────────────────
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
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function hslToHex(h: number, s: number, l: number) {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

// ─── Geometria do color wheel ──────────────────────────────────────────────
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

// ─── Ciclo de sentidos ─────────────────────────────────────────────────────
export const PROXIMO_SENTIDO: Record<ModoSentido, ModoSentido> = {
  ambos: "ida",
  ida: "volta",
  volta: "ambos",
};

// ─── IconeModal ────────────────────────────────────────────────────────────
function IconeModal({ modal, cor }: { modal: string; cor: string }) {
  switch (modal.toLowerCase()) {
    case "trem":
      return <Train color={cor} size={18} />;
    case "metro":
      return <TrainFront color={cor} size={18} />;
    default:
      return <Bus color={cor} size={18} />;
  }
}

// ─── SelectModalLinhas ──────────────────────────────────────────────────────
// Botões com largura mínima e rolagem horizontal para incluir Favoritos sem truncar nomes.
function SelectModalLinhas({ opcoes, selecionadoId, onSelecionar }: {
  opcoes: { id: string; nome: string }[]; selecionadoId?: string | null; onSelecionar: (id: string) => void;
}) {
  const { cores } = useTema();
  const [largura, setLargura] = React.useState(0);
  const scrollRef = React.useRef<ScrollView>(null);
  const itemWidth = Math.max(104, (largura - 8) / Math.max(1, opcoes.length));
  const animLeft = useSharedValue(4);
  const idx = Math.max(0, opcoes.findIndex((item) => item.id === selecionadoId));
  React.useEffect(() => {
    animLeft.value = withSpring(4 + idx * itemWidth, { damping: 75, stiffness: 680 });
    scrollRef.current?.scrollTo({ x: Math.max(0, idx * itemWidth - largura + itemWidth + 8), animated: true });
  }, [idx, itemWidth, largura, animLeft]);
  const sliderStyle = useAnimatedStyle(() => ({ left: animLeft.value }));
  return <View onLayout={(event) => setLargura(event.nativeEvent.layout.width)}
    style={{ marginHorizontal: 16, marginVertical: 10, borderRadius: 12, overflow: "hidden", backgroundColor: cores.fundoSecundario }}>
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ padding: 4, flexDirection: "row" }}>
        <Animated.View style={[sliderStyle, { position: "absolute", top: 4, bottom: 4,
          width: itemWidth, borderRadius: 9, backgroundColor: cores.fundoPrimario }]} />
        {opcoes.map((item) => {
          const selected = item.id === selecionadoId;
          const { Icon } = identidadeModalMapa(item.id);
          return <Pressable key={item.id} onPress={() => onSelecionar(item.id)}
            accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={item.nome}
            style={{ width: itemWidth, minHeight: 44, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }}>
            <Icon size={15} color={selected ? cores.textoInverso : item.id === "favoritos" ? cores.iconePrimario : cores.textoSecundario}
              fill={item.id === "favoritos" && selected ? cores.textoInverso : "transparent"} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: selected ? cores.textoInverso : cores.textoSecundario }}>{item.nome}</Text>
          </Pressable>;
        })}
      </View>
    </ScrollView>
  </View>;
}

// ─── LinhaCard ────────────────────────────────────────────────────────────
interface LinhaCardProps {
  modoRemocao: boolean;
  linha: LinhaSelecionadaInfo;
  aoRemover: () => void;
  aoToggleAtiva: () => void;
  aoAbrirConfig: () => void;
  isLast: boolean;
  favorita: boolean;
  favoritosProntos: boolean;
  aoToggleFavorita: () => void;
}

function LinhaCard({
  modoRemocao,
  linha,
  aoRemover,
  aoToggleAtiva,
  aoAbrirConfig,
  isLast,
  favorita, favoritosProntos, aoToggleFavorita,
}: LinhaCardProps) {
  const { cores } = useTema();
  const [confirmando, setConfirmando] = React.useState(false);
  React.useEffect(() => {
    if (!modoRemocao) setConfirmando(false);
  }, [modoRemocao]);

  const iconeBg = misturar(linha.cor, cores.fundoSecundario, 0.25);

  const isTrain = linha.modal === "trem";
  const apresentacaoTrem = isTrain ? apresentarLinhaBusca({ codigo: linha.linhaCodigo,
    nome: linha.linhaCodigo, modal: "Trem", tipoRota: "train" }, "trem") : null;
  const codigo = isTrain ? apresentacaoTrem!.displayName : linha.linhaCodigo;
  const descricao = linha.subtitulo ?? apresentacaoTrem?.displaySubtitle
    ?? (linha.nomeExibicao !== codigo ? linha.nomeExibicao : "");

  // Animação de scale ao pressionar
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Animação de saída ao confirmar remoção
  const removeOpacity = useSharedValue(1);
  const removeScale = useSharedValue(1);
  const removeStyle = useAnimatedStyle(() => ({
    opacity: removeOpacity.value,
    transform: [{ scale: removeScale.value }],
  }));

  function handlePressIn() {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
  }

  function handlePressOut() {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  }

  function handleLongPress() {
    setConfirmando(true);
  }

  function handleConfirmarRemover() {
    removeOpacity.value = withTiming(0, { duration: 250 });
    removeScale.value = withTiming(0.88, { duration: 250 }, (done) => {
      if (done) runOnJS(aoRemover)();
    });
  }

  function handleCancelar() {
    setConfirmando(false);
  }

  return (
    <Animated.View style={removeStyle}>
      <Animated.View style={animStyle}>
        {confirmando ? (
          /* ── Banner de confirmação de remoção ── */
          <View
            style={[
              styles.card,
              {
                backgroundColor: misturar("#ff4444", cores.fundoPainel, 0.12),
                justifyContent: "space-between",
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontWeight: "700", fontSize: 13, color: cores.perigo }}
              >
                Remover &quot;{codigo}&quot;?
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: cores.textoSecundario,
                  marginTop: 2,
                }}
              >
                Esta linha será removida do mapa
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={handleCancelar}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 10,
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
                  Cancelar
                </Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmarRemover}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 10,
                  backgroundColor: cores.perigo,
                }}
              >
                <Text
                  style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}
                >
                  Remover
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          /* ── Card normal ── */
          <Pressable
            onPress={modoRemocao ? undefined : aoAbrirConfig}
            onLongPress={modoRemocao ? undefined : handleLongPress}
            onPressIn={modoRemocao ? undefined : handlePressIn}
            onPressOut={modoRemocao ? undefined : handlePressOut}
            android_ripple={{ color: "rgba(255,255,255,0.06)" }}
            style={[styles.card, { opacity: linha.ativa ? 1 : 0.45 }]}
          >
            {/* Ícone — esquerda, sem borda */}
            <View style={[styles.iconeWrapper, { backgroundColor: iconeBg }]}>
              <IconeModal modal={linha.modal} cor={linha.cor} />
            </View>

            {/* Textos — centro */}
            <View style={styles.textos}>
              <Text
                style={[styles.codigo, { color: cores.textoPrimario }]}
                numberOfLines={1}
              >
                {codigo}
              </Text>
              {!!descricao && (
                <Text
                  style={[styles.descricao, { color: cores.textoSecundario }]}
                  numberOfLines={1}
                >
                  {descricao}
                </Text>
              )}
            </View>

            <BotaoFavorito favorita={favorita} disabled={!favoritosProntos} nome={linha.nomeExibicao} onPress={aoToggleFavorita} />
            {/* A remoção ocupa o espaço do chevron, sem cobrir os textos. */}
            {modoRemocao ? <Pressable
              accessibilityRole="button" accessibilityLabel={`Remover linha ${codigo}`}
              onPress={(event) => { event.stopPropagation(); setConfirmando(true); }}
              style={({ pressed }) => ({ width: 40, height: 40, flexShrink: 0,
                alignItems: "center", justifyContent: "center", borderRadius: 10,
                backgroundColor: pressed ? cores.fundoSecundario : "transparent" })}>
              <Trash2 size={18} color={cores.perigo} />
            </Pressable> : <ChevronRight
              color={cores.textoSecundario}
              size={18}
              strokeWidth={2}
            />}
          </Pressable>
        )}
      </Animated.View>

      {/* Divisor */}
      {!isLast && (
        <View style={styles.divisorWrapper}>
          <View
            style={[styles.divisor, { backgroundColor: cores.bordaSuave }]}
          />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  iconeWrapper: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  textos: {
    flex: 1,
    justifyContent: "center",
  },
  codigo: {
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.1,
  },
  descricao: {
    fontSize: 12,
    marginTop: 2,
  },
  divisorWrapper: {
    alignItems: "center",
  },
  divisor: {
    width: "80%",
    height: 1.5,
  },
});

// ─── ColorWheel ───────────────────────────────────────────────────────────
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
  const segments = 360;

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

// ─── LinhasContainer ──────────────────────────────────────────────────────
function LinhasContainer({
  linhasSelecionadas,
  todasLinhasSelecionadas = linhasSelecionadas,
  visualizacaoFavoritos = false,
  favoritasConfiguradas = [],
  favoritasVisiveisIds = new Set<string>(),
  aoEscolherVisibilidadeFavorita,
  aoAdicionarFavorita,
  aoRemoverLinha,
  aoToggleAtiva,
  aoToggleSentido,
  aoSelecionarSentido,
  aoToggleParadas,
  aoAtualizarCor,
  aberto,
  aoToggleAberto,
  modalAtivo,
  mostrarBotaoToggle = true,
  opcoesModal = [],
  modalSelecionadoId,
  aoSelecionarModal,
  aoAdicionarLinha,
  aoRecolher,
  limiteLinhasAtingido = false,
}: Props) {
  const { cores, temaAtual } = useTema();
  const favoritos = useFavoritos();


  const modalBase = cores.fundoPainel;
  const highlightAlpha = temaAtual === "escuro" ? 0.28 : 0.22;

  const [linhaConfigId, setLinhaConfigId] = React.useState<string | null>(null);
  const [corAberta, setCorAberta] = React.useState(false);
  const [modoRemocao, setModoRemocao] = React.useState(false);
  React.useEffect(() => {
    if (!aberto) setModoRemocao(false);
  }, [aberto]);
  React.useEffect(() => setCorAberta(false), [linhaConfigId]);

  const screenHeight = Dimensions.get("window").height;
  const SHEET_HEIGHT = Math.round(screenHeight * 0.52);
  const BASE_BOTTOM = 250;
  const GAP_BTN_SHEET = 5;

  const progress = useSharedValue(aberto ? 1 : 0);
  const [painelVisivel, setPainelVisivel] = React.useState(aberto);
  const aoRecolherRef = React.useRef(aoRecolher);
  aoRecolherRef.current = aoRecolher;
  const avisarRecolhimento = React.useCallback(() => {
    setPainelVisivel(false);
    aoRecolherRef.current?.();
  }, []);
  React.useEffect(() => {
    if (aberto) setPainelVisivel(true);
    progress.value = withTiming(aberto ? 1 : 0, { duration: 260 }, (finished) => {
      if (finished && !aberto) runOnJS(avisarRecolhimento)();
    });
  }, [aberto, progress, avisarRecolhimento]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * (SHEET_HEIGHT + 180) }],
    opacity: 0.85 + progress.value * 0.15,
  }));

  const toggleStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          -progress.value * (SHEET_HEIGHT - BASE_BOTTOM + GAP_BTN_SHEET),
      },
    ],
  }));

  const linhaConfig = React.useMemo(
    () =>
      linhaConfigId
        ? ((visualizacaoFavoritos ? favoritasConfiguradas : linhasSelecionadas).find((l) => l.linhaId === linhaConfigId) ?? null)
        : null,
    [linhaConfigId, linhasSelecionadas, visualizacaoFavoritos, favoritasConfiguradas],
  );

  React.useEffect(() => {
    if (linhaConfigId && !linhaConfig) setLinhaConfigId(null);
  }, [linhaConfigId, linhaConfig]);

  return (
    <>
      {/* ── Botão toggle flutuante ─────────────────────────────────────── */}
      {mostrarBotaoToggle && (
        <Animated.View
          style={[
            {
              position: "absolute",
              right: 35,
              bottom: BASE_BOTTOM,
              zIndex: 34,
            },
            toggleStyle,
          ]}
        >
          <Pressable onPress={aoToggleAberto} hitSlop={10}>
            <View
              style={{
                borderRadius: 999,
                width: 48,
                height: 48,
                backgroundColor: cores.fundoPainel,
                borderWidth: 1,
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
                <ChevronDown
                  color={cores.iconePrimario}
                  size={20}
                  strokeWidth={2.5}
                />
              ) : modalAtivo === "trem" ? (
                <Train color={cores.iconePrimario} size={21} />
              ) : modalAtivo === "metro" ? (
                <TrainFront color={cores.iconePrimario} size={21} />
              ) : modalAtivo === "onibus" ? (
                <BusFront color={cores.iconePrimario} size={21} />
              ) : (
                <Bus color={cores.iconePrimario} size={21} />
              )}
            </View>
          </Pressable>
        </Animated.View>
      )}

      {/* ── Sheet principal ────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents={aberto ? "auto" : "none"}
        style={[
          sheetStyle,
          {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: painelVisivel || aberto ? "flex" : "none",
            height: SHEET_HEIGHT,
            backgroundColor: cores.fundoPainel,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            borderColor: cores.borda,
            shadowColor: "#000",
            shadowOpacity: 0.2,
            shadowRadius: 12,
            elevation: 10,
            zIndex: 33,
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
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
                {visualizacaoFavoritos ? `${favoritos.linhas.length} favoritas` : `${linhasSelecionadas.length}/${MAX_LINHAS_VIEW}`}
              </Text>
            </View>
            <Pressable
              onPress={aoToggleAberto}
              accessibilityRole="button"
              accessibilityLabel="Fechar lista de linhas"
              hitSlop={8}
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
        </View>

        {/* Seletor de modal — mesmo padrão do SelectTransporte (slider animado) */}
        {opcoesModal.length > 0 && (
          <SelectModalLinhas
            opcoes={[...opcoesModal, { id: "favoritos", nome: "Favoritos" }]}
            selecionadoId={modalSelecionadoId}
            onSelecionar={(id) => { setModoRemocao(false); setLinhaConfigId(null); aoSelecionarModal?.(id); }}
          />
        )}

        {/* Ações fixas: fora da rolagem, entre o seletor e os cards. */}
        {!visualizacaoFavoritos && <View style={{ marginHorizontal: 16, paddingTop: 2, paddingBottom: 10 }}>
          <View style={{ width: "100%", flexDirection: "row", alignItems: "center", gap: 10 }}>
            {aoAdicionarLinha && <Pressable onPress={aoAdicionarLinha} accessibilityRole="button"
              accessibilityLabel={limiteLinhasAtingido ? "Limite de linhas atingido" : "Adicionar linha"}
              style={{ flex: 1, height: 42, flexDirection: "row",
                alignItems: "center", justifyContent: "center", gap: 6,
                paddingHorizontal: 12, borderRadius: 12, borderWidth: 1,
                borderColor: cores.borda,
                backgroundColor: cores.fundoPainel }}>
              <Plus size={17} color={cores.iconePrimario} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: cores.textoPrimario }}>Adicionar linha</Text>
            </Pressable>}
            <Pressable onPress={() => setModoRemocao((ativo) => !ativo)}
              disabled={!modoRemocao && linhasSelecionadas.length === 0}
              accessibilityRole="button" accessibilityLabel={modoRemocao ? "Concluir remoção de linhas" : "Ativar remoção de linhas"}
              accessibilityState={{ disabled: !modoRemocao && linhasSelecionadas.length === 0 }}
              style={{ width: 68, flexShrink: 0, height: 42,
                alignItems: "center", justifyContent: "center",
                opacity: !modoRemocao && linhasSelecionadas.length === 0 ? 0.5 : 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: cores.textoSecundario }}>
                {modoRemocao ? "Concluir" : "Limpar"}
              </Text>
            </Pressable>
          </View>
          {limiteLinhasAtingido && <Text style={{ marginTop: 6, fontSize: 11,
            color: cores.textoSecundario }}>Limite de 10 linhas atingido. Remova uma linha para adicionar outra.</Text>}
        </View>}

        {/* Lista */}
        <ScrollView
          key={visualizacaoFavoritos ? "favoritos" : "modal"}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 124 }}
          showsVerticalScrollIndicator={false}
        >
          <EstadoFavoritos {...favoritos} />
          {visualizacaoFavoritos ? <>
            {favoritos.status === "pronto" && favoritos.linhas.length === 0 &&
              <View style={{ alignItems: "center", paddingHorizontal: 24, paddingVertical: 28, gap: 8 }}>
                <Star size={28} color={cores.iconePrimario} />
                <Text style={{ color: cores.textoPrimario, fontSize: 14, fontWeight: "600" }}>Suas linhas favoritas ficam aqui</Text>
                <Text style={{ color: cores.textoSecundario, fontSize: 12, textAlign: "center" }}>Toque na estrela de uma linha em Linhas e Horários para encontrá-la facilmente.</Text>
              </View>}
            {favoritasConfiguradas.filter((linha) => linha.ativa).length > 10 && <Text
              accessibilityLiveRegion="polite" style={{ marginHorizontal: 16, marginBottom: 10, fontSize: 12, color: cores.textoPrimario }}>
              Escolha até 10 linhas para mostrar simultaneamente. {favoritasVisiveisIds.size}/10 visíveis.
            </Text>}
            {favoritos.linhas.map((favorita) => {
              const identidade = identidadeModalMapa(favorita.modal);
              const Icon = identidade.Icon;
              const selecionada = todasLinhasSelecionadas.find((linha) => linha.linhaId === favorita.linhaId);
              const config = favoritasConfiguradas.find((linha) => linha.linhaId === favorita.linhaId);
              const visivel = favoritasVisiveisIds.has(favorita.linhaId);
              return <View key={favorita.linhaId} style={{ marginHorizontal: 16, marginBottom: 8,
                padding: 10, borderRadius: 16, borderWidth: 1, borderColor: cores.bordaSuave,
                backgroundColor: cores.fundoCard, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center",
                  backgroundColor: misturar(identidade.cor, cores.fundoCard, 0.12) }}>
                  <Icon size={20} color={temaAtual === "escuro" ? identidade.cor : identidade.texto} />
                </View>
                <Pressable onPress={() => setLinhaConfigId(favorita.linhaId)} accessibilityRole="button"
                  accessibilityLabel={`Configurar ${favorita.nome}`} style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center" }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "700", color: cores.textoPrimario }}>{favorita.codigo || favorita.nome}</Text>
                  <Text numberOfLines={2} style={{ fontSize: 12, color: cores.textoSecundario }}>{favorita.nome}</Text>
                  <Text style={{ marginTop: 3, fontSize: 11, color: cores.textoSecundario }}>
                    {visivel ? "Visível" : !config?.ativa ? "Inativa nas configurações" : "Oculta nesta visualização"} · {favorita.modal === "onibus" ? "Ônibus" : favorita.modal === "brt" ? "BRT" : favorita.modal === "trem" ? "Trem" : "Metrô"}
                    {!selecionada ? " · Temporária" : " · Configuração salva"}
                  </Text>
                  {!selecionada && <Pressable onPress={(event) => { event.stopPropagation(); aoAdicionarFavorita?.(favorita.linhaId); }}
                    accessibilityRole="button" accessibilityLabel={`Adicionar ${favorita.nome} à lista normal`}
                    style={{ minHeight: 44, justifyContent: "center" }}>
                    <Text style={{ color: cores.textoPrimario, fontSize: 11 }}>+ Adicionar à lista normal</Text>
                  </Pressable>}
                </Pressable>
                <Pressable onPress={() => aoEscolherVisibilidadeFavorita?.(favorita.linhaId)} disabled={!config?.ativa}
                  accessibilityRole="button" accessibilityLabel={`${visivel ? "Ocultar" : "Mostrar"} ${favorita.nome} nesta visualização`}
                  accessibilityState={{ selected: visivel, disabled: !config?.ativa }}
                  style={{ width: 44, height: 44, justifyContent: "center", alignItems: "center", opacity: config?.ativa ? 1 : 0.4 }}>
                  {visivel ? <Eye size={19} color={cores.textoPrimario} /> : <EyeOff size={19} color={cores.textoSecundario} />}
                </Pressable>
                <BotaoFavorito favorita nome={favorita.nome} disabled={favoritos.status !== "pronto"}
                  onPress={() => favoritos.remover(favorita.linhaId)} />
              </View>;
            })}
          </> : <>
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
            linhasSelecionadas.map((linha, index) => (
              <LinhaCard
                key={linha.linhaId}
                modoRemocao={modoRemocao && aberto}
                linha={linha}
                favorita={favoritos.linhas.some((item) => item.linhaId === linha.linhaId)}
                favoritosProntos={favoritos.status === "pronto"}
                aoToggleFavorita={() => favoritos.alternar({ linhaId: linha.linhaId, codigo: linha.linhaCodigo,
                  nome: linha.subtitulo || linha.nomeExibicao, modal: linha.modal })}
                isLast={index === linhasSelecionadas.length - 1}
                aoRemover={() => aoRemoverLinha(linha.linhaId)}
                aoToggleAtiva={() => aoToggleAtiva(linha.linhaId)}
                aoAbrirConfig={() => setLinhaConfigId(linha.linhaId)}
              />
            ))
          )}
          </>}
        </ScrollView>
      </Animated.View>

      {/* ── Modal de configuração individual ──────────────────────────── */}
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
            <ScrollView
              style={{
                borderRadius: 20,
                maxHeight: corAberta ? "90%" : undefined,
                flexGrow: 0,
                flexShrink: 1,
                backgroundColor: cores.fundoPainel,
                borderWidth: 1,
                borderColor: cores.borda,
              }}
              contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
              showsVerticalScrollIndicator={corAberta}
              keyboardShouldPersistTaps="handled"
            >
              <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: cores.borda,
                alignSelf: "center", marginBottom: 12 }} />
              {/* Header do modal */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center",
                  justifyContent: "center", marginRight: 10,
                  backgroundColor: misturar(linhaConfig.cor, cores.fundoPainel, 0.18) }}>
                  <IconeModal modal={linhaConfig.modal} cor={linhaConfig.cor} />
                </View>
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
                    {linhaConfig.subtitulo || "Linha selecionada"}
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

              {/* Opções */}
              <View style={{ marginTop: 14, gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { title: "Visibilidade", subtitle: "Mostrar no mapa", active: linhaConfig.ativa,
                      icon: linhaConfig.ativa ? Eye : EyeOff, action: () => aoToggleAtiva(linhaConfig.linhaId) },
                    { title: "Paradas", subtitle: "Mostrar paradas da linha", active: linhaConfig.mostrarParadas,
                      icon: linhaConfig.mostrarParadas ? MapPin : MapPinOff,
                      action: () => aoToggleParadas(linhaConfig.linhaId) },
                  ].map((tile) => <Pressable key={tile.title} onPress={tile.action} style={{ flex: 1,
                    minHeight: 96, padding: 12, borderRadius: 14, alignItems: "center", justifyContent: "center",
                    backgroundColor: tile.active ? misturar(linhaConfig.cor, modalBase, highlightAlpha) : cores.fundoSecundario,
                    borderWidth: 1, borderColor: tile.active ? linhaConfig.cor : cores.bordaSuave }}>
                    <tile.icon size={23} color={tile.active ? linhaConfig.cor : cores.textoSecundario} />
                    <Text style={{ marginTop: 7, fontSize: 12, fontWeight: "700", color: cores.textoPrimario }}>{tile.title}</Text>
                    <Text style={{ marginTop: 2, fontSize: 9, textAlign: "center", color: cores.textoSecundario }}>{tile.subtitle}</Text>
                  </Pressable>)}
                </View>

                <View style={{ marginTop: 4 }}>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <ArrowLeftRight size={18} color={linhaConfig.cor} />
                    <View><Text style={{ fontSize: 12, fontWeight: "700", color: cores.textoPrimario }}>Sentido</Text>
                      <Text style={{ fontSize: 9, color: cores.textoSecundario }}>Selecionar o sentido da linha</Text></View>
                  </View>
                  <View style={{ flexDirection: "row", padding: 3, borderRadius: 12, backgroundColor: cores.fundoSecundario }}>
                    {(["volta", "ambos", "ida"] as ModoSentido[]).map((modo) => {
                      const active = linhaConfig.modoSentido === modo;
                      const label = modo === "ambos" ? "Ambos"
                        : modo === "volta" ? "Sentido Volta" : "Sentido Ida";
                      return <Pressable key={modo} onPress={() => aoSelecionarSentido
                        ? aoSelecionarSentido(linhaConfig.linhaId, modo) : aoToggleSentido(linhaConfig.linhaId)}
                        accessibilityRole="button" accessibilityLabel={`Selecionar ${label}`}
                        style={{ flex: 1, minHeight: 52, paddingHorizontal: 4, borderRadius: 10,
                          alignItems: "center", justifyContent: "center", backgroundColor: active
                            ? misturar(linhaConfig.cor, modalBase, highlightAlpha) : "transparent",
                          borderWidth: active ? 1 : 0, borderColor: linhaConfig.cor }}>
                        {modo === "ambos" ? <ArrowLeftRight size={16} color={active ? linhaConfig.cor : cores.textoSecundario} />
                          : modo === "volta" ? <ArrowLeft size={16} color={active ? linhaConfig.cor : cores.textoSecundario} />
                            : <ArrowRight size={16} color={active ? linhaConfig.cor : cores.textoSecundario} />}
                        <Text numberOfLines={1} style={{ marginTop: 3, fontSize: 9, fontWeight: active ? "700" : "500",
                          color: active ? linhaConfig.cor : cores.textoPrimario }}>{label}</Text>
                      </Pressable>;
                    })}
                  </View>
                </View>

              </View>

              {/* ColorWheel */}
              <View style={{ marginTop: 10, borderRadius: 12, backgroundColor: cores.fundoSecundario,
                borderWidth: 1, borderColor: cores.bordaSuave, overflow: "hidden" }}>
                <Pressable onPress={() => setCorAberta((value) => !value)} style={{ padding: 12,
                  flexDirection: "row", alignItems: "center", gap: 9 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: linhaConfig.cor }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: cores.textoPrimario }}>Cor da linha</Text>
                    <Text style={{ fontSize: 10, color: cores.textoSecundario }}>{linhaConfig.cor.toUpperCase()}</Text>
                  </View>
                  {corAberta ? <ChevronUp size={16} color={cores.textoSecundario} />
                    : <ChevronDown size={16} color={cores.textoSecundario} />}
                </Pressable>
                {corAberta && <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: cores.bordaSuave }}>
                  <ColorWheel cor={linhaConfig.cor}
                    onChange={(cor) => aoAtualizarCor(linhaConfig.linhaId, cor)} />
                  <Text style={{ marginTop: 12, marginBottom: 8, fontSize: 10, fontWeight: "700",
                    color: cores.textoSecundario }}>Cores sugeridas</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
                    {["#10B981", "#2563EB", "#EF4444", "#F59E0B", "#F97316", "#7C3AED", "#0891B2", "#475569"]
                      .map((cor) => <Pressable key={cor} onPress={() => aoAtualizarCor(linhaConfig.linhaId, cor)}
                        accessibilityLabel={`Usar cor ${cor}`} style={{ width: 25, height: 25, borderRadius: 13,
                          backgroundColor: cor, borderWidth: linhaConfig.cor.toUpperCase() === cor ? 3 : 1,
                          borderColor: linhaConfig.cor.toUpperCase() === cor ? cores.textoPrimario : cores.borda }} />)}
                  </View>
                </View>}
              </View>
              <Pressable onPress={() => {
                setLinhaConfigId(null);
                if (visualizacaoFavoritos) favoritos.remover(linhaConfig.linhaId);
                else aoRemoverLinha(linhaConfig.linhaId);
              }}
                style={{ marginTop: 10, minHeight: 46, borderRadius: 12, flexDirection: "row", gap: 8,
                  alignItems: "center", justifyContent: "center", backgroundColor: "rgba(239,68,68,.10)" }}>
                <Trash2 color={cores.perigo} size={17} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: cores.perigo }}>{visualizacaoFavoritos ? "Desfavoritar linha" : "Remover linha"}</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
}

export default React.memo(LinhasContainer);
