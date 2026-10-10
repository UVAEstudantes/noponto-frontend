import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import type { LinhaSelecionadaInfo } from "./useMobilidadeRio";
import type { ItinerarioLinha } from "../types/transporte";
import type { ItinerarioPadraoVersaoV2, ParadaV2 } from "../types/estruturaV2";
import { metadataParadaRadar } from "../services/radarParadaMetadata";
import { buscarEventosParada, filtrarEventosPorContexto, type EventoParadaDto } from "../services/eventosParada";
import { escolherParadaAutomatica, eventosValidosRadar, paradasElegiveisRadar, resolverParadaMonitorada,
  type CoordenadasRadar, type ParadaRadar } from "../services/radarParada";

export const INTERVALO_RADAR_MS = 30000;
interface Args {
  linhas: LinhaSelecionadaInfo[]; modal: string;
  itinerarios: Record<string, ItinerarioLinha | null>;
  realtime: Record<string, ItinerarioPadraoVersaoV2>;
  local: CoordenadasRadar | null; enabled: boolean; paradaEmDetalhes?: string | null;
}

export function useRadarParada({ linhas, modal, itinerarios, realtime, local, enabled, paradaEmDetalhes }: Args) {
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [automaticoId, setAutomaticoId] = useState<string | null>(null);
  const [manual, setManual] = useState<{ modal: string; escolha: ParadaRadar } | null>(null);
  const [resposta, setResposta] = useState<{ chave: string; eventos: EventoParadaDto[]; recebidoEm: number } | null>(null);
  const [erro, setErro] = useState<{ chave: string; mensagem: string } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const [metadados, setMetadados] = useState<Record<string, ParadaV2>>({});
  const montado = useRef(true);
  const atividadeRef = useRef(enabled && foreground);
  atividadeRef.current = enabled && foreground;
  const metadadosPendentes = useRef(false);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  const atualizarRef = useRef<() => void>(() => {});
  const candidatos = useMemo(() => paradasElegiveisRadar(linhas, modal, itinerarios, local, realtime),
    [linhas, modal, itinerarios, local?.latitude, local?.longitude, realtime]);
  const automatica = escolherParadaAutomatica(candidatos, automaticoId);
  useEffect(() => { setAutomaticoId(automatica?.parada.paradaId ?? null); }, [automatica?.parada.paradaId]);
  const escolhida = paradaEmDetalhes ? resolverParadaMonitorada(candidatos, null, paradaEmDetalhes)
    : manual ? (manual.modal === modal
      ? resolverParadaMonitorada(candidatos, null, manual.escolha.parada.paradaId) : null) : automatica;
  const foraContexto = Boolean(manual && !escolhida);
  const parada = escolhida ?? (manual?.escolha ?? null);
  const chave = escolhida ? JSON.stringify([modal, escolhida.parada.paradaId,
    escolhida.vinculos.map((item) => [item.linhaId, item.sentidoId, item.padraoVersaoId]).sort()]) : "";
  const escolhaRef = useRef(escolhida);
  escolhaRef.current = escolhida;

  useEffect(() => {
    if (!enabled || !foreground || !parada) return;
    let valido = true;
    void metadataParadaRadar(parada.parada.paradaId).then((dados) => {
      if (dados && valido) setMetadados((atual) => ({ ...atual, [dados.id]: dados }));
    });
    return () => { valido = false; };
  }, [parada?.parada.paradaId, enabled, foreground]);

  const carregarMetadados = useCallback(async () => {
    if (metadadosPendentes.current || !enabled || !foreground) return;
    metadadosPendentes.current = true;
    try {
      // Apenas ao abrir o seletor, até 12 candidatos, dois pedidos por vez.
      const proximas = candidatos.slice(0, 12);
      for (let index = 0; index < proximas.length && montado.current && atividadeRef.current; index += 2) {
        const dados = await Promise.all(proximas.slice(index, index + 2)
          .map((item) => metadataParadaRadar(item.parada.paradaId)));
        if (montado.current) setMetadados((atual) => {
          const next = { ...atual };
          dados.forEach((item) => { if (item) next[item.id] = item; });
          return next;
        });
      }
    } finally { metadadosPendentes.current = false; }
  }, [candidatos, enabled, foreground]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (value) => setForeground(value === "active"));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!enabled || !foreground || !chave) {
      setCarregando(false);
      atualizarRef.current = () => {};
      return;
    }
    let valido = true;
    let pendente = false;
    let proximo: ReturnType<typeof setTimeout> | undefined;
    const carregar = async () => {
      if (pendente || !valido) return;
      if (proximo) clearTimeout(proximo);
      const escolha = escolhaRef.current;
      if (!escolha) return;
      pendente = true;
      setCarregando(true);
      try {
        const eventos = await buscarEventosParada(escolha.parada.paradaId);
        if (!valido) return;
        const contexto = { linhas: [...new Set(escolha.vinculos.map((item) => item.linhaId))].map((linhaId) => ({
          linhaId, padraoVersaoIds: escolha.vinculos.filter((item) => item.linhaId === linhaId).map((item) => item.padraoVersaoId),
        })) };
        const recebidoEm = Date.now();
        setAgora(recebidoEm);
        setResposta({ chave, eventos: filtrarEventosPorContexto(eventos, contexto), recebidoEm });
        setErro(null);
      } catch (error) {
        if (valido) {
          setResposta(null);
          setErro({ chave, mensagem: error instanceof Error ? error.message : "Dados temporariamente indisponíveis" });
        }
      } finally {
        pendente = false;
        if (valido) {
          setCarregando(false);
          proximo = setTimeout(carregar, INTERVALO_RADAR_MS);
        }
      }
    };
    atualizarRef.current = () => { void carregar(); };
    void carregar();
    // Contagem local: nenhuma requisição é feita por este relógio.
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => {
      valido = false;
      if (proximo) clearTimeout(proximo);
      clearInterval(relogio);
      atualizarRef.current = () => {};
    };
  }, [chave, enabled, foreground]);

  const agoraEfetivo = Math.max(agora, Date.now());
  const recebidoEm = resposta?.chave === chave ? resposta.recebidoEm : agoraEfetivo;
  const eventos = eventosValidosRadar(resposta?.chave === chave ? resposta.eventos : [],
    escolhida ?? null, recebidoEm, agoraEfetivo);
  const selecionar = useCallback((escolha: ParadaRadar) => setManual({ modal, escolha }), [modal]);
  const selecaoAutomatica = useCallback(() => setManual(null), []);
  const atualizar = useCallback(() => atualizarRef.current(), []);
  const estado = foraContexto ? "Parada manual fora do contexto ou distante. Retorne à seleção automática."
    : !local ? "Autorize a localização para encontrar uma parada próxima."
    : !linhas.some((item) => item.ativa && item.modal === modal) ? "Ative uma linha para acompanhar próximos veículos."
    : !Object.values(itinerarios).some((item) => item?.padroesV2?.length) ? "Carregando paradas…"
    : !escolhida ? "Nenhuma parada elegível a até 1 km."
    : erro?.chave === chave ? "Dados temporariamente indisponíveis."
    : carregando && resposta?.chave !== chave ? "Buscando próximos eventos…"
    : !eventos.length ? "Sem próximos eventos previstos." : null;
  return { candidatos, parada, foraContexto, manual: Boolean(manual), selecionar, selecaoAutomatica,
    metadados, carregarMetadados,
    contextoConsulta: chave, consultaConcluida: Boolean(chave && resposta?.chave === chave && !carregando && erro?.chave !== chave),
    eventos, recebidoEm, agora: agoraEfetivo, carregando, erro: erro?.chave === chave ? erro.mensagem : null,
    estado, atualizar, atualizadoEm: resposta?.chave === chave ? resposta.recebidoEm : null };
}
