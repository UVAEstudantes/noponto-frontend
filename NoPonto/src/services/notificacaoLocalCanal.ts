import * as Notifications from 'expo-notifications';

export type ResultadoLocal = 'exibida' | 'encerrada' | 'negada' | 'indisponivel' | 'erro' | 'cancelada';
const revisoes = new Map<string, { chave: string; valor: string }>();
let handlerConfigurado = false;
let permiteRemota: ((data: Record<string, unknown>) => boolean) | undefined;
export function configurarRecebimentoRemoto(permite: (data: Record<string, unknown>) => boolean) {
  permiteRemota = permite;
  configurarHandler();
}
const sessao = `${Date.now()}-${Math.random()}`;
let sequencia = 0;
function configurarHandler() {
  if (handlerConfigurado) return;
  Notifications.setNotificationHandler({ handleNotification: async notification => {
    const revisao = revisoes.get(notification.request.identifier);
    const mostrar = permiteRemota?.(notification.request.content.data ?? {}) === true
      || revisao != null && notification.request.content.data?.[revisao.chave] === revisao.valor;
    return { shouldShowBanner: mostrar, shouldShowList: mostrar, shouldPlaySound: false, shouldSetBadge: false };
  } });
  handlerConfigurado = true;
}

/** Filas por identidade e um handler compartilhado: simulação e Radar não se apagam. */
export function criarCanalNotificacaoLocal(identifier: string, canal: string, chaveRevisao: string,
  disponivel: () => boolean) {
  let fila: Promise<unknown> = Promise.resolve();
  const invalidar = () => { revisoes.delete(identifier); };
  function serializar(operacao: () => Promise<ResultadoLocal>): Promise<ResultadoLocal> {
    const resultado = fila.then(async (): Promise<ResultadoLocal> => {
      if (!disponivel()) return 'indisponivel';
      try { return await operacao(); } catch { return 'erro'; }
    });
    fila = resultado;
    return resultado;
  }
  async function aguardar(revisao: string | null, vigente = () => true) {
    for (let tentativa = 0; tentativa < 50; tentativa++) {
      if (!vigente()) return false;
      const itens = await Notifications.getPresentedNotificationsAsync();
      const item = itens.find(n => n.request.identifier === identifier);
      if (revisao == null ? !item : item?.request.content.data?.[chaveRevisao] === revisao) return true;
      await new Promise<void>(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Não foi possível confirmar a operação da notificação.');
  }
  async function permissao(solicitar: boolean) {
    configurarHandler();
    await Notifications.setNotificationChannelAsync(canal, {
      name: 'Radar de Espera', importance: Notifications.AndroidImportance.DEFAULT,
      sound: null, enableVibrate: false,
    });
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted && p.canAskAgain && solicitar) p = await Notifications.requestPermissionsAsync();
    return p.granted;
  }
  return {
    invalidar,
    autorizar: () => serializar(async () => await permissao(true) ? 'exibida' : 'negada'),
    publicar: (content: Notifications.NotificationContentInput, solicitar = false, vigente = () => true) =>
      serializar(async () => {
        if (!vigente()) return 'cancelada';
        if (!await permissao(solicitar)) return 'negada';
        if (!vigente()) return 'cancelada';
        const revisao = `${sessao}:${++sequencia}`;
        revisoes.set(identifier, { chave: chaveRevisao, valor: revisao });
        await Notifications.scheduleNotificationAsync({ identifier,
          content: { ...content, sound: false, data: { ...content.data, [chaveRevisao]: revisao } },
          trigger: { channelId: canal } });
        if (!await aguardar(revisao, vigente) || !vigente()) {
          invalidar();
          await Notifications.dismissNotificationAsync(identifier);
          return 'cancelada';
        }
        return 'exibida';
      }),
    remover: () => {
      invalidar();
      return serializar(async () => {
        invalidar(); // Também após publicações que já estavam na fila antes do encerramento.
        await Notifications.dismissNotificationAsync(identifier);
        await aguardar(null);
        return 'encerrada';
      });
    },
  };
}
