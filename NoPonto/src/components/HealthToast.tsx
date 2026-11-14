import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  WifiOff,
  ServerOff,
  Bus,
  BusFront,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import { Portal } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTema } from '../hooks/useTema';

export type HealthNotice = { key: string; message: string };
const priority = (notice: HealthNotice) =>
  ['offline', 'unavailable'].includes(notice.key) ? 3 : notice.key === 'dependencies' ? 2 : notice.key === 'reserve' ? 0 : 1;

export function enqueueHealthNotice(queue: HealthNotice[], notice: HealthNotice) {
  if (queue.some(item => item.key === notice.key)) return queue;
  const waiting = queue.length && priority(notice) > priority(queue[0]) ? queue.slice(1) : queue;
  return [...waiting, notice].sort((a, b) => priority(b) - priority(a));
}

export function healthToastPresentation(key: string, dark: boolean) {
  const color = ['offline', 'unavailable', 'dependencies'].includes(key)
    ? dark ? '#F5938C' : '#BF4545' : dark ? '#FFC107' : '#906800';
  switch (key) {
    case 'offline': return { title: 'Sem internet', description: 'Verifique sua rede para receber atualizações.', icon: 'wifi-off', color };
    case 'unavailable': return { title: 'Conexão indisponível', description: 'Não foi possível conectar ao NoPonto. Tente novamente em instantes.', icon: 'server-network-off', color };
    case 'dependencies': return { title: 'Serviço temporariamente indisponível', description: 'Alguns serviços do NoPonto estão indisponíveis. Tente novamente em instantes.', icon: 'server-network-off', color };
    case 'sppo': return { title: 'Atualizações de ônibus indisponíveis', description: 'As posições dos ônibus podem estar desatualizadas.', icon: 'bus', color };
    case 'brt': return { title: 'Atualizações do BRT indisponíveis', description: 'As posições do BRT podem estar desatualizadas.', icon: 'bus-articulated-front', color };
    default: return { title: 'Conexão alternativa ativada', description: 'Você pode continuar usando o NoPonto.', icon: 'shield-check-outline', color };
  }
}

export function HealthToast({ notice, visible, onDismiss }: {
  notice: HealthNotice | null; visible: boolean; onDismiss: (notice: HealthNotice) => void;
}) {
  const { cores, temaAtual } = useTema();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<HealthNotice | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const current = useRef<HealthNotice | null>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; listener.remove(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const target = visible ? notice : null;
    const animate = (toValue: number, duration: number, complete: () => void) => {
      Animated.timing(progress, { toValue, duration: reduceMotion ? 0 : duration,
        easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished && !cancelled) complete();
      });
    };
    const enter = () => {
      current.current = target;
      setShown(target);
      if (target) animate(1, 300, () => {
        timer = setTimeout(() => dismiss.current(target), 8000);
      });
    };
    // Cleanup invalidates old callbacks so a newer notice survives interrupted transitions.
    if (current.current) animate(0, 240, enter);
    else enter();
    return () => { cancelled = true; clearTimeout(timer); progress.stopAnimation(); };
  }, [notice, visible, reduceMotion, progress]);

  if (!shown) return null;
  const presentation = healthToastPresentation(shown.key, temaAtual === 'escuro');
  
  const NoticeIcon =
  shown.key === 'offline'
    ? WifiOff
    : shown.key === 'unavailable' || shown.key === 'dependencies'
      ? ServerOff
      : shown.key === 'sppo'
        ? Bus
        : shown.key === 'brt'
          ? BusFront
          : ShieldCheck;

  return <Portal>
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 24 }]}>
      <Animated.View pointerEvents={visible && notice === shown ? 'auto' : 'none'}
        accessibilityLiveRegion="polite" accessibilityRole="alert"
        style={[styles.card, { top: insets.top + 12, left: Math.max(insets.left, 16), right: Math.max(insets.right, 16),
          backgroundColor: cores.fundoCard, borderColor: cores.bordaSuave,
          opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] }]}>
        <View style={[styles.icon, { backgroundColor: `${presentation.color}18` }]}>
          <NoticeIcon
  size={23}
  color={presentation.color}
  strokeWidth={2}
/>
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: cores.textoPrimario }]}>{presentation.title}</Text>
          <Text style={[styles.description, { color: temaAtual === 'escuro' ? cores.textoSecundario : '#5D646D' }]}>{presentation.description}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar aviso" hitSlop={4}
          onPress={() => dismiss.current(shown)}
          style={({ pressed }) => [styles.close, { backgroundColor: cores.fundoSecundario, opacity: pressed ? 0.6 : 1 }]}>
          <X
  size={18}
  color={cores.textoSecundario}
  strokeWidth={2}
/>
        </Pressable>
      </Animated.View>
    </View>
  </Portal>;
}

const styles = StyleSheet.create({
  card: { position: 'absolute', alignSelf: 'center', maxWidth: 560, borderRadius: 18, borderWidth: 1,
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.13, shadowRadius: 12, elevation: 7 },
  icon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 4 },
  title: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  description: { fontSize: 12, lineHeight: 17 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
