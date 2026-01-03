import InputBusca from "@/src/components/inputBusca";
import Chegada from "@/src/components/linhasComponents/chegada";
import PontosInteresses from "@/src/components/linhasComponents/pontosInteresses";
import SelectTransporte from "@/src/components/linhasComponents/selectTransporte";
import Tarifas from "@/src/components/linhasComponents/tarifas";
import MapaOSM from "@/src/components/mapOSM";
import ResultadoBusca from "@/src/components/resultadoBusca";
import Select from "@/src/components/select";
import { mockItinerarios } from "@/src/mocks/itinerariosMocks";
import { mockLinhas } from "@/src/mocks/linhasMocks";
import { pontosPorLinha } from "@/src/mocks/pontosInteresseMock";
import { mockPosicoes } from "@/src/mocks/posicaoMocks";
import {
  getCurrentPositionAsync,
  LocationAccuracy,
  LocationObject,
  requestForegroundPermissionsAsync,
  watchPositionAsync,
} from "expo-location";
import {
  Bus,
  BusFront,
  ListFilter,
  LucideIcon,
  Train,
  TrainFrontTunnel,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Keyboard,
  Platform,
  StatusBar,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const linhas = () => {
  const [location, setLocation] = useState<LocationObject | null>(null);

  async function requestLocationPermissions() {
    const { granted } = await requestForegroundPermissionsAsync();
    if (granted) {
      const location = await getCurrentPositionAsync();
      setLocation(location);
    }
  }

  useEffect(() => {
    requestLocationPermissions();
  }, []);

  useEffect(() => {
    let subscription: any;
    async function startWatching() {
      subscription = await watchPositionAsync(
        {
          accuracy: LocationAccuracy.Highest,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (response) => {
          setLocation(response);
        }
      );
    }
    startWatching();
    return () => subscription?.remove();
  }, []);

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

    // Se tiver 1 ou menos caracteres, usa startsWith, senão usa includes
    const usarStartsWith = text.length <= 1;

    const filtrar = mockLinhas.filter((linha) => {
      const modalMatch = linha.modal.toLowerCase() === modalFormatado;
      const nomeMatch = usarStartsWith
        ? linha.nome.toLowerCase().startsWith(text.toLowerCase())
        : linha.nome.toLowerCase().includes(text.toLowerCase());

      return nomeMatch && modalMatch;
    });

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

  const screenHeight = Dimensions.get("window").height;
  const statusBarHeight =
    Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0;
  const MIN_HEIGHT = screenHeight * 0.3; // 30%
  const MAX_HEIGHT = screenHeight * 1.0; // 100%
  const DEFAULT_HEIGHT = screenHeight * 0.5; // 50%

  const translateY = useSharedValue(0);
  const containerHeight = useSharedValue(DEFAULT_HEIGHT);
  const startHeight = useSharedValue(DEFAULT_HEIGHT);

  useEffect(() => {
    const tecladoAberto = Keyboard.addListener("keyboardDidShow", () => {
      containerHeight.value = withSpring(screenHeight * 0.8);
    });
    const tecladoFechado = Keyboard.addListener("keyboardDidHide", () => {
      if (sentidoSelecionado) {
        containerHeight.value = withSpring(screenHeight * 0.75);
      } else if (linhaSelecionada) {
        containerHeight.value = withSpring(screenHeight * 0.55);
      } else {
        containerHeight.value = withSpring(DEFAULT_HEIGHT);
      }
    });

    return () => {
      tecladoAberto.remove();
      tecladoFechado.remove();
    };
  }, [linhaSelecionada, sentidoSelecionado]);

  useEffect(() => {
    if (sentidoSelecionado && linhaSelecionada) {
      containerHeight.value = withSpring(screenHeight * 0.75);
    }
  }, [sentidoSelecionado]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startHeight.value = containerHeight.value;
    })
    .onUpdate((event) => {
      const newHeight = startHeight.value - event.translationY;
      if (newHeight >= MIN_HEIGHT && newHeight <= MAX_HEIGHT) {
        containerHeight.value = newHeight;
      }
    })
    .onEnd((event) => {
      const newHeight = startHeight.value - event.translationY;

      // Snap para valores específicos se estiver próximo
      if (newHeight < MIN_HEIGHT + 50) {
        containerHeight.value = withSpring(MIN_HEIGHT);
      } else if (newHeight > MAX_HEIGHT - 50) {
        containerHeight.value = withSpring(MAX_HEIGHT);
      } else if (Math.abs(newHeight - DEFAULT_HEIGHT) < 80) {
        containerHeight.value = withSpring(DEFAULT_HEIGHT);
      } else {
        containerHeight.value = withSpring(
          Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, newHeight))
        );
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const isFullScreen = containerHeight.value > screenHeight * 0.95;
    return {
      height: containerHeight.value,
      paddingTop: isFullScreen ? statusBarHeight : 0,
    };
  });

  const itinerarioLinha = linhaSelecionada
    ? mockItinerarios[linhaSelecionada.nome as keyof typeof mockItinerarios]
    : null;

  const coordenadasTrajeto = itinerarioLinha
    ? itinerarioLinha.map((ponto) => ({
        latitude: ponto.lat,
        longitude: ponto.lng,
      }))
    : [];

  // Dados formatados para o MapaOSM
  const dadosParaMapa =
    linhaSelecionada && sentidoSelecionado
      ? [
          {
            nome: linhaSelecionada.nome,
            cor: "#2563eb",
            modal: linhaSelecionada.modal,
            coordenadas:
              itinerarioLinha?.map((p: { lat: number; lng: number }) => [
                p.lat,
                p.lng,
              ]) || [],
            posicoes: mockPosicoes.filter(
              (p) => p.linha === linhaSelecionada.nome
            ),
          },
        ]
      : [];

  const mapRef = useRef<any>(null);

  // Centralizar no itinerário quando linha e sentido forem selecionados
  useEffect(() => {
    if (
      linhaSelecionada &&
      sentidoSelecionado &&
      coordenadasTrajeto.length > 0 &&
      mapRef.current?.fitToCoordinates
    ) {
      setTimeout(() => {
        mapRef.current.fitToCoordinates(coordenadasTrajeto);
      }, 500);
    }
  }, [linhaSelecionada, sentidoSelecionado]);

  return (
    <View className=" flex flex-col h-screen rounded-t-3xl overflow-hidden">
      {location && (
        <MapaOSM
          ref={mapRef}
          location={location}
          linhasParaMostrar={dadosParaMapa}
        />
      )}

      {/*container de linhas*/}
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: "#f3f4f6",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.2,
            shadowRadius: 5,
            elevation: 10,
            overflow: "hidden",
          },
        ]}
      >
        {/* Indicador de arraste */}
        <GestureDetector gesture={panGesture}>
          <View className="w-full items-center justify-center py-4">
            <View className="w-16 h-1.5 bg-gray-400 rounded-full" />
          </View>
        </GestureDetector>

        {/* container do select modal */}
        <View className="pb-2 mb-3 bg-customGray overflow-hidden">
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
                  <ResultadoBusca
                    data={data}
                    listaSelecionada={listaSelecionada}
                    className="bg-white rounded-2xl !w-[90%] self-center mb-5 shadow-lg"
                    maxHeight={150}
                  />
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
