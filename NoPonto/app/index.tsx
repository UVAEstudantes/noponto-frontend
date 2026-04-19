import InputBusca from "@/src/components/inputBusca";
import Filtro from "@/src/components/mapaComponents/filtro";
import LinhasContainer from "@/src/components/mapaComponents/linhasContainer";
import LocalButton from "@/src/components/mapaComponents/localButton";
import RotaButton from "@/src/components/mapaComponents/rotaButton";
import MapaOSM, { MapaOSMRef } from "@/src/components/mapOSM";
import ResultadoBusca from "@/src/components/resultadoBusca";
import { mockItinerarios } from "@/src/mocks/itinerariosMocks";
import { mockLinhas } from "@/src/mocks/linhasMocks";
import { mockPosicoes } from "@/src/mocks/posicaoMocks";
import { gerarCorAleatoria } from "@/src/utils/cores";
import {
  getCurrentPositionAsync,
  LocationAccuracy,
  LocationObject,
  requestForegroundPermissionsAsync,
  watchPositionAsync,
} from "expo-location";
import { Search } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Keyboard, Pressable, View } from "react-native";
//import MapView, { Marker, Polyline } from "react-native-maps";
import { salvarLinhas, carregarLinhasSalvas } from "@/src/services/storage";

const MaxLinhasView = 5;

const Home = () => {
  const [transito, setTransito] = React.useState(false);
  const [onibus, setOnibus] = React.useState(true);
  const [brt, setBrt] = React.useState(false);
  const [trem, setTrem] = React.useState(false);
  const [metro, setMetro] = React.useState(false);

  function clickTransito() {
    setTransito((prev) => !prev);
  }

  const mapRef = React.useRef<MapaOSMRef>(null);
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
          timeInterval: 2000, // Atualiza a cada 2 segundos
          distanceInterval: 5, // Ou a cada 5 metros
        },
        (response) => {
          setLocation(response); // Isso disparará o re-render e atualizará o MapaOSM
        },
      );
    }

    startWatching();
    return () => subscription?.remove(); // Limpa ao fechar
  }, []);

  const [data, setData] = useState(mockLinhas);
  const [busca, setBusca] = useState("");
  const [linhaSelecionada, setLinhaSelecionada] = useState<any>(null);
  const [linhasSelecionadas, setLinhasSelecionadas] = useState<
    Array<{
      nome: string;
      modal: string;
      cor: string;
      ativa: boolean;
    }>
  >([]);
  const [containerAberto, setContainerAberto] = useState(false);

  const buscaAtiva = busca !== "" && data.length > 0;

  const buscarLinhas = (text: string) => {
    setBusca(text);
    setContainerAberto(false); // Fechar container ao buscar

    // Array de modais selecionados
    const modaisSelecionados: string[] = [];
    if (onibus) modaisSelecionados.push("onibus");
    if (brt) modaisSelecionados.push("brt");
    if (trem) modaisSelecionados.push("trem");
    if (metro) modaisSelecionados.push("metro");

    // Se tiver 1 ou menos caracteres, usa startsWith, senão usa includes (da pra melhorar usando o include se não encontrar nada com o startWith)
    const usarStartsWith = text.length <= 1;

    const filtrar = mockLinhas.filter((linha) => {
      const modalMatch = modaisSelecionados.includes(linha.modal.toLowerCase());
      const nomeMatch = usarStartsWith
        ? linha.nome.toLowerCase().startsWith(text.toLowerCase())
        : linha.nome.toLowerCase().includes(text.toLowerCase());

      return nomeMatch && modalMatch;
    });

    setData(filtrar);
  };

  const listaSelecionada = (linha: any) => {
    // esconde a lista e pega o nome se clicar em um item da lista
    setData([]);
    setLinhaSelecionada(linha);
    Keyboard.dismiss(); // esconde o teclado dps de selecionar uma linha

    // Adicionar linha à lista de selecionadas se não estiver e não tiver chegado ao limite
    const jaExiste = linhasSelecionadas.some((l) => l.nome === linha.nome);
    if (!jaExiste && linhasSelecionadas.length < MaxLinhasView) {
      const coresEmUso = linhasSelecionadas.map((l) => l.cor);
      const novaCor = gerarCorAleatoria(coresEmUso);
      setLinhasSelecionadas([
        ...linhasSelecionadas,
        {
          nome: linha.nome,
          modal: linha.modal,
          cor: novaCor,
          ativa: true,
        },
      ]);

      // Centralizar no itinerário da linha selecionada
      const itinerario =
        mockItinerarios[linha.nome as keyof typeof mockItinerarios];
      if (
        itinerario &&
        itinerario.length > 0 &&
        mapRef.current?.fitToCoordinates
      ) {
        setTimeout(() => {
          const coordenadas = itinerario.map(
            (p: { lat: number; lng: number }) => ({
              latitude: p.lat,
              longitude: p.lng,
            }),
          );
          mapRef.current?.fitToCoordinates(coordenadas);
        }, 500);
      }
    }

    // Limpar busca após selecionar
    setBusca("");
  };

  // Funções de manipulação das linhas selecionadas
  const removerLinha = (nome: string) => {
    setLinhasSelecionadas(linhasSelecionadas.filter((l) => l.nome !== nome));
    // Se a linha removida era a linha selecionada atual, limpar
    if (linhaSelecionada?.nome === nome) {
      setLinhaSelecionada(null);
      setBusca("");
    }
  };

  const toggleAtiva = (nome: string) => {
    setLinhasSelecionadas(
      linhasSelecionadas.map((l) =>
        l.nome === nome ? { ...l, ativa: !l.ativa } : l,
      ),
    );
  };

  // Filtrar apenas linhas ativas
  const linhasParaMostrar = linhasSelecionadas.filter((l) => l.ativa);

  const posicoesLinha = mockPosicoes.filter(
    (p) => p.linha === linhaSelecionada?.nome,
  );

  // Pegar o itinerario da linha selecionada
  const itinerarioLinha = linhaSelecionada
    ? mockItinerarios[linhaSelecionada.nome as keyof typeof mockItinerarios]
    : null;

  const coordenadasTrajeto = itinerarioLinha
    ? itinerarioLinha.map((ponto) => ({
        latitude: ponto.lat,
        longitude: ponto.lng,
      }))
    : [];

  const dadosParaMapa = linhasSelecionadas
    .filter((l) => l.ativa)
    .map((linha) => ({
      nome: linha.nome,
      cor: linha.cor,
      coordenadas:
        mockItinerarios[linha.nome as keyof typeof mockItinerarios]?.map(
          (p: { lat: number; lng: number }) => [p.lat, p.lng],
        ) || [],
      posicoes: mockPosicoes.filter((p) => p.linha === linha.nome),
    }));

  useEffect(() => {
    // carrega linhas salvas do storage ao iniciar
    const carregar = async () => {
      const linhas = await carregarLinhasSalvas();
      if (linhas.length > 0) {
        setLinhasSelecionadas(linhas);
      }
    };
    carregar();
  }, []);

  useEffect(() => {
    // salva linhas no storage
    if (linhasSelecionadas.length > 0) salvarLinhas(linhasSelecionadas);
  }, [linhasSelecionadas]);

  return (
    <View className="flex-1 flex-col">
      {location && (
        <MapaOSM
          ref={mapRef}
          location={location}
          linhasParaMostrar={dadosParaMapa}
          showTraffic={transito}
        />
      )}

      {/* Pressable para fechar container quando clicar fora */}
      {containerAberto && (
        <Pressable
          onPress={() => setContainerAberto(false)}
          className="absolute inset-0 z-10"
        />
      )}

      <InputBusca
        placeholder="Buscar Linhas"
        icon={Search}
        className="absolute top-[4rem] !w-3/4 right-[5rem]"
        value={busca}
        onChangeText={buscarLinhas}
      />

      {buscaAtiva && (
        <ResultadoBusca
          data={data}
          listaSelecionada={listaSelecionada}
          className="absolute top-[8rem] !w-3/4 right-[5rem] bg-white shadow-lg rounded-2xl z-20"
          maxHeight={400}
        />
      )}

      <Filtro
        transito={transito}
        clickTransito={clickTransito}
        onibus={onibus}
        setOnibus={setOnibus}
        brt={brt}
        setBrt={setBrt}
        trem={trem}
        setTrem={setTrem}
        metro={metro}
        setMetro={setMetro}
      />

      <RotaButton />
      <LocalButton location={location} mapRef={mapRef} />

      <LinhasContainer
        linhasSelecionadas={linhasSelecionadas}
        aoRemoverLinha={removerLinha}
        aoToggleAtiva={toggleAtiva}
        aberto={containerAberto}
        aoToggleAberto={() => setContainerAberto(!containerAberto)}
      />
    </View>
  );
};

export default Home;
