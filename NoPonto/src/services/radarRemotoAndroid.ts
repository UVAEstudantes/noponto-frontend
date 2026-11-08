
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { diagnosticarRadar, etapaRadar } from './radarRemotoDiagnostico';
import { Platform, AppState } from 'react-native';
import { configurarRecebimentoRemoto } from './notificacaoLocalCanal';
import { clienteRadarEspera, IDENTIFICADOR_RADAR_ESPERA } from './notificacaoRadarLocal';
import { criarRadarRemoto, ErroRadarRemoto } from './radarRemotoCore';
import {
  interpretarRespostaRadar,
  opcoesRequisicaoRadar,
} from './radarRemotoHttp';

const baseUrl = process.env.EXPO_PUBLIC_RADAR_API_BASE_URL ?? '';
const projectId =
  Constants.easConfig?.projectId ??
  Constants.expoConfig?.extra?.eas?.projectId ??
  '';
const standalone = Constants.expoConfig?.extra?.radarStandalone === true;
const configuredOrigin = Constants.expoConfig?.extra?.radarApiOrigin;

const storageOptions = {
  keychainService: 'noponto.radar.dev.v1',
  requireAuthentication: false,
};

export const radarRemotoAndroid = criarRadarRemoto({
  projectId,

  id: () => Crypto.randomUUID(),

  now: () => Date.now(),

  read: key => etapaRadar('secure-store.leitura', () => SecureStore.getItemAsync(key, storageOptions)),

  write: (key, value) =>
    etapaRadar('secure-store.escrita', () => SecureStore.setItemAsync(key, value, storageOptions)),

  remove: key =>
    etapaRadar('secure-store.remocao', () => SecureStore.deleteItemAsync(key, storageOptions)),

  async request<T>(
    method: string,
    path: string,
    credential?: string,
    body?: unknown
  ): Promise<T> {
    // Ambos os perfis usam o applicationId com FCM já configurado.
    // APK standalone aceita somente a origem HTTPS declarada pelo seu build.
    diagnosticarRadar('http.configuracao', 'inicio');
    const url = await etapaRadar('http.url', async () => new URL(baseUrl));
    diagnosticarRadar('http.plataforma', Platform.OS === 'android' ? 'android' : 'incompativel');
    diagnosticarRadar('http.pacote-manifesto', Constants.expoConfig?.android?.package ===
      'com.guilhermedesales.nononto.dev' ? 'compativel' : 'incompativel');
    diagnosticarRadar('http.perfil', standalone ? 'standalone' : 'metro');

    if (
      Platform.OS !== 'android' ||
      Constants.expoConfig?.android?.package !==
        'com.guilhermedesales.nononto.dev' ||
      url.username !== '' || url.password !== '' ||
      (standalone && (url.protocol !== 'https:' || url.origin !== configuredOrigin)) ||
      (
        url.protocol !== 'https:' &&
        !(
          __DEV__ && !standalone && url.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(url.hostname)
        )
      )
    ) {
      diagnosticarRadar('http.configuracao', 'rejeitada');
      throw new ErroRadarRemoto(0);
    }
    diagnosticarRadar('http.configuracao', 'ok');

    // Timeout compatível com React Native/Hermes.
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 10000);

    try {
      // Rotas de sessão podem conter identificadores: registra somente a família.
      const rota = path.startsWith('/radar/sessao') ? 'sessao'
        : path === '/radar/instalacoes' ? 'instalacoes'
        : path.endsWith('/renovar') ? 'renovar'
        : path.endsWith('/confirmacoes') ? 'push.solicitar'
        : path.endsWith('/confirmar') ? 'push.confirmar'
        : path.endsWith('/push') ? 'push.status' : 'instalacao';
      const response = await etapaRadar(`http.${method}.${rota}`, () => fetch(
        new URL(path, url).toString(),
        {
          // Cabeçalhos iguais em GET/POST/PUT/DELETE; ngrok recebe o header
          // anti-interstitial conforme o host, sem alterar autorização.
          ...opcoesRequisicaoRadar(
            method,
            url.hostname,
            credential,
            body
          ),
          signal: controller.signal,
        }
      ));
      diagnosticarRadar('http.resposta', `status_${response.status}`);

      const resultado = await interpretarRespostaRadar<T>(response);
      diagnosticarRadar('http.formato', resultado.ok ? 'ok' : resultado.diagnostico.categoria);

      if (!resultado.ok) {
        // Diagnóstico de desenvolvimento sem corpo, token ou credencial.
        // Erros JSON do backend são esperados e não geram ruído no console.
        if (
          __DEV__ &&
          resultado.diagnostico.categoria !== 'problema'
        ) {
          console.warn(
            `[Radar remoto] ${resultado.diagnostico.mensagem}`
          );
        }

        throw new ErroRadarRemoto(
          resultado.status,
          resultado.codigo
        );
      }

      return resultado.dados as T;
    } finally {
      clearTimeout(timeout);
    }
  },

  async token(ask) {
    if (!projectId) {
      diagnosticarRadar('push.project-id', 'ausente');
      throw new ErroRadarRemoto(0);
    }

    await etapaRadar('push.canal', () => Notifications.setNotificationChannelAsync(
      'radar-espera-updates-v1',
      {
        name: 'Radar de Espera',
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        enableVibrate: false,
        showBadge: false,
      }
    ));

    let permissions =
      await etapaRadar('push.permissoes.consultar', () => Notifications.getPermissionsAsync());

    if (
      !permissions.granted &&
      permissions.canAskAgain &&
      ask
    ) {
      permissions =
        await etapaRadar('push.permissoes.solicitar', () => Notifications.requestPermissionsAsync());
    }

    if (!permissions.granted) {
      throw new ErroRadarRemoto(
        0,
        'permissao_negada'
      );
    }

    const devicePushToken = await etapaRadar('push.fcm-token', () => Notifications.getDevicePushTokenAsync());
    return (
      await etapaRadar('push.expo-token', () => Notifications.getExpoPushTokenAsync({
        projectId,
        devicePushToken,
      }))
    ).data;
  },

  async clearNotifications(current) {
    diagnosticarRadar('notificacoes.limpar', 'inicio');
    clienteRadarEspera.invalidar();

    const limpezaLocal = await clienteRadarEspera.remover();
    diagnosticarRadar('notificacoes.limpeza-local', limpezaLocal);

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
    diagnosticarRadar('notificacoes.limpar', 'ok');
  },
});
diagnosticarRadar('modulo.android', 'carregado');

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

// Expo Android also emits this event when getDevicePushTokenAsync reads an
// unchanged token. Re-enqueuing reconciliation on every read creates a loop.
// Keep only an in-memory comparison; foreground recovery remains independent.
let ultimoTokenNotificado: string | undefined;
Notifications.addPushTokenListener(token => {
  if (typeof token.data !== 'string' || token.data === ultimoTokenNotificado) return;
  ultimoTokenNotificado = token.data;
  if (AppState.currentState === 'active') {
    void radarRemotoAndroid.reconciliar();
  }
});
