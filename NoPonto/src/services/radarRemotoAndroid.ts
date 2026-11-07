
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { Platform, AppState } from 'react-native';
import { configurarRecebimentoRemoto } from './notificacaoLocalCanal';
import { clienteRadarEspera, IDENTIFICADOR_RADAR_ESPERA } from './notificacaoRadarLocal';
import { criarRadarRemoto, ErroRadarRemoto } from './radarRemotoCore';

const baseUrl = process.env.EXPO_PUBLIC_RADAR_API_BASE_URL ?? '';
const projectId =
  Constants.easConfig?.projectId ??
  Constants.expoConfig?.extra?.eas?.projectId ??
  '';

const storageOptions = {
  keychainService: 'noponto.radar.dev.v1',
  requireAuthentication: false,
};

export const radarRemotoAndroid = criarRadarRemoto({
  projectId,

  id: () => Crypto.randomUUID(),

  now: () => Date.now(),

  read: key => SecureStore.getItemAsync(key, storageOptions),

  write: (key, value) =>
    SecureStore.setItemAsync(key, value, storageOptions),

  remove: key =>
    SecureStore.deleteItemAsync(key, storageOptions),

  async request<T>(
    method: string,
    path: string,
    credential?: string,
    body?: unknown
  ): Promise<T> {
    // URL experimental separada; nenhum fallback para a API produtiva.
    const url = new URL(baseUrl);

    if (
      Platform.OS !== 'android' ||
      Constants.expoConfig?.android?.package !==
        'com.guilhermedesales.nononto.dev' ||
      (
        url.protocol !== 'https:' &&
        !(
          __DEV__ &&
          ['localhost', '127.0.0.1'].includes(url.hostname)
        )
      )
    ) {
      throw new ErroRadarRemoto(0);
    }

    // Timeout compatível com React Native/Hermes.
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 10000);

    try {
      const response = await fetch(
        new URL(path, url).toString(),
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(credential
              ? { Authorization: `Bearer ${credential}` }
              : {}),
          },
          body:
            body === undefined
              ? undefined
              : JSON.stringify(body),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const problem = await response
          .json()
          .catch(() => ({}));

        throw new ErroRadarRemoto(
          response.status,
          typeof problem.code === 'string'
            ? problem.code
            : undefined
        );
      }

      return response.status === 204
        ? (null as T)
        : response.json();
    } finally {
      clearTimeout(timeout);
    }
  },

  async token(ask) {
    if (!projectId) {
      throw new ErroRadarRemoto(0);
    }

    await Notifications.setNotificationChannelAsync(
      'radar-espera-updates-v1',
      {
        name: 'Radar de Espera',
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        enableVibrate: false,
        showBadge: false,
      }
    );

    let permissions =
      await Notifications.getPermissionsAsync();

    if (
      !permissions.granted &&
      permissions.canAskAgain &&
      ask
    ) {
      permissions =
        await Notifications.requestPermissionsAsync();
    }

    if (!permissions.granted) {
      throw new ErroRadarRemoto(
        0,
        'permissao_negada'
      );
    }

    return (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data;
  },

  async clearNotifications(current) {
    clienteRadarEspera.invalidar();

    await clienteRadarEspera.remover();

    const items =
      await Notifications.getPresentedNotificationsAsync();

    await Promise.all(
      items
        .filter(n => {
          const data = n.request.content.data;

          const keep =
            data?.mode === 'remote-radar' &&
            current?.estado === 'ativa' &&
            Date.parse(current.expiraEm) > Date.now() &&
            data.sessionId === current.sessaoId &&
            data.revision === current.revisao &&
            Date.parse(String(data.validUntil)) >
              Date.now();

          return (
            !keep &&
            (
              ['remote-radar', 'radar-enrollment'].includes(
                String(data?.mode)
              ) ||
              n.request.identifier ===
                IDENTIFICADOR_RADAR_ESPERA
            )
          );
        })
        .map(n =>
          Notifications.dismissNotificationAsync(
            n.request.identifier
          )
        )
    );
  },
});

configurarRecebimentoRemoto(data =>
  radarRemotoAndroid.permite(data)
);

Notifications.addNotificationReceivedListener(
  notification => {
    if (
      notification.request.content.data?.mode ===
      'radar-enrollment'
    ) {
      void radarRemotoAndroid.confirmar(
        notification.request.content.data
      );
    }
  }
);

Notifications.addNotificationResponseReceivedListener(
  response => {
    if (
      response.notification.request.content.data?.mode ===
      'radar-enrollment'
    ) {
      void radarRemotoAndroid.confirmar(
        response.notification.request.content.data
      );
    }
  }
);

Notifications.addPushTokenListener(() => {
  if (AppState.currentState === 'active') {
    void radarRemotoAndroid.reconciliar();
  }
});
