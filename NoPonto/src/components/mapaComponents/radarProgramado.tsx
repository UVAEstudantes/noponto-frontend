import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, LayoutAnimation, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ArrowLeft, CalendarClock, Clock3, Star, MapPin, Plus, Minus, RefreshCw, BellRing, Check, ChevronRight, ChevronDown, MoreHorizontal, Pencil, Copy, Pause, Play, Trash2, type LucideIcon } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTema } from '../../hooks/useTema';
import Confirmacao from '../Confirmacao';
import type { EntradaPreviaNotificacaoRadar } from '../../services/previaNotificacaoRadar';
import { metadataParadaRadar } from '../../services/radarParadaMetadata';
import { linhasParadaProgramacao, contextosLinhaProgramacao, type LinhaParadaProgramacao } from '../../services/radarProgramacoesSelecao';
import { selecionarDataHoraProgramacao } from '../../services/radarProgramacoesPicker';
import { radarRemotoAndroid as api } from '../../services/radarRemotoAndroid';
import { conflitoVisual, mensagemProgramacao, pedidoProgramacao, type RadarProgramacao } from '../../services/radarProgramacoes';

const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export default function RadarProgramado({ entrada, sugeridas = [] }: { entrada: EntradaPreviaNotificacaoRadar & { paradaAberta?: import('../../types/transporte').Parada | null }; sugeridas?: string[] }) {
  const { cores, temaAtual } = useTema();
  const destaque = temaAtual === 'escuro' ? '#FFD45C' : '#946400';
  const [aberto, abrir] = useState(false), [lista, listar] = useState<RadarProgramacao[]>([]);
  const [draft, editar] = useState<RadarProgramacao | null>(null);
  const [erro, falhar] = useState(''), [busy, ocupar] = useState(false), [excluir, confirmar] = useState<RadarProgramacao | null>(null);
  const lock = useRef(false);
  const [todas, mostrarTodas] = useState(false), [expandida, expandir] = useState<string | null>(null);
  const [nomesParadas, guardarParadas] = useState<Record<string,string>>({});
  const [nomesLinhas, guardarNomesLinhas] = useState<Record<string,string>>({});
  const [linhasParada, guardarLinhas] = useState<LinhaParadaProgramacao[]>([]);
  const [opcoes, guardarOpcoes] = useState<Awaited<ReturnType<typeof contextosLinhaProgramacao>>>([]);
  const [tentativaLinhas, tentarLinhas] = useState(0), [carregandoLinhas, carregarLinhas] = useState(false);
  const [menu, abrirMenu] = useState<string | null>(null);
  const [push, estadoPush] = useState<'inicial' | 'pendente' | 'pronto'>(api.pushConfirmado ? 'pronto' : 'inicial');
  const paradaId = draft?.configuracao.paradaId;
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
  useEffect(() => api.assinar(() => {
    if (api.pushConfirmado) estadoPush('pronto');
  }),[]);
  const nomeParada = (id: string) => nomesParadas[id] ?? (entrada.paradaAberta?.paradaId === id ? entrada.paradaAberta.nome : null) ?? `Parada ${id}`;
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
      if ((e as {code?:string}).code === 'permissao_negada') estadoPush('inicial');
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
  function abrirRascunho(value: RadarProgramacao) {
    mostrarTodas(false); expandir(null); abrirMenu(null); falhar(''); editar(value);
  }
  function novo() {
    const stop = entrada.paradaAberta;
    if (!stop) { falhar('Abra uma parada no mapa para criar sua programação.'); return; }
    guardarParadas(old => ({...old,[stop.paradaId]:stop.nome}));
    let fuso = ''; try { fuso = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
    if (!fuso) { falhar('Não foi possível identificar o fuso do aparelho. Ajuste data e hora nas configurações Android.'); return; }
    abrirRascunho({ id: '', nome: '', fuso, horaLocal: '08:00', dataLocal: null, dias: [1,2,3,4,5], estado: 'ativa', revisao: 0,
      configuracao: { paradaId: stop.paradaId, contextos: [], linhasSelecionadas: [], linhasPrioritarias: [], antecedenciaMinutos: 5 },
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
  async function carregarSentidos(l: LinhaParadaProgramacao) {
    const known = opcoes.filter(c => c.linhaId === l.linhaId);
    if (known.length) return known;
    const options = await contextosLinhaProgramacao(draft!.configuracao.paradaId,l);
    guardarOpcoes(old => [...old.filter(c => c.linhaId !== l.linhaId),...options]);
    if (!options.length) throw new Error('contexto_indisponivel');
    return options;
  }
  function alternarLinha(l: LinhaParadaProgramacao) {
    if (!draft) return;
    const old = draft.configuracao;
    if (old.linhasSelecionadas.includes(l.linhaId)) {
      editar({...draft,configuracao:{...old,contextos:old.contextos.filter(c => c.linhaId !== l.linhaId),linhasSelecionadas:old.linhasSelecionadas.filter(id => id !== l.linhaId),linhasPrioritarias:old.linhasPrioritarias.filter(id => id !== l.linhaId)}});
    } else void executar(async () => {
      const options = await carregarSentidos(l);
      expandir(l.linhaId);
      editar({...draft,configuracao:{...old,contextos:[...old.contextos,...options.map(({destino,...c}) => c)],linhasSelecionadas:[...old.linhasSelecionadas,l.linhaId]}});
    });
  }
  function priorizar(id: string) {
    if (!draft) return;
    const ids = draft.configuracao.linhasPrioritarias;
    editar({...draft,configuracao:{...draft.configuracao,linhasPrioritarias:ids.includes(id) ? ids.filter(v => v !== id) : [...ids,id]}});
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
  const txt = { color: cores.textoPrimario, fontSize: 15 };
  const muted = { color: cores.textoSecundario, fontSize: 13, lineHeight: 19 };
  const surface = { backgroundColor: cores.fundoPainel, borderRadius: 22, borderWidth: 1, borderColor: cores.bordaSuave };
  const tint = temaAtual === 'escuro' ? '#302B19' : '#FFF7DA';
  const end = (time: string) => `${String((Number(time.slice(0,2)) + 1) % 24).padStart(2, '0')}:${time.slice(3,5)}`;
  const transition = () => LayoutAnimation?.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  const iconButton = (label: string, Icon: LucideIcon, action: () => void, color = cores.textoSecundario, disabled = busy) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={action} style={({pressed}) => ({ width:44, minHeight:44, borderRadius:14, justifyContent:'center', alignItems:'center', opacity:disabled ? .35 : pressed ? .55 : 1 })}><Icon size={21} color={color}/></Pressable>;
  const primary = (label: string, action: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy} accessibilityState={{disabled:busy}} onPress={action}
    style={({pressed}) => ({ minHeight:52, borderRadius:16, backgroundColor:'#FFC107', alignItems:'center', justifyContent:'center', flexDirection:'row', gap:8, paddingHorizontal:20, opacity:busy ? .6 : pressed ? .8 : 1 })}>{busy ? <ActivityIndicator color="#302600"/> : <>{label === 'Salvar programação' ? <Check size={19} color="#302600"/> : <Plus size={19} color="#302600"/>}<Text style={{color:'#302600',fontSize:16,fontWeight:'800'}}>{label}</Text></>}</Pressable>;
  const sectionTitle = (title: string, detail?: string) => <View style={{gap:3,marginBottom:12}}><Text style={{...txt,fontSize:16,fontWeight:'800'}}>{title}</Text>{detail && <Text style={muted}>{detail}</Text>}</View>;
  const action = (label: string, Icon: LucideIcon, onPress: () => void, destructive = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={onPress} style={({pressed}) => ({flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,minHeight:44,borderRadius:12,backgroundColor:pressed ? cores.fundoSecundario : 'transparent'})}><Icon size={17} color={destructive ? cores.perigo : cores.textoSecundario}/><Text style={{...txt,fontSize:13,color:destructive ? cores.perigo : cores.textoPrimario}}>{label}</Text></Pressable>;
  const suggested = new Set([...sugeridas,...entrada.linhas.filter(l => l.ativa).map(l => l.linhaId)]);
  const ordered = [...linhasParada].sort((a,b) => Number(suggested.has(b.linhaId))-Number(suggested.has(a.linhaId)) || a.codigo.localeCompare(b.codigo,'pt-BR',{numeric:true}));
  const shown = todas ? ordered : ordered.filter((l,i) => suggested.has(l.linhaId) || draft?.configuracao.linhasSelecionadas.includes(l.linhaId) || i < 3);
  const back = () => { if (!busy) { falhar(''); if (draft) editar(null); else abrir(false); } };
  const scheduleDays = (p: RadarProgramacao) => p.dataLocal ? p.dataLocal.split('-').reverse().join('/') : p.dias.length === 7 ? 'Todos os dias' : [...p.dias].sort().map(d => diasSemana[d]).join(' · ');
  const stateName = (state: string) => ({ativa:'Ativa',pausada:'Pausada',concluida:'Concluída'}[state] ?? state);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir Radar Programado" onPress={() => abrir(true)} style={({pressed}) => ({...surface,padding:14,flexDirection:'row',alignItems:'center',gap:12,opacity:pressed ? .75 : 1})}>
      <View style={{width:40,height:40,borderRadius:13,backgroundColor:tint,alignItems:'center',justifyContent:'center'}}><CalendarClock size={22} color={destaque}/></View>
      <View style={{flex:1,gap:3}}><Text style={{...txt,fontWeight:'800'}}>Radar Programado</Text><Text style={muted}>Seu próximo embarque, no horário certo</Text></View><ChevronRight size={19} color={cores.textoSecundario}/>
    </Pressable>
    <Modal visible={aberto} animationType="slide" onRequestClose={back}>
      <SafeAreaView style={{flex:1,backgroundColor:cores.fundoApp}}>
        <View style={{paddingHorizontal:12,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:6}}>
          {iconButton('Voltar do Radar Programado',ArrowLeft,back)}
          <View style={{flex:1,gap:3}}><Text accessibilityRole="header" style={{...txt,fontSize:23,fontWeight:'800'}}>{draft ? 'Programar Radar' : 'Radar Programado'}</Text><Text style={muted}>{draft ? 'Deixe seu próximo embarque preparado.' : 'Sua rotina começa antes de sair.'}</Text></View>
          {!draft && iconButton('Atualizar programações',RefreshCw,() => void executar(atualizar))}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal:20,paddingTop:8,paddingBottom:24,gap:16}}>
          {!draft && !!erro && <View style={{...surface,padding:14,borderColor:cores.perigo}}><Text accessibilityRole="alert" style={{color:cores.perigo,fontSize:14,lineHeight:20}}>{erro}</Text></View>}
          {!draft && <>
            {primary('Nova programação',novo)}
            {!lista.length && !busy && <View style={{...surface,padding:26,alignItems:'center',gap:12}}><CalendarClock size={38} color={destaque}/><Text style={{...txt,fontSize:18,fontWeight:'800'}}>Seu Radar, na sua rotina</Text><Text style={{...muted,textAlign:'center'}}>Abra uma parada no mapa e programe quando deseja acompanhar seu embarque.</Text></View>}
            {busy && <ActivityIndicator color={destaque}/>}
            {lista.map(p => <View key={p.id} style={{...surface,overflow:'hidden'}}>
              <View style={{padding:16,gap:10}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={{...txt,flex:1,fontWeight:'800',fontSize:16}}>{p.nome}</Text><View style={{paddingHorizontal:9,paddingVertical:4,borderRadius:20,backgroundColor:p.estado === 'ativa' ? tint : cores.fundoSecundario}}><Text style={{fontSize:11,fontWeight:'700',color:p.estado === 'ativa' ? destaque : cores.textoSecundario}}>{stateName(p.estado)}</Text></View>{iconButton(`Ações de ${p.nome}`,MoreHorizontal,() => {transition();abrirMenu(menu === p.id ? null : p.id);})}</View>
                <View style={{flexDirection:'row',alignItems:'baseline',gap:8}}><Text style={{...txt,fontSize:29,fontWeight:'800',letterSpacing:-1}}>{p.horaLocal.slice(0,5)}</Text><Text style={muted}>até {end(p.horaLocal)}</Text></View>
                <Text style={{...muted,fontWeight:'600'}}>{scheduleDays(p)}</Text>
                <View style={{flexDirection:'row',gap:6,alignItems:'center'}}><MapPin size={15} color={cores.textoSecundario}/><Text style={{...txt,fontSize:13,flex:1}}>{nomeParada(p.configuracao.paradaId)}</Text></View>
                <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{p.configuracao.linhasSelecionadas.map(id => <View key={id} style={{flexDirection:'row',alignItems:'center',gap:4,borderRadius:8,paddingVertical:5,paddingHorizontal:8,backgroundColor:cores.fundoSecundario}}>{p.configuracao.linhasPrioritarias.includes(id) && <Star size={12} color={destaque} fill="#FFC107"/>}<Text style={{...txt,fontSize:12}}>{nomeLinha(id)}</Text></View>)}</View>
              </View>
              <View style={{paddingHorizontal:16,paddingVertical:11,backgroundColor:p.proximaExecucaoUtc ? tint : cores.fundoSecundario,flexDirection:'row',alignItems:'center',gap:7}}><CalendarClock size={15} color={destaque}/><Text style={{fontSize:12,fontWeight:'700',color:p.proximaExecucaoUtc ? destaque : cores.textoSecundario}}>{p.proximaExecucaoUtc ? `Próxima · ${new Date(p.proximaExecucaoUtc).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}` : p.estado === 'pausada' ? 'Pausada por você' : 'Sem próxima ativação'}</Text></View>
              {menu === p.id && <View style={{padding:8,flexDirection:'row',flexWrap:'wrap',borderTopWidth:1,borderColor:cores.bordaSuave}}>
                {action('Editar',Pencil,() => void executar(async () => abrirRascunho(await api.requisitarProgramacoes<RadarProgramacao>('GET',`/${p.id}`))))}
                {action('Duplicar',Copy,() => abrirRascunho({...p,id:'',nome:`${p.nome.slice(0,72)} (cópia)`,revisao:0,estado:'ativa'}))}
                {action(p.estado === 'ativa' ? 'Pausar' : 'Reativar',p.estado === 'ativa' ? Pause : Play,() => void executar(async () => {if (p.estado !== 'ativa') await prepararPush();await api.requisitarProgramacoes('PUT',`/${p.id}`,pedidoProgramacao({...p,estado:p.estado === 'ativa' ? 'pausada' : 'ativa'}));await atualizar();}))}
                {action('Excluir',Trash2,() => confirmar(p),true)}
              </View>}
            </View>)}
          </>}
          {draft && <>
            <View style={{...surface,padding:15,flexDirection:'row',alignItems:'center',gap:12}}><View style={{width:40,height:40,borderRadius:13,backgroundColor:tint,alignItems:'center',justifyContent:'center'}}><MapPin size={21} color={destaque}/></View><View style={{flex:1,gap:3}}><Text style={{...muted,fontSize:11}}>PARADA MONITORADA</Text><Text style={{...txt,fontWeight:'700'}}>{nomeParada(draft.configuracao.paradaId)}</Text></View></View>
            <View style={{...surface,padding:18,gap:16}}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Horário de início: ${draft.horaLocal.slice(0,5)}`} disabled={busy} onPress={() => void escolherDataHora('time')} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><View><Text style={muted}>Começar às</Text><Text style={{...txt,fontSize:48,fontWeight:'800',letterSpacing:-2}}>{draft.horaLocal.slice(0,5)}</Text><Text style={muted}>Até {end(draft.horaLocal)} · 1 hora de Radar</Text></View><View style={{borderRadius:18,padding:14,backgroundColor:tint}}><Clock3 size={25} color={destaque}/></View></Pressable>
              <View style={{flexDirection:'row',backgroundColor:cores.fundoSecundario,borderRadius:12,padding:4}}>{['Uma vez','Semanal'].map((label,i) => {const selected = i === 0 ? draft.dataLocal !== null : draft.dataLocal === null;return <Pressable key={label} accessibilityRole="button" accessibilityState={{selected,disabled:busy}} disabled={busy} onPress={() => i === 0 ? void escolherDataHora('date') : editar({...draft,dataLocal:null})} style={{flex:1,minHeight:42,alignItems:'center',justifyContent:'center',borderRadius:9,backgroundColor:selected ? '#FFC107' : 'transparent'}}><Text style={{fontWeight:'700',fontSize:14,color:selected ? '#302600' : cores.textoSecundario}}>{label}</Text></Pressable>;})}</View>
              {draft.dataLocal ? <Pressable accessibilityRole="button" accessibilityLabel="Alterar data" disabled={busy} onPress={() => void escolherDataHora('date')} style={{flexDirection:'row',alignItems:'center',gap:10,minHeight:44}}><CalendarClock size={20} color={destaque}/><Text style={{...txt,flex:1,fontWeight:'600'}}>{draft.dataLocal.split('-').reverse().join('/')}</Text><ChevronRight size={18} color={cores.textoSecundario}/></Pressable> : <View style={{flexDirection:'row',gap:4}}>{diasSemana.map((day,i) => {const selected = draft.dias.includes(i);return <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={day} accessibilityState={{checked:selected,disabled:busy}} disabled={busy} onPress={() => editar({...draft,dias:selected ? draft.dias.filter(d => d !== i) : [...draft.dias,i]})} style={{flex:1,minHeight:44,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:selected ? tint : 'transparent',borderWidth:1,borderColor:selected ? '#FFC107' : cores.bordaSuave}}><Text adjustsFontSizeToFit numberOfLines={1} style={{fontSize:12,fontWeight:'700',color:selected ? destaque : cores.textoSecundario}}>{day}</Text></Pressable>;})}</View>}
              <Text style={{...muted,fontSize:11}}>Horário de {draft.fuso.replace(/_/g,' ')}</Text>
            </View>
            <View style={{...surface,padding:16}}>
              {sectionTitle('Linhas monitoradas','Selecione as linhas e ajuste os sentidos abaixo.')}
              {carregandoLinhas ? <ActivityIndicator color={destaque}/> : !linhasParada.length && <View style={{gap:4}}><Text style={muted}>Não há linhas disponíveis. Tente atualizar.</Text>{action('Atualizar linhas',RefreshCw,() => tentarLinhas(n => n+1))}</View>}
              {shown.map(l => {const selected = draft.configuracao.linhasSelecionadas.includes(l.linhaId);const expanded = expandida === l.linhaId;const priority = draft.configuracao.linhasPrioritarias.includes(l.linhaId);return <View key={l.linhaId} style={{borderTopWidth:1,borderColor:cores.bordaSuave,paddingVertical:7}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
                  <Pressable accessibilityRole="checkbox" accessibilityLabel={`Monitorar linha ${l.codigo}`} accessibilityState={{checked:selected,disabled:busy}} disabled={busy} onPress={() => alternarLinha(l)} style={({pressed}) => ({flex:1,minHeight:52,flexDirection:'row',alignItems:'center',gap:10,opacity:pressed ? .6 : 1})}>
                    <View style={{width:22,height:22,borderRadius:7,borderWidth:1.5,borderColor:selected ? '#FFC107' : cores.borda,backgroundColor:selected ? '#FFC107' : 'transparent',alignItems:'center',justifyContent:'center'}}>{selected && <Check size={15} color="#302600"/>}</View>
                    <View style={{gap:3,flex:1}}><View style={{flexDirection:'row',alignItems:'center',gap:6}}><Text style={{...txt,fontWeight:'800'}}>{l.codigo}</Text>{suggested.has(l.linhaId) && <Text style={{fontSize:10,color:destaque}}>Sugerida</Text>}</View><Text numberOfLines={2} style={{...muted,fontSize:12}}>{l.nome}</Text></View>
                  </Pressable>
                  <Pressable accessibilityRole="checkbox" accessibilityLabel={`Priorizar ${l.nome}`} accessibilityState={{checked:priority,disabled:busy || !selected}} disabled={busy || !selected} onPress={() => priorizar(l.linhaId)} style={{width:44,minHeight:44,alignItems:'center',justifyContent:'center',opacity:selected ? 1 : .35}}><Star size={20} color={priority ? destaque : cores.textoSecundario} fill={priority ? '#FFC107' : 'transparent'}/></Pressable>
                  {iconButton(`Sentidos da linha ${l.codigo}`,expanded ? ChevronDown : ChevronRight,() => {transition();if (expanded) expandir(null);else void executar(async () => {await carregarSentidos(l);expandir(l.linhaId);});})}
                </View>
                {expanded && <View style={{paddingLeft:32,paddingBottom:4}}>{opcoes.filter(c => c.linhaId === l.linhaId).filter((c,i,a) => a.findIndex(v => v.sentidoId === c.sentidoId) === i).map(c => {const checked = draft.configuracao.contextos.some(v => v.linhaId === c.linhaId && v.sentidoId === c.sentidoId);return <Pressable key={c.sentidoId} accessibilityRole="checkbox" accessibilityLabel={`Sentido ${c.destino}`} accessibilityState={{checked,disabled:busy}} disabled={busy} onPress={() => selecionarContexto(c.linhaId,c.sentidoId)} style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:8}}><View style={{width:18,height:18,borderRadius:9,borderWidth:1,borderColor:checked ? '#FFC107' : cores.borda,backgroundColor:checked ? '#FFC107' : 'transparent',justifyContent:'center',alignItems:'center'}}>{checked && <Check size={12} color="#302600"/>}</View><Text style={{...muted,flex:1,color:checked ? cores.textoPrimario : cores.textoSecundario}}>{c.destino}</Text></Pressable>;})}</View>}
              </View>;})}
              {ordered.length > 3 && action(todas ? 'Recolher linhas' : `Ver todas as linhas (${ordered.length})`,todas ? ChevronDown : Plus,() => {transition();mostrarTodas(!todas);})}
              <Text style={{...muted,fontSize:11,marginTop:8}}>★ Marque suas linhas prioritárias. Sua seleção no mapa permanece igual.</Text>
            </View>
            <View style={{...surface,padding:16,flexDirection:'row',alignItems:'center',gap:12}}><View style={{flex:1,gap:3}}><Text style={{...txt,fontWeight:'800'}}>Avisar antes</Text><Text style={muted}>Antecedência da chegada</Text></View><View style={{flexDirection:'row',alignItems:'center',borderRadius:14,backgroundColor:cores.fundoSecundario}}>{iconButton('Diminuir antecedência',Minus,() => editar({...draft,configuracao:{...draft.configuracao,antecedenciaMinutos:draft.configuracao.antecedenciaMinutos-1}}),cores.textoPrimario,busy || draft.configuracao.antecedenciaMinutos <= 2)}<Text style={{...txt,fontWeight:'800',minWidth:36,textAlign:'center'}}>{draft.configuracao.antecedenciaMinutos}<Text style={{...muted,fontSize:11}}> min</Text></Text>{iconButton('Aumentar antecedência',Plus,() => editar({...draft,configuracao:{...draft.configuracao,antecedenciaMinutos:draft.configuracao.antecedenciaMinutos+1}}),cores.textoPrimario,busy || draft.configuracao.antecedenciaMinutos >= 15)}</View></View>
            <View style={{...surface,padding:16,gap:8}}><Text style={{...txt,fontWeight:'700'}}>Nome da programação <Text style={muted}>(opcional)</Text></Text><TextInput accessibilityLabel="Nome (opcional)" placeholder="Ex.: Ida para o trabalho" placeholderTextColor={cores.textoSecundario} editable={!busy} value={draft.nome} maxLength={80} onChangeText={nome => editar({...draft,nome})} style={{...txt,minHeight:44,borderBottomWidth:1,borderColor:cores.bordaSuave,paddingVertical:8}}/></View>
            {lista.some(p => conflitoVisual(draft,p)) && <Text accessibilityRole="alert" style={{color:cores.perigo,lineHeight:20}}>Este horário pode conflitar com outra programação. Cada programação ocupa uma hora.</Text>}
          </>}
          <View style={{paddingHorizontal:4,gap:6}}>
            <View style={{flexDirection:'row',alignItems:'center',gap:6}}><BellRing size={15} color={push === 'pronto' ? destaque : cores.textoSecundario}/><Text accessibilityLiveRegion="polite" style={muted}>{push === 'pronto' ? 'Notificações prontas' : push === 'pendente' ? 'Aguardando confirmação neste aparelho' : 'Prepare as notificações para seu Radar'}</Text></View>
            {push !== 'pronto' && <>{push === 'pendente' && <Text style={{...muted,fontSize:12}}>Mantenha o aplicativo aberto para concluir.</Text>}{action(push === 'pendente' ? 'Verificar confirmação' : 'Ativar notificações',BellRing,() => void executar(prepararPush))}</>}
          </View>
        </ScrollView>
        {draft && <View style={{gap:8,paddingHorizontal:20,paddingTop:12,paddingBottom:12,borderTopWidth:1,borderColor:cores.bordaSuave,backgroundColor:cores.fundoPainel}}>{!!erro && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{color:cores.perigo,fontSize:13,lineHeight:18}}>{erro}</Text>}{primary('Salvar programação',() => void salvar())}</View>}
      </SafeAreaView>
      <Confirmacao visivel={!!excluir} titulo="Excluir programação?" descricao={excluir?.nome ?? ''} variante="destrutiva" processando={busy} onCancelar={() => confirmar(null)} onConfirmar={async () => {if (!excluir) return;await executar(async () => {await api.requisitarProgramacoes('DELETE',`/${excluir.id}?revisaoEsperada=${excluir.revisao}`);confirmar(null);await atualizar();});}}/>
    </Modal>
  </>;
}
