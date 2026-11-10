import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { ApresentacaoRadarNativa } from './notificacaoRadarNativa';

const probeNativoDisponivel = () => Platform.OS === 'android'
  && (__DEV__ || Constants.expoConfig?.extra?.nativeNotificationProbe === true);

const radarRealProbeDisponivel = () => Platform.OS === 'android'
  && Constants.expoConfig?.extra?.nativeNotificationProbe === true
  && Constants.expoConfig?.android?.package === 'com.guilhermedesales.nononto.nativeprobe';

export async function mostrarNotificacaoNativaTeste(cenario: 'multiple-lines' | 'empty', headsUp = false, traceId = 'sem-id') {
  if (!probeNativoDisponivel()) return false;
  const inicioPermissao = performance.now();
  let permissao = await Notifications.getPermissionsAsync();
  if (!permissao.granted && permissao.canAskAgain) permissao = await Notifications.requestPermissionsAsync();
  console.info(`[RadarNativeProbe:${traceId}] permissao_ms=${(performance.now() - inicioPermissao).toFixed(1)}`);
  if (!permissao.granted) return false;
  const inicioModuloNativo = performance.now();
  const { requireNativeModule } = await import('expo-modules-core');
  console.info(`[RadarNativeProbe:${traceId}] modulo_expo_ms=${(performance.now() - inicioModuloNativo).toFixed(1)}`);
  const inicioChamadaNativa = performance.now();
  await requireNativeModule('RadarNativeNotification').showTestNotification(cenario, headsUp, traceId);
  console.info(`[RadarNativeProbe:${traceId}] chamada_nativa_ms=${(performance.now() - inicioChamadaNativa).toFixed(1)}`);
  return true;
}

export async function limparNotificacoesNativasTeste() {
  if (!probeNativoDisponivel()) return false;
  const { requireNativeModule } = await import('expo-modules-core');
  await requireNativeModule('RadarNativeNotification').clearTestNotifications();
  return true;
}

export async function iniciarNotificacaoRadarNativa(sessionId: string, presentation: ApresentacaoRadarNativa) {
  if (!radarRealProbeDisponivel()) return false;
  const inicioPermissao = performance.now();
  let permissao = await Notifications.getPermissionsAsync();
  if (!permissao.granted && permissao.canAskAgain) permissao = await Notifications.requestPermissionsAsync();
  console.info(`[RadarNativeProbe:${sessionId}] permissao_ms=${(performance.now() - inicioPermissao).toFixed(1)}`);
  if (!permissao.granted) return false;
  const inicioModulo = performance.now();
  const { requireNativeModule } = await import('expo-modules-core');
  console.info(`[RadarNativeProbe:${sessionId}] modulo_expo_ms=${(performance.now() - inicioModulo).toFixed(1)}`);
  const inicioNativo = performance.now();
  await requireNativeModule('RadarNativeNotification').startRadarNotification(sessionId, JSON.stringify(presentation));
  console.info(`[RadarNativeProbe:${sessionId}] chamada_nativa_ms=${(performance.now() - inicioNativo).toFixed(1)}`);
  return true;
}

export async function atualizarNotificacaoRadarNativa(sessionId: string, revision: number, presentation: ApresentacaoRadarNativa) {
  if (!radarRealProbeDisponivel()) return false;
  const { requireNativeModule } = await import('expo-modules-core');
  return requireNativeModule('RadarNativeNotification')
    .updateRadarNotification(sessionId, revision, JSON.stringify(presentation)) as Promise<boolean>;
}

export async function encerrarNotificacaoRadarNativa(sessionId: string) {
  if (!radarRealProbeDisponivel()) return false;
  const { requireNativeModule } = await import('expo-modules-core');
  await requireNativeModule('RadarNativeNotification').stopRadarNotification(sessionId);
  return true;
}

export async function notificacaoRadarNativaAtiva(sessionId: string) {
  if (!radarRealProbeDisponivel()) return false;
  const { requireNativeModule } = await import('expo-modules-core');
  return requireNativeModule('RadarNativeNotification')
    .isRadarNotificationSessionActive(sessionId) as Promise<boolean>;
}
