import {
  buscarItinerarioLinhaMesclado,
  buscarVeiculosTempoReal,
  construirLinhasDisponiveis,
} from "@/src/services/mobilidadeRio";
import {
  cancelarLinha,
  conectarGpsHub,
  iniciarGpsHub,
  inscreverLinha,
} from "@/src/services/gpsHub";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ItinerarioLinha,
  LinhaTempoReal,
  ModalApiTransporte,
  ModoSentido,
  VeiculoTempoReal,
} from "@/src/types/transporte";

const INTERVALO_ATUALIZACAO_MS = 60_000;

export interface LinhaSelecionadaInfo {
  /** linhaId — UUID da linha no banco */
  linhaId: string;
  /** Código da linha, ex: "838" */
  linhaCodigo: string;
  /** Nome de exibição, ex: "838 - Terminal Campo Grande" */
  nomeExibicao: string;
  modal: ModalApiTransporte;
  cor: string;
  ativa: boolean;
  modoSentido: ModoSentido;
  mostrarParadas: boolean;
}

export function useMobilidadeRio() {
  const [veiculos, setVeiculos] = useState<VeiculoTempoReal[]>([]);
  const [linhasDisponiveis, setLinhasDisponiveis] = useState<LinhaTempoReal[]>([]);

  /** Cache de itinerários: linhaId → ItinerarioLinha | null */
  const [itinerariosPorId, setItinerariosPorId] = useState<
    Record<string, ItinerarioLinha | null>
  >({});

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const montadoRef = useRef(true);
  const itinerariosRef = useRef<Record<string, ItinerarioLinha | null>>({});
  const emAndamentoRef = useRef<
    Partial<Record<string, Promise<ItinerarioLinha | null>>>
  >({});

  useEffect(() => {
    itinerariosRef.current = itinerariosPorId;
  }, [itinerariosPorId]);

  useEffect(() => {
    return () => {
      montadoRef.current = false;
    };
  }, []);

  // ─── SignalR ──────────────────────────────────────────────────────────────

  useEffect(() => {
    iniciarGpsHub((listaVeiculos) => {
      if (!montadoRef.current) return;
      if (!Array.isArray(listaVeiculos)) return;

      setVeiculos((prev) => {
        if (listaVeiculos.length === 0) return prev;
        const codigoAtualizado = listaVeiculos[0].linha;
        const semEssaLinha = prev.filter((v) => v.linha !== codigoAtualizado);
        return [...semEssaLinha, ...listaVeiculos];
      });

      setLinhasDisponiveis((prev) => {
        const novos = construirLinhasDisponiveis(listaVeiculos);
        const codigosNovos = new Set(novos.map((l) => l.nome));
        const semEssas = prev.filter((l) => !codigosNovos.has(l.nome));
        return [...semEssas, ...novos];
      });

      setErro(null);
      setCarregando(false);
    });

    conectarGpsHub();
  }, []);

  // ─── HTTP Fallback ────────────────────────────────────────────────────────

  useEffect(() => {
    async function fallback() {
      try {
        const lista = await buscarVeiculosTempoReal();
        if (!montadoRef.current || lista.length === 0) return;

        setVeiculos(lista);
        setLinhasDisponiveis(construirLinhasDisponiveis(lista));
        setCarregando(false);
      } catch (err) {
        console.error("Fallback HTTP erro:", err);
      }
    }

    fallback();
    const intervalo = setInterval(fallback, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(intervalo);
  }, []);

  // ─── Itinerários ──────────────────────────────────────────────────────────

  /**
   * Garante que o itinerário mesclado de uma linha está no cache.
   * Usa o novo endpoint /itinerarios/por-linha/{linhaId}/mapa.
   * Inscreve no hub SignalR para receber veículos em tempo real.
   */
  const garantirItinerario = useCallback(
    async (
      linhaId: string,
      linhaCodigo: string,
      modal: ModalApiTransporte,
    ): Promise<ItinerarioLinha | null> => {
      if (linhaId in itinerariosRef.current) {
        return itinerariosRef.current[linhaId];
      }

      if (emAndamentoRef.current[linhaId]) {
        return emAndamentoRef.current[linhaId]!;
      }

      const promessa = buscarItinerarioLinhaMesclado(linhaId, linhaCodigo, modal)
        .then((itinerario) => {
          if (!montadoRef.current) return itinerario;

          setItinerariosPorId((prev) => ({ ...prev, [linhaId]: itinerario }));

          if (itinerario) {
            inscreverLinha(linhaCodigo).catch(console.error);
          }

          return itinerario;
        })
        .catch((err) => {
          console.error(`Erro ao carregar itinerário ${linhaId}:`, err);
          return null;
        })
        .finally(() => {
          delete emAndamentoRef.current[linhaId];
        });

      emAndamentoRef.current[linhaId] = promessa;
      return promessa;
    },
    [],
  );

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
      cancelarLinha(linhaCodigo).catch(console.error);
    },
    [],
  );

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Filtra veículos pelo código da linha.
   * Opcionalmente filtra por itinerarioId (para mostrar só ida ou volta).
   */
  const getVeiculosPorCodigo = useCallback(
    (linhaCodigo: string, itinerarioId?: string | null): VeiculoTempoReal[] => {
      if (!Array.isArray(veiculos)) return [];
      const codigo = linhaCodigo.trim().toUpperCase();
      let filtrados = veiculos.filter((v) => v.linha === codigo);

      if (itinerarioId) {
        filtrados = filtrados.filter((v) => v.itinerarioId === itinerarioId);
      }

      return filtrados;
    },
    [veiculos],
  );

  const linhasOrdenadas = useMemo(() => linhasDisponiveis ?? [], [linhasDisponiveis]);

  return {
    carregando,
    erro,
    veiculos,
    linhasDisponiveis: linhasOrdenadas,
    itinerariosPorId,
    garantirItinerario,
    removerItinerario,
    getVeiculosPorCodigo,
  };
}