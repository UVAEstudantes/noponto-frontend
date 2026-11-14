import { ALTURA_NAVBAR } from "@/src/constants/navegacao";
import { useTutorial } from "./tutorial/TutorialProvider";
import TutorialTarget from "./tutorial/TutorialTarget";
import { useTema } from "@/src/hooks/useTema";
import { router, usePathname } from "expo-router";
import {
  Bus,
  MapPinned,
  Settings,
  Repeat2,
  UserRound,
  type LucideIcon,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { useMovimentoReduzido } from "@/src/components/demo/InterfaceDemo";
import NavBarIcon from "./NavBarIcon";
import {
  Animated,
  Easing,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

type TabRoute = "/perfil" | "/favoritos" | "/" | "/linhas" | "/configuracao";
type TabItem = { href: TabRoute; label: string; Icon: LucideIcon };
const tabs: TabItem[] = [
  { href: "/perfil", label: "Perfil", Icon: UserRound },
  { href: "/favoritos", label: "Rotinas", Icon: Repeat2 },
  { href: "/", label: "Mapa", Icon: MapPinned },
  { href: "/linhas", label: "Linhas", Icon: Bus },
  { href: "/configuracao", label: "Mais", Icon: Settings },
];
function routeMatches(href: TabRoute, pathname: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}
export function NavBarIndicator({
  width,
  activeIndex,
}: {
  width: number;
  activeIndex: number;
}) {
  const reduced = useMovimentoReduzido();
  const target = ((activeIndex + 0.5) * width) / 5 - 12;
  const x = useRef(new Animated.Value(target)).current;
  const previousWidth = useRef(width);
  useEffect(() => {
    x.stopAnimation();
    if (reduced || previousWidth.current !== width) x.setValue(target);
    else
      Animated.timing(x, {
        toValue: target,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    previousWidth.current = width;
    return () => x.stopAnimation();
  }, [target, width, reduced, x]);
  // Os dois recortes terminam nos ombros da curva; o traço nunca invade o Mapa.
  return (
    <>
      {[
        { left: 0, width: width / 2 - 49 },
        { left: width / 2 + 49, width: width / 2 - 49 },
      ].map((clip) => (
        <View
          key={clip.left}
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 1,
            left: clip.left,
            width: clip.width,
            height: 3,
            overflow: "hidden",
            opacity: activeIndex < 0 ? 0 : 1,
          }}
        >
          <Animated.View
            style={{
              position: "absolute",
              left: -clip.left,
              width: 24,
              height: 3,
              borderRadius: 1.5,
              backgroundColor: "#FFC107",
              transform: [{ translateX: x }],
            }}
          />
        </View>
      ))}
    </>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const [mapFeedback, setMapFeedback] = useState(0);
  const { cores } = useTema();
  const { width } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const tutorial = useTutorial();
  const cx = width / 2;
  const height = ALTURA_NAVBAR + bottom;
  const extra = 14;
  // Raio de 32dp: círculo de 25dp + folga real de 7dp, sem máscara.
  const d = `M 0 ${extra} L ${cx - 49} ${extra} C ${cx - 39} ${extra}, ${cx - 32} 17, ${cx - 32} 33 A 32 32 0 0 0 ${cx + 32} 33 C ${cx + 32} 17, ${cx + 39} ${extra}, ${cx + 49} ${extra} L ${width} ${extra} L ${width} ${height + extra} L 0 ${height + extra} Z`;
  return (
    <View
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height,
        zIndex: 100,
        elevation: 10,
      }}
    >
      <Svg
        width={width}
        height={height + extra}
        pointerEvents="none"
        style={{ position: "absolute", top: -extra }}
      >
        <Path d={d} fill={cores.fundoNav} stroke={cores.bordaNav} />
      </Svg>
      <View style={{ flexDirection: "row", height: ALTURA_NAVBAR }}>
        {tabs.map((tab) => {
          const active = routeMatches(tab.href, pathname);
          const central = tab.href === "/";
          return (
            <TutorialTarget
              key={tab.href}
              kind="line"
              enabled={tab.href === "/linhas" && tutorial.step === "lineTab"}
              style={{ width: width / 5 }}
            >
              <Pressable
                onPress={() => {
                  if (central) setMapFeedback((value) => value + 1);
                  if (!active) router.navigate(tab.href);
                }}
                accessibilityRole="tab"
                accessibilityLabel={`Ir para ${tab.label}`}
                accessibilityState={{ selected: active }}
                android_ripple={{ color: "#80808025", borderless: true }}
                style={{
                  width: width / 5,
                  minHeight: ALTURA_NAVBAR,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                }}
              >
                {central ? (
                  <View
                    style={{
                      position: "absolute",
                      top: -6,
                      width: 50,
                      height: 50,
                      borderRadius: 25,
                      backgroundColor: "#FFC107",
                      alignItems: "center",
                      justifyContent: "center",
                      elevation: 3,
                      shadowColor: "#B48200",
                      shadowOpacity: 0.2,
                      shadowRadius: 3,
                    }}
                  >
                    <NavBarIcon
                      href={tab.href}
                      Icon={tab.Icon}
                      active={active}
                      feedback={mapFeedback}
                    />
                  </View>
                ) : (
                  <NavBarIcon href={tab.href} Icon={tab.Icon} active={active} />
                )}
                {!central && (
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={{
                      marginTop: 0,
                      color: active
                        ? cores.textoPrimario
                        : cores.textoSecundario,
                      fontSize: 11,
                      fontWeight: active ? "800" : "500",
                    }}
                  >
                    {tab.label}
                  </Text>
                )}
              </Pressable>
            </TutorialTarget>
          );
        })}
      </View>
      <NavBarIndicator
        width={width}
        activeIndex={tabs.findIndex((tab) => routeMatches(tab.href, pathname))}
      />
    </View>
  );
}
