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
import type { EstadoRemoto } from '../services/radarRemotoCore';
import { configurarRadarRemoto } from '../services/radarRemotoContexto';

const remotoHabilitado = process.env.EXPO_PUBLIC_RADAR_REMOTE_ENABLED === 'true';
let remoto: typeof import('../services/radarRemotoAndroid').radarRemotoAndroid | undefined;

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
  const [estadoRemoto, setEstadoRemoto] = useState<EstadoRemoto | null>(null);
  const remotoSujo = useRef(false);
  const remotoRestaurado = useRef(false);
  const [preferencias, setPreferencias] = useState<PreferenciasRadarEspera>(() => normalizarPreferenciasRadar(null));
  const [carregado, setCarregado] = useState(false);
  const [erroPreferencias, setErroPreferencias] = useState<string | null>(null);
  const [monitoradas, setMonitoradas] = useState<string[] | null>(linhasEmMemoria);
  const [situacao, setSituacao] = useState(sessao.situacao);
  if (!remotoHabilitado && situacao.estado === 'encerrado' && !situacao.solicitando) ancoragemSessao.current = null;
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const escritas = useRef(Promise.resolve());
  const disponiveis = entrada.linhas.filter(l => l.ativa && (entrada.modal === 'todos' || l.modal === entrada.modal)
    && entrada.parada?.vinculos.some(v => v.linhaId === l.linhaId));
  const ids = (monitoradas ?? disponiveis.map(l => l.linhaId)).filter(id => disponiveis.some(l => l.linhaId === id));
  const ancoragem = ancoragemSessao;
  if (entrada.selecaoDeliberada && entrada.parada && ancoragem.current) {
    if (remotoHabilitado && ancoragem.current.id !== entrada.parada.parada.paradaId) remotoSujo.current = true;
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
      if (remotoHabilitado) { if (visivel) void remoto?.reconciliar(); }
      else if (!visivel) void sessao.observar({ ...atual.current, ativo: false });
    });
    return () => { montado = false; subscription.remove(); desassinar(); void sessao.observar({ ...atual.current, ativo: false }); };
  }, []);
  useEffect(() => { if (!remotoHabilitado) void sessao.observar(snapshot); });
  useEffect(() => {
    if (!remotoHabilitado || Platform.OS !== 'android') return;
    let mounted = true, unsubscribe: (() => void) | undefined;
    void import('../services/radarRemotoAndroid').then(module => {
      if (!mounted) return;
      remoto = module.radarRemotoAndroid;
      unsubscribe = remoto.assinar(setEstadoRemoto);
      void remoto.reconciliar();
    }).catch(() => { if (mounted) setEstadoRemoto({ modo: 'indisponivel', sessao: null,
      mensagem: 'Radar remoto indisponível neste build.', solicitando: false }); });
    return () => { mounted = false; unsubscribe?.(); };
  }, []);
  useEffect(() => {
    const current = estadoRemoto?.sessao;
    if (!remotoHabilitado || !current || remotoRestaurado.current || !carregado) return;
    remotoRestaurado.current = true;
    linhasEmMemoria = current.linhasSelecionadas; setMonitoradas(current.linhasSelecionadas);
    setPreferencias(normalizarPreferenciasRadar({ prioritarias: current.linhasPrioritarias, janelaMinutos: current.antecedenciaMinutos }));
    ancoragemSessao.current = { id: current.paradaId,
      nome: entrada.parada?.parada.paradaId === current.paradaId ? entrada.parada.parada.nome : 'Parada acompanhada' };
  }, [estadoRemoto, carregado, entrada.parada]);
  useEffect(() => {
    if (!remotoHabilitado || !estadoRemoto?.sessao || estadoRemoto.modo !== 'ativo') return;
    const remaining = Date.parse(estadoRemoto.sessao.expiraEm) - Date.now();
    const timer = setTimeout(() => remoto?.expirar(), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [estadoRemoto]);
  useEffect(() => {
    if (!remotoHabilitado || !remotoSujo.current || !remoto || !entrada.parada || mudouAutomaticamente) return;
    remotoSujo.current = false;
    const configuration = configurarRadarRemoto(entrada, ids, preferencias.prioritarias, preferencias.janelaMinutos);
    if (configuration) void remoto.atualizar(configuration);
  });
  const salvar = (p: PreferenciasRadarEspera) => {
    remotoSujo.current = true;
    sessao.reconfigurar(); setPreferencias(p); setErroPreferencias(null);
    escritas.current = escritas.current.catch(() => {}).then(() => salvarPreferenciasRadarEspera(p))
      .then(() => setErroPreferencias(null))
      .catch(() => setErroPreferencias('Não foi possível salvar as preferências.'));
  };
  const remotoAtivo = estadoRemoto?.modo === 'ativo';
  const situacaoAtual = remotoHabilitado ? {
    estado: (remotoAtivo ? 'ativo' : estadoRemoto?.modo === 'pendente' || estadoRemoto?.modo === 'indisponivel' ? 'pausado' : 'encerrado') as typeof situacao.estado,
    solicitando: estadoRemoto?.solicitando ?? false,
    mensagem: estadoRemoto?.modo === 'expirado' ? 'A sessão de uma hora expirou. Ative novamente para renovar intencionalmente.' : estadoRemoto?.mensagem ?? null,
  } : situacao;
  return { ...situacaoAtual, previa, disponiveis, selecionadas: ids, preferencias, carregado, erroPreferencias, diagnosticos,
    modoRemoto: remotoHabilitado, estadoRemoto: estadoRemoto?.modo ?? 'inativo', expiraEm: estadoRemoto?.sessao?.expiraEm ?? null,
    paradaNome: ancoragem.current?.nome ?? entrada.parada?.parada.nome ?? 'Selecione uma parada',
    paradaIdMonitorada: ancoragem.current?.id ?? null,
    outraParada: mudouAutomaticamente,
    chaveConfiguracao: chave,
    motivoPausa: remotoHabilitado ? estadoRemoto?.mensagem ?? null : mudouAutomaticamente ? 'Outra parada visualizada' : !foreground ? 'Aplicativo fora do primeiro plano'
      : !ativo ? 'Consulta indisponível' : situacao.mensagem ? 'Falha ao atualizar' : null,
    podeConfigurar: carregado && entrada.parada != null && !mudouAutomaticamente,
    podeSolicitarAtivacao: Platform.OS === 'android' && (remotoHabilitado ? carregado && !!entrada.parada && !mudouAutomaticamente : ativo),
    destinos: Object.fromEntries(disponiveis.map(l => [l.linhaId,
      [...new Set(entrada.parada?.vinculos.filter(v => v.linhaId === l.linhaId).map(v => v.destino))].join(' · ')])),
    aplicarConfiguracao(selecionadas: string[], prioritarias: string[], janelaMinutos: number) {
      if (!carregado || mudouAutomaticamente || !entrada.parada) return;
      const novas = [...new Set(selecionadas)].filter(id => disponiveis.some(l => l.linhaId === id));
      linhasEmMemoria = novas; setMonitoradas(novas);
      salvar(normalizarPreferenciasRadar({ prioritarias: prioritarias.filter(id => novas.includes(id)), janelaMinutos }));
    },
    podeAtivar: Platform.OS === 'android' && (remotoHabilitado ? !!remoto && !!entrada.parada && !mudouAutomaticamente : ativo && previa != null) && ids.length > 0,
    ativar: () => {
      if (remotoHabilitado) {
        if (mudouAutomaticamente) return Promise.resolve();
        const configuration = configurarRadarRemoto(entrada, ids, preferencias.prioritarias, preferencias.janelaMinutos);
        if (!configuration || !remoto) {
          setEstadoRemoto(previous => ({ modo: 'indisponivel', sessao: previous?.sessao ?? null, solicitando: false,
            mensagem: 'Selecione até 20 linhas com contextos completos e atuais (até 40). Aguarde o Radar remoto carregar.' }));
          return Promise.resolve();
        }
        remotoRestaurado.current = true;
        if (entrada.parada) ancoragem.current = { id: entrada.parada.parada.paradaId, nome: entrada.parada.parada.nome };
        return remoto.ativar(configuration);
      }
      if (entrada.parada) ancoragem.current = { id: entrada.parada.parada.paradaId, nome: entrada.parada.parada.nome };
      // O formulário pode ativar antes do efeito de observação do componente pai.
      void sessao.observar(atual.current);
      return sessao.ativar();
    }, encerrar: () => { ancoragem.current = null; return remotoHabilitado ? remoto?.encerrar() ?? Promise.resolve() : sessao.encerrar(); },
    selecionarLinha(id: string) {
      remotoSujo.current = true;
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
