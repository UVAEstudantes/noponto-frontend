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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTema } from "@/src/hooks/useTema";
import { useTutorial } from "./TutorialProvider";
import {
  radarSection,
  transportSearchStep,
  RAIL_STATUS_GUIDE,
  tutorialPresentation,
  linePanelStep,
  tutorialCardRegion,
} from "./tutorialSteps";
const YELLOW = "#FFC107";
export default function TutorialOverlay({
  inLineModal = false,
  host = "root",
  docked = false,
}: { inLineModal?: boolean; host?: "root" | "radar" | "stopPicker" | "confirmation"; docked?: boolean } = {}) {
  const t = useTutorial();
  const { cores, temaAtual } = useTema();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const cardScroll = useRef<ScrollView>(null);
  const [descriptionContentHeight, setDescriptionContentHeight] = useState(0);
  const [descriptionHeight, setDescriptionHeight] = useState(0);
  const [frameHeight, setFrameHeight] = useState(height);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
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
  const bottom =
    keyboardTop === null
      ? inModal
        ? insets.bottom + 8
        : Math.max(insets.bottom + 82, 96)
      : Math.max(8, frameHeight - keyboardTop + 8);
  const fixedRegion = !inModal && tutorialCardRegion(t.step);
  // The expanded stop sheet uses up to 74% of the window; reserve the remaining top area.
  const fixedMaxHeight = fixedRegion === "radarTop" ? Math.min(260, height * 0.32) : fixedRegion === "top" || fixedRegion === "lineTop"
    ? Math.max(0, frameHeight * (fixedRegion === "lineTop" ? 0.48 : 0.26) - insets.top - 16)
    : Math.max(0, Math.min(340, frameHeight - bottom - insets.top - 8));
  const dockedMaxHeight = Math.min(340, (height - insets.top - insets.bottom - 24) * 0.45);
  const descriptionOverflow = descriptionContentHeight > descriptionHeight + 1;
  const section = radarSection(t.step);
  const count = t.chapter === 6 ? 7 : section === "5A" ? 5 : section === "5B" ? 6 : section === "5C" ? 9 : t.chapter === 4 ? 9 : 4;
  const smallCard = height < 700 || docked || compact || (fixedRegion ? step === "vehicle" || step === "stop" || step === "stopDetails" : false);
  const visible =
    t.ready && Boolean(t.step) && correctHost;
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
      pointerEvents="box-none"
      style={docked ? { marginBottom: 8, flexShrink: 0 } : [StyleSheet.absoluteFillObject, { zIndex: 1100 }]}
      onLayout={(event) => {
        if (!docked) setFrameHeight(event.nativeEvent.layout.height);
      }}
    >
      {!interactive && <View style={StyleSheet.absoluteFillObject} />}
      <Animated.View
        pointerEvents="box-none"
        style={docked ? { maxHeight: dockedMaxHeight } : {
          maxHeight: fixedMaxHeight,
          position: "absolute",
          left: 14,
          right: 14,
          ...(fixedRegion === "top" || fixedRegion === "lineTop" || fixedRegion === "radarTop" ? { top: insets.top + 8 } : { bottom }),
        }}
      >
        <View
          accessibilityViewIsModal={!interactive}
          style={{
            maxHeight: docked ? dockedMaxHeight : fixedMaxHeight,
            flexShrink: 1,
            paddingHorizontal: smallCard ? 10 : 14,
            paddingVertical: 4,
            borderRadius: 24,
            backgroundColor:
              temaAtual === "claro" ? "#FFFFFF" : cores.fundoCard,
            borderWidth: 1,
            borderColor: cores.bordaSuave,
          }}
        >
          <View style={[styles.row, { flexShrink: 0 }]}>
            <View
              style={{
                flexDirection: "row",
                gap: 5,
                alignItems: "center",
                flex: 1,
              }}
            >
              {!smallCard && Array.from(
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
            {secondary("Pular", () => t.advance("skip"))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Encerrar tutorial"
              onPress={t.end}
              style={styles.close}
            >
              <X size={16} color={cores.textoSecundario} />
            </Pressable>
          </View>
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
          <ScrollView
            ref={cardScroll}
            scrollEnabled
            keyboardShouldPersistTaps="always"
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ gap: smallCard ? 4 : 8, paddingVertical: 4 }}
            onLayout={event => setDescriptionHeight(event.nativeEvent.layout.height)}
            onContentSizeChange={(_width, contentHeight) => setDescriptionContentHeight(contentHeight)}
          >
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
          </ScrollView>
          {descriptionOverflow && <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>Role a explicação para ler mais ↕</Text>}
            <View style={[styles.row, { flexShrink: 0 }]}>
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
                      {t.step === "transportIntro" ? "Vamos conhecer" : t.step === "journeyDone" ? "Explorar o NoPonto" : t.step === "radarIntro" ? "Conhecer o Radar" : t.step === "radarDone" ? "Conhecer notificações" : t.step === "notificationsDone" ? "Conhecer avisos por voz" : t.step === "radarChapterDone" ? "Conhecer outros transportes" : t.step === "linesDone" ? "Continuar para o Radar" : t.step === "invite"
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
                                    : t.chapter === 5 && ["radarStart", "voiceEnable", "voiceSave"].includes(step) ? "Continuar sem ativar" : "Continuar"}
                    </Text>
                    <ArrowRight size={17} color="#222222" />
                  </Pressable>
                )}
            </View>
        </View>
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
    minWidth: 0,
    minHeight: 46,
    padding: 8,
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
