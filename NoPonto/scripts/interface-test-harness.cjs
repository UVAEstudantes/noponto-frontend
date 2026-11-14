const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
function harness(relative, overrides = {}, width = 360, fontScale = 1) {
  let index = 0; const slots = [], effects = [];
  const react = { ...React,
    useState(initial) { const i=index++; if (!(i in slots)) slots[i]=typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i]=typeof value==='function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i=index++; return slots[i] ??= {current:initial}; },
    useEffect(fn,deps) { const i=index++; const prev=slots[i]; if (!prev || deps.some((v,n) => v !== prev.deps[n])) { const next={deps}; slots[i]=next; effects.push(()=>{prev?.cleanup?.();next.cleanup=fn();}); } },
  };
  const visual = { cores: { textoPrimario:'#1E1E1E', textoSecundario:'#596575', sucesso:'#038B0F' }, texto:{},secundario:{color:'#596575'},card:{} };
  const mocks = {
    react,
    'react-native': new Proxy({ Keyboard:{dismiss(){}}, useWindowDimensions:()=>({width,fontScale}) },{get:(o,k)=>k in o?o[k]:String(k)}),
    'react-native-safe-area-context': {SafeAreaView:'SafeAreaView'},
    'lucide-react-native':new Proxy({},{get:(_,k)=>String(k)}),
    '@/src/components/demo/InterfaceDemo': { BotaoDemo:'BotaoDemo',CampoDemo:'CampoDemo',PainelDemo:'PainelDemo',useVisualDemo:()=>visual },
    './FormularioRotina': {diasRotina:['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'],FormularioRotina:'FormularioRotina',SeletorHorario:'SeletorHorario'},
    './PercursoRotina': {EsquemaPercurso:'EsquemaPercurso',ExplicacaoRotinas:'ExplicacaoRotinas',PreviaPercurso:'PreviaPercurso'},
    './ConteudoPerfil': {AvatarIniciais:'AvatarIniciais',ResumoMobilidade:'ResumoMobilidade',EstatisticasPerfil:'EstatisticasPerfil',ConquistasPerfil:'ConquistasPerfil',FavoritaPerfil:'FavoritaPerfil'},
    ...overrides,
  };
  const file=path.resolve(__dirname,'..',relative);const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
  m.require=id=>id in mocks?mocks[id]:Module.prototype.require.call(m,id);
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,file);
  return { slots, render(props={},name='default') { index=0;return m.exports[name](props); }, flushEffects() { effects.splice(0).forEach(fn=>fn()); } };
}
function nodes(t) { return !t||typeof t!=='object'?[]:[t,...React.Children.toArray([t.props?.children,t.props?.rodape]).flatMap(nodes)]; }
function text(t) { return nodes(t).flatMap(n=>React.Children.toArray(n.props?.children).filter(c=>typeof c==='string'||typeof c==='number')).join(' ').replace(/\s+/g,' ').trim(); }
function button(t,label) { return nodes(t).find(n=>['Pressable','BotaoDemo'].includes(n.type)&&(n.props.accessibilityLabel===label||n.props.label===label||text(n)===label)); }
module.exports={harness,nodes,text,button};
