import InputBusca from "@/src/components/inputBusca";
import { useTema } from "@/src/hooks/useTema";
import Filtro from "@/src/components/mapaComponents/filtro";
import LinhasContainer from "@/src/components/mapaComponents/linhasContainer";
import LocalButton from "@/src/components/mapaComponents/localButton";
import RotaButton from "@/src/components/mapaComponents/rotaButton";
import MapaOSM, { MapaOSMRef } from "@/src/components/mapOSM";
import ResultadoBusca from "@/src/components/resultadoBusca";
import { useMobilidadeRio } from "@/src/hooks/useMobilidadeRio";
import { chaveLinhaModal } from "@/src/services/mobilidadeRio";
import { LinhaTempoReal, ModalApiTransporte } from "@/src/types/transporte";
import { gerarCorAleatoria } from "@/src/utils/cores";
import {
  getCurrentPositionAsync,
  LocationAccuracy,
  LocationObject,
  requestForegroundPermissionsAsync,
  watchPositionAsync,
} from "expo-location";
import { Search } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, Pressable, View } from "react-native";
import { salvarLinhas, carregarLinhasSalvas } from "@/src/services/storage";

const MaxLinhasView = 5;

type LinhaSelecionada = {
  nome: string;
  modal: string;
  cor: string;
  ativa: boolean;
};

function normalizarModalApi(modal: string): ModalApiTransporte | null {
  const valor = modal.trim().toLowerCase();

  if (valor === "onibus") {
    return "onibus";
  }

  if (valor === "brt") {
    return "brt";
  }

  return null;
}

const Home = () => {
  const { temaAtual, estiloMapaAtual, cores } = useTema();
  const {
    linhasDisponiveis,
    itinerariosPorLinha,
    garantirItinerarioLinha,
    getVeiculosLinha,
    getSentidoLinha,
  } = useMobilidadeRio();

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

  const [data, setData] = useState<LinhaTempoReal[]>([]);
  const [busca, setBusca] = useState("");
  const [linhasSelecionadas, setLinhasSelecionadas] = useState<
    LinhaSelecionada[]
  >([]);
  const [containerAberto, setContainerAberto] = useState(false);

  const buscaAtiva = busca !== "" && data.length > 0;

  const buscarLinhas = useCallback(
    (textoBusca: string) => {
      setBusca(textoBusca);
      setContainerAberto(false);

      const modaisSelecionados: string[] = [];
      if (onibus) modaisSelecionados.push("onibus");
      if (brt) modaisSelecionados.push("brt");
      if (trem) modaisSelecionados.push("trem");
      if (metro) modaisSelecionados.push("metro");

      const termo = textoBusca.trim().toLowerCase();
      const usarStartsWith = termo.length <= 1;

      const filtradas = linhasDisponiveis.filter((linha) => {
        const modalMatch = modaisSelecionados.includes(
          linha.modal.toLowerCase(),
        );
        if (!modalMatch) {
          return false;
        }

        if (!termo) {
          return true;
        }

        return usarStartsWith
          ? linha.nome.toLowerCase().startsWith(termo)
          : linha.nome.toLowerCase().includes(termo);
      });

      setData(filtradas);

      filtradas.slice(0, 10).forEach((linha) => {
        void garantirItinerarioLinha(linha.nome, linha.modal);
      });
    },
    [linhasDisponiveis, onibus, brt, trem, metro, garantirItinerarioLinha],
  );

  const listaSelecionada = async (linha: LinhaTempoReal) => {
    setData([]);
    Keyboard.dismiss();

    setLinhasSelecionadas((anterior) => {
      const jaExiste = anterior.some((item) => item.nome === linha.nome);

      if (jaExiste || anterior.length >= MaxLinhasView) {
        return anterior;
      }

      const novaCor = gerarCorAleatoria(anterior.map((item) => item.cor));

      return [
        ...anterior,
        {
          nome: linha.nome,
          modal: linha.modal,
          cor: novaCor,
          ativa: true,
        },
      ];
    });

    const modal = normalizarModalApi(linha.modal);
    if (modal) {
      const itinerario = await garantirItinerarioLinha(linha.nome, modal);
      const primeiroSegmento = itinerario?.segmentos?.[0] ?? [];

      if (primeiroSegmento.length > 1 && mapRef.current?.fitToCoordinates) {
        const coordenadas = primeiroSegmento.map(([latitude, longitude]) => ({
          latitude,
          longitude,
        }));

        setTimeout(() => {
          mapRef.current?.fitToCoordinates(coordenadas);
        }, 350);
      }
    }

    setBusca("");
  };

  const removerLinha = (nome: string) => {
    setLinhasSelecionadas((anterior) =>
      anterior.filter((linha) => linha.nome !== nome),
    );
  };

  const toggleAtiva = (nome: string) => {
    setLinhasSelecionadas((anterior) =>
      anterior.map((linha) =>
        linha.nome === nome ? { ...linha, ativa: !linha.ativa } : linha,
      ),
    );
  };

  const dadosParaMapa = useMemo(
    () =>
      linhasSelecionadas
        .filter((linha) => linha.ativa)
        .map((linha) => {
          const modal = normalizarModalApi(linha.modal);
          if (!modal) {
            return null;
          }

          const chave = chaveLinhaModal(linha.nome, modal);
          const itinerario = itinerariosPorLinha[chave];
          const segmentos = itinerario?.segmentos ?? [];
          const sentidoNomeLinha = getSentidoLinha(linha.nome, modal);

          return {
            nome: linha.nome,
            cor: linha.cor,
            modal,
            segmentos,
            coordenadas: segmentos[0] ?? [],
            posicoes: getVeiculosLinha(linha.nome, modal).map((veiculo) => ({
              id: veiculo.id,
              latitude: veiculo.latitude,
              longitude: veiculo.longitude,
              direcao: veiculo.direcao,
              velocidade: veiculo.velocidade,
              sentido: veiculo.sentido,
              sentidoNome: sentidoNomeLinha,
              trajeto: veiculo.trajeto,
              timestamp: veiculo.timestamp,
            })),
          };
        })
        .filter((linha): linha is NonNullable<typeof linha> => Boolean(linha)),
    [
      linhasSelecionadas,
      itinerariosPorLinha,
      getVeiculosLinha,
      getSentidoLinha,
    ],
  );

  const dadosBuscaComDestino = useMemo(
    () =>
      data.map((linha) => ({
        ...linha,
        sentido: getSentidoLinha(linha.nome, linha.modal),
      })),
    [data, getSentidoLinha],
  );

  useEffect(() => {
    const carregar = async () => {
      const linhas = await carregarLinhasSalvas();
      if (Array.isArray(linhas) && linhas.length > 0) {
        setLinhasSelecionadas(linhas);
      }
    };
    void carregar();
  }, []);

  useEffect(() => {
    void salvarLinhas(linhasSelecionadas);
  }, [linhasSelecionadas]);

  useEffect(() => {
    if (!busca.trim()) {
      setData([]);
      return;
    }

    buscarLinhas(busca);
  }, [linhasDisponiveis, onibus, brt, trem, metro, busca, buscarLinhas]);

  useEffect(() => {
    linhasSelecionadas.forEach((linha) => {
      const modal = normalizarModalApi(linha.modal);
      if (!modal) {
        return;
      }

      void garantirItinerarioLinha(linha.nome, modal);
    });
  }, [linhasSelecionadas, garantirItinerarioLinha]);

  return (
    <View
      className="flex-1 flex-col"
      style={{ backgroundColor: cores.fundoApp }}
    >
      {location && (
        <MapaOSM
          ref={mapRef}
          location={location}
          linhasParaMostrar={dadosParaMapa}
          showTraffic={transito}
          darkMode={temaAtual === "escuro"}
          estiloMapa={estiloMapaAtual}
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
          data={dadosBuscaComDestino}
          listaSelecionada={listaSelecionada}
          className="absolute top-[8rem] !w-3/4 right-[5rem] shadow-lg rounded-2xl z-20"
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
