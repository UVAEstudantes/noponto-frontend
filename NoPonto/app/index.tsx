import Filtro from "@/src/components/mapaComponents/filtro";
import LinhasContainer, {
  PROXIMO_SENTIDO,
} from "@/src/components/mapaComponents/linhasContainer";
import ParadaSheet, {
  ChegadaParadaInfo,
  LinhaParadaInfo,
} from "@/src/components/mapaComponents/paradaSheet";
import MapaOSM from "@/src/components/mapOSM/mapOSM";
import { MapaOSMRef } from "@/src/components/mapOSM/types";
import SearchSections from "@/src/components/searchSections";
import BuscaMapa from "@/src/components/mapaComponents/buscaMapa";
import MapControls from "@/src/components/mapaComponents/mapControls";
import {
  LinhaSelecionadaInfo,
  useMobilidadeRio,
} from "@/src/hooks/useMobilidadeRio";
import { useTema } from "@/src/hooks/useTema";
import { useRailRealtime } from "@/src/hooks/useRailRealtime";
import type { RailVehicleForMap } from "@/src/services/railRealtime";
import { buscarOpcoesPorNome, buscarSugestoesBusca } from "@/src/services/mobilidadeRio";
import {
  buscarEventosParada,
  filtrarEventosPorContexto,
  localizarVeiculoDoEvento,
  rotuloQualidadeEvento,
  type EventoParadaDto,
} from "@/src/services/eventosParada";
import {
  carregarLinhasSalvas,
  carregarModalSelecionado,
  salvarLinhas,
  salvarModalSelecionado,
} from "@/src/services/storage";
import {
  ModalApiTransporte,
  ModoSentido,
  ModalTransporteDto,
  OpcaoBusca,
  Parada,
} from "@/src/types/transporte";
import {
  categoriaLinhaV2,
  CategoriaTransporteV2,
  rotuloSentidoPublico,
} from "@/src/types/estruturaV2";
import { filtrarVeiculosFerroviariosVisiveis } from "@/src/services/veiculosMapa";
import { deveFecharBuscaAoOcultarTeclado } from "@/src/services/searchPresentation";
import { carregarHistoricoBusca, filtrarHistoricoBusca, historicoParaOpcao,
  registrarSelecaoBusca, removerResultadosJaRecentes, type SearchHistoryItem } from "@/src/services/searchHistory";
import { gerarCorAleatoria } from "@/src/utils/cores";
import { assinaturaEstruturalParadas } from "@/src/services/mapStructure";
import {
  getCurrentPositionAsync,
  LocationAccuracy,
  LocationObject,
  requestForegroundPermissionsAsync,
  watchPositionAsync,
} from "expo-location";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Keyboard, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MAX_LINHAS = 10;
const CORES_RAMAIS_TREM: Record<string, string> = {
  deodoro: "#ba0c2f",
  santa_cruz: "#64a70b",
  japeri: "#92c1e9",
  saracuruna: "#de7c00",
  belford_roxo: "#5c068c",
  paracambi: "#00a3e0",
  guapimirim: "#f1b500",
  vila_inhomirim: "#c4b000",
};

const Home = () => {
  const { temaAtual, estiloMapaAtual, preferenciaLateralidade, cores } =
    useTema();
  const insets = useSafeAreaInsets();
  const {
    itinerariosPorId,
    estruturasRealtimePorVersao,
    garantirItinerario,
    removerItinerario,
    getVeiculosPorCodigo,
    veiculos,
  } = useMobilidadeRio();
  const veiculosRef = useRef(veiculos);
  const railVehiclesRef = useRef<RailVehicleForMap[]>([]);
  veiculosRef.current = veiculos;

  // ─── Filtros ──────────────────────────────────────────────────────────────

  const [transito, setTransito] = useState(false);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [modais, setModais] = useState<ModalTransporteDto[]>([]);
  const [modalSelecionadoId, setModalSelecionadoId] =
    useState<CategoriaTransporteV2>("onibus");

  useEffect(() => {
    setModais([
      { id: "onibus", nome: "Ônibus" },
      { id: "brt", nome: "BRT" },
      { id: "trem", nome: "Trem" },
    ]);
    carregarModalSelecionado().then((salvo) => {
      if (salvo === "onibus" || salvo === "brt" || salvo === "trem")
        setModalSelecionadoId(salvo);
    });
  }, []);

  useEffect(() => {
    if (modalSelecionadoId) salvarModalSelecionado(modalSelecionadoId);
  }, [modalSelecionadoId]);

  // ─── Localização ──────────────────────────────────────────────────────────

  const mapRef = useRef<MapaOSMRef>(null);
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

  const normalizarCodigo = useCallback((valor: string) => {
    return valor.trim().toUpperCase();
  }, []);

  const corRamalTrem = useCallback(
    (nomeExibicao: string) => {
      const n = normalizarNome(nomeExibicao).replace(/\s+/g, "_");
      for (const [ramal, cor] of Object.entries(CORES_RAMAIS_TREM)) {
        if (n.includes(ramal)) return cor;
      }
      return null;
    },
    [normalizarNome],
  );

  useEffect(() => {
    let subscription: any;
    async function startWatching() {
      subscription = await watchPositionAsync(
        {
          accuracy: LocationAccuracy.Highest,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (response) => setLocation(response),
      );
    }
    startWatching();
    return () => subscription?.remove();
  }, []);

  // ─── Busca ────────────────────────────────────────────────────────────────

  const [opcoesBusca, setOpcoesBusca] = useState<OpcaoBusca[]>([]);
  const [busca, setBusca] = useState("");
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [containerAberto, setContainerAberto] = useState(false);
  const selecionandoBuscaRef = useRef(false);
  const [sugestoesBusca, setSugestoesBusca] = useState<string[]>([]);
  const [historicoBusca, setHistoricoBusca] = useState<SearchHistoryItem[]>([]);
  const [carregandoBusca, setCarregandoBusca] = useState(false);

  const fecharBusca = useCallback(() => {
    setBusca("");
    setOpcoesBusca([]);
    setBuscaAberta(false);
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidHide", () => {
      requestAnimationFrame(() => {
        if (deveFecharBuscaAoOcultarTeclado(selecionandoBuscaRef.current)) fecharBusca();
      });
    });
    return () => subscription.remove();
  }, [fecharBusca]);

  useEffect(() => {
    let active = true;
    setBusca("");
    setOpcoesBusca([]);
    buscarSugestoesBusca(modalSelecionadoId).then((values) => {
      if (active) setSugestoesBusca(values);
    });
    return () => { active = false; };
  }, [modalSelecionadoId]);
  useEffect(() => { carregarHistoricoBusca().then(setHistoricoBusca); }, [buscaAberta]);
  const recentesItens = useMemo(() => filtrarHistoricoBusca(historicoBusca,
    modalSelecionadoId, busca, 3), [historicoBusca, modalSelecionadoId, busca]);
  const recentesBusca = useMemo(() => recentesItens.map(historicoParaOpcao), [recentesItens]);
  const resultadosSemRecentes = useMemo(() => removerResultadosJaRecentes(opcoesBusca,
    recentesItens), [opcoesBusca, recentesItens]);

  useEffect(() => {
    if (!busca.trim()) {
      setOpcoesBusca([]);
      setCarregandoBusca(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const id = setTimeout(async () => {
      if (active) setCarregandoBusca(true);
      try {
        const opcoes = await buscarOpcoesPorNome(
          busca,
          1,
          20,
          modalSelecionadoId ?? undefined,
          controller.signal,
        );
        if (active) setOpcoesBusca(opcoes);
      } catch (err) {
        console.error("Erro ao buscar opções:", err);
        if (active) setOpcoesBusca([]);
      } finally { if (active) setCarregandoBusca(false); }
    }, 600);
    return () => { active = false; controller.abort(); clearTimeout(id); };
  }, [busca, modalSelecionadoId]);

  // ─── Linhas selecionadas ──────────────────────────────────────────────────

  const [linhasSelecionadas, setLinhasSelecionadas] = useState<
    LinhaSelecionadaInfo[]
  >([]);
  const [linhasHidratadas, setLinhasHidratadas] = useState(false);

  useEffect(() => {
    let ativo = true;
    carregarLinhasSalvas().then((salvas) => {
      if (!ativo) return;
      if (Array.isArray(salvas) && salvas.length > 0)
        setLinhasSelecionadas(salvas);
      setLinhasHidratadas(true);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const obterParadasLinha = useCallback(
    (linha: LinhaSelecionadaInfo) => {
      const itinerario = itinerariosPorId[linha.linhaId];
      if (!itinerario) return [] as Parada[];
      const sentidos = [...new Set(itinerario.padroesV2?.map((p) => p.sentidoId) ?? [])];
      const sentidoId = linha.modoSentido === "ida" ? sentidos[0]
        : linha.modoSentido === "volta" ? sentidos[1] : undefined;
      const padroes = sentidoId
        ? itinerario.padroesV2?.filter((p) => p.sentidoId === sentidoId) ?? []
        : itinerario.padroesV2 ?? [];
      return padroes.flatMap((p) => p.paradas);
    },
    [itinerariosPorId],
  );

  const contextoEventosParada = useMemo(() => ({
    linhas: linhasSelecionadas
      .filter((linha) => linha.ativa && linha.modal === modalSelecionadoId)
      .map((linha) => {
        const estrutura = itinerariosPorId[linha.linhaId];
        const sentidos = [...new Set(
          estrutura?.padroesV2?.map((padrao) => padrao.sentidoId) ?? [],
        )];
        const sentidoId = linha.modoSentido === "ida" ? sentidos[0]
          : linha.modoSentido === "volta" ? sentidos[1] : undefined;
        const padroesEstruturais = (estrutura?.padroesV2 ?? [])
          .filter((padrao) => !sentidoId || padrao.sentidoId === sentidoId)
          .map((padrao) => padrao.padraoVersaoId);
        const padroesRealtime = Object.values(estruturasRealtimePorVersao)
          .filter((item) => item.linhaId === linha.linhaId)
          .filter((item) => !sentidoId || item.sentidoId === sentidoId)
          .map((item) => item.padraoVersaoId);
        return {
          linhaId: linha.linhaId,
          padraoVersaoIds: [...new Set([...padroesEstruturais, ...padroesRealtime])],
        };
      }),
  }), [
    linhasSelecionadas,
    itinerariosPorId,
    estruturasRealtimePorVersao,
    modalSelecionadoId,
  ]);

  useEffect(() => {
    if (linhasHidratadas) salvarLinhas(linhasSelecionadas);
  }, [linhasHidratadas, linhasSelecionadas]);

  useEffect(() => {
    linhasSelecionadas.forEach((l) => {
      garantirItinerario(l.linhaId, l.linhaCodigo, l.modal, l.mostrarParadas);
    });
  }, [linhasSelecionadas, garantirItinerario]);

  const selecionarOpcao = useCallback(
    async (opcao: OpcaoBusca) => {
      const { linha, nomeExibicao } = opcao;
      const linhaCodigo = linha.codigo || linha.nome;
      const modal = categoriaLinhaV2({
        tipoRota: linha.tipoRota ?? "",
        modal: linha.modal ?? "",
      }) as ModalApiTransporte;
      registrarSelecaoBusca(linha, modal).then(setHistoricoBusca);

      setLinhasSelecionadas((prev) => {
        if (
          prev.some((l) => l.linhaId === linha.id) ||
          prev.length >= MAX_LINHAS
        ) {
          return prev;
        }
        const cor =
          modal === "trem"
            ? (corRamalTrem(nomeExibicao) ??
              gerarCorAleatoria(prev.map((l) => l.cor)))
            : gerarCorAleatoria(prev.map((l) => l.cor));
        return [
          ...prev,
          {
            linhaId: linha.id,
            linhaCodigo,
            nomeExibicao,
            subtitulo: opcao.displaySubtitle,
            modal,
            cor,
            ativa: true,
            modoSentido: "ambos",
            mostrarParadas: false,
          },
        ];
      });

      try {
        const itinerario = await garantirItinerario(
          linha.id,
          linhaCodigo,
          modal,
          false,
        );
        if (
          itinerario &&
          (itinerario.segmentos[0]?.length ?? 0) > 1 &&
          mapRef.current?.fitToCoordinates
        ) {
          const coordenadas = itinerario.segmentos[0].map(
            ([latitude, longitude]) => ({
              latitude,
              longitude,
            }),
          );
          setTimeout(() => mapRef.current?.fitToCoordinates(coordenadas), 350);
        }
      } catch (err) {
        console.error("Erro ao buscar itinerário após seleção:", err);
      } finally {
        selecionandoBuscaRef.current = false;
        fecharBusca();
      }
    },
    [fecharBusca, garantirItinerario, corRamalTrem],
  );

  const removerLinha = useCallback(
    (linhaId: string) => {
      const linha = linhasSelecionadas.find((l) => l.linhaId === linhaId);
      if (linha) removerItinerario(linhaId, linha.linhaCodigo);
      setLinhasSelecionadas((prev) =>
        prev.filter((l) => l.linhaId !== linhaId),
      );
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
  const selecionarSentido = useCallback((linhaId: string, modoSentido: ModoSentido) => {
    setLinhasSelecionadas((prev) => prev.map((linha) =>
      linha.linhaId === linhaId ? { ...linha, modoSentido } : linha));
  }, []);

  const toggleParadas = useCallback((linhaId: string) => {
    setLinhasSelecionadas((prev) =>
      prev.map((l) =>
        l.linhaId === linhaId ? { ...l, mostrarParadas: !l.mostrarParadas } : l,
      ),
    );
  }, []);

  const atualizarCorLinha = useCallback((linhaId: string, cor: string) => {
    setLinhasSelecionadas((prev) =>
      prev.map((l) => (l.linhaId === linhaId ? { ...l, cor } : l)),
    );
  }, []);
  const toggleContainer = useCallback(() => setContainerAberto((p) => !p), []);
  const selecionarModalPainel = useCallback((id: string) => {
    if (id === "onibus" || id === "brt" || id === "trem") setModalSelecionadoId(id);
  }, []);

  // ─── Paradas ──────────────────────────────────────────────────────────────

  const linhasNaParada = useMemo<LinhaParadaInfo[]>(() => {
    if (!paradaSelecionada) return [];
    const alvoId = paradaSelecionada.paradaId;

    const linhasAtivas = new Set(
      contextoEventosParada.linhas.map((linha) => linha.linhaId),
    );
    return linhasSelecionadas
      .filter((linha) => linhasAtivas.has(linha.linhaId))
      .map((l) => {
        const paradas = obterParadasLinha(l);
        if (paradas.length === 0) return null;
        const possui = paradas.some((p) => p.paradaId === alvoId);
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
    obterParadasLinha,
    contextoEventosParada,
  ]);

  const [chegadasParada, setChegadasParada] = useState<ChegadaParadaInfo[]>([]);
  const eventosParadaRef = useRef(new Map<string, EventoParadaDto>());
  const [carregandoChegadas, setCarregandoChegadas] = useState(false);
  const [erroChegadas, setErroChegadas] = useState<string | null>(null);
  const [atualizadoChegadasEm, setAtualizadoChegadasEm] = useState<
    number | null
  >(null);

  const atualizarChegadas = useCallback(async () => {
    if (!paradaSelecionada) {
      setChegadasParada([]);
      setAtualizadoChegadasEm(null);
      return;
    }
    setCarregandoChegadas(true);
    setErroChegadas(null);
    try {
      const lista = await buscarEventosParada(paradaSelecionada.paradaId);
      const listaContextual = filtrarEventosPorContexto(
        lista,
        contextoEventosParada,
      );
      eventosParadaRef.current = new Map(
        listaContextual.map((evento) => [evento.eventId, evento]),
      );
      const mapaLinhas = new Map(
        linhasNaParada.map((l) => [normalizarCodigo(l.codigo), l]),
      );
      const filtrados = listaContextual
        .map((v) => {
          const info = mapaLinhas.get(normalizarCodigo(v.codigoLinha));
          const referencia = localizarVeiculoDoEvento(
            v,
            veiculosRef.current,
            railVehiclesRef.current,
          );
          const trem = v.modal === "trem" ? railVehiclesRef.current.find((vehicle) =>
            (v.railVehicleId && vehicle.railVehicleId === v.railVehicleId)
            || (v.expectedRunId && vehicle.railRunId === v.expectedRunId)) : undefined;
          return {
            id: v.eventId,
            linhaId: v.linhaId,
            codigo: normalizarCodigo(v.codigoLinha),
            cor: info?.cor ?? "#94a3b8",
            assinada: Boolean(info),
            ordem: v.codigoVeiculo ?? v.trainCode ?? undefined,
            eventType: v.eventType,
            nextVehiclesMode: v.nextVehiclesMode
              ?? (v.eventType === "DEPARTURE" ? "Departures" : "Arrivals"),
            referenciaDisponivel: referencia != null,
            qualidade: rotuloQualidadeEvento(v),
            etaSeg: v.secondsUntilEvent ?? null,
            distanciaMetros: v.distanciaRestanteMetros ?? null,
            horarioPrevistoLocal: (v.estimatedAt ?? v.scheduledAt)
              ? new Date(v.estimatedAt ?? v.scheduledAt!).toLocaleTimeString(
                  "pt-BR",
                  { hour: "2-digit", minute: "2-digit" },
                )
              : null,
            confianca: null,
            status: null,
            proximaParadaNome: null,
            destino: trem?.destinationName ?? trem?.destination ?? null,
            tipoServico: trem?.trainType ?? null,
            plataforma: trem?.platformLabel ?? trem?.platform ?? null,
          } as ChegadaParadaInfo;
        })
        .sort((a, b) => {
          const ea = a.etaSeg ?? Number.POSITIVE_INFINITY;
          const eb = b.etaSeg ?? Number.POSITIVE_INFINITY;
          return ea - eb;
        });
      setChegadasParada(filtrados);
      setAtualizadoChegadasEm(Date.now());
    } catch (err) {
      console.error("Erro ao buscar chegadas:", err);
      setChegadasParada([]);
      setErroChegadas(
        err instanceof Error ? err.message : "Não foi possível carregar os eventos.",
      );
    } finally {
      setCarregandoChegadas(false);
    }
  }, [
    paradaSelecionada,
    linhasNaParada,
    normalizarCodigo,
    contextoEventosParada,
  ]);

  useEffect(() => {
    if (!paradaSelecionada) {
      setChegadasParada([]);
      setAtualizadoChegadasEm(null);
      return;
    }
    atualizarChegadas();
  }, [paradaSelecionada, linhasNaParada, atualizarChegadas]);

  useEffect(() => {
    if (paradaExpandida) atualizarChegadas();
  }, [paradaExpandida, atualizarChegadas]);

  const focarVeiculoNaParada = useCallback((chegada: ChegadaParadaInfo) => {
    const evento = eventosParadaRef.current.get(chegada.id);
    if (!evento) return;
    const referencia = localizarVeiculoDoEvento(
      evento,
      veiculosRef.current,
      railVehiclesRef.current,
    );
    if (!referencia) return;
    setParadaSelecionada(null);
    setParadaExpandida(false);
    mapRef.current?.focarVeiculo({ ...referencia, zoom: 17 });
  }, []);

  const sentidosPorLinha = useMemo(() => {
    const mapa: Record<string, { ida?: string; volta?: string }> = {};
    Object.keys(itinerariosPorId).forEach((linhaId) => {
      const itinerario = itinerariosPorId[linhaId];
      if (!itinerario?.itinerarioSentidoMap) return;
      const nomes = [...new Map(
        (itinerario.padroesV2 ?? []).map((p) => [p.sentidoId, p.sentidoNome]),
      ).values()];
      const ida = nomes[0];
      const volta = nomes[1];
      if (ida || volta) mapa[linhaId] = { ida, volta };
    });
    return mapa;
  }, [itinerariosPorId]);

  // ─── Dados para o mapa ────────────────────────────────────────────────────

  const modalSelecionadoNome = modalSelecionadoId;

  const linhasSelecionadasFiltradas = useMemo(
    () =>
      linhasSelecionadas.filter(
        (l) => !modalSelecionadoId || modalSelecionadoNome === l.modal,
      ),
    [linhasSelecionadas, modalSelecionadoId, modalSelecionadoNome],
  );

  const railLinhaId = useMemo(() => {
    const ativas = linhasSelecionadasFiltradas.filter((linha) => linha.ativa);
    return ativas.length === 1 ? ativas[0].linhaId : undefined;
  }, [linhasSelecionadasFiltradas]);
  const railDemoPadroes = useMemo(
    () =>
      linhasSelecionadasFiltradas.flatMap((linha) => {
        const itinerario = itinerariosPorId[linha.linhaId];
        return (itinerario?.padroesV2 ?? []).map((p) => p.padraoVersaoId);
      }),
    [linhasSelecionadasFiltradas, itinerariosPorId],
  );
  const railVehicles = useRailRealtime({
    enabled: modalSelecionadoNome === "trem",
    linhaId: railLinhaId,
    demoPadraoVersaoIds: railDemoPadroes,
  });
  railVehiclesRef.current = railVehicles;

  const dadosParaMapa = useMemo(
    () =>
      linhasSelecionadasFiltradas
        .filter((l) => l.ativa)
        .map((l) => {
          const itinerario = itinerariosPorId[l.linhaId];
          const segmentos = itinerario?.segmentos ?? [];

          const sentidoIds = [...new Set(itinerario?.padroesV2?.map((p) => p.sentidoId) ?? [])];
          const sentidoIdFiltro = l.modoSentido === "ida" ? sentidoIds[0]
            : l.modoSentido === "volta" ? sentidoIds[1] : undefined;
          const padroesVisiveis = sentidoIdFiltro
            ? itinerario?.padroesV2?.filter((p) => p.sentidoId === sentidoIdFiltro) ?? []
            : itinerario?.padroesV2 ?? [];
          const padroesVersoesVisiveis = new Set(
            padroesVisiveis.map((padrao) => padrao.padraoVersaoId),
          );

          const veiculos = getVeiculosPorCodigo(
            l.linhaCodigo,
            padroesVersoesVisiveis,
          );
          const paradas = l.mostrarParadas ? obterParadasLinha(l) : [];

          const geometriasVisiveis = padroesVisiveis.map((padrao) => ({
            padraoVersaoId: padrao.padraoVersaoId,
            sentidoId: padrao.sentidoId,
            sentidoNome: padrao.sentidoNome,
            coordenadas: segmentos[padrao.segmentoIndice],
          }));
          Object.values(estruturasRealtimePorVersao)
            .filter((estrutura) => estrutura.linhaId === l.linhaId)
            .filter((estrutura) => !sentidoIdFiltro || estrutura.sentidoId === sentidoIdFiltro)
            .forEach((estrutura) => {
              if (geometriasVisiveis.some((item) =>
                item.padraoVersaoId === estrutura.padraoVersaoId)) return;
              geometriasVisiveis.push({
                padraoVersaoId: estrutura.padraoVersaoId,
                sentidoId: estrutura.sentidoId,
                sentidoNome: rotuloSentidoPublico(estrutura),
                coordenadas: estrutura.geometria.coordenadas.map(
                  ([lng, lat]) => [lat, lng],
                ),
              });
            });
          const itinerarioSegmentoMap = Object.fromEntries(
            geometriasVisiveis.map((item, index) => [item.padraoVersaoId, index]),
          );
          const itinerarioSentidoMap = Object.fromEntries(
            geometriasVisiveis.map((item) => [item.padraoVersaoId, item.sentidoNome]),
          );

          return {
            structureKey: [l.linhaId, l.cor, l.modoSentido, l.mostrarParadas,
              assinaturaEstruturalParadas(l.mostrarParadas, paradas),
              ...geometriasVisiveis.map((item) => item.padraoVersaoId)].join(":"),
            nome: l.nomeExibicao,
            descricao: l.subtitulo,
            cor: l.cor,
            modal: l.modal,
            segmentos: geometriasVisiveis.map((item) => item.coordenadas),
            coordenadas: geometriasVisiveis[0]?.coordenadas ?? [],
            paradas,
            mostrarParadas: l.mostrarParadas,
            modoSentido: l.modoSentido,
            itinerarioSegmentoMap,
            itinerarioSentidoMap:
              Object.keys(itinerarioSentidoMap).length > 0
                ? itinerarioSentidoMap
                : undefined,
            posicoes: veiculos.map((v) => ({
              id: v.id,
              idVisual: v.idVisual,
              runtime: v.runtime,
              ordem: v.id,
              latitude: v.latitude,
              longitude: v.longitude,
              direcao: v.direcao,
              velocidade: v.velocidade,
              velocidadeMedia: v.velocidadeMedia ?? null,
              sentidoNome:
                v.padraoVersaoId && itinerarioSentidoMap[v.padraoVersaoId]
                  ? itinerarioSentidoMap[v.padraoVersaoId]
                  : undefined,
              timestamp: v.timestamp,
              proximaParadaNome: v.proximaParadaNome ?? null,
              distanciaProximaParadaMetros:
                v.distanciaProximaParadaMetros ?? null,
              status: v.status ?? 0,
              posicaoNaRota: v.posicaoNaRota ?? null,
              comprimentoRotaMetros: v.comprimentoRotaMetros ?? null,
              linhaId: v.linhaId,
              sentidoId: v.sentidoId,
              padraoOperacionalId: v.padraoOperacionalId,
              padraoVersaoId: v.padraoVersaoId,
              proximaOcorrenciaParadaPadraoId:
                v.proximaOcorrenciaParadaPadraoId,
              tipoRota: l.modal,
              atualizadoEm: v.atualizadoEm,
              fontePosicao: v.fontePosicao,
              qualidadePosicao: v.qualidadePosicao,
            })),
          };
        }),
    [
      linhasSelecionadasFiltradas,
      itinerariosPorId,
      estruturasRealtimePorVersao,
      getVeiculosPorCodigo,
      obterParadasLinha,
    ],
  );

  const railVehiclesVisiveis = useMemo(() => {
    const filtros = linhasSelecionadasFiltradas
      .filter((linha) => linha.ativa)
      .map((linha) => {
        const padroes = itinerariosPorId[linha.linhaId]?.padroesV2 ?? [];
        const sentidos = [...new Set(padroes.map((padrao) => padrao.sentidoId))];
        const sentidoId = linha.modoSentido === "ida" ? sentidos[0]
          : linha.modoSentido === "volta" ? sentidos[1] : undefined;
        return {
          linhaId: linha.linhaId,
          sentidoId,
          versoes: new Set(
            padroes
              .filter((padrao) => !sentidoId || padrao.sentidoId === sentidoId)
              .map((padrao) => padrao.padraoVersaoId),
          ),
        };
      });
    return filtrarVeiculosFerroviariosVisiveis(
      railVehicles,
      filtros.map((filtro) => ({
        linhaId: filtro.linhaId,
        sentidoId: filtro.sentidoId,
        padraoVersaoIds: filtro.versoes,
      })),
    );
  }, [railVehicles, linhasSelecionadasFiltradas, itinerariosPorId]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundoApp }}>
      <MapaOSM
        ref={mapRef}
        location={location}
        linhasParaMostrar={dadosParaMapa}
        railVehicles={railVehiclesVisiveis}
        showTraffic={transito}
        darkMode={temaAtual === "escuro"}
        estiloMapa={estiloMapaAtual}
        onStopPress={(parada) => {
          setParadaSelecionada(parada);
          setParadaExpandida(false);
        }}
      />

      {buscaAberta && (
        <View style={{ position: "absolute", top: insets.top + 12, left: 12, right: 12, zIndex: 20,
          borderRadius: 18, overflow: "hidden", backgroundColor: cores.fundoCard,
          borderWidth: 0, shadowColor: "#000", shadowOpacity: 0.14,
          shadowRadius: 12, elevation: 8 }}>
          <BuscaMapa embedded value={busca} onChangeText={setBusca} onClose={fecharBusca}
            placeholderSuggestions={sugestoesBusca} />
          {(recentesBusca.length > 0 || resultadosSemRecentes.length > 0 || carregandoBusca) &&
            <SearchSections embedded recentes={recentesBusca} resultados={resultadosSemRecentes}
              carregando={carregandoBusca}
              onSelectionStart={() => { selecionandoBuscaRef.current = true; }}
              onSelect={selecionarOpcao} />}
        </View>
      )}
      <Filtro
        transito={transito}
        clickTransito={() => setTransito((p) => !p)}
        modalSelecionado={modalSelecionadoNome || "onibus"}
        onSelecionarModal={(modalNome) => {
          if (modalNome === "onibus" || modalNome === "brt" || modalNome === "trem")
            setModalSelecionadoId(modalNome);
        }}
        aberto={filtroAberto}
        onToggle={() => setFiltroAberto(false)}
        lateralidade={preferenciaLateralidade}
      />
      <MapControls
        lateralidade={preferenciaLateralidade}
        modalAtivo={modalSelecionadoNome}
        location={location}
        mapRef={mapRef}
        onOpenLines={() => setContainerAberto(true)}
        onOpenSearch={() => setBuscaAberta(true)}
        onOpenFilter={() => setFiltroAberto(true)}
        disabled={filtroAberto || Boolean(paradaSelecionada) || containerAberto}
      />
      <LinhasContainer
        linhasSelecionadas={linhasSelecionadasFiltradas}
        aoRemoverLinha={removerLinha}
        aoToggleAtiva={toggleAtiva}
        aoToggleSentido={toggleSentido}
        aoSelecionarSentido={selecionarSentido}
        aoToggleParadas={toggleParadas}
        aoAtualizarCor={atualizarCorLinha}
        sentidosPorLinha={sentidosPorLinha}
        aberto={containerAberto}
        aoToggleAberto={toggleContainer}
        modalAtivo={modalSelecionadoNome}
        mostrarBotaoToggle={false}
        opcoesModal={modais}
        modalSelecionadoId={modalSelecionadoId}
        aoSelecionarModal={selecionarModalPainel}
      />

      <ParadaSheet
        visivel={!!paradaSelecionada}
        parada={paradaSelecionada}
        linhas={linhasNaParada}
        chegadas={chegadasParada}
        carregandoChegadas={carregandoChegadas}
        erroChegadas={erroChegadas}
        atualizadoEm={atualizadoChegadasEm}
        onAtualizar={atualizarChegadas}
        onFocarVeiculo={focarVeiculoNaParada}
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
