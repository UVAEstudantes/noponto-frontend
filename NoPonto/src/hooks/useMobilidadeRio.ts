import {
  cancelarLinha,
  conectarGpsHub,
  obterDiagnosticoGpsHub,
  iniciarGpsHub,
  inscreverLinha,
  removerGpsHubListener,
} from "@/src/services/gpsHub";
import { construirLinhasDisponiveis } from "@/src/services/mobilidadeRio";
import {
  listarPadroesV2,
  listarSentidosV2,
  obterItinerarioPadraoVersaoV2,
} from "@/src/services/estruturaV2";
import { rotuloPadraoV2, rotuloSentidoPublico } from "@/src/types/estruturaV2";
import type { ItinerarioPadraoVersaoV2 } from "@/src/types/estruturaV2";
import { filtrarVeiculosPorPadroesVisiveis, reconciliarSnapshotsRodoviarios } from "@/src/services/veiculosMapa";
import { AppState } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ItinerarioLinha,
  LinhaTempoReal,
  ModalApiTransporte,
  ModoSentido,
  VeiculoTempoReal,
} from "@/src/types/transporte";

export interface LinhaSelecionadaInfo {
  /** linhaId — UUID da linha no banco */
  linhaId: string;
  /** Código da linha, ex: "838" */
  linhaCodigo: string;
  /** Nome de exibição, ex: "838 - Terminal Campo Grande" */
  nomeExibicao: string;
  /** Subtítulo público canônico, igual ao resultado da busca. */
  subtitulo?: string;
  modal: ModalApiTransporte;
  cor: string;
  ativa: boolean;
  modoSentido: ModoSentido;
  mostrarParadas: boolean;
}

export function useMobilidadeRio({ enabled = true }: { enabled?: boolean } = {}) {
  const [veiculos, setVeiculos] = useState<VeiculoTempoReal[]>([]);
  const [estruturasRealtimePorVersao, setEstruturasRealtimePorVersao] = useState<
    Record<string, ItinerarioPadraoVersaoV2>
  >({});
  const [linhasDisponiveis, setLinhasDisponiveis] = useState<LinhaTempoReal[]>(
    [],
  );

  /** Cache de itinerários: linhaId → ItinerarioLinha | null */
  const [itinerariosPorId, setItinerariosPorId] = useState<
    Record<string, ItinerarioLinha | null>
  >({});

  const montadoRef = useRef(true);
  const [estadosItinerarios, setEstadosItinerarios] = useState<Record<string,
    { estado: "carregando" | "pronto" | "indisponivel" | "erro"; mensagem?: string }>>({});
  const pedidosRef = useRef(new Map<string, { codigo: string; modal: ModalApiTransporte; paradas: boolean }>());
  const estadosRef = useRef(estadosItinerarios);
  const registrarEstado = useCallback((id: string, estado: typeof estadosItinerarios[string]) => {
    estadosRef.current = { ...estadosRef.current, [id]: estado };
    if (montadoRef.current) setEstadosItinerarios(estadosRef.current);
  }, []);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const itinerariosRef = useRef<Record<string, ItinerarioLinha | null>>({});
  const emAndamentoRef = useRef<
    Partial<Record<string, Promise<ItinerarioLinha | null>>>
  >({});

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  // ─── SignalR ──────────────────────────────────────────────────────────────

  const handleRealtime = useCallback((listaVeiculos: VeiculoTempoReal[]) => {
    if (!montadoRef.current) return;
    if (!Array.isArray(listaVeiculos)) return;

    setVeiculos((prev) => {
      return reconciliarSnapshotsRodoviarios(prev, listaVeiculos);
    });

    setLinhasDisponiveis((prev) => {
      const novos = construirLinhasDisponiveis(listaVeiculos);
      const codigosNovos = new Set(novos.map((l) => l.nome));
      const semEssas = prev.filter((l) => !codigosNovos.has(l.nome));
      return [...semEssas, ...novos];
    });

    setErro(null);
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    iniciarGpsHub(handleRealtime);
    conectarGpsHub();

    return () => {
      removerGpsHubListener(handleRealtime);
    };
  }, [enabled, handleRealtime]);

  // Um veículo pode referenciar uma versão ainda não selecionada/carregada na UI.
  // O service deduplica a requisição pela chave oficial PadraoVersaoId.
  useEffect(() => {
    const ids = [...new Set(veiculos.map((v) => v.padraoVersaoId))]
      .filter((id): id is string => id !== null)
      .filter((id) => !estruturasRealtimePorVersao[id]);
    if (ids.length === 0) return;
    let active = true;
    Promise.all(ids.map(async (id) => [id, await obterItinerarioPadraoVersaoV2(id)] as const))
      .then((items) => {
        if (!active) return;
        const loaded = items.filter(
          (item): item is readonly [string, ItinerarioPadraoVersaoV2] =>
            item[1] !== null,
        );
        if (loaded.length === 0) return;
        setEstruturasRealtimePorVersao((current) => {
          const next = { ...current };
          loaded.forEach(([id, estrutura]) => { next[id] = estrutura; });
          return next;
        });
      });
    return () => { active = false; };
  }, [veiculos, estruturasRealtimePorVersao]);

  // ─── Itinerários ──────────────────────────────────────────────────────────

  /**
   * Carrega todos os padrões publicados da linha pela estrutura V2.
   * Cada geometria e lista de ocorrências é cacheada pelo PadraoVersaoId.
   * Inscreve no hub SignalR para receber veículos em tempo real.
   */
  const garantirItinerario = useCallback(
    async (
      linhaId: string,
      linhaCodigo: string,
      modal: ModalApiTransporte,
      incluirParadas: boolean = false,
    ): Promise<ItinerarioLinha | null> => {
      pedidosRef.current.set(linhaId, { codigo: linhaCodigo, modal, paradas: incluirParadas });
      const carregado = itinerariosRef.current[linhaId];
      if (carregado?.incluiParadas) return carregado;
      // Uma falha compartilhada termina a tentativa; não dispara um segundo pedido em cascata.
      if (emAndamentoRef.current[linhaId]) return emAndamentoRef.current[linhaId]!;
      registrarEstado(linhaId, { estado: "carregando" });

      const promessa = (async (): Promise<ItinerarioLinha | null> => {
        const sentidos = await listarSentidosV2(linhaCodigo);
        const padroesPorSentido = await Promise.all(
          sentidos.map(async (sentido) => ({
            sentido,
            padroes: await listarPadroesV2(sentido.id),
          })),
        );
        const escolhas = padroesPorSentido.flatMap(({ sentido, padroes }) =>
          padroes
            .filter((padrao) => Boolean(padrao.versaoAtualId))
            .map((padrao) => ({ sentido, padrao, versaoId: padrao.versaoAtualId! })),
        );
        const itinerarios = await Promise.all(
          escolhas.map((item) => obterItinerarioPadraoVersaoV2(item.versaoId)),
        );
        const segmentos: [number, number][][] = [];
        const paradasPorItinerario: Record<string, import("@/src/types/transporte").Parada[]> = {};
        const itinerarioSentidoMap: Record<string, string> = {};
        const padroesV2 = escolhas.flatMap((item, index) => {
          const estrutura = itinerarios[index];
          if (!estrutura || estrutura.geometria.tipo !== "LineString" || !estrutura.geometria.coordenadas.length)
            throw new Error("Itinerário V2 temporariamente indisponível ou incompleto.");
          const segmento = estrutura.geometria.coordenadas.map(
            ([longitude, latitude]) => [latitude, longitude] as [number, number],
          );
          const paradas = [...estrutura.ocorrencias]
                .sort((a, b) => a.ordem - b.ordem)
                .map((ocorrencia) => ({
                  paradaId: ocorrencia.paradaId,
                  codigo: ocorrencia.codigoParada,
                  nome: ocorrencia.nome,
                  ordem: ocorrencia.ordem,
                  latitude: ocorrencia.latitude,
                  longitude: ocorrencia.longitude,
                  posicaoLinha: ocorrencia.posicaoLinha,
                }));
          const segmentoIndice = segmentos.push(segmento) - 1;
          paradasPorItinerario[item.versaoId] = paradas;
          const sentidoPublico = rotuloSentidoPublico(
            estrutura,
            `Sentido ${index + 1}`,
          );
          itinerarioSentidoMap[item.versaoId] = sentidoPublico;
          return [{
            sentidoId: item.sentido.id,
            sentidoNome: sentidoPublico,
            padraoOperacionalId: item.padrao.id,
            padraoVersaoId: item.versaoId,
            rotulo: rotuloPadraoV2(item.padrao),
            segmentoIndice,
            paradas,
          }];
        });
        if (padroesV2.length === 0) return null;
        const todasParadas = padroesV2.flatMap((item) => item.paradas)
          .filter((parada, index, all) =>
            all.findIndex((candidate) => candidate.paradaId === parada.paradaId) === index,
          );
        return {
          linha: linhaCodigo,
          modal,
          segmentos,
          paradas: todasParadas,
          paradasPorItinerario,
          itinerarioSentidoMap,
          incluiParadas: true,
          padroesV2,
        };
      })()
        .then((itinerario) => {
          if (!montadoRef.current || !pedidosRef.current.has(linhaId)) return itinerario;
          registrarEstado(linhaId, { estado: itinerario ? "pronto" : "indisponivel" });
          if (itinerario) itinerariosRef.current[linhaId] = itinerario;

          setItinerariosPorId((prev) => {
            if (!itinerario && prev[linhaId]) return prev;
            return { ...prev, [linhaId]: itinerario };
          });

          if (itinerario) {
            inscreverLinha(linhaCodigo).catch(console.error);
          }

          return itinerario;
        })
        .catch((err) => {
          console.error(`Erro ao carregar itinerário ${linhaId}:`, err);
          if (pedidosRef.current.has(linhaId)) registrarEstado(linhaId, {
            estado: "erro", mensagem: "Itinerário temporariamente indisponível.",
          });
          return null;
        })
        .finally(() => {
          delete emAndamentoRef.current[linhaId];
        });

      emAndamentoRef.current[linhaId] = promessa;
      return promessa;
    },
    [registrarEstado],
  );

  const tentarNovamenteItinerarios = useCallback(() => {
    pedidosRef.current.forEach((pedido, id) => {
      if (estadosRef.current[id]?.estado === "erro") {
        void garantirItinerario(id, pedido.codigo, pedido.modal, pedido.paradas);
      }
    });
  }, [garantirItinerario]);

  useEffect(() => {
    if (!enabled) return;
    let ativo = true;
    const recuperar = () => {
      if (AppState.currentState !== "active") return;
      tentarNovamenteItinerarios();
      if (obterDiagnosticoGpsHub().connectionState === "Connected") return;
      void conectarGpsHub().then(() => {
        if (!ativo || !montadoRef.current || AppState.currentState !== "active") return;
        pedidosRef.current.forEach((pedido, id) => {
          if (itinerariosRef.current[id]) void inscreverLinha(pedido.codigo);
        });
      });
    };
    recuperar();
    const subscription = AppState.addEventListener("change", (estado) => {
      if (estado === "active") recuperar();
    });
    // Recuperação de falhas/offline; não é espera para a inicialização nem polling de ETA.
    const retry = setInterval(recuperar, 30000);
    return () => { ativo = false; subscription.remove(); clearInterval(retry); };
  }, [enabled, tentarNovamenteItinerarios]);

  /**
   * Remove o itinerário do cache e cancela a inscrição no hub.
   */
  const removerItinerario = useCallback(
    (linhaId: string, linhaCodigo: string) => {
      setItinerariosPorId((prev) => {
        const next = { ...prev };
        delete next[linhaId];
        return next;
      });
      delete itinerariosRef.current[linhaId];
      pedidosRef.current.delete(linhaId);
      cancelarLinha(linhaCodigo).catch(console.error);
    },
    [],
  );

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Filtra veículos pelo código da linha.
   * Opcionalmente filtra pela versão estrutural oficial visível na UI.
   */
  const getVeiculosPorCodigo = useCallback(
    (linhaCodigo: string, padroesVersoesVisiveis?: ReadonlySet<string> | null): VeiculoTempoReal[] => {
      if (!Array.isArray(veiculos)) return [];
      const codigo = linhaCodigo.trim().toUpperCase();
      let filtrados = veiculos.filter((v) => v.linha === codigo);

      if (padroesVersoesVisiveis) {
        filtrados = filtrarVeiculosPorPadroesVisiveis(
          filtrados,
          padroesVersoesVisiveis,
        );
      }

      return filtrados;
    },
    [veiculos],
  );

  const linhasOrdenadas = useMemo(
    () => linhasDisponiveis ?? [],
    [linhasDisponiveis],
  );

  return {
    carregando,
    erro,
    veiculos,
    linhasDisponiveis: linhasOrdenadas,
    itinerariosPorId,
    estadosItinerarios,
    tentarNovamenteItinerarios,
    estruturasRealtimePorVersao,
    garantirItinerario,
    removerItinerario,
    getVeiculosPorCodigo,
  };
}
