import { useTema } from "@/src/hooks/useTema";
import { useAnimatedPlaceholder } from "@/src/hooks/useAnimatedPlaceholder";
import type { ModalTransporteDto } from "@/src/types/transporte";
import { identidadeModalMapa } from "@/src/constants/modaisMapa";
import { Check, ChevronDown, Search, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SEM_CAMADA_INTERNA = {
  backgroundColor: "transparent", borderWidth: 0,
  shadowColor: "transparent", shadowOpacity: 0, shadowRadius: 0, elevation: 0,
} as const;

interface BuscaMapaProps {
  value: string;
  onChangeText: (value: string) => void;
  onClose: () => void;
  onFocus: () => void;
  active: boolean;
  focusRequest?: number;
  modais: ModalTransporteDto[];
  modalSelecionadoId: string;
  onSelecionarModal: (id: string) => void;
  onMenuAbertoChange?: (aberto: boolean) => void;
  placeholder?: string;
  placeholderSuggestions?: string[];
}

export default function BuscaMapa({ value, onChangeText, onClose, onFocus, active, focusRequest = 0,
  modais, modalSelecionadoId, onSelecionarModal, onMenuAbertoChange,
  placeholder = "Buscar linha, parada ou destino", placeholderSuggestions = [],
}: BuscaMapaProps) {
  const { cores, temaAtual } = useTema();
  const escuro = temaAtual === "escuro";
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const animatedPlaceholder = useAnimatedPlaceholder(placeholderSuggestions, value.length === 0);
  const selecionado = identidadeModalMapa(modalSelecionadoId);
  const IconSelecionado = selecionado.Icon;
  const nomeSelecionado = modais.find((modal) => modal.id === modalSelecionadoId)?.nome ?? "Ônibus";
  const corSeletor = escuro ? selecionado.cor : selecionado.texto;
  // OutsetBoxShadowDrawable recorta o interior. A sombra por elevation pode
  // aparecer através de superfícies translúcidas no Android.
  const sombraExternaAndroid = Platform.OS === "android" && Number(Platform.Version) >= 28;

  useEffect(() => {
    onMenuAbertoChange?.(menuAberto);
  }, [menuAberto, onMenuAbertoChange]);

  useEffect(() => {
    if (active) {
      setMenuAberto(false);
      inputRef.current?.focus();
    }
    else inputRef.current?.blur();
  }, [active, focusRequest]);

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { zIndex: 30 }]}>
      {menuAberto && <Pressable accessibilityLabel="Fechar menu de modais"
        accessibilityRole="button" onPress={() => setMenuAberto(false)}
        style={StyleSheet.absoluteFillObject} />}
      <View style={{ position: "absolute", top: insets.top + 12, left: 12, right: 12,
        height: 44, flexDirection: "row", alignItems: "center", paddingLeft: 12,
        paddingRight: 6, gap: 8, borderRadius: 15, borderWidth: 1,
        borderColor: cores.bordaSuave, backgroundColor: cores.fundoInput,
        shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
        shadowOpacity: escuro ? 0.24 : 0.07, shadowRadius: 8, elevation: 4,
        ...(sombraExternaAndroid ? { elevation: 0, shadowOpacity: 0,
          boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 16,
            color: `rgba(0,0,0,${escuro ? 0.24 : 0.07})` }] } : {}) }}>
        <Search size={18} color={selecionado.cor} />
        <TextInput ref={inputRef} accessibilityLabel="Buscar linhas ou destinos"
          style={{ flex: 1, minWidth: 0, fontSize: 13, color: cores.textoPrimario,
            ...SEM_CAMADA_INTERNA, borderRadius: 0, outlineWidth: 0,
            paddingVertical: 0, paddingHorizontal: 0 }}
          underlineColorAndroid="transparent" placeholder={animatedPlaceholder || placeholder}
          placeholderTextColor={cores.textoSecundario} value={value}
          onFocus={() => { setMenuAberto(false); onFocus(); }}
          onChangeText={onChangeText} returnKeyType="search" />
        {active && <Pressable onPress={() => { setMenuAberto(false); onClose(); }} accessibilityRole="button"
          accessibilityLabel="Fechar busca" hitSlop={4}>
          <X size={16} color={cores.iconeSecundario} />
        </Pressable>}
        <Pressable onPress={() => setMenuAberto((aberto) => !aberto)}
          accessibilityRole="button" accessibilityLabel={`Filtrar por modal: ${nomeSelecionado}`}
          accessibilityState={{ expanded: menuAberto }}
          style={{ width: 104, height: 30, flexShrink: 0, borderRadius: 11,
            borderWidth: 1, borderColor: `${selecionado.cor}${escuro ? "66" : "55"}`,
            backgroundColor: `${selecionado.cor}${escuro ? "20" : "0C"}`,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: selecionado.cor }} />
          <IconSelecionado size={14} color={corSeletor} />
          <Text numberOfLines={1} style={{ color: corSeletor, fontSize: 12, fontWeight: "600" }}>{nomeSelecionado}</Text>
          <ChevronDown size={13} color={corSeletor} style={{ transform: [{ rotate: menuAberto ? "180deg" : "0deg" }] }} />
        </Pressable>
      </View>
      {menuAberto && <View style={{ position: "absolute", top: insets.top + 64,
        right: 12, width: 176, padding: 7, borderRadius: 16, borderWidth: 1,
        borderColor: escuro ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.65)",
        backgroundColor: escuro ? "rgba(24,30,40,0.95)" : "rgba(255,255,255,0.88)",
        shadowColor: "#000", shadowOffset: { width: 0, height: 5 },
        shadowOpacity: escuro ? 0.3 : 0.1, shadowRadius: 12, elevation: 8,
        ...(sombraExternaAndroid ? { elevation: 0, shadowOpacity: 0,
          boxShadow: [{ offsetX: 0, offsetY: 5, blurRadius: 24,
            color: `rgba(0,0,0,${escuro ? 0.3 : 0.1})` }] } : {}) }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between",
          paddingHorizontal: 7, paddingTop: 3, paddingBottom: 7 }}>
          <Text style={{ fontSize: 9, fontWeight: "700", letterSpacing: 0.5, color: cores.textoSecundario }}>MODAIS</Text>
          <Text style={{ fontSize: 8, fontWeight: "700", color: escuro ? "#FBBF24" : "#B87500" }}>FILTRAR</Text>
        </View>
        {modais.map((modal) => {
          const { Icon, cor } = identidadeModalMapa(modal.id);
          const ativo = modal.id === modalSelecionadoId;
          return <Pressable key={modal.id} accessibilityRole="button"
            accessibilityLabel={modal.nome} accessibilityState={{ selected: ativo }}
            onPress={() => { onSelecionarModal(modal.id); setMenuAberto(false); }}
            style={{ ...SEM_CAMADA_INTERNA, height: 36, paddingHorizontal: 8, borderRadius: 10,
              marginBottom: 2, flexDirection: "row", alignItems: "center", gap: 8,
              backgroundColor: ativo ? cor : "transparent" }}>
            <View style={{ width: 23, height: 23, borderRadius: 7, alignItems: "center",
              justifyContent: "center", backgroundColor: ativo ? "rgba(255,255,255,0.22)" : `${cor}${escuro ? "30" : "1F"}` }}>
              <Icon size={14} color={ativo ? "#FFFFFF" : cor} />
            </View>
            <Text style={{ ...SEM_CAMADA_INTERNA, flex: 1, fontSize: 12, fontWeight: "600",
              color: ativo ? "#FFFFFF" : cores.textoPrimario }}>{modal.nome}</Text>
            {ativo && <Check size={14} color="#FFFFFF" />}
          </Pressable>;
        })}
      </View>}
    </View>
  );
}
