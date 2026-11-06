import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LinhaSelecionadaInfo } from "./useMobilidadeRio";
import type { ItinerarioLinha } from "../types/transporte";
import type { ItinerarioPadraoVersaoV2, ParadaV2 } from "../types/estruturaV2";
import { metadataParadaRadar } from "../services/radarParadaMetadata";
import { useConsultaEventosParada } from "./useConsultaEventosParada";
import { escolherParadaAutomatica, paradasElegiveisRadar, resolverParadaMonitorada,
  type CoordenadasRadar, type ParadaRadar } from "../services/radarParada";

export { INTERVALO_RADAR_MS } from "./useConsultaEventosParada";
interface Args {
  linhas: LinhaSelecionadaInfo[]; modal: string;
  itinerarios: Record<string, ItinerarioLinha | null>;
  realtime: Record<string, ItinerarioPadraoVersaoV2>;
  local: CoordenadasRadar | null; enabled: boolean;
}

export function useRadarParada({ linhas, modal, itinerarios, realtime, local, enabled }: Args) {
  const [automaticoId, setAutomaticoId] = useState<string | null>(null);
  const [manual, setManual] = useState<{ modal: string; escolha: ParadaRadar } | null>(null);
  const [metadados, setMetadados] = useState<Record<string, ParadaV2>>({});
  const montado = useRef(true);
  const atividadeRef = useRef(false);
  const metadadosPendentes = useRef(false);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  const candidatos = useMemo(() => paradasElegiveisRadar(linhas, modal, itinerarios, local, realtime),
    [linhas, modal, itinerarios, local, realtime]);
  const automatica = escolherParadaAutomatica(candidatos, automaticoId);
  useEffect(() => { setAutomaticoId(automatica?.parada.paradaId ?? null); }, [automatica?.parada.paradaId]);
  const escolhida = manual ? resolverParadaMonitorada(candidatos, null, manual.escolha.parada.paradaId) : automatica;
  const foraContexto = Boolean(manual && !escolhida);
  const parada = escolhida ?? (manual?.escolha ?? null);
  const consulta = useConsultaEventosParada(escolhida, modal, enabled);
  atividadeRef.current = enabled && consulta.foreground;
  const paradaId = parada?.parada.paradaId;

  useEffect(() => {
    if (!enabled || !consulta.foreground || !paradaId) return;
    let valido = true;
    void metadataParadaRadar(paradaId).then((dados) => {
      if (dados && valido) setMetadados((atual) => ({ ...atual, [dados.id]: dados }));
    });
    return () => { valido = false; };
  }, [paradaId, enabled, consulta.foreground]);

  const carregarMetadados = useCallback(async () => {
    if (metadadosPendentes.current || !enabled || !consulta.foreground) return;
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
  }, [candidatos, enabled, consulta.foreground]);

  const selecionar = useCallback((escolha: ParadaRadar) => setManual({ modal, escolha }), [modal]);
  const selecaoAutomatica = useCallback(() => setManual(null), []);
  const estado = foraContexto ? "Parada manual fora do contexto ou distante. Retorne à seleção automática."
    : !local ? "Autorize a localização para encontrar uma parada próxima."
    : !linhas.some((item) => item.ativa && (modal === "todos" || item.modal === modal)) ? "Ative uma linha para acompanhar próximos veículos."
    : !Object.values(itinerarios).some((item) => item?.padroesV2?.length) ? "Carregando paradas…"
    : !escolhida ? "Nenhuma parada elegível a até 1 km."
    : consulta.erro ? consulta.erro
    : consulta.statusConsulta === "carregando" ? "Buscando próximos eventos…"
    : consulta.consultaConcluida && !consulta.eventos.length ? "Sem próximos eventos previstos." : null;
  return { candidatos, parada, foraContexto, manual: Boolean(manual), selecionar, selecaoAutomatica,
    metadados, carregarMetadados,
    ...consulta, estado };
}
