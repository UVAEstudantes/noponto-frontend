import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { ArrowLeft, Check, ChevronRight, Headphones, Star } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTema } from '@/src/hooks/useTema';
import type { ControleRadarEspera } from '@/src/hooks/useRadarEspera';

/** Configuração é um rascunho: voltar descarta; salvar aplica uma única reconfiguração. */
export default function RadarEsperaSection({ controle: c }: { controle: ControleRadarEspera }) {
  const { cores, temaAtual } = useTema();
  const insets = useSafeAreaInsets();
  const [aberta, setAberta] = useState(false);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [prioritarias, setPrioritarias] = useState<string[]>([]);
  const [janela, setJanela] = useState(10);
  const [iniciar, setIniciar] = useState(false);
  const [contexto, setContexto] = useState('');
  const editavel = c.podeConfigurar && contexto === c.chaveConfiguracao;
  const ativa = c.estado !== 'encerrado';
  const podeSalvar = editavel && selecionadas.length > 0 && !c.solicitando && (ativa || c.podeSolicitarAtivacao);
  const estado = c.estado === 'encerrado' ? 'Desativado' : c.estado === 'ativo' ? 'Ativo'
    : c.estado === 'sem previsões' ? 'Sem previsões' : 'Pausado';
  useEffect(() => {
    if (!iniciar) return;
    setContexto(c.chaveConfiguracao);
    setIniciar(false);
    void c.ativar();
  }, [iniciar, c.ativar, c.chaveConfiguracao]);
  const abrir = () => {
    setSelecionadas([...c.selecionadas]);
    setPrioritarias(c.preferencias.prioritarias.filter(id => c.selecionadas.includes(id)));
    setJanela(c.preferencias.janelaMinutos); setContexto(c.chaveConfiguracao); setAberta(true);
  };
  const salvar = () => {
    if (!podeSalvar) return;
    c.aplicarConfiguracao(selecionadas, prioritarias, janela);
    if (!ativa) setIniciar(true);
    else setAberta(false);
  };
  const texto = { color: cores.textoPrimario };
  const secundario = { color: cores.textoSecundario, fontSize: 12 };
  const toque = { minWidth: 44, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const };
  const card = { padding: 16, borderRadius: 16, backgroundColor: cores.fundoCard, gap: 10 };
  return <View style={{ borderTopWidth: 1, borderColor: cores.bordaSuave, marginTop: 6 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Gerenciar Radar de Espera" onPress={abrir}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.estado === 'ativo' ? cores.sucesso : cores.textoSecundario }} />
      <Text numberOfLines={1} style={{ ...texto, flex: 1, fontSize: 11 }}>
        {ativa ? `Radar ${estado.toLowerCase()} · ${c.paradaNome} · ${c.estado === 'pausado' && c.motivoPausa ? c.motivoPausa : `${c.selecionadas.length} linhas`}` : 'Radar de Espera · Configurar'}
      </Text>
      <Text style={{ color: cores.textoPrimario, fontSize: 11 }}>{ativa ? 'Gerenciar' : 'Ativar'}</Text>
      <ChevronRight size={14} color={cores.iconeSecundario} />
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
          <Text accessibilityLiveRegion="polite" style={{ ...secundario, color: c.estado === 'ativo' ? cores.sucesso : cores.textoSecundario }}>{estado}</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
          {contexto !== c.chaveConfiguracao && <Text style={secundario}>O contexto mudou. Volte e reabra a configuração antes de salvar.</Text>}
          {c.outraParada && <Text style={secundario}>Monitorando {c.paradaNome}. Volte à parada acompanhada para editar. Para trocar o alvo, use o seletor de parada do Radar.</Text>}
          <View style={card}>
            <Text style={{ ...texto, fontWeight: '700' }}>Linhas no Radar</Text>
            <Text style={secundario}>Selecione as linhas para acompanhar. Marque a estrela para destacar uma linha como prioritária.</Text>
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
                  disabled={!editavel} accessibilityState={{ checked: selecionada, disabled: !editavel }}
                  onPress={() => {
                    setSelecionadas(selecionada ? selecionadas.filter(id => id !== l.linhaId) : [...selecionadas, l.linhaId]);
                    if (selecionada) setPrioritarias(prioritarias.filter(id => id !== l.linhaId));
                  }} style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minHeight: 56, gap: 10, opacity: editavel ? 1 : 0.5 }}>
                  <View style={toque}>
                    <View style={{ height: 22, width: 22, borderWidth: 1.5, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: selecionada ? cores.fundoPrimarioSuave : cores.fundoSecundario,
                      borderColor: selecionada ? cores.fundoPrimario : cores.borda }}>
                      {selecionada && <Check size={17} strokeWidth={3} color={cores.textoPrimario} />}
                    </View>
                  </View>
                  <View style={{ backgroundColor: l.cor, borderRadius: 5, padding: 5 }}>
                    <Text style={{ color: cores.textoPrimario, backgroundColor: cores.fundoCard, borderRadius: 3, paddingHorizontal: 3, fontWeight: '700' }}>{l.linhaCodigo}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={{ ...texto, fontWeight: '600', fontSize: 13 }}>{c.destinos[l.linhaId] || l.subtitulo || l.nomeExibicao}</Text>
                    <Text style={{ ...secundario, color: eta != null && eta <= 2 ? cores.sucesso : cores.textoSecundario }}>
                      {eta != null ? `Previsão · ${eta} min` : 'Sem previsão elegível'}
                    </Text>
                  </View>
                </Pressable>
                <Pressable accessibilityRole="checkbox" accessibilityLabel={`Priorizar linha ${l.linhaCodigo}`}
                  accessibilityState={{ checked: prioridade, disabled: !selecionada || !editavel }} disabled={!selecionada || !editavel}
                  onPress={() => setPrioritarias(prioridade ? prioritarias.filter(id => id !== l.linhaId) : [...prioritarias, l.linhaId])}
                  style={{ ...toque, opacity: selecionada && editavel ? 1 : 0.35 }}>
                  <Star size={22} color={prioridade ? cores.fundoPrimario : cores.iconeSecundario} fill={prioridade ? cores.fundoPrimario : 'transparent'} />
                </Pressable>
              </View>;
            })}
          </View>
          <View style={card}>
            <Text style={{ ...texto, fontWeight: '700' }}>Avisar com antecedência</Text>
            <Text style={secundario}>Mostrar veículos previstos dentro deste intervalo.</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[2, 5, 10, 15].map(n => <Pressable key={n} accessibilityRole="radio" accessibilityLabel={`${n} minutos de antecedência`}
                accessibilityState={{ selected: janela === n, disabled: !editavel }} disabled={!editavel} onPress={() => setJanela(n)}
                style={{ ...toque, flex: 1, borderRadius: 10, backgroundColor: janela === n ? cores.fundoPrimario : cores.fundoSecundario }}>
                <Text style={{ color: janela === n ? cores.textoSobrePrimario : cores.textoPrimario, fontWeight: '600' }}>{n} min</Text>
              </Pressable>)}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Diminuir antecedência" disabled={!editavel || janela <= 2} onPress={() => setJanela(janela - 1)} style={toque}><Text style={texto}>−</Text></Pressable>
              <Text style={texto}>{janela} minutos</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Aumentar antecedência" disabled={!editavel || janela >= 15} onPress={() => setJanela(janela + 1)} style={toque}><Text style={texto}>+</Text></Pressable>
            </View>
          </View>
          <View accessibilityLabel="Alertas por voz. Em breve. Indisponível" style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Headphones size={22} color={cores.iconeSecundario} />
            <View><Text style={{ ...texto, fontWeight: '600' }}>Alertas por voz no fone</Text><Text style={secundario}>Em breve</Text></View>
          </View>
          <Text style={secundario}>Funciona com o aplicativo aberto e a consulta ativa. Ao sair, as previsões são removidas.</Text>
          {!ativa && !c.podeSolicitarAtivacao && <Text style={secundario}>Aguarde uma consulta válida desta parada para ativar.</Text>}
          {!!c.previa?.conteudo.terminal?.length && <Text style={secundario}>{c.previa.conteudo.terminal.length} veículos aguardando no terminal · presença não confirma saída.</Text>}
          {(c.mensagem || c.erroPreferencias) && <Text accessibilityLiveRegion="polite" style={{ color: cores.perigo }}>{c.mensagem || c.erroPreferencias}</Text>}
          {c.estado === 'pausado' && c.mensagem && <Pressable accessibilityRole="button" accessibilityLabel="Retomar"
            disabled={!c.podeAtivar || c.solicitando} accessibilityState={{ disabled: !c.podeAtivar || c.solicitando }}
            onPress={() => { void c.ativar(); }} style={{ ...toque, backgroundColor: cores.fundoSecundario, borderRadius: 10 }}>
            <Text style={texto}>Retomar</Text>
          </Pressable>}
        </ScrollView>
        <View style={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16), gap: 8, backgroundColor: cores.fundoPainel, borderTopWidth: 1, borderColor: cores.borda }}>
          <Pressable accessibilityRole="button" accessibilityLabel={ativa ? 'Salvar alterações' : 'Ativar Radar'}
            accessibilityState={{ disabled: !podeSalvar }}
            disabled={!podeSalvar} onPress={salvar}
            style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: cores.fundoPrimario, opacity: podeSalvar ? 1 : 0.5 }}>
            <Text style={{ color: cores.textoSobrePrimario, fontWeight: '700' }}>{ativa ? 'Salvar alterações' : 'Ativar Radar'}</Text>
          </Pressable>
          {ativa && <Pressable accessibilityRole="button" accessibilityLabel="Encerrar acompanhamento" onPress={() => { void c.encerrar(); setAberta(false); }} style={toque}>
            <Text style={{ color: cores.perigo }}>Encerrar acompanhamento</Text>
          </Pressable>}
        </View>
      </View>
    </Modal>}
  </View>;
}
