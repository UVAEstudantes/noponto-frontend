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
import type { ConfiguracaoRemota, EstadoRemoto, OperacaoRemota } from '../services/radarRemotoCore';
import { configurarRadarRemoto } from '../services/radarRemotoContexto';
import { diagnosticarRadar } from '../services/radarRemotoDiagnostico';

const CONFIGURACAO_INDISPONIVEL = 'Não foi possível preparar a configuração remota. Aguarde os contextos desta parada carregarem e tente novamente.';

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
  // Feedback imediato da ação pedida pelo usuário, antes de a fila serializada
  // começar a executá-la (por exemplo, atrás de uma reconciliação).
  const [operacaoPendente, setOperacaoPendente] = useState<OperacaoRemota | null>(null);
  const remotoSujo = useRef(false);
  const remotoRestaurado = useRef(false);
  const operacaoPendenteRef = useRef<OperacaoRemota | null>(null);
  // Última configuração válida do alvo remoto. Permite reativar uma sessão
  // expirada mesmo quando outra parada está apenas sendo visualizada.
  const configuracaoRemota = useRef<ConfiguracaoRemota | null>(null);
  const iniciarOperacao = (operacao: OperacaoRemota) => {
    if (operacaoPendenteRef.current) return false;
    operacaoPendenteRef.current = operacao;
    setOperacaoPendente(operacao);
    return true;
  };
  const concluirOperacao = (operacao: OperacaoRemota) => {
    if (operacaoPendenteRef.current !== operacao) return;
    operacaoPendenteRef.current = null;
    setOperacaoPendente(null);
  };
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
    diagnosticarRadar('modulo.importar', 'inicio');
    void import('../services/radarRemotoAndroid').then(module => {
      if (!mounted) return;
      remoto = module.radarRemotoAndroid;
      unsubscribe = remoto.assinar(setEstadoRemoto);
      void remoto.reconciliar();
    }).catch((erro: unknown) => { diagnosticarRadar('modulo.importar', 'falha', erro); if (mounted) setEstadoRemoto({ modo: 'indisponivel', sessao: null,
      mensagem: 'Radar remoto indisponível neste build.', solicitando: false, operacao: null }); });
    return () => { mounted = false; unsubscribe?.(); };
  }, []);
  useEffect(() => {
    const current = estadoRemoto?.sessao;
    if (!remotoHabilitado || !current || remotoRestaurado.current || !carregado) return;
    remotoRestaurado.current = true;
    linhasEmMemoria = current.linhasSelecionadas; setMonitoradas(current.linhasSelecionadas);
    setPreferencias(normalizarPreferenciasRadar({ prioritarias: current.linhasPrioritarias, janelaMinutos: current.antecedenciaMinutos }));
    configuracaoRemota.current = { paradaId: current.paradaId, contextos: current.contextos,
      linhasSelecionadas: current.linhasSelecionadas, linhasPrioritarias: current.linhasPrioritarias,
      antecedenciaMinutos: current.antecedenciaMinutos };
    ancoragemSessao.current = { id: current.paradaId,
      nome: entrada.parada?.parada.paradaId === current.paradaId ? entrada.parada.parada.nome : 'Parada acompanhada' };
  }, [estadoRemoto, carregado, entrada.parada]);
  useEffect(() => {
    if (!remotoHabilitado) return;
    // Sem sessão remota não há alvo a preservar; o alvo só permanece enquanto
    // existir sessão ativa/expirada ou uma tentativa de ativação em andamento.
    const semSessao = estadoRemoto?.sessao == null;
    if (!estadoRemoto?.solicitando && semSessao && (estadoRemoto?.modo === 'inativo'
      || estadoRemoto?.modo === 'indisponivel')) {
      ancoragemSessao.current = null;
      configuracaoRemota.current = null;
    }
  }, [estadoRemoto]);
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
    configuracaoRemota.current = configuration;
    if (!configuration) {
      setEstadoRemoto(previous => ({
        modo: previous?.modo ?? 'inativo', sessao: previous?.sessao ?? null,
        solicitando: previous?.solicitando ?? false, operacao: previous?.operacao ?? null,
        mensagem: CONFIGURACAO_INDISPONIVEL,
      }));
      return;
    }
    if (estadoRemoto?.modo !== 'ativo') return;
    if (!iniciarOperacao('atualizar')) {
      // Mantém a alteração mais recente para ser aplicada quando a operação
      // atual terminar, em vez de enfileirar uma duplicata.
      remotoSujo.current = true;
      return;
    }
    void remoto.atualizar(configuration).finally(() => concluirOperacao('atualizar'));
  });
  const salvar = (p: PreferenciasRadarEspera) => {
    remotoSujo.current = true;
    sessao.reconfigurar(); setPreferencias(p); setErroPreferencias(null);
    escritas.current = escritas.current.catch(() => {}).then(() => salvarPreferenciasRadarEspera(p))
      .then(() => setErroPreferencias(null))
      .catch(() => setErroPreferencias('Não foi possível salvar as preferências.'));
  };
  const remotoAtivo = estadoRemoto?.modo === 'ativo';
  const configuracaoPreservada = remotoHabilitado && configuracaoRemota.current != null
    && estadoRemoto?.modo !== 'inativo'
    && !(estadoRemoto?.modo === 'indisponivel' && estadoRemoto.sessao == null);
  const configuracaoAtualDisponivel = !mudouAutomaticamente && !!entrada.parada && ids.length > 0;
  const podeSolicitarAtivacao = Platform.OS === 'android' && (remotoHabilitado
    ? carregado && !!remoto && (configuracaoPreservada || configuracaoAtualDisponivel)
    : ativo);
  const situacaoAtual = remotoHabilitado ? {
    estado: (remotoAtivo ? 'ativo' : estadoRemoto?.modo === 'pendente' || estadoRemoto?.modo === 'indisponivel' ? 'pausado' : 'encerrado') as typeof situacao.estado,
    solicitando: (estadoRemoto?.solicitando ?? false) || operacaoPendente != null,
    mensagem: estadoRemoto?.mensagem ?? (estadoRemoto?.modo === 'expirado'
      ? 'A sessão de uma hora expirou. Ative novamente para renovar intencionalmente.' : null),
  } : situacao;
  return { ...situacaoAtual, previa, disponiveis, selecionadas: ids, preferencias, carregado, erroPreferencias, diagnosticos,
    modoRemoto: remotoHabilitado, estadoRemoto: estadoRemoto?.modo ?? 'inativo', expiraEm: estadoRemoto?.sessao?.expiraEm ?? null,
    operacaoRemota: operacaoPendente ?? estadoRemoto?.operacao ?? null,
    paradaNome: ancoragem.current?.nome ?? entrada.parada?.parada.nome ?? 'Selecione uma parada',
    paradaIdMonitorada: ancoragem.current?.id ?? null,
    outraParada: mudouAutomaticamente,
    chaveConfiguracao: chave,
    motivoPausa: remotoHabilitado ? estadoRemoto?.mensagem ?? null : mudouAutomaticamente ? 'Outra parada visualizada' : !foreground ? 'Aplicativo fora do primeiro plano'
      : !ativo ? 'Consulta indisponível' : situacao.mensagem ? 'Falha ao atualizar' : null,
    podeConfigurar: carregado && entrada.parada != null && !mudouAutomaticamente,
    podeSolicitarAtivacao,
    podeReativarRemoto: remotoHabilitado && carregado && !!remoto && configuracaoPreservada,
    destinos: Object.fromEntries(disponiveis.map(l => [l.linhaId,
      [...new Set(entrada.parada?.vinculos.filter(v => v.linhaId === l.linhaId).map(v => v.destino))].join(' · ')])),
    aplicarConfiguracao(selecionadas: string[], prioritarias: string[], janelaMinutos: number) {
      if (!carregado || mudouAutomaticamente || !entrada.parada) return null;
      // Toques repetidos não podem reaplicar o rascunho enquanto a operação
      // anterior ainda aguarda a fila remota.
      if (remotoHabilitado && operacaoPendenteRef.current) return null;
      const novas = [...new Set(selecionadas)].filter(id => disponiveis.some(l => l.linhaId === id));
      const prioridades = prioritarias.filter(id => novas.includes(id));
      const configuration = remotoHabilitado
        ? configurarRadarRemoto(entrada, novas, prioridades, janelaMinutos) : null;
      if (remotoHabilitado) {
        configuracaoRemota.current = configuration;
        if (!configuration) {
          setEstadoRemoto(previous => ({
            modo: previous?.modo ?? 'inativo', sessao: previous?.sessao ?? null,
            solicitando: previous?.solicitando ?? false, operacao: previous?.operacao ?? null,
            mensagem: CONFIGURACAO_INDISPONIVEL,
          }));
        }
      }
      linhasEmMemoria = novas; setMonitoradas(novas);
      salvar(normalizarPreferenciasRadar({ prioritarias: prioridades, janelaMinutos }));
      // Em sessão ativa o salvamento envia a configuração recém-aplicada
      // imediatamente, sem depender do próximo ciclo de efeitos.
      if (remotoHabilitado && configuration && estadoRemoto?.modo === 'ativo' && remoto
        && iniciarOperacao('atualizar')) {
        remotoSujo.current = false;
        void remoto.atualizar(configuration).finally(() => concluirOperacao('atualizar'));
      }
      return configuration;
    },
    podeAtivar: Platform.OS === 'android' && (remotoHabilitado
      ? carregado && !!remoto && (configuracaoPreservada || configuracaoAtualDisponivel)
      : ativo && previa != null && ids.length > 0),
    ativar: (configuracaoExplicita?: ConfiguracaoRemota) => {
      if (remotoHabilitado) {
        if (!remoto) {
          setEstadoRemoto(previous => ({
            modo: previous?.modo ?? 'inativo', sessao: previous?.sessao ?? null,
            solicitando: false, operacao: null,
            mensagem: 'Radar remoto ainda carregando. Tente novamente em instantes.',
          }));
          return Promise.resolve();
        }
        if (!iniciarOperacao('ativar')) return Promise.resolve();
        const configuration = configuracaoExplicita
          ?? (!mudouAutomaticamente
            ? configurarRadarRemoto(entrada, ids, preferencias.prioritarias, preferencias.janelaMinutos) : null)
          ?? configuracaoRemota.current;
        if (!configuration) {
          concluirOperacao('ativar');
          setEstadoRemoto(previous => ({
            modo: previous?.modo ?? 'inativo', sessao: previous?.sessao ?? null,
            solicitando: false, operacao: null,
            mensagem: 'Selecione até 20 linhas com contextos completos e atuais (até 40). Aguarde o Radar remoto carregar.',
          }));
          return Promise.resolve();
        }
        configuracaoRemota.current = configuration;
        remotoSujo.current = false;
        remotoRestaurado.current = true;
        if (!mudouAutomaticamente && entrada.parada) {
          ancoragem.current = { id: entrada.parada.parada.paradaId, nome: entrada.parada.parada.nome };
        }
        return remoto.ativar(configuration).finally(() => concluirOperacao('ativar'));
      }
      if (entrada.parada) ancoragem.current = { id: entrada.parada.parada.paradaId, nome: entrada.parada.parada.nome };
      // O formulário pode ativar antes do efeito de observação do componente pai.
      void sessao.observar(atual.current);
      return sessao.ativar();
    }, encerrar: () => {
      if (remotoHabilitado) {
        if (!iniciarOperacao('encerrar')) return Promise.resolve();
        return (remoto?.encerrar() ?? Promise.resolve()).finally(() => concluirOperacao('encerrar'));
      }
      ancoragem.current = null; configuracaoRemota.current = null;
      return sessao.encerrar();
    },
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
