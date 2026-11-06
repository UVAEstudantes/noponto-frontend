import {
  atualizarInscricoesGps,
  reconciliarInscricoesGps,
  conectarGpsHub,
  iniciarGpsHub,
  removerGpsHubListener,
} from "@/src/services/gpsHub";
import { construirLinhasDisponiveis } from "@/src/services/mobilidadeRio";
import { GpsSnapshotGuard, normalizarCodigoLinha } from "@/src/services/gpsSnapshotGuard";
import {
  listarPadroesV2,
  listarSentidosV2,
  obterItinerarioPadraoVersaoV2,
  obterTerminaisOficiaisV2,
} from "@/src/services/estruturaV2";
import { rotuloPadraoV2, rotuloSentidoPublico } from "@/src/types/estruturaV2";
import type { ItinerarioPadraoVersaoV2 } from "@/src/types/estruturaV2";
import { filtrarVeiculosPorPadroesVisiveis, reconciliarSnapshotsRodoviarios } from "@/src/services/veiculosMapa";
import { ROAD_PRESENCE_ENABLED, projectRoadPresence, RETENTION_MS, LEGACY_RETENTION_MS, type RoadEvidence } from '@/src/services/roadPresence';
import { discoverRoadTerminal, traceRoadFilter, traceRoadPresence, traceRoadReconciliation, tracesRoadVehicle } from '@/src/services/roadPresenceDiagnostics';
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

export function useMobilidadeRio({ enabled = true, linhasRealtime }: {
  enabled?: boolean; linhasRealtime?: readonly Pick<LinhaSelecionadaInfo, "linhaId" | "linhaCodigo" | "modal">[];
} = {}) {
  const donoInscricoes = useRef(Symbol("mobilidade"));
  const [veiculos, setVeiculos] = useState<VeiculoTempoReal[]>([]);
  const [presenceNow,setPresenceNow] = useState(Date.now);
  const presenceEvidence = useRef(new Map<string,RoadEvidence>());
  const consumerGuard = useRef(new GpsSnapshotGuard('consumer_gps_guard'));
  const lastPresenceDiagnostic = useRef(0);
  const codigosVisiveisRef = useRef(new Set<string>());
  useEffect(()=>{
    if (!enabled) return;
    const expirar = () => {
      if (AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      const now = Date.now();
      if (ROAD_PRESENCE_ENABLED) setPresenceNow(now);
      setVeiculos(prev => {
        const recentes = reconciliarSnapshotsRodoviarios(prev, [], {enabled:true,now,
          retentionMs:ROAD_PRESENCE_ENABLED ? RETENTION_MS : LEGACY_RETENTION_MS});
        traceRoadReconciliation(prev,recentes,[],[...codigosVisiveisRef.current].sort().join(','),true);
        return recentes.length === prev.length ? prev : recentes;
      });
    };
    const timer=setInterval(expirar, ROAD_PRESENCE_ENABLED ? 1000 : 15000);
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')expirar();});
    return ()=>{clearInterval(timer);subscription.remove();};
  },[enabled]);
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
    const observados = consumerGuard.current.filtrarSnapshot(listaVeiculos);
    listaVeiculos = observados.filter(v => codigosVisiveisRef.current.has(v.linha));
    for (const v of observados) {
      if(tracesRoadVehicle(v))traceRoadPresence('hook_received','accepted_by_consumer_guard',v,
        {present:true,consumerVisible:codigosVisiveisRef.current.has(v.linha),consumerContext:[...codigosVisiveisRef.current].sort().join(',')});
      const evidence = presenceEvidence.current.get(v.idVisual);
      if (evidence && evidence.lineCode !== v.linha) presenceEvidence.current.delete(v.idVisual);
    }
    if (ROAD_PRESENCE_ENABLED) setPresenceNow(Date.now());

    setVeiculos((prev) => {
      const next = reconciliarSnapshotsRodoviarios(prev, listaVeiculos,
        {enabled:ROAD_PRESENCE_ENABLED,now:Date.now()}, observados);
      traceRoadReconciliation(prev,next,observados,[...codigosVisiveisRef.current].sort().join(','));
      return next.length === prev.length && next.every((v, i) => v === prev[i]) ? prev : next;
    });

    if (listaVeiculos.length === 0) return;
    setLinhasDisponiveis((prev) => {
      const novos = construirLinhasDisponiveis(listaVeiculos);
      const codigosNovos = new Set(novos.map((l) => l.nome));
      const semEssas = prev.filter((l) => !codigosNovos.has(l.nome));
      return [...semEssas, ...novos];
    });

    setErro(null);
    setCarregando(false);
  }, []);

  const handleLinhaEsvaziada = useCallback((codigoLinha: string) => {
    const codigo = normalizarCodigoLinha(codigoLinha);
    if (!codigo || !montadoRef.current) return;
    consumerGuard.current.registrarVazio(codigo);
    setVeiculos(prev => prev.filter(v => v.linha !== codigo));
    setLinhasDisponiveis(prev => prev.filter(linha => normalizarCodigoLinha(linha.nome) !== codigo));
    for (const [id, evidence] of presenceEvidence.current) {
      if (evidence.lineCode === codigo) presenceEvidence.current.delete(id);
    }
    setCarregando(false);
    setErro(null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const dono = donoInscricoes.current;
    iniciarGpsHub(handleRealtime, handleLinhaEsvaziada);
    conectarGpsHub();

    return () => {
      removerGpsHubListener(handleRealtime, handleLinhaEsvaziada);
      void atualizarInscricoesGps(dono, []);
    };
  }, [enabled, handleRealtime, handleLinhaEsvaziada]);

  const codigosRealtime = useMemo(() => {
    const linhas = linhasRealtime ?? Object.entries(itinerariosPorId).flatMap(([id, itinerario]) => {
      const pedido = pedidosRef.current.get(id);
      return itinerario && pedido ? [{ linhaId: id, linhaCodigo: pedido.codigo, modal: pedido.modal }] : [];
    });
    return [...new Set(linhas.filter((linha) => linha.modal === "onibus" || linha.modal === "brt")
      .map((linha) => normalizarCodigoLinha(linha.linhaCodigo)).filter((codigo): codigo is string => codigo !== null))].sort().join("\n");
  }, [linhasRealtime, itinerariosPorId]);
  codigosVisiveisRef.current = new Set(enabled && codigosRealtime ? codigosRealtime.split("\n") : []);
  const codigosAnterioresRef = useRef(new Set<string>());
  useEffect(() => {
    for (const codigo of codigosAnterioresRef.current) {
      if (!codigosVisiveisRef.current.has(codigo)) handleLinhaEsvaziada(codigo);
    }
    codigosAnterioresRef.current = codigosVisiveisRef.current;
    void atualizarInscricoesGps(donoInscricoes.current, [...codigosVisiveisRef.current]);
  }, [enabled, codigosRealtime, handleLinhaEsvaziada]);

  // Um veículo pode referenciar uma versão ainda não selecionada/carregada na UI.
  // O service deduplica a requisição pela chave oficial PadraoVersaoId.
  useEffect(() => {
    const idsVisiveis = linhasRealtime ? new Set(linhasRealtime.map((linha) => linha.linhaId)) : null;
    const ids = [...new Set(veiculos.filter((v) => !idsVisiveis || (v.linhaId != null && idsVisiveis.has(v.linhaId))).map((v) => v.padraoVersaoId))]
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
  }, [veiculos, estruturasRealtimePorVersao, linhasRealtime]);

  // ─── Itinerários ──────────────────────────────────────────────────────────

  /**
   * Carrega todos os padrões publicados da linha pela estrutura V2.
   * Cada geometria e lista de ocorrências é cacheada pelo PadraoVersaoId.
   * Inscrições SignalR são controladas separadamente pelas linhas rodoviárias visíveis.
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
        const terminaisOficiais=await obterTerminaisOficiaisV2(linhaCodigo,linhaId).catch(()=>[]);
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
                  distanciaMetros:ocorrencia.distanciaMetros,
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
          terminaisOficiais,
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
    const recuperar = () => {
      if (AppState.currentState !== "active") return;
      tentarNovamenteItinerarios();
      void reconciliarInscricoesGps();
    };
    recuperar();
    const subscription = AppState.addEventListener("change", (estado) => {
      if (estado === "active") recuperar();
    });
    // Recuperação de falhas/offline; não é espera para a inicialização nem polling de ETA.
    const retry = setInterval(recuperar, 30000);
    return () => { subscription.remove(); clearInterval(retry); };
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
      // As inscrições são reconciliadas pelo conjunto visível, independentemente do cache.
    },
    [],
  );

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Filtra veículos pelo código da linha.
   * Opcionalmente filtra pela versão estrutural oficial visível na UI.
   */
  const getVeiculosPorCodigo = useCallback(
    (linhaCodigo: string, padroesVersoesVisiveis?: ReadonlySet<string> | null, presenceLineId?: string): VeiculoTempoReal[] => {
      if (!Array.isArray(veiculos)) return [];
      const codigo = linhaCodigo.trim().toUpperCase();
      let filtrados = veiculos.filter((v) => v.linha === codigo);
      const observacoesNaLinha = filtrados;
      const knownVersions=new Set(Object.keys(estruturasRealtimePorVersao));
      const visibleDirections=new Set([...(padroesVersoesVisiveis ?? [])]
        .map(id=>estruturasRealtimePorVersao[id]?.sentidoId).filter((id):id is string=>!!id));

      if (padroesVersoesVisiveis || (ROAD_PRESENCE_ENABLED && presenceLineId)) {
        filtrados = filtrarVeiculosPorPadroesVisiveis(
          filtrados,
          padroesVersoesVisiveis,
          presenceLineId ? {enabled:ROAD_PRESENCE_ENABLED,now:presenceNow,lineCode:codigo,lineId:presenceLineId,
            knownVersions,visibleDirections} : undefined,
        );
      }

      if (ROAD_PRESENCE_ENABLED && presenceLineId) {
        discoverRoadTerminal(observacoesNaLinha,estruturasRealtimePorVersao,presenceNow);
        observacoesNaLinha.forEach(v=>{if(tracesRoadVehicle(v))traceRoadFilter(v,{lineCode:codigo,lineId:presenceLineId,now:presenceNow},
          padroesVersoesVisiveis,knownVersions,visibleDirections,filtrados.some(visible=>visible.idVisual===v.idVisual));});
        for(const [id,evidence] of presenceEvidence.current) {
          if(presenceNow-evidence.timestamp>RETENTION_MS)presenceEvidence.current.delete(id);
        }
        filtrados=filtrados.flatMap(v=>{
          const projected=projectRoadPresence(v,v.padraoVersaoId ? estruturasRealtimePorVersao[v.padraoVersaoId] : undefined,
            presenceEvidence.current.get(v.idVisual),presenceNow,tracesRoadVehicle(v)?facts=>
              traceRoadPresence('classifier',String(facts.reason),v,facts):undefined);
          if(!projected)return [];
          if(presenceEvidence.current.size<5000 || presenceEvidence.current.has(v.idVisual))
            presenceEvidence.current.set(v.idVisual,projected.evidence);
          return [{...v,...projected.presentation}];
        });
        // One compact sample at most every 30s across this consumer; never log raw payloads.
        if (__DEV__ && observacoesNaLinha.length && presenceNow-lastPresenceDiagnostic.current>=30_000) {
          lastPresenceDiagnostic.current=presenceNow;
          console.debug('[RoadPresence]',{linha:codigo,recebidos:observacoesNaLinha.length,total:filtrados.length,
            origemContagem:'estado_reconciliado_do_hook',
            semVersao:observacoesNaLinha.filter(v=>!v.padraoVersaoId).length,
            semSentido:observacoesNaLinha.filter(v=>!v.sentidoId).length,
            semProgresso:observacoesNaLinha.filter(v=>v.posicaoNaRota==null).length,
            amostra:filtrados.slice(0,5).map(v=>({id:v.idVisual,gpsEm:v.atualizadoEm,
              idadeSegundos:v.presencaIdadeSegundos,atrasado:v.gpsAtrasado,estado:v.presencaEstado}))});
        }
      }

      return filtrados;
    },
    [veiculos,presenceNow,estruturasRealtimePorVersao],
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
