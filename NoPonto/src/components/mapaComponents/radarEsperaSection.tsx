import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { ArrowLeft, Bell, Check, Star, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTema } from '@/src/hooks/useTema';
import type { ControleRadarEspera } from '@/src/hooks/useRadarEspera';
import { fundoIdentificador, textoSobreCor } from './radarVehicleCard';
import RadarAvisosPorVoz from './radarAvisosPorVoz';

const SEM_SENTIDOS: string[] = [];

/** Configuração é um rascunho: voltar descarta; salvar aplica uma única reconfiguração. */
export default function RadarEsperaSection({ controle: c, solicitacaoAbrir = 0, onSolicitacaoConcluida }: {
  controle: ControleRadarEspera; solicitacaoAbrir?: number;
  onSolicitacaoConcluida?: (request: number) => void;
}) {
  const { cores, temaAtual } = useTema();
  const insets = useSafeAreaInsets();
  const [aberta, setAberta] = useState(false);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [prioritarias, setPrioritarias] = useState<string[]>([]);
  const [sentidos, setSentidos] = useState<string[]>([]);
  const [janela, setJanela] = useState(10);
  const [iniciar, setIniciar] = useState(false);
  const [contexto, setContexto] = useState('');
  const [avisoFechado, setAvisoFechado] = useState<string | null>(null);
  // Um salvamento intencional muda a chave do controlador; o rascunho aberto
  // acompanha essa mudança em vez de se declarar obsoleto.
  const [aplicandoRascunho, setAplicandoRascunho] = useState(false);
  const ultimaSolicitacaoAbrir = useRef(0);
  const selecionadasAtuais = c.selecionadas;
  const prioritariasAtuais = c.preferencias.prioritarias;
  const janelaAtual = c.preferencias.janelaMinutos;
  const chaveAtual = c.chaveConfiguracao;
  const ativarAtual = c.ativar;
  const sentidosAtuais = c.sentidosSelecionados ?? SEM_SENTIDOS;
  const dadosParaAbrir = useRef({ selecionadas: selecionadasAtuais, prioritarias: prioritariasAtuais,
    sentidos: sentidosAtuais,
    janela: janelaAtual, chave: chaveAtual });
  const remoto = c.modoRemoto === true;
  const estadoRemoto = c.estadoRemoto ?? 'inativo';
  const ativa = remoto ? estadoRemoto === 'ativo' : c.estado !== 'encerrado';
  const expirada = remoto && estadoRemoto === 'expirado';
  const pendente = remoto && estadoRemoto === 'pendente';
  const indisponivel = remoto && estadoRemoto === 'indisponivel';
  const configurada = remoto
    ? ativa || expirada || pendente || (indisponivel && c.expiraEm != null)
    : c.estado !== 'encerrado';
  const contextoValido = contexto === c.chaveConfiguracao || aplicandoRascunho;
  const editavel = c.podeConfigurar && contextoValido;
  // Reconciliação em segundo plano não bloqueia o formulário; apenas a
  // operação pedida pelo usuário (ou a confirmação de enrollment) o faz.
  const operacaoBloqueante = c.solicitando && c.operacaoRemota !== 'reconciliar';
  const mostrarProgressoAcao = operacaoBloqueante && c.operacaoRemota !== 'encerrar';
  const edicaoHabilitada = editavel && !operacaoBloqueante;
  const semLinhasDisponiveis = c.disponiveis.length === 0;
  const menosDesabilitado = !edicaoHabilitada || janela <= 2;
  const maisDesabilitado = !edicaoHabilitada || janela >= 15;
  // Estados persistentes seguem no texto de status; o toast fica para falhas transitórias.
  const aviso = c.erroPreferencias ?? (expirada || indisponivel || pendente ? null : c.mensagem);
  // Reativa o alvo já conhecido mesmo sem rascunho local (contexto ainda
  // carregando ou outra parada apenas visualizada), sem transferir o alvo.
  const podeAtivarPreservado = remoto && !ativa && c.podeReativarRemoto === true
    && contextoValido && (!editavel || semLinhasDisponiveis);
  const direcoesDisponiveis = c.sentidosDisponiveis ?? SEM_SENTIDOS;
  const direcoesCompletas = selecionadas.every(linhaId => {
    const opcoes = direcoesDisponiveis.filter(item => item.linhaId === linhaId);
    return opcoes.length === 0 || opcoes.some(item => sentidos.includes(item.chave));
  });
  const podeSalvar = !operacaoBloqueante && (
    (editavel && selecionadas.length > 0 && direcoesCompletas && (ativa || c.podeSolicitarAtivacao))
    || podeAtivarPreservado);
  const estado = remoto
    ? estadoRemoto === 'ativo' ? 'Ativo'
      : estadoRemoto === 'expirado' ? 'Sessão expirada'
      : estadoRemoto === 'pendente' ? 'Aguardando confirmação'
      : indisponivel && c.expiraEm ? 'Indisponível' : 'Desativado'
    : c.estado === 'encerrado' ? 'Desativado' : c.estado === 'ativo' ? 'Ativo'
      : c.estado === 'sem previsões' ? 'Sem previsões' : 'Pausado';
  const resumo = remoto
    ? estadoRemoto === 'ativo' ? 'ativo' : estadoRemoto === 'expirado' ? 'expirado'
      : estadoRemoto === 'pendente' ? 'pendente' : indisponivel && c.expiraEm ? 'indisponível' : 'desativado'
    : c.estado === 'encerrado' ? 'desativado' : c.estado === 'ativo' ? 'ativo'
      : c.estado === 'sem previsões' ? 'sem previsões' : 'pausado';
  const rotuloAcao = ativa ? 'Salvar alterações'
    : expirada ? 'Reativar Radar'
    : pendente ? 'Verificar ativação'
    : indisponivel && configurada ? 'Tentar novamente'
    : 'Ativar Radar';
  const rotuloCarregando = c.operacaoRemota === 'atualizar' ? 'Salvando…'
    : c.operacaoRemota === 'confirmar' || c.operacaoRemota === 'reconciliar' ? 'Atualizando…'
    : !ativa && (expirada || podeAtivarPreservado) ? 'Reativando…' : 'Ativando…';
  useEffect(() => {
    if (!aplicandoRascunho) return;
    setAplicandoRascunho(false);
    setContexto(chaveAtual);
  }, [aplicandoRascunho, chaveAtual]);
  useEffect(() => {
    if (!iniciar) return;
    setContexto(chaveAtual);
    setIniciar(false);
    void ativarAtual();
  }, [iniciar, ativarAtual, chaveAtual]);
  useEffect(() => {
    if (!aviso) { setAvisoFechado(null); return; }
    const timer = setTimeout(() => setAvisoFechado(aviso), 6000);
    return () => clearTimeout(timer);
  }, [aviso]);
  const abrir = () => {
    setSelecionadas([...c.selecionadas]);
    setPrioritarias(c.preferencias.prioritarias.filter(id => c.selecionadas.includes(id)));
    setSentidos([...sentidosAtuais]);
    setJanela(c.preferencias.janelaMinutos); setContexto(c.chaveConfiguracao); setAberta(true);
  };
  useEffect(() => {
    dadosParaAbrir.current = { selecionadas: selecionadasAtuais, prioritarias: prioritariasAtuais,
      sentidos: sentidosAtuais,
      janela: janelaAtual, chave: chaveAtual };
  }, [selecionadasAtuais, prioritariasAtuais, sentidosAtuais, janelaAtual, chaveAtual]);
  useEffect(() => {
    if (solicitacaoAbrir <= ultimaSolicitacaoAbrir.current) return;
    ultimaSolicitacaoAbrir.current = solicitacaoAbrir;
    const dados = dadosParaAbrir.current;
    setSelecionadas([...dados.selecionadas]);
    setPrioritarias(dados.prioritarias.filter(id => dados.selecionadas.includes(id)));
    setSentidos([...dados.sentidos]);
    setJanela(dados.janela); setContexto(dados.chave); setAberta(true);
    onSolicitacaoConcluida?.(solicitacaoAbrir);
  }, [solicitacaoAbrir, onSolicitacaoConcluida]);
  const salvar = () => {
    if (!podeSalvar) return;
    const configuracao = editavel && selecionadas.length > 0
      ? c.aplicarConfiguracao(selecionadas, prioritarias, janela,
        ...(direcoesDisponiveis.length ? [sentidos] : [])) : null;
    if (editavel && selecionadas.length > 0) setAplicandoRascunho(true);
    // A ativação só fecha por ação explícita do usuário; erros permanecem visíveis.
    if (!ativa) {
      // No remoto, usa a configuração recém-aplicada no mesmo toque para não
      // depender do próximo efeito/render. Sem rascunho aplicável, o hook
      // reutiliza o alvo preservado.
      if (remoto) {
        if (configuracao) void c.ativar(configuracao);
        else void c.ativar();
      } else setIniciar(true);
    }
  };
  const texto = { color: cores.textoPrimario };
  const secundario = { color: cores.textoSecundario, fontSize: 12 };
  const toque = { minWidth: 44, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const };
  const botaoMinuto = (desabilitado: boolean) => ({ ...toque, width: 44, height: 44, borderRadius: 22,
    backgroundColor: cores.fundoSecundario, opacity: desabilitado ? 0.45 : 1 });
  const card = { padding: 16, borderRadius: 16, backgroundColor: cores.fundoCard, gap: 10 };
  return <View style={{ borderTopWidth: 1, borderColor: cores.bordaSuave, marginTop: 6 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Gerenciar Radar de Espera" onPress={abrir}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3,
        backgroundColor: ativa ? cores.sucesso : expirada ? cores.perigo : cores.textoSecundario }} />
      <Text numberOfLines={1} style={{ ...texto, flex: 1, fontSize: 11 }}>
        {configurada ? `Radar ${resumo} · ${c.paradaNome} · ${!remoto && c.estado === 'pausado' && c.motivoPausa ? c.motivoPausa : `${c.selecionadas.length} linhas`}`
          : 'Radar de Espera · Configurar'}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, borderRadius: 16,
        paddingHorizontal: 10, backgroundColor: temaAtual === 'escuro' ? cores.fundoSecundario : cores.fundoPrimarioSuave }}>
        <Bell size={14} color={cores.textoPrimario} />
        <Text style={{ color: cores.textoPrimario, fontSize: 11, fontWeight: '700' }}>Configurar alertas</Text>
      </View>
    </Pressable>
    {aberta && <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setAberta(false)}>
      <StatusBar barStyle={temaAtual === 'escuro' ? 'light-content' : 'dark-content'} />
      <View style={{ flex: 1, backgroundColor: cores.fundoApp, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 1, borderColor: cores.borda }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar do Radar de Espera" onPress={() => setAberta(false)} style={toque}>
            <ArrowLeft size={22} color={cores.textoPrimario} />
          </Pressable>
          <View style={{ flex: 1, paddingHorizontal: 8 }}>
            <Text style={{ ...texto, fontWeight: '700', fontSize: 18 }}>Radar de Espera</Text>
            <Text numberOfLines={2} style={secundario}>{c.paradaNome}</Text>
          </View>
          <Text accessibilityLiveRegion="polite" style={{ ...secundario,
            color: ativa ? cores.sucesso : expirada ? cores.perigo : cores.textoSecundario }}>{estado}</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
          {!contextoValido && <Text style={secundario}>O contexto mudou. Volte e reabra a configuração antes de salvar.</Text>}
          {c.outraParada && <Text style={secundario}>Monitorando {c.paradaNome}. Volte à parada acompanhada para editar. Para trocar o alvo, use o seletor de parada do Radar.</Text>}
          <View style={card}>
            <Text style={{ ...texto, fontWeight: '700' }}>Linhas no Radar</Text>
            <Text style={secundario}>Selecione as linhas para acompanhar. Marque a estrela para destacar uma linha como prioritária.</Text>
            {c.modoRemoto && <Text style={secundario}>Limite do experimento: 20 linhas por sessão.</Text>}
            <View style={{ padding: 10, borderRadius: 8, backgroundColor: cores.fundoSecundario }}>
              <Text style={{ ...texto, fontSize: 12 }}>A prioridade destaca a linha, sem esconder uma chegada mais próxima.</Text>
            </View>
            {c.disponiveis.length === 0 && <Text style={secundario}>Nenhuma linha disponível nesta parada.</Text>}
            {!c.outraParada && c.disponiveis.map(l => {
              const selecionada = selecionadas.includes(l.linhaId);
              const prioridade = prioritarias.includes(l.linhaId);
              const candidatos = c.previa?.candidatos.filter(v => v.evento.linhaId === l.linhaId) ?? [];
              const eta = candidatos.length ? Math.ceil(Math.min(...candidatos.map(v => v.etaSeg)) / 60) : null;
              return <View key={l.linhaId} style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: cores.bordaSuave, borderRadius: 12, padding: 4 }}>
                <Pressable accessibilityRole="checkbox" accessibilityLabel={`Acompanhar linha ${l.linhaCodigo}`}
                  disabled={!edicaoHabilitada || c.modoRemoto === true && !selecionada && selecionadas.length >= 20}
                  accessibilityState={{ checked: selecionada, disabled: !edicaoHabilitada || c.modoRemoto === true && !selecionada && selecionadas.length >= 20 }}
                  onPress={() => {
                    setSelecionadas(selecionada ? selecionadas.filter(id => id !== l.linhaId) : [...selecionadas, l.linhaId]);
                    if (selecionada) setPrioritarias(prioritarias.filter(id => id !== l.linhaId));
                  }} style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minHeight: 56, gap: 10, opacity: edicaoHabilitada ? 1 : 0.5 }}>
                  <View style={toque}>
                    <View style={{ height: 22, width: 22, borderWidth: 1.5, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: selecionada ? cores.fundoPrimario : cores.fundoSecundario,
                      borderColor: selecionada ? cores.fundoPrimario : cores.borda }}>
                      {selecionada && <Check size={17} strokeWidth={3} color="#FFFFFF" />}
                    </View>
                  </View>
                  <View style={{ backgroundColor: fundoIdentificador(l.cor), borderRadius: 6, minWidth: 34, alignItems: 'center',
                    paddingVertical: 5, paddingHorizontal: 6 }}>
                    <Text style={{ color: textoSobreCor(l.cor), fontWeight: '700' }}>{l.linhaCodigo}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={{ ...texto, fontWeight: '600', fontSize: 13 }}>{c.destinos[l.linhaId] || l.subtitulo || l.nomeExibicao}</Text>
                    <Text style={{ ...secundario, color: eta != null && eta <= 2 ? cores.sucesso : cores.textoSecundario }}>
                      {eta != null ? `Previsão · ${eta} min` : 'Sem previsão elegível'}
                    </Text>
                  </View>
                </Pressable>
                <Pressable accessibilityRole="checkbox" accessibilityLabel={`Priorizar linha ${l.linhaCodigo}`}
                  accessibilityState={{ checked: prioridade, disabled: !selecionada || !edicaoHabilitada }} disabled={!selecionada || !edicaoHabilitada}
                  onPress={() => setPrioritarias(prioridade ? prioritarias.filter(id => id !== l.linhaId) : [...prioritarias, l.linhaId])}
                  style={{ ...toque, opacity: selecionada && edicaoHabilitada ? 1 : 0.35 }}>
                  <Star size={22} color={prioridade ? cores.fundoPrimario : cores.iconeSecundario} fill={prioridade ? cores.fundoPrimario : 'transparent'} />
                </Pressable>
              </View>;
            })}
          </View>
          {!!c.sentidosDisponiveis?.length && <View style={card}>
            <Text style={{ ...texto, fontWeight: '700' }}>Sentidos</Text>
            <Text style={secundario}>Escolha os destinos que o Radar deve acompanhar nesta estação.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {c.sentidosDisponiveis.filter(item => selecionadas.includes(item.linhaId)).map(item => {
                const marcado = sentidos.includes(item.chave);
                return <Pressable key={item.chave} accessibilityRole="checkbox"
                  accessibilityLabel={`Acompanhar sentido ${item.nome}`} accessibilityState={{ checked: marcado, disabled: !edicaoHabilitada }}
                  disabled={!edicaoHabilitada} onPress={() => setSentidos(marcado
                    ? sentidos.filter(chave => chave !== item.chave) : [...sentidos, item.chave])}
                  style={{ minHeight: 44, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center',
                    backgroundColor: marcado ? cores.fundoPrimario : cores.fundoSecundario, opacity: edicaoHabilitada ? 1 : 0.5 }}>
                  <Text style={{ color: marcado ? cores.textoSobrePrimario : cores.textoPrimario, fontWeight: '600' }}>{item.nome}</Text>
                </Pressable>;
              })}
            </View>
          </View>}
          <View style={card}>
            <Text style={{ ...texto, fontWeight: '700' }}>Avisar com antecedência</Text>
            <Text style={secundario}>Mostrar veículos previstos dentro deste intervalo.</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[2, 5, 10, 15].map(n => <Pressable key={n} accessibilityRole="radio" accessibilityLabel={`${n} minutos de antecedência`}
                accessibilityState={{ selected: janela === n, disabled: !edicaoHabilitada }} disabled={!edicaoHabilitada} onPress={() => setJanela(n)}
                style={{ ...toque, flex: 1, borderRadius: 10, backgroundColor: janela === n ? cores.fundoPrimario : cores.fundoSecundario }}>
                <Text style={{ color: janela === n ? cores.textoSobrePrimario : cores.textoPrimario, fontWeight: '600' }}>{n} min</Text>
              </Pressable>)}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Diminuir antecedência" disabled={menosDesabilitado}
                onPress={() => setJanela(janela - 1)} style={botaoMinuto(menosDesabilitado)}><Text style={{ ...texto, fontSize: 20 }}>−</Text></Pressable>
              <Text style={texto}>{janela} minutos</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Aumentar antecedência" disabled={maisDesabilitado}
                onPress={() => setJanela(janela + 1)} style={botaoMinuto(maisDesabilitado)}><Text style={{ ...texto, fontSize: 20 }}>+</Text></Pressable>
            </View>
          </View>
          <RadarAvisosPorVoz />
          <Text accessibilityLiveRegion="polite" style={secundario}>{c.modoRemoto
            ? estadoRemoto === 'ativo'
              ? `Acompanhamento remoto ativo.${c.expiraEm ? ` Sessão até ${new Date(c.expiraEm).toLocaleTimeString()}.` : ''} Não renova automaticamente.`
              : estadoRemoto === 'expirado'
                ? `A sessão de uma hora expirou.${c.expiraEm ? ` Expirou às ${new Date(c.expiraEm).toLocaleTimeString()}.` : ''} Reative para renovar intencionalmente.`
                : estadoRemoto === 'pendente' ? 'Aguardando confirmação push neste aparelho. Mantenha o app aberto e verifique novamente.'
                : estadoRemoto === 'indisponivel' ? 'Radar remoto indisponível. Confira a conexão e tente novamente.'
                : 'Acompanhamento remoto desativado.'
            : 'Funciona com o aplicativo aberto e a consulta ativa. Ao sair, as previsões são removidas.'}</Text>
          {!ativa && !c.podeSolicitarAtivacao && <Text style={secundario}>{remoto
            ? 'Aguarde os contextos da parada acompanhada carregarem para reativar.'
            : 'Aguarde uma consulta válida desta parada para ativar.'}</Text>}
          {!!c.previa?.conteudo.terminal?.length && <Text style={secundario}>{c.previa.conteudo.terminal.length} veículos aguardando no terminal · presença não confirma saída.</Text>}
          {!remoto && c.estado === 'pausado' && c.mensagem && <Pressable accessibilityRole="button" accessibilityLabel="Retomar"
            disabled={!c.podeAtivar || c.solicitando} accessibilityState={{ disabled: !c.podeAtivar || c.solicitando }}
            onPress={() => { void c.ativar(); }} style={{ ...toque, backgroundColor: cores.fundoSecundario, borderRadius: 10 }}>
            <Text style={texto}>Retomar</Text>
          </Pressable>}
        </ScrollView>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10), gap: 6, backgroundColor: cores.fundoPainel, borderTopWidth: 1, borderColor: cores.borda }}>
          {aviso && aviso !== avisoFechado && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
            borderRadius: 10, borderWidth: 1, borderColor: cores.perigo, backgroundColor: cores.fundoCard,
            paddingLeft: 10, paddingRight: 4, paddingVertical: 4 }}>
            <Text accessibilityLiveRegion="polite" style={{ flex: 1, color: cores.perigo, fontSize: 12 }}>{aviso}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar aviso" onPress={() => setAvisoFechado(aviso)}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color={cores.textoSecundario} />
            </Pressable>
          </View>}
          <Pressable accessibilityRole="button" accessibilityLabel={rotuloAcao}
            accessibilityState={{ disabled: !podeSalvar, busy: mostrarProgressoAcao }}
            disabled={!podeSalvar} onPress={salvar}
            style={{ minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
              borderRadius: 12, backgroundColor: cores.fundoPrimario, opacity: podeSalvar ? 1 : 0.5 }}>
            {mostrarProgressoAcao && <ActivityIndicator size="small" color={cores.textoSobrePrimario} />}
            <Text style={{ color: cores.textoSobrePrimario, fontWeight: '700' }}>{mostrarProgressoAcao ? rotuloCarregando : rotuloAcao}</Text>
          </Pressable>
          {configurada && <Pressable accessibilityRole="button" accessibilityLabel="Encerrar acompanhamento"
            accessibilityState={{ disabled: c.solicitando, busy: c.solicitando }}
            disabled={c.solicitando} onPress={() => { void c.encerrar(); }}
            style={{ ...toque, opacity: c.solicitando ? 0.5 : 1 }}>
            <Text style={{ color: cores.perigo }}>{c.operacaoRemota === 'encerrar' ? 'Encerrando…' : 'Encerrar acompanhamento'}</Text>
          </Pressable>}
        </View>
      </View>
    </Modal>}
  </View>;
}
