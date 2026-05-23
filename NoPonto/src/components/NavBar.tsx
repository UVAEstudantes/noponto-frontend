import { useTema } from "@/src/hooks/useTema";
import { Link, usePathname } from "expo-router";
import {
  Bus,
  LucideIcon,
  MapPinned,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  Star,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

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

// ── Tab individual ──
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
    opacity: interpolate(
      bumpProgress.value,
      [0, 0.4, 1],
      [1, 0.1, 0],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        translateY: interpolate(
          bumpProgress.value,
          [0, 1],
          [0, -6],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      bumpProgress.value,
      [0, 0.5, 1],
      [0.55, 0.1, 0],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <Link href={tab.href} replace asChild>
      <Pressable
        style={{
          width: tabWidth,
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
        }}
      >
        <Animated.View style={iconStyle}>
          <tab.Icon
            color={cores.iconeSecundario}
            size={20}
            strokeWidth={2.1}
          />
        </Animated.View>
        <Animated.Text
          style={[
            labelStyle,
            { fontSize: 10, color: cores.textoSecundario },
          ]}
        >
          {tab.label}
        </Animated.Text>
      </Pressable>
    </Link>
  );
}

function SphereIcon({ tab }: { tab: TabItem }) {
  return <tab.Icon color="#FFFFFF" size={22} strokeWidth={2.4} />;
}

// ── SVG navbar com recorte côncavo animado ──
const AnimatedPath = Animated.createAnimatedComponent(Path);

function NavShape({
  width,
  height,
  notchCX,
  notchR,
  br,
  fill,
}: {
  width: number;
  height: number;
  notchCX: ReturnType<typeof useSharedValue<number>>;
  notchR: number; // raio do recorte
  br: number;     // border radius da navbar
  fill: string;
}) {
  // O SVG tem altura extra no topo para acomodar o recorte
  const extra = notchR * 0.55;
  const svgH = height + extra;

  const animatedProps = useAnimatedProps(() => {
    const cx = notchCX.value;
    const r = notchR;
    // Ponto onde o recorte começa/termina na linha do topo
    // Usamos um arco SVG: dois pontos na borda superior, curva para baixo
    const arcSpread = r * 1.25;
    const arcDepth = r * 0.55; // quanto afunda

    const x1 = cx - arcSpread;
    const x2 = cx + arcSpread;
    // raio do arco SVG (maior = curva mais suave)
    const arcR = r * 1.15;

    const d = [
      // começa canto superior esquerdo
      `M ${br} ${extra}`,
      // linha até início do recorte
      `L ${x1} ${extra}`,
      // arco côncavo para baixo
      `A ${arcR} ${arcR} 0 0 0 ${x2} ${extra}`,
      // linha até canto superior direito
      `L ${width - br} ${extra}`,
      // canto superior direito
      `Q ${width} ${extra} ${width} ${extra + br}`,
      // lado direito
      `L ${width} ${svgH - br}`,
      // canto inferior direito
      `Q ${width} ${svgH} ${width - br} ${svgH}`,
      // base
      `L ${br} ${svgH}`,
      // canto inferior esquerdo
      `Q 0 ${svgH} 0 ${svgH - br}`,
      // lado esquerdo
      `L 0 ${extra + br}`,
      // canto superior esquerdo
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
      <AnimatedPath animatedProps={animatedProps} fill={fill} />
    </Svg>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const { cores } = useTema();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [collapsed, setCollapsed] = useState(false);

  const activeIndex = tabs.findIndex((t) => routeMatches(t.href, pathname));
  const safeIndex = activeIndex === -1 ? 0 : activeIndex;
  const activeTab = tabs[safeIndex] as TabItem;

  const collapsedSize = 62;
  const expandedWidth = Math.min(screenWidth - 32, 560);
  const navHeight = 64;
  const toggleSize = 46;
  const horizontalPadding = 8;
  const openRight = Math.max((screenWidth - expandedWidth) / 2, 16);
  const bottomOffset = Math.max(insets.bottom + 8, 24);

  const sphereSize = 50;
  const sphereR = sphereSize / 2;
  // esfera fica com metade dentro da navbar
  const sphereOverlap = sphereR * 1;
  const sphereBottom = bottomOffset + navHeight - sphereOverlap;

  const tabsAreaWidth = Math.max(
    expandedWidth - toggleSize - horizontalPadding * 3,
    200
  );
  const tabWidth = tabsAreaWidth / tabs.length;

  // Centro X do tab ativo (relativo à tela, da direita)
  // notchCX precisa ser relativo ao SVG (que tem width = expandedWidth, left = openRight da direita)
  const getNotchCX = (index: number) =>
    horizontalPadding + index * tabWidth + tabWidth / 2;

  const getSphereLeft = (index: number) =>
    screenWidth -
    openRight -
    expandedWidth +
    horizontalPadding +
    index * tabWidth +
    tabWidth / 2 -
    sphereR;

  const notchCX = useSharedValue(getNotchCX(safeIndex));
  const sphereX = useSharedValue(getSphereLeft(safeIndex));

  const prevIndex = useRef(safeIndex);
  const openProgress = useSharedValue(1);
  const toggleScale = useSharedValue(1);

  const bump0 = useSharedValue(safeIndex === 0 ? 1 : 0);
  const bump1 = useSharedValue(safeIndex === 1 ? 1 : 0);
  const bump2 = useSharedValue(safeIndex === 2 ? 1 : 0);
  const bump3 = useSharedValue(safeIndex === 3 ? 1 : 0);
  const bumpValues = [bump0, bump1, bump2, bump3];

  const springConfig = { damping: 18, stiffness: 200, mass: 0.85 };
  const bumpConfig = { damping: 22, stiffness: 320, mass: 0.6 };

  useEffect(() => {
    const prev = prevIndex.current;
    if (prev === safeIndex) return;

    cancelAnimation(bumpValues[prev]);
    cancelAnimation(bumpValues[safeIndex]);
    cancelAnimation(sphereX);
    cancelAnimation(notchCX);

    bumpValues[prev].value = withSpring(0, bumpConfig);
    bumpValues[safeIndex].value = withSpring(1, bumpConfig);
    sphereX.value = withSpring(getSphereLeft(safeIndex), springConfig);
    notchCX.value = withSpring(getNotchCX(safeIndex), springConfig);

    prevIndex.current = safeIndex;
  }, [safeIndex]);

  useEffect(() => {
    openProgress.value = withSpring(collapsed ? 0 : 1, {
      damping: 18,
      stiffness: 230,
      mass: 0.9,
    });
  }, [collapsed]);

  const containerAnimatedStyle = useAnimatedStyle(() => {
    const width = interpolate(
      openProgress.value,
      [0, 1],
      [collapsedSize, expandedWidth],
      Extrapolation.CLAMP
    );
    const borderRadius = interpolate(
      openProgress.value,
      [0, 1],
      [collapsedSize / 2, 28],
      Extrapolation.CLAMP
    );
    return {
      width,
      height: navHeight,
      borderRadius,
      right: interpolate(openProgress.value, [0, 1], [16, openRight]),
    };
  });

  const tabsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: openProgress.value,
    transform: [
      { translateX: interpolate(openProgress.value, [0, 1], [18, 0]) },
      { scale: interpolate(openProgress.value, [0, 1], [0.95, 1]) },
    ],
  }));

  const toggleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: toggleScale.value }],
  }));

  const sphereAnimatedStyle = useAnimatedStyle(() => ({
    left: sphereX.value,
  }));

  const toggleNav = () => setCollapsed((prev) => !prev);

  return (
    <>
      {/* ── Esfera flutuante ── */}
      <Animated.View
        pointerEvents="none"
        style={[
          sphereAnimatedStyle,
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
      <Animated.View
        style={[
          containerAnimatedStyle,
          {
            position: "absolute",
            bottom: bottomOffset,
            overflow: "visible",
            zIndex: 100,
          },
        ]}
      >
        {/* SVG com recorte côncavo */}
        <NavShape
          width={expandedWidth}
          height={navHeight}
          notchCX={notchCX}
          notchR={sphereR + 1}
          br={28}
          fill={cores.fundoNav}
        />

        {/* Sombra separada (view opaca atrás) */}
        <Animated.View
          pointerEvents="none"
          style={[
            useAnimatedStyle(() => ({
              width: interpolate(
                openProgress.value,
                [0, 1],
                [collapsedSize, expandedWidth],
                Extrapolation.CLAMP
              ),
              borderRadius: interpolate(
                openProgress.value,
                [0, 1],
                [collapsedSize / 2, 28],
                Extrapolation.CLAMP
              ),
            })),
            {
              position: "absolute",
              top: 0,
              left: 0,
              height: navHeight,
              shadowColor: cores.sombra,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 16,
              elevation: 10,
              backgroundColor: "transparent",
              zIndex: -1,
            },
          ]}
        />

        {/* Tabs */}
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: horizontalPadding,
            },
            tabsAnimatedStyle,
          ]}
          pointerEvents={collapsed ? "none" : "auto"}
        >
          <View
            style={{
              width: tabsAreaWidth,
              flexDirection: "row",
              alignItems: "center",
              height: "100%",
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
        </Animated.View>

        {/* Botão colapsar */}
        <Pressable
          style={{
            position: "absolute",
            right: 8,
            top: (navHeight - toggleSize) / 2,
            height: toggleSize,
            width: toggleSize,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: toggleSize / 2,
            zIndex: 5,
          }}
          onPress={toggleNav}
          onPressIn={() => {
            toggleScale.value = withTiming(0.92, { duration: 90 });
          }}
          onPressOut={() => {
            toggleScale.value = withTiming(1, { duration: 130 });
          }}
        >
          <Animated.View style={toggleAnimatedStyle}>
            {collapsed ? (
              <PanelRightOpen color={cores.iconePrimario} size={22} />
            ) : (
              <PanelRightClose color={cores.iconeSecundario} size={22} />
            )}
          </Animated.View>
        </Pressable>
      </Animated.View>
    </>
  );
}