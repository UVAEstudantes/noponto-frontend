const test=require('node:test');const assert=require('node:assert/strict');
const {harness,nodes,text,button}=require('../../scripts/interface-test-harness.cjs');
const tela='src/features/rotinas/RotinasTela.tsx';
const form=t=>nodes(t).find(n=>n.type==='FormularioRotina');
const painel=t=>nodes(t).find(n=>n.type==='PainelDemo');
test('Rotinas: criar validar editar e remover preservam outras rotinas',()=>{
 const h=harness(tela);button(h.render(),'Criar rotina').props.onPress();button(h.render(),'Salvar rotina').props.onPress();assert.match(form(h.render()).props.erro,/Preencha/);
 let p=form(h.render()).props;p.atualizar({...p.rotina,nome:'Trabalho',origem:'Casa',destino:'Escritório'});button(h.render(),'Salvar rotina').props.onPress();assert.equal(h.slots[0].length,3);
 button(h.render(),'Configurar rotina Trabalho').props.onPress();p=form(h.render()).props;p.atualizar({...p.rotina,nome:'Novo trabalho'});button(h.render(),'Salvar rotina').props.onPress();assert.equal(h.slots[0][2].nome,'Novo trabalho');
 button(h.render(),'Configurar rotina Novo trabalho').props.onPress();button(h.render(),'Remover rotina da prévia').props.onPress();assert.equal(h.slots[0].length,2);assert.equal(h.slots[0][0].nome,'Faculdade');
});
test('horário e prévia substituem o painel; cancelar preserva rascunho',()=>{
 const h=harness(tela);button(h.render(),'Configurar rotina Faculdade').props.onPress();form(h.render()).props.horario();let t=h.render();assert.equal(nodes(t).filter(n=>n.type==='PainelDemo').length,1);
 nodes(t).find(n=>n.type==='SeletorHorario').props.onChange([23,59]);button(h.render(),'Cancelar').props.onPress();assert.equal(form(h.render()).props.rotina.hora,'06:30');
 form(h.render()).props.horario();nodes(h.render()).find(n=>n.type==='SeletorHorario').props.onChange([8,15]);button(h.render(),'Confirmar horário').props.onPress();assert.equal(form(h.render()).props.rotina.hora,'08:15');
 form(h.render()).props.previa();assert.equal(nodes(h.render()).filter(n=>n.type==='PainelDemo').length,1);painel(h.render()).props.onFechar();assert.equal(form(h.render()).props.rotina.hora,'08:15');assert.equal(h.slots[0][0].hora,'06:30');
});
test('ativação é local; explicação e retorno não iniciam serviços',()=>{
 const h=harness(tela);nodes(h.render()).find(n=>n.type==='Switch').props.onValueChange(false);assert.equal(h.slots[0][0].ativa,false);button(h.render(),'Entenda as Rotinas').props.onPress();assert.ok(nodes(h.render()).some(n=>n.type==='ExplicacaoRotinas'));painel(h.render()).props.onFechar();assert.equal(h.slots[2],null);
});
test('dias equilibrados e inversão preservam o estado salvo',()=>{
 for(const width of [320,360,400])for(const fontScale of [1,1.5]) {
 const h=harness('src/features/rotinas/FormularioRotina.tsx',{},width,fontScale);let r={id:1,nome:'A',origem:'Casa',destino:'Faculdade',hora:'07:00',dias:[0],voz:true,ativa:false};const props=()=>({rotina:r,atualizar:v=>r=v,horario(){},previa(){},erro:''});let t=h.render(props(),'FormularioRotina');
 const checks=nodes(t).filter(n=>n.props.accessibilityRole==='checkbox');assert.equal(checks.length,7);const rows=nodes(t).filter(n=>n.type==='View'&&require('react').Children.toArray(n.props.children).some(c=>c?.props?.accessibilityRole==='checkbox'));assert.deepEqual(rows.map(n=>require('react').Children.count(n.props.children)),width>=390&&fontScale===1?[7]:[4,3]);
 checks[1].props.onPress();assert.deepEqual(r.dias,[0,1]);button(h.render(props(),'FormularioRotina'),'Inverter origem e destino').props.onPress();assert.equal(r.origem,'Faculdade');assert.equal(r.destino,'Casa');
 }
});
test('seletor personalizado mantém limites e números alinhados sem wheels',()=>{
 const h=harness('src/features/rotinas/FormularioRotina.tsx');let tempo=[23,59];const render=()=>h.render({tempo,onChange:v=>tempo=v},'SeletorHorario');button(render(),'Aumentar hora').props.onPress();assert.deepEqual(tempo,[0,59]);button(render(),'Aumentar minuto').props.onPress();assert.deepEqual(tempo,[0,0]);button(render(),'Diminuir hora').props.onPress();button(render(),'Diminuir minuto').props.onPress();assert.deepEqual(tempo,[23,59]);assert.match(text(render()),/23:59/);
});
test('percurso expande etapas, navega estados e mostra alternativa explicitamente ilustrativa',()=>{
 const h=harness('src/features/rotinas/PercursoRotina.tsx');const rotina={nome:'Estudo',origem:'Casa',destino:'Faculdade'};const render=()=>h.render({rotina},'PreviaPercurso');assert.match(text(render()),/Preparando a viagem/);button(render(),'Próximo estado').props.onPress();assert.match(text(render()),/Aguardando embarque/);button(render(),'Etapa 2: Ônibus · exemplo A').props.onPress();assert.equal(h.slots[1],1);button(render(),'Ver alternativa').props.onPress();assert.match(text(render()),/Metrô · exemplo B/);assert.match(text(render()),/Não há ocorrência real/);assert.match(text(render()),/futuro motor/);
});
