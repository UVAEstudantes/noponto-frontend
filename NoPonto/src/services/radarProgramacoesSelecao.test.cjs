const test = require('node:test');
const assert = require('node:assert/strict');
const { criarHarness } = require('../hooks/radarTestHarness.cjs');
function load(get, structural={}) {
 return criarHarness().carregar('../services/radarProgramacoesSelecao.ts', {'./api':{api:{get}},'./estruturaV2':structural});
}
test('busca de parada envia termo, pagina limitada e sinal de cancelamento',async()=>{
 const calls=[], signal=new AbortController().signal;
 const data={itens:[{id:'fora-do-mapa',nome:'Centro'}],totalPaginas:3};
 const service=load(async(...args)=>{calls.push(args);return {ok:true,data};});
 assert.deepEqual(await service.buscarParadasProgramacao(' Centro ',2,signal),data);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'/paradas');
 assert.deepEqual(calls[0][1].params,{nome:'Centro',page:2,pageSize:15});assert.equal(calls[0][1].signal,signal);
});
test('falha de rede e distinta de busca sem resultados',async()=>{
 await assert.rejects(load(async()=>({ok:false})).buscarParadasProgramacao('Centro',1));
 assert.deepEqual((await load(async()=>({ok:true,data:{itens:[],totalPaginas:0}})).buscarParadasProgramacao('Centro',1)).itens,[]);
});
test('carrega apenas padroes da linha escolhida e exclui versoes antigas e terminal',async()=>{
 const calls=[];
 const s=load(async()=>({ok:true,data:[]}),{
  listarSentidosV2:async code=>{calls.push(code);return [{id:'S',linhaId:'L',nome:'Centro'},{id:'outro',linhaId:'outra'}];},
  listarPadroesV2:async id=>{assert.equal(id,'S');return [{versaoAtualId:'atual'},{versaoAtualId:'antiga'},{versaoAtualId:'terminal'}];},
  obterItinerarioPadraoVersaoV2:async version=>({linhaId:'L',sentidoId:'S',padraoOperacionalId:'O',padraoVersaoId:version,nomeSentido:'Centro',ehVersaoAtual:version!=='antiga',ocorrencias:version==='terminal'?[{paradaId:'P',ordem:1}]:[{paradaId:'P',ordem:1},{paradaId:'F',ordem:2}]})
 });
 assert.deepEqual(await s.contextosLinhaProgramacao('P',{linhaId:'L',codigo:'838'}),[{linhaId:'L',sentidoId:'S',padraoOperacionalId:'O',padraoVersaoId:'atual',destino:'Centro'}]);
 assert.deepEqual(calls,['838']);
});
