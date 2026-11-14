import { useReducedMotion } from "react-native-reanimated";
import { buscarModais } from "@/src/services/mobilidadeRio";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Route, X } from "lucide-react-native";
import { api } from "@/src/services/api";
import { useTema } from "@/src/hooks/useTema";
type Linha = { linhaId: string; codigo: string; nome: string; modalId?: string; sentidoId: string; sentido: string };
export function agruparLinhas(linhas: Linha[]) {
  const grupos = new Map<string, Linha & { sentidos: string[] }>();
  for (const linha of linhas) {
    const grupo = grupos.get(linha.linhaId) ?? { ...linha, sentidos: [] };
    const sentido = linha.sentido.trim();
    if (sentido && !grupo.sentidos.some(nome => nome.toLocaleLowerCase() === sentido.toLocaleLowerCase())) grupo.sentidos.push(sentido);
    grupos.set(linha.linhaId, grupo);
  }
  return [...grupos.values()];
}
export default function LinhasDaParada({ paradaId, nome }: { paradaId: string; nome?: string }) {
  const { cores, temaAtual } = useTema();
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [modais, setModais] = useState<Record<string, string>>({});
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const aberto = abertaId === paradaId;
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => { setAbertaId(null); setLinhas(null); setErro(false); }, [paradaId]);
  useEffect(() => {
    if (!aberto || linhas !== null) return;
    const controller = new AbortController();
    setLinhas(null); setErro(false);

    void api.get<Linha[]>(`/paradas/${encodeURIComponent(paradaId)}/linhas`, { signal: controller.signal }).then(response => {
      if (controller.signal.aborted) return;
      if (!response.ok || !Array.isArray(response.data)) { setErro(true); return; }
      setLinhas(response.data);
    }).catch(() => { if (!controller.signal.aborted) setErro(true); });
    return () => controller.abort();
  }, [aberto, paradaId, tentativa, linhas]);
  useEffect(() => {
    if (!aberto) return;
    let live = true;
    void buscarModais().then(items => { if (live) setModais(Object.fromEntries(items.map(m => [m.id, m.nome]))); }).catch(() => {});
    return () => { live = false; };
  }, [aberto]);
  const grupos = agruparLinhas(linhas ?? []);
  const variosModais = new Set(grupos.map(l => l.modalId).filter(Boolean)).size > 1;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Ver linhas que passam nesta parada" accessibilityState={{ expanded: aberto }} onPress={() => setAbertaId(paradaId)} hitSlop={6} android_ripple={{ color: "rgba(16,185,129,.2)", borderless: true }} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: temaAtual === "escuro" ? "#173D36" : "#E0F3EC" }}><Route size={22} color={temaAtual === "escuro" ? "#8CE0BF" : "#14634C"}/></Pressable>
    <Modal visible={aberto} transparent animationType={reduced ? "none" : "fade"} statusBarTranslucent onRequestClose={() => setAbertaId(null)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "rgba(0,0,0,.58)", justifyContent: "center", padding: 20 }}>
        <Pressable accessibilityLabel="Fechar linhas da parada" onPress={() => setAbertaId(null)} style={{ position: "absolute", inset: 0 }}/>
        <View accessibilityViewIsModal style={{ maxHeight: Math.min(560, (height - insets.top - insets.bottom - 40) * .82), width: "100%", maxWidth: 440, alignSelf: "center", borderRadius: 26, backgroundColor: cores.fundoPainel, padding: 20, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}><View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={{ color: cores.textoPrimario, fontSize: 20, fontWeight: "800" }}>Linhas nesta parada</Text>
            <Text style={{ color: temaAtual === "escuro" ? "#B8C2CC" : "#596575", fontSize: 14, lineHeight: 21, marginTop: 5 }}>{nome ?? "Parada"}{linhas !== null && !erro ? ` · ${grupos.length} ${grupos.length === 1 ? "linha" : "linhas"}` : ""}</Text>
          </View><Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={() => setAbertaId(null)} style={{ width: 44, minHeight: 44, justifyContent: "center", alignItems: "center" }}><X size={21} color={cores.textoPrimario}/></Pressable></View>
          <ScrollView nestedScrollEnabled style={{ flexShrink: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 36 }}>
            {erro ? <Pressable onPress={() => setTentativa(v => v + 1)} style={{ paddingVertical: 20 }}><Text accessibilityRole="alert" style={{ color: cores.perigo }}>Não foi possível consultar. Toque para tentar novamente.</Text></Pressable>
              : linhas === null ? <View style={{ padding: 24, gap: 12 }}><ActivityIndicator color={cores.iconePrimario}/><Text style={{ color: cores.textoSecundario, textAlign: "center" }}>Buscando linhas…</Text></View>
              : linhas.length === 0 ? <Text style={{ color: cores.textoSecundario, paddingVertical: 24 }}>Nenhuma linha encontrada nesta parada.</Text>
              : grupos.map(l => <View key={l.linhaId} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: cores.bordaSuave }}>
                <View style={{ minWidth: 46, backgroundColor: cores.fundoApp, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10 }}><Text style={{ color: cores.textoPrimario, fontWeight: "800", textAlign: "center" }}>{l.codigo}</Text></View>
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <Text numberOfLines={2} style={{ color: cores.textoPrimario, fontWeight: "700", fontSize: 15 }}>{l.nome}</Text>
                  {!!l.sentidos.length && <Text style={{ color: temaAtual === "escuro" ? "#B8C2CC" : "#596575", fontSize: 14, lineHeight: 20 }}>{l.sentidos.length > 1 ? "Sentidos: " : "Sentido: "}{l.sentidos.join(" · ")}</Text>}
                  {variosModais && !!l.modalId && !!modais[l.modalId] && <Text style={{ color: cores.textoSecundario, fontSize: 12 }}>{modais[l.modalId]}</Text>}
                </View>
              </View>)}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  </>;
}
