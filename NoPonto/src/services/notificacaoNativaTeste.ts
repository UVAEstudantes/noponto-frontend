import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function mostrarNotificacaoNativaTeste(cenario: 'multiple-lines' | 'empty', headsUp = false) {
  if (Platform.OS !== 'android' ||
    (!__DEV__ && Constants.expoConfig?.extra?.nativeNotificationProbe !== true)) return false;
  let permissao = await Notifications.getPermissionsAsync();
  if (!permissao.granted && permissao.canAskAgain) permissao = await Notifications.requestPermissionsAsync();
  if (!permissao.granted) return false;
  const { requireNativeModule } = await import('expo-modules-core');
  await requireNativeModule('RadarNativeNotification').showTestNotification(cenario, headsUp);
  return true;
}

export async function limparNotificacoesNativasTeste() {
  if (Platform.OS !== 'android' ||
    (!__DEV__ && Constants.expoConfig?.extra?.nativeNotificationProbe !== true)) return false;
  const { requireNativeModule } = await import('expo-modules-core');
  await requireNativeModule('RadarNativeNotification').clearTestNotifications();
  return true;
}
