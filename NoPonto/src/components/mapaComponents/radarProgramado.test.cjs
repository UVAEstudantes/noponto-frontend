const test = require('node:test');
const assert = require('node:assert/strict');
const { criarHarness } = require('../../hooks/radarTestHarness.cjs');
const { temas } = require('../../constants/tema.ts');
const nodes = v => Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === 'object' ? [v,...nodes(v.props?.children)] : [];
const text = v => Array.isArray(v) ? v.map(text).join('') : v && typeof v === 'object' ? text(v.props?.children) : v == null ? '' : String(v);
test('editor usa seletores e parada remota sem modificar estado global', async () => {
 const h=criarHarness(), calls=[];
 const entry={linhas:[],itinerarios:{},realtime:{},parada:null,modal:'todos'};
 const before=JSON.stringify(entry);
 const api={assinar:()=>()=>{},reconciliar:async()=>{},prepararProgramacoes:async()=>calls.push('preparar'),requisitarProgramacoes:async(method,suffix,body)=>{ calls.push({method,suffix,body});return [];} };
 const Component=h.carregar('../components/mapaComponents/radarProgramado.tsx',{
  'react-native':{...Object.fromEntries(['ActivityIndicator','Modal','View','Text','TextInput','Pressable','ScrollView'].map(n=>[n,n])),AppState:h.appState},
  'lucide-react-native':{CalendarClock:'CalendarClock',Star:'Star'},
  'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
  '../../hooks/useTema':{useTema:()=>({cores:temas.claro.cores})},
  '../Confirmacao':{__esModule:true,default:'Confirmacao'},
  '../../services/radarProgramacoesSelecao':{buscarParadasProgramacao:async()=>({itens:[{id:'outra',nome:'Parada distante'}],totalPaginas:1}),linhasParadaProgramacao:async()=>[{linhaId:'L',codigo:'838',nome:'Linha distante'}],contextosLinhaProgramacao:async()=>[{linhaId:'L',sentidoId:'S',padraoOperacionalId:'O',padraoVersaoId:'V',destino:'Centro'}]},
 '../../services/radarParadaMetadata':{metadataParadaRadar:async()=>null},
 '../../services/radarProgramacoesPicker':{selecionarDataHoraProgramacao:async(mode)=>mode==='time'?'09:30':'2026-12-20'},
 '../../services/radarRemotoAndroid':{radarRemotoAndroid:api},
 }).default;
 const render=()=>h.render(()=>Component({entrada:entry}));
 const press=label=>{const button=nodes(h.output).find(n=>n.type==='Pressable' && text(n.props.children)===label);assert.ok(button,label);button.props.onPress();render();};
 render();nodes(h.output).find(n=>n.props?.accessibilityLabel==='Abrir Radar Programado').props.onPress();render();await h.flush();
 press('Nova programação');
 assert.ok(nodes(h.output).some(n=>n.props?.accessibilityLabel==='Nome (opcional)'));
 press('Dom');press('Horário de início: 08:00');await h.flush();
 assert.ok(nodes(h.output).some(n=>text(n.props?.children)==='Horário de início: 09:30'));
 press('Data única');await h.flush();
 assert.ok(nodes(h.output).some(n=>text(n.props?.children)==='Data: 20/12/2026'));
 press('Salvar programação');await h.flush();
 assert.equal(calls.some(c=>c.method==='POST'),false);
 const input=nodes(h.output).find(n=>n.props?.accessibilityLabel==='Buscar parada por nome');
 input.props.onChangeText('distante');render();await h.avancar(350);await h.flush();
 press('Parada distante · outra');await h.flush();
 press('838 · Linha distante');await h.flush();press('Centro');
 const priority=nodes(h.output).find(n=>n.props?.accessibilityLabel==='Priorizar Linha distante');priority.props.onPress();render();
 press('Salvar programação');await h.flush();
 const saved=calls.find(c=>c.method==='POST');assert.ok(saved);
 assert.equal(saved.body.configuracao.paradaId,'outra');
 assert.deepEqual(saved.body.configuracao.linhasSelecionadas,['L']);
 assert.deepEqual(saved.body.configuracao.linhasPrioritarias,['L']);
 assert.equal(saved.body.dataLocal,'2026-12-20');
 assert.equal(JSON.stringify(entry),before);
 assert.equal(h.timerCount,0);
});
