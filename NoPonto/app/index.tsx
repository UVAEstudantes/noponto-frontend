import { useUserLocationWatch } from '@/src/hooks/useUserLocationWatch';
import TutorialTarget from '@/src/components/tutorial/TutorialTarget';
import { radarBlocked, linePanelStep, transportSearchStep } from '@/src/components/tutorial/tutorialSteps';
import { useTutorial } from '@/src/components/tutorial/TutorialProvider';
import { paradaDetalhadaRadar, eventosValidosRadar } from '@/src/services/radarParada';
import { useFavoritos } from "@/src/hooks/useFavoritos";
import { configurarFavoritas, linhasEfetivas, favoritasVisiveis, ehFerroviaria,
  LIMITE_FAVORITAS_VISIVEIS, type ViewModeMapa, type SearchCategoryMapa } from "@/src/services/linhasEfetivas";
import LinhasContainer, {
  PROXIMO_SENTIDO,
} from "@/src/components/mapaComponents/linhasContainer";
import ParadaSheet, {
  LinhaParadaInfo,
} from "@/src/components/mapaComponents/paradaSheet";
import MapaOSM from "@/src/components/mapOSM/mapOSM";
import { StartupContext } from "@/src/components/startup/StartupContext";
import { MapaOSMRef } from "@/src/components/mapOSM/types";
import SearchSections from "@/src/components/searchSections";
import BuscaMapa from "@/src/components/mapaComponents/buscaMapa";
import MapControls from "@/src/components/mapaComponents/mapControls";
import RadarParada from "@/src/components/mapaComponents/radarParada";
import {terminalVehicleFocus,type TerminalPresence} from '@/src/services/terminalTracking';
import {geometryForMap,stopsForMap} from '@/src/services/hybridGps';
import { useRadarParada } from "@/src/hooks/useRadarParada";
import {useTerminalRadarCatalog,useTerminalRadarPresence} from '@/src/hooks/useTerminalRadar';
import {mergeTerminalEvidence,mergeTerminalRadarLines} from '@/src/services/terminalRadarContext';
import { usePhysicalPresence } from "@/src/services/physicalPresence";
import { chegadasDoRadar } from "@/src/services/apresentacaoRadar";
import { adaptarPreviaRadarNativa } from "@/src/services/notificacaoRadarNativa";
import { useRadarEspera } from "@/src/hooks/useRadarEspera";
import { compararSnapshotsRadar, type SnapshotDiagnosticoRadar } from '@/src/services/diagnosticoConsistenciaRadar';
import { useIsFocused } from "@react-navigation/native";
import Constants from "expo-constants";
import {
  LinhaSelecionadaInfo,
  useMobilidadeRio,
} from "@/src/hooks/useMobilidadeRio";
import { useTema } from "@/src/hooks/useTema";
import { useRailRealtime } from "@/src/hooks/useRailRealtime";
import { buscarModais, buscarOpcoesPorNome, buscarSugestoesBusca } from "@/src/services/mobilidadeRio";
import {
  localizarVeiculoDoEvento,
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
  LocationObject,
  requestForegroundPermissionsAsync,
  getForegroundPermissionsAsync,
} from "expo-location";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AppState, Keyboard, Platform, Pressable, Text, View } from "react-native";
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
  const tutorial = useTutorial();
  const reportStartupReady = React.useContext(StartupContext);
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
  const physicalVehicles = usePhysicalPresence(telaAtiva);
  const [terminalPresence,setTerminalPresence]=useState<TerminalPresence[]>([]);
  const physicalVehiclesVisible = useMemo(() => {
    // Keep validated positive evidence available to the map's timestamp arbitrator.
    // Operational objects and arrival/ETA collections remain unchanged.
    return physicalVehicles.filter(v => {
      const order=v.originalVehicleId.trim().toUpperCase();
      const operational=veiculos.find(op => op.runtime==='rodoviario' && op.tipoRota===v.modal
        && op.codigoVeiculoOuTrem?.trim().toUpperCase()===(v.modal==='brt'&&!order.startsWith('BRT-')?'BRT-'+order:order));
      return !operational || (operational.linhaId===v.lineId
        && Date.parse(v.physicalAt)>Date.parse(operational.atualizadoEm||''));
    });
  }, [physicalVehicles, veiculos]);

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
  const [initialMapReady, setInitialMapReady] = useState(false);
  const initialLocationApplied = useRef(false);
  useEffect(() => {
    if (!initialMapReady || !tutorial.initialLocation || initialLocationApplied.current) return;
    initialLocationApplied.current = true;
    setLocation(tutorial.initialLocation);
    mapRef.current?.fitToCoordinates([tutorial.initialLocation.coords]);
  }, [initialMapReady, tutorial.initialLocation]);
  const [paradaSelecionada, setParadaSelecionada] = useState<Parada | null>(
    null,
  );
  const [paradaExpandida, setParadaExpandida] = useState(false);
  const [radarOpenRequest, setRadarOpenRequest] = useState(0);
  const radarOpenRequestSequence = useRef(0);
  const confirmarAberturaRadar = useCallback((request: number) => {
    setRadarOpenRequest((current) => current === request ? 0 : current);
  }, []);
  const nativeProbeEnabled = Platform.OS === "android"
    && Constants.expoConfig?.extra?.nativeNotificationProbe === true
    && Constants.expoConfig?.android?.package === "com.guilhermedesales.nononto.nativeprobe";
  const [nativeProbeSession, setNativeProbeSession] = useState<{ id: string; paradaId: string } | null>(null);
  const nativeProbeSessionRef = useRef<{ id: string; paradaId: string } | null>(null);
  const nativeProbeStartingRef = useRef(false);
  const [nativeProbeStarting, setNativeProbeStarting] = useState(false);
  const nativeProbePayloadRef = useRef<string | null>(null);
  const nativeProbeRevisionRef = useRef(0);
  const nativeProbeReceivedAtRef = useRef<number | null>(null);

  const solicitarLocalizacao = useCallback(async () => {
    if (tutorial.initialLocationPending) return;
    try {
      const { granted } = await requestForegroundPermissionsAsync();
      if (!granted) { Alert.alert('Localização desativada', 'Autorize a localização nas configurações do aparelho para centralizar o mapa.'); return; }
      const loc = await getCurrentPositionAsync();
      setLocation(loc);
      mapRef.current?.fitToCoordinates([loc.coords]);
    } catch { Alert.alert('Localização indisponível', 'Não foi possível obter sua posição. Tente novamente.'); }
  }, [tutorial.initialLocationPending]);

  const normalizarNome = useCallback((valor: string) => {
    return valor
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
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

  useUserLocationWatch(telaAtiva && Boolean(location), setLocation);

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
        if (tutorial.step !== 'search' && !transportSearchStep(tutorial.step) && deveFecharBuscaAoOcultarTeclado(selecionandoBuscaRef.current)) fecharBusca();
      });
    });
    return () => subscription.remove();
  }, [fecharBusca, tutorial.step]);

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

  const terminalRadarEnabled=telaAtiva&&(viewMode==='favoritos'||normalModal==='onibus');
  const terminalCatalog=useTerminalRadarCatalog(terminalRadarEnabled&&!!location);
  const radarLines=useMemo(()=>mergeTerminalRadarLines(linhasSelecionadasFiltradas,terminalCatalog),[linhasSelecionadasFiltradas,terminalCatalog]);
  const radarItineraries=useMemo(()=>({...itinerariosPorId,...terminalCatalog.itineraries}),[itinerariosPorId,terminalCatalog]);
  const radarConsultado = useRadarParada({ linhas: radarLines, modal: viewMode === "favoritos" ? "todos" : normalModal,
    paradaVisualizada: paradaSelecionada,
    itinerarios: radarItineraries, realtime: estruturasRealtimePorVersao,
    local: location?.coords ?? null,
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
      if (!linha?.id) { selecionandoBuscaRef.current = false; return; }
      if (!linhasSelecionadas.some(l => l.linhaId === linha.id) && linhasSelecionadas.length >= MAX_LINHAS) {
        selecionandoBuscaRef.current = false;
        Alert.alert('Limite de linhas', 'Remova uma linha antes de selecionar outra.'); return;
      }
      const linhaCodigo = linha.codigo || linha.nome;
      const modal = categoriaLinhaV2({
        tipoRota: linha.tipoRota ?? "",
        modal: linha.modal ?? "",
      }) as ModalApiTransporte;
      tutorial.setLineId(linha.id);
      if (tutorial.step === 'search') { setViewMode('normal'); setNormalModal(modal); }
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

      // The line is accepted now; network latency must not hold the tutorial open.
      fecharBusca();
      tutorial.setRouteAvailable(false);
      tutorial.advance('selected');
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
          tutorial.setRouteAvailable(true);
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

      }
    },
    [fecharBusca, garantirItinerario, corRamalTrem, linhasSelecionadas, tutorial.advance, tutorial.step, tutorial.setRouteAvailable, tutorial.setLineId],
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
    tutorial.filterSelected(id);
    if (viewMode === "normal" && id !== "todos") {
      modalAlteradoPeloUsuario.current = true; setNormalModal(id);
    }
  }, [viewMode, tutorial.filterSelected]);

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

  const modalRadar = viewMode === "favoritos" ? "todos" : normalModal;
  const contextoDetalhe = paradaSelecionada ? radarConsultado.parada : null;
  const paradaSelecionadaId = paradaSelecionada?.paradaId;
  const contextoDetalheId = contextoDetalhe?.parada.paradaId;
  const consultaDetalhe = radarConsultado;
  const scopedTerminalPresence=useTerminalRadarPresence(terminalCatalog,contextoDetalhe??radarConsultado.parada,
    terminalRadarEnabled&&!buscaAberta&&!containerAberto&&(!radarConsultado.foraContexto||!!contextoDetalhe)
      &&(contextoDetalhe?consultaDetalhe.foreground:radarConsultado.foreground),contextoDetalhe?consultaDetalhe.eventos:radarConsultado.eventos);
  const radarTerminalPresence=useMemo(()=>mergeTerminalEvidence(terminalPresence,scopedTerminalPresence),[terminalPresence,scopedTerminalPresence]);
  const acompanhamento = useRadarEspera({
    // Visualizar detalhes não transfere o alvo; selecionar no próprio Radar, sim.
    selecaoDeliberada: !paradaSelecionada && radarConsultado.manual,
    veiculosObservados: __DEV__ ? veiculos.flatMap(v => v.linhaId && v.codigoVeiculoOuTrem
      ? [{ linhaId: v.linhaId, veiculoId: v.codigoVeiculoOuTrem }] : []) : undefined,
    parada: paradaSelecionada ? contextoDetalhe : radarConsultado.foraContexto ? null : radarConsultado.parada,
    consulta: paradaSelecionada ? consultaDetalhe : radarConsultado,
    modal: modalRadar, linhas: linhasSelecionadasFiltradas,
    itinerarios: { ...terminalCatalog.itineraries, ...itinerariosPorId },
    realtime: estruturasRealtimePorVersao, presencasFisicas: radarTerminalPresence,
    suprimirNotificacaoLocal: nativeProbeEnabled && nativeProbeSession != null,
  });
  const nativeProbePresentation = useMemo(() => {
    const previa = acompanhamento.previa;
    if (!nativeProbeEnabled || !paradaSelecionadaId || !contextoDetalheId || !consultaDetalhe.foreground
      || !consultaDetalhe.temResposta || ["pausado", "indisponivel"].includes(consultaDetalhe.statusConsulta)
      || !previa || previa.contexto.paradaId !== paradaSelecionadaId
      || contextoDetalheId !== paradaSelecionadaId) return null;
    return adaptarPreviaRadarNativa(previa, acompanhamento.preferencias.prioritarias);
  }, [nativeProbeEnabled, paradaSelecionadaId, contextoDetalheId,
    consultaDetalhe.foreground, consultaDetalhe.temResposta, consultaDetalhe.statusConsulta,
    acompanhamento.previa, acompanhamento.preferencias.prioritarias]);
  const nativeProbePayload = nativeProbePresentation ? JSON.stringify(nativeProbePresentation) : null;
  const iniciarNativeProbe = useCallback(async () => {
    const stopId = paradaSelecionada?.paradaId;
    if (!telaAtiva || AppState.currentState !== "active" || !nativeProbePresentation || !nativeProbePayload || !stopId || nativeProbeStartingRef.current) return;
    nativeProbeStartingRef.current = true;
    setNativeProbeStarting(true);
    const session = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, paradaId: stopId };
    try {
      const { iniciarNotificacaoRadarNativa } = await import("@/src/services/notificacaoNativaTeste");
      if (!await iniciarNotificacaoRadarNativa(session.id, nativeProbePresentation)) {
        Alert.alert("Notificação indisponível", "Autorize notificações e tente novamente.");
        return;
      }
      if (!telaAtiva || AppState.currentState !== "active") {
        const { encerrarNotificacaoRadarNativa } = await import("@/src/services/notificacaoNativaTeste");
        await encerrarNotificacaoRadarNativa(session.id);
        return;
      }
      nativeProbeSessionRef.current = session;
      nativeProbePayloadRef.current = nativeProbePayload;
      nativeProbeRevisionRef.current = 0;
      nativeProbeReceivedAtRef.current = consultaDetalhe.recebidoEm;
      setNativeProbeSession(session);
    } catch (error) {
      console.error(`[RadarNativeProbe:${session.id}] falha ao iniciar sessão real`, error);
      Alert.alert("Falha no teste", "Não foi possível iniciar a notificação com dados do Radar.");
    } finally {
      nativeProbeStartingRef.current = false;
      setNativeProbeStarting(false);
    }
  }, [nativeProbePresentation, nativeProbePayload, paradaSelecionada?.paradaId, consultaDetalhe.recebidoEm, telaAtiva]);

  const liberarNativeProbe = useCallback((sessionId: string) => {
    if (nativeProbeSessionRef.current?.id !== sessionId) return;
    nativeProbeSessionRef.current = null;
    nativeProbePayloadRef.current = null;
    nativeProbeReceivedAtRef.current = null;
    setNativeProbeSession(null);
  }, []);
  const encerrarNativeProbe = useCallback(async (sessionId?: string) => {
    const session = nativeProbeSessionRef.current;
    if (!session || (sessionId != null && session.id !== sessionId)) return;
    liberarNativeProbe(session.id);
    try {
      const { encerrarNotificacaoRadarNativa } = await import("@/src/services/notificacaoNativaTeste");
      await encerrarNotificacaoRadarNativa(session.id);
    } catch (error) {
      console.error(`[RadarNativeProbe:${session.id}] falha ao encerrar sessão`, error);
    }
  }, [liberarNativeProbe]);
  const sincronizarNativeProbe = useCallback(async () => {
    const session = nativeProbeSessionRef.current;
    if (!session) return;
    try {
      const { notificacaoRadarNativaAtiva } = await import("@/src/services/notificacaoNativaTeste");
      const ativa = await notificacaoRadarNativaAtiva(session.id);
      if (!ativa) liberarNativeProbe(session.id);
    } catch (error) {
      console.error(`[RadarNativeProbe:${session.id}] falha ao consultar sessão`, error);
    }
  }, [liberarNativeProbe]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void sincronizarNativeProbe();
      else void encerrarNativeProbe();
    });
    return () => subscription.remove();
  }, [encerrarNativeProbe, sincronizarNativeProbe]);
  useEffect(() => {
    if (telaAtiva) void sincronizarNativeProbe();
    else void encerrarNativeProbe();
  }, [telaAtiva, encerrarNativeProbe, sincronizarNativeProbe]);

  useEffect(() => {
    const session = nativeProbeSession;
    if (!session || !telaAtiva || !consultaDetalhe.foreground) return;
    const encerrar = () => {
      void encerrarNativeProbe(session.id);
    };
    if (!paradaSelecionadaId || paradaSelecionadaId !== session.paradaId || !nativeProbePayload) {
      encerrar();
      return;
    }
    if (nativeProbePayload === nativeProbePayloadRef.current
      && consultaDetalhe.recebidoEm === nativeProbeReceivedAtRef.current) return;
    let vigente = true;
    const revision = ++nativeProbeRevisionRef.current;
    void import("@/src/services/notificacaoNativaTeste").then(({ atualizarNotificacaoRadarNativa }) =>
      atualizarNotificacaoRadarNativa(session.id, revision, JSON.parse(nativeProbePayload))).then((atualizada) => {
        if (!vigente || nativeProbeSessionRef.current?.id !== session.id) return;
        if (atualizada) {
          nativeProbePayloadRef.current = nativeProbePayload;
          nativeProbeReceivedAtRef.current = consultaDetalhe.recebidoEm;
        }
        else {
          liberarNativeProbe(session.id);
        }
      }).catch((error: unknown) => {
        if (!vigente) return;
        console.error(`[RadarNativeProbe:${session.id}] falha ao atualizar notificação`, error);
        encerrar();
      });
    return () => { vigente = false; };
  }, [nativeProbeSession, nativeProbePayload, consultaDetalhe.recebidoEm, telaAtiva,
    encerrarNativeProbe, liberarNativeProbe,
    consultaDetalhe.foreground, paradaSelecionadaId]);
  const radar = { ...radarConsultado, previaNotificacao: acompanhamento.previa };
  const ultimoCompacto = useRef<SnapshotDiagnosticoRadar | null>(null);
  if (__DEV__ && !paradaSelecionada && telaAtiva && !buscaAberta && !containerAberto) ultimoCompacto.current = { ...radarConsultado, presencasFisicas: radarTerminalPresence };
  const diagnosticarRadares = __DEV__ ? () => {
    const comparacao = compararSnapshotsRadar(ultimoCompacto.current, radarConsultado,
      { paradaId: acompanhamento.paradaIdMonitorada, estado: acompanhamento.estado, previa: acompanhamento.previa }, radarTerminalPresence);
    console.info('[Radar comparação DEV]', JSON.stringify(comparacao, null, 2));
    Alert.alert('Comparação dos Radares · DEV', 'Snapshot limitado registrado no Metro. Inclui a última representação compacta, a consulta atual e o alvo do Radar de Espera. Nenhuma consulta adicional foi feita.');
  } : undefined;
  const idsLinhasDetalhe = new Set(contextoDetalhe?.vinculos.map((item) => item.linhaId) ?? []);
  const linhasNaParada: LinhaParadaInfo[] = radarLines.filter((item) => item.ativa
    && idsLinhasDetalhe.has(item.linhaId)).map((item) => ({
      linhaId: item.linhaId, codigo: item.linhaCodigo, nomeExibicao: item.nomeExibicao,
      cor: item.cor, ativa: item.ativa,
    }));

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

  const tutorialPanelWasOpen = useRef(false);
  useEffect(() => {
    if ((tutorial.step !== "search" && !transportSearchStep(tutorial.step)) || !telaAtiva) return;
    setBuscaAberta(true);
    setPedidoFocoBusca((pedido) => pedido + 1);
  }, [tutorial.step, telaAtiva]);
  useEffect(() => {
    const open = linePanelStep(tutorial.step) && Boolean(tutorial.lineContext);
    if (tutorial.step || tutorialPanelWasOpen.current) {
      setContainerAberto(open); if (tutorial.step !== "stopDetails" && tutorial.chapter !== 5 && tutorial.step !== "linesDone") setParadaSelecionada(null);
      if (tutorial.step !== 'search' && tutorial.chapter !== 6) fecharBusca();
    }
    tutorialPanelWasOpen.current = open;
  }, [tutorial.step, tutorial.lineContext?.lineId, fecharBusca]);
  useEffect(() => {
    tutorial.setSearching(telaAtiva && buscaAberta);
    return () => tutorial.setSearching(false);
  }, [telaAtiva, buscaAberta, tutorial.setSearching]);
  useEffect(() => {
    if (tutorial.step === "transportMap" || tutorial.step === "journeyDone") fecharBusca();
  }, [tutorial.step, fecharBusca]);
  const exemploConsumido = useRef(0);
  useEffect(() => {
    if (!tutorial.exampleRequest || exemploConsumido.current === tutorial.exampleRequest) return;
    exemploConsumido.current = tutorial.exampleRequest;
    selecionarCategoriaBusca('onibus'); setBusca('838'); setBuscaAberta(true);
  }, [tutorial.exampleRequest, selecionarCategoriaBusca]);

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
            l.linhaId,
          ).filter((v) => v.presencaEstado && !v.padraoVersaoId
            ? (!v.linhaId || v.linhaId===l.linhaId) && (!sentidoIdFiltro || !v.sentidoId || v.sentidoId===sentidoIdFiltro)
            : v.linhaId === l.linhaId && (!sentidoIdFiltro || v.sentidoId === sentidoIdFiltro));
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
                coordenadas: geometryForMap(estrutura.geometria.coordenadas),
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
            linhaId: l.linhaId,
            descricao: l.subtitulo,
            cor: l.cor,
            modal: l.modal,
            segmentos: geometriasVisiveis.map((item) => item.coordenadas),
            coordenadas: geometriasVisiveis[0]?.coordenadas ?? [],
            paradas,
            mostrarParadas: l.mostrarParadas,
            modoSentido: l.modoSentido,
            itinerarioSegmentoMap,
            terminaisOficiais:itinerario?.terminaisOficiais,
            paradasPorPadrao: Object.fromEntries([
              ...padroesVisiveis.map(p => [p.padraoVersaoId, p.paradas]),
              ...Object.values(estruturasRealtimePorVersao).filter(e=>e.linhaId===l.linhaId&&geometriasVisiveis.some(g=>g.padraoVersaoId===e.padraoVersaoId)).map(e=>[e.padraoVersaoId,stopsForMap(e.ocorrencias)]),
            ]),
            itinerarioSentidoMap:
              Object.keys(itinerarioSentidoMap).length > 0
                ? itinerarioSentidoMap
                : undefined,
            posicoes: veiculos.map((v) => ({
              id: v.id,
              idVisual: v.idVisual,
              presencaEstado:v.presencaEstado,
              presencaRotulo:v.presencaRotulo,
              presencaIdadeSegundos:v.presencaIdadeSegundos,
              gpsAtrasado:v.gpsAtrasado,
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

  const contextoTrens = paradaSelecionada && linhasSelecionadasFiltradas.some(l => l.modal === 'trem' && l.ativa)
    ? paradaDetalhadaRadar(paradaSelecionada, linhasSelecionadasFiltradas.map(l => l.modal === 'trem' ? { ...l, modoSentido: 'ambos' as const } : l),
      viewMode === 'favoritos' ? 'todos' : normalModal, itinerariosPorId, estruturasRealtimePorVersao) : null;
  const contextoFicha = contextoTrens ?? contextoDetalhe;
  const eventosFicha = contextoTrens ? eventosValidosRadar(consultaDetalhe.eventosRecebidos, contextoTrens,
    consultaDetalhe.recebidoEm ?? Date.now(), consultaDetalhe.agora) : consultaDetalhe.eventos;
  const chegadasParada = chegadasDoRadar(eventosFicha, contextoFicha,
    linhasSelecionadasFiltradas, consultaDetalhe.recebidoEm, consultaDetalhe.agora,
    veiculos, railVehiclesVisiveis).map((item) => ({ ...item,
      plataforma: item.plataforma ?? (paradaSelecionada
        ? radar.metadados[paradaSelecionada.paradaId]?.plataforma : null),
    }));
  const focarEventoRadar = (evento: EventoParadaDto) => {
    const referencia = localizarVeiculoDoEvento(evento, veiculos, railVehiclesVisiveis);
    if (referencia) {
      setParadaSelecionada(null);
      setParadaExpandida(false);
      mapRef.current?.focarVeiculo({ ...referencia, zoom: 17 });
    }
  };

  const linhasPendentes = linhasSelecionadasFiltradas.filter((linha) => linha.ativa);
  const focarVeiculoOrigem=(vehicle:TerminalPresence)=>{
    const target=terminalVehicleFocus(vehicle,Date.now());if(!target)return;
    setParadaSelecionada(null);setParadaExpandida(false);
    mapRef.current?.focarVeiculo(target);
  };
  const carregandoEstruturas = !linhasHidratadas || !modalHidratado || linhasPendentes.some((linha) =>
    !estadosItinerarios[linha.linhaId] || estadosItinerarios[linha.linhaId].estado === "carregando");
  const falhaEstruturas = linhasPendentes.some((linha) => estadosItinerarios[linha.linhaId]?.estado === "erro");
  const semEstruturas = linhasPendentes.some((linha) => estadosItinerarios[linha.linhaId]?.estado === "indisponivel");

  const managedTutorialLine = tutorial.chapter === 4 ? (viewMode === "favoritos" ? favoritasConfiguradas : linhasSelecionadasFiltradas).find(line => line.linhaId === tutorial.lineId) : null;
  const tutorialLine = tutorial.lineId ? dadosParaMapa.find(line => line.linhaId === tutorial.lineId) : dadosParaMapa[0];
  const tutorialContextKey = managedTutorialLine ? "manage:" + viewMode + ":" + managedTutorialLine.linhaId + ":" + managedTutorialLine.modal : tutorialLine ? `${viewMode}:${normalModal}:${tutorialLine.structureKey}` : '';
  useEffect(() => {
    if (tutorialLine && !tutorial.lineId) tutorial.setLineId(tutorialLine.linhaId);
    tutorial.setLineContext(managedTutorialLine ? {lineId: managedTutorialLine.linhaId, lineName: managedTutorialLine.nomeExibicao, modal: managedTutorialLine.modal, key: tutorialContextKey, favorites: viewMode === "favoritos"} : tutorialLine ? { lineId: tutorialLine.linhaId, lineName: tutorialLine.nome, modal: tutorialLine.modal, key: tutorialContextKey } : null);
  }, [tutorialContextKey, tutorial.lineId, tutorial.setLineId, tutorial.setLineContext]);

  useEffect(() => {
    if (tutorial.step === "stopDetails" && paradaSelecionada &&
      !tutorialLine?.paradas.some(item => item.paradaId === paradaSelecionada.paradaId)) {
      setParadaSelecionada(null);
      setParadaExpandida(false);
      tutorial.stopClosed();
    }
  }, [tutorial.step, tutorialLine, paradaSelecionada, tutorial.stopClosed]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View onLayout={(event) => {
      const altura = Math.floor(event.nativeEvent.layout.height);
      setAlturaAreaMapa((anterior) => anterior === altura ? anterior : altura);
    }} style={{ flex: 1, backgroundColor: cores.fundoApp }}>
      <MapaOSM
        onTerminalVehiclesChange={setTerminalPresence}
        onReady={() => { setInitialMapReady(true); reportStartupReady?.(); }}
        ref={mapRef}
        tutorialRequest={tutorial.mapRequest}
        onTutorialEvent={tutorial.onMapEvent}
        location={location}
        linhasParaMostrar={dadosParaMapa}
        railVehicles={railVehiclesVisiveis}
        physicalVehicles={physicalVehiclesVisible}
        darkMode={temaAtual === "escuro"}
        estiloMapa={estiloMapaAtual}
        onStopPress={(parada) => {
          setParadaSelecionada(parada);
          setParadaExpandida(false);
          if (tutorialLine?.paradas.some(item => item.paradaId === parada.paradaId)) tutorial.stopSelected();
        }}
      />

      <BuscaMapa value={busca} onChangeText={(value) => { setBusca(value); tutorial.interact(); }} onClose={fecharBusca}
        active={buscaAberta} focusRequest={pedidoFocoBusca} onFocus={() => { setBuscaAberta(true); tutorial.interact(); }}
        modais={[{ id: "todos", nome: "Todos" }, ...modais]} modalSelecionadoId={searchCategory}
        onSelecionarModal={selecionarCategoriaBusca} onMenuAbertoChange={setMenuModalBuscaAberto}
        placeholderSuggestions={sugestoesBusca} />
      {buscaAberta && (
        <TutorialTarget kind="results" enabled={!menuModalBuscaAberto && (recentesBusca.length > 0 || resultadosSemRecentes.length > 0 || carregandoBusca)} pointerEvents={menuModalBuscaAberto ? "none" : "auto"}
          style={{ position: "absolute", top: insets.top + 64, left: 12, right: 12, zIndex: 20,
          opacity: menuModalBuscaAberto ? 0 : 1,
          borderRadius: 18, overflow: "hidden", backgroundColor: cores.fundoCard,
          borderWidth: 0, shadowColor: "#000", shadowOpacity: 0.14,
          shadowRadius: 12, elevation: 8 }}>
          {(recentesBusca.length > 0 || resultadosSemRecentes.length > 0 || carregandoBusca) &&
            <SearchSections embedded
              maxHeight={(tutorial.step === 'search' || transportSearchStep(tutorial.step)) ? Math.max(100, (alturaAreaMapa ?? 600) - insets.top - (tutorial.example ? 260 : 220)) : 400}
              recentes={recentesBusca} resultados={resultadosSemRecentes}
              carregando={carregandoBusca}
              onSelectionStart={() => { selecionandoBuscaRef.current = true; }}
              onSelect={selecionarOpcao} />}
        </TutorialTarget>
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
        onRequestLocation={solicitarLocalizacao}
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

      <RadarParada bloqueadoPeloTutorial={radarBlocked(tutorial.step)} viewportHeight={alturaAreaMapa} onControlsBottomChange={atualizarPosicaoControlesRadar} radar={radar} linhas={linhasSelecionadasFiltradas} modal={viewMode === "favoritos" ? "todos" : normalModal}
        onDiagnostico={diagnosticarRadares}
        acompanhamento={acompanhamento}
        abrirRadarSolicitacao={radarOpenRequest}
        onAberturaRadarConcluida={confirmarAberturaRadar}
        terminalPresence={radarTerminalPresence}
        onTerminalVehicle={focarVeiculoOrigem}
        physicalVehicles={physicalVehiclesVisible}
        lateralidade={preferenciaLateralidade}
        visivel={telaAtiva && !buscaAberta && !menuModalBuscaAberto && !containerAberto && (!paradaSelecionada || tutorial.chapter === 5)}
        localizavel={(evento) => localizarVeiculoDoEvento(evento, veiculos, railVehiclesVisiveis) != null}
        onEvento={focarEventoRadar}
        onVerTodos={() => {
          if (!radar.parada || radar.foraContexto) return;
          setParadaSelecionada(radar.parada.parada);
          setParadaExpandida(true);
        }} />
      <ParadaSheet
        reduzirMovimento={Boolean(tutorial.step) && tutorial.reducedMotion}
        onDiagnostico={diagnosticarRadares}
        agora={consultaDetalhe.agora}
        vinculos={contextoFicha?.vinculos}
        terminalPresence={radarTerminalPresence}
        onTerminalVehicle={focarVeiculoOrigem}
        physicalVehicles={physicalVehiclesVisible}
        physicalModal={modalRadar}
        visivel={!!paradaSelecionada && tutorial.chapter !== 5}
        parada={paradaSelecionada}
        linhas={linhasNaParada}
        chegadas={chegadasParada}
        carregandoChegadas={consultaDetalhe.carregando}
        erroChegadas={consultaDetalhe.erro}
        atualizadoEm={consultaDetalhe.atualizadoEm}
        statusConsulta={consultaDetalhe.statusConsulta}
        nativeProbeEnabled={nativeProbeEnabled}
        nativeProbeReady={nativeProbePresentation != null}
        nativeProbeActive={nativeProbeSession?.paradaId === paradaSelecionada?.paradaId}
        nativeProbeStarting={nativeProbeStarting}
        onStartNativeProbe={iniciarNativeProbe}
        contextoIndisponivel={Boolean(paradaSelecionada && !contextoDetalhe)}
        onRecuperarContexto={() => {
          setParadaSelecionada(null);
          setParadaExpandida(false);
          radar.selecaoAutomatica();
        }}
        onMonitorarRadar={!tutorial.step && contextoDetalhe && !radarConsultado.foraContexto ? () => {
          radarConsultado.selecionar(contextoDetalhe);
          setParadaSelecionada(null);
          setParadaExpandida(false);
          const request = ++radarOpenRequestSequence.current;
          setRadarOpenRequest(request);
        } : undefined}
        onAtualizar={consultaDetalhe.atualizar}
        onFocarVeiculo={(chegada) => {
          const evento = consultaDetalhe.eventosPorId.get(chegada.id);
          if (evento) focarEventoRadar(evento);
        }}
        expandido={paradaExpandida}
        onToggleExpandir={() => setParadaExpandida((p) => !p)}
        onFechar={() => {
          tutorial.stopClosed();
          setParadaSelecionada(null);
          setParadaExpandida(false);
        }}
      />
    </View>
  );
};

export default Home;
