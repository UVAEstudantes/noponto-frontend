import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { buscarEventosParada, type EventoParadaDto } from "../services/eventosParada";
import { chaveContextoRadar, eventosValidosRadar, type ParadaRadar } from "../services/radarParada";

export const INTERVALO_RADAR_MS = 30000;
export type StatusConsultaParada = "indisponivel" | "carregando" | "atualizando" | "sucesso" | "erro" | "pausado";
interface Consulta {
  chave: string;
  eventos: EventoParadaDto[];
  recebidoEm: number | null;
  erro: string | null;
  carregando: boolean;
}

// Mesmo ciclo de consulta e relógio para o compacto e qualquer parada aberta no mapa.
export function useConsultaEventosParada(parada: ParadaRadar | null, modal: string, enabled: boolean) {
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const geracao = useRef(0);
  const chave = chaveContextoRadar(parada, modal);
  const paradaId = parada?.parada.paradaId;
  const contextoAtual = useRef({ chave, ativo: enabled && foreground });
  contextoAtual.current = { chave, ativo: enabled && foreground };
  const atualizarRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (value) => setForeground(value === "active"));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const atual = ++geracao.current;
    if (!enabled || !foreground || !chave) setConsulta(null);
    if (!enabled || !foreground || !chave || !paradaId) return;

    let pendente = false;
    let proximo: ReturnType<typeof setTimeout> | undefined;
    const vigente = () => geracao.current === atual && contextoAtual.current.ativo
      && contextoAtual.current.chave === chave;
    const carregar = async () => {
      if (pendente || !vigente()) return;
      if (proximo) clearTimeout(proximo);
      pendente = true;
      setConsulta((anterior) => ({ chave, eventos: anterior?.chave === chave ? anterior.eventos : [],
        recebidoEm: anterior?.chave === chave ? anterior.recebidoEm : null,
        erro: null, carregando: true }));
      try {
        const eventos = await buscarEventosParada(paradaId);
        if (!vigente()) return;
        const recebidoEm = Date.now();
        setAgora(recebidoEm);
        setConsulta({ chave, eventos, recebidoEm, erro: null, carregando: false });
      } catch {
        if (!vigente()) return;
        // Um erro de atualização não apaga a última resposta deste contexto.
        setConsulta((anterior) => ({ chave, eventos: anterior?.chave === chave ? anterior.eventos : [],
          recebidoEm: anterior?.chave === chave ? anterior.recebidoEm : null,
          erro: "Não foi possível atualizar os próximos veículos.", carregando: false }));
      } finally {
        pendente = false;
        if (vigente()) proximo = setTimeout(carregar, INTERVALO_RADAR_MS);
      }
    };
    atualizarRef.current = () => carregar();
    void carregar();
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => {
      geracao.current = atual + 1;
      if (proximo) clearTimeout(proximo);
      clearInterval(relogio);
      atualizarRef.current = () => Promise.resolve();
    };
  }, [chave, paradaId, enabled, foreground]);

  const resposta = enabled && consulta?.chave === chave ? consulta : null;
  const agoraEfetivo = Math.max(agora, Date.now());
  const recebidoEm = resposta?.recebidoEm ?? agoraEfetivo;
  const temResposta = resposta?.recebidoEm != null;
  const erro = resposta?.erro ?? null;
  const carregando = Boolean(chave && enabled && foreground && (resposta?.carregando ?? true));
  const statusConsulta: StatusConsultaParada = !chave ? "indisponivel"
    : !enabled || !foreground ? "pausado" : carregando ? temResposta ? "atualizando" : "carregando"
    : erro ? "erro" : "sucesso";
  const eventosRecebidos = resposta?.eventos ?? [];
  const eventos = enabled && foreground ? eventosValidosRadar(eventosRecebidos, parada, recebidoEm, agoraEfetivo) : [];
  // Derivado só dos eventos válidos do contexto atual; não existe mapa mutável de consulta antiga.
  const eventosPorId = useMemo(() => new Map(eventos.map((evento) => [evento.eventId, evento])), [eventos]);
  const atualizar = useCallback(() => atualizarRef.current(), []);
  return { foreground, contextoConsulta: chave, statusConsulta, eventos, eventosRecebidos, eventosPorId, recebidoEm,
    agora: agoraEfetivo, carregando, erro, temResposta, atualizadoEm: resposta?.recebidoEm ?? null,
    consultaConcluida: statusConsulta === "sucesso", atualizar };
}
