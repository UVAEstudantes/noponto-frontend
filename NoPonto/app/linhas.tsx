import Chegada from "@/src/components/chegada";
import InputBusca from "@/src/components/inputBusca";
import PontosInteresses from "@/src/components/pontosInteresses";
import Select from "@/src/components/select";
import SelectTransporte from "@/src/components/selectTransporte";
import Tarifas from "@/src/components/tarifas";
import { mockLinhas } from "@/src/mocks/linhasMocks";
import { pontosPorLinha } from "@/src/mocks/pontosInteresseMock";
import {
  Bus,
  BusFront,
  ListFilter,
  LucideIcon,
  Train,
  TrainFrontTunnel,
} from "lucide-react-native";
import React, { use, useEffect, useState } from "react";
import {
  DimensionValue,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import MapView from "react-native-maps";
import Animated, { FadeInUp, LinearTransition } from "react-native-reanimated";

const linhas = () => {
  const [modal, setModal] = useState<string | null>("Onibus");
  const [placeholder, setPlaceholder] = useState(
    "Selecione um tipo de Transporte"
  );
  const [icon, setIcon] = useState<LucideIcon>(ListFilter);

  // mudar placeholder e icon do input de busca
  useEffect(() => {
    if (modal === "Onibus") {
      setPlaceholder("Buscar Linhas Ônibus");
      setIcon(BusFront);
      console.log("mudou para onibus");
    } else if (modal === "BRT") {
      setPlaceholder("Buscar Linhas BRT");
      setIcon(Bus);
      console.log("mudou para brt");
    } else if (modal === "Trem") {
      setPlaceholder("Buscar Ramal");
      setIcon(Train);
      console.log("mudou para trem");
    } else if (modal === "Metro") {
      setPlaceholder("Buscar Linhas Metrô");
      setIcon(TrainFrontTunnel);
      console.log("mudou para metro");
    }
  }, [modal]);

  const [busca, setBusca] = useState("");
  const [data, setData] = useState(mockLinhas);
  const [linhaSelecionada, setLinhaSelecionada] = useState<any>(null);
  const [sentidoSelecionado, setSentidoSelecionado] = useState<string | null>(
    null
  );

  const buscarLinhas = (text: string) => {
    setBusca(text);

    const modalFormatado = modal?.toLowerCase();

    const filtrar = mockLinhas.filter(
      (linha) =>
        linha.nome.toLowerCase().startsWith(text.toLowerCase()) &&
        linha.modal.toLowerCase() === modalFormatado
    );

    setData(filtrar);
  };

  const listaSelecionada = (linha: any) => {
    // esconde a lista e pega o nome se clicar em um item da lista
    setBusca(linha.nome);
    setData([]);
    setLinhaSelecionada(linha);
    Keyboard.dismiss(); // esconde o teclado dps de selecionar uma linha
  };

  useEffect(() => {
    // limpa o input se trocar de modal
    setBusca("");
    setData([]);
    setLinhaSelecionada(null);
    setSentidoSelecionado(null);
  }, [modal]);

  const sentido = () => {
    if (!linhaSelecionada) return [];

    return linhaSelecionada.sentido.split("↔").map((s: string) => s.trim());
  };

  const buscaAtiva = busca !== "" && data.length > 0;

  const scrollRef = React.createRef<FlatList>();

  const scrollDown = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollToOffset({
          offset: 550,
          animated: true,
        });
      }
    }, 400);
  };

  const [telaLinhas, setTelaLinhas] = useState<DimensionValue>("50%");

  useEffect(() => {
    const tecladoAberto = Keyboard.addListener("keyboardDidShow", () => {
      setTelaLinhas("80%");
    });
    const tecladoFechado = Keyboard.addListener("keyboardDidHide", () => {
      if (sentidoSelecionado) {
        setTelaLinhas("75%");
      } else if (linhaSelecionada) {
        setTelaLinhas("55%");
      } else setTelaLinhas("50%");
    });

    return () => {
      tecladoAberto.remove();
      tecladoFechado.remove();
    };
  }, [linhaSelecionada, sentidoSelecionado]);

  useEffect(() => {
    if (sentidoSelecionado && linhaSelecionada) {
      setTelaLinhas("75%");
    }
  }, [sentidoSelecionado]);

  return (
    <View className=" flex flex-col h-screen rounded-t-3xl overflow-hidden">
      <MapView
        style={{ flex: 1 }}
        mapType="standard" // tipo de mapa
        showsUserLocation={true}
        followsUserLocation={true}
        showsMyLocationButton={false}
        customMapStyle={[
          // remover os locais como lojas e coisas do tipo
          {
            featureType: "poi",
            stylers: [{ visibility: "off" }],
          },
        ]}
        initialRegion={{
          latitude: -22.882384145462976,
          longitude: -43.16511972224441,
          latitudeDelta: 0.2,
          longitudeDelta: 0.2,
        }}
      />

      {/*container de linhas*/}
      <Animated.View
        style={{ height: telaLinhas as DimensionValue }}
        className="flex-col bg-customGray rounded-t-3xl shadow-lg overflow-hidden"
      >
        {/* container do select modal */}
        <View className="pt-6 pb-2 mb-3 bg-customGray rounded-t-3xl overflow-hidden">
          <Text className="mt-5 text-2xl font-semibold self-center">
            Linhas e Hórarios
          </Text>

          <SelectTransporte modal={modal} setModal={setModal} />
        </View>

        <FlatList
          ref={scrollRef}
          scrollEnabled={!buscaAtiva}
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          data={[{ key: "content" }]}
          //renderItem={null}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingBottom: 80 }}
          renderItem={() => (
            <>
              {/*input buscar linha*/}
              <View className="bg-customGray mt-2 pt-5 ">
                <InputBusca
                  placeholder={placeholder}
                  icon={icon}
                  className="!w-[90%] self-center mb-5"
                  value={busca}
                  onChangeText={buscarLinhas}
                />

                {buscaAtiva && (
                  <Animated.View
                    entering={FadeInUp.duration(400).springify()}
                    layout={LinearTransition}
                    className="h-[150] bg-white rounded-xl mx-10 w-[90%] self-center shadow-sm border border-gray-200 overflow-hidden mb-4"
                  >
                    <ScrollView
                      nestedScrollEnabled={true}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={true}
                    >
                      {data.map((item) => (
                        <Pressable
                          key={item.id}
                          onPress={() => listaSelecionada(item)}
                          className="p-4 border-b border-gray-100 active:bg-gray-200"
                        >
                          <Text className="text-lg font-semibold">
                            {item.nome}
                          </Text>
                          <Text className="text-gray-500 text-sm">
                            {item.sentido}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </Animated.View>
                )}

                <Select
                  placeholder="Selecione o Sentido"
                  className="!w-[90%] self-center"
                  options={sentido()}
                  value={sentidoSelecionado}
                  onChange={setSentidoSelecionado}
                />
              </View>

              {/*container de resultado*/}
              {linhaSelecionada && sentidoSelecionado && (
                <Animated.View
                  entering={FadeInUp.duration(400).springify()}
                  className="w-full mt-8 h-full"
                >
                  <Text className="left-6 font-semibold mb-4 text-lg">
                    Linha {busca} - {sentidoSelecionado}
                  </Text>

                  <Chegada intervalo={linhaSelecionada.intervalo} />

                  <Tarifas
                    valor={linhaSelecionada.tarifa}
                    modal={linhaSelecionada.modal}
                  />

                  <PontosInteresses // deu erro de tipagem, gemini arrumou, tenho q pesquisar mais sobre isso
                    pontos={
                      pontosPorLinha[
                        linhaSelecionada.nome as keyof typeof pontosPorLinha
                      ]
                    }
                    scrollDown={scrollDown}
                  />
                </Animated.View>
              )}
            </>
          )}
        />
      </Animated.View>
    </View>
  );
};

export default linhas;
