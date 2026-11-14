import { GatewayFooter } from '../src/components/GatewayStatus';
import { useTutorial } from '@/src/components/tutorial/TutorialProvider';
import { estilosMapaDisponiveis } from "@/src/constants/estilosMapa";
import { useTema } from "@/src/hooks/useTema";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import {
  BookOpen,
  Bell,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Check,
  Hand,
  Map,
  Monitor,
  Moon,
  Palette,
  Radar,
  Sun,
  Volume2,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import IndicadoresConfiguracao from "@/src/components/indicadoresConfiguracao";

const Configuracao = () => {
  const tutorial = useTutorial();
  const [tutorialAberto, setTutorialAberto] = useState(false);
  const {
    temaAtual,
    preferenciaTema,
    definirPreferenciaTema,
    estiloMapaAtual,
    definirEstiloMapa,
    preferenciaLateralidade,
    definirPreferenciaLateralidade,
    cores,
    animacaoAbertura,
    carregandoAbertura,
    salvandoAbertura,
    definirAnimacaoAbertura,
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
          paddingBottom: 75,
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
              const corSelecionado = "#FFFFFF";
              const fundoSelecionado = cores.fundoPrimario;

              return (
                <Pressable
                  key={opcao.id}
                  className="h-14 flex-1 items-center justify-center rounded-xl"
                  style={{
                    marginRight: index === opcoesTema.length - 1 ? 0 : 8,
                    backgroundColor: selecionado
                      ? fundoSelecionado
                      : cores.fundoPainel,
                    borderColor: selecionado ? fundoSelecionado : cores.borda,
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
              <Hand size={20} color={cores.iconeSecundario} />
            </View>
            <View className="ml-3 flex-1">
              <Text
                className="text-base font-semibold"
                style={{ color: cores.textoPrimario }}
              >
                Lateralidade
              </Text>
              <Text
                className="text-sm"
                style={{ color: cores.textoSecundario }}
              >
                Define o lado dos controles do mapa
              </Text>
            </View>
          </View>
          <View className="mt-4 flex-row">
            {(["canhoto", "destro"] as const).map((opcao, index) => {
              const selecionado = preferenciaLateralidade === opcao;
              return (
                <Pressable
                  key={opcao}
                  className="h-12 flex-1 items-center justify-center rounded-xl"
                  style={{
                    marginRight: index === 0 ? 8 : 0,
                    backgroundColor: selecionado
                      ? cores.fundoPrimario
                      : cores.fundoPainel,
                    borderColor: selecionado
                      ? cores.fundoPrimario
                      : cores.borda,
                    borderWidth: 1,
                  }}
                  onPress={() => definirPreferenciaLateralidade(opcao)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Usar controles no lado ${opcao}`}
                  accessibilityState={{ selected: selecionado }}
                >
                  <Text
                    className="text-sm font-semibold"
                    style={{
                      color: selecionado
                        ? cores.textoInverso
                        : cores.textoSecundario,
                    }}
                  >
                    {opcao === "destro" ? "Destro" : "Canhoto"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
        <View style={{ marginTop: 24, gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: cores.textoPrimario, fontSize: 21, fontWeight: "700" }}>Ajuda e tutoriais</Text>
          <Text style={{ color: cores.textoSecundario, fontSize: 14 }}>Aprenda a aproveitar o NoPonto.</Text>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Primeiros passos, etapas do tutorial"
            accessibilityState={{ expanded: tutorialAberto }}
            onPress={() => setTutorialAberto(!tutorialAberto)}
            style={{ marginTop: 6, padding: 16, gap: 14, borderRadius: 20, borderWidth: 1, borderColor: cores.bordaSuave, backgroundColor: cores.fundoCard }}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <View style={{ padding: 12, borderRadius: 14, backgroundColor: "#FFC10720" }}><BookOpen size={23} color={temaAtual === "escuro" ? "#FFC107" : "#916500"} /></View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: cores.textoPrimario, fontSize: 17, fontWeight: "700" }}>Primeiros passos</Text>
                <Text style={{ color: cores.textoSecundario, fontSize: 14 }}>Conheça a busca, o mapa e os recursos do NoPonto.</Text>
                <Text style={{ color: cores.textoSecundario, fontSize: 12 }}>Seis capítulos · no seu ritmo</Text>
              </View>
              {tutorialAberto ? <ChevronUp size={18} color={cores.iconeSecundario} /> : <ChevronDown size={18} color={cores.iconeSecundario} />}
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => tutorial.replay()} style={{ minHeight: 46, padding: 12, gap: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#FFC107" }}>
              <Text style={{ color: "#222222", fontSize: 15, fontWeight: "700" }}>Assistir tutorial completo</Text><ArrowRight size={17} color="#222222" />
            </Pressable>
        </View>
        {tutorialAberto && <View style={{ gap: 8, marginTop: 12 }}>
          {([{ id: 1, title: 'Buscar e visualizar linhas' }, { id: 2, title: 'Veículos em tempo real' }, { id: 3, title: 'Paradas, estações e terminais' }, { id: 4, title: 'Suas linhas, do seu jeito' }, { id: 5, title: 'Radar de Espera, notificações e voz' }, { id: 6, title: 'Conhecendo outros transportes' }] as const).map(chapter => <Pressable key={chapter.id} accessibilityRole="button"
            onPress={() => tutorial.replay(chapter.id)} style={{ minHeight: 54, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: cores.bordaSuave, backgroundColor: cores.fundoCard, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: cores.textoPrimario, fontSize: 14, flex: 1 }}>{chapter.title}</Text>

            <ArrowRight size={16} color={cores.textoSecundario} />
          </Pressable>)}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            {([
              { id: '5A', title: 'Radar', Icon: Radar },
              { id: '5B', title: 'Notificações', Icon: Bell },
              { id: '5C', title: 'Voz', Icon: Volume2 },
            ] as const).map(({ id, title, Icon }) => <Pressable key={id}
              accessibilityRole="button" accessibilityLabel={`Tutorial: ${title}`}
              onPress={() => tutorial.replay(5, id)}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: cores.fundoSecundario }}>
              <Icon size={18} color={cores.iconeSecundario} />
            </Pressable>)}
          </View>
        </View>}
        <IndicadoresConfiguracao />

        <View
          className="mt-4 rounded-2xl p-4 flex-row items-center"
          style={{
            backgroundColor: cores.fundoCard,
            borderColor: cores.borda,
            borderWidth: 1,
          }}
        >
          <View className="flex-1 pr-3">
            <Text
              className="text-base font-semibold"
              style={{ color: cores.textoPrimario }}
            >
              Animação de abertura
            </Text>
            <Text className="text-sm" style={{ color: cores.textoSecundario }}>
              Exibir animação ao iniciar o aplicativo.
            </Text>
            <Text
              className="mt-2 text-xs"
              style={{ color: cores.textoSecundario }}
            >
              Válido na próxima inicialização.
            </Text>
          </View>
          <Switch
            value={animacaoAbertura}
            disabled={carregandoAbertura || salvandoAbertura}
            trackColor={{
              false: cores.bordaSuave,
              true: cores.fundoPrimarioSuave,
            }}
            thumbColor={
              animacaoAbertura ? cores.fundoPrimario : cores.borda
            }
            accessibilityLabel="Animação de abertura"
            accessibilityHint="Exibir animação ao iniciar o aplicativo. Válido na próxima inicialização."
            onValueChange={(ativada) => {
              void definirAnimacaoAbertura(ativada).catch((error) => {
                console.warn("Erro ao salvar animação de abertura:", error);
                Alert.alert(
                  "Não foi possível salvar",
                  "Tente alterar a opção novamente.",
                );
              });
            }}
          />
        </View>

      <GatewayFooter />
      </ScrollView>
    </SafeAreaView>
  );
};

export default Configuracao;
