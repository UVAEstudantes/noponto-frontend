import { useFavoritos } from "@/src/hooks/useFavoritos";
import { configurarFavoritas, linhasEfetivas, favoritasVisiveis, ehFerroviaria,
  LIMITE_FAVORITAS_VISIVEIS, type ViewModeMapa, type SearchCategoryMapa } from "@/src/services/linhasEfetivas";
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
import RadarParada from "@/src/components/mapaComponents/radarParada";
import { useRadarParada } from "@/src/hooks/useRadarParada";
import { chegadasDoRadar } from "@/src/services/apresentacaoRadar";
import { useIsFocused } from "@react-navigation/native";
import {
  LinhaSelecionadaInfo,
  useMobilidadeRio,
} from "@/src/hooks/useMobilidadeRio";
import { useTema } from "@/src/hooks/useTema";
import { useRailRealtime } from "@/src/hooks/useRailRealtime";
import type { RailVehicleForMap } from "@/src/services/railRealtime";
import { buscarModais, buscarOpcoesPorNome, buscarSugestoesBusca } from "@/src/services/mobilidadeRio";
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
import { Alert, Keyboard, Pressable, Text, View } from "react-native";
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
  const telaAtiva = useIsFocused();
  const { temaAtual, estiloMapaAtual, preferenciaLateralidade, cores } =
    useTema();
  const insets = useSafeAreaInsets();
  const [alturaAreaMapa, setAlturaAreaMapa] = useState<number | null>(null);
  const [radarControlsBottom, setRadarControlsBottom] = useState<number | null>(null);
  const atualizarPosicaoControlesRadar = useCallback((bottom: number | null) => {
    setRadarControlsBottom((anterior) => anterior === bottom ? anterior : bottom);
  }, []);
  const [normalModal, setNormalModal] =
    useState<CategoriaTransporteV2>("onibus");
  const [linhasSelecionadas, setLinhasSelecionadas] = useState<
    LinhaSelecionadaInfo[]
  >([]);
  const [linhasHidratadas, setLinhasHidratadas] = useState(false);
  const favoritos = useFavoritos();
  const [viewMode, setViewMode] = useState<ViewModeMapa>("normal");
  const [searchCategory, setSearchCategory] = useState<SearchCategoryMapa>("onibus");
  const [temporarias, setTemporarias] = useState<Record<string, LinhaSelecionadaInfo>>({});
  const [escolhaFavoritas, setEscolhaFavoritas] = useState<string[] | null>(null);
  const favoritasConfiguradas = useMemo(() => configurarFavoritas(favoritos.linhas, linhasSelecionadas, temporarias),
    [favoritos.linhas, linhasSelecionadas, temporarias]);
  const linhasSelecionadasFiltradas = useMemo(() => linhasEfetivas(viewMode, normalModal,
    linhasSelecionadas, favoritasConfiguradas, escolhaFavoritas),
    [viewMode, normalModal, linhasSelecionadas, favoritasConfiguradas, escolhaFavoritas]);
  const rodoviariasVisiveis = useMemo(() => linhasSelecionadasFiltradas.filter((linha) => linha.ativa && !ehFerroviaria(linha)),
    [linhasSelecionadasFiltradas]);
  const {
    itinerariosPorId,
    estruturasRealtimePorVersao,
    garantirItinerario,
    estadosItinerarios,
    tentarNovamenteItinerarios,
    removerItinerario,
    getVeiculosPorCodigo,
    veiculos,
  } = useMobilidadeRio({ enabled: telaAtiva, linhasRealtime: rodoviariasVisiveis });
  const veiculosRef = useRef(veiculos);
  const railVehiclesRef = useRef<RailVehicleForMap[]>([]);
  veiculosRef.current = veiculos;

  // ─── Modal ativo do mapa ──────────────────────────────────────────────────
  const [modais, setModais] = useState<ModalTransporteDto[]>([]);


  const modalAlteradoPeloUsuario = useRef(false);
  const categoriaAlteradaPeloUsuario = useRef(false);
  const [modalHidratado, setModalHidratado] = useState(false);
  useEffect(() => {
    let ativo = true;
    setModais([
      { id: "onibus", nome: "Ônibus" },
      { id: "brt", nome: "BRT" },
      { id: "trem", nome: "Trem" },
    ]);
    carregarModalSelecionado().then((salvo) => {
      if (!ativo) return;
      if (!modalAlteradoPeloUsuario.current && (salvo === "onibus" || salvo === "brt" || salvo === "trem" || salvo === "metro"))
        setNormalModal(salvo);
      if (!categoriaAlteradaPeloUsuario.current && (salvo === "onibus" || salvo === "brt" || salvo === "trem" || salvo === "metro"))
        setSearchCategory(salvo);
      setModalHidratado(true);
    });
    return () => { ativo = false; };
  }, []);
  useEffect(() => {
    let ativo = true;
    buscarModais().then((catalogo) => {
      if (ativo && catalogo.some((modal) => categoriaLinhaV2({ modal: modal.nome, tipoRota: "" }) === "metro"))
        setModais((prev) => prev.some((modal) => modal.id === "metro") ? prev : [...prev, { id: "metro", nome: "Metrô" }]);
    }).catch((erro) => console.warn("Catálogo de modais temporariamente indisponível", erro));
    return () => { ativo = false; };
  }, []);
  useEffect(() => {
    if (normalModal === "metro" || favoritasConfiguradas.some((linha) => linha.modal === "metro"))
      setModais((prev) => prev.some((modal) => modal.id === "metro") ? prev : [...prev, { id: "metro", nome: "Metrô" }]);
  }, [normalModal, favoritasConfiguradas]);

  useEffect(() => {
    if (modalHidratado) void salvarModalSelecionado(normalModal);
  }, [modalHidratado, normalModal]);

  // ─── Localização ──────────────────────────────────────────────────────────

  const mapRef = useRef<MapaOSMRef>(null);
  const [location, setLocation] = useState<LocationObject | null>(null);
  const [paradaSelecionada, setParadaSelecionada] = useState<Parada | null>(
    null,
  );
  const [paradaExpandida, setParadaExpandida] = useState(false);
  const [paradaDoRadar, setParadaDoRadar] = useState(false);

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
  const [menuModalBuscaAberto, setMenuModalBuscaAberto] = useState(false);
  const [containerAberto, setContainerAberto] = useState(false);
  const adicionarLinhaPendenteRef = useRef(false);
  const [pedidoFocoBusca, setPedidoFocoBusca] = useState(0);
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
    setOpcoesBusca([]);
    buscarSugestoesBusca(searchCategory).then((values) => {
      if (active) setSugestoesBusca(values);
    });
    return () => { active = false; };
  }, [searchCategory]);
  useEffect(() => { carregarHistoricoBusca().then(setHistoricoBusca); }, [buscaAberta]);
  const recentesItens = useMemo(() => filtrarHistoricoBusca(historicoBusca,
    searchCategory, busca, 3), [historicoBusca, searchCategory, busca]);
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
          searchCategory ?? undefined,
          controller.signal,
        );
        if (active) setOpcoesBusca(opcoes);
      } catch (err) {
        console.error("Erro ao buscar opções:", err);
        if (active) setOpcoesBusca([]);
      } finally { if (active) setCarregandoBusca(false); }
    }, 600);
    return () => { active = false; controller.abort(); clearTimeout(id); };
  }, [busca, searchCategory]);

  // ─── Linhas selecionadas ──────────────────────────────────────────────────

  const radar = useRadarParada({ linhas: linhasSelecionadasFiltradas, modal: viewMode === "favoritos" ? "todos" : normalModal,
    itinerarios: itinerariosPorId, realtime: estruturasRealtimePorVersao,
    local: location?.coords ?? null,
    paradaEmDetalhes: paradaDoRadar ? paradaSelecionada?.paradaId : null,
    enabled: telaAtiva && !buscaAberta && !containerAberto });

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
      if (linha.modoSentido !== "ambos" && !sentidoId) return [] as Parada[];
      const padroes = sentidoId
        ? itinerario.padroesV2?.filter((p) => p.sentidoId === sentidoId) ?? []
        : itinerario.padroesV2 ?? [];
      return padroes.flatMap((p) => p.paradas);
    },
    [itinerariosPorId],
  );

  const contextoEventosParada = useMemo(() => ({
    linhas: linhasSelecionadasFiltradas
      .filter((linha) => linha.ativa)
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
          padraoVersaoIds: linha.modoSentido !== "ambos" && !sentidoId ? []
            : [...new Set([...padroesEstruturais, ...padroesRealtime])],
        };
      }).filter((linha) => linha.padraoVersaoIds.length > 0),
  }), [
    linhasSelecionadasFiltradas,
    itinerariosPorId,
    estruturasRealtimePorVersao,
    normalModal,
  ]);

  useEffect(() => {
    if (linhasHidratadas) salvarLinhas(linhasSelecionadas);
  }, [linhasHidratadas, linhasSelecionadas]);

  useEffect(() => {
    linhasSelecionadasFiltradas.filter((l) => l.ativa).forEach((l) => {
      garantirItinerario(l.linhaId, l.linhaCodigo, l.modal, l.mostrarParadas);
    });
  }, [linhasSelecionadasFiltradas, garantirItinerario]);

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
            mostrarParadas: true,
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
      if (linha && !favoritos.linhas.some((item) => item.linhaId === linhaId)) removerItinerario(linhaId, linha.linhaCodigo);
      setLinhasSelecionadas((prev) =>
        prev.filter((l) => l.linhaId !== linhaId),
      );
    },
    [linhasSelecionadas, removerItinerario, favoritos.linhas],
  );

  const atualizarConfiguracao = useCallback((id: string, alterar: (linha: LinhaSelecionadaInfo) => LinhaSelecionadaInfo) => {
    if (linhasSelecionadas.some((linha) => linha.linhaId === id)) {
      setLinhasSelecionadas((prev) => prev.map((linha) => linha.linhaId === id ? alterar(linha) : linha));
    } else {
      const base = favoritasConfiguradas.find((linha) => linha.linhaId === id);
      if (base) setTemporarias((prev) => ({ ...prev, [id]: alterar(prev[id] ?? base) }));
    }
  }, [linhasSelecionadas, favoritasConfiguradas]);
  const toggleAtiva = useCallback((id: string) => atualizarConfiguracao(id, (linha) => ({ ...linha, ativa: !linha.ativa })), [atualizarConfiguracao]);
  const toggleSentido = useCallback((id: string) => atualizarConfiguracao(id, (linha) => ({ ...linha, modoSentido: PROXIMO_SENTIDO[linha.modoSentido] })), [atualizarConfiguracao]);
  const selecionarSentido = useCallback((id: string, modoSentido: ModoSentido) => atualizarConfiguracao(id, (linha) => ({ ...linha, modoSentido })), [atualizarConfiguracao]);
  const toggleParadas = useCallback((id: string) => atualizarConfiguracao(id, (linha) => ({ ...linha, mostrarParadas: !linha.mostrarParadas })), [atualizarConfiguracao]);
  const atualizarCorLinha = useCallback((id: string, cor: string) => atualizarConfiguracao(id, (linha) => ({ ...linha, cor })), [atualizarConfiguracao]);
  const favoritasNoMapa = useMemo(() => favoritasVisiveis(favoritasConfiguradas, escolhaFavoritas),
    [favoritasConfiguradas, escolhaFavoritas]);
  const escolherVisibilidadeFavorita = useCallback((id: string) => {
    const ids = favoritasNoMapa.map((linha) => linha.linhaId);
    if (ids.includes(id)) setEscolhaFavoritas(ids.filter((item) => item !== id));
    else if (ids.length < LIMITE_FAVORITAS_VISIVEIS) setEscolhaFavoritas([...ids, id]);
    else Alert.alert("Limite de favoritas visíveis", "Oculte uma linha para mostrar outra. Seus favoritos serão preservados.");
  }, [favoritasNoMapa]);
  const adicionarFavoritaSelecionadas = useCallback((id: string) => {
    const linha = favoritasConfiguradas.find((item) => item.linhaId === id);
    if (!linha || linhasSelecionadas.some((item) => item.linhaId === id)) return;
    if (linhasSelecionadas.length >= MAX_LINHAS) {
      Alert.alert("Limite de linhas", "Remova uma linha da lista normal antes de adicionar outra."); return;
    }
    setLinhasSelecionadas((prev) => prev.some((item) => item.linhaId === id) || prev.length >= MAX_LINHAS
      ? prev : [...prev, { ...linha }]);
  }, [favoritasConfiguradas, linhasSelecionadas]);
  const toggleContainer = useCallback(() => {
    adicionarLinhaPendenteRef.current = false;
    setContainerAberto((p) => !p);
  }, []);
  const selecionarModalPainel = useCallback((id: string) => {
    if (id === "favoritos") {
      if (viewMode === "favoritos") return;
      categoriaAlteradaPeloUsuario.current = true;
      setViewMode("favoritos"); setSearchCategory("todos"); return;
    }
    if (id === "onibus" || id === "brt" || id === "trem" || id === "metro") {
      modalAlteradoPeloUsuario.current = true;
      setViewMode("normal"); setNormalModal(id);
      // Sair de Favoritos restaura o mapa sem reescrever a categoria escolhida na busca.
      if (viewMode === "normal") { categoriaAlteradaPeloUsuario.current = true; setSearchCategory(id); }
    }
  }, [viewMode]);
  const selecionarCategoriaBusca = useCallback((id: string) => {
    if (id !== "todos" && id !== "onibus" && id !== "brt" && id !== "trem" && id !== "metro") return;
    categoriaAlteradaPeloUsuario.current = true;
    setSearchCategory(id);
    if (viewMode === "normal" && id !== "todos") {
      modalAlteradoPeloUsuario.current = true; setNormalModal(id);
    }
  }, [viewMode]);

  const adicionarLinha = useCallback(() => {
    if (linhasSelecionadas.length >= MAX_LINHAS) {
      Alert.alert("Limite de linhas", `Você pode selecionar até ${MAX_LINHAS} linhas. Remova uma linha para adicionar outra.`);
      return;
    }
    // A busca conserva sua categoria independente da visualização.
    adicionarLinhaPendenteRef.current = true;
    setBuscaAberta(false);
    setContainerAberto(false);
  }, [linhasSelecionadas.length]);

  const aoRecolherLinhas = useCallback(() => {
    if (!adicionarLinhaPendenteRef.current) return;
    adicionarLinhaPendenteRef.current = false;
    setPedidoFocoBusca((pedido) => pedido + 1);
    setBuscaAberta(true);
  }, []);

  // ─── Paradas ──────────────────────────────────────────────────────────────

  const linhasNaParada = useMemo<LinhaParadaInfo[]>(() => {
    if (!paradaSelecionada) return [];
    const alvoId = paradaSelecionada.paradaId;

    const linhasAtivas = new Set(
      contextoEventosParada.linhas.map((linha) => linha.linhaId),
    );
    return linhasSelecionadasFiltradas
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
    linhasSelecionadasFiltradas,
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
    if (paradaDoRadar) return;
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
    paradaDoRadar,
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

  const modalSelecionadoNome = normalModal;

  const ferroviariasVisiveis = useMemo(() => linhasSelecionadasFiltradas.filter((linha) => linha.ativa && ehFerroviaria(linha)),
    [linhasSelecionadasFiltradas]);
  const railLinhaIds = useMemo(() => ferroviariasVisiveis.map((linha) => linha.linhaId), [ferroviariasVisiveis]);
  const railLinhaId = useMemo(() => {
    const ativas = ferroviariasVisiveis;
    return ativas.length === 1 ? ativas[0].linhaId : undefined;
  }, [ferroviariasVisiveis]);
  const railDemoPadroes = useMemo(
    () =>
      ferroviariasVisiveis.flatMap((linha) => {
        const itinerario = itinerariosPorId[linha.linhaId];
        return (itinerario?.padroesV2 ?? []).map((p) => p.padraoVersaoId);
      }),
    [ferroviariasVisiveis, itinerariosPorId],
  );
  const railVehicles = useRailRealtime({
    enabled: telaAtiva && ferroviariasVisiveis.length > 0,
    linhaIds: railLinhaIds,
    permitirDemo: viewMode === "normal",
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
          const sentidoDisponivel = l.modoSentido === "ambos" || Boolean(sentidoIdFiltro);
          const padroesVisiveis = !sentidoDisponivel ? [] : sentidoIdFiltro
            ? itinerario?.padroesV2?.filter((p) => p.sentidoId === sentidoIdFiltro) ?? []
            : itinerario?.padroesV2 ?? [];
          const padroesVersoesVisiveis = new Set(
            padroesVisiveis.map((padrao) => padrao.padraoVersaoId),
          );

          Object.values(estruturasRealtimePorVersao)
            .filter((estrutura) => sentidoDisponivel && estrutura.linhaId === l.linhaId
              && (!sentidoIdFiltro || estrutura.sentidoId === sentidoIdFiltro))
            .forEach((estrutura) => padroesVersoesVisiveis.add(estrutura.padraoVersaoId));
          const veiculos = getVeiculosPorCodigo(
            l.linhaCodigo,
            padroesVersoesVisiveis,
          ).filter((v) => v.linhaId === l.linhaId && (!sentidoIdFiltro || v.sentidoId === sentidoIdFiltro));
          const paradas = l.mostrarParadas ? obterParadasLinha(l) : [];

          const geometriasVisiveis = padroesVisiveis.filter((padrao, index, todos) =>
            todos.findIndex((item) => item.padraoVersaoId === padrao.padraoVersaoId) === index).map((padrao) => ({
            padraoVersaoId: padrao.padraoVersaoId,
            sentidoId: padrao.sentidoId,
            sentidoNome: padrao.sentidoNome,
            coordenadas: segmentos[padrao.segmentoIndice],
          }));
          Object.values(estruturasRealtimePorVersao)
            .filter((estrutura) => sentidoDisponivel && estrutura.linhaId === l.linhaId)
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
    const filtros = ferroviariasVisiveis
      .map((linha) => {
        const padroes = itinerariosPorId[linha.linhaId]?.padroesV2 ?? [];
        const sentidos = [...new Set(padroes.map((padrao) => padrao.sentidoId))];
        const sentidoId = linha.modoSentido === "ida" ? sentidos[0]
          : linha.modoSentido === "volta" ? sentidos[1] : undefined;
        return {
          linhaId: linha.linhaId,
          sentidoId,
          versoes: new Set(
            (linha.modoSentido !== "ambos" && !sentidoId ? [] : padroes)
              .filter((padrao) => !sentidoId || padrao.sentidoId === sentidoId)
              .map((padrao) => padrao.padraoVersaoId),
          ),
        };
      });
    return filtrarVeiculosFerroviariosVisiveis(
      railVehicles,
      filtros.filter((filtro) => filtro.versoes.size > 0).map((filtro) => ({
        linhaId: filtro.linhaId,
        sentidoId: filtro.sentidoId,
        padraoVersaoIds: filtro.versoes,
      })),
    );
  }, [railVehicles, ferroviariasVisiveis, itinerariosPorId]);

  const chegadasRadar = chegadasDoRadar(radar.eventos, radar.parada, linhasSelecionadasFiltradas,
    radar.recebidoEm, radar.agora, veiculos, railVehiclesVisiveis).map((item) => ({ ...item,
      plataforma: item.plataforma ?? (radar.parada
        ? radar.metadados[radar.parada.parada.paradaId]?.plataforma : null),
    }));
  const idsLinhasRadar = new Set(radar.parada?.vinculos.map((item) => item.linhaId) ?? []);
  const linhasRadar: LinhaParadaInfo[] = linhasSelecionadasFiltradas.filter((item) => item.ativa
     && idsLinhasRadar.has(item.linhaId)).map((item) => ({
      linhaId: item.linhaId, codigo: item.linhaCodigo, nomeExibicao: item.nomeExibicao,
      cor: item.cor, ativa: item.ativa,
    }));
  const focarEventoRadar = (evento: EventoParadaDto) => {
    const referencia = localizarVeiculoDoEvento(evento, veiculos, railVehiclesVisiveis);
    if (referencia) {
      setParadaSelecionada(null);
      setParadaDoRadar(false);
      setParadaExpandida(false);
      mapRef.current?.focarVeiculo({ ...referencia, zoom: 17 });
    }
  };

  const linhasPendentes = linhasSelecionadasFiltradas.filter((linha) => linha.ativa);
  const carregandoEstruturas = !linhasHidratadas || !modalHidratado || linhasPendentes.some((linha) =>
    !estadosItinerarios[linha.linhaId] || estadosItinerarios[linha.linhaId].estado === "carregando");
  const falhaEstruturas = linhasPendentes.some((linha) => estadosItinerarios[linha.linhaId]?.estado === "erro");
  const semEstruturas = linhasPendentes.some((linha) => estadosItinerarios[linha.linhaId]?.estado === "indisponivel");

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View onLayout={(event) => {
      const altura = Math.floor(event.nativeEvent.layout.height);
      setAlturaAreaMapa((anterior) => anterior === altura ? anterior : altura);
    }} style={{ flex: 1, backgroundColor: cores.fundoApp }}>
      <MapaOSM
        ref={mapRef}
        location={location}
        linhasParaMostrar={dadosParaMapa}
        railVehicles={railVehiclesVisiveis}
        darkMode={temaAtual === "escuro"}
        estiloMapa={estiloMapaAtual}
        onStopPress={(parada) => {
          setParadaDoRadar(radar.parada?.parada.paradaId === parada.paradaId && !radar.foraContexto);
          setParadaSelecionada(parada);
          setParadaExpandida(false);
        }}
      />

      <BuscaMapa value={busca} onChangeText={setBusca} onClose={fecharBusca}
        active={buscaAberta} focusRequest={pedidoFocoBusca} onFocus={() => setBuscaAberta(true)}
        modais={[{ id: "todos", nome: "Todos" }, ...modais]} modalSelecionadoId={searchCategory}
        onSelecionarModal={selecionarCategoriaBusca} onMenuAbertoChange={setMenuModalBuscaAberto}
        placeholderSuggestions={sugestoesBusca} />
      {buscaAberta && (
        <View pointerEvents={menuModalBuscaAberto ? "none" : "auto"}
          style={{ position: "absolute", top: insets.top + 64, left: 12, right: 12, zIndex: 20,
          opacity: menuModalBuscaAberto ? 0 : 1,
          borderRadius: 18, overflow: "hidden", backgroundColor: cores.fundoCard,
          borderWidth: 0, shadowColor: "#000", shadowOpacity: 0.14,
          shadowRadius: 12, elevation: 8 }}>
          {(recentesBusca.length > 0 || resultadosSemRecentes.length > 0 || carregandoBusca) &&
            <SearchSections embedded recentes={recentesBusca} resultados={resultadosSemRecentes}
              carregando={carregandoBusca}
              onSelectionStart={() => { selecionandoBuscaRef.current = true; }}
              onSelect={selecionarOpcao} />}
        </View>
      )}
      {!buscaAberta && !menuModalBuscaAberto && !containerAberto && !paradaSelecionada &&
        !(viewMode === "favoritos" && favoritasConfiguradas.filter((linha) => linha.ativa).length > LIMITE_FAVORITAS_VISIVEIS) &&
        (carregandoEstruturas || falhaEstruturas || semEstruturas) && (
        <View style={{ position: "absolute", top: insets.top + 64, left: 12, right: 12,
          zIndex: 19, padding: 8, borderRadius: 12, backgroundColor: cores.fundoPainel }}>
          <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: cores.textoPrimario }}>
            {carregandoEstruturas ? "Carregando linhas salvas…" : falhaEstruturas
              ? "Itinerários temporariamente indisponíveis. Suas linhas foram preservadas."
              : "Há linhas sem percursos publicados disponíveis."}
          </Text>
          {falhaEstruturas && <Pressable onPress={tentarNovamenteItinerarios} accessibilityRole="button"
            style={{ minHeight: 44, justifyContent: "center" }}>
            <Text style={{ color: cores.textoPrimario, fontSize: 12 }}>Tentar novamente</Text>
          </Pressable>}
        </View>
      )}
      {viewMode === "favoritos" && favoritasConfiguradas.filter((linha) => linha.ativa).length > LIMITE_FAVORITAS_VISIVEIS
        && !containerAberto && !buscaAberta && !paradaSelecionada && <Pressable
          accessibilityRole="button" accessibilityLabel="Escolher favoritas visíveis"
          onPress={() => setContainerAberto(true)}
          style={{ position: "absolute", top: insets.top + 64, left: 12, right: 12, zIndex: 19,
            minHeight: 44, padding: 10, borderRadius: 12, backgroundColor: cores.fundoPainel }}>
          <Text style={{ fontSize: 12, color: cores.textoPrimario }}>
            Escolha até 10 favoritas para o mapa · {favoritasNoMapa.length}/10 visíveis
          </Text>
        </Pressable>}
      <MapControls
        radarBottom={radarControlsBottom}
        lateralidade={preferenciaLateralidade}
        modalAtivo={viewMode === "favoritos" ? "favoritos" : modalSelecionadoNome}
        location={location}
        mapRef={mapRef}
        onOpenLines={() => { adicionarLinhaPendenteRef.current = false; setContainerAberto(true); }}
        disabled={Boolean(paradaSelecionada) || containerAberto || buscaAberta}
      />
      <LinhasContainer
        visualizacaoFavoritos={viewMode === "favoritos"}
        favoritasConfiguradas={favoritasConfiguradas}
        favoritasVisiveisIds={new Set(favoritasNoMapa.map((linha) => linha.linhaId))}
        aoEscolherVisibilidadeFavorita={escolherVisibilidadeFavorita}
        aoAdicionarFavorita={adicionarFavoritaSelecionadas}
        todasLinhasSelecionadas={linhasSelecionadas}
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
        modalAtivo={viewMode === "favoritos" ? "favoritos" : modalSelecionadoNome}
        mostrarBotaoToggle={false}
        opcoesModal={modais}
        modalSelecionadoId={viewMode === "favoritos" ? "favoritos" : normalModal}
        aoSelecionarModal={selecionarModalPainel}
        aoAdicionarLinha={adicionarLinha}
        aoRecolher={aoRecolherLinhas}
        limiteLinhasAtingido={linhasSelecionadas.length >= MAX_LINHAS}
      />

      <RadarParada viewportHeight={alturaAreaMapa} onControlsBottomChange={atualizarPosicaoControlesRadar} radar={radar} linhas={linhasSelecionadasFiltradas} modal={viewMode === "favoritos" ? "todos" : normalModal}
        lateralidade={preferenciaLateralidade}
        visivel={telaAtiva && !buscaAberta && !menuModalBuscaAberto && !containerAberto && !paradaSelecionada}
        localizavel={(evento) => localizarVeiculoDoEvento(evento, veiculos, railVehiclesVisiveis) != null}
        onEvento={focarEventoRadar}
        onVerTodos={() => {
          if (!radar.parada || radar.foraContexto) return;
          setParadaDoRadar(true);
          setParadaSelecionada(radar.parada.parada);
          setParadaExpandida(true);
        }} />
      <ParadaSheet
        visivel={!!paradaSelecionada}
        parada={paradaSelecionada}
        linhas={paradaDoRadar ? linhasRadar : linhasNaParada}
        chegadas={paradaDoRadar ? chegadasRadar : chegadasParada}
        carregandoChegadas={paradaDoRadar ? radar.carregando : carregandoChegadas}
        erroChegadas={paradaDoRadar ? radar.erro : erroChegadas}
        atualizadoEm={paradaDoRadar ? radar.atualizadoEm : atualizadoChegadasEm}
        onAtualizar={paradaDoRadar ? radar.atualizar : atualizarChegadas}
        onFocarVeiculo={(chegada) => {
          if (!paradaDoRadar) { focarVeiculoNaParada(chegada); return; }
          const evento = radar.eventos.find((item) => item.eventId === chegada.id);
          if (evento) focarEventoRadar(evento);
        }}
        expandido={paradaExpandida}
        onToggleExpandir={() => setParadaExpandida((p) => !p)}
        onFechar={() => {
          setParadaDoRadar(false);
          setParadaSelecionada(null);
          setParadaExpandida(false);
        }}
      />
    </View>
  );
};

export default Home;
