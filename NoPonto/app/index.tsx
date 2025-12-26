import InputBusca from "@/src/components/inputBusca";
import Filtro from "@/src/components/mapaComponents/filtro";
import LinhasContainer from "@/src/components/mapaComponents/linhasContainer";
import LocalButton from "@/src/components/mapaComponents/localButton";
import RotaButton from "@/src/components/mapaComponents/rotaButton";
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
import { MapPin, Search } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Keyboard, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

const Home = () => {
  const [transito, setTransito] = React.useState(false);
  const [onibus, setOnibus] = React.useState(true);
  const [brt, setBrt] = React.useState(false);
  const [trem, setTrem] = React.useState(false);
  const [metro, setMetro] = React.useState(false);

  function clickTransito() {
    setTransito(!transito);
    console.log("transito: ", transito);
  }

  const mapRef = React.useRef<MapView>(null);
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
    watchPositionAsync(
      {
        accuracy: LocationAccuracy.Highest,
        timeInterval: 1000,
        distanceInterval: 1,
      },
      (response) => {
        setLocation(response);
      }
    );
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
    if (!jaExiste && linhasSelecionadas.length < 10) {
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
        l.nome === nome ? { ...l, ativa: !l.ativa } : l
      )
    );
  };

  // Filtrar apenas linhas ativas
  const linhasParaMostrar = linhasSelecionadas.filter((l) => l.ativa);

  const posicoesLinha = mockPosicoes.filter(
    (p) => p.linha === linhaSelecionada?.nome
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

  return (
    <View className=" flex-1 flex-col items-center bg-white ">
      {location && (
        <MapView
          style={{ width: "100%", height: "100%" }}
          ref={mapRef}
          mapType="standard" // tipo de mapa
          showsUserLocation={true}
          followsUserLocation={true}
          showsMyLocationButton={false}
          showsTraffic={transito} // mostrar transito se clicar no check transito
          onPress={() => setContainerAberto(false)} // Fechar container ao clicar no mapa
          customMapStyle={[
            // remover os locais como lojas e coisas do tipo
            {
              featureType: "poi",
              stylers: [{ visibility: "off" }],
            },
          ]}
          initialRegion={{
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }}
        >
          {/* Trajetos e marcadores das linhas selecionadas */}
          {linhasParaMostrar.map((linha) => {
            const itinerario =
              mockItinerarios[linha.nome as keyof typeof mockItinerarios];
            const coordenadas = itinerario
              ? itinerario.map((ponto) => ({
                  latitude: ponto.lat,
                  longitude: ponto.lng,
                }))
              : [];
            const posicoes = mockPosicoes.filter((p) => p.linha === linha.nome);

            return (
              <React.Fragment key={linha.nome}>
                {/* Trajeto da linha */}
                {coordenadas.length > 0 && (
                  <Polyline
                    coordinates={coordenadas}
                    strokeColor={linha.cor}
                    strokeWidth={3}
                  />
                )}

                {/* Marcadores dos veículos */}
                {posicoes.map((posicao) => (
                  <Marker
                    key={`${linha.nome}-${posicao.id}`}
                    coordinate={{
                      latitude: posicao.latitude,
                      longitude: posicao.longitude,
                    }}
                    title={`${linha.nome} - ${posicao.id}`}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        backgroundColor: linha.cor,
                        borderRadius: 12,
                        justifyContent: "center",
                        alignItems: "center",
                        borderWidth: 2,
                        borderColor: "white",
                      }}
                    >
                      <MapPin color="white" size={16} />
                    </View>
                  </Marker>
                ))}
              </React.Fragment>
            );
          })}
        </MapView>
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

      {/* Container de linhas selecionadas */}
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
