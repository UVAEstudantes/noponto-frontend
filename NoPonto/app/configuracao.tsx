import { estilosMapaDisponiveis } from "@/src/constants/estilosMapa";
import { useTema } from "@/src/hooks/useTema";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Check, Hand, Map, Monitor, Moon, Palette, Sun } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const Configuracao = () => {
  const {
    temaAtual,
    preferenciaTema,
    definirPreferenciaTema,
    estiloMapaAtual,
    definirEstiloMapa,
    preferenciaLateralidade,
    definirPreferenciaLateralidade,
    cores,
  } = useTema();

  const opcoesTema = [
    {
      id: "sistema" as const,
      titulo: "Sistema",
      Icon: Monitor,
    },
    {
      id: "claro" as const,
      titulo: "Claro",
      Icon: Sun,
    },
    {
      id: "escuro" as const,
      titulo: "Escuro",
      Icon: Moon,
    },
  ];

  const resumoTemaAtual =
    temaAtual === "escuro" ? "modo escuro ativo" : "modo claro ativo";

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1"
      style={{ backgroundColor: cores.fundoApp }}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 120,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          className="text-3xl font-bold"
          style={{ color: cores.textoPrimario }}
        >
          Configurações
        </Text>

        <Text
          className="mt-2 text-base"
          style={{ color: cores.textoSecundario }}
        >
          Preferências visuais
        </Text>

        <View
          className="mt-6 rounded-2xl p-4"
          style={{
            backgroundColor: cores.fundoCard,
            borderColor: cores.borda,
            borderWidth: 1,
          }}
        >
          <View className="flex-row items-center">
            <View
              className="h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: cores.fundoSecundario }}
            >
              <Palette size={20} color={cores.iconeSecundario} />
            </View>

            <View className="ml-3 flex-1">
              <Text
                className="text-base font-semibold"
                style={{ color: cores.textoPrimario }}
              >
                Tema
              </Text>
              <Text
                className="text-sm"
                style={{ color: cores.textoSecundario }}
              >
                Escolha como o app define o tema
              </Text>
            </View>
          </View>

          <View className="mt-4 flex-row">
            {opcoesTema.map((opcao, index) => {
              const selecionado = preferenciaTema === opcao.id;
              const corSelecionado = "#1E1E1E";

              return (
                <Pressable
                  key={opcao.id}
                  className="h-14 flex-1 items-center justify-center rounded-xl"
                  style={{
                    marginRight: index === opcoesTema.length - 1 ? 0 : 8,
                    backgroundColor: selecionado
                      ? cores.fundoPrimario
                      : cores.fundoPainel,
                    borderColor: selecionado
                      ? cores.fundoPrimario
                      : cores.borda,
                    borderWidth: 1,
                  }}
                  onPress={() => definirPreferenciaTema(opcao.id)}
                >
                  <opcao.Icon
                    size={16}
                    color={selecionado ? corSelecionado : cores.iconeSecundario}
                  />
                  <Text
                    className="mt-1 text-xs font-semibold"
                    style={{
                      color: selecionado
                        ? corSelecionado
                        : cores.textoSecundario,
                    }}
                  >
                    {opcao.titulo}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text
            className="mt-3 text-sm"
            style={{ color: cores.textoSecundario }}
          >
            {preferenciaTema === "sistema"
              ? `Seguindo o sistema: ${resumoTemaAtual}`
              : `Tema manual: ${resumoTemaAtual}`}
          </Text>
        </View>

        <View className="mt-4 rounded-2xl p-4" style={{ backgroundColor: cores.fundoCard, borderColor: cores.borda, borderWidth: 1 }}>
          <View className="flex-row items-center"><View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: cores.fundoSecundario }}><Hand size={20} color={cores.iconeSecundario} /></View><View className="ml-3 flex-1"><Text className="text-base font-semibold" style={{ color: cores.textoPrimario }}>Lateralidade</Text><Text className="text-sm" style={{ color: cores.textoSecundario }}>Define o lado dos controles do mapa</Text></View></View>
          <View className="mt-4 flex-row">{(["destro", "canhoto"] as const).map((opcao, index) => { const selecionado = preferenciaLateralidade === opcao; return <Pressable key={opcao} className="h-12 flex-1 items-center justify-center rounded-xl" style={{ marginRight: index === 0 ? 8 : 0, backgroundColor: selecionado ? cores.fundoPrimario : cores.fundoPainel, borderColor: selecionado ? cores.fundoPrimario : cores.borda, borderWidth: 1 }} onPress={() => definirPreferenciaLateralidade(opcao)} accessibilityRole="radio" accessibilityLabel={`Usar controles no lado ${opcao}`} accessibilityState={{ selected: selecionado }}><Text className="text-sm font-semibold" style={{ color: selecionado ? cores.textoInverso : cores.textoSecundario }}>{opcao === "destro" ? "Destro" : "Canhoto"}</Text></Pressable>; })}</View>
        </View>

        <View
          className="mt-4 rounded-2xl p-4"
          style={{
            backgroundColor: cores.fundoCard,
            borderColor: cores.borda,
            borderWidth: 1,
          }}
        >
          <View className="flex-row items-center">
            <View
              className="h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: cores.fundoSecundario }}
            >
              <Map size={20} color={cores.iconeSecundario} />
            </View>

            <View className="ml-3 flex-1">
              <Text
                className="text-base font-semibold"
                style={{ color: cores.textoPrimario }}
              >
                Estilo do mapa
              </Text>
              <Text
                className="text-sm"
                style={{ color: cores.textoSecundario }}
              >
                Escolha como o mapa aparece no claro e no escuro
              </Text>
            </View>
          </View>

          <View className="mt-4">
            {estilosMapaDisponiveis.map((estilo, index) => {
              const selecionado = estiloMapaAtual === estilo.id;

              return (
                <Pressable
                  key={estilo.id}
                  className="rounded-xl p-3 flex-row items-center"
                  style={{
                    marginBottom:
                      index === estilosMapaDisponiveis.length - 1 ? 0 : 10,
                    backgroundColor: selecionado
                      ? cores.fundoSecundario
                      : cores.fundoPainel,
                    borderColor: selecionado
                      ? cores.fundoPrimario
                      : cores.bordaSuave,
                    borderWidth: 1,
                  }}
                  onPress={() => definirEstiloMapa(estilo.id)}
                >
                  <View className="flex-1 pr-3">
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: cores.textoPrimario }}
                    >
                      {estilo.nome}
                    </Text>
                    <Text
                      className="mt-1 text-xs"
                      style={{ color: cores.textoSecundario }}
                    >
                      {estilo.descricao}
                    </Text>
                  </View>

                  <View
                    className="h-6 w-6 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: selecionado
                        ? cores.fundoPrimario
                        : "transparent",
                      borderColor: selecionado
                        ? cores.fundoPrimario
                        : cores.borda,
                      borderWidth: 1,
                    }}
                  >
                    {selecionado ? <Check size={14} color="#1E1E1E" /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text
            className="mt-3 text-sm"
            style={{ color: cores.textoSecundario }}
          >
            As preferências são salvas automaticamente.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Configuracao;
