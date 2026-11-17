const test = require('node:test');
const assert = require('node:assert/strict');
const { criarHarness } = require('../../hooks/radarTestHarness.cjs');
const { temas } = require('../../constants/tema.ts');
const nodes = v => Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === 'object' ? [v,...nodes(v.props?.children)] : [];
const text = v => Array.isArray(v) ? v.map(text).join('') : v && typeof v === 'object' ? text(v.props?.children) : v == null ? '' : String(v);
test('editor semanal isola rascunho e impede envio sem contexto valido', async () => {
 const h=criarHarness(), calls=[];
 const entry={linhas:[],itinerarios:{},realtime:{},parada:null,modal:'todos'};
 const before=JSON.stringify(entry);
 const api={reconciliar:async()=>{},prepararProgramacoes:async()=>calls.push('preparar'),requisitarProgramacoes:async(method,suffix,body)=>{ calls.push({method,suffix,body});return [];} };
 const Component=h.carregar('../components/mapaComponents/radarProgramado.tsx',{
  'react-native':{...Object.fromEntries(['ActivityIndicator','Modal','View','Text','TextInput','Pressable','ScrollView'].map(n=>[n,n])),AppState:h.appState},
  'lucide-react-native':{CalendarClock:'CalendarClock',Star:'Star'},
  'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
  '../../hooks/useTema':{useTema:()=>({cores:temas.claro.cores})},
  '../Confirmacao':{__esModule:true,default:'Confirmacao'},
  '../../services/radarRemotoAndroid':{radarRemotoAndroid:api},
 }).default;
 const render=()=>h.render(()=>Component({entrada:entry}));
 const press=label=>{const button=nodes(h.output).find(n=>n.type==='Pressable' && text(n.props.children)===label);assert.ok(button,label);button.props.onPress();render();};
 render();nodes(h.output).find(n=>n.props?.accessibilityLabel==='Abrir Radar Programado').props.onPress();render();await h.flush();
 press('Nova programação');
 assert.ok(nodes(h.output).some(n=>n.props?.accessibilityLabel==='Nome (opcional)'));
 press('Dom');press('Horário de início: 08:00');press('09 h');press('30 min');
 assert.ok(nodes(h.output).some(n=>text(n.props?.children)==='Horário de início: 09:30'));
 press('Salvar programação');await h.flush();
 assert.equal(calls.some(c=>c.method==='POST'),false);
 assert.equal(JSON.stringify(entry),before);
 assert.equal(h.timerCount,0);
});
