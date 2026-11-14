const test=require('node:test');const assert=require('node:assert/strict');const React=require('react');
const {harness,nodes}=require('../../../scripts/interface-test-harness.cjs');
test('painel Android limita altura acima do teclado e mantém rodapé fora da rolagem',()=>{
 const events={};const h=harness('src/components/demo/InterfaceDemo.tsx',{
 '@/src/hooks/useTema':{useTema:()=>({cores:{},temaAtual:'claro'})},
 'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:24,bottom:20})},
 'react-native':{Platform:{OS:'android'},Keyboard:{addListener:(name,fn)=>{events[name]=fn;return {remove(){}};}},AccessibilityInfo:{isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove(){}})},Modal:'Modal',View:'View',Text:'Text',Pressable:'Pressable',ScrollView:'ScrollView',KeyboardAvoidingView:'KeyboardAvoidingView'},
 });
 const props={titulo:'Sua rotina',onFechar(){},children:React.createElement('Text',{},'Formulário'),rodape:React.createElement('BotaoDemo',{},'Salvar rotina')};h.render(props,'PainelDemo');h.flushEffects();events.keyboardDidShow({endCoordinates:{screenY:500}});let tree=h.render(props,'PainelDemo');const box=nodes(tree).find(n=>n.type==='KeyboardAvoidingView');assert.equal(box.props.style.height,420);assert.equal(box.props.style.flex,0);assert.equal(nodes(tree).filter(n=>n.type==='Modal').length,1);assert.ok(!nodes(nodes(tree).find(n=>n.type==='ScrollView')).some(n=>n.type==='BotaoDemo'));events.keyboardDidHide();tree=h.render(props,'PainelDemo');assert.equal(nodes(tree).find(n=>n.type==='KeyboardAvoidingView').props.style.height,undefined);
});
