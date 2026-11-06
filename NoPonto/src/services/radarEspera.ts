import { compararConteudoNotificacao, selecionarItensNotificacao, type ConteudoNotificacaoRadar, type ItemNotificacaoRadar } from './notificacoesRadar';
import type { PreviaNotificacaoRadar } from './previaNotificacaoRadar';
import type { ResultadoLocal } from './notificacaoLocalCanal';

export interface SnapshotRadarEspera { chave: string; ativo: boolean; previa: PreviaNotificacaoRadar }
export type EstadoRadarEspera = 'ativo' | 'pausado' | 'sem previsões' | 'encerrado';
export interface SituacaoRadarEspera { estado: EstadoRadarEspera; mensagem: string | null; solicitando: boolean }
export interface PortaRadarEspera {
  autorizar(): Promise<ResultadoLocal>;
  publicar(conteudo: ConteudoNotificacaoRadar, vigente: () => boolean): Promise<ResultadoLocal>;
  remover(): Promise<ResultadoLocal>;
  invalidar(): void;
}
export function textoNotificacaoRadar(conteudo: ConteudoNotificacaoRadar) {
  // Horário absoluto continua correto sem republicar a cada segundo da contagem regressiva.
  const linha = (item: ItemNotificacaoRadar) => `${conteudo.prioridades.some(p => p.id === item.id) ? '★ ' : ''}${item.codigo} · ${item.tipo === 'DEPARTURE' ? 'saída ' : 'chega '}${new Date(item.previstoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const { itens, adicionais } = selecionarItensNotificacao(conteudo);
  const espera = conteudo.terminal?.length ?? 0;
  return { title: 'Radar de Espera', subtitle: conteudo.paradaNome?.slice(0, 60),
    body: [...itens.map(linha), ...(adicionais ? [`+${adicionais} alternativas no Radar`] : []),
      ...(espera ? [`${espera} ${espera === 1 ? 'veículo aguardando' : 'veículos aguardando'} no terminal`] : [])].join('\n'),
    data: { simulacao: false, origem: 'radar-espera-local', paradaContexto: conteudo.chaveContexto,
      candidatos: itens.map(i => ({ id: i.id, veiculoId: i.veiculoId, linhaId: i.linhaId, tipo: i.tipo, previstoEm: i.previstoEm })),
      alternativasAdicionais: adicionais, terminal: conteudo.terminal ?? [] } };
}

/** Uma sessão em memória, com porta nativa injetada. Nenhum relógio ou consulta próprios. */
export function criarSessaoRadarEspera(porta: PortaRadarEspera) {
  let snapshot: SnapshotRadarEspera = { chave: '', ativo: false, previa: null };
  let vinculada: string | null = null, geracao = 0, ativacaoGeracao = 0, anterior: ConteudoNotificacaoRadar | null = null;
  let situacao: SituacaoRadarEspera = { estado: 'encerrado', mensagem: null, solicitando: false };
  let falhou = false, sujo = false, rodando = false;
  let trabalho: Promise<void> = Promise.resolve();
  const listeners = new Set<(s: SituacaoRadarEspera) => void>();
  const informar = (estado: EstadoRadarEspera, mensagem: string | null = null, solicitando = false) => {
    if (situacao.estado === estado && situacao.mensagem === mensagem && situacao.solicitando === solicitando) return;
    situacao = { estado, mensagem, solicitando }; listeners.forEach(fn => fn(situacao));
  };
  async function remover() {
    const atual = geracao;
    const r = await porta.remover().catch(() => 'erro' as const);
    if (atual === geracao && r !== 'encerrada' && r !== 'indisponivel') informar(situacao.estado, 'Não foi possível confirmar a remoção. Tente encerrar novamente.');
  }
  function encerrar() {
    ++geracao; ++ativacaoGeracao; vinculada = null; anterior = null; falhou = false; sujo = false;
    porta.invalidar(); informar('encerrado');
    return remover();
  }
  function suspender(estado: 'pausado' | 'sem previsões') {
    if (situacao.estado !== estado || anterior) {
      ++geracao; anterior = null; porta.invalidar(); informar(estado); void remover();
    }
  }
  function sincronizar() {
    sujo = true;
    if (rodando) return trabalho;
    rodando = true;
    trabalho = (async () => {
      try {
        while (sujo) {
          sujo = false;
          if (vinculada == null || falhou || situacao.solicitando) continue;
          if (!snapshot.ativo || !snapshot.previa) { suspender('pausado'); continue; }
          const conteudo = snapshot.previa.conteudo;
          if (!conteudo.destaque && !conteudo.terminal?.length) { suspender('sem previsões'); continue; }
          informar('ativo');
          if (!compararConteudoNotificacao(anterior, conteudo).relevante) continue;
          const atual = geracao;
          const vigente = () => atual === geracao && vinculada === snapshot.chave && snapshot.ativo;
          const resultado = await porta.publicar(conteudo, vigente).catch(() => 'erro' as const);
          if (!vigente()) continue;
          if (resultado === 'exibida') anterior = conteudo;
          else {
            if (resultado === 'negada') { await encerrar(); informar('encerrado', 'Permissão de notificações negada.'); continue; }
            falhou = true; anterior = null; porta.invalidar(); await remover();
            if (!vigente()) continue;
            informar('pausado', 'Falha na notificação. Toque em Retomar para tentar novamente.');
          }
        }
      } finally { rodando = false; }
    })();
    return trabalho;
  }
  return {
    get situacao() { return situacao; },
    reconfigurar() { ++geracao; anterior = null; porta.invalidar(); },
    assinar(fn: (s: SituacaoRadarEspera) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    observar(atual: SnapshotRadarEspera) {
      const alvoAnterior = snapshot.previa?.contexto;
      snapshot = atual;
      if (vinculada != null && vinculada !== atual.chave) {
        ++geracao; vinculada = atual.chave; anterior = null; porta.invalidar();
        const alvoAtual = atual.previa?.contexto;
        const mesmoAlvo = alvoAnterior && alvoAtual && alvoAnterior.paradaId === alvoAtual.paradaId
          && JSON.stringify(alvoAnterior.vinculos) === JSON.stringify(alvoAtual.vinculos);
        // Troca de alvo limpa antes de publicar; preferências atualizam a entrada existente.
        if (!mesmoAlvo) void remover();
      }
      // Invalida imediatamente, mesmo que a fila nativa esteja aguardando confirmação.
      if (vinculada != null && !situacao.solicitando && (!atual.ativo || !atual.previa)) suspender('pausado');
      else if (vinculada != null && !situacao.solicitando && atual.previa && !atual.previa.conteudo.destaque && !atual.previa.conteudo.terminal?.length) suspender('sem previsões');
      return sincronizar();
    },
    async ativar() {
      if (!snapshot.chave || !snapshot.ativo || situacao.solicitando) return;
      ++geracao;
      const atual = ++ativacaoGeracao;
      vinculada = snapshot.chave; falhou = false; anterior = null;
      informar('pausado', null, true);
      const resultado = await porta.autorizar().catch(() => 'erro' as const);
      if (atual !== ativacaoGeracao || vinculada == null) return;
      if (resultado !== 'exibida') {
        await encerrar(); informar('encerrado', resultado === 'negada' ? 'Permissão de notificações negada.' : 'Notificações indisponíveis neste aplicativo.'); return;
      }
      informar('pausado');
      await sincronizar();
    },
    encerrar,
  };
}
