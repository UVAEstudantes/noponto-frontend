const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
function dialog(props) {
  const filename = path.join(__dirname, 'Confirmacao.tsx');
  const m = new Module(filename, module);
  const mocks = {
    react: {...React, useRef: v => ({current:v}), useState: v => [v, () => {}], useEffect: fn => fn()},
    'react-native': new Proxy({useWindowDimensions:()=>({width:360,fontScale:1})}, {get: (o, key) => key in o ? o[key] : String(key)}),
    'react-native-safe-area-context': {SafeAreaView:'SafeAreaView'},
    'lucide-react-native': {Check:'Check', Trash2:'Trash2', AlertTriangle:'AlertTriangle'},
    '@/src/hooks/useTema': {useTema:()=>({cores:{},temaAtual:'claro'})},
  };
  m.require = id => mocks[id];
  m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,filename);
  return m.exports.default({visivel:true,titulo:'Remover?',descricao:'Teste',...props});
}
function nodes(t) {return !t || typeof t !== 'object' ? [] : [t,...React.Children.toArray(t.props?.children).flatMap(nodes)];}
test('cancelar e Android Back não alteram lista; confirmar última linha ocorre uma única vez', async()=>{
  let lines=['838']; let cancels=0;
  const tree=dialog({onCancelar:()=>cancels++,onConfirmar:()=>{lines=lines.filter(x=>x!=='838');}});
  const buttons=nodes(tree).filter(n=>n.type==='Pressable');
  buttons.at(-1).props.onPress(); tree.props.onRequestClose();
  assert.deepEqual(lines,['838']); assert.equal(cancels,2);
  await buttons.at(-2).props.onPress(); await buttons.at(-2).props.onPress();
  assert.deepEqual(lines,[]);
});
test('processamento bloqueia múltiplos toques e cancelamento; nova abertura permite repetir',async()=>{
  let mutations=0,cancels=0,finish;
  const tree=dialog({onCancelar:()=>cancels++,onConfirmar:()=>{mutations++;return new Promise(r=>finish=r);}});
  const buttons=nodes(tree).filter(n=>n.type==='Pressable');
  const pending=buttons.at(-2).props.onPress();
  await buttons.at(-2).props.onPress(); tree.props.onRequestClose();
  assert.equal(mutations,1); assert.equal(cancels,0);finish();await pending;
  const next=dialog({onCancelar(){},onConfirmar:()=>{mutations++;}});
  await nodes(next).filter(n=>n.type==='Pressable').at(-2).props.onPress();
  assert.equal(mutations,2);
});
test('solicitar remoção do card não anima opacidade nem modifica seleção',()=>{
  const filename=path.join(__dirname,'mapaComponents/linhasContainer.tsx');
  const sf=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let handler;
  function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='handleLongPress')handler=n.getText(sf);ts.forEachChild(n,visit);}visit(sf);
  let requests=0;const vm=require('node:vm');vm.runInNewContext(handler+';handleLongPress();',{aoRemover:()=>requests++});
  assert.equal(requests,1);assert.doesNotMatch(handler,/withTiming|setConfirmando|opacity/);
});

test('ação destrutiva mantém superfície estática vermelha e texto branco',()=>{
 const t=dialog({variante:'destrutiva',onConfirmar(){},onCancelar(){}});const buttons=nodes(t).filter(n=>n.type==='Pressable');const primary=buttons.at(-2);assert.equal(typeof primary.props.style,'object');assert.equal(primary.props.style.backgroundColor,'#B42332');assert.equal(primary.props.style.minHeight,48);assert.equal(nodes(primary).find(n=>n.type==='Text').props.style.color,'#FFFFFF');
});
