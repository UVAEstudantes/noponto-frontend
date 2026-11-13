import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Map,
  Navigation,
  Search,
  Sparkles,
  X,
} from "lucide-react-native";
import TutorialSpotlight from "./TutorialSpotlight";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTema } from "@/src/hooks/useTema";
import { useTutorial } from "./TutorialProvider";
import {
  radarSection,
  transportSearchStep,
  RAIL_STATUS_GUIDE,
  tutorialPresentation,
  linePanelStep,
  tutorialCardPlacement,
} from "./tutorialSteps";
const YELLOW = "#FFC107";
export default function TutorialOverlay({
  inLineModal = false,
  host = "root",
}: { inLineModal?: boolean; host?: "root" | "radar" | "stopPicker" | "confirmation" } = {}) {
  const t = useTutorial();
  const { cores, temaAtual } = useTema();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const root = useRef<View>(null);
  const cardScroll = useRef<ScrollView>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [frame, setFrame] = useState({ y: 0, x: 0, height, width: 0 });
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const cardTop = useRef(new Animated.Value(0)).current;
  const previousPlacement = useRef<{ top: number; upper: boolean } | null>(
    null,
  );
  const lastCardTarget = useRef<{
    owner: string;
    rect: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const correctHost = t.chapter === 5 ? (t.radarHost ?? "root") === host && !inLineModal : host === "root" && Boolean(t.lineModalOpen) === inLineModal;
  const inModal = inLineModal || host !== "root";
  const reducedMotion = t.reducedMotion ?? true;
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setKeyboardTop(e.endCoordinates.screenY),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardTop(null),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useEffect(() => {
    if (!t.step || !correctHost) return;
    AccessibilityInfo.announceForAccessibility(
      tutorialPresentation(t.step, false).title,
    );
    cardScroll.current?.scrollTo({ y: 0, animated: false });
  }, [t.step, correctHost, reducedMotion]);
  useEffect(() => {
    if (!t.step || !correctHost) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      t.end();
      return true;
    });
    return () => sub.remove();
  }, [t.step, correctHost, t.end]);
  const step = t.step ?? "welcome";
  const search = t.step === "search";
  const compact = (search || transportSearchStep(t.step)) && t.searching;
  const rawTarget = t.spotlight ?? (search ? t.target : null);
  const r = rawTarget
    ? { ...rawTarget, x: rawTarget.x - frame.x, y: rawTarget.y - frame.y }
    : null;
  const info = tutorialPresentation(step, t.routeAvailable);
  const Icon = ({
    welcome: Navigation,
    invite: Sparkles,
    search: Search,
    route: Map,
    done: Check,
    vehiclesIntro: Navigation,
    vehicle: Navigation,
    vehicleDetails: Search,
    noVehicles: Navigation,
    vehicleDemo: Navigation,
    vehiclesDone: Check,
    stopsIntro: Map,
    stop: Map,
    stopDetails: Search,
    noStops: Map,
    stopDemo: Map,
    stations: Map,
    stopsDone: Check,
    linesIntro: Map,
    lineControls: Map,
    lineDirection: Navigation,
    lineColor: Sparkles,
    lineFavorite: Check,
    lineVisibility: Map,
    lineRemove: Map,
    lineTab: Map,
    linesDone: Check,
  } as Partial<Record<string, typeof Map>>)[step] ?? Navigation;
  const interactive =
    t.chapter === 5 || t.chapter === 6 ||
    search ||
    linePanelStep(t.step) ||
    t.step === "lineTab" ||
    ["vehicle", "vehicleDetails", "stop", "stopDetails"].includes(step);
  const linePanel = !inLineModal && linePanelStep(t.step);
  const details =
    t.chapter === 5 || t.chapter === 6 || t.step === "vehicleDetails" || t.step === "stopDetails" || linePanel;
  const bottom =
    keyboardTop === null
      ? inModal
        ? insets.bottom + 8
        : Math.max(insets.bottom + 82, 96)
      : Math.max(8, frame.y + frame.height - keyboardTop + 8);
  const headerBottom =
    !inModal && t.target
      ? t.target.y + t.target.height - frame.y + 8
      : insets.top + 8;
  const owner = step + ":" + host + (inLineModal ? ":modal" : "");
  if (!correctHost) lastCardTarget.current = null;
  else if (r) lastCardTarget.current = { owner, rect: r };
  const cardTarget =
    r ??
    (lastCardTarget.current?.owner === owner
      ? lastCardTarget.current.rect
      : null);
  const placement = tutorialCardPlacement(
    Math.max(insets.top + 8, headerBottom),
    frame.height - bottom,
    details || inModal ? cardTarget : null,
    contentHeight,
  );
  const section = radarSection(t.step);
  const count = t.chapter === 6 ? 7 : section === "5A" ? 5 : section === "5B" ? 6 : section === "5C" ? 9 : t.chapter === 4 ? 9 : 4;
  const smallCard = compact || placement.compact;
  const visible =
    t.ready && Boolean(t.step) && correctHost;
  useEffect(() => {
    if (!visible) {
      previousPlacement.current = null;
      return;
    }
    const previous = previousPlacement.current;
    previousPlacement.current = { top: placement.top, upper: placement.upper };
    if (!previous || previous.upper === placement.upper || reducedMotion) {
      cardTop.setValue(placement.top);
      return;
    }
    const animation = Animated.timing(cardTop, {
      toValue: placement.top,
      duration: 140,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, placement.top, placement.upper, reducedMotion, cardTop]);
  if (!visible) return null;
  const secondary = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.secondary}
    >
      <Text style={{ color: cores.textoSecundario, fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View
      ref={root}
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFillObject, { zIndex: 1100 }]}
      onLayout={() =>
        root.current?.measureInWindow((x, y, width, h) =>
          setFrame({ x, y, width, height: h }),
        )
      }
    >
      <Animated.View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFillObject, {}]}
      >
        <TutorialSpotlight
          rect={r}
          owner={search ? "search" : step}
          reducedMotion={reducedMotion}
        />
      </Animated.View>
      {!interactive && <View style={StyleSheet.absoluteFillObject} />}
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 14,
          right: 14,
          top: previousPlacement.current ? cardTop : placement.top,
        }}
      >
        <ScrollView
          ref={cardScroll}
          onContentSizeChange={(_, h) => setContentHeight(h)}
          keyboardShouldPersistTaps="always"
          accessibilityViewIsModal={!interactive}
          style={{
            maxHeight: placement.maxHeight,
            borderRadius: 24,
            backgroundColor:
              temaAtual === "claro" ? "#FFFFFF" : cores.fundoCard,
            borderWidth: 1,
            borderColor: cores.bordaSuave,
          }}
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingVertical: smallCard ? 8 : 16,
            gap: smallCard ? 4 : 12,
          }}
        >
          <View style={styles.row}>
            <View
              style={{
                flexDirection: "row",
                gap: 5,
                alignItems: "center",
                flex: 1,
              }}
            >
              {Array.from(
                { length: count },
                (_, index) => index,
              ).map((i) => (
                <View
                  key={i}
                  style={{
                    height: 5,
                    width: i === info.progress ? 20 : 5,
                    borderRadius: 4,
                    backgroundColor:
                      i === info.progress ? YELLOW : cores.bordaSuave,
                  }}
                />
              ))}
              <Text
                style={{
                  color: cores.textoSecundario,
                  fontSize: 11,
                  marginLeft: 4,
                }}
              >
                Cap. {section ?? t.chapter ?? 1} de 6 · {info.progress + 1}/
                {count}
              </Text>
            </View>
            {secondary("Pular", () =>
              ![
                "welcome",
                "invite",
                "done",
                "vehiclesDone",
                "stopsDone",
                "linesDone",
                "radarChapterDone",
              ].includes(t.step ?? "")
                ? t.advance("skip")
                : t.end(),
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Encerrar tutorial"
              onPress={t.end}
              style={styles.close}
            >
              <X size={16} color={cores.textoSecundario} />
            </Pressable>
          </View>
          <View
            style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}
          >
            {!smallCard && (
              <View style={styles.icon}>
                <Icon
                  size={22}
                  color={temaAtual === "escuro" ? YELLOW : "#916500"}
                />
              </View>
            )}
            <View style={{ flex: 1, gap: 5 }}>
              <Text
                accessibilityRole="header"
                style={{
                  color: cores.textoPrimario,
                  fontSize: smallCard ? 15 : 20,
                  fontWeight: "700",
                }}
              >
                {compact && t.chapter !== 6 ? "Escolha uma linha nos resultados." : info.title}
              </Text>
              {!compact && (
                <Text
                  style={{
                    color: cores.textoSecundario,
                    fontSize: 14,
                    lineHeight: 21,
                  }}
                >
                  {t.step === "vehicleDetails" && t.vehicleInfo
                    ? [
                        "Consulte a identificação",
                        t.vehicleInfo.hasDirection ? "o sentido" : null,
                        t.vehicleInfo.hasNextStop
                          ? t.lineContext?.modal === "trem"
                            ? "a próxima estação (em Mais detalhes)"
                            : "a próxima parada (em Mais detalhes)"
                          : null,
                        t.vehicleInfo.hasDistance
                          ? "a distância disponível"
                          : null,
                        "e o estado da localização. Os dados variam com o sinal.",
                      ]
                        .filter(Boolean)
                        .join(", ")
                    : t.step === "lineRemove" && t.lineFavoritesView
                      ? "Nesta visualização, Desfavoritar retira a linha dos favoritos. Você pode continuar sem alterar nada."
                      : info.description}
                </Text>
              )}
            </View>
          </View>
          {transportSearchStep(t.step) && t.selectedFilter && <Text style={{color: cores.textoSecundario, fontSize: 12}}>Filtro escolhido por você: {({onibus: "Ônibus", brt: "BRT", trem: "Trem", metro: "Metrô", todos: "Todos"} as Record<string, string>)[t.selectedFilter] ?? t.selectedFilter}. Você pode continuar sem selecionar uma linha.</Text>}
          {t.step === "railStatus" && <View style={styles.example}>
            <Text style={{color: cores.textoSecundario, fontSize: 11}}>Guia dos indicadores · sem horários ou dados ao vivo</Text>
            {RAIL_STATUS_GUIDE.map(item => <Text key={item.label} style={{color: cores.textoSecundario, fontSize: 13}}><Text style={{fontWeight: "700"}}>{item.label}</Text> · {item.description}</Text>)}
          </View>}
          {t.step === "journeyDone" && <View style={styles.example}>
            <Text style={{color: cores.textoSecundario}}>Linhas e trajetos · veículos e embarque</Text>
            <Text style={{color: cores.textoSecundario}}>Personalização · Radar, notificações e voz</Text>
            <Text style={{color: cores.textoSecundario}}>BRT e trens · seus transportes no mapa</Text>
          </View>}
          {t.step === "journeyDone" && secondary("Rever tutoriais", t.openTutorials)}
          {t.step === "transportIntro" && secondary("Agora não", t.end)}
          {t.step === "notificationPreview" && <View style={styles.example}>
            <Text style={{color: cores.textoSecundario, fontSize: 12}}>Demonstração · sem dados ao vivo</Text>
            <Text style={{color: cores.textoPrimario, fontWeight: "700"}}>Linha 838 chegando</Text>
            <Text style={{color: cores.textoSecundario}}>Exemplo de aviso: aproximadamente 5 minutos.</Text>
          </View>}
          {t.chapter === 5 && ["radarIntro", "radarDone", "notificationsDone"].includes(step) && secondary(step === "radarIntro" ? "Agora não" : "Encerrar por enquanto", t.end)}
          {t.step === "vehicleDemo" && (
            <View style={styles.example}>
              <Text style={{ color: cores.textoSecundario }}>
                Marcador → toque → painel do veículo
              </Text>
              <Text style={{ color: cores.textoSecundario }}>
                Identificação · sentido quando disponível · estado do sinal
              </Text>
            </View>
          )}
          {t.step === "stopDemo" && (
            <View style={styles.example}>
              <Text style={{ color: cores.textoSecundario }}>
                Parada no mapa → toque → nome e linhas disponíveis
              </Text>
              <Text style={{ color: cores.textoSecundario }}>
                Exemplo ilustrativo · sem horários ou previsões
              </Text>
            </View>
          )}
          {(t.step === "noVehicles" || t.step === "noStops") && (
            <Pressable
              accessibilityRole="button"
              onPress={() => t.advance("demo")}
              style={styles.primary}
            >
              <Text style={{ color: "#222", fontWeight: "700" }}>
                Ver demonstração
              </Text>
            </Pressable>
          )}
          {(t.step === "vehiclesIntro" ||
            t.step === "stopsIntro" ||
            t.step === "linesIntro") &&
            secondary("Agora não", t.end)}
          {t.step === "radarChapterDone" && secondary("Encerrar tutorial", t.end)}
          {["done", "vehiclesDone", "stopsDone", "linesDone"].includes(step) &&
            secondary("Encerrar por enquanto", t.end)}
          {t.step === "lineTab" &&
            !t.inLines &&
            secondary("Abrir Linhas", t.openLines)}
          {search && t.example && (
            <Pressable
              accessibilityRole="button"
              onPress={t.useExample}
              style={styles.example}
            >
              <Text
                style={{
                  color: cores.textoPrimario,
                  fontWeight: "600",
                  fontSize: 13,
                }}
              >
                Usar linha 838 como exemplo →
              </Text>
              {!compact && (
                <Text style={{ color: cores.textoSecundario, fontSize: 12 }}>
                  Se não aparecer, continue buscando ou pule.
                </Text>
              )}
            </Pressable>
          )}
          {(!compact || t.chapter === 6) && (
            <View style={styles.row}>
              {t.step === "welcome" ? (
                secondary("Agora não", t.end)
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Voltar"
                  onPress={() => t.advance("back")}
                  style={styles.secondary}
                >
                  <ArrowLeft size={17} color={cores.textoSecundario} />
                  <Text style={{ color: cores.textoSecundario }}>Voltar</Text>
                </Pressable>
              )}
              {!search &&
                !["vehicle", "stop", "noVehicles", "noStops"].includes(
                  step,
                ) && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={
                      t.step === "invite"
                        ? t.start
                        : t.step === "journeyDone"
                          ? t.complete
                          : () => t.advance("next")
                    }
                    style={styles.primary}
                  >
                    <Text
                      style={{
                        color: "#222222",
                        fontSize: 14,
                        fontWeight: "700",
                      }}
                    >
                      {t.step === "transportIntro" ? "Vamos conhecer" : t.step === "journeyDone" ? "Explorar o NoPonto" : t.step === "radarIntro" ? "Conhecer o Radar" : t.step === "radarDone" ? "Conhecer notificações" : t.step === "notificationsDone" ? "Conhecer avisos por voz" : t.step === "radarChapterDone" ? (t.radarDraftPending ? "Revisar alterações" : "Conhecer outros transportes") : t.step === "linesDone" ? "Continuar para o Radar" : t.step === "invite"
                        ? "Começar tutorial"

                          : t.step === "stopsDone"
                            ? "Continuar para suas linhas"
                            : t.step === "lineTab"
                              ? "Voltar ao mapa"
                              : t.step === "done"
                                ? "Continuar para veículos"
                                : t.step === "vehiclesDone"
                                  ? "Continuar para paradas"
                                  : t.step === "vehiclesIntro" ||
                                      t.step === "stopsIntro" ||
                                      t.step === "linesIntro"
                                    ? "Começar"
                                    : "Continuar"}
                    </Text>
                    <ArrowRight size={17} color="#222222" />
                  </Pressable>
                )}
            </View>
          )}
          {compact && t.chapter !== 6 && (
            <View style={styles.row}>
              {secondary("Voltar", () => t.advance("back"))}
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  secondary: {
    minHeight: 44,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  close: {
    minHeight: 44,
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    flex: 1,
    minWidth: 140,
    minHeight: 46,
    padding: 12,
    borderRadius: 13,
    backgroundColor: YELLOW,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  icon: { padding: 10, borderRadius: 13, backgroundColor: "#FFC10720" },
  example: {
    padding: 10,
    gap: 4,
    borderRadius: 12,
    backgroundColor: "#FFC10716",
    borderWidth: 1,
    borderColor: "#FFC10755",
  },
});
