import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Check, ChevronLeft, ChevronRight, MapPin, X } from "lucide-react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { hexParaRgba } from "@/src/utils/cores";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTema } from "@/src/hooks/useTema";
import type { useRadarParada } from "@/src/hooks/useRadarParada";
import type { LinhaSelecionadaInfo } from "@/src/hooks/useMobilidadeRio";
import type { EventoParadaDto } from "@/src/services/eventosParada";
import { rotuloQualidadeEvento } from "@/src/services/eventosParada";
import { doisEventosRadar, instanteEventoRadar } from "@/src/services/radarParada";
import { identidadeModalMapa } from "@/src/constants/modaisMapa";

interface Props {
  radar: ReturnType<typeof useRadarParada>; linhas: LinhaSelecionadaInfo[];
  modal: string; lateralidade: string; visivel: boolean;
  onVerTodos: () => void; onEvento: (evento: EventoParadaDto) => void;
  localizavel: (evento: EventoParadaDto) => boolean;
  viewportHeight: number | null;
  onControlsBottomChange: (bottom: number | null) => void;
}

export default function RadarParada({ radar, linhas, modal, lateralidade, visivel,
  onVerTodos, onEvento, localizavel, viewportHeight, onControlsBottomChange }: Props) {
  const { cores, temaAtual } = useTema();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [recolhido, setRecolhido] = useState(false);
  const [alturaPainel, setAlturaPainel] = useState(0);
  const [seletor, setSeletor] = useState(false);
  const progress = useSharedValue(0);
  const lado = lateralidade === "canhoto" ? "left" : "right";
  const { Icon, cor } = identidadeModalMapa(modal);
  const ladoAba = lado === "right" ? "left" : "right";
  const escuro = temaAtual === "escuro";
  const bottom = Math.max(insets.bottom + 70, 88);
  // Busca existente: safe area + 12 + 44. Reserva também os controles (48 + 10 + 48).
  const alturaDisponivel = Math.max(0, (viewportHeight ?? height) - (insets.top + 56 + 16) - 106 - 12 - bottom - 2);
  useEffect(() => {
    onControlsBottomChange(visivel && !recolhido && alturaPainel > 0
      ? bottom + Math.min(alturaPainel, alturaDisponivel) + 2 + 12 : null);
  }, [visivel, recolhido, alturaPainel, alturaDisponivel, bottom, onControlsBottomChange]);
  useEffect(() => { progress.value = withTiming(recolhido ? 1 : 0, { duration: 260 }); }, [recolhido, progress]);
  useEffect(() => { if (!visivel) setSeletor(false); }, [visivel]);
  const painelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * width * (ladoAba === "right" ? 1 : -1) }],
    opacity: 1 - progress.value,
  }));
  const abaStyle = useAnimatedStyle(() => ({ opacity: progress.value,
    transform: [{ translateX: (1 - progress.value) * 65 * (ladoAba === "right" ? 1 : -1) }] }));
  if (!visivel) return null;
  const compactos = doisEventosRadar(radar.eventos, radar.recebidoEm).slice(0, 2);
  const quantidade = radar.foraContexto ? 0 : new Set(radar.parada?.vinculos.map((item) => item.linhaId) ?? []).size;
  const Recolher = ladoAba === "right" ? ChevronRight : ChevronLeft;
  const Reabrir = ladoAba === "right" ? ChevronLeft : ChevronRight;
  const metadata = radar.parada ? radar.metadados[radar.parada.parada.paradaId] : null;
  const nomeParada = metadata?.nome?.trim() || radar.parada?.parada.nome?.trim();
  // Somente apresentação: não reclassifica nem filtra os eventos recebidos.
  const apenasPartidas = radar.eventos.length > 0
    && radar.eventos.every((evento) => evento.eventType === "DEPARTURE");
  const preposicao = /^estação\b/i.test(nomeParada ?? "") ? "na"
    : /^terminal\b/i.test(nomeParada ?? "") ? "no" : "em";
  const titulo = nomeParada
    ? `${apenasPartidas ? "Saindo de" : `Chegando ${preposicao}`} ${nomeParada}`
    : "Parada não selecionada";
  const metros = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
  return <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { zIndex: 22 }]}>
    <Animated.View pointerEvents={recolhido ? "none" : "auto"}
      accessibilityElementsHidden={recolhido} importantForAccessibility={recolhido ? "no-hide-descendants" : "auto"}
      style={[{ position: "absolute", left: Math.max(14, insets.left + 8), right: Math.max(14, insets.right + 8),
        bottom, borderRadius: 26, backgroundColor: "transparent",
        borderWidth: 1, borderColor: cores.bordaSuave, shadowColor: cores.sombra,
        shadowOpacity: temaAtual === "escuro" ? 0.3 : 0.1, shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 }, elevation: 5 }, painelStyle]}>
      <View onLayout={(event) => {
        const medida = Math.ceil(event.nativeEvent.layout.height);
        setAlturaPainel((anterior) => anterior === medida ? anterior : medida);
      }} style={{ maxHeight: alturaDisponivel, borderRadius: 26, overflow: "hidden" }}>
        {Platform.OS === "ios" && <BlurView pointerEvents="none" intensity={24}
          tint={escuro ? "dark" : "light"} style={StyleSheet.absoluteFillObject} />}
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, {
          backgroundColor: hexParaRgba(cores.fundoPainel, Platform.OS === "ios" ? 0.78 : 0.95),
        }]} />
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: cores.sucesso }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} ellipsizeMode="tail" accessibilityLabel={titulo}
            style={{ fontSize: 13, fontWeight: "700", color: cores.textoPrimario }}>
            {titulo}
          </Text>
          <Text style={{ fontSize: 10, color: cores.textoSecundario, marginTop: 2 }}>
            {radar.manual ? "Manual" : "Automático"}
          </Text>
        </View>
        <Pressable onPress={() => setRecolhido(true)} accessibilityRole="button"
          accessibilityLabel="Recolher painel de próximos veículos"
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center",
            justifyContent: "center", backgroundColor: hexParaRgba(cores.bordaSuave, 0.4) }}>
          <Recolher size={19} color={cores.iconeSecundario} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center",
        justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <Pressable onPress={() => { setSeletor(true); void radar.carregarMetadados(); }}
          accessibilityRole="button" accessibilityLabel="Trocar parada monitorada"
          style={{ minHeight: 44, maxWidth: "100%", borderRadius: 22, paddingHorizontal: 10,
            paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6,
            backgroundColor: hexParaRgba(cores.bordaSuave, escuro ? 0.7 : 0.4) }}>
          <MapPin size={15} color={cores.textoSecundario} />
          <Text style={{ flexShrink: 1, fontSize: 12, fontWeight: "600", color: cores.textoPrimario }}>Trocar parada</Text>
          <ChevronRight size={15} color={cores.textoSecundario} />
        </Pressable>
        <Pressable onPress={onVerTodos} disabled={!radar.parada || radar.foraContexto}
          accessibilityRole="button" accessibilityLabel="Ver todos os eventos da parada"
          accessibilityState={{ disabled: !radar.parada || radar.foraContexto }}
          style={{ minHeight: 44, maxWidth: "100%", marginLeft: "auto", borderRadius: 22,
            paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6,
            borderWidth: 1, borderColor: hexParaRgba(cores.iconePrimario, 0.4),
            backgroundColor: hexParaRgba(cores.iconePrimario, escuro ? 0.12 : 0.09),
            opacity: !radar.parada || radar.foraContexto ? 0.5 : 1 }}>
          <Text style={{ flexShrink: 1, color: escuro ? cores.iconePrimario : "#956000", fontWeight: "700", fontSize: 12 }}>Ver todos</Text>
          <ChevronRight size={15} color={escuro ? cores.iconePrimario : "#956000"} />
        </Pressable>
      </View>
      {compactos.map((evento, index) => {
        const linha = linhas.find((item) => item.linhaId === evento.linhaId);
        const instante = instanteEventoRadar(evento, radar.recebidoEm);
        const minutos = instante == null ? null : Math.max(0, Math.ceil((instante - radar.agora) / 60000));
        const destino = radar.parada?.vinculos.find((item) => item.linhaId === evento.linhaId
          && item.sentidoId === evento.sentidoId && item.padraoVersaoId === evento.padraoVersaoId)?.destino;
        return <Pressable key={evento.eventId} onPress={() => onEvento(evento)} disabled={!localizavel(evento)}
          accessibilityRole="button" accessibilityLabel={`${evento.codigoLinha}, ${evento.eventType === "DEPARTURE" ? "saída" : "chegada"}, ${minutos == null ? "horário indisponível" : `${minutos} minutos`}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 9, paddingVertical: 6,
            borderRadius: 17, minHeight: 52, marginTop: index ? 5 : 0, borderWidth: 1,
            borderColor: index === 0 ? `${cor}40` : cores.bordaSuave,
            backgroundColor: index === 0 ? hexParaRgba(escuro ? cores.fundoCard : "#FFFAEB", 0.96) : hexParaRgba(cores.fundoCard, 0.96) }}>
          <View style={{ minWidth: 40, maxWidth: 90, minHeight: 40, borderRadius: 12, paddingHorizontal: 6,
            alignItems: "center", justifyContent: "center", backgroundColor: linha?.cor ?? cor }}>
            <Text numberOfLines={1} style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{linha?.linhaCodigo ?? evento.codigoLinha}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: cores.textoPrimario, fontSize: 13, fontWeight: "700" }}>{destino || linha?.nomeExibicao || evento.codigoLinha}</Text>
            <Text numberOfLines={1} style={{ color: cores.textoSecundario, fontSize: 10, marginTop: 3 }}>{rotuloQualidadeEvento(evento)}</Text>
          </View>
          <View style={{ alignItems: "flex-end", maxWidth: 110 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: index ? cores.textoPrimario : cores.sucesso }}>
              {evento.eventType === "DEPARTURE" ? "Saída" : "Chegada"} {minutos == null ? "—" : minutos === 0 ? "agora" : `${minutos} min`}
            </Text>
            {evento.distanciaRestanteMetros != null && evento.distanciaRestanteMetros >= 0 &&
              <Text style={{ fontSize: 10, color: cores.textoSecundario, marginTop: 3 }}>{metros(evento.distanciaRestanteMetros)}</Text>}
          </View>
        </Pressable>;
      })}
      {radar.estado && <Text style={{ fontSize: 12, color: cores.textoSecundario, paddingVertical: 4 }}>{radar.estado}</Text>}
      {radar.foraContexto && <Pressable onPress={radar.selecaoAutomatica} accessibilityRole="button">
        <Text style={{ color: cores.iconePrimario, fontSize: 12, fontWeight: "600" }}>Voltar à seleção automática</Text>
      </Pressable>}
        </ScrollView>
      </View>
    </Animated.View>
    <Animated.View pointerEvents={recolhido ? "auto" : "none"} accessibilityElementsHidden={!recolhido}
      importantForAccessibility={!recolhido ? "no-hide-descendants" : "auto"}
      style={[{ position: "absolute", [ladoAba]: Math.max(0, insets[ladoAba]), bottom: bottom + 30,
        backgroundColor: cores.fundoPainel, borderColor: cores.bordaSuave, borderWidth: 1,
        borderTopLeftRadius: ladoAba === "right" ? 32 : 0, borderBottomLeftRadius: ladoAba === "right" ? 32 : 0,
        borderTopRightRadius: ladoAba === "left" ? 32 : 0, borderBottomRightRadius: ladoAba === "left" ? 32 : 0,
        shadowColor: cores.sombra, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 }, abaStyle]}>
      <Pressable onPress={() => setRecolhido(false)} accessibilityRole="button" accessibilityLabel="Abrir painel de próximos veículos"
        style={{ height: 64, width: 60, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <Reabrir size={20} color={cores.textoPrimario} />
        <View style={{ alignItems: "center", gap: 3 }}><Icon size={17} color={cor} />
          <Text style={{ color: cor, fontSize: 11, fontWeight: "700" }}>{quantidade}</Text></View>
      </Pressable>
    </Animated.View>
    <Modal visible={seletor && visivel} transparent animationType="fade" onRequestClose={() => setSeletor(false)}>
      <View style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 16,
        paddingBottom: Math.max(insets.bottom + 16, 24), backgroundColor: cores.overlay }}>
        <Pressable onPress={() => setSeletor(false)} accessibilityLabel="Fechar seletor de paradas" style={StyleSheet.absoluteFillObject} />
        <View style={{ maxHeight: height * 0.6, borderRadius: 22, padding: 14,
          borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.fundoPainel }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: cores.textoPrimario }}>Monitorar parada</Text>
            <Pressable onPress={() => setSeletor(false)} accessibilityLabel="Fechar seletor de paradas" accessibilityRole="button" hitSlop={8}><X size={20} color={cores.iconeSecundario} /></Pressable>
          </View>
          <Pressable onPress={() => { radar.selecaoAutomatica(); setSeletor(false); }} accessibilityRole="button"
            style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 }}>
            <MapPin size={18} color={cores.iconePrimario} />
            <Text style={{ flex: 1, color: cores.textoPrimario, fontWeight: "600" }}>Seleção automática</Text>
            {!radar.manual && <Check size={17} color={cores.iconePrimario} />}
          </Pressable>
          <ScrollView keyboardShouldPersistTaps="handled">
            {radar.candidatos.map((item) => <Pressable key={item.parada.paradaId} accessibilityRole="button"
              onPress={() => { radar.selecionar(item); setSeletor(false); }}
              style={{ paddingVertical: 12, borderTopWidth: 1, borderColor: cores.bordaSuave }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, color: cores.textoPrimario, fontWeight: "600" }}>{radar.metadados[item.parada.paradaId]?.nome ?? item.parada.nome}</Text>
                <Text style={{ fontSize: 11, color: cores.textoSecundario }}>{metros(item.distancia)}</Text>
                {radar.parada?.parada.paradaId === item.parada.paradaId && !radar.foraContexto && <Check size={16} color={cores.iconePrimario} />}
              </View>
              <Text style={{ fontSize: 12, color: cores.textoSecundario, marginTop: 4 }}>{[...new Set(item.vinculos.map((vinculo) => vinculo.destino))].join(" · ")}</Text>
              {radar.metadados[item.parada.paradaId]?.plataforma && <Text style={{ fontSize: 11, color: cores.textoSecundario, marginTop: 3 }}>Plataforma {radar.metadados[item.parada.paradaId].plataforma}</Text>}
              {item.parada.codigo && <Text style={{ fontSize: 10, color: cores.textoSecundario, marginTop: 3 }}>Parada {item.parada.codigo}</Text>}
            </Pressable>)}
            {!radar.candidatos.length && <Text style={{ color: cores.textoSecundario, paddingVertical: 12 }}>Nenhuma parada elegível próxima.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
