const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');const vm=require('node:vm');const React=require('react');
const filename=path.join(__dirname,'linhasContainer.tsx');const sf=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let code;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='SelectModalLinhas')code=n.getText(sf);ts.forEachChild(n,visit);}visit(sf);
function render(width,selected,count=3,fontScale=1){const opcoes=['onibus','brt','trem','metro'].slice(0,count).map(id=>({id,nome:id}));const context={React:{...React,useState:()=>[width,()=>{}],useRef:v=>({current:v}),useEffect:()=>{}},useWindowDimensions:()=>({fontScale}),useTema:()=>({cores:{}}),identidadeModalMapa:()=>({Icon:'Icon'}),NativeAnimated:{View:'AnimatedView',Value:class{constructor(v){this.value=v}}},useMovimentoReduzido:()=>true,SegmentoModal:'SegmentoModal',useAnimatedStyle:fn=>fn(),withTiming:v=>v,ReduceMotion:{System:'system'},View:'View',Pressable:'Pressable',Text:'Text'};vm.createContext(context);vm.runInContext(ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.React}}).outputText,context);return context.SelectModalLinhas({opcoes,selecionadoId:selected,onSelecionar(){}});}
function nodes(t){return !t||typeof t!=='object'?[]:[t,...React.Children.toArray(t.props?.children).flatMap(nodes)];}
function buttons(tree){return nodes(tree).filter(n=>n.type==='Pressable');}
test('Favoritos neutraliza superfície e modal marca apenas um segmento',()=>{
 const neutral=render(240,null,4);assert.ok(buttons(neutral).every(b=>!b.props.accessibilityState.selected));assert.equal(nodes(neutral).find(n=>n.type==='AnimatedView').props.style.opacity,0);
 const active=render(240,'brt',4);assert.equal(buttons(active).filter(b=>b.props.accessibilityState.selected).length,1);assert.equal(nodes(active).filter(n=>n.type==='Text').length,1);
});
test('320/360/400dp: ativo expande, inativos44dp e superfície acompanha seleção',()=>{
 for(const screen of [320,360,400])for(const selected of ['onibus','brt','trem','metro']){
  const tree=render(screen-80,selected,4);const wrappers=nodes(tree).filter(n=>n.type==='SegmentoModal');assert.equal(wrappers.length,4);const sizes=wrappers.map(n=>n.props.largura);assert.equal(sizes.reduce((a,b)=>a+b,0)+12,screen-84);assert.ok(sizes.every(w=>w>=44));assert.ok(buttons(tree).every(b=>typeof b.props.style==='object'&&b.props.style.minHeight===44));
  const indicator=nodes(tree).find(n=>n.type==='AnimatedView').props.style;assert.equal(indicator.width.value,sizes[['onibus','brt','trem','metro'].indexOf(selected)]);
 }
});
test('fonte ampliada usa duas faixas e indicador segue a segunda faixa',()=>{const tree=render(240,'metro',4,1.5);const rows=React.Children.toArray(tree.props.children).filter(n=>n.type==='View');assert.deepEqual(rows.map(r=>React.Children.count(r.props.children)),[2,2]);assert.ok(nodes(tree).find(n=>n.type==='AnimatedView').props.style.top.value>48);});

test('fonte muito ampliada mantém um segmento por faixa e indicador alinhado',()=>{const tree=render(240,'metro',4,2);const rows=React.Children.toArray(tree.props.children).filter(n=>n.type==='View');assert.deepEqual(rows.map(r=>React.Children.count(r.props.children)),[1,1,1,1]);});

test('seletor não envia callbacks comuns para UI thread e superfície é amarela',()=>{assert.doesNotMatch(code,/useAnimatedStyle|withTiming|runOnJS/);const tree=render(240,'onibus',4);assert.equal(nodes(tree).find(n=>n.type==='AnimatedView').props.style.backgroundColor,'#FFC107');});

test('cards não renderizam comentários como texto fora de Text',()=>{const invalid=[];function walk(n){if(ts.isJsxText(n)&&n.getText(sf).includes('/*'))invalid.push(n.getText(sf));ts.forEachChild(n,walk);}walk(sf);assert.deepEqual(invalid,[]);});
