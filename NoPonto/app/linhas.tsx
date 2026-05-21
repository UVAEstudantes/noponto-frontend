import InputBusca from "@/src/components/inputBusca";
import Chegada from "@/src/components/linhasComponents/chegada";
import SelectTransporte from "@/src/components/linhasComponents/selectTransporte";
import Tarifas from "@/src/components/linhasComponents/tarifas";
import MapaOSM, { MapaOSMRef } from "@/src/components/mapOSM";
import ResultadoBusca from "@/src/components/resultadoBusca";
import Select from "@/src/components/select";
import { useMobilidadeRio } from "@/src/hooks/useMobilidadeRio";
import { useTema } from "@/src/hooks/useTema";
import {
  buscarDetalhesLinha,
  buscarModais,
  buscarOpcoesPorNome,
  buscarPoisPorItinerario,
  buscarPoisPorParada,
  buscarSentidosPorLinha,
} from "@/src/services/mobilidadeRio";
import { carregarModalSelecionado } from "@/src/services/storage";
import {
  LinhaDetalhesDto,
  ModalApiTransporte,
  ModalTransporteDto,
  OpcaoBusca,
  Parada,
  PoiDto,
  SentidoSimples,
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
  AlertTriangle,
  Banknote,
  BookOpen,
  Building2,
  Bus,
  BusFront,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Coffee,
  Flame,
  Fuel,
  Hospital,
  LandmarkIcon,
  LucideIcon,
  MapPin,
  Milestone,
  Pill,
  School,
  ShoppingBag,
  ShoppingCart,
  Star,
  Stethoscope,
  Theater,
  Train,
  TrainFrontTunnel,
  Trees,
  University,
  X,
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
  Linking,
  Platform,
  Pressable,
  StatusBar,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeInUp,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

// ─── Categorias → ícones ──────────────────────────────────────────────────────

const ICONE_CAT: Record<string, LucideIcon> = {
  Hospital: Hospital,
  "Terminal de Ônibus": Bus,
  "Terminal de Barcas": Milestone,
  "Estação de Trem/Metrô": Train,
  "Entrada do Metrô": TrainFrontTunnel,
  Shopping: ShoppingBag,
  "Loja de Departamentos": Building2,
  Estádio: Star,
  Universidade: University,
  Faculdade: University,
  Clínica: Stethoscope,
  Supermercado: ShoppingCart,
  "Mercado/Feira": ShoppingCart,
  Farmácia: Pill,
  Banco: Banknote,
  Correios: MapPin,
  "Delegacia/Polícia": AlertTriangle,
  Bombeiros: Flame,
  Teatro: Theater,
  Cinema: Clapperboard,
  Museu: LandmarkIcon,
  Biblioteca: BookOpen,
  "Posto de Gasolina": Fuel,
  "Conveniência/Mercearia": Coffee,
  Escola: School,
  Parque: Trees,
  "Atração Turística": Star,
  "Marco Histórico": LandmarkIcon,
};

const ICONE_CAT_WEB: Record<string, string> = {
  Hospital: "hospital",
  "Terminal de Ônibus": "bus",
  "Terminal de Barcas": "milestone",
  "Estação de Trem/Metrô": "train",
  "Entrada do Metrô": "train-front",
  Shopping: "shopping-bag",
  "Loja de Departamentos": "building-2",
  Estádio: "star",
  Universidade: "university",
  Faculdade: "university",
  Clínica: "stethoscope",
  Supermercado: "shopping-cart",
  "Mercado/Feira": "shopping-cart",
  Farmácia: "pill",
  Banco: "banknote",
  Correios: "map-pin",
  "Delegacia/Polícia": "alert-triangle",
  Bombeiros: "flame",
  Teatro: "theater",
  Cinema: "clapperboard",
  Museu: "landmark",
  Biblioteca: "book-open",
  "Posto de Gasolina": "fuel",
  "Conveniência/Mercearia": "coffee",
  Escola: "school",
  Parque: "trees",
  "Atração Turística": "star",
  "Marco Histórico": "landmark",
};

const COR_PRIORIDADE = [
  { fundo: "#fef3c7", texto: "#92400e" }, // 1 - ouro
  { fundo: "#e0f2fe", texto: "#0369a1" }, // 2 - azul
  { fundo: "#f3f4f6", texto: "#6b7280" }, // 3 - cinza
];
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

function iconeParaCategoria(cat: string): LucideIcon {
  return ICONE_CAT[cat] ?? MapPin;
}

function iconeWebParaCategoria(cat: string): string {
  return ICONE_CAT_WEB[cat] ?? "map-pin";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizarModal(m: string | null): ModalApiTransporte | null {
  if (!m) return null;
  const v = m.toLowerCase();
  if (v === "onibus") return "onibus";
  if (v === "brt") return "brt";
  if (v === "trem") return "trem";
  if (v === "metro") return "metro";
  return null;
}
const normalizarModalNome = (nome?: string | null) =>
  (nome ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

type SentidoTipo = "ida" | "volta";

function tipoSentidoPorNome(nome: string | null): SentidoTipo | null {
  if (!nome) return null;
  const n = nome.toLowerCase();
  if (n.includes("ida") || n.includes("(1)")) return "ida";
  if (n.includes("volta") || n.includes("(0)")) return "volta";
  return null;
}

// ─── Painel POI (parte inferior) ──────────────────────────────────────────────

interface PainelPoiProps {
  poi: PoiDto;
  parada?: Parada | null;
  onFechar: () => void;
  onAbrirMapa?: () => void;
}

function PainelPoi({ poi, parada, onFechar, onAbrirMapa }: PainelPoiProps) {
  const { cores } = useTema();
  const Icon = iconeParaCategoria(poi.categoria);
  const cor = COR_PRIORIDADE[Math.min(poi.prioridade - 1, 2)];

  return (
    <Animated.View
      entering={FadeInUp.duration(350).springify()}
      exiting={FadeOutDown.duration(250)}
      style={{
        position: "absolute",
        bottom: 90,
        left: 16,
        right: 16,
        backgroundColor: cores.fundoCard,
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: cores.borda,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
        zIndex: 50,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: cor.fundo,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Icon size={20} color={cor.texto} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontWeight: "700",
              fontSize: 15,
              color: cores.textoPrimario,
              marginBottom: 2,
            }}
          >
            {poi.nome}
          </Text>
          <Text style={{ fontSize: 12, color: cores.textoSecundario }}>
            {poi.categoria}
          </Text>
        </View>
        <Pressable
          onPress={onFechar}
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: cores.fundoSecundario,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={14} color={cores.textoSecundario} />
        </Pressable>
      </View>

      {/* Info parada associada + distância */}
      <View
        style={{
          marginTop: 12,
          padding: 10,
          borderRadius: 10,
          backgroundColor: cores.fundoSecundario,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <MapPin size={14} color={cores.iconePrimario} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: cores.textoPrimario,
            }}
          >
            {poi.nomeParada || parada?.nome || "Parada"}
          </Text>
          <Text style={{ fontSize: 11, color: cores.textoSecundario }}>
            {Math.round(poi.distanciaMetros)} m da parada · linha pontilhada no
            mapa
          </Text>
        </View>
      </View>

      {onAbrirMapa && (
        <Pressable
          onPress={onAbrirMapa}
          style={{
            marginTop: 10,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: cores.fundoPrimario,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: cores.textoInverso,
            }}
          >
            Abrir no mapa
          </Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// ─── Lista POIs ───────────────────────────────────────────────────────────────

interface PoisListaProps {
  pois: PoiDto[];
  aoClicarPoi: (poi: PoiDto) => void;
  scrollDown?: () => void;
}

function PoisLista({ pois, aoClicarPoi, scrollDown }: PoisListaProps) {
  const { cores } = useTema();
  const [mostrar, setMostrar] = useState(false);
  const exibidos = mostrar ? pois : pois.slice(0, 4);

  if (pois.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginHorizontal: 20,
          marginBottom: 10,
          marginTop: 4,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "700",
            flex: 1,
            color: cores.textoPrimario,
          }}
        >
          Pontos de Interesse
        </Text>
        {pois.length > 4 && (
          <Pressable
            onPress={() => {
              const novo = !mostrar;
              setMostrar(novo);
              if (novo && scrollDown) setTimeout(scrollDown, 200);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 10,
              backgroundColor: cores.fundoPrimario,
              gap: 4,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: cores.textoInverso,
              }}
            >
              {mostrar ? "Menos" : "Mais"}
            </Text>
            {mostrar ? (
              <ChevronUp size={13} color={cores.textoInverso} />
            ) : (
              <ChevronDown size={13} color={cores.textoInverso} />
            )}
          </Pressable>
        )}
      </View>

      <View
        style={{
          marginHorizontal: 20,
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: cores.fundoCard,
          borderWidth: 1,
          borderColor: cores.borda,
        }}
      >
        {exibidos.map((poi, index) => {
          const Icon = iconeParaCategoria(poi.categoria);
          const cor = COR_PRIORIDADE[Math.min(poi.prioridade - 1, 2)];
          const isLast = index === exibidos.length - 1;
          return (
            <Pressable
              key={poi.poiId + index}
              onPress={() => aoClicarPoi(poi)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
                borderBottomWidth: isLast ? 0 : 1,
                borderBottomColor: cores.bordaSuave,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: cor.fundo,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <Icon size={16} color={cor.texto} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontWeight: "600",
                    fontSize: 13,
                    color: cores.textoPrimario,
                  }}
                  numberOfLines={1}
                >
                  {poi.nome}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: cores.textoSecundario,
                    marginTop: 1,
                  }}
                >
                  {poi.categoria}
                </Text>
              </View>
              <ChevronDown
                size={14}
                color={cores.textoSecundario}
                style={{ transform: [{ rotate: "-90deg" }] }}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────

const Linhas = () => {
  const { temaAtual, estiloMapaAtual, cores } = useTema();
  const { itinerariosPorId, garantirItinerario, getVeiculosPorCodigo } =
    useMobilidadeRio();
  const [location, setLocation] = useState<LocationObject | null>(null);

  useEffect(() => {
    (async () => {
      const { granted } = await requestForegroundPermissionsAsync();
      if (granted) setLocation(await getCurrentPositionAsync());
    })();
  }, []);

  useEffect(() => {
    let sub: any;
    (async () => {
      sub = await watchPositionAsync(
        {
          accuracy: LocationAccuracy.Highest,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (r) => setLocation(r),
      );
    })();
    return () => sub?.remove();
  }, []);

  // ─── Modal de transporte ──────────────────────────────────────────────────

  const [modais, setModais] = useState<ModalTransporteDto[]>([]);
  const [modalIdSelecionado, setModalIdSelecionado] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>("Onibus");


  useEffect(() => {
    buscarModais().then((lista) => {
      setModais(lista);
      if (lista.length > 0) {
        carregarModalSelecionado().then((modalIdSalvo) => {
          const salvo = modalIdSalvo
            ? lista.find((m) => m.id === modalIdSalvo)
            : null;
          const atual = modal
            ? lista.find((m) => m.nome.toLowerCase() === modal.toLowerCase())
            : null;
          const escolhido = salvo ?? atual ?? lista[0];
          setModal(escolhido.nome);
          setModalIdSelecionado(escolhido.id);
        });
      }
    });
  }, []);

  const placeholderBusca = useMemo(() => {
    if (modal === "BRT") return "Buscar Linhas BRT";
    if (modal === "Trem") return "Buscar Ramal";
    if (modal === "Metro") return "Buscar Linhas Metrô";
    return "Buscar Linhas Ônibus";
  }, [modal]);

  const iconeBusca = useMemo<LucideIcon>(() => {
    if (modal === "BRT") return Bus;
    if (modal === "Trem") return Train;
    if (modal === "Metro") return TrainFrontTunnel;
    return BusFront;
  }, [modal]);

  // ─── Busca ────────────────────────────────────────────────────────────────

  const [busca, setBusca] = useState("");
  const [opcoesBusca, setOpcoesBusca] = useState<OpcaoBusca[]>([]);
  const [linhaSelecionada, setLinhaSelecionada] = useState<OpcaoBusca | null>(
    null,
  );
  const [detalhesLinha, setDetalhesLinha] = useState<LinhaDetalhesDto | null>(
    null,
  );

  const itinerario = linhaSelecionada
    ? (itinerariosPorId[linhaSelecionada.linha.id] ?? null)
    : null;

  useEffect(() => {
    if (!busca.trim() || linhaSelecionada) {
      setOpcoesBusca([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        setOpcoesBusca(await buscarOpcoesPorNome(busca, 1, 20, modalIdSelecionado ?? undefined));
      } catch {
        setOpcoesBusca([]);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [busca, linhaSelecionada, modalIdSelecionado]);

  const buscaAtiva = busca !== "" && opcoesBusca.length > 0;

  // ─── Sentidos reais ───────────────────────────────────────────────────────

  const [sentidos, setSentidos] = useState<SentidoSimples[]>([]);
  const [sentidoSelecionado, setSentidoSelecionado] = useState<string | null>(
    null,
  );

  const opcoesSentido = useMemo(() => sentidos.map((s) => s.nome), [sentidos]);

  // ─── POIs ─────────────────────────────────────────────────────────────────

  const [pois, setPois] = useState<PoiDto[]>([]);
  const [carregandoPois, setCarregandoPois] = useState(false);
  const [poiSelecionado, setPoiSelecionado] = useState<PoiDto | null>(null);
  const [paradaPoi, setParadaPoi] = useState<Parada | null>(null);

  const aoClicarPoi = useCallback(
    async (poi: PoiDto) => {
      setPoiSelecionado(poi);

      const tipo = tipoSentidoPorNome(sentidoSelecionado);
      const itId =
        tipo === "volta"
          ? itinerario?.itinerarioIdVolta
          : itinerario?.itinerarioIdIda;
      const paradasRef = itId
        ? itinerario?.paradasPorItinerario?.[itId]
        : itinerario?.paradas;
      const parada =
        paradasRef?.find((p) => p.paradaId === poi.paradaId) ?? null;
      setParadaPoi(parada ?? null);

      let distancia = poi.distanciaMetros;
      if (poi.paradaId) {
        try {
          const res = await buscarPoisPorParada(poi.paradaId);
          const match = res.find((p) => p.poiId === poi.poiId);
          if (match?.distanciaMetros != null) {
            distancia = match.distanciaMetros;
            setPoiSelecionado((prev) =>
              prev && prev.poiId === poi.poiId
                ? { ...prev, distanciaMetros: match.distanciaMetros }
                : prev,
            );
          }
        } catch {
          // ignora erro ao atualizar distancia
        }
      }

      const cor = COR_PRIORIDADE[Math.min(poi.prioridade - 1, 2)];

      mapRef.current?.mostrarPoi({
        poi: { lat: poi.latitude, lng: poi.longitude, nome: poi.nome },
        parada: parada
          ? { lat: parada.latitude, lng: parada.longitude, nome: parada.nome }
          : null,
        distancia: distancia != null ? Math.round(distancia) : null,
        icone: iconeWebParaCategoria(poi.categoria),
        cor: cor.texto,
      });

      if (mapRef.current?.fitToCoordinates) {
        if (parada) {
          mapRef.current.fitToCoordinates([
            { latitude: parada.latitude, longitude: parada.longitude },
            { latitude: poi.latitude, longitude: poi.longitude },
          ]);
        } else {
          mapRef.current.fitToCoordinates([
            { latitude: poi.latitude, longitude: poi.longitude },
            {
              latitude: poi.latitude + 0.0005,
              longitude: poi.longitude + 0.0005,
            },
          ]);
        }
      }
    },
    [itinerario, sentidoSelecionado],
  );

  // ─── Selecionar linha ─────────────────────────────────────────────────────

  const modalAtual = normalizarModal(modal);

  const selecionarLinha = useCallback(
    async (opcao: OpcaoBusca) => {
      setBusca(opcao.linha.codigo || opcao.linha.nome);
      setOpcoesBusca([]);
      setLinhaSelecionada(opcao);
      setSentidoSelecionado(null);
      setSentidos([]);
      setPois([]);
      setPoiSelecionado(null);
      setDetalhesLinha(null);
      Keyboard.dismiss();

      const m = normalizarModal(modal);
      if (!m) return;

      // Busca itinerário e sentidos em paralelo
      const [itRes, sentidosRes, detalhesRes] = await Promise.allSettled([
        garantirItinerario(
          opcao.linha.id,
          opcao.linha.codigo || opcao.linha.nome,
          m,
          true,
        ),
        buscarSentidosPorLinha(opcao.linha.id),
        buscarDetalhesLinha(opcao.linha.id),
      ]);
      if (itRes.status === "rejected") {
        console.error("Erro ao carregar itinerário da linha", itRes.reason);
      }
      setSentidos(sentidosRes.status === "fulfilled" ? sentidosRes.value : []);
      setDetalhesLinha(
        detalhesRes.status === "fulfilled" ? detalhesRes.value : null,
      );
    },
    [modal, garantirItinerario],
  );

  // ─── Ao selecionar sentido: carrega POIs ─────────────────────────────────

  useEffect(() => {
    if (!sentidoSelecionado || !itinerario) {
      setPois([]);
      return;
    }

    // Descobre tipo do sentido pelo nome (ex: "Terminal Campo Grande (1)" → ida)
    const tipo = tipoSentidoPorNome(sentidoSelecionado);
    const itId =
      tipo === "volta"
        ? itinerario.itinerarioIdVolta
        : itinerario.itinerarioIdIda;
    if (!itId) {
      setPois([]);
      return;
    }

    let cancelado = false;
    setCarregandoPois(true);
    buscarPoisPorItinerario(itId, "prioridade,-ordemParada")
      .then((res) => {
        if (!cancelado) setPois(res);
      })
      .catch(() => {
        if (!cancelado) setPois([]);
      })
      .finally(() => {
        if (!cancelado) setCarregandoPois(false);
      });

    return () => {
      cancelado = true;
    };
  }, [sentidoSelecionado, itinerario]);

  // ─── Veículos para mapa ───────────────────────────────────────────────────

  const tipoSentido = tipoSentidoPorNome(sentidoSelecionado);

  const itinerarioIdFiltro = useMemo(() => {
    if (!itinerario || !tipoSentido) return null;
    return tipoSentido === "volta"
      ? (itinerario.itinerarioIdVolta ?? null)
      : (itinerario.itinerarioIdIda ?? null);
  }, [itinerario, tipoSentido]);

  const segmentosTrajeto = useMemo(() => {
    if (!itinerario) return [] as [number, number][][];
    if (tipoSentido === "ida" && itinerario.segmentos[0])
      return [itinerario.segmentos[0]];
    if (tipoSentido === "volta" && itinerario.segmentos[1])
      return [itinerario.segmentos[1]];
    return itinerario.segmentos;
  }, [itinerario, tipoSentido]);

  const paradasSentido = useMemo(() => {
    if (!itinerario) return [] as Parada[];
    if (!itinerarioIdFiltro) return itinerario.paradas ?? [];
    return (
      itinerario.paradasPorItinerario?.[itinerarioIdFiltro] ??
      itinerario.paradas ??
      []
    );
  }, [itinerario, itinerarioIdFiltro]);

  const veiculos = useMemo<VeiculoTempoReal[]>(() => {
    if (!linhaSelecionada || !modalAtual || !tipoSentido) return [];
    const codigo = linhaSelecionada.linha.codigo || linhaSelecionada.linha.nome;
    return getVeiculosPorCodigo(codigo, itinerarioIdFiltro);
  }, [
    linhaSelecionada,
    modalAtual,
    tipoSentido,
    itinerarioIdFiltro,
    getVeiculosPorCodigo,
  ]);

  const dadosParaMapa = useMemo(() => {
    if (!linhaSelecionada || !modalAtual || !sentidoSelecionado) return [];

    const itinerarioSegmentoMap: Record<string, number> = {};
    if (itinerario?.itinerarioIdIda) {
      itinerarioSegmentoMap[itinerario.itinerarioIdIda] = 0;
    }
    if (itinerario?.itinerarioIdVolta) {
      itinerarioSegmentoMap[itinerario.itinerarioIdVolta] = 1;
    }

    const corLinha =
      modalAtual === "trem"
        ? Object.entries(CORES_RAMAIS_TREM).find(([ramal]) =>
            normalizarModalNome(linhaSelecionada.nomeExibicao).includes(ramal),
          )?.[1] ?? "#64a70b"
        : "#2563eb";
    return [
      {
        nome: linhaSelecionada.linha.codigo || linhaSelecionada.linha.nome,
        cor: corLinha,
        modal: modalAtual,
        segmentos: segmentosTrajeto,
        coordenadas: segmentosTrajeto[0] ?? [],
        paradas: paradasSentido,
        mostrarParadas: true,
        modoSentido: tipoSentido === "ida" ? "ida" : "volta",
        itinerarioSegmentoMap, // ← novo
        posicoes: veiculos.map((v) => ({
          id: v.id,
          latitude: v.latitude,
          longitude: v.longitude,
          direcao: v.direcao,
          velocidade: v.velocidade,
          velocidadeMedia: v.velocidadeMedia ?? null,
          sentidoNome: sentidoSelecionado,
          timestamp: v.timestamp,
          proximaParadaNome: v.proximaParadaNome ?? null,
          distanciaProximaParadaMetros: v.distanciaProximaParadaMetros ?? null,
          status: v.status ?? 0,
          posicaoNaRota: v.posicaoNaRota ?? null, // ← novo
          comprimentoRotaMetros: v.comprimentoRotaMetros ?? null, // ← novo
          itinerarioId: v.itinerarioId ?? null, // ← novo
        })),
      },
    ];
  }, [
    linhaSelecionada,
    modalAtual,
    sentidoSelecionado,
    segmentosTrajeto,
    itinerario,
    tipoSentido,
    veiculos,
  ]);

  const mapRef = useRef<MapaOSMRef>(null);
  useEffect(() => {
    if (!poiSelecionado) {
      mapRef.current?.limparPoi();
    }
  }, [poiSelecionado]);

  useEffect(() => {
    if (!linhaSelecionada || segmentosTrajeto.length === 0) return;
    const coords = (segmentosTrajeto[0] ?? []).map(([lat, lng]) => ({
      latitude: lat,
      longitude: lng,
    }));
    if (coords.length > 0)
      setTimeout(() => mapRef.current?.fitToCoordinates(coords), 500);
  }, [linhaSelecionada, segmentosTrajeto]);

  // ─── Reset ao trocar modal ────────────────────────────────────────────────

  useEffect(() => {
    setBusca("");
    setOpcoesBusca([]);
    setLinhaSelecionada(null);
    setSentidoSelecionado(null);
    setSentidos([]);
    setPois([]);
    setPoiSelecionado(null);
    setParadaPoi(null);
    setDetalhesLinha(null);
    mapRef.current?.limparPoi();
  }, [modal]);

  const abrirNoMapa = useCallback(() => {
    if (!poiSelecionado) return;
    const destino = `${poiSelecionado.latitude},${poiSelecionado.longitude}`;
    if (paradaPoi) {
      const origem = `${paradaPoi.latitude},${paradaPoi.longitude}`;
      const url = `https://www.google.com/maps/dir/?api=1&origin=${origem}&destination=${destino}&travelmode=walking`;
      Linking.openURL(url).catch(() => undefined);
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${destino}`;
    Linking.openURL(url).catch(() => undefined);
  }, [poiSelecionado, paradaPoi]);

  // ─── Panel deslizável ─────────────────────────────────────────────────────

  const screenH = Dimensions.get("window").height;
  const sbH = Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0;
  const MIN_H = screenH * 0.3;
  const MAX_H = screenH * 1.0;
  const DEF_H = screenH * 0.5;

  const containerH = useSharedValue(DEF_H);
  const startH = useSharedValue(DEF_H);

  useEffect(() => {
    const up = Keyboard.addListener("keyboardDidShow", () => {
      containerH.value = withSpring(screenH * 0.82);
    });
    const dn = Keyboard.addListener("keyboardDidHide", () => {
      containerH.value = withSpring(
        sentidoSelecionado
          ? screenH * 0.75
          : linhaSelecionada
            ? screenH * 0.55
            : DEF_H,
      );
    });
    return () => {
      up.remove();
      dn.remove();
    };
  }, [linhaSelecionada, sentidoSelecionado, containerH, screenH, DEF_H]);

  useEffect(() => {
    if (sentidoSelecionado && linhaSelecionada)
      containerH.value = withSpring(screenH * 0.75);
  }, [sentidoSelecionado, linhaSelecionada, containerH, screenH]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startH.value = containerH.value;
    })
    .onUpdate((e) => {
      const nh = startH.value - e.translationY;
      if (nh >= MIN_H && nh <= MAX_H) containerH.value = nh;
    })
    .onEnd((e) => {
      const nh = startH.value - e.translationY;
      if (nh < MIN_H + 60) containerH.value = withSpring(MIN_H);
      else if (nh > MAX_H - 60) containerH.value = withSpring(MAX_H);
      else if (Math.abs(nh - DEF_H) < 90) containerH.value = withSpring(DEF_H);
      else containerH.value = withSpring(Math.max(MIN_H, Math.min(MAX_H, nh)));
    });

  const animStyle = useAnimatedStyle(() => ({
    height: containerH.value,
    paddingTop: containerH.value > screenH * 0.95 ? sbH : 0,
  }));

  const scrollRef = useRef<FlatList>(null);
  const scrollDown = useCallback(() => {
    setTimeout(
      () => scrollRef.current?.scrollToOffset({ offset: 600, animated: true }),
      300,
    );
  }, []);

  const dadosBuscaFormatados = useMemo(
    () =>
      opcoesBusca.map((o) => ({
        id: o.linha.id,
        nome: o.nomeExibicao,
        sentido: o.linha.codigo || o.linha.nome,
        _opcao: o,
      })),
    [opcoesBusca],
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundoApp }}>
      {
        <MapaOSM
          ref={mapRef}
          location={location}
          linhasParaMostrar={dadosParaMapa}
          darkMode={temaAtual === "escuro"}
          estiloMapa={estiloMapaAtual}
        />
      }

      {/* Painel POI selecionado */}
      {poiSelecionado && (
        <PainelPoi
          poi={poiSelecionado}
          parada={paradaPoi}
          onFechar={() => {
            setPoiSelecionado(null);
            setParadaPoi(null);
          }}
          onAbrirMapa={abrirNoMapa}
        />
      )}

      {/* Panel inferior */}
      <Animated.View
        style={[
          animStyle,
          {
            backgroundColor: cores.fundoApp,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.18,
            shadowRadius: 6,
            elevation: 10,
            overflow: "hidden",
          },
        ]}
      >
        <GestureDetector gesture={panGesture}>
          <View style={{ alignItems: "center", paddingVertical: 14 }}>
            <View
              style={{
                width: 44,
                height: 5,
                borderRadius: 3,
                backgroundColor: cores.borda,
              }}
            />
          </View>
        </GestureDetector>

        {/* Seletor de modal */}
        <View style={{ paddingBottom: 8, backgroundColor: cores.fundoApp }}>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "700",
              textAlign: "center",
              color: cores.textoPrimario,
              marginTop: 2,
            }}
          >
            Linhas e Horários
          </Text>
          <SelectTransporte
            modal={modal}
            setModal={(m) => {
              setModal(m);
              const md = modais.find(
                (x) => normalizarModalNome(x.nome) === normalizarModalNome(m),
              );
              setModalIdSelecionado(md?.id ?? null);
            }}
          />
        </View>

        <FlatList
          ref={scrollRef}
          scrollEnabled={!buscaAtiva}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          data={[{ key: "content" }]}
          keyExtractor={(i) => i.key}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={() => (
            <>
              {/* Busca */}
              <View style={{ paddingTop: 12, backgroundColor: cores.fundoApp }}>
                <InputBusca
                  placeholder={placeholderBusca}
                  icon={iconeBusca}
                  className="!w-[90%] self-center mb-3"
                  value={busca}
                  onChangeText={(t) => {
                    setBusca(t);
                    if (
                      linhaSelecionada &&
                      t !==
                        (linhaSelecionada.linha.codigo ||
                          linhaSelecionada.linha.nome)
                    ) {
                      setLinhaSelecionada(null);
                      setSentidoSelecionado(null);
                      setSentidos([]);
                      setPois([]);
                      setPoiSelecionado(null);
                      setDetalhesLinha(null);
                    }
                  }}
                />

                {buscaAtiva && (
                  <ResultadoBusca
                    data={dadosBuscaFormatados}
                    listaSelecionada={(item) => selecionarLinha(item._opcao)}
                    className="rounded-2xl !w-[90%] self-center mb-3 shadow-lg"
                    maxHeight={150}
                  />
                )}

                {/* Select de sentido — sem valor default, usuário escolhe */}
                {linhaSelecionada && (
                  <Select
                    placeholder={
                      sentidos.length === 0
                        ? "Carregando sentidos…"
                        : "Selecione o sentido"
                    }
                    className="!w-[90%] self-center"
                    options={opcoesSentido}
                    value={sentidoSelecionado}
                    onChange={(v) => {
                      setSentidoSelecionado(v);
                      setPoiSelecionado(null);
                    }}
                  />
                )}
              </View>

              {/* Conteúdo da linha */}
              {linhaSelecionada && sentidoSelecionado && (
                <Animated.View
                  entering={FadeInUp.duration(400).springify()}
                  style={{ width: "100%", marginTop: 20 }}
                >
                  {/* Título: só código da linha */}
                  <Text
                    style={{
                      marginLeft: 20,
                      marginBottom: 12,
                      fontWeight: "700",
                      fontSize: 17,
                      color: cores.textoPrimario,
                    }}
                  >
                    Linha{" "}
                    {linhaSelecionada.linha.codigo ||
                      linhaSelecionada.linha.nome}
                    {"  "}
                    <Text
                      style={{
                        fontWeight: "400",
                        fontSize: 13,
                        color: cores.textoSecundario,
                      }}
                    >
                      {sentidoSelecionado}
                    </Text>
                  </Text>

                  <Chegada intervalo="~20 min" />
                  <Tarifas
                    valor={detalhesLinha?.tarifaAtual?.tarifa}
                    modal={modal?.toLowerCase() ?? "onibus"}
                  />

                  {carregandoPois ? (
                    <View style={{ alignItems: "center", padding: 16 }}>
                      <Text
                        style={{ color: cores.textoSecundario, fontSize: 13 }}
                      >
                        Carregando pontos de interesse…
                      </Text>
                    </View>
                  ) : (
                    <PoisLista
                      pois={pois}
                      aoClicarPoi={aoClicarPoi}
                      scrollDown={scrollDown}
                    />
                  )}
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
