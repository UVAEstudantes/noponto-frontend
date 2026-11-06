import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const CANAL_RADAR_TESTE = 'radar-chegada-simulacao';
export const IDENTIFICADOR_RADAR_TESTE = 'noponto:radar:simulacao-local';
export const CENARIOS_NOTIFICACAO_TESTE = {
  exibir: '838 chegando em 5 min',
  atualizar: '855 chegando em 3 min',
  atualizarNovamente: '838 chegando em 2 min',
} as const;
export type CenarioNotificacaoTeste = keyof typeof CENARIOS_NOTIFICACAO_TESTE;
export type ResultadoNotificacaoTeste = 'exibida' | 'encerrada' | 'negada' | 'indisponivel' | 'erro';

let fila: Promise<unknown> = Promise.resolve();
let handlerConfigurado = false;
const sessao = `${Date.now()}-${Math.random()}`;
let sequencia = 0;
let revisaoAtiva: string | null = null;

function serializar(operacao: () => Promise<ResultadoNotificacaoTeste>): Promise<ResultadoNotificacaoTeste> {
  const resultado = fila.then(async (): Promise<ResultadoNotificacaoTeste> => {
    if (!__DEV__ || Platform.OS !== 'android') return 'indisponivel';
    try {
      return await operacao();
    } catch {
      return 'erro';
    }
  });
  fila = resultado;
  return resultado;
}

/** schedule resolve antes do notify Android; não libere a próxima operação ainda. */
async function aguardarApresentacao(revisao: string | null) {
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    const apresentadas = await Notifications.getPresentedNotificationsAsync();
    const propria = apresentadas.find(n => n.request.identifier === IDENTIFICADOR_RADAR_TESTE);
    if (revisao == null ? !propria : propria?.request.content.data?.revisaoTeste === revisao) return;
    await new Promise<void>(resolve => setTimeout(resolve, 100));
  }
  throw new Error('A apresentação da notificação de teste não foi confirmada.');
}

function configurarHandler() {
  if (handlerConfigurado) return;
  Notifications.setNotificationHandler({
    handleNotification: async notification => {
      const simulacao = notification.request.identifier === IDENTIFICADOR_RADAR_TESTE
        && notification.request.content.data?.simulacao === true
        && revisaoAtiva != null
        && notification.request.content.data?.revisaoTeste === revisaoAtiva;
      return { shouldShowBanner: simulacao, shouldShowList: simulacao,
        shouldPlaySound: false, shouldSetBadge: false };
    },
  });
  handlerConfigurado = true;
}

/** Consulta sem abrir o diálogo de permissão. */
export async function verificarPermissaoNotificacao() {
  return Notifications.getPermissionsAsync();
}

/** Chamado exclusivamente pelo botão de desenvolvimento, após interação explícita. */
export function testarNotificacaoLocal(cenario: CenarioNotificacaoTeste = 'exibir'): Promise<ResultadoNotificacaoTeste> {
  return serializar(async () => {
    configurarHandler();
    // Android 13 precisa do canal antes da solicitação de permissão.
    await Notifications.setNotificationChannelAsync(CANAL_RADAR_TESTE, {
      name: 'Radar de chegada', importance: Notifications.AndroidImportance.DEFAULT,
      sound: null, enableVibrate: false,
    });
    let permissao = await verificarPermissaoNotificacao();
    if (!permissao.granted && permissao.canAskAgain) {
      permissao = await Notifications.requestPermissionsAsync();
    }
    if (!permissao.granted) return 'negada';
    const revisao = `${sessao}:${++sequencia}`;
    revisaoAtiva = revisao;
    await Notifications.scheduleNotificationAsync({
      // ExpoPresentationDelegate usa notify(identifier, 0, notification).
      identifier: IDENTIFICADOR_RADAR_TESTE,
      content: {
        title: 'NoPonto · Radar',
        body: CENARIOS_NOTIFICACAO_TESTE[cenario],
        sound: false,
        data: { simulacao: true, origem: 'teste-local-n2a', dadosReais: false, revisaoTeste: revisao },
      },
      trigger: { channelId: CANAL_RADAR_TESTE },
    });
    await aguardarApresentacao(revisao);
    return 'exibida';
  });
}

/** Remove somente a simulação; não solicita permissão nem remove outras entradas. */
export function encerrarNotificacaoLocal(): Promise<ResultadoNotificacaoTeste> {
  return serializar(async () => {
    revisaoAtiva = null;
    await Notifications.dismissNotificationAsync(IDENTIFICADOR_RADAR_TESTE);
    await aguardarApresentacao(null);
    return 'encerrada';
  });
}
