import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const CANAL_RADAR_TESTE = 'radar-chegada-simulacao';
export type ResultadoNotificacaoTeste = 'exibida' | 'negada' | 'indisponivel' | 'erro';

/** Consulta sem abrir o diálogo de permissão. */
export async function verificarPermissaoNotificacao() {
  return Notifications.getPermissionsAsync();
}

/** Chamado exclusivamente pelo botão de desenvolvimento, após interação explícita. */
export async function testarNotificacaoLocal(): Promise<ResultadoNotificacaoTeste> {
  if (!__DEV__ || Platform.OS !== 'android') return 'indisponivel';
  try {
    Notifications.setNotificationHandler({
      handleNotification: async notification => {
        const simulacao = notification.request.content.data?.simulacao === true;
        return { shouldShowBanner: simulacao, shouldShowList: simulacao,
          shouldPlaySound: false, shouldSetBadge: false };
      },
    });
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
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'NoPonto · Radar',
        body: '838 chegando em aproximadamente 5 minutos',
        sound: false,
        data: { simulacao: true, origem: 'teste-local-n2a', dadosReais: false },
      },
      trigger: { channelId: CANAL_RADAR_TESTE },
    });
    return 'exibida';
  } catch {
    return 'erro';
  }
}
