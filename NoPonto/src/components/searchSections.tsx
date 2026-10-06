import type { OpcaoBusca } from "@/src/types/transporte";
import { useTema } from "@/src/hooks/useTema";
import { BusFront, ChevronRight, Clock3, CornerUpLeft, Search, TrainFront } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, Text, View, ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

interface Props {
  recentes: OpcaoBusca[];
  resultados: OpcaoBusca[];
  carregando?: boolean;
  onSelect: (item: OpcaoBusca) => void;
  onSelectionStart?: () => void;
  style?: ViewStyle;
  maxHeight?: number;
  embedded?: boolean;
}

export default function SearchSections({ recentes, resultados, carregando = false,
  onSelect, onSelectionStart, style, maxHeight = 400, embedded = false }: Props) {
  const { cores, temaAtual } = useTema();
  const resultadoFundo = temaAtual === "escuro" ? "#12352D" : "#E8F8F1";
  const resultadoCor = temaAtual === "escuro" ? "#6EE7B7" : "#07883F";
  if (!recentes.length && !resultados.length && !carregando) return null;
  const section = (title: string, values: OpcaoBusca[], recent = false) => values.length ? (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6,
        paddingHorizontal: 14, paddingTop: 10, paddingBottom: 5 }}>
        {recent && <Clock3 size={14} color={cores.textoSecundario} />}
        {!recent && <Search size={14} color={cores.textoSecundario} />}
        <Text style={{ color: cores.textoSecundario, fontSize: 12, fontWeight: "700" }}>{title}</Text>
      </View>
      {values.map((item) => {
        const isTrain = item.linha.modal?.toLowerCase().includes("trem")
          || item.linha.tipoRota?.toLowerCase().includes("train");
        const Icon = isTrain ? TrainFront : BusFront;
        return <Pressable key={item.linha.id} onPressIn={onSelectionStart}
          onPress={() => onSelect(item)} style={{ paddingHorizontal: 14, paddingVertical: 10,
            borderBottomWidth: 1, borderBottomColor: cores.bordaSuave, flexDirection: "row",
            alignItems: "center", gap: 11 }}>
          <View style={{ width: 36, height: 36, borderRadius: 11, alignItems: "center",
            justifyContent: "center", backgroundColor: recent ? cores.fundoSecundario : resultadoFundo }}>
            <Icon size={18} color={recent ? cores.iconeSecundario : resultadoCor} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: cores.textoPrimario, fontSize: 16, fontWeight: "700" }}>{item.displayName}</Text>
            <Text numberOfLines={1} style={{ color: cores.textoSecundario, fontSize: 12 }}>{item.displaySubtitle}</Text>
          </View>
          {recent ? <CornerUpLeft size={16} color={cores.iconeSecundario} />
            : <ChevronRight size={17} color={cores.iconeSecundario} />}
        </Pressable>;
      })}
    </View>
  ) : null;
  return <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)}
    layout={LinearTransition.duration(140)} style={[{ backgroundColor: cores.fundoCard,
      borderColor: cores.borda, borderWidth: embedded ? 0 : 1,
      borderRadius: embedded ? 0 : 16, overflow: "hidden" }, style]}>
    <ScrollView style={{ maxHeight }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      {section("Buscas recentes", recentes, true)}
      {section("Resultados", resultados)}
      {carregando && <Text style={{ padding: 12, color: cores.textoSecundario, fontSize: 12 }}>Buscando…</Text>}
    </ScrollView>
  </Animated.View>;
}
