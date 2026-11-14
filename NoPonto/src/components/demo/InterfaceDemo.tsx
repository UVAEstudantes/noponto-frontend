import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";

export function useMovimentoReduzido() {
  const [reduzido, setReduzido] = useState(true);
  useEffect(() => {
    let ativo = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (ativo) setReduzido(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduzido,
    );
    return () => {
      ativo = false;
      sub.remove();
    };
  }, []);
  return reduzido;
}

export function useVisualDemo() {
  const { cores, temaAtual } = useTema();
  return {
    cores,
    escuro: temaAtual === "escuro",
    texto: { color: cores.textoPrimario, fontSize: 15 },
    secundario: {
      color: temaAtual === "escuro" ? "#B8C2CC" : "#596575",
      fontSize: 14,
      lineHeight: 21,
    },
    card: {
      backgroundColor: cores.fundoCard,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: cores.bordaSuave,
      padding: 16,
      gap: 12,
    },
  };
}

export function BotaoDemo({
  children,
  onPress,
  label,
  secundario = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onPress: () => void;
  label?: string;
  secundario?: boolean;
  disabled?: boolean;
}) {
  const { cores } = useVisualDemo();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      android_ripple={{ color: "rgba(127,127,127,.18)" }}
      style={{
        minHeight: 48,
        padding: 12,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: secundario ? 1 : 0,
        borderColor: cores.borda,
        backgroundColor: secundario ? cores.fundoCard : "#FFC107",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: secundario ? cores.textoPrimario : "#302600",
          textAlign: "center",
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function CampoDemo({
  label,
  value,
  onChangeText,
  maxLength = 80,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  maxLength?: number;
}) {
  const { cores, texto, secundario } = useVisualDemo();
  return (
    <View style={{ gap: 5 }}>
      <Text style={[secundario, { fontWeight: "600" }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        maxLength={maxLength}
        style={[
          texto,
          {
            minHeight: 48,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: cores.borda,
            backgroundColor: cores.fundoInput,
          },
        ]}
      />
    </View>
  );
}

// Um único Modal por fluxo: trocar o conteúdo preserva o rascunho sem empilhar janelas nativas.
export function PainelDemo({
  titulo,
  onFechar,
  children,
  rodape,
  amplo = false,
}: {
  titulo: string;
  onFechar: () => void;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  amplo?: boolean;
}) {
  const { cores, texto } = useVisualDemo();
  const reduzido = useMovimentoReduzido();
  const insets = useSafeAreaInsets();
  const [tecladoY, setTecladoY] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const mostrar = Keyboard.addListener("keyboardDidShow", (e) =>
      setTecladoY(e.endCoordinates.screenY),
    );
    const ocultar = Keyboard.addListener("keyboardDidHide", () =>
      setTecladoY(null),
    );
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }, []);
  // O Modal edge-to-edge não redimensiona seu rodapé em todos os Androids.
  const alturaComTeclado =
    tecladoY === null
      ? undefined
      : Math.max(
          180,
          tecladoY - insets.top - insets.bottom - (amplo ? 20 : 36),
        );
  return (
    <Modal
      transparent
      animationType={reduzido ? "none" : "fade"}
      statusBarTranslucent
      onRequestClose={onFechar}
    >
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,.58)",
          padding: amplo ? 10 : 18,
          justifyContent: "flex-start",
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{
            flex: alturaComTeclado === undefined ? 1 : 0,
            height: alturaComTeclado,
            justifyContent: "center",
            width: "100%",
            maxWidth: 520,
            alignSelf: "center",
          }}
        >
          <View
            accessibilityViewIsModal
            style={{
              maxHeight: "96%",
              backgroundColor: cores.fundoPainel,
              borderRadius: 24,
              overflow: "hidden",
              flexShrink: 1,
            }}
          >
            <View
              style={{
                paddingLeft: 18,
                paddingRight: 6,
                paddingVertical: 8,
                flexDirection: "row",
                alignItems: "center",
                borderBottomWidth: 1,
                borderColor: cores.bordaSuave,
              }}
            >
              <Text
                accessibilityRole="header"
                style={[texto, { fontSize: 21, fontWeight: "800", flex: 1 }]}
              >
                {titulo}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar painel"
                onPress={onFechar}
                android_ripple={{ color: "#80808030", borderless: true }}
                style={{
                  minHeight: 48,
                  width: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={21} color={cores.textoPrimario} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ flexShrink: 1, minHeight: 0 }}
              contentContainerStyle={{
                padding: 18,
                gap: 16,
                paddingBottom: 30,
              }}
            >
              {children}
            </ScrollView>
            {rodape && (
              <View
                style={{
                  padding: 12,
                  borderTopWidth: 1,
                  borderColor: cores.bordaSuave,
                }}
              >
                {rodape}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
