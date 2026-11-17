import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CalendarClock, Star, MapPin, Plus, RefreshCw, BellRing } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTema } from '../../hooks/useTema';
import Confirmacao from '../Confirmacao';
import type { EntradaPreviaNotificacaoRadar } from '../../services/previaNotificacaoRadar';
import { metadataParadaRadar } from '../../services/radarParadaMetadata';
import { paradasElegiveisRadar } from '../../services/radarParada';
import { buscarParadasProgramacao, linhasParadaProgramacao, contextosLinhaProgramacao, type ParadaProgramacao, type LinhaParadaProgramacao } from '../../services/radarProgramacoesSelecao';
import { selecionarDataHoraProgramacao } from '../../services/radarProgramacoesPicker';
import { radarRemotoAndroid as api } from '../../services/radarRemotoAndroid';
import { conflitoVisual, mensagemProgramacao, pedidoProgramacao, type RadarProgramacao } from '../../services/radarProgramacoes';

const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export default function RadarProgramado({ entrada }: { entrada: EntradaPreviaNotificacaoRadar }) {
  const { cores, temaAtual } = useTema();
  const destaque = temaAtual === 'escuro' ? '#FFD45C' : '#946400';
  const [aberto, abrir] = useState(false), [lista, listar] = useState<RadarProgramacao[]>([]);
  const [draft, editar] = useState<RadarProgramacao | null>(null);
  const [erro, falhar] = useState(''), [busy, ocupar] = useState(false), [excluir, confirmar] = useState<RadarProgramacao | null>(null);
  const lock = useRef(false);
  const [busca, buscar] = useState('');
  const [resultados, resultadosBusca] = useState<ParadaProgramacao[]>([]);
  const [pagina, mudarPagina] = useState(1), [mais, temMais] = useState(false), [buscando, buscarEstado] = useState(false);
  const [erroBusca, falhaBusca] = useState('');
  const [nomesParadas, guardarParadas] = useState<Record<string,string>>({});
  const [nomesLinhas, guardarNomesLinhas] = useState<Record<string,string>>({});
  const [linhasParada, guardarLinhas] = useState<LinhaParadaProgramacao[]>([]);
  const [opcoes, guardarOpcoes] = useState<Awaited<ReturnType<typeof contextosLinhaProgramacao>>>([]);
  const [tentativaLinhas, tentarLinhas] = useState(0), [carregandoLinhas, carregarLinhas] = useState(false);
  const [menu, abrirMenu] = useState<string | null>(null);
  const [push, estadoPush] = useState<'inicial' | 'pendente' | 'pronto'>('inicial');
  const paradaId = draft?.configuracao.paradaId;
  useEffect(() => {
    if (!draft || busca.trim().length < 2) { resultadosBusca([]); temMais(false); buscarEstado(false); return; }
    const controller = new AbortController();
    buscarEstado(true); falhaBusca(''); resultadosBusca([]);
    const timer = setTimeout(() => {
      void buscarParadasProgramacao(busca,pagina,controller.signal).then(r => {
        if (controller.signal.aborted) return;
        resultadosBusca(r.itens); temMais(pagina < r.totalPaginas);
      }).catch(() => { if (!controller.signal.aborted) falhaBusca('Não foi possível buscar. Tente novamente.'); })
        .finally(() => { if (!controller.signal.aborted) buscarEstado(false); });
    },350);
    return () => { clearTimeout(timer); controller.abort(); };
  },[busca,pagina,!!draft]);
  useEffect(() => {
    guardarOpcoes([]); guardarLinhas([]);
    if (!paradaId) { carregarLinhas(false); return; }
    carregarLinhas(true);
    let alive = true;
    void linhasParadaProgramacao(paradaId).then(l => { if (alive) guardarLinhas(l); })
      .catch(() => { if (alive) falhar('Não foi possível consultar as linhas desta parada. Toque em atualizar linhas para tentar.'); })
      .finally(() => { if (alive) carregarLinhas(false); });
    return () => { alive = false; };
  },[paradaId,tentativaLinhas]);
  useEffect(() => api.assinar(s => {
    if (push === 'pendente' && api.pushConfirmado) estadoPush('pronto');
  }),[push]);
  const paradas = useMemo(() => paradasElegiveisRadar(entrada.linhas.map(l => ({ ...l, ativa: true, modoSentido: 'ambos' as const })), 'todos', entrada.itinerarios,
    { latitude: 0, longitude: 0 }, entrada.realtime, Infinity), [entrada.linhas, entrada.itinerarios, entrada.realtime]);

  const nomeParada = (id: string) => nomesParadas[id] ?? paradas.find(p => p.parada.paradaId === id)?.parada.nome ?? `Parada ${id}`;
  const nomeLinha = (id: string) => nomesLinhas[id] ?? linhasParada.find(l => l.linhaId === id)?.nome ?? entrada.linhas.find(l => l.linhaId === id)?.nomeExibicao ?? id;
  async function atualizar() {
    const values = await api.requisitarProgramacoes<RadarProgramacao[]>('GET'); listar(values);
    await Promise.all([...new Set(values.map(p => p.configuracao.paradaId))].map(async id => {
      const [stop, lines] = await Promise.allSettled([metadataParadaRadar(id), linhasParadaProgramacao(id)]);
      if (stop.status === 'fulfilled' && stop.value) guardarParadas(old => ({...old,[id]:stop.value!.nome}));
      if (lines.status === 'fulfilled') guardarNomesLinhas(old => ({...old,...Object.fromEntries(lines.value.map(l => [l.linhaId,`${l.codigo} · ${l.nome}`]))}));
    }));
  }
  async function executar(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; ocupar(true); falhar('');
    try { await fn(); } catch (e) {
      falhar(mensagemProgramacao(e));
      if ((e as {code?:string}).code === 'push_pendente') estadoPush('pendente');
      if ((e as { code?: string }).code === 'revisao_desatualizada') {
        try { await atualizar(); if (draft?.id) editar(await api.requisitarProgramacoes<RadarProgramacao>('GET', `/${draft.id}`)); } catch { /* mantém rascunho em falha de rede */ }
      }
    } finally { lock.current = false; ocupar(false); }
  }
  useEffect(() => {
    if (!aberto) return;
    void executar(async () => { await api.reconciliar(); await atualizar(); });
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void executar(async () => { await api.reconciliar(); await atualizar(); }); });
    return () => sub.remove();
  }, [aberto]);
  function novo() {
    let fuso = ''; try { fuso = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
    if (!fuso) { falhar('Não foi possível identificar o fuso do aparelho. Ajuste data e hora nas configurações Android.'); return; }
    editar({ id: '', nome: '', fuso, horaLocal: '08:00', dataLocal: null, dias: [1,2,3,4,5], estado: 'ativa', revisao: 0,
      configuracao: { paradaId: '', contextos: [], linhasSelecionadas: [], linhasPrioritarias: [], antecedenciaMinutos: 5 },
      proximaExecucaoUtc: null, ultimaOcorrenciaUtc: null, ultimoResultado: null });
  }
  async function prepararPush() {
    await api.prepararProgramacoes(); estadoPush('pronto');
  }
  async function escolherDataHora(mode: 'date' | 'time') {
    if (!draft) return;
    await executar(async () => {
      const now = new Date();
      const hoje = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const value = await selecionarDataHoraProgramacao(mode, mode === 'time' ? draft.horaLocal : draft.dataLocal ?? hoje);
      if (value) editar({ ...draft, ...(mode === 'time' ? { horaLocal:value } : { dataLocal:value }) });
    });
  }
  function selecionarContexto(linhaId: string, sentidoId: string) {
    if (!draft) return;
    const old = draft.configuracao;
    const selected = old.contextos.some(c => c.linhaId === linhaId && c.sentidoId === sentidoId);
    const contextos = selected ? old.contextos.filter(c => c.linhaId !== linhaId || c.sentidoId !== sentidoId)
      : [...old.contextos, ...opcoes.filter(c => c.linhaId === linhaId && c.sentidoId === sentidoId).map(({destino,...c}) => c)];
    const linhasSelecionadas = [...new Set(contextos.map(c => c.linhaId))];
    editar({ ...draft, configuracao: { ...old, contextos, linhasSelecionadas, linhasPrioritarias: old.linhasPrioritarias.filter(id => linhasSelecionadas.includes(id)) } });
  }
  async function salvar() {
    if (!draft) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(draft.horaLocal) || (!draft.dataLocal && !draft.dias.length)
      || (draft.dataLocal && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dataLocal) || Number.isNaN(Date.parse(draft.dataLocal))))
      || !draft.configuracao.contextos.length) { falhar('Confira horário, data/dias e selecione ao menos uma linha e sentido compatível.'); return; }
    await executar(async () => {
      await prepararPush();
      await api.requisitarProgramacoes(draft.id ? 'PUT' : 'POST', draft.id ? `/${draft.id}` : '', pedidoProgramacao(draft));
      editar(null); await atualizar();
    });
  }
  const txt = { color: cores.textoPrimario, fontSize: 16 };
  const card = { padding: 16, gap: 10, borderRadius: 20, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.fundoPainel };
  const button = (label: string, action: () => void, selected = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ disabled: busy, selected }} disabled={busy} onPress={action}
    style={{ minHeight: 48, padding: 12, borderRadius: 12, justifyContent: 'center', backgroundColor: selected ? '#FFC107' : cores.fundoSecundario }}><Text style={{ ...txt, color: selected ? '#302600' : cores.textoPrimario }}>{label}</Text></Pressable>;
  const field = (label: string, value: string, change: (v: string) => void, numeric = false) => <View style={{ gap: 6 }}><Text style={txt}>{label}</Text><TextInput accessibilityLabel={label} editable={!busy} value={value} onChangeText={change} keyboardType={numeric ? 'numbers-and-punctuation' : 'default'} style={{ ...txt, minHeight: 48, padding: 12, borderWidth: 1, borderColor: cores.borda, borderRadius: 12 }}/></View>;
  const end = (time: string) => `${String((Number(time.slice(0,2)) + 1) % 24).padStart(2, '0')}:${time.slice(3,5)}`;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir Radar Programado" onPress={() => abrir(true)} style={{ ...card, flexDirection: 'row', alignItems: 'center' }}><CalendarClock color={destaque} size={23}/><Text style={txt}>Radar Programado</Text></Pressable>
    <Modal visible={aberto} animationType="slide" onRequestClose={() => { if (!busy) { if (draft) editar(null); else abrir(false); } }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: cores.fundoPainel }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 14 }}>
          <Text accessibilityRole="header" style={{ ...txt, fontSize: 25, fontWeight: '800' }}>{draft ? 'Programação' : 'Radar Programado'}</Text>
          {button(draft ? 'Voltar à lista' : 'Fechar', () => draft ? editar(null) : abrir(false))}
          <Text style={{ color: cores.textoSecundario }}>Cada programação ocupa uma hora. O Radar inicia automaticamente e envia notificações silenciosas.</Text>
          {busy && <ActivityIndicator color={destaque}/>}
          <View style={card}>
            <View style={{flexDirection:'row',alignItems:'center',gap:8}}><BellRing size={20} color={destaque}/><Text style={{...txt,fontWeight:'700'}}>Notificações deste aparelho</Text></View>
            <Text accessibilityLiveRegion="polite" style={{color:cores.textoSecundario}}>{push === 'pronto' ? 'Push confirmado. Aparelho pronto para programar.' : push === 'pendente' ? 'Confirmação em andamento. Mantenha o app aberto e aguarde. Depois, toque em verificar.' : 'Prepare as notificações para receber o Radar, mesmo sem uma sessão manual ativa.'}</Text>
            {push !== 'pronto' && button(push === 'pendente' ? 'Verificar confirmação' : 'Preparar notificações', () => void executar(prepararPush))}
          </View>
          {!!erro && <Text accessibilityRole="alert" style={{ color: cores.perigo }}>{erro}</Text>}
          {!draft ? <>
            <View style={{flexDirection:'row',gap:8,alignItems:'center'}}><Plus size={20} color={destaque}/>{button('Nova programação', novo, true)}<Pressable accessibilityRole="button" accessibilityLabel="Atualizar programações" disabled={busy} onPress={() => void executar(atualizar)} style={{minWidth:48,minHeight:48,justifyContent:'center',alignItems:'center'}}><RefreshCw color={cores.textoPrimario} size={22}/></Pressable></View>
            {!lista.length && !busy && <Text style={txt}>Nenhuma programação. Programe seu próximo embarque.</Text>}
            {lista.map(p => <View key={p.id} style={card}>
              <View style={{flexDirection:'row',alignItems:'center',gap:8}}><CalendarClock size={22} color={destaque}/><Text style={{ ...txt, flex:1, fontSize:20, fontWeight: '800' }}>{p.nome}</Text><Text style={{color:cores.textoSecundario}}>{p.estado === 'ativa' ? 'Ativa' : p.estado === 'pausada' ? 'Pausada' : p.estado}</Text></View>
              <Text style={txt}>{p.horaLocal.slice(0,5)}–{end(p.horaLocal)} · {p.dataLocal ? p.dataLocal.split('-').reverse().join('/') : p.dias.map(d => diasSemana[d]).join(', ')}</Text>
              <View style={{flexDirection:'row',gap:6}}><MapPin size={18} color={cores.textoSecundario}/><Text style={{...txt,flex:1}}>{nomeParada(p.configuracao.paradaId)}</Text></View>
              <Text style={txt}>{p.configuracao.linhasSelecionadas.map(id => `${p.configuracao.linhasPrioritarias.includes(id) ? '★ ' : ''}${nomeLinha(id)}`).join(' · ')}</Text>
              {p.ultimoResultado && <Text style={{color:cores.textoSecundario}}>Última execução: {p.ultimoResultado}</Text>}
              <Text style={{ color: destaque, fontWeight: '800', fontSize:16, padding:12, borderRadius:12, backgroundColor: temaAtual === 'escuro' ? '#302B19' : '#FFF7DA' }}>Próxima: {p.proximaExecucaoUtc ? new Date(p.proximaExecucaoUtc).toLocaleString('pt-BR') : 'Sem ativação prevista'}</Text>
              {button(menu === p.id ? 'Fechar ações' : 'Gerenciar programação', () => abrirMenu(menu === p.id ? null : p.id))}
              {menu === p.id && <View style={{gap:8}}>
              {button('Editar', () => void executar(async () => editar(await api.requisitarProgramacoes<RadarProgramacao>('GET', `/${p.id}`))))}
              {button('Duplicar', () => editar({ ...p, id: '', nome: `${p.nome.slice(0,72)} (cópia)`, revisao: 0, estado: 'ativa' }))}
              {button(p.estado === 'ativa' ? 'Pausar' : 'Reativar', () => void executar(async () => {
                if (p.estado !== 'ativa') await prepararPush();
                await api.requisitarProgramacoes('PUT', `/${p.id}`, pedidoProgramacao({ ...p, estado: p.estado === 'ativa' ? 'pausada' : 'ativa' })); await atualizar();
              }))}
              {button('Excluir', () => confirmar(p))}</View>}
            </View>)}
          </> : <>
            {field('Nome (opcional)', draft.nome, nome => editar({ ...draft, nome: nome.slice(0,80) }))}
            {button(`Horário de início: ${draft.horaLocal.slice(0,5)}`, () => void escolherDataHora('time'))}
            <Text style={txt}>Término: {end(draft.horaLocal)} · Fuso: {draft.fuso}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>{button('Semanal', () => editar({ ...draft, dataLocal: null }), !draft.dataLocal)}{button('Data única', () => void escolherDataHora('date'), !!draft.dataLocal)}</View>
            {draft.dataLocal !== null ? button(`Data: ${draft.dataLocal.split('-').reverse().join('/')}`, () => void escolherDataHora('date')) : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{diasSemana.map((d,i) => button(d, () => editar({ ...draft, dias: draft.dias.includes(i) ? draft.dias.filter(v => v !== i) : [...draft.dias,i] }), draft.dias.includes(i)))}</View>}
            <Text style={txt}>Parada: {draft.configuracao.paradaId ? nomeParada(draft.configuracao.paradaId) : 'Selecione'}</Text>
            {field('Buscar parada por nome', busca, value => { buscar(value); mudarPagina(1); })}
            <Text style={{ color: cores.textoSecundario }}>Busque qualquer parada pelo nome, sem alterar o mapa ou o Radar manual.</Text>
            {buscando && <ActivityIndicator color={destaque}/>}
            {!!erroBusca && <Text accessibilityRole="alert" style={{color:cores.perigo}}>{erroBusca}</Text>}
            {!buscando && busca.trim().length >= 2 && !resultados.length && !erroBusca && <Text style={txt}>Nenhuma parada encontrada.</Text>}
            {resultados.map(p => button(p.nome + ' · ' + p.id.slice(0,8), () => {
              guardarParadas(old => ({...old,[p.id]:p.nome})); buscar(''); resultadosBusca([]);
              editar({ ...draft, configuracao: { ...draft.configuracao, paradaId:p.id, contextos:[],linhasSelecionadas:[],linhasPrioritarias:[] } });
            },p.id === paradaId))}
            <View style={{flexDirection:'row',gap:8}}>{pagina > 1 && button('Página anterior',() => mudarPagina(p => p-1))}{mais && button('Próxima página',() => mudarPagina(p => p+1))}</View>
            <Text style={{...txt,fontWeight:'800'}}>Linhas e sentidos</Text>
            {carregandoLinhas && <ActivityIndicator color={destaque}/>}
            {paradaId && button('Atualizar linhas da parada', () => tentarLinhas(n => n+1))}
            {linhasParada.map(l => <View key={l.linhaId} style={card}>
              {button(`${l.codigo} · ${l.nome}`, () => void executar(async () => {
                const options = await contextosLinhaProgramacao(draft.configuracao.paradaId,l);
                guardarOpcoes(old => [...old.filter(c => c.linhaId !== l.linhaId),...options]);
                if (!options.length) falhar('Esta linha não possui sentidos compatíveis para embarque nesta parada.');
              }))}
              {opcoes.filter(v => v.linhaId === l.linhaId).filter((v,i,a) => a.findIndex(x => x.sentidoId === v.sentidoId) === i).map(v => button(v.destino || 'Sentido', () => selecionarContexto(v.linhaId,v.sentidoId), draft.configuracao.contextos.some(c => c.linhaId === v.linhaId && c.sentidoId === v.sentidoId)))}
              {draft.configuracao.linhasSelecionadas.includes(l.linhaId) && <Pressable accessibilityRole="checkbox" accessibilityLabel={`Priorizar ${l.nome}`} accessibilityState={{checked:draft.configuracao.linhasPrioritarias.includes(l.linhaId)}} disabled={busy} onPress={() => {
                const ids = draft.configuracao.linhasPrioritarias;
                editar({...draft,configuracao:{...draft.configuracao,linhasPrioritarias:ids.includes(l.linhaId) ? ids.filter(id => id !== l.linhaId) : [...ids,l.linhaId]}});
              }} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:8}}><Star color={destaque} fill={draft.configuracao.linhasPrioritarias.includes(l.linhaId) ? '#FFC107' : 'transparent'}/><Text style={txt}>Prioritária</Text></Pressable>}
            </View>)}
            <Text style={txt}>Antecedência: {draft.configuracao.antecedenciaMinutos} minutos</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>{button('Diminuir', () => editar({ ...draft, configuracao: { ...draft.configuracao, antecedenciaMinutos: Math.max(2,draft.configuracao.antecedenciaMinutos-1) } }))}{button('Aumentar', () => editar({ ...draft, configuracao: { ...draft.configuracao, antecedenciaMinutos: Math.min(15,draft.configuracao.antecedenciaMinutos+1) } }))}</View>
            {lista.some(p => conflitoVisual(draft,p)) && <Text accessibilityRole="alert" style={{ color: cores.perigo }}>Este horário pode conflitar com outra programação. Ajuste o início; cada programação ocupa uma hora.</Text>}
            {button('Salvar programação', () => void salvar(), true)}
          </>}
        </ScrollView>
      </SafeAreaView>
      <Confirmacao visivel={!!excluir} titulo="Excluir programação?" descricao={excluir?.nome ?? ''} variante="destrutiva" processando={busy} onCancelar={() => confirmar(null)} onConfirmar={async () => { if (!excluir) return; await executar(async () => { await api.requisitarProgramacoes('DELETE', `/${excluir.id}?revisaoEsperada=${excluir.revisao}`); confirmar(null); await atualizar(); }); }}/>
    </Modal>
  </>;
}
