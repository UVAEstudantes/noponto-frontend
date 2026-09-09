import { useTema } from "@/src/hooks/useTema";
import { PreferenciaLateralidade } from "@/src/services/storage";
import { Bus, BusFront, Menu, Search, SlidersHorizontal, Train, TrainFront, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutDown } from "react-native-reanimated";
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

function ActionButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const { cores } = useTema();
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={{ width: 48, height: 48, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: cores.fundoPainel, borderWidth: 1, borderColor: cores.borda, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}>{children}</Pressable>;
}

function Hint({ label, lado, mostrar, children }: { label: string; lado: "left" | "right"; mostrar: boolean; children: React.ReactNode }) {
  const { cores } = useTema();
  return <Animated.View entering={FadeInUp.duration(180)} exiting={FadeOutDown.duration(180)} style={{ flexDirection: lado === "right" ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
    {children}
    {mostrar && <Animated.View entering={FadeInUp.duration(160)} exiting={FadeOutDown.duration(160)}><View style={{ backgroundColor: cores.fundoPainel, borderColor: cores.borda, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ color: cores.textoPrimario, fontSize: 12, fontWeight: "600" }}>{label}</Text></View></Animated.View>}
  </Animated.View>;
}

export default function MapControls({ lateralidade, modalAtivo, location, mapRef, onOpenLines, onOpenSearch, onOpenFilter, disabled = false }: MapControlsProps) {
  const { cores } = useTema();
  const insets = useSafeAreaInsets();
  const [aberto, setAberto] = useState(false);
  const [mostrarDicas, setMostrarDicas] = useState(false);
  const lado = lateralidade === "canhoto" ? "left" : "right";

  useEffect(() => { if (disabled) { setAberto(false); setMostrarDicas(false); } }, [disabled]);
  useEffect(() => {
    if (!mostrarDicas) return;
    const timeout = setTimeout(() => setMostrarDicas(false), 12_000);
    return () => clearTimeout(timeout);
  }, [mostrarDicas]);

  const toggle = () => setAberto((valor) => { const proximo = !valor; setMostrarDicas(proximo); return proximo; });
  const abrirAcao = (acao: () => void) => { setAberto(false); setMostrarDicas(false); acao(); };
  const IconeLinhas = modalAtivo === "trem" ? Train : modalAtivo === "metro" ? TrainFront : modalAtivo === "onibus" ? BusFront : Bus;

  return <View pointerEvents={disabled ? "none" : "box-none"} style={{ position: "absolute", [lado]: 16, bottom: Math.max(insets.bottom + 70, 88), alignItems: "center", gap: 10, zIndex: 40, opacity: disabled ? 0 : 1 }}>
    <LocalButton location={location} mapRef={mapRef} />
    {aberto && <>
      <Hint label="Rota" lado={lado} mostrar={mostrarDicas}><RotaButton /></Hint>
      <Hint label="Linhas / veículos" lado={lado} mostrar={mostrarDicas}><ActionButton label="Ver linhas no mapa" onPress={() => abrirAcao(onOpenLines)}><IconeLinhas color={cores.iconePrimario} size={22} /></ActionButton></Hint>
      <Hint label="Buscar" lado={lado} mostrar={mostrarDicas}><ActionButton label="Buscar linhas ou destinos" onPress={() => abrirAcao(onOpenSearch)}><Search color={cores.iconePrimario} size={22} /></ActionButton></Hint>
      <Hint label="Filtro" lado={lado} mostrar={mostrarDicas}><ActionButton label="Abrir filtros do mapa" onPress={() => abrirAcao(onOpenFilter)}><SlidersHorizontal color={cores.iconePrimario} size={22} /></ActionButton></Hint>
    </>}
    <ActionButton label={aberto ? "Recolher controles do mapa" : "Expandir controles do mapa"} onPress={toggle}>{aberto ? <X color={cores.iconePrimario} size={22} /> : <Menu color={cores.iconePrimario} size={22} />}</ActionButton>
  </View>;
}
