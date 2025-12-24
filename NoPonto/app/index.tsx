import InputBusca from "@/src/components/inputBusca";
import Filtro from "@/src/components/mapaComponents/filtro";
import LocalButton from "@/src/components/mapaComponents/localButton";
import RotaButton from "@/src/components/mapaComponents/rotaButton";
import ResultadoBusca from "@/src/components/resultadoBusca";
import { mockLinhas } from "@/src/mocks/linhasMocks";
import {
  getCurrentPositionAsync,
  LocationAccuracy,
  LocationObject,
  requestForegroundPermissionsAsync,
  watchPositionAsync,
} from "expo-location";
import { Search } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Keyboard, View } from "react-native";
import MapView from "react-native-maps";

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

  const buscaAtiva = busca !== "" && data.length > 0;

  const buscarLinhas = (text: string) => {
    setBusca(text);

    // Array de modais selecionados
    const modaisSelecionados: string[] = [];
    if (onibus) modaisSelecionados.push("onibus");
    if (brt) modaisSelecionados.push("brt");
    if (trem) modaisSelecionados.push("trem");
    if (metro) modaisSelecionados.push("metro");

    // Se tiver 2 ou menos caracteres, usa startsWith, senão usa includes
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
    setBusca(linha.nome);
    setData([]);
    setLinhaSelecionada(linha);
    Keyboard.dismiss(); // esconde o teclado dps de selecionar uma linha
  };

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
            latitudeDelta: 0.002,
            longitudeDelta: 0.002,
          }}
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
          className="absolute top-[8rem] !w-3/4 right-[5rem] bg-white shadow-lg rounded-2xl"
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
    </View>
  );
};

export default Home;
