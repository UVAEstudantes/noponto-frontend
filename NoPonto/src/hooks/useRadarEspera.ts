import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { criarPreviaNotificacaoRadar, type EntradaPreviaNotificacaoRadar } from '../services/previaNotificacaoRadar';
import { chaveContextoRadar } from '../services/radarParada';
import { criarSessaoRadarEspera, textoNotificacaoRadar } from '../services/radarEspera';
import { normalizarPreferenciasRadar, type PreferenciasRadarEspera } from '../services/preferenciasRadarEspera';
import { carregarPreferenciasRadarEspera, salvarPreferenciasRadarEspera } from '../services/storage';
import type { clienteRadarEspera } from '../services/notificacaoRadarLocal';
import type { ResultadoLocal } from '../services/notificacaoLocalCanal';
import type { DiagnosticoCandidatoRadar } from '../services/notificacoesRadar';

let nativo: typeof clienteRadarEspera | undefined;
let entradaInicialLimpa = false;
let linhasEmMemoria: string[] | null = null;
const ancoragemSessao: { current: { id: string; nome: string } | null } = { current: null };
async function executar(acao: (cliente: typeof clienteRadarEspera) => Promise<ResultadoLocal>): Promise<ResultadoLocal> {
  if (Platform.OS !== 'android') return 'indisponivel';
  try {
    nativo ??= (await import('../services/notificacaoRadarLocal')).clienteRadarEspera;
    return await acao(nativo);
  } catch { return 'erro'; }
}
// Uma única sessão por runtime. Preferências são persistidas; esta instância não.
const sessao = criarSessaoRadarEspera({
  autorizar: () => executar(c => c.autorizar()),
  publicar: (conteudo, vigente) => executar(c => c.publicar(textoNotificacaoRadar(conteudo), false, vigente)),
  remover: () => executar(c => c.remover()), invalidar: () => nativo?.invalidar(),
});

export function useRadarEspera(entrada: EntradaPreviaNotificacaoRadar & { selecaoDeliberada?: boolean }) {
  const [preferencias, setPreferencias] = useState<PreferenciasRadarEspera>(() => normalizarPreferenciasRadar(null));
  const [carregado, setCarregado] = useState(false);
  const [erroPreferencias, setErroPreferencias] = useState<string | null>(null);
  const [monitoradas, setMonitoradas] = useState<string[] | null>(linhasEmMemoria);
  const [situacao, setSituacao] = useState(sessao.situacao);
  if (situacao.estado === 'encerrado' && !situacao.solicitando) ancoragemSessao.current = null;
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const escritas = useRef(Promise.resolve());
  const disponiveis = entrada.linhas.filter(l => l.ativa && (entrada.modal === 'todos' || l.modal === entrada.modal)
    && entrada.parada?.vinculos.some(v => v.linhaId === l.linhaId));
  const ids = (monitoradas ?? disponiveis.map(l => l.linhaId)).filter(id => disponiveis.some(l => l.linhaId === id));
  const ancoragem = ancoragemSessao;
  if (entrada.selecaoDeliberada && entrada.parada && ancoragem.current) {
    ancoragem.current = { id: entrada.parada.parada.paradaId, nome: entrada.parada.parada.nome };
  }
  const mudouAutomaticamente = ancoragem.current != null && entrada.parada?.parada.paradaId !== ancoragem.current.id;
  const diagnosticos: DiagnosticoCandidatoRadar[] = [];
  const previaCalculada = criarPreviaNotificacaoRadar({ ...entrada,
    linhas: entrada.linhas.filter(l => ids.includes(l.linhaId)),
    diagnosticar: typeof __DEV__ !== 'undefined' && __DEV__ ? d => {
      if (mudouAutomaticamente && d.motivo === 'incluido_na_notificacao') d = { ...d, motivo: 'parada_visualizada_nao_e_alvo_do_acompanhamento' };
      const index = diagnosticos.findIndex(i => i.eventoId === d.eventoId);
      if (index < 0) diagnosticos.push(d); else diagnosticos[index] = d;
    } : undefined,
    linhasPrioritarias: preferencias.prioritarias, politica: { janelaSegundos: preferencias.janelaMinutos * 60 } });
  const previa = mudouAutomaticamente ? null : previaCalculada;
  const chave = entrada.parada ? JSON.stringify([
    chaveContextoRadar(entrada.parada, entrada.modal),
    entrada.linhas.map(l => [l.linhaId, l.ativa, l.modoSentido]).sort(), [...ids].sort(),
    entrada.parada.vinculos.map(v => [v.linhaId, v.padraoVersaoId,
      Object.values(entrada.realtime).find(p => p.padraoVersaoId === v.padraoVersaoId)?.padraoOperacionalId
      ?? entrada.itinerarios[v.linhaId]?.padroesV2?.find(p => p.padraoVersaoId === v.padraoVersaoId)?.padraoOperacionalId]).sort(),
    [...preferencias.prioritarias].sort(), preferencias.janelaMinutos,
  ]) : '';
  const ativo = foreground && carregado && !mudouAutomaticamente && entrada.consulta.temResposta
    && !['pausado', 'indisponivel'].includes(entrada.consulta.statusConsulta);
  const snapshot = { chave, ativo, previa };
  const atual = useRef(snapshot); atual.current = snapshot;
  useEffect(() => {
    const desassinar = sessao.assinar(setSituacao);
    if (!entradaInicialLimpa) {
      entradaInicialLimpa = true;
      void sessao.encerrar(); // Uma limpeza por runtime; preferências nunca restauram sessão.
    }
    let montado = true;
    void carregarPreferenciasRadarEspera().then(p => { if (montado) { setPreferencias(p); setCarregado(true); } });
    const subscription = AppState.addEventListener('change', estado => {
      const visivel = estado === 'active';
      setForeground(visivel);
      if (!visivel) void sessao.observar({ ...atual.current, ativo: false });
    });
    return () => { montado = false; subscription.remove(); desassinar(); void sessao.observar({ ...atual.current, ativo: false }); };
  }, []);
  useEffect(() => { void sessao.observar(snapshot); });
  const salvar = (p: PreferenciasRadarEspera) => {
    sessao.reconfigurar(); setPreferencias(p); setErroPreferencias(null);
    escritas.current = escritas.current.catch(() => {}).then(() => salvarPreferenciasRadarEspera(p))
      .then(() => setErroPreferencias(null))
      .catch(() => setErroPreferencias('Não foi possível salvar as preferências.'));
  };
  return { ...situacao, previa, disponiveis, selecionadas: ids, preferencias, carregado, erroPreferencias, diagnosticos,
    paradaNome: ancoragem.current?.nome ?? entrada.parada?.parada.nome ?? 'Selecione uma parada',
    podeAtivar: Platform.OS === 'android' && ativo && previa != null && ids.length > 0,
    ativar: () => {
      if (entrada.parada) ancoragem.current = { id: entrada.parada.parada.paradaId, nome: entrada.parada.parada.nome };
      return sessao.ativar();
    }, encerrar: () => { ancoragem.current = null; return sessao.encerrar(); },
    selecionarLinha(id: string) {
      sessao.reconfigurar();
      linhasEmMemoria = ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]; setMonitoradas(linhasEmMemoria);
    },
    priorizarLinha(id: string) {
      salvar({ ...preferencias, prioritarias: preferencias.prioritarias.includes(id)
        ? preferencias.prioritarias.filter(i => i !== id) : [...preferencias.prioritarias, id] });
    },
    definirJanela(minutos: number) { salvar(normalizarPreferenciasRadar({ ...preferencias, janelaMinutos: minutos })); },
  };
}
export type ControleRadarEspera = ReturnType<typeof useRadarEspera>;
