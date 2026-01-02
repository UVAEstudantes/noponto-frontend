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
import React from "react";
import { Pressable, Text, TouchableWithoutFeedback, View } from "react-native";

const colors = {
  customYellow: "#FFC107",
  customGray: "#F2F4F7",

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

interface FiltroProps {
  transito: boolean;
  clickTransito: () => void;
  onibus: boolean;
  setOnibus: (value: boolean) => void;
  brt: boolean;
  setBrt: (value: boolean) => void;
  trem: boolean;
  setTrem: (value: boolean) => void;
  metro: boolean;
  setMetro: (value: boolean) => void;
}

export default function Filtro({
  transito,
  clickTransito,
  onibus,
  setOnibus,
  brt,
  setBrt,
  trem,
  setTrem,
  metro,
  setMetro,
}: FiltroProps) {
  const [risco, setRisco] = React.useState(false);

  const tipoModais = ["Onibus", "BRT", "Trem", "Metro"];

  const [filtroaberto, setFiltroAberto] = React.useState(false);

  function abrirFiltros() {
    setFiltroAberto(!filtroaberto);
    console.log("abrir filtros", !filtroaberto);
  }

  function clickOnibus() {
    if (onibus && !brt && !trem && !metro) return;
    setOnibus(!onibus);
    console.log("onibus:", !onibus);
  }
  function clickBrt() {
    if (brt && !onibus && !trem && !metro) return;
    setBrt(!brt);
    console.log("brt:", !brt);
  }
  function clickTrem() {
    if (trem && !onibus && !brt && !metro) return;
    setTrem(!trem);
    console.log("trem:", !trem);
  }
  function clickMetro() {
    if (metro && !onibus && !brt && !trem) return;
    setMetro(!metro);
    console.log("metro:", !metro);
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
        style={{ backgroundColor: "black" }}
      >
        <SlidersHorizontal
          color={filtroaberto ? colors.customYellow : colors.customGray}
          size={26}
        />
      </Pressable>

      {/* Overlay para clique fora */}
      {filtroaberto && (
        <Pressable
          className="absolute w-full h-full zindex-5"
          onPress={() => setFiltroAberto(false)} // fecha ao clicar fora
        >
          {/*container filtro*/}
          {filtroaberto && (
            <TouchableWithoutFeedback onPress={() => setFiltroAberto(true)}>
              <View className="absolute right-5 top-[120px] bg-customGray p-5 h-[410px] w-[250px] rounded-xl shadow-lg">
                <Text className="ml-4 mt-0 text-lg font-bold">Transportes</Text>

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

                    <Text className="ml-4 text-md">Ônibus</Text>

                    <Pressable
                      onPress={() => clickOnibus()}
                      className={`ml-auto p-1 h-6 w-6 rounded-md
                                                ${onibus ? "border border-customYellow" : "border-2 border-gray-400"} 
                                                ${onibus ? "bg-customYellow" : "bg-transparent"}`}
                    >
                      {onibus && (
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

                    <Text className="ml-4 text-md">BRT</Text>

                    <Pressable
                      onPress={() => clickBrt()}
                      className={`ml-auto p-1 h-6 w-6 rounded-md
                                                ${brt ? "border border-customYellow" : "border-2 border-gray-400"} 
                                                ${brt ? "bg-customYellow" : "bg-transparent"}`}
                    >
                      {brt && <Check color="white" size={13} strokeWidth={6} />}
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

                    <Text className="ml-4 text-md">Trem</Text>

                    <Pressable
                      onPress={() => clickTrem()}
                      className={`ml-auto p-1 h-6 w-6 rounded-md
                                                ${trem ? "border border-customYellow" : "border-2 border-gray-400"} 
                                                ${trem ? "bg-customYellow" : "bg-transparent"}`}
                    >
                      {trem && (
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

                    <Text className="ml-4 text-md">Metrô</Text>

                    <Pressable
                      onPress={() => clickMetro()}
                      className={`ml-auto p-1 h-6 w-6 rounded-md
                                                ${metro ? "border border-customYellow" : "border-2 border-gray-400"} 
                                                ${metro ? "bg-customYellow" : "bg-transparent"}`}
                    >
                      {metro && (
                        <Check color="white" size={13} strokeWidth={6} />
                      )}
                    </Pressable>
                  </View>
                </View>

                <Text className="text-customDivider font-bold">
                  {" "}
                  ______________________________
                </Text>

                <Text className="ml-4 mt-3 text-lg font-bold">
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

                    <Text className="ml-4 text-md">Trânsito</Text>

                    <Pressable
                      onPress={() => clickTransito()}
                      className={`ml-auto p-1 h-6 w-6 rounded-md
                                                ${transito ? "border border-customYellow" : "border-2 border-gray-400"} 
                                                ${transito ? "bg-customYellow" : "bg-transparent"}`}
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

                    <Text className="ml-4 text-md">Áreas de Risco</Text>

                    <Pressable
                      onPress={() => clickRisco()}
                      className={`ml-auto p-1 h-6 w-6 rounded-md
                                                ${risco ? "border border-customYellow" : "border-2 border-gray-400"} 
                                                ${risco ? "bg-customYellow" : "bg-transparent"}`}
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
