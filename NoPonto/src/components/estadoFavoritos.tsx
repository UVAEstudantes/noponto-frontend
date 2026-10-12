import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTema } from "@/src/hooks/useTema";

export default function EstadoFavoritos({ status, erro, erroGravacao, tentarNovamente }: {
  status: "carregando" | "pronto" | "erro"; erro: string | null; erroGravacao: string | null;
  tentarNovamente: () => Promise<void>;
}) {
  const { cores } = useTema();
  const mensagem = status === "carregando" ? "Carregando favoritos…" : erro ?? erroGravacao;
  if (!mensagem) return null;
  return <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
    <Text accessibilityLiveRegion="polite" style={{ color: cores.textoSecundario, fontSize: 12 }}>{mensagem}</Text>
    {(erro || erroGravacao) && <Pressable onPress={() => { void tentarNovamente(); }} accessibilityRole="button"
      style={{ minHeight: 44, justifyContent: "center" }}>
      <Text style={{ color: cores.textoPrimario, fontSize: 12, fontWeight: "600" }}>Tentar novamente</Text>
    </Pressable>}
  </View>;
}
