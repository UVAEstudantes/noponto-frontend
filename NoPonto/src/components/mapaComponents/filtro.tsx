// componente de filtro lateral para selecionar tipos de transporte e informações no mapa

import {
  Bus,
  BusFront,
  Car,
  Check,
  SlidersHorizontal,
  Train,
  TrainFrontTunnel,
  TriangleAlert,
} from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import React from "react";
import { Pressable, Text, TouchableWithoutFeedback, View } from "react-native";

const colorsLight = {
  bus: "#1156EA",
  busBG: "#D7E2EF",
  brt: "#038B0F",
  brtBG: "#D5EBD7",
  trem: "#D82323",
  tremBG: "#EAD3D3",
  metro: "#EA790F",
  metroBG: "#F2E2D4",

  transito: "#1E1E1E",
  transitoBG: "#DEDEDE",
  risco: "#EEB600",
  riscoBG: "#F1EAD4",
};

const colorsDark = {
  bus: "#7AA2FF",
  busBG: "#1D2F52",
  brt: "#6BD991",
  brtBG: "#153B28",
  trem: "#FF8080",
  tremBG: "#4A1F25",
  metro: "#FFC270",
  metroBG: "#4D3515",

  transito: "#D5E2F5",
  transitoBG: "#2A3441",
  risco: "#FFD166",
  riscoBG: "#4A3C18",
};

interface FiltroProps {
  transito: boolean;
  clickTransito: () => void;
  modalSelecionado: string | null;
  onSelecionarModal: (modal: string) => void;
}

export default function Filtro({
  transito,
  clickTransito,
  modalSelecionado,
  onSelecionarModal,
}: FiltroProps) {
  const { cores, temaAtual } = useTema();
  const [risco, setRisco] = React.useState(false);
  const colors = temaAtual === "escuro" ? colorsDark : colorsLight;

  const [filtroaberto, setFiltroAberto] = React.useState(false);

  const estiloToggle = (ativo: boolean) => ({
    borderColor: ativo ? cores.fundoPrimario : cores.borda,
    borderWidth: ativo ? 1 : 2,
    backgroundColor: ativo ? cores.fundoPrimario : "transparent",
  });

  function abrirFiltros() {
    setFiltroAberto(!filtroaberto);
    console.log("abrir filtros", !filtroaberto);
  }

  function selecionarModal(modal: string) {
    onSelecionarModal(modal);
    console.log("modal:", modal);
  }

  function clickRisco() {
    setRisco(!risco);
    console.log("risco:", !risco);
  }

  return (
    <>
      {/*btn do filtro*/}
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          abrirFiltros();
        }}
        className="absolute right-[12px] top-[55px] p-[10px] rounded-full zindex-10"
        style={{ backgroundColor: cores.fundoNav }}
      >
        <SlidersHorizontal
          color={filtroaberto ? cores.iconePrimario : cores.iconeSecundario}
          size={26}
        />
      </Pressable>

      {/* Overlay para clique fora */}
      {filtroaberto && (
        <Pressable
          className="absolute w-full h-full zindex-5"
          style={{ backgroundColor: cores.overlay }}
          onPress={() => setFiltroAberto(false)} // fecha ao clicar fora
        >
          {/*container filtro*/}
          {filtroaberto && (
            <TouchableWithoutFeedback onPress={() => setFiltroAberto(true)}>
              <View
                className="absolute right-5 top-[120px] p-5 h-[410px] w-[250px] rounded-xl shadow-lg"
                style={{
                  backgroundColor: cores.fundoPainel,
                  borderColor: cores.borda,
                  borderWidth: 1,
                }}
              >
                <Text
                  className="ml-4 mt-0 text-lg font-bold"
                  style={{ color: cores.textoPrimario }}
                >
                  Transportes
                </Text>

                {/*opcoes de transporte*/}
                <View className=" mt-3">
                  {/* ônibus */}
                  <View className="flex-row items-center mb-3 ml-1">
                    <View
                      style={{
                        backgroundColor: colors.busBG,
                        padding: 8,
                        borderRadius: 50,
                      }}
                    >
                      <BusFront color={colors.bus} size={20} />
                    </View>

                    <Text
                      className="ml-4 text-md"
                      style={{ color: cores.textoPrimario }}
                    >
                      Ônibus
                    </Text>

                    <Pressable
                      onPress={() => selecionarModal("onibus")}
                      className="ml-auto p-1 h-6 w-6 rounded-md"
                      style={estiloToggle(modalSelecionado === "onibus")}
                    >
                      {modalSelecionado === "onibus" && (
                        <Check color="white" size={13} strokeWidth={6} />
                      )}
                    </Pressable>
                  </View>

                  {/* brt */}
                  <View className="flex-row items-center mb-3 ml-1">
                    <View
                      style={{
                        backgroundColor: colors.brtBG,
                        padding: 8,
                        borderRadius: 50,
                      }}
                    >
                      <Bus color={colors.brt} size={20} />
                    </View>

                    <Text
                      className="ml-4 text-md"
                      style={{ color: cores.textoPrimario }}
                    >
                      BRT
                    </Text>

                    <Pressable
                      onPress={() => selecionarModal("brt")}
                      className="ml-auto p-1 h-6 w-6 rounded-md"
                      style={estiloToggle(modalSelecionado === "brt")}
                    >
                      {modalSelecionado === "brt" && <Check color="white" size={13} strokeWidth={6} />}
                    </Pressable>
                  </View>

                  {/* trem */}
                  <View className="flex-row items-center mb-3 ml-1">
                    <View
                      style={{
                        backgroundColor: colors.tremBG,
                        padding: 8,
                        borderRadius: 50,
                      }}
                    >
                      <Train color={colors.trem} size={20} />
                    </View>

                    <Text
                      className="ml-4 text-md"
                      style={{ color: cores.textoPrimario }}
                    >
                      Trem
                    </Text>

                    <Pressable
                      onPress={() => selecionarModal("trem")}
                      className="ml-auto p-1 h-6 w-6 rounded-md"
                      style={estiloToggle(modalSelecionado === "trem")}
                    >
                      {modalSelecionado === "trem" && (
                        <Check color="white" size={13} strokeWidth={6} />
                      )}
                    </Pressable>
                  </View>

                  {/* metro */}
                  <View className="flex-row items-center mb-3 ml-1">
                    <View
                      style={{
                        backgroundColor: colors.metroBG,
                        padding: 8,
                        borderRadius: 50,
                      }}
                    >
                      <TrainFrontTunnel color={colors.metro} size={20} />
                    </View>

                    <Text
                      className="ml-4 text-md"
                      style={{ color: cores.textoPrimario }}
                    >
                      Metrô
                    </Text>

                    <Pressable
                      onPress={() => selecionarModal("metro")}
                      className="ml-auto p-1 h-6 w-6 rounded-md"
                      style={estiloToggle(modalSelecionado === "metro")}
                    >
                      {modalSelecionado === "metro" && (
                        <Check color="white" size={13} strokeWidth={6} />
                      )}
                    </Pressable>
                  </View>
                </View>

                <View
                  className="h-[1px] my-2"
                  style={{ backgroundColor: cores.borda }}
                />

                <Text
                  className="ml-4 mt-3 text-lg font-bold"
                  style={{ color: cores.textoPrimario }}
                >
                  Informações no mapa
                </Text>

                {/*opcoes de transporte*/}
                <View className=" mt-3">
                  {/* ônibus */}
                  <View className="flex-row items-center mb-3 ml-1">
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
                      className="ml-4 text-md"
                      style={{ color: cores.textoPrimario }}
                    >
                      Trânsito
                    </Text>

                    <Pressable
                      onPress={() => clickTransito()}
                      className="ml-auto p-1 h-6 w-6 rounded-md"
                      style={estiloToggle(transito)}
                    >
                      {transito && (
                        <Check color="white" size={13} strokeWidth={6} />
                      )}
                    </Pressable>
                  </View>

                  {/* brt */}
                  <View className="flex-row items-center mb-3 ml-1">
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
                      className="ml-4 text-md"
                      style={{ color: cores.textoPrimario }}
                    >
                      Áreas de Risco
                    </Text>

                    <Pressable
                      onPress={() => clickRisco()}
                      className="ml-auto p-1 h-6 w-6 rounded-md"
                      style={estiloToggle(risco)}
                    >
                      {risco && (
                        <Check color="white" size={13} strokeWidth={6} />
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          )}
        </Pressable>
      )}
    </>
  );
}
