import React, { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { type LucideIcon } from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import { useMovimentoReduzido } from "./demo/InterfaceDemo";

type Props = {
  href: string;
  Icon: LucideIcon;
  active: boolean;
  feedback?: number;
};

function FilledIcon({ href, surface }: { href: string; surface: string }) {
  return (
    <Svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="#FFC107"
      stroke="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {href === "/perfil" ? (
        <>
          <Circle cx={12} cy={8} r={6} />
          <Path d="M3 22v-1a9 6 0 0 1 18 0v1Z" />
        </>
      ) : href === "/favoritos" ? (
        <>
          <Path d="m1 9 4-4 4 4H6v7a1 1 0 0 0 1 1h6v2H7a3 3 0 0 1-3-3V9Z" />
          <Path d="m23 15-4 4-4-4h3V8a1 1 0 0 0-1-1h-6V5h6a3 3 0 0 1 3 3v7Z" />
        </>
      ) : href === "/linhas" ? (
        <>
          <Path d="M1 19V8a3 3 0 0 1 3-3h14a4 4 0 0 1 3.4 2.5l1.4 5a6 6 0 0 1 0 3L22 19Z" />
          <Path
            d="M3.5 8h3v3h-3Zm5 0h5v3h-5Zm7 0h3l.9 3h-3.9Z"
            fill={surface}
            stroke="none"
          />
          <Circle cx={7} cy={18} r={3} />
          <Circle cx={16} cy={18} r={3} />
          <Circle cx={7} cy={18} r={0.8} fill={surface} />
          <Circle cx={16} cy={18} r={0.8} fill={surface} />
        </>
      ) : (
        <G transform="translate(-1.2 -1.2) scale(1.1)">
          <Path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915Z" />
          <Circle cx={12} cy={12} r={3} fill={surface} />
        </G>
      )}
    </Svg>
  );
}

export default function NavBarIcon({
  href,
  Icon,
  active,
  feedback = 0,
}: Props) {
  const { cores } = useTema();
  const reduced = useMovimentoReduzido();
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  const pinY = useRef(new Animated.Value(0)).current;
  const central = href === "/";

  useEffect(() => {
    progress.stopAnimation();
    if (reduced) progress.setValue(active ? 1 : 0);
    else
      Animated.timing(progress, {
        toValue: active ? 1 : 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    return () => progress.stopAnimation();
  }, [active, progress, reduced]);

  useEffect(() => {
    pinY.stopAnimation();
    pinY.setValue(0);
    if (!central || !active || reduced) return;
    const animation = Animated.sequence([
      Animated.timing(pinY, {
        toValue: -3.5,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pinY, {
        toValue: 0,
        duration: 110,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => {
      animation.stop();
      pinY.setValue(0);
    };
  }, [active, central, feedback, pinY, reduced]);

  if (central)
    return (
      <Animated.View
        pointerEvents="none"
        style={{ width: 26, height: 26, transform: [{ translateY: pinY }] }}
      >
        <Icon size={26} strokeWidth={2} color="#302600" />
        <Animated.View style={{ position: "absolute", opacity: progress }}>
          <Svg width={26} height={26} viewBox="0 0 24 24">
            <Path
              d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0Z"
              fill="#302600"
            />
            <Circle cx={12} cy={8} r={2} fill="#FFC107" />
          </Svg>
        </Animated.View>
      </Animated.View>
    );

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        width: 22,
        height: 22,
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
          }),
        }}
      >
        <Icon size={22} strokeWidth={2} color={cores.iconeSecundario} />
      </Animated.View>
      <Animated.View style={{ position: "absolute", opacity: progress }}>
        <FilledIcon href={href} surface={cores.fundoNav} />
      </Animated.View>
    </Animated.View>
  );
}
