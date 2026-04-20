import InputBusca from "@/src/components/inputBusca";
import { useTema } from "@/src/hooks/useTema";
import { useMobilidadeRio } from "@/src/hooks/useMobilidadeRio";
import Chegada from "@/src/components/linhasComponents/chegada";
import PontosInteresses from "@/src/components/linhasComponents/pontosInteresses";
import SelectTransporte from "@/src/components/linhasComponents/selectTransporte";
import Tarifas from "@/src/components/linhasComponents/tarifas";
import MapaOSM from "@/src/components/mapOSM";
import ResultadoBusca from "@/src/components/resultadoBusca";
import Select from "@/src/components/select";
import { pontosPorLinha } from "@/src/mocks/pontosInteresseMock";
import { chaveLinhaModal } from "@/src/services/mobilidadeRio";
import {
  ItinerarioLinha,
  LinhaTempoReal,
  ModalApiTransporte,
  VeiculoTempoReal,
} from "@/src/types/transporte";
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
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

function normalizarModalApi(
  modalSelecionado: string | null | undefined,
): ModalApiTransporte | null {
  if (!modalSelecionado) {
    return null;
  }

  const valor = modalSelecionado.trim().toLowerCase();

  if (valor === "onibus") {
    return "onibus";
  }

  if (valor === "brt") {
    return "brt";
  }

  return null;
}

type SentidoLinha = "ida" | "volta";

function normalizarSentidoSelecionado(
  valor: string | null,
): SentidoLinha | null {
  if (!valor) {
    return null;
  }

  const normalizado = valor.trim().toLowerCase();

  if (normalizado.startsWith("ida")) {
    return "ida";
  }

  if (normalizado.startsWith("volta")) {
    return "volta";
  }

  return null;
}

function normalizarSentidoVeiculo(
  sentido: string | undefined,
): SentidoLinha | null {
  if (!sentido) {
    return null;
  }

  const normalizado = sentido.trim().toLowerCase();

  if (normalizado.startsWith("ida")) {
    return "ida";
  }

  if (normalizado.startsWith("volta")) {
    return "volta";
  }

  return null;
}

function nomeSentidoPorTipo(
  itinerario: ItinerarioLinha | null,
  tipoSentido: SentidoLinha | null,
): string | null {
  if (!tipoSentido) {
    return null;
  }

  if (tipoSentido === "ida") {
    return itinerario?.destinoIda?.trim() || "Ida";
  }

  return itinerario?.destinoVolta?.trim() || "Volta";
}

function distanciaQuadradaPontoParaSegmento(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const modulo2 = abx * abx + aby * aby;

  const t =
    modulo2 === 0
      ? 0
      : Math.max(0, Math.min(1, (apx * abx + apy * aby) / modulo2));

  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;

  return dx * dx + dy * dy;
}

function menorDistanciaQuadradaTrajeto(
  latitude: number,
  longitude: number,
  trajeto: [number, number][] | undefined,
): number {
  if (!trajeto || trajeto.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  let menorDistancia = Number.POSITIVE_INFINITY;

  for (let indice = 0; indice < trajeto.length - 1; indice += 1) {
    const [latA, lngA] = trajeto[indice];
    const [latB, lngB] = trajeto[indice + 1];

    const distancia = distanciaQuadradaPontoParaSegmento(
      latitude,
      longitude,
      latA,
      lngA,
      latB,
      lngB,
    );

    if (distancia < menorDistancia) {
      menorDistancia = distancia;
    }
  }

  return menorDistancia;
}

function estimarSentidoPorItinerario(
  veiculo: VeiculoTempoReal,
  itinerario: ItinerarioLinha | null,
): SentidoLinha | null {
  if (!itinerario) {
    return null;
  }

  const distanciaIda = menorDistanciaQuadradaTrajeto(
    veiculo.latitude,
    veiculo.longitude,
    itinerario.ida,
  );

  const distanciaVolta = menorDistanciaQuadradaTrajeto(
    veiculo.latitude,
    veiculo.longitude,
    itinerario.volta,
  );

  const idaValida = Number.isFinite(distanciaIda);
  const voltaValida = Number.isFinite(distanciaVolta);

  if (idaValida && !voltaValida) {
    return "ida";
  }

  if (voltaValida && !idaValida) {
    return "volta";
  }

  if (!idaValida && !voltaValida) {
    return null;
  }

  return distanciaIda <= distanciaVolta ? "ida" : "volta";
}

const Linhas = () => {
  const { temaAtual, estiloMapaAtual, cores } = useTema();
  const {
    linhasDisponiveis,
    itinerariosPorLinha,
    garantirItinerarioLinha,
    getVeiculosLinha,
    getSentidoLinha,
  } = useMobilidadeRio();
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
        },
      );
    }
    startWatching();
    return () => subscription?.remove();
  }, []);

  const [modal, setModal] = useState<string | null>("Onibus");
  const [placeholder, setPlaceholder] = useState(
    "Selecione um tipo de Transporte",
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
  const [data, setData] = useState<LinhaTempoReal[]>([]);
  const [linhaSelecionada, setLinhaSelecionada] =
    useState<LinhaTempoReal | null>(null);
  const [sentidoSelecionado, setSentidoSelecionado] = useState<string | null>(
    null,
  );

  const buscarLinhas = useCallback(
    (text: string) => {
      setBusca(text);

      const modalAtual = normalizarModalApi(modal);
      if (!modalAtual) {
        setData([]);
        return;
      }

      const termo = text.trim().toLowerCase();
      const usarStartsWith = termo.length <= 1;

      const filtrar = linhasDisponiveis.filter((linha) => {
        const modalMatch = linha.modal === modalAtual;
        const nomeMatch = usarStartsWith
          ? linha.nome.toLowerCase().startsWith(termo)
          : linha.nome.toLowerCase().includes(termo);

        return nomeMatch && modalMatch;
      });

      setData(filtrar);

      filtrar.slice(0, 10).forEach((linha) => {
        void garantirItinerarioLinha(linha.nome, linha.modal);
      });
    },
    [linhasDisponiveis, modal, garantirItinerarioLinha],
  );

  const listaSelecionada = (linha: LinhaTempoReal) => {
    // esconde a lista e pega o nome se clicar em um item da lista
    setBusca(linha.nome);
    setData([]);
    setLinhaSelecionada(linha);
    setSentidoSelecionado(null);

    void garantirItinerarioLinha(linha.nome, linha.modal);

    Keyboard.dismiss(); // esconde o teclado dps de selecionar uma linha
  };

  useEffect(() => {
    // limpa o input se trocar de modal
    setBusca("");
    setData([]);
    setLinhaSelecionada(null);
    setSentidoSelecionado(null);
  }, [modal]);

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
  }, [
    linhaSelecionada,
    sentidoSelecionado,
    containerHeight,
    screenHeight,
    DEFAULT_HEIGHT,
  ]);

  useEffect(() => {
    if (sentidoSelecionado && linhaSelecionada) {
      containerHeight.value = withSpring(screenHeight * 0.75);
    }
  }, [sentidoSelecionado, linhaSelecionada, containerHeight, screenHeight]);

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
          Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, newHeight)),
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

  const modalLinhaSelecionada = linhaSelecionada
    ? normalizarModalApi(linhaSelecionada.modal)
    : null;

  const chaveItinerario =
    linhaSelecionada && modalLinhaSelecionada
      ? chaveLinhaModal(linhaSelecionada.nome, modalLinhaSelecionada)
      : null;

  const itinerarioLinha = chaveItinerario
    ? itinerariosPorLinha[chaveItinerario]
    : null;

  const opcoesSentido = useMemo<string[]>(() => {
    if (!itinerarioLinha) {
      if (!linhaSelecionada) {
        return [];
      }

      return linhaSelecionada.sentido
        .split("↔")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    const opcoes: string[] = [];

    if (itinerarioLinha.ida?.length) {
      const destinoIda = itinerarioLinha.destinoIda?.trim();
      opcoes.push(destinoIda ? `Ida - ${destinoIda}` : "Ida");
    }

    if (itinerarioLinha.volta?.length) {
      const destinoVolta = itinerarioLinha.destinoVolta?.trim();
      opcoes.push(destinoVolta ? `Volta - ${destinoVolta}` : "Volta");
    }

    if (opcoes.length > 0) {
      return opcoes;
    }

    return (
      linhaSelecionada?.sentido
        .split("↔")
        .map((item) => item.trim())
        .filter(Boolean) ?? []
    );
  }, [itinerarioLinha, linhaSelecionada]);

  const segmentosTrajeto = useMemo(() => {
    if (!itinerarioLinha) {
      return [] as [number, number][][];
    }

    const sentidoNormalizado = sentidoSelecionado?.trim().toLowerCase();

    if (sentidoNormalizado?.startsWith("ida") && itinerarioLinha.ida) {
      return [itinerarioLinha.ida];
    }

    if (sentidoNormalizado?.startsWith("volta") && itinerarioLinha.volta) {
      return [itinerarioLinha.volta];
    }

    return itinerarioLinha.segmentos;
  }, [itinerarioLinha, sentidoSelecionado]);

  const coordenadasTrajeto = useMemo(
    () =>
      (segmentosTrajeto[0] ?? []).map(([latitude, longitude]) => ({
        latitude,
        longitude,
      })),
    [segmentosTrajeto],
  );

  const tipoSentidoSelecionado = useMemo(
    () => normalizarSentidoSelecionado(sentidoSelecionado),
    [sentidoSelecionado],
  );

  const nomeSentidoSelecionado = useMemo(() => {
    const nome = nomeSentidoPorTipo(itinerarioLinha, tipoSentidoSelecionado);
    if (nome) {
      return nome;
    }

    if (!sentidoSelecionado) {
      return null;
    }

    const partes = sentidoSelecionado.split("-");
    if (partes.length > 1) {
      return partes.slice(1).join("-").trim();
    }

    return sentidoSelecionado;
  }, [itinerarioLinha, tipoSentidoSelecionado, sentidoSelecionado]);

  const veiculosPorSentido = useMemo(() => {
    if (
      !linhaSelecionada ||
      !modalLinhaSelecionada ||
      !tipoSentidoSelecionado
    ) {
      return [] as VeiculoTempoReal[];
    }

    return getVeiculosLinha(
      linhaSelecionada.nome,
      modalLinhaSelecionada,
    ).filter((veiculo) => {
      const sentidoApi = normalizarSentidoVeiculo(veiculo.sentido);
      if (sentidoApi) {
        return sentidoApi === tipoSentidoSelecionado;
      }

      const sentidoEstimado = estimarSentidoPorItinerario(
        veiculo,
        itinerarioLinha,
      );

      return sentidoEstimado === tipoSentidoSelecionado;
    });
  }, [
    linhaSelecionada,
    modalLinhaSelecionada,
    tipoSentidoSelecionado,
    getVeiculosLinha,
    itinerarioLinha,
  ]);

  // Dados formatados para o MapaOSM
  const dadosParaMapa =
    linhaSelecionada && modalLinhaSelecionada && sentidoSelecionado
      ? [
          {
            nome: linhaSelecionada.nome,
            cor: "#2563eb",
            modal: modalLinhaSelecionada,
            segmentos: segmentosTrajeto,
            coordenadas: segmentosTrajeto[0] ?? [],
            posicoes: veiculosPorSentido.map((veiculo) => ({
              id: veiculo.id,
              latitude: veiculo.latitude,
              longitude: veiculo.longitude,
              direcao: veiculo.direcao,
              velocidade: veiculo.velocidade,
              sentido: veiculo.sentido,
              sentidoNome:
                nomeSentidoSelecionado ??
                nomeSentidoPorTipo(
                  itinerarioLinha,
                  normalizarSentidoVeiculo(veiculo.sentido),
                ) ??
                undefined,
              trajeto: veiculo.trajeto,
              timestamp: veiculo.timestamp,
            })),
          },
        ]
      : [];

  const mapRef = useRef<any>(null);

  // Centralizar no itinerário quando linha e sentido forem selecionados
  useEffect(() => {
    if (!linhaSelecionada) {
      return;
    }

    const modalApi = normalizarModalApi(linhaSelecionada.modal);
    if (!modalApi) {
      return;
    }

    void garantirItinerarioLinha(linhaSelecionada.nome, modalApi);
  }, [linhaSelecionada, garantirItinerarioLinha]);

  useEffect(() => {
    if (!busca.trim()) {
      setData([]);
      return;
    }

    buscarLinhas(busca);
  }, [linhasDisponiveis, modal, busca, buscarLinhas]);

  useEffect(() => {
    if (
      linhaSelecionada &&
      coordenadasTrajeto.length > 0 &&
      mapRef.current?.fitToCoordinates
    ) {
      setTimeout(() => {
        mapRef.current.fitToCoordinates(coordenadasTrajeto);
      }, 500);
    }
  }, [linhaSelecionada, coordenadasTrajeto]);

  useEffect(() => {
    if (!linhaSelecionada || opcoesSentido.length === 0) {
      return;
    }

    if (sentidoSelecionado && opcoesSentido.includes(sentidoSelecionado)) {
      return;
    }

    setSentidoSelecionado(opcoesSentido[0]);
  }, [linhaSelecionada, opcoesSentido, sentidoSelecionado]);

  const dadosBuscaComDestino = useMemo(
    () =>
      data.map((linha) => ({
        ...linha,
        sentido: getSentidoLinha(linha.nome, linha.modal),
      })),
    [data, getSentidoLinha],
  );

  return (
    <View className="flex-1" style={{ backgroundColor: cores.fundoApp }}>
      {location && (
        <MapaOSM
          ref={mapRef}
          location={location}
          linhasParaMostrar={dadosParaMapa}
          darkMode={temaAtual === "escuro"}
          estiloMapa={estiloMapaAtual}
        />
      )}

      {/*container de linhas*/}
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: cores.fundoApp,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            shadowColor: cores.sombra,
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
            <View
              className="w-16 h-1.5 rounded-full"
              style={{ backgroundColor: cores.borda }}
            />
          </View>
        </GestureDetector>

        {/* container do select modal */}
        <View
          className="pb-2 mb-3 overflow-hidden"
          style={{ backgroundColor: cores.fundoApp }}
        >
          <Text
            className="mt-5 text-2xl font-semibold self-center"
            style={{ color: cores.textoPrimario }}
          >
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
              <View
                className="mt-2 pt-5"
                style={{ backgroundColor: cores.fundoApp }}
              >
                <InputBusca
                  placeholder={placeholder}
                  icon={icon}
                  className="!w-[90%] self-center mb-5"
                  value={busca}
                  onChangeText={buscarLinhas}
                />

                {buscaAtiva && (
                  <ResultadoBusca
                    data={dadosBuscaComDestino}
                    listaSelecionada={listaSelecionada}
                    className="rounded-2xl !w-[90%] self-center mb-5 shadow-lg"
                    maxHeight={150}
                  />
                )}

                <Select
                  placeholder="Selecione o Sentido"
                  className="!w-[90%] self-center"
                  options={opcoesSentido}
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
                  <Text
                    className="left-6 font-semibold mb-4 text-lg"
                    style={{ color: cores.textoPrimario }}
                  >
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

export default Linhas;
