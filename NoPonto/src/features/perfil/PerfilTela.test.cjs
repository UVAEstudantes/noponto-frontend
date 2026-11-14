const test=require('node:test');const assert=require('node:assert/strict');
const {harness,nodes,text,button}=require('../../../scripts/interface-test-harness.cjs');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function perfil(storage={getItem:async()=>null,setItem:async()=>{}},fav={status:'pronto',linhas:[]}) { const navega=[]; const h=harness('src/features/perfil/PerfilTela.tsx',{'@react-native-async-storage/async-storage':storage,'expo-router':{router:{navigate:v=>navega.push(v)}},'@/src/hooks/useFavoritos':{useFavoritos:()=>fav}}); return {...h,navega}; }
test('Perfil abre neutro, cancela edição sem gravar e mostra favoritos vazios reais',async()=>{
 let writes=0;const h=perfil({getItem:async()=>null,setItem:async()=>{writes++;}});h.render();h.flushEffects();await settle();assert.match(text(h.render()),/Seu perfil/);assert.match(text(h.render()),/ainda não favoritou/);
 button(h.render(),'Editar perfil').props.onPress();nodes(h.render()).find(n=>n.type==='CampoDemo').props.onChangeText('Ana Clara');button(h.render(),'Cancelar').props.onPress();assert.equal(writes,0);assert.equal(h.slots[0].nome,'');
 button(h.render(),'Abrir Linhas').props.onPress();assert.deepEqual(h.navega,['/linhas']);
});
test('Perfil salva uma vez por toque concorrente e só publica após persistir',async()=>{
 let finish;let writes=0;const h=perfil({getItem:async()=>null,setItem:()=>{writes++;return new Promise(r=>finish=r);}});h.render();h.flushEffects();await settle();button(h.render(),'Editar perfil').props.onPress();nodes(h.render()).find(n=>n.type==='CampoDemo').props.onChangeText('Ana Clara');const salvar=button(h.render(),'Salvar perfil').props.onPress;salvar();salvar();assert.equal(writes,1);assert.equal(h.slots[0].nome,'');finish();await settle();assert.equal(h.slots[0].nome,'Ana Clara');assert.equal(h.slots[1],null);
});
test('falha de gravação mantém edição e dados existentes; favoritos são da coleção real',async()=>{
 const h=perfil({getItem:async()=>null,setItem:async()=>{throw Error('falha');}},{status:'pronto',linhas:[{linhaId:'x',codigo:'REAL',nome:'Minha favorita',modal:'brt'}]});h.render();h.flushEffects();await settle();const real=nodes(h.render()).find(n=>n.type==='FavoritaPerfil');assert.equal(real.props.codigo,'REAL');assert.equal(real.props.modal,'brt');button(h.render(),'Editar perfil').props.onPress();nodes(h.render()).find(n=>n.type==='CampoDemo').props.onChangeText('Novo');button(h.render(),'Salvar perfil').props.onPress();await settle();assert.equal(h.slots[0].nome,'');assert.equal(h.slots[1].nome,'Novo');assert.match(text(h.render()),/Não foi possível salvar/);
});
test('recursos futuros abrem explicações, sem compartilhar ou publicar',async()=>{
 const h=perfil();h.render();h.flushEffects();await settle();button(h.render(),'Conhecer a prévia').props.onPress();assert.match(text(h.render()),/Compartilhamento e histórico pessoal ainda não/);nodes(h.render()).find(n=>n.type==='PainelDemo').props.onFechar();button(h.render(),'Conhecer possibilidades').props.onPress();assert.match(text(h.render()),/Sem publicação/);assert.match(text(h.render()),/não serão fatos confirmados/);
});
