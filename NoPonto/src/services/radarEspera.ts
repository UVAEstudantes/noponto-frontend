import { compararConteudoNotificacao, type ConteudoNotificacaoRadar, type ItemNotificacaoRadar } from './notificacoesRadar';
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
  const linha = (item: ItemNotificacaoRadar) => `${item.codigo} · ${item.tipo === 'DEPARTURE' ? 'saída prevista' : 'chegada prevista'} às ${new Date(item.previstoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${item.veiculoId ? ` · veículo ${item.veiculoId}` : ` · evento ${item.id}`}`;
  const destaque = conteudo.destaque;
  const demais = [...conteudo.prioridades, ...conteudo.alternativas].filter(i => i.id !== destaque?.id);
  const itens = [...(destaque ? [destaque] : []), ...demais].slice(0, 3);
  return { title: 'NoPonto · Radar de Espera', body: itens.map(linha).join('\n')
    + (demais.length + (destaque ? 1 : 0) > 3 ? '\nMais alternativas no Radar.' : ''),
  data: { simulacao: false, origem: 'radar-espera-local', paradaContexto: conteudo.chaveContexto } };
}

/** Uma sessão em memória, com porta nativa injetada. Nenhum relógio ou consulta próprios. */
export function criarSessaoRadarEspera(porta: PortaRadarEspera) {
  let snapshot: SnapshotRadarEspera = { chave: '', ativo: false, previa: null };
  let vinculada: string | null = null, geracao = 0, anterior: ConteudoNotificacaoRadar | null = null;
  let situacao: SituacaoRadarEspera = { estado: 'encerrado', mensagem: null, solicitando: false };
  let falhou = false, sujo = false, rodando = false;
  let trabalho: Promise<void> = Promise.resolve();
  const listeners = new Set<(s: SituacaoRadarEspera) => void>();
  const informar = (estado: EstadoRadarEspera, mensagem: string | null = null, solicitando = false) => {
    if (situacao.estado === estado && situacao.mensagem === mensagem && situacao.solicitando === solicitando) return;
    situacao = { estado, mensagem, solicitando }; listeners.forEach(fn => fn(situacao));
  };
  async function remover() {
    const r = await porta.remover().catch(() => 'erro' as const);
    if (r !== 'encerrada' && r !== 'indisponivel') informar(situacao.estado, 'Não foi possível confirmar a remoção. Tente encerrar novamente.');
  }
  function encerrar() {
    ++geracao; vinculada = null; anterior = null; falhou = false; sujo = false;
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
          if (!vinculada || falhou || situacao.solicitando) continue;
          if (snapshot.chave !== vinculada) { await encerrar(); continue; }
          if (!snapshot.ativo || !snapshot.previa) { suspender('pausado'); continue; }
          const conteudo = snapshot.previa.conteudo;
          if (!conteudo.destaque) { suspender('sem previsões'); continue; }
          informar('ativo');
          if (!compararConteudoNotificacao(anterior, conteudo).relevante) continue;
          const atual = geracao;
          const vigente = () => atual === geracao && vinculada === snapshot.chave && snapshot.ativo;
          const resultado = await porta.publicar(conteudo, vigente).catch(() => 'erro' as const);
          if (!vigente()) continue;
          if (resultado === 'exibida') anterior = conteudo;
          else {
            falhou = true; anterior = null; porta.invalidar(); await remover();
            if (!vigente()) continue;
            informar('pausado', resultado === 'negada' ? 'Permissão de notificações negada.' : 'Falha na notificação. Toque em Retomar para tentar novamente.');
          }
        }
      } finally { rodando = false; }
    })();
    return trabalho;
  }
  return {
    get situacao() { return situacao; },
    assinar(fn: (s: SituacaoRadarEspera) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    observar(atual: SnapshotRadarEspera) {
      snapshot = atual;
      if (vinculada && vinculada !== atual.chave) return encerrar();
      if (vinculada && situacao.solicitando && !atual.ativo) return encerrar();
      // Invalida imediatamente, mesmo que a fila nativa esteja aguardando confirmação.
      if (vinculada && !situacao.solicitando && (!atual.ativo || !atual.previa)) suspender('pausado');
      else if (vinculada && !situacao.solicitando && atual.previa && !atual.previa.conteudo.destaque) suspender('sem previsões');
      return sincronizar();
    },
    async ativar() {
      if (!snapshot.chave || !snapshot.ativo || situacao.solicitando) return;
      const atual = ++geracao;
      vinculada = snapshot.chave; falhou = false; anterior = null;
      informar('pausado', null, true);
      const resultado = await porta.autorizar().catch(() => 'erro' as const);
      if (atual !== geracao || vinculada !== snapshot.chave) return;
      if (resultado !== 'exibida') {
        await encerrar(); informar('encerrado', resultado === 'negada' ? 'Permissão de notificações negada.' : 'Notificações indisponíveis neste aplicativo.'); return;
      }
      informar('pausado');
      await sincronizar();
    },
    encerrar,
  };
}
