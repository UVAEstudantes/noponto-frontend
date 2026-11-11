const test = require('node:test');
const assert = require('node:assert/strict');
const { criarHarness } = require('../../hooks/radarTestHarness.cjs');
const { temas } = require('../../constants/tema.ts');
const nodes = v => Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === 'object' ? [v, ...nodes(v.props?.children)] : [];
const texto = v => Array.isArray(v) ? v.map(texto).join(' ') : v && typeof v === 'object' ? texto(v.props?.children) : v == null || typeof v === 'boolean' ? '' : String(v);
function montar(estado = 'encerrado') {
 const h=criarHarness(), chamadas=[]; let tema='claro';
 const c={estado,paradaNome:'Bom Repouso',carregado:true,podeConfigurar:true,podeSolicitarAtivacao:true,selecionadas:['A'],outraParada:false,
 preferencias:{prioritarias:[],janelaMinutos:10},destinos:{A:'Terminal Magarça',B:'Campo Grande'},
 disponiveis:[{linhaId:'A',linhaCodigo:'838',cor:'#007AFF'},{linhaId:'B',linhaCodigo:'884',cor:'#FF6600'}],
 aplicarConfiguracao:(...args)=>chamadas.push(['salvar',...args]),ativar:()=>chamadas.push(['ativar']),encerrar:()=>chamadas.push(['encerrar'])};
 const Component=h.carregar('../components/mapaComponents/radarEsperaSection.tsx',{
 'react-native':Object.fromEntries(['ActivityIndicator','Modal','View','Text','Pressable','ScrollView','StatusBar'].map(n=>[n,n])),
 'lucide-react-native':Object.fromEntries(['ArrowLeft','Bell','Check','ChevronRight','Headphones','Star','X'].map(n=>[n,n])),
 'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:32})},
 './radarVehicleCard':{textoSobreCor:()=>'#FFFFFF',fundoIdentificador:c=>c},
 './radarAvisosPorVoz':{__esModule:true,default:'Headphones'},
 '@/src/hooks/useTema':{useTema:()=>({cores:temas[tema].cores,temaAtual:tema})}}).default;
 const render=()=>h.render(()=>Component({controle:c})); const botao=label=>nodes(h.output).find(n=>n.props?.accessibilityLabel===label);
 render();return {h,c,chamadas,render,botao,tema:t=>{tema=t;render();},abrir:()=>{botao('Gerenciar Radar de Espera').props.onPress();render();}};
}
test('resumo compacto abre configuracao sem checkboxes nem previa DEV no mapa',()=>{
 const m=montar();assert.equal(m.botao('Acompanhar linha 838'),undefined);assert.equal(nodes(m.h.output).filter(n=>n.type==='Pressable').length,1);
 m.abrir();assert.ok(m.botao('Acompanhar linha 838'));assert.match(texto(m.h.output),/Sem previsão elegível/);
 assert.equal(nodes(m.h.output).filter(n=>n.type==='Headphones').length,1);assert.equal(m.h.timerCount,0);
 nodes(m.h.output).find(n=>n.type==='Modal').props.onRequestClose();m.render();assert.equal(m.botao('Acompanhar linha 838'),undefined);assert.deepEqual(m.chamadas,[]);
});
test('rascunho cancela ao voltar e salva uma vez sem reativar sessao ativa',()=>{
 const m=montar('ativo');m.abrir();m.botao('Acompanhar linha 884').props.onPress();m.render();
 m.botao('Priorizar linha 884').props.onPress();m.render();m.botao('5 minutos de antecedência').props.onPress();m.render();assert.deepEqual(m.chamadas,[]);
 m.botao('Voltar do Radar de Espera').props.onPress();m.render();m.abrir();assert.equal(m.botao('Acompanhar linha 884').props.accessibilityState.checked,false);
 m.botao('Priorizar linha 838').props.onPress();m.render();m.botao('Salvar alterações').props.onPress();m.render();
 assert.deepEqual(m.chamadas,[['salvar',['A'],['A'],10]]);
});
test('desmarcar linha remove prioridade e antecedencia preserva limites e valores intermediarios',()=>{
 const m=montar();m.abrir();assert.equal(m.botao('Priorizar linha 884').props.disabled,true);
 m.botao('Priorizar linha 838').props.onPress();m.render();m.botao('Acompanhar linha 838').props.onPress();m.render();
 assert.equal(m.botao('Priorizar linha 838').props.accessibilityState.checked,false);assert.equal(m.botao('Ativar Radar').props.disabled,true);
 m.botao('Acompanhar linha 838').props.onPress();m.render();m.botao('Aumentar antecedência').props.onPress();m.render();
 m.botao('Ativar Radar').props.onPress();m.render();assert.deepEqual(m.chamadas,[['salvar',['A'],[],11],['ativar']]);
 m.abrir();for(const n of [2,15]){m.botao(`${n} minutos de antecedência`).props.onPress();m.render();assert.equal(m.botao(n===2?'Diminuir antecedência':'Aumentar antecedência').props.disabled,true);}
});
test('tema dinamico preserva rascunho e usa superficies escuras areas seguras e controles acessiveis',()=>{
 const m=montar('ativo');m.abrir();m.botao('Priorizar linha 838').props.onPress();m.render();
 for(const t of ['claro','escuro']){m.tema(t);const ns=nodes(m.h.output);
 assert.ok(ns.some(n=>n.props?.style?.backgroundColor===temas[t].cores.fundoApp));
 assert.ok(ns.some(n=>n.props?.style?.paddingBottom===32));
 assert.equal(ns.find(n=>n.type==='StatusBar').props.barStyle,t==='escuro'?'light-content':'dark-content');
 assert.equal(m.botao('Priorizar linha 838').props.accessibilityState.checked,true);
 assert.equal(m.botao('Priorizar linha 838').props.style.minWidth,44);
 if(t==='escuro')assert.equal(ns.some(n=>n.props?.style?.backgroundColor==='#FFFFFF'),false);
 }
 assert.deepEqual(m.chamadas,[]);m.botao('Encerrar acompanhamento').props.onPress();m.render();assert.deepEqual(m.chamadas,[['encerrar']]);
});
test('outra parada informa alvo e bloqueia salvar sem transferir sessao',()=>{
 const m=montar('pausado');m.c.outraParada=true;m.c.podeConfigurar=false;m.render();m.abrir();
 assert.match(texto(m.h.output),/Monitorando\s+Bom Repouso/);assert.equal(m.botao('Acompanhar linha 838'),undefined);assert.equal(m.botao('Salvar alterações').props.disabled,true);assert.deepEqual(m.chamadas,[]);
});


test('mudanca de contexto durante edicao impede salvar rascunho antigo',()=>{
 const m=montar('ativo');m.c.chaveConfiguracao='original';m.render();m.abrir();
 m.c.chaveConfiguracao='novo';m.render();assert.equal(m.botao('Salvar alterações').props.disabled,true);
 m.botao('Salvar alterações').props.onPress();m.render();assert.deepEqual(m.chamadas,[]);assert.match(texto(m.h.output),/O contexto mudou/);
});

test('permissao negada fica visivel na configuracao e falha nativa permite retomar',()=>{
 const m=montar();m.abrir();m.botao('Ativar Radar').props.onPress();m.render();
 m.c.mensagem='Permissão de notificações negada.';m.render();assert.match(texto(m.h.output),/Permissão de notificações negada/);assert.ok(nodes(m.h.output).some(n=>n.type==='Modal'));
 m.c.estado='pausado';m.c.mensagem='Falha na notificação.';m.c.podeAtivar=true;m.render();
 m.botao('Retomar').props.onPress();assert.deepEqual(m.chamadas.at(-1),['ativar']);
 m.c.podeAtivar=false;m.render();assert.equal(m.botao('Retomar').props.disabled,true);
});

test('configuracao mostra ETA mais proximo da linha e bloqueia edicao durante carregamento',()=>{
 const m=montar();m.c.previa={candidatos:[{evento:{linhaId:'A'},etaSeg:300},{evento:{linhaId:'A'},etaSeg:120}],conteudo:{}};m.render();m.abrir();
 assert.match(texto(m.h.output),/Previsão\s+·\s+2\s+min/);assert.match(texto(m.h.output),/Sem previsão elegível/);
 m.c.podeConfigurar=false;m.render();assert.equal(m.botao('Acompanhar linha 838').props.disabled,true);assert.equal(m.botao('Ativar Radar').props.disabled,true);
});

test('consulta indisponivel impede ativacao mas permite editar rascunho',()=>{
 const m=montar();m.c.podeSolicitarAtivacao=false;m.render();m.abrir();
 assert.equal(m.botao('Ativar Radar').props.disabled,true);assert.equal(m.botao('Acompanhar linha 838').props.disabled,false);
 m.botao('Ativar Radar').props.onPress();m.render();assert.deepEqual(m.chamadas,[]);assert.match(texto(m.h.output),/Aguarde uma consulta válida/);
});

test('ativar salvar e encerrar mantem configuracao aberta ate acao explicita',()=>{
 const m=montar();m.abrir();m.botao('Ativar Radar').props.onPress();m.render();
 assert.ok(nodes(m.h.output).some(n=>n.type==='Modal'));assert.deepEqual(m.chamadas,[['salvar',['A'],[],10],['ativar']]);
 m.c.estado='ativo';m.render();m.botao('Salvar alterações').props.onPress();m.render();
 assert.ok(nodes(m.h.output).some(n=>n.type==='Modal'));assert.deepEqual(m.chamadas.at(-1),['salvar',['A'],[],10]);
 m.botao('Encerrar acompanhamento').props.onPress();m.render();
 assert.ok(nodes(m.h.output).some(n=>n.type==='Modal'));assert.deepEqual(m.chamadas.at(-1),['encerrar']);
 m.botao('Voltar do Radar de Espera').props.onPress();m.render();
 assert.equal(nodes(m.h.output).some(n=>n.type==='Modal'),false);
});

test('sessao expirada mostra reativacao e permanece aberta apos renovar',()=>{
 const m=montar('encerrado');m.c.modoRemoto=true;m.c.estadoRemoto='expirado';m.c.expiraEm='2026-11-06T13:00:00Z';
 m.c.podeReativarRemoto=true;m.render();m.abrir();
 assert.equal(m.botao('Reativar Radar').props.disabled,false);assert.match(texto(m.h.output),/Sessão expirada/);
 m.botao('Reativar Radar').props.onPress();m.render();
 assert.deepEqual(m.chamadas,[['salvar',['A'],[],10],['ativar']]);assert.ok(nodes(m.h.output).some(n=>n.type==='Modal'));
 m.c.estadoRemoto='ativo';m.c.estado='ativo';m.c.podeReativarRemoto=false;m.render();
 assert.ok(nodes(m.h.output).some(n=>n.type==='Modal'));assert.ok(m.botao('Salvar alterações'));
});

test('sessao expirada habilita salvar BRT selecionado mesmo sem previa elegivel',()=>{
 const m=montar('encerrado');m.c.modoRemoto=true;m.c.estadoRemoto='expirado';m.c.expiraEm='2026-11-06T13:00:00Z';
 m.c.selecionadas=['brt-10','brt-12'];m.c.disponiveis=m.c.selecionadas.map((linhaId,i)=>({linhaId,linhaCodigo:String(10+i*2)}));
 m.c.previa=null;m.c.podeReativarRemoto=true;m.c.podeSolicitarAtivacao=true;m.render();m.abrir();
 assert.equal(m.botao('Reativar Radar').props.disabled,false);
 assert.equal(m.botao('Acompanhar linha 10').props.accessibilityState.checked,true);
 assert.equal(m.botao('Acompanhar linha 12').props.accessibilityState.checked,true);
});

test('reativa alvo preservado mesmo visualizando outra parada sem salvar rascunho',()=>{
 const m=montar('encerrado');m.c.modoRemoto=true;m.c.estadoRemoto='expirado';m.c.expiraEm='2026-11-06T13:00:00Z';
 m.c.outraParada=true;m.c.podeConfigurar=false;m.c.podeReativarRemoto=true;m.c.podeSolicitarAtivacao=true;
 m.c.selecionadas=[];m.c.disponiveis=[];m.c.chaveConfiguracao='outra';m.render();m.abrir();
 assert.equal(m.botao('Reativar Radar').props.disabled,false);
 m.botao('Reativar Radar').props.onPress();m.render();
 assert.deepEqual(m.chamadas,[['ativar']]);assert.ok(nodes(m.h.output).some(n=>n.type==='Modal'));
});

test('solicitacao desabilita controles e mostra a operacao em andamento',()=>{
 const m=montar('ativo');m.c.modoRemoto=true;m.c.estadoRemoto='ativo';m.c.solicitando=true;m.c.operacaoRemota='atualizar';
 m.render();m.abrir();assert.equal(m.botao('Salvar alterações').props.disabled,true);
 assert.equal(m.botao('Encerrar acompanhamento').props.disabled,true);assert.equal(m.botao('Acompanhar linha 838').props.disabled,true);
 assert.match(texto(m.h.output),/Salvando/);assert.equal(nodes(m.h.output).filter(n=>n.type==='ActivityIndicator').length,1);
 m.c.solicitando=false;m.c.operacaoRemota=null;m.render();
 assert.equal(m.botao('Salvar alterações').props.disabled,false);assert.equal(m.botao('Encerrar acompanhamento').props.disabled,false);
});

test('reconciliacao em segundo plano nao bloqueia edicao nem salvamento',()=>{
 const m=montar('ativo');m.c.modoRemoto=true;m.c.estadoRemoto='ativo';m.c.solicitando=true;m.c.operacaoRemota='reconciliar';
 m.render();m.abrir();
 assert.equal(m.botao('Acompanhar linha 838').props.disabled,false);assert.equal(m.botao('Salvar alterações').props.disabled,false);
 assert.equal(nodes(m.h.output).filter(n=>n.type==='ActivityIndicator').length,0);
});

test('estado pendente informa confirmacao e permite verificar novamente',()=>{
 const m=montar('encerrado');m.c.modoRemoto=true;m.c.estadoRemoto='pendente';m.c.podeReativarRemoto=true;
 m.render();m.abrir();assert.match(texto(m.h.output),/Aguardando confirmação push/);
 const acao=m.botao('Verificar ativação');assert.equal(acao.props.disabled,false);acao.props.onPress();m.render();
 assert.deepEqual(m.chamadas.at(-1),['ativar']);assert.ok(nodes(m.h.output).some(n=>n.type==='Modal'));
});

test('ativacao remota usa a configuracao aplicada no mesmo toque',()=>{
 const m=montar('encerrado');m.c.modoRemoto=true;m.c.estadoRemoto='expirado';m.c.expiraEm='2026-11-06T13:00:00Z';
 m.c.podeReativarRemoto=true;
 const configuracao={paradaId:'stop',contextos:[{linhaId:'A',sentidoId:'ida',padraoOperacionalId:'op',padraoVersaoId:'v'}],
  linhasSelecionadas:['A'],linhasPrioritarias:[],antecedenciaMinutos:10};
 m.c.aplicarConfiguracao=(...args)=>{m.chamadas.push(['salvar',...args]);return configuracao;};
 m.c.ativar=(...args)=>{m.chamadas.push(['ativar',...args]);};
 m.render();m.abrir();m.botao('Reativar Radar').props.onPress();
 assert.deepEqual(m.chamadas,[['salvar',['A'],[],10],['ativar',configuracao]]);
});

function modal(root) {
  if (!root || typeof root !== 'object') return null;
  if (root.type === 'Modal') return root;
  const children = root.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = modal(child);
    if (match) return match;
  }
  return null;
}

function montarSolicitacao(solicitacao) {
  const h = criarHarness();
  const chamadas = { ativar: 0, concluidas: [] };
  const cores = new Proxy({}, { get: (_target, key) => String(key) });
  const component = h.carregar('../components/mapaComponents/radarEsperaSection.tsx', {
    'react-native': Object.fromEntries(['ActivityIndicator', 'Modal', 'Pressable', 'ScrollView', 'StatusBar', 'Text', 'View']
      .map((name) => [name, name])),
    'lucide-react-native': Object.fromEntries(['ArrowLeft', 'Bell', 'Check', 'Star', 'X']
      .map((name) => [name, name])),
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/src/hooks/useTema': { useTema: () => ({ cores, temaAtual: 'claro' }) },
    './radarVehicleCard': { fundoIdentificador: () => '#000', textoSobreCor: () => '#fff' },
    './radarAvisosPorVoz': 'RadarAvisosPorVoz',
  }).default;
  const controle = {
    modoRemoto: false, estado: 'encerrado', estadoRemoto: 'inativo', expiraEm: null,
    chaveConfiguracao: 'station-b-context', podeConfigurar: true, podeSolicitarAtivacao: true,
    podeReativarRemoto: false, podeAtivar: true, solicitando: false, operacaoRemota: null,
    erroPreferencias: null, mensagem: null, motivoPausa: null, outraParada: false,
    paradaNome: 'Estação B', selecionadas: ['line-b'], disponiveis: [], destinos: {}, previa: null,
    preferencias: { prioritarias: [], janelaMinutos: 10 },
    aplicarConfiguracao() {}, ativar() { chamadas.ativar++; }, encerrar() {},
  };
  const props = { controle, solicitacaoAbrir: solicitacao,
    onSolicitacaoConcluida: (request) => chamadas.concluidas.push(request) };
  const render = () => h.render(() => component(props));
  render();
  return { h, props, render, chamadas };
}

test('pedido vindo da ficha abre o painel no contexto selecionado sem ativar o Radar', () => {
  const m = montarSolicitacao(0);
  assert.equal(modal(m.h.output), null);
  m.props.solicitacaoAbrir = 1;
  m.render();
  assert.equal(modal(m.h.output)?.props.visible, true);
  assert.deepEqual(m.chamadas.concluidas, [1]);
  assert.equal(m.chamadas.ativar, 0);
  m.h.unmount();
});