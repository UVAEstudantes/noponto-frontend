import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CalendarClock, Star } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTema } from '../../hooks/useTema';
import Confirmacao from '../Confirmacao';
import type { EntradaPreviaNotificacaoRadar } from '../../services/previaNotificacaoRadar';
import { paradasElegiveisRadar } from '../../services/radarParada';
import { configurarRadarRemoto } from '../../services/radarRemotoContexto';
import { radarRemotoAndroid as api } from '../../services/radarRemotoAndroid';
import { conflitoVisual, mensagemProgramacao, pedidoProgramacao, type RadarProgramacao } from '../../services/radarProgramacoes';

const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export default function RadarProgramado({ entrada }: { entrada: EntradaPreviaNotificacaoRadar }) {
  const { cores } = useTema();
  const [aberto, abrir] = useState(false), [lista, listar] = useState<RadarProgramacao[]>([]);
  const [draft, editar] = useState<RadarProgramacao | null>(null);
  const [erro, falhar] = useState(''), [busy, ocupar] = useState(false), [excluir, confirmar] = useState<RadarProgramacao | null>(null);
  const lock = useRef(false);
  const [busca, buscar] = useState('');
  const [seletorHora, selecionarHora] = useState(false);
  const paradas = useMemo(() => paradasElegiveisRadar(entrada.linhas.map(l => ({ ...l, ativa: true, modoSentido: 'ambos' as const })), 'todos', entrada.itinerarios,
    { latitude: 0, longitude: 0 }, entrada.realtime, Infinity), [entrada.linhas, entrada.itinerarios, entrada.realtime]);
  const parada = paradas.find(p => p.parada.paradaId === draft?.configuracao.paradaId);
  const nomeParada = (id: string) => paradas.find(p => p.parada.paradaId === id)?.parada.nome ?? `Parada ${id}`;
  const nomeLinha = (id: string) => entrada.linhas.find(l => l.linhaId === id)?.nomeExibicao ?? id;
  async function atualizar() { listar(await api.requisitarProgramacoes<RadarProgramacao[]>('GET')); }
  async function executar(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; ocupar(true); falhar('');
    try { await fn(); } catch (e) {
      falhar(mensagemProgramacao(e));
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
  function selecionarContexto(linhaId: string, sentidoId: string) {
    if (!draft || !parada) return;
    const old = draft.configuracao;
    const key = JSON.stringify([linhaId, sentidoId]);
    const keys = old.contextos.map(c => JSON.stringify([c.linhaId, c.sentidoId]));
    const selected = keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key];
    const linhas = [...new Set(selected.map(k => (JSON.parse(k) as string[])[0]))];
    const config = configurarRadarRemoto({ ...entrada, parada, modal: 'todos' }, linhas, old.linhasPrioritarias, old.antecedenciaMinutos, selected);
    editar({ ...draft, configuracao: config ?? { ...old, contextos: [], linhasSelecionadas: [], linhasPrioritarias: [] } });
  }
  async function salvar() {
    if (!draft) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(draft.horaLocal) || (!draft.dataLocal && !draft.dias.length)
      || (draft.dataLocal && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dataLocal) || Number.isNaN(Date.parse(draft.dataLocal))))
      || !draft.configuracao.contextos.length) { falhar('Confira horário, data/dias e selecione ao menos uma linha e sentido compatível.'); return; }
    await executar(async () => {
      await api.prepararProgramacoes();
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
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir Radar Programado" onPress={() => abrir(true)} style={{ ...card, flexDirection: 'row', alignItems: 'center' }}><CalendarClock color="#D99D00" size={23}/><Text style={txt}>Radar Programado</Text></Pressable>
    <Modal visible={aberto} animationType="slide" onRequestClose={() => { if (!busy) { if (draft) editar(null); else abrir(false); } }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: cores.fundoPainel }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 14 }}>
          <Text accessibilityRole="header" style={{ ...txt, fontSize: 25, fontWeight: '800' }}>{draft ? 'Programação' : 'Radar Programado'}</Text>
          {button(draft ? 'Voltar à lista' : 'Fechar', () => draft ? editar(null) : abrir(false))}
          <Text style={{ color: cores.textoSecundario }}>Cada programação ocupa uma hora. O Radar inicia automaticamente e envia notificações silenciosas.</Text>
          {busy && <ActivityIndicator color="#D99D00"/>}
          {!!erro && <Text accessibilityRole="alert" style={{ color: cores.perigo }}>{erro}</Text>}
          {!draft ? <>
            {button('Nova programação', novo, true)}{button('Atualizar', () => void executar(atualizar))}
            {!lista.length && !busy && <Text style={txt}>Nenhuma programação. Programe seu próximo embarque.</Text>}
            {lista.map(p => <View key={p.id} style={card}>
              <Text style={{ ...txt, fontWeight: '800' }}>{p.nome}</Text>
              <Text style={txt}>{p.horaLocal.slice(0,5)}–{end(p.horaLocal)} · {p.dataLocal ? p.dataLocal.split('-').reverse().join('/') : p.dias.map(d => diasSemana[d]).join(', ')}</Text>
              <Text style={txt}>{nomeParada(p.configuracao.paradaId)}</Text>
              <Text style={txt}>{p.configuracao.linhasSelecionadas.map(id => `${p.configuracao.linhasPrioritarias.includes(id) ? '★ ' : ''}${nomeLinha(id)}`).join(' · ')}</Text>
              <Text style={txt}>{p.estado} {p.ultimoResultado ? `· ${p.ultimoResultado}` : ''}</Text>
              <Text style={{ color: '#B77900', fontWeight: '700' }}>Próxima: {p.proximaExecucaoUtc ? new Date(p.proximaExecucaoUtc).toLocaleString('pt-BR') : 'Sem ativação prevista'}</Text>
              {button('Editar', () => void executar(async () => editar(await api.requisitarProgramacoes<RadarProgramacao>('GET', `/${p.id}`))))}
              {button('Duplicar', () => editar({ ...p, id: '', nome: `${p.nome.slice(0,72)} (cópia)`, revisao: 0, estado: 'ativa' }))}
              {button(p.estado === 'ativa' ? 'Pausar' : 'Reativar', () => void executar(async () => {
                if (p.estado !== 'ativa') await api.prepararProgramacoes();
                await api.requisitarProgramacoes('PUT', `/${p.id}`, pedidoProgramacao({ ...p, estado: p.estado === 'ativa' ? 'pausada' : 'ativa' })); await atualizar();
              }))}
              {button('Excluir', () => confirmar(p))}
            </View>)}
          </> : <>
            {field('Nome (opcional)', draft.nome, nome => editar({ ...draft, nome: nome.slice(0,80) }))}
            {button(`Horário de início: ${draft.horaLocal.slice(0,5)}`, () => selecionarHora(!seletorHora))}
            {seletorHora && <View style={{ flexDirection: 'row', gap: 12 }}>
              <ScrollView style={{ maxHeight: 200, flex: 1 }} nestedScrollEnabled>{Array.from({ length: 24 }, (_,i) => String(i).padStart(2,'0')).map(h => button(h + ' h', () => editar({ ...draft, horaLocal: h + ':' + draft.horaLocal.slice(3,5) }), draft.horaLocal.slice(0,2) === h))}</ScrollView>
              <ScrollView style={{ maxHeight: 200, flex: 1 }} nestedScrollEnabled>{Array.from({ length: 60 }, (_,i) => String(i).padStart(2,'0')).map(m => button(m + ' min', () => editar({ ...draft, horaLocal: draft.horaLocal.slice(0,2) + ':' + m }), draft.horaLocal.slice(3,5) === m))}</ScrollView>
            </View>}
            <Text style={txt}>Término: {end(draft.horaLocal)} · Fuso: {draft.fuso}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>{button('Semanal', () => editar({ ...draft, dataLocal: null }), !draft.dataLocal)}{button('Data única', () => { const d = new Date(); const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; editar({ ...draft, dataLocal: date }); }, !!draft.dataLocal)}</View>
            {draft.dataLocal !== null ? field('Data (AAAA-MM-DD)', draft.dataLocal, dataLocal => editar({ ...draft, dataLocal }), true) : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{diasSemana.map((d,i) => button(d, () => editar({ ...draft, dias: draft.dias.includes(i) ? draft.dias.filter(v => v !== i) : [...draft.dias,i] }), draft.dias.includes(i)))}</View>}
            <Text style={txt}>Parada: {draft.configuracao.paradaId ? nomeParada(draft.configuracao.paradaId) : 'Selecione'}</Text>
            {field('Buscar parada', busca, buscar)}
            <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>{paradas.filter(p => p.parada.nome.toLocaleLowerCase().includes(busca.toLocaleLowerCase())).map(p => button(p.parada.nome + ' · ' + p.parada.paradaId.slice(0,8), () => editar({ ...draft, configuracao: { ...draft.configuracao, paradaId: p.parada.paradaId, contextos: [], linhasSelecionadas: [], linhasPrioritarias: [] } }), p.parada.paradaId === draft.configuracao.paradaId))}</ScrollView>
            {!paradas.length && <Text style={txt}>Carregue as linhas e seus itinerários no mapa para selecionar uma parada compatível.</Text>}
            <Text style={txt}>Linhas e sentidos</Text>
            {parada?.vinculos.filter((v,i,a) => a.findIndex(x => x.linhaId === v.linhaId && x.sentidoId === v.sentidoId) === i).map(v => <View key={v.linhaId + v.sentidoId} style={card}>
              {button(`${nomeLinha(v.linhaId)} · ${v.destino || 'Sentido'}`, () => selecionarContexto(v.linhaId,v.sentidoId), draft.configuracao.contextos.some(c => c.linhaId === v.linhaId && c.sentidoId === v.sentidoId))}
              {draft.configuracao.linhasSelecionadas.includes(v.linhaId) && <Pressable accessibilityRole="checkbox" accessibilityLabel={`Priorizar ${nomeLinha(v.linhaId)}`} accessibilityState={{ checked: draft.configuracao.linhasPrioritarias.includes(v.linhaId) }} disabled={busy} onPress={() => { const ids = draft.configuracao.linhasPrioritarias; editar({ ...draft, configuracao: { ...draft.configuracao, linhasPrioritarias: ids.includes(v.linhaId) ? ids.filter(id => id !== v.linhaId) : [...ids,v.linhaId] } }); }} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Star color="#B77900" fill={draft.configuracao.linhasPrioritarias.includes(v.linhaId) ? '#FFC107' : 'transparent'}/><Text style={txt}>Prioritária</Text></Pressable>}
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
