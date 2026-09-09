import { useTema } from "@/src/hooks/useTema";
import { router, usePathname } from "expo-router";
import {
  Bus,
  LucideIcon,
  MapPinned,
  Settings,
  Star,
} from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Text } from "react-native";

type TabRoute = "/favoritos" | "/linhas" | "/" | "/configuracao";
type TabItem = { href: TabRoute; label: string; Icon: LucideIcon };

const tabs: TabItem[] = [
  { href: "/favoritos", label: "Favoritos", Icon: Star },
  { href: "/linhas", label: "Linhas", Icon: Bus },
  { href: "/", label: "Mapa", Icon: MapPinned },
  { href: "/configuracao", label: "Mais", Icon: Settings },
];

function routeMatches(href: TabRoute, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TabButton({
  tab,
  isActive,
  tabWidth,
  bumpProgress,
  cores,
}: {
  tab: TabItem;
  isActive: boolean;
  tabWidth: number;
  bumpProgress: ReturnType<typeof useSharedValue<number>>;
  cores: any;
}) {
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bumpProgress.value, [0, 0.4, 1], [1, 0.1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(bumpProgress.value, [0, 1], [0, -6], Extrapolation.CLAMP) },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bumpProgress.value, [0, 0.5, 1], [0.55, 0.1, 0], Extrapolation.CLAMP),
  }));

  const handlePress = () => {
    if (!isActive) router.replace(tab.href);
  };

  return (
      <Pressable
        onPress={handlePress}
        accessibilityRole="tab"
        accessibilityLabel={`Ir para ${tab.label}`}
        accessibilityState={{ selected: isActive }}
        style={{ width: tabWidth, height: "100%", alignItems: "center", justifyContent: "center", gap: 3 }}
      >
        <Animated.View style={iconStyle}>
          <tab.Icon color={cores.iconeSecundario} size={20} strokeWidth={2.1} />
        </Animated.View>
        <Animated.Text style={[labelStyle, { fontSize: 10, color: cores.textoSecundario }]}>
          {tab.label}
        </Animated.Text>
      </Pressable>
  );
}

function SphereIcon({ tab }: { tab: TabItem }) {
  return <tab.Icon color="#FFFFFF" size={22} strokeWidth={2.4} />;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

function NavShape({
  width,
  height,
  notchCX,
  notchR,
  br,
  fill,
  cores,
}: {
  width: number;
  height: number;
  notchCX: ReturnType<typeof useSharedValue<number>>;
  notchR: number;
  br: number;
  fill: string;
  cores: string;
}) {
  const extra = notchR * 0.55;
  const svgH = height + extra;

const animatedProps = useAnimatedProps(() => {
  const cx = notchCX.value;
  const r = notchR;

  const arcSpread = r * 2.2;
  const arcDepth = r * 1.5;

  const x1 = cx - arcSpread;
  const x2 = cx + arcSpread;

  // quanto as "orelhas" ficam arredondadas
  const shoulder = arcSpread * 0.5;

  const d = [
    `M ${br} ${extra}`,
    `L ${x1} ${extra}`,
    // entrada suave: linha desce enquanto avança horizontalmente
    `C ${x1 + shoulder} ${extra}, ${cx - arcSpread * 0.6} ${extra + arcDepth}, ${cx} ${extra + arcDepth}`,
    // saída suave: sobe de volta
    `C ${cx + arcSpread * 0.6} ${extra + arcDepth}, ${x2 - shoulder} ${extra}, ${x2} ${extra}`,
    `L ${width - br} ${extra}`,
    `Q ${width} ${extra} ${width} ${extra + br}`,
    `L ${width} ${svgH - br}`,
    `Q ${width} ${svgH} ${width - br} ${svgH}`,
    `L ${br} ${svgH}`,
    `Q 0 ${svgH} 0 ${svgH - br}`,
    `L 0 ${extra + br}`,
    `Q 0 ${extra} ${br} ${extra}`,
    `Z`,
  ].join(" ");

  return { d };
});

  return (
    <Svg
      width={width}
      height={svgH}
      style={{ position: "absolute", top: -extra, left: 0 }}
      pointerEvents="none"
    >
      <AnimatedPath
        animatedProps={animatedProps}
        fill={fill}
        stroke={cores}
        strokeWidth={1}
      />
    </Svg>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const { cores } = useTema();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const activeIndex = tabs.findIndex((t) => routeMatches(t.href, pathname));
  const safeIndex = activeIndex === -1 ? 0 : activeIndex;
  const activeTab = tabs[safeIndex] as TabItem;

  const expandedWidth = screenWidth + 3;
  const navHeight = 54;
  const horizontalPadding = 16;
  const bottomOffset = - 2;

  const sphereSize = 50;
  const sphereR = sphereSize / 2;
  const sphereOverlap = sphereR * 0.7 ;
  const clampedInset = Math.min(Math.max(insets.bottom, 0), 60);
  const insetOffset = clampedInset * (clampedInset < 25 ? 0 : 0.65);
  const sphereBottom = navHeight + insetOffset - sphereOverlap;

  const tabWidth = (expandedWidth - horizontalPadding * 2) / tabs.length;

  const getNotchCX = (index: number) =>
    horizontalPadding + index * tabWidth + tabWidth / 2;

  const getSphereLeft = (index: number) =>
    getNotchCX(index) - sphereR;

  const notchCX = useSharedValue(getNotchCX(safeIndex));
  const sphereX = useSharedValue(getSphereLeft(safeIndex));

  const prevIndex = useRef(safeIndex);

  const bump0 = useSharedValue(safeIndex === 0 ? 1 : 0);
  const bump1 = useSharedValue(safeIndex === 1 ? 1 : 0);
  const bump2 = useSharedValue(safeIndex === 2 ? 1 : 0);
  const bump3 = useSharedValue(safeIndex === 3 ? 1 : 0);
  const bumpValues = [bump0, bump1, bump2, bump3];

  const springCfg = { damping: 18, stiffness: 200, mass: 0.85 };
  const bumpCfg   = { damping: 22, stiffness: 320, mass: 0.6  };

  useEffect(() => {
    const prev = prevIndex.current;
    if (prev === safeIndex) return;

    cancelAnimation(bumpValues[prev]);
    cancelAnimation(bumpValues[safeIndex]);
    cancelAnimation(sphereX);
    cancelAnimation(notchCX);

    bumpValues[prev].value      = withSpring(0, bumpCfg);
    bumpValues[safeIndex].value = withSpring(1, bumpCfg);
    sphereX.value               = withSpring(getSphereLeft(safeIndex), springCfg);
    notchCX.value               = withSpring(getNotchCX(safeIndex), springCfg);

    prevIndex.current = safeIndex;
  }, [safeIndex]);

  const sphereStyle = useAnimatedStyle(() => ({ left: sphereX.value }));

  return (
    <>
      {/* ── Esfera ── */}
      <Animated.View
        pointerEvents="none"
        style={[
          sphereStyle,
          {
            position: "absolute",
            bottom: sphereBottom,
            width: sphereSize,
            height: sphereSize,
            borderRadius: sphereR,
            backgroundColor: cores.fundoPrimario,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: cores.fundoPrimario,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.45,
            shadowRadius: 10,
            elevation: 16,
            zIndex: 101,
          },
        ]}
      >
        <SphereIcon tab={activeTab} />
      </Animated.View>

      {/* ── Navbar ── */}
      <View
        style={{
          position: "absolute",
          bottom: bottomOffset,
          left: 0,
          right: 0,
          height: navHeight + insets.bottom,
          overflow: "visible",
          zIndex: 100,
          shadowColor: cores.sombra,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 10,
        }}
      >
        <NavShape
          width={expandedWidth}
          height={navHeight + insets.bottom}
          notchCX={notchCX}
          notchR={sphereR + 1}
          br={0}
          fill={cores.fundoNav}
          cores={cores.bordaNav}
        />

        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: navHeight,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: horizontalPadding,
          }}
        >
          {tabs.map((tab, index) => (
            <TabButton
              key={tab.href}
              tab={tab}
              isActive={index === safeIndex}
              tabWidth={tabWidth}
              bumpProgress={bumpValues[index]}
              cores={cores}
            />
          ))}
        </View>
      </View>
    </>
  );
}