import {
  Bus,
  BusFront,
  Car,
  Train,
  TrainFrontTunnel,
  TriangleAlert,
} from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import React from "react";
import {
  Pressable,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from "react-native";

const colorsLight = {
  bus: "#1156EA", busBG: "#D7E2EF",
  brt: "#038B0F", brtBG: "#D5EBD7",
  trem: "#D82323", tremBG: "#EAD3D3",
  metro: "#EA790F", metroBG: "#F2E2D4",
  transito: "#1E1E1E", transitoBG: "#DEDEDE",
  risco: "#EEB600", riscoBG: "#F1EAD4",
};

const colorsDark = {
  bus: "#7AA2FF", busBG: "#1D2F52",
  brt: "#6BD991", brtBG: "#153B28",
  trem: "#FF8080", tremBG: "#4A1F25",
  metro: "#FFC270", metroBG: "#4D3515",
  transito: "#D5E2F5", transitoBG: "#2A3441",
  risco: "#FFD166", riscoBG: "#4A3C18",
};

interface FiltroProps {
  transito: boolean;
  clickTransito: () => void;
  modalSelecionado: string | null;
  onSelecionarModal: (modal: string) => void;
  aberto: boolean;
  onToggle: () => void;
}

export default function Filtro({
  transito,
  clickTransito,
  modalSelecionado,
  onSelecionarModal,
  aberto,
  onToggle,
}: FiltroProps) {
  const { cores, temaAtual } = useTema();
  const [risco, setRisco] = React.useState(false);
  const colors = temaAtual === "escuro" ? colorsDark : colorsLight;

  const estiloToggle = (ativo: boolean): ViewStyle => ({
    width: 18,
    height: 18,
    borderRadius: 999,
    borderColor: ativo ? cores.fundoPrimario : cores.borda,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  });

  if (!aberto) return null;

  return (
    <Pressable
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        backgroundColor: cores.overlay,
        zIndex: 15,
      }}
      onPress={onToggle}
    >
      <TouchableWithoutFeedback onPress={() => {}}>
        <View
          style={{
            position: "absolute",
            right: 12,
            top: 110,
            width: 248,
            borderRadius: 16,
            paddingHorizontal: 16,
            paddingVertical: 16,
            backgroundColor: cores.fundoPainel,
            borderColor: cores.borda,
            borderWidth: 1,
            shadowColor: "#000",
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <Text
            style={{
              marginLeft: 8,
              fontSize: 16,
              fontWeight: "700",
              color: cores.textoPrimario,
            }}
          >
            Transportes
          </Text>

          <View style={{ marginTop: 12 }}>
            {[
              { id: "onibus", label: "Ônibus",  Icon: BusFront,         cor: colors.bus,   bg: colors.busBG   },
              { id: "brt",    label: "BRT",      Icon: Bus,              cor: colors.brt,   bg: colors.brtBG   },
              { id: "trem",   label: "Trem",     Icon: Train,            cor: colors.trem,  bg: colors.tremBG  },
              { id: "metro",  label: "Metrô",    Icon: TrainFrontTunnel, cor: colors.metro, bg: colors.metroBG },
            ].map(({ id, label, Icon, cor, bg }) => (
              <TouchableOpacity
                key={id}
                activeOpacity={0.8}
                onPress={() => onSelecionarModal(id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                  marginLeft: 4,
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 8,
                  backgroundColor:
                    modalSelecionado === id
                      ? cores.fundoSecundario
                      : "transparent",
                }}
              >
                <View style={{ backgroundColor: bg, padding: 8, borderRadius: 50 }}>
                  <Icon color={cor} size={20} />
                </View>
                <Text
                  style={{
                    marginLeft: 14,
                    fontSize: 15,
                    color: cores.textoPrimario,
                  }}
                >
                  {label}
                </Text>
                <Pressable
                  style={[estiloToggle(modalSelecionado === id), { marginLeft: "auto" }]}
                >
                  {modalSelecionado === id && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        backgroundColor: cores.fundoPrimario,
                      }}
                    />
                  )}
                </Pressable>
              </TouchableOpacity>
            ))}
          </View>

          <View
            style={{
              height: 1,
              marginVertical: 8,
              backgroundColor: cores.borda,
            }}
          />

          <Text
            style={{
              marginLeft: 8,
              marginTop: 8,
              fontSize: 16,
              fontWeight: "700",
              color: cores.textoPrimario,
            }}
          >
            Informações no mapa
          </Text>

          <View style={{ marginTop: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 12,
                marginLeft: 4,
              }}
            >
              <View
                style={{
                  backgroundColor: colors.transitoBG,
                  padding: 8,
                  borderRadius: 50,
                }}
              >
                <Car color={colors.transito} size={20} />
              </View>
              <Text
                style={{
                  marginLeft: 14,
                  fontSize: 15,
                  color: cores.textoPrimario,
                }}
              >
                Trânsito
              </Text>
              <Pressable
                onPress={clickTransito}
                style={[estiloToggle(transito), { marginLeft: "auto" }]}
              >
                {transito && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: cores.fundoPrimario,
                    }}
                  />
                )}
              </Pressable>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 12,
                marginLeft: 4,
              }}
            >
              <View
                style={{
                  backgroundColor: colors.riscoBG,
                  padding: 8,
                  borderRadius: 50,
                }}
              >
                <TriangleAlert color={colors.risco} size={20} />
              </View>
              <Text
                style={{
                  marginLeft: 14,
                  fontSize: 15,
                  color: cores.textoPrimario,
                }}
              >
                Áreas de Risco
              </Text>
              <Pressable
                onPress={() => setRisco(!risco)}
                style={[estiloToggle(risco), { marginLeft: "auto" }]}
              >
                {risco && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: cores.fundoPrimario,
                    }}
                  />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Pressable>
  );
}