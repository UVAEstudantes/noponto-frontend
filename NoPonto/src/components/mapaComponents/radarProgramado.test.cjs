const test = require('node:test');
const assert = require('node:assert/strict');
const { criarHarness } = require('../../hooks/radarTestHarness.cjs');
const { temas } = require('../../constants/tema.ts');
const nodes = v => Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === 'object' ? [v,...nodes(v.props?.children)] : [];
const text = v => Array.isArray(v) ? v.map(text).join('') : v && typeof v === 'object' ? text(v.props?.children) : v == null || typeof v==='boolean' ? '' : String(v);
const saved = {id:'saved',nome:'Trabalho',fuso:'America/Fortaleza',horaLocal:'08:00:00',dataLocal:null,dias:[1,2,3,4,5],estado:'ativa',revisao:7,
 configuracao:{paradaId:'original',contextos:[{linhaId:'L',sentidoId:'S',padraoOperacionalId:'O',padraoVersaoId:'V'}],linhasSelecionadas:['L'],linhasPrioritarias:['L'],antecedenciaMinutos:5},proximaExecucaoUtc:'2026-12-20T11:00:00Z'};
function montar(theme='claro',list=[]) {
 const h=criarHarness(),calls=[];
 const entry={linhas:[{linhaId:'L',ativa:true}],itinerarios:{},realtime:{},parada:{parada:{paradaId:'automatica',nome:'Mais próxima'}},paradaAberta:{paradaId:'manual',nome:'Parada escolhida no mapa'},modal:'todos'};
 const api={pushConfirmado:true,assinar:()=>()=>{},reconciliar:async()=>{},prepararProgramacoes:async()=>calls.push('preparar'),requisitarProgramacoes:async(method,suffix,body)=>{calls.push({method,suffix,body});return method==='GET' ? suffix ? saved : list : {};}};
 const Component=h.carregar('../components/mapaComponents/radarProgramado.tsx',{
  'react-native':{...Object.fromEntries(['ActivityIndicator','Modal','View','Text','TextInput','Pressable','ScrollView'].map(n=>[n,n])),AppState:h.appState},
  'lucide-react-native':Object.fromEntries(['ArrowLeft','CalendarClock','Clock3','Star','MapPin','Plus','Minus','RefreshCw','BellRing','Check','ChevronRight','ChevronDown','MoreHorizontal','Pencil','Copy','Pause','Play','Trash2'].map(n=>[n,n])),
  'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
  '../../hooks/useTema':{useTema:()=>({cores:temas[theme].cores,temaAtual:theme})},
  '../Confirmacao':{__esModule:true,default:'Confirmacao'},
  '../../services/radarProgramacoesSelecao':{linhasParadaProgramacao:async id=>{calls.push({stop:id});return [1,2,3,4,5].map(i=>({linhaId:i===5?'L':`L${i}`,codigo:i===5?'838':String(i),nome:i===5?'Linha sugerida':`Linha ${i}`}));},contextosLinhaProgramacao:async(id,l)=>[{linhaId:l.linhaId,sentidoId:'S',padraoOperacionalId:'O',padraoVersaoId:'V',destino:'Centro'},{linhaId:l.linhaId,sentidoId:'S2',padraoOperacionalId:'O2',padraoVersaoId:'V2',destino:'Bairro'}]},
  '../../services/radarParadaMetadata':{metadataParadaRadar:async()=>({nome:'Parada original'})},
  '../../services/radarProgramacoesPicker':{selecionarDataHoraProgramacao:async(mode)=>mode==='time'?'09:30':'2026-12-20'},
  '../../services/radarRemotoAndroid':{radarRemotoAndroid:api},
 }).default;
 const render=()=>h.render(()=>Component({entrada:entry,sugeridas:['L']}));
 const find=label=>nodes(h.output).find(n=>n.props?.accessibilityLabel===label || n.type==='Pressable' && text(n.props.children)===label);
 const tap=label=>{const b=find(label);assert.ok(b,label);assert.notEqual(b.props.disabled,true,`${label} desabilitado`);b.props.onPress();render();};
 const settle=async()=>{await h.flush();await h.flush();};
 render();
 return {h,entry,calls,render,find,tap,settle,async open(){tap('Abrir Radar Programado');await settle();}};
}
for (const theme of ['claro','escuro']) test(`criacao usa parada manual e rascunho isolado no tema ${theme}`,async()=>{
 const m=montar(theme),before=JSON.stringify(m.entry);await m.open();m.tap('Nova programação');await m.settle();
 assert.match(text(m.h.output),/Parada escolhida no mapa/);
 assert.ok(nodes(m.h.output).some(n=>n.type==='SafeAreaView' && n.props.style.backgroundColor===temas[theme].cores.fundoApp));
 const scroll=nodes(m.h.output).find(n=>n.type==='ScrollView');
 assert.equal(nodes(scroll).some(n=>n.props?.accessibilityLabel==='Salvar programação'),false);
 assert.ok(m.find('Salvar programação'));
 assert.equal(m.find('Diminuir antecedência').props.disabled,false);
 for(let i=0;i<3;i++)m.tap('Diminuir antecedência');assert.equal(m.find('Diminuir antecedência').props.disabled,true);
 for(let i=0;i<13;i++)m.tap('Aumentar antecedência');assert.equal(m.find('Aumentar antecedência').props.disabled,true);assert.equal(m.find('Buscar parada por nome'),undefined);
 assert.ok(m.calls.some(c=>c.stop==='manual'));assert.equal(m.calls.some(c=>c.stop==='automatica'),false);
 const rows=nodes(m.h.output).filter(n=>n.props?.accessibilityLabel?.startsWith('Monitorar linha '));
 assert.equal(rows[0].props.accessibilityLabel,'Monitorar linha 838');assert.equal(rows.length,3);
 m.tap('Ver todas as linhas (5)');assert.equal(nodes(m.h.output).filter(n=>n.props?.accessibilityLabel?.startsWith('Monitorar linha ')).length,5);
 m.tap('Monitorar linha 838');await m.settle();m.tap('Sentido Bairro');m.tap('Priorizar Linha sugerida');
 assert.equal(m.find('Priorizar Linha sugerida').props.accessibilityState.checked,true);
 m.tap('Horário de início: 08:00');await m.settle();m.tap('Uma vez');await m.settle();assert.match(text(m.h.output),/20\/12\/2026/);
 m.tap('Salvar programação');await m.settle();const sent=m.calls.find(c=>c.method==='POST');assert.ok(sent);
 assert.equal(sent.body.configuracao.paradaId,'manual');assert.equal(sent.body.horaLocal,'09:30:00');assert.equal(sent.body.dataLocal,'2026-12-20');assert.deepEqual(sent.body.dias,[]);
 assert.deepEqual(sent.body.configuracao.contextos,[{linhaId:'L',sentidoId:'S',padraoOperacionalId:'O',padraoVersaoId:'V'}]);assert.deepEqual(sent.body.configuracao.linhasPrioritarias,['L']);
 assert.equal(JSON.stringify(m.entry),before);assert.equal(m.h.timerCount,0);
});
for (const operation of ['Editar','Duplicar']) test(`${operation} preserva parada salva mesmo com mapa em outra parada`,async()=>{
 const m=montar('claro',[saved]);await m.open();m.tap('Ações de Trabalho');m.tap(operation);await m.settle();
 assert.ok(m.calls.some(c=>c.stop==='original'));assert.equal(m.calls.some(c=>c.stop==='manual'),false);
 m.entry.paradaAberta={paradaId:'nova',nome:'Outra parada'};m.render();
 m.tap('Salvar programação');await m.settle();const sent=m.calls.find(c=>c.method===(operation==='Editar'?'PUT':'POST'));assert.ok(sent);
 assert.equal(sent.body.configuracao.paradaId,'original');assert.equal(sent.body.revisaoEsperada,operation==='Editar'?7:0);assert.equal(sent.suffix,operation==='Editar'?'/saved':'');
 assert.deepEqual(sent.body.configuracao.contextos,saved.configuracao.contextos);assert.deepEqual(sent.body.dias,[1,2,3,4,5]);
});
test('sem parada manual impede criar com parada automatica',async()=>{
 const m=montar();m.entry.paradaAberta=null;await m.open();m.tap('Nova programação');assert.match(text(m.h.output),/Abra uma parada no mapa/);assert.equal(m.find('Salvar programação'),undefined);
});
