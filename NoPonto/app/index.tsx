import InputBusca from "@/src/components/inputBusca";
import Filtro from "@/src/components/mapaComponents/filtro";
import LinhasContainer, { PROXIMO_SENTIDO } from "@/src/components/mapaComponents/linhasContainer";
import LocalButton from "@/src/components/mapaComponents/localButton";
import ParadaSheet, {
  ChegadaParadaInfo,
  LinhaParadaInfo,
} from "@/src/components/mapaComponents/paradaSheet";
import RotaButton from "@/src/components/mapaComponents/rotaButton";
import MapaOSM, { MapaOSMRef } from "@/src/components/mapOSM";
import ResultadoBusca from "@/src/components/resultadoBusca";
import { LinhaSelecionadaInfo, useMobilidadeRio } from "@/src/hooks/useMobilidadeRio";
import { useTema } from "@/src/hooks/useTema";
import { buscarOpcoesPorNome } from "@/src/services/mobilidadeRio";
import { carregarLinhasSalvas, salvarLinhas } from "@/src/services/storage";
import { ModalApiTransporte, OpcaoBusca, Parada } from "@/src/types/transporte";
import { gerarCorAleatoria } from "@/src/utils/cores";
import {
  getCurrentPositionAsync,
  LocationAccuracy,
  LocationObject,
  requestForegroundPermissionsAsync,
  watchPositionAsync,
} from "expo-location";
import { Search } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, View } from "react-native";

const MAX_LINHAS = 5;

const Home = () => {
  const { temaAtual, estiloMapaAtual, cores } = useTema();
  const {
    itinerariosPorId,
    garantirItinerario,
    removerItinerario,
    getVeiculosPorCodigo,
  } = useMobilidadeRio();

  // ─── Filtros ──────────────────────────────────────────────────────────────

  const [transito, setTransito] = React.useState(false);
  const [onibus, setOnibus] = React.useState(true);
  const [brt, setBrt] = React.useState(false);
  const [trem, setTrem] = React.useState(false);
  const [metro, setMetro] = React.useState(false);

  // ─── Localização ──────────────────────────────────────────────────────────

  const mapRef = React.useRef<MapaOSMRef>(null);
  const [location, setLocation] = useState<LocationObject | null>(null);

  const [paradaSelecionada, setParadaSelecionada] = useState<Parada | null>(
    null,
  );
  const [paradaExpandida, setParadaExpandida] = useState(false);

  useEffect(() => {
    async function requestLocationPermissions() {
      const { granted } = await requestForegroundPermissionsAsync();
      if (granted) {
        const loc = await getCurrentPositionAsync();
        setLocation(loc);
      }
    }
    requestLocationPermissions();
  }, []);

  const normalizarNome = useCallback((valor: string) => {
    return valor
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  useEffect(() => {
    let subscription: any;
    async function startWatching() {
      subscription = await watchPositionAsync(
        { accuracy: LocationAccuracy.Highest, timeInterval: 2000, distanceInterval: 5 },
        (response) => setLocation(response),
      );
    }
    startWatching();
    return () => subscription?.remove();
  }, []);

  // ─── Busca ────────────────────────────────────────────────────────────────

  const [opcoesBusca, setOpcoesBusca] = useState<OpcaoBusca[]>([]);
  const [busca, setBusca] = useState("");
  const [containerAberto, setContainerAberto] = useState(false);

  const buscaAtiva = busca !== "" && opcoesBusca.length > 0;

  useEffect(() => {
    if (!busca.trim()) {
      setOpcoesBusca([]);
      return;
    }

    const id = setTimeout(async () => {
      try {
        const opcoes = await buscarOpcoesPorNome(busca, 1, 20);
        setOpcoesBusca(opcoes);
      } catch (err) {
        console.error("Erro ao buscar opções:", err);
        setOpcoesBusca([]);
      }
    }, 600);

    return () => clearTimeout(id);
  }, [busca]);

  // ─── Linhas selecionadas ──────────────────────────────────────────────────

  const [linhasSelecionadas, setLinhasSelecionadas] = useState<LinhaSelecionadaInfo[]>([]);

  useEffect(() => {
    carregarLinhasSalvas().then((salvas) => {
      if (Array.isArray(salvas) && salvas.length > 0) {
        setLinhasSelecionadas(salvas);
      }
    });
  }, []);

  useEffect(() => {
    salvarLinhas(linhasSelecionadas);
  }, [linhasSelecionadas]);

  useEffect(() => {
    linhasSelecionadas.forEach((l) => {
      garantirItinerario(l.linhaId, l.linhaCodigo, l.modal);
    });
  }, [linhasSelecionadas, garantirItinerario]);

  const selecionarOpcao = useCallback(
    async (opcao: OpcaoBusca) => {
      setOpcoesBusca([]);
      setBusca("");
      Keyboard.dismiss();

      const { linha, nomeExibicao } = opcao;
      const linhaCodigo = linha.codigo || linha.nome;
      const modal: ModalApiTransporte = "onibus";

      setLinhasSelecionadas((prev) => {
        if (prev.some((l) => l.linhaId === linha.id) || prev.length >= MAX_LINHAS) {
          return prev;
        }

        const cor = gerarCorAleatoria(prev.map((l) => l.cor));

        return [
          ...prev,
          {
            linhaId: linha.id,
            linhaCodigo,
            nomeExibicao,
            modal,
            cor,
            ativa: true,
            modoSentido: "ambos",
            mostrarParadas: false,
          },
        ];
      });

      try {
        const itinerario = await garantirItinerario(linha.id, linhaCodigo, modal);

        if (
          itinerario &&
          (itinerario.segmentos[0]?.length ?? 0) > 1 &&
          mapRef.current?.fitToCoordinates
        ) {
          const coordenadas = itinerario.segmentos[0].map(([latitude, longitude]) => ({
            latitude,
            longitude,
          }));
          setTimeout(() => mapRef.current?.fitToCoordinates(coordenadas), 350);
        }
      } catch (err) {
        console.error("Erro ao buscar itinerário após seleção:", err);
      }
    },
    [garantirItinerario],
  );

  const removerLinha = useCallback(
    (linhaId: string) => {
      const linha = linhasSelecionadas.find((l) => l.linhaId === linhaId);
      if (linha) removerItinerario(linhaId, linha.linhaCodigo);
      setLinhasSelecionadas((prev) => prev.filter((l) => l.linhaId !== linhaId));
    },
    [linhasSelecionadas, removerItinerario],
  );

  const toggleAtiva = useCallback((linhaId: string) => {
    setLinhasSelecionadas((prev) =>
      prev.map((l) => (l.linhaId === linhaId ? { ...l, ativa: !l.ativa } : l)),
    );
  }, []);

  const toggleSentido = useCallback((linhaId: string) => {
    setLinhasSelecionadas((prev) =>
      prev.map((l) =>
        l.linhaId === linhaId
          ? { ...l, modoSentido: PROXIMO_SENTIDO[l.modoSentido] }
          : l,
      ),
    );
  }, []);

  const toggleParadas = useCallback((linhaId: string) => {
    setLinhasSelecionadas((prev) =>
      prev.map((l) =>
        l.linhaId === linhaId ? { ...l, mostrarParadas: !l.mostrarParadas } : l,
      ),
    );
  }, []);

  // ─── Paradas selecionadas ────────────────────────────────────────────────

  const linhasNaParada = useMemo<LinhaParadaInfo[]>(() => {
    if (!paradaSelecionada) return [];
    const alvoId = paradaSelecionada.paradaId;
    const alvoNome = normalizarNome(paradaSelecionada.nome);

    return linhasSelecionadas
      .map((l) => {
        const paradas = itinerariosPorId[l.linhaId]?.paradas ?? [];
        if (paradas.length === 0) return null;
        const possui = paradas.some(
          (p) => p.paradaId === alvoId || normalizarNome(p.nome) === alvoNome,
        );
        if (!possui) return null;
        return {
          linhaId: l.linhaId,
          codigo: l.linhaCodigo,
          nomeExibicao: l.nomeExibicao,
          cor: l.cor,
          ativa: l.ativa,
        };
      })
      .filter(Boolean) as LinhaParadaInfo[];
  }, [
    paradaSelecionada,
    linhasSelecionadas,
    itinerariosPorId,
    normalizarNome,
  ]);

  const chegadasPorLinha = useMemo<ChegadaParadaInfo[]>(() => {
    if (!paradaSelecionada) return [];
    const alvo = normalizarNome(paradaSelecionada.nome);

    return linhasNaParada.map((l) => {
        const veiculos = getVeiculosPorCodigo(l.codigo);
        let melhorEta: number | null = null;
        let melhorDist: number | null = null;

        veiculos.forEach((v) => {
          const nome = v.proximaParadaNome
            ? normalizarNome(v.proximaParadaNome)
            : null;
          if (!nome || nome !== alvo) return;

          const dist = v.distanciaProximaParadaMetros ?? null;
          const velocidade = v.velocidadeMedia ?? v.velocidade;

          if (dist != null && velocidade && velocidade > 1) {
            const eta = Math.round(
              dist / ((velocidade * 1000) / 3600),
            );
            if (melhorEta == null || eta < melhorEta) {
              melhorEta = eta;
              melhorDist = dist;
            }
          } else if (melhorEta == null) {
            melhorDist = dist;
          }
        });

        return {
          linhaId: l.linhaId,
          codigo: l.codigo,
          cor: l.cor,
          etaSeg: melhorEta,
          distanciaMetros: melhorDist,
        };
      });
  }, [paradaSelecionada, linhasNaParada, getVeiculosPorCodigo, normalizarNome]);

  // ─── Dados para o mapa ────────────────────────────────────────────────────

  const dadosParaMapa = useMemo(
    () =>
      linhasSelecionadas
        .filter((l) => l.ativa)
        .map((l) => {
          const itinerario = itinerariosPorId[l.linhaId];
          const segmentos = itinerario?.segmentos ?? [];

          let itinerarioIdFiltro: string | null = null;
          if (l.modoSentido === "ida") {
            itinerarioIdFiltro = itinerario?.itinerarioIdIda ?? null;
          } else if (l.modoSentido === "volta") {
            itinerarioIdFiltro = itinerario?.itinerarioIdVolta ?? null;
          }

          const veiculos = getVeiculosPorCodigo(l.linhaCodigo, itinerarioIdFiltro);

          // Mapa itinerarioId → índice do segmento para o dead reckoning
          const itinerarioSegmentoMap: Record<string, number> = {};
          if (itinerario?.itinerarioIdIda) {
            itinerarioSegmentoMap[itinerario.itinerarioIdIda] = 0;
          }
          if (itinerario?.itinerarioIdVolta) {
            itinerarioSegmentoMap[itinerario.itinerarioIdVolta] = 1;
          }

          return {
            nome: l.nomeExibicao,
            cor: l.cor,
            modal: l.modal,
            segmentos,
            coordenadas: segmentos[0] ?? [],
            paradas: itinerario?.paradas ?? [],
            mostrarParadas: l.mostrarParadas,
            modoSentido: l.modoSentido,
            itinerarioSegmentoMap,  // ← novo
            posicoes: veiculos.map((v) => ({
              id: v.id,
              latitude: v.latitude,
              longitude: v.longitude,
              direcao: v.direcao,
              velocidade: v.velocidade,
              velocidadeMedia: v.velocidadeMedia ?? null,
              sentidoNome: l.nomeExibicao,
              timestamp: v.timestamp,
              proximaParadaNome: v.proximaParadaNome ?? null,
              distanciaProximaParadaMetros: v.distanciaProximaParadaMetros ?? null,
              status: v.status ?? 0,
              posicaoNaRota: v.posicaoNaRota ?? null,           // ← novo
              comprimentoRotaMetros: v.comprimentoRotaMetros ?? null, // ← novo
              itinerarioId: v.itinerarioId ?? null,             // ← novo
            })),
          };
        }),
    [linhasSelecionadas, itinerariosPorId, getVeiculosPorCodigo],
  );

  const dadosBuscaFormatados = useMemo(
    () =>
      opcoesBusca.map((opcao) => ({
        id: opcao.linha.id,
        nome: opcao.nomeExibicao,
        sentido: opcao.linha.nome,
        modal: "onibus" as ModalApiTransporte,
        _opcao: opcao,
      })),
    [opcoesBusca],
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 flex-col" style={{ backgroundColor: cores.fundoApp }}>
      {(
        <MapaOSM
          ref={mapRef}
          location={location}
          linhasParaMostrar={dadosParaMapa}
          showTraffic={transito}
          darkMode={temaAtual === "escuro"}
          estiloMapa={estiloMapaAtual}
          onStopPress={(parada) => {
            setParadaSelecionada(parada);
            setParadaExpandida(false);
          }}
        />
      )}

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
        onChangeText={setBusca}
      />

      {buscaAtiva && (
        <ResultadoBusca
          data={dadosBuscaFormatados}
          listaSelecionada={(item) => selecionarOpcao(item._opcao)}
          className="absolute top-[8rem] !w-3/4 right-[5rem] shadow-lg rounded-2xl z-20"
          maxHeight={400}
        />
      )}

      <Filtro
        transito={transito}
        clickTransito={() => setTransito((p) => !p)}
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
        aoToggleSentido={toggleSentido}
        aoToggleParadas={toggleParadas}
        aberto={containerAberto}
        aoToggleAberto={() => setContainerAberto((p) => !p)}
      />

      <ParadaSheet
        visivel={!!paradaSelecionada}
        parada={paradaSelecionada}
        linhas={linhasNaParada}
        chegadas={chegadasPorLinha}
        expandido={paradaExpandida}
        onToggleExpandir={() => setParadaExpandida((p) => !p)}
        onFechar={() => {
          setParadaSelecionada(null);
          setParadaExpandida(false);
        }}
      />
    </View>
  );
};

export default Home;