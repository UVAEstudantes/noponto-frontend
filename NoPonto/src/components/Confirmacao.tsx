import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlertTriangle, Check, Trash2, type LucideIcon } from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
export interface ConfirmacaoProps {
  visivel: boolean; titulo: string; descricao: string; variante?: "padrao" | "destrutiva" | "aviso";
  icone?: LucideIcon; confirmarTexto?: string; cancelarTexto?: string; processando?: boolean;
  onConfirmar: () => void | Promise<void>; onCancelar: () => void;
}
export default function Confirmacao({ visivel, titulo, descricao, variante = "padrao", icone,
  confirmarTexto = "Confirmar", cancelarTexto = "Cancelar", processando = false, onConfirmar, onCancelar }: ConfirmacaoProps) {
  const { cores, temaAtual } = useTema();
  const { width, fontScale } = useWindowDimensions();
  const ladoALado = width >= 360 && fontScale <= 1.25;
  const lock = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(false);
  useEffect(() => { if (!visivel) { lock.current = false; setOcupado(false); setErro(false); } }, [visivel]);
  const busy = ocupado || processando;
  const cor = variante === "destrutiva" ? (temaAtual === "escuro" ? "#FCA5A5" : "#B42332") : variante === "aviso" ? "#B77900" : "#FFC107";
  const Icon = icone ?? (variante === "destrutiva" ? Trash2 : variante === "aviso" ? AlertTriangle : Check);
  const cancelar = () => { if (!lock.current && !processando) onCancelar(); };
  const confirmar = async () => {
    if (lock.current || processando) return;
    lock.current = true; setOcupado(true); setErro(false);
    try { await onConfirmar(); }
    catch { setErro(true); lock.current = false; }
    finally { setOcupado(false); }
  };
  return <Modal visible={visivel} transparent animationType="fade" statusBarTranslucent onRequestClose={cancelar}>
    <SafeAreaView style={{ flex: 1, backgroundColor: "rgba(0,0,0,.58)", justifyContent: "center", padding: 20 }}>
      <Pressable accessibilityLabel="Cancelar confirmação" onPress={cancelar} style={{ position: "absolute", inset: 0 }}/>
      <ScrollView bounces={false} contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <View accessibilityViewIsModal style={{ width: "100%", maxWidth: 420, alignSelf: "center", backgroundColor: cores.fundoPainel, borderRadius: 28, padding: 22, gap: 14, borderWidth: 1, borderColor: cores.borda }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: variante === "destrutiva" ? "rgba(239,68,68,.12)" : "rgba(255,193,7,.14)", alignItems: "center", justifyContent: "center" }}><Icon color={cor} size={26}/></View>
          <Text accessibilityRole="header" style={{ color: cores.textoPrimario, fontSize: 23, fontWeight: "800" }}>{titulo}</Text>
          <Text style={{ color: cores.textoSecundario, fontSize: 15, lineHeight: 23 }}>{descricao}</Text>
          {erro && <Text accessibilityRole="alert" style={{ color: cores.perigo }}>Não foi possível concluir. Tente novamente.</Text>}
          <View style={{ gap: 10, flexDirection: ladoALado ? "row-reverse" : "column" }}>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={confirmar} android_ripple={{ color: "rgba(0,0,0,.15)" }}
              style={{ flex: ladoALado ? 1 : undefined, minHeight: 48, borderRadius: 13, padding: 14, alignItems: "center", justifyContent: "center", backgroundColor: variante === "destrutiva" ? "#B42332" : "#FFC107", opacity: busy ? .65 : 1 }}>
              {busy ? <ActivityIndicator color={variante === "destrutiva" ? "#FFFFFF" : "#302600"}/> : <Text style={{ color: variante === "destrutiva" ? "#FFFFFF" : "#302600", fontWeight: "800", textAlign: "center" }}>{confirmarTexto}</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={cancelar} android_ripple={{ color: "rgba(128,128,128,.15)" }}
              style={{ flex: ladoALado ? 1 : undefined, minHeight: 48, padding: 14, alignItems: "center", justifyContent: "center", borderRadius: 13, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.fundoSecundario }}><Text style={{ color: cores.textoPrimario, fontWeight: "600", textAlign: "center" }}>{cancelarTexto}</Text></Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
