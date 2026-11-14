
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, Linking, Platform, Pressable, Text, View } from 'react-native';
import { HealthToast, HealthNotice, enqueueHealthNotice } from './HealthToast';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { createHealthNotices, gateway } from '../services/gateway';
import { useTema } from '../hooks/useTema';

export const useGateway = () =>
  useSyncExternalStore(
    gateway.subscribe,
    gateway.snapshot,
    gateway.snapshot
  );

export function GatewayMonitor({ ready }: { ready: boolean }) {
  const state = useGateway();
  const [noticesQueue, setNoticesQueue] = useState<HealthNotice[]>([]);
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active'
  );
  const notices = useRef(createHealthNotices());

  useEffect(() => {
    let disposed = false;
    let removeNetwork: (() => void) | undefined;
    let refreshNetwork: (() => void) | undefined;

    void import('expo-network')
      .then(async network => {
        if (disposed) return;

        const apply = (value: {
          isConnected?: boolean;
          isInternetReachable?: boolean;
        }) => {
          if (!disposed) {
            gateway.setOffline(
              value.isConnected === false ||
              value.isInternetReachable === false
            );
          }
        };

        const listener = network.addNetworkStateListener(apply);
        removeNetwork = () => listener.remove();

        refreshNetwork = () => {
          void network
            .getNetworkStateAsync()
            .then(apply)
            .catch(() => {});
        };

        apply(await network.getNetworkStateAsync());
      })
      .catch(() => {
        if (!disposed) void gateway.check(true);
      });

    const timer = setInterval(() => {
      if (AppState.currentState === 'active') {
        void gateway.check();
      }
    }, 60000);

    const listener = AppState.addEventListener('change', value => {
      setForeground(value === 'active');

      if (value === 'active') {
        refreshNetwork?.();
        void gateway.check();
      }
    });

    const online = () => gateway.setOffline(!navigator.onLine);

    if (Platform.OS === 'web') {
      online();
      window.addEventListener('online', online);
      window.addEventListener('offline', online);
    }

    return () => {
      disposed = true;
      removeNetwork?.();
      clearInterval(timer);
      listener.remove();

      if (Platform.OS === 'web') {
        window.removeEventListener('online', online);
        window.removeEventListener('offline', online);
      }
    };
  }, []);

  useEffect(() => {
    if (!ready || !foreground) return;

    const notice = notices.current(state);

    if (notice) {
      setNoticesQueue(queue => enqueueHealthNotice(queue, notice));
    }
  }, [state, foreground, ready]);

  return <HealthToast notice={noticesQueue[0] ?? null} visible={foreground && ready}
    onDismiss={notice => setNoticesQueue(queue => queue.filter(item => item !== notice))} />;
}

export function GatewayFooter() {
  const state = useGateway();
  const { cores } = useTema();

  const isOnline = state.status === 'online';
  const isChecking = state.status === 'checking';

  const connection = isOnline
    ? state.active === 0
      ? 'zrok · Principal'
      : 'ngrok · Reserva'
    : isChecking
      ? 'Verificando conexão'
      : 'Indisponível';

  const iconName: React.ComponentProps<typeof Ionicons>['name'] =
    isOnline
      ? 'wifi'
      : isChecking
        ? 'sync-outline'
        : 'cloud-offline-outline';

  const statusColor = isOnline
    ? '#22C55E'
    : isChecking
      ? cores.textoSecundario
      : '#EF4444';

  return (
    <View
  style={{
    alignItems: 'center',
    marginTop: 10,
    gap: 4,
    paddingBottom: 0,
    marginBottom: 0,
  }}
>
      <Pressable accessibilityRole="link" accessibilityLabel="Abrir GitHub do NoPonto"
        onPress={() => { void Linking.openURL('https://github.com/UVAEstudantes').catch(() => Alert.alert('Não foi possível abrir o GitHub', 'Tente novamente em instantes.')); }}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={24} height={24} viewBox="0 0 24 24" fill={cores.textoSecundario}>
          <Path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.043-1.61-4.043-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.084 1.838 1.237 1.838 1.237 1.07 1.835 2.807 1.305 3.492.998.108-.776.42-1.305.763-1.605-2.665-.305-5.467-1.334-5.467-5.93 0-1.31.468-2.38 1.236-3.22-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.3 1.23A11.52 11.52 0 0112 5.8c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.873.118 3.176.77.84 1.235 1.91 1.235 3.22 0 4.608-2.807 5.625-5.48 5.922.43.372.824 1.102.824 2.222 0 1.606-.015 2.902-.015 3.296 0 .322.216.694.825.576C20.565 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
        </Svg>
      </Pressable>
      <Text
        style={{
          color: cores.textoSecundario,
          fontSize: 10,
          fontWeight: '500',
        }}
      >
        NoPonto™ · Beta (Em Desenvolvimento)
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
        }}
      >
        <Ionicons
          name={iconName}
          size={12}
          color={statusColor}
        />

        <Text
          style={{
            color: isOnline ? statusColor : cores.textoSecundario,
            fontSize: 10,
            fontWeight: '500',
          }}
        >
          Conexão: {connection}
        </Text>
      </View>
    </View>
  );
}
