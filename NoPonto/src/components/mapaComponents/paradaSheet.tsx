import {passengerRadar} from '@/src/services/radarPassenger';
import type { PhysicalVehicle } from "@/src/services/physicalPresenceContract";
import {renderTerminalPresenceSection} from './terminalPresenceSection';
import {renderRadarVehicleCard} from './radarVehicleCardView';
import {terminalRadarVehicles,type TerminalPresence} from '@/src/services/terminalTracking';
import { useTema } from "@/src/hooks/useTema";
import { Parada } from "@/src/types/transporte";
import { BusFront, ChevronDown, ChevronRight, ChevronUp, Clock3,
  Map, MapPin, RefreshCw, TrainFront, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { StatusConsultaParada } from "@/src/hooks/useConsultaEventosParada";
import { resumoConsultaParada } from "@/src/services/apresentacaoRadar";

export interface LinhaParadaInfo {
  linhaId: string;
  codigo: string;
  nomeExibicao: string;
  cor: string;
  ativa: boolean;
}

export interface ChegadaParadaInfo {
  id: string;
  padraoVersaoId?:string;
  paradaId?:string;
  linhaId?: string;
  codigo: string;
  cor: string;
  assinada?: boolean;
  ordem?: string;
  eventType: "ARRIVAL" | "DEPARTURE";
  nextVehiclesMode: "Departures" | "Arrivals";
  referenciaDisponivel: boolean;
  qualidade: "Programado" | "Estimado" | "Ao vivo";
  etaSeg: number | null;
  distanciaMetros: number | null;
  horarioPrevistoLocal?: string | null;
  confianca?: string | null;
  status?: number | null;
  proximaParadaNome?: string | null;
  destino?: string | null;
  tipoServico?: string | null;
  plataforma?: string | null;
}

interface Props {
  terminalPresence?:TerminalPresence[];
  onTerminalVehicle?:(vehicle:TerminalPresence)=>void;
  physicalVehicles?: PhysicalVehicle[];
  physicalModal?: string;
  visivel: boolean;
  parada: Parada | null;
  linhas: LinhaParadaInfo[];
  chegadas: ChegadaParadaInfo[];
  carregandoChegadas?: boolean;
  erroChegadas?: string | null;
  atualizadoEm?: number | null;
  statusConsulta: StatusConsultaParada;
  contextoIndisponivel?: boolean;
  onRecuperarContexto?: () => void;
  onAtualizar?: () => void;
  onFocarVeiculo?: (chegada: ChegadaParadaInfo) => void;
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

function copyEvento(c: ChegadaParadaInfo) {
  if (c.etaSeg != null && c.etaSeg <= 45)
    return c.nextVehiclesMode === "Departures" ? "Saindo agora" : "Chegando agora";
  return `${c.nextVehiclesMode === "Departures" ? "Saída em" : "Chega em"} ${formatEta(c.etaSeg)}`;
}

function formatStatus(status?: number | null): string | null {
  if (status == null || status === 0) return null;
  if (status === 1) return "Sem sinal";
  if (status === 2) return "Inativo";
  return "Indefinido";
}

function formatConfianca(valor?: string | null): string | null {
  if (!valor) return null;
  return valor.charAt(0).toUpperCase() + valor.slice(1);
}

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

const ParadaSheet = ({
  terminalPresence = [],
  onTerminalVehicle,
  physicalModal = "onibus",
  visivel,
  parada,
  linhas,
  chegadas,
  carregandoChegadas,
  erroChegadas,
  atualizadoEm,
  statusConsulta,
  contextoIndisponivel = false,
  onRecuperarContexto,
  onAtualizar,
  onFocarVeiculo,
  expandido,
  onToggleExpandir,
  onFechar,
}: Props) => {
  const { cores, temaAtual } = useTema();
  const physicalNow = Date.now();
  const terminalVehicles = contextoIndisponivel||!['onibus','todos'].includes(physicalModal)?[]:terminalRadarVehicles(terminalPresence,parada?.paradaId,linhas.filter(l=>l.ativa).map(l=>({linhaId:l.linhaId})),chegadas,physicalNow);
  const passengerRows=passengerRadar(terminalVehicles,chegadas,parada?.paradaId,physicalNow);
  const [physicalExpandedKey,setPhysicalExpandedKey]=useState<string|null>(null);
  const [physicalInfoKey,setPhysicalInfoKey]=useState<string|null>(null);
  const [visibleResults,setVisibleResults]=useState(20);
  useEffect(()=>{setVisibleResults(20);setPhysicalExpandedKey(null);setPhysicalInfoKey(null);},[parada?.paradaId]);
  const [chegadaExpandidaId, setChegadaExpandidaId] = React.useState<string | null>(null);
  const [conteudoMontado, setConteudoMontado] = React.useState(visivel);
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get("window").height;
  const bottomInset = Math.max(insets.bottom, 8);
  const navSpacer = bottomInset + 88;
  const COLLAPSED_H = Math.min(screenH * 0.32, 260);
  const EXPANDED_H = Math.min(screenH * 0.74, 620);
  const MIN_H = COLLAPSED_H;
  const MAX_H = EXPANDED_H;

  const translateY = useSharedValue(screenH);
  const height = useSharedValue(COLLAPSED_H);
  const startH = useSharedValue(COLLAPSED_H);
  const overlayOpacity = useSharedValue(0);
  const detailsOpacity = useSharedValue(0);

  useEffect(() => {
    if (visivel) {
      setConteudoMontado(true);
      height.value = withTiming(expandido ? EXPANDED_H : COLLAPSED_H, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      });
      translateY.value = withTiming(0, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
      overlayOpacity.value = withTiming(expandido ? 1 : 0.5, {
        duration: 180,
      });
      detailsOpacity.value = withTiming(expandido ? 1 : 0, { duration: 180 });
    } else {
      translateY.value = withTiming(screenH, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      }, (finished) => {
        if (finished) runOnJS(setConteudoMontado)(false);
      });
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

  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onStart(() => {
      startH.value = height.value;
    })
    .onUpdate((e) => {
      const nextH = startH.value - e.translationY;
      if (nextH >= MIN_H && nextH <= MAX_H) {
        height.value = nextH;
      }
    })
    .onEnd(() => {
      const mid = (MIN_H + MAX_H) / 2;
      const nextExpanded = height.value >= mid;
      const target = nextExpanded ? MAX_H : MIN_H;
      height.value = withTiming(target, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      if (nextExpanded !== expandido) {
        runOnJS(onToggleExpandir)();
      }
    });

  const hasLinhas = linhas.length > 0;
  const hasChegadas = passengerRows.length > 0;
  const atualizadoLabel = resumoConsultaParada(statusConsulta, atualizadoEm ?? null);

  if (!visivel && !conteudoMontado) return null;
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
        <Pressable style={{ flex: 1 }} onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar detalhes da parada" hitSlop={6} />
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
            paddingBottom: bottomInset,
          },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={panGesture}>
          <View>
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
              <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center",
                justifyContent: "center", backgroundColor: misturar("#10B981", cores.fundoCard,
                  temaAtual === "escuro" ? 0.20 : 0.12) }}>
                <MapPin size={21} color={temaAtual === "escuro" ? "#6EE7B7" : "#07883F"} />
              </View>
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
                  Ponto de embarque
                </Text>
              </View>
              <Pressable
                onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar detalhes da parada" hitSlop={6}
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

            {contextoIndisponivel && <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: cores.textoPrimario }}>
                Esta parada não está disponível nas linhas, sentidos ou modal selecionados. A parada aberta foi mantida.
              </Text>
              {onRecuperarContexto && <Pressable onPress={onRecuperarContexto} accessibilityRole="button"
                style={{ minHeight: 44, justifyContent: "center" }}>
                <Text style={{ fontSize: 12, color: cores.textoPrimario, fontWeight: "600" }}>Voltar à seleção automática</Text>
              </Pressable>}
            </View>}

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
                {expandido ? "Ocultar detalhes da parada" : "Detalhes da parada"}
              </Text>
              {expandido ? (
                <ChevronDown size={16} color={cores.textoPrimario} />
              ) : (
                <ChevronUp size={16} color={cores.textoPrimario} />
              )}
            </Pressable>
          </View>
        </GestureDetector>

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
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 6,
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: cores.textoPrimario,
                  flex: 1,
                }}
              >
                {chegadas.length > 0 && chegadas.every((c) => c.nextVehiclesMode === "Departures")
                  ? "Próximas saídas"
                  : chegadas.some((c) => c.tipoServico?.toLowerCase().includes("trem"))
                    ? "Próximos trens" : "Próximos ônibus"}
              </Text>
              {onAtualizar && !contextoIndisponivel && (
                <Pressable
                  onPress={onAtualizar}
                  disabled={carregandoChegadas}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: Boolean(carregandoChegadas), busy: Boolean(carregandoChegadas) }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 10,
                    backgroundColor: cores.fundoSecundario,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <RefreshCw size={13} color={cores.textoPrimario} />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: cores.textoPrimario,
                    }}
                  >
                    {erroChegadas ? "Tentar novamente" : "Atualizar"}
                  </Text>
                  </View>
                </Pressable>
              )}
            </View>

            {!contextoIndisponivel && (carregandoChegadas ? (
              <Text
                style={{
                  fontSize: 11,
                  color: cores.textoSecundario,
                  marginBottom: 8,
                }}
              >
                {atualizadoLabel}
              </Text>
            ) : erroChegadas ? (
              <Text
                style={{
                  fontSize: 11,
                  color: cores.perigo,
                  marginBottom: 8,
                }}
              >
                {atualizadoLabel} {atualizadoEm != null ? "Exibindo dados da consulta anterior." : "Tente novamente."}
              </Text>
            ) : atualizadoLabel ? (
              <Text
                style={{
                  fontSize: 11,
                  color: cores.textoSecundario,
                  marginBottom: 8,
                }}
              >
                {atualizadoLabel}
              </Text>
            ) : null)}

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: navSpacer }}
            >
              {contextoIndisponivel ? null : hasChegadas ? (
                  passengerRows.slice(0,visibleResults).map((row)=>{
                  if(row.kind==='physical')return renderTerminalPresenceSection([row.vehicle],physicalNow,cores,onTerminalVehicle,{sheet:true,dark:temaAtual==='escuro',lineColors:Object.fromEntries(linhas.map(l=>[l.linhaId,l.cor])),expandedKey:physicalExpandedKey,infoKey:physicalInfoKey,onToggleInfo:key=>setPhysicalInfoKey(current=>current===key?null:key),forecasts:row.relatedArrivals?.flatMap(a=>a.horarioPrevistoLocal?[a.horarioPrevistoLocal]:a.etaSeg!=null?[formatEta(a.etaSeg)]:[]),onToggle:key=>setPhysicalExpandedKey(current=>current===key?null:key)});
                  const c=row.arrival;
                  const statusLabel = formatStatus(c.status);
                  const confiancaLabel = formatConfianca(c.confianca);
                  const horarioLabel =
                    c.horarioPrevistoLocal ?? formatEta(c.etaSeg);
                  const etaLabel = c.horarioPrevistoLocal ? copyEvento(c) : null;
                  const isAssinada = c.assinada !== false;
                  const itemOpacity = isAssinada ? 1 : 0.55;
                  const isRealtime = c.qualidade === "Ao vivo";
                  const isEstimated = c.qualidade === "Estimado";
                  const fundoStatus = isRealtime
                    ? misturar("#10B981", cores.fundoCard, temaAtual === "escuro" ? 0.20 : 0.12)
                    : isEstimated
                      ? misturar("#0EA5E9", cores.fundoCard, temaAtual === "escuro" ? 0.20 : 0.10)
                      : cores.fundoCard;
                  const corStatus = isRealtime
                    ? (temaAtual === "escuro" ? "#6EE7B7" : "#07883f")
                    : isEstimated
                      ? (temaAtual === "escuro" ? "#7DD3FC" : "#0369A1")
                      : cores.textoSecundario;
                  const textoPrimario = isAssinada
                    ? cores.textoPrimario
                    : cores.textoSecundario;
                  const indicadorCor = isAssinada
                    ? c.cor
                    : misturar(c.cor, cores.fundoCard, 0.25);
                  const itemExpandido = chegadaExpandidaId === c.id;

                  return renderRadarVehicleCard({cardKey:c.id,cores,accent:c.cor,badgeColor:indicadorCor,dark:temaAtual==='escuro',sheet:true,opacity:itemOpacity,
                    onPress:()=>setChegadaExpandidaId(current=>current===c.id?null:c.id),
                    badge:c.tipoServico?.toLowerCase().includes('trem')?<TrainFront size={19} color={indicadorCor}/>:<BusFront size={19} color={indicadorCor}/>,
                    title:c.codigo,titleColor:textoPrimario,subtitle:c.destino??undefined,
                    metadata:<><Text
                          style={{
                            fontSize: 10,
                            color: cores.textoSecundario,
                            marginTop: 2,
                          }}
                        >
                          {[c.tipoServico, c.plataforma && `Plataforma ${c.plataforma}`]
                            .filter(Boolean).join(" · ")}
                        </Text>
                        <View
                          style={{ flexDirection: "row", gap: 8, marginTop: 2 }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "700", paddingHorizontal: 6,
                            paddingVertical: 2, borderRadius: 999,
                            color: corStatus, backgroundColor: fundoStatus }}>
                            {c.qualidade}
                          </Text>
                          {statusLabel && (
                            <Text
                              style={{
                                fontSize: 10,
                                color: cores.perigo,
                                fontWeight: "700",
                              }}
                            >
                              {statusLabel}
                            </Text>
                          )}
                          {confiancaLabel && (
                            <Text
                              style={{
                                fontSize: 10,
                                color: cores.textoSecundario,
                              }}
                            >
                              Confianca {confiancaLabel}
                            </Text>
                          )}
                        </View></>,
                    trailing:<View style={{ alignItems: "flex-end",maxWidth:110,marginLeft:8,flexShrink:0 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: textoPrimario,
                          }}
                        >
                          {horarioLabel}
                        </Text>
                        {etaLabel && (
                          <Text
                            style={{
                              fontSize: 11,
                              color: cores.textoSecundario,
                              marginTop: 2,
                            }}
                          >
                            {c.etaSeg!=null?`${c.eventType==='DEPARTURE'?'Sai':'Chega'} em ${Math.max(0,Math.ceil(c.etaSeg/60))} min`:etaLabel}
                          </Text>
                        )}
                        {c.distanciaMetros != null && (
                          <Text
                            style={{
                              fontSize: 11,
                              color: cores.textoSecundario,
                              marginTop: 2,
                            }}
                          >
                            {Math.round(c.distanciaMetros)} m
                          </Text>
                        )}
                        {!c.referenciaDisponivel && (
                          <Text
                            style={{
                              fontSize: 10,
                              color: cores.textoSecundario,
                              marginTop: 2,
                            }}
                          >
                            Não disponível no mapa
                          </Text>
                        )}
                        {itemExpandido ? <ChevronUp size={15} color={cores.textoSecundario} />
                          : <ChevronRight size={15} color={cores.textoSecundario} />}
                      </View>,
                    children:itemExpandido && (
                        <View style={{ width: "100%", marginTop: 10, paddingTop: 10,
                          borderTopWidth: 1, borderTopColor: cores.bordaSuave }}>
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            {[
                              ...(c.distanciaMetros != null ? [{ Icon: MapPin,
                                value: `${Math.round(c.distanciaMetros)} m`, label: "Distância" }] : []),
                              ...(c.etaSeg != null ? [{ Icon: Clock3, value: formatEta(c.etaSeg),
                                label: c.eventType === "DEPARTURE" ? "Saída" : "Chegada" }] : []),
                            ].map((metric) => <View key={metric.label} style={{ flex: 1, alignItems: "center",
                              paddingVertical: 8, borderRadius: 10, backgroundColor: cores.fundoCard }}>
                              <metric.Icon size={15} color={cores.textoSecundario} />
                              <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: "700", marginTop: 4,
                                color: cores.textoPrimario }}>{metric.value}</Text>
                              <Text style={{ fontSize: 8, color: cores.textoSecundario }}>{metric.label}</Text>
                            </View>)}
                          </View>
                          {onFocarVeiculo && c.referenciaDisponivel && <Pressable
                            onPress={() => onFocarVeiculo(c)} style={{ marginTop: 8, minHeight: 40,
                              borderRadius: 10, flexDirection: "row", gap: 7, alignItems: "center",
                              justifyContent: "center", backgroundColor: fundoStatus }}>
                            <Map size={16} color={corStatus} />
                            <Text style={{ color: corStatus, fontSize: 11, fontWeight: "700" }}>Mostrar no mapa</Text>
                          </Pressable>}
                        </View>
                      )
                  });
                })
              ) : statusConsulta === "sucesso" ? (
                <Text
                  style={{
                    fontSize: 12,
                    color: cores.textoSecundario,
                    marginTop: 4,
                  }}
                >
                  Nenhum próximo veículo previsto nesta seleção.
                </Text>
              ) : null}
                  {passengerRows.length>visibleResults&&<Pressable accessibilityRole="button" onPress={()=>setVisibleResults(n=>n+20)} style={{minHeight:44,justifyContent:"center",alignItems:"center"}}><Text style={{color:cores.iconePrimario,fontWeight:"700"}}>Mostrar mais ônibus</Text></Pressable>}
            </ScrollView>
          </Animated.View>
        )}
      </Animated.View>
    </>
  );
};

export default ParadaSheet;
