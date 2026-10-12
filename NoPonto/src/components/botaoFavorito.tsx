import React, { useEffect, useRef } from "react";
import { Pressable } from "react-native";
import { Star } from "lucide-react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useTema } from "@/src/hooks/useTema";

export default function BotaoFavorito({ favorita, disabled = false, nome, onPress }: {
  favorita: boolean; disabled?: boolean; nome: string; onPress: () => void;
}) {
  const { cores } = useTema();
  const escala = useSharedValue(1);
  const anterior = useRef(favorita);
  useEffect(() => {
    if (anterior.current !== favorita) {
      escala.value = withSequence(withTiming(1.12, { duration: 90 }), withTiming(1, { duration: 140 }));
      anterior.current = favorita;
    }
  }, [favorita, escala]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }));
  return <Pressable onPress={(event) => { event.stopPropagation(); onPress(); }} onPressIn={(event) => event.stopPropagation()} onPressOut={(event) => event.stopPropagation()}
    onLongPress={(event) => event.stopPropagation()} disabled={disabled} accessibilityRole="button"
    accessibilityLabel={`${favorita ? "Desfavoritar" : "Favoritar"} ${nome}`}
    accessibilityState={{ selected: favorita, disabled }}
    style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.5 : 1 }}>
    <Animated.View style={style}>
      <Star size={22} color={favorita ? cores.iconePrimario : cores.iconeSecundario}
        fill={favorita ? cores.iconePrimario : "transparent"} />
    </Animated.View>
  </Pressable>;
}
