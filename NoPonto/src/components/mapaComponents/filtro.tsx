// Componente de filtro lateral para selecionar tipos de transporte
// e camadas de informação exibidas no mapa (trânsito, áreas de risco).
// Aparece como um botão flutuante (ícone de sliders) no canto superior direito.
// Ao pressionar, abre um painel dropdown com as opções.

import {
  Bus,
  BusFront,
  Car,
  SlidersHorizontal,
  Train,
  TrainFrontTunnel,
  TriangleAlert,
} from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import React from "react";
import { Pressable, Text, TouchableOpacity, TouchableWithoutFeedback, View, ViewStyle } from "react-native";

// ─── Paleta de cores para cada modal de transporte ────────────────────────
// Separada em light/dark para respeitar o tema do sistema.
// Cada modal tem uma cor de ícone e uma cor de fundo do ícone.
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

// ─── Props do componente ──────────────────────────────────────────────────
interface FiltroProps {
  transito: boolean;          // se a camada de trânsito está ativa no mapa
  clickTransito: () => void;  // toggle da camada de trânsito
  modalSelecionado: string | null; // modal de transporte ativo ("onibus", "brt", "trem", "metro")
  onSelecionarModal: (modal: string) => void; // callback ao trocar o modal
}

export default function Filtro({
  transito,
  clickTransito,
  modalSelecionado,
  onSelecionarModal,
}: FiltroProps) {
  const { cores, temaAtual } = useTema();

  // Estado local: áreas de risco (ainda sem integração com o mapa)
  const [risco, setRisco] = React.useState(false);

  // Paleta de cores escolhida conforme o tema atual
  const colors = temaAtual === "escuro" ? colorsDark : colorsLight;

  // Estado local: controla se o painel de filtros está aberto ou fechado
  const [filtroaberto, setFiltroAberto] = React.useState(false);

  // ─── Estilo do indicador radio (bolinha de seleção) ───────────────────
  // Retorna um ViewStyle tipado corretamente — sem `as const` o TS reclamaria
  // de `alignItems: string` não ser compatível com `FlexAlignType`.
  const estiloToggle = (ativo: boolean): ViewStyle => ({
    width: 18,
    height: 18,
    borderRadius: 999,
    borderColor: ativo ? cores.fundoPrimario : cores.borda,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  });

  // Abre ou fecha o painel de filtros
  function abrirFiltros() {
    setFiltroAberto(!filtroaberto);
  }

  // Seleciona um modal de transporte e propaga para o componente pai
  function selecionarModal(modal: string) {
    onSelecionarModal(modal);
  }

  // Alterna o estado local de áreas de risco
  function clickRisco() {
    setRisco(!risco);
  }

  return (
    <>
      {/* ── Botão flutuante de filtros ────────────────────────────────────
          Fica fixo no canto superior direito, sobre o mapa.
          Ao pressionar abre/fecha o painel abaixo. */}
      <Pressable
        onPress={(e) => {
          e.stopPropagation(); // impede fechar o overlay acidentalmente
          abrirFiltros();
        }}
        className="absolute right-[12px] top-[55px] p-[10px] rounded-full zindex-10"
        style={{ backgroundColor: cores.fundoNav }}
      >
        {/* Ícone muda de cor quando o painel está aberto */}
        <SlidersHorizontal
          color={filtroaberto ? cores.iconePrimario : cores.iconeSecundario}
          size={26}
        />
      </Pressable>

      {/* ── Overlay + painel de filtros ───────────────────────────────────
          O Pressable cobre toda a tela com fundo semi-transparente.
          Clicar fora do painel (no overlay) fecha o filtro.
          O TouchableWithoutFeedback interno impede que toques dentro
          do painel propaguem para o overlay e fechem tudo. */}
      {filtroaberto && (
        <Pressable
          className="absolute w-full h-full zindex-5"
          style={{ backgroundColor: cores.overlay }}
          onPress={() => setFiltroAberto(false)}
        >
          {/* Painel de filtros — posicionado abaixo do botão flutuante */}
          <TouchableWithoutFeedback onPress={() => setFiltroAberto(true)}>
            <View
              className="absolute right-4 top-[110px] px-4 py-4 w-[248px] rounded-2xl shadow-lg"
              style={{
                backgroundColor: cores.fundoPainel,
                borderColor: cores.borda,
                borderWidth: 1,
              }}
            >
              {/* ── Seção: Transportes ────────────────────────────────── */}
              <Text
                className="ml-4 mt-0 text-lg font-bold"
                style={{ color: cores.textoPrimario }}
              >
                Transportes
              </Text>

              {/* Lista de modais de transporte — cada item é um radio button.
                  Ao selecionar, o fundo fica destacado e a bolinha aparece.
                  A seleção é mutuamente exclusiva (apenas um modal por vez). */}
              <View className="mt-3">

                {/* ── Ônibus ─────────────────────────────────────────── */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => selecionarModal("onibus")}
                  className="flex-row items-center mb-2 ml-1 rounded-xl px-2 py-2"
                  style={{
                    backgroundColor:
                      modalSelecionado === "onibus"
                        ? cores.fundoSecundario
                        : "transparent",
                  }}
                >
                  {/* Ícone com fundo colorido */}
                  <View style={{ backgroundColor: colors.busBG, padding: 8, borderRadius: 50 }}>
                    <BusFront color={colors.bus} size={20} />
                  </View>

                  <Text className="ml-4 text-md" style={{ color: cores.textoPrimario }}>
                    Ônibus
                  </Text>

                  {/* Indicador de seleção (radio) */}
                  <Pressable className="ml-auto" style={estiloToggle(modalSelecionado === "onibus")}>
                    {modalSelecionado === "onibus" && (
                      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: cores.fundoPrimario }} />
                    )}
                  </Pressable>
                </TouchableOpacity>

                {/* ── BRT ────────────────────────────────────────────── */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => selecionarModal("brt")}
                  className="flex-row items-center mb-2 ml-1 rounded-xl px-2 py-2"
                  style={{
                    backgroundColor:
                      modalSelecionado === "brt"
                        ? cores.fundoSecundario
                        : "transparent",
                  }}
                >
                  <View style={{ backgroundColor: colors.brtBG, padding: 8, borderRadius: 50 }}>
                    <Bus color={colors.brt} size={20} />
                  </View>

                  <Text className="ml-4 text-md" style={{ color: cores.textoPrimario }}>
                    BRT
                  </Text>

                  <Pressable className="ml-auto" style={estiloToggle(modalSelecionado === "brt")}>
                    {modalSelecionado === "brt" && (
                      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: cores.fundoPrimario }} />
                    )}
                  </Pressable>
                </TouchableOpacity>

                {/* ── Trem ───────────────────────────────────────────── */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => selecionarModal("trem")}
                  className="flex-row items-center mb-2 ml-1 rounded-xl px-2 py-2"
                  style={{
                    backgroundColor:
                      modalSelecionado === "trem"
                        ? cores.fundoSecundario
                        : "transparent",
                  }}
                >
                  <View style={{ backgroundColor: colors.tremBG, padding: 8, borderRadius: 50 }}>
                    <Train color={colors.trem} size={20} />
                  </View>

                  <Text className="ml-4 text-md" style={{ color: cores.textoPrimario }}>
                    Trem
                  </Text>

                  <Pressable className="ml-auto" style={estiloToggle(modalSelecionado === "trem")}>
                    {modalSelecionado === "trem" && (
                      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: cores.fundoPrimario }} />
                    )}
                  </Pressable>
                </TouchableOpacity>

                {/* ── Metrô ──────────────────────────────────────────── */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => selecionarModal("metro")}
                  className="flex-row items-center mb-2 ml-1 rounded-xl px-2 py-2"
                  style={{
                    backgroundColor:
                      modalSelecionado === "metro"
                        ? cores.fundoSecundario
                        : "transparent",
                  }}
                >
                  <View style={{ backgroundColor: colors.metroBG, padding: 8, borderRadius: 50 }}>
                    <TrainFrontTunnel color={colors.metro} size={20} />
                  </View>

                  <Text className="ml-4 text-md" style={{ color: cores.textoPrimario }}>
                    Metrô
                  </Text>

                  <Pressable className="ml-auto" style={estiloToggle(modalSelecionado === "metro")}>
                    {modalSelecionado === "metro" && (
                      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: cores.fundoPrimario }} />
                    )}
                  </Pressable>
                </TouchableOpacity>
              </View>

              {/* ── Divisor ───────────────────────────────────────────── */}
              <View className="h-[1px] my-2" style={{ backgroundColor: cores.borda }} />

              {/* ── Seção: Informações no mapa ────────────────────────── */}
              <Text
                className="ml-4 mt-3 text-lg font-bold"
                style={{ color: cores.textoPrimario }}
              >
                Informações no mapa
              </Text>

              {/* Lista de camadas de informação (toggles independentes,
                  não mutuamente exclusivos — podem ser ligados ao mesmo tempo) */}
              <View className="mt-3">

                {/* ── Trânsito ───────────────────────────────────────── 
                    Estado gerenciado pelo pai (prop `transito`).
                    Ao ativar, o mapa exibe a camada de tráfego em tempo real. */}
                <View className="flex-row items-center mb-3 ml-1">
                  <View style={{ backgroundColor: colors.transitoBG, padding: 8, borderRadius: 50 }}>
                    <Car color={colors.transito} size={20} />
                  </View>

                  <Text className="ml-4 text-md" style={{ color: cores.textoPrimario }}>
                    Trânsito
                  </Text>

                  <Pressable
                    onPress={() => clickTransito()}
                    className="ml-auto"
                    style={estiloToggle(transito)}
                  >
                    {transito && (
                      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: cores.fundoPrimario }} />
                    )}
                  </Pressable>
                </View>

                {/* ── Áreas de Risco ─────────────────────────────────── 
                    Estado local (ainda sem integração com o mapa).
                    Futuramente exibirá zonas de risco sobrepostas ao mapa. */}
                <View className="flex-row items-center mb-3 ml-1">
                  <View style={{ backgroundColor: colors.riscoBG, padding: 8, borderRadius: 50 }}>
                    <TriangleAlert color={colors.risco} size={20} />
                  </View>

                  <Text className="ml-4 text-md" style={{ color: cores.textoPrimario }}>
                    Áreas de Risco
                  </Text>

                  <Pressable
                    onPress={() => clickRisco()}
                    className="ml-auto"
                    style={estiloToggle(risco)}
                  >
                    {risco && (
                      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: cores.fundoPrimario }} />
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Pressable>
      )}
    </>
  );
}