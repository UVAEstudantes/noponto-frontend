import { Link, usePathname } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import {
  Bus,
  MapPinned,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  Star,
  LucideIcon,
} from "lucide-react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type TabRoute = "/favoritos" | "/linhas" | "/" | "/configuracao";

type TabItem = {
  href: TabRoute;
  label: string;
  Icon: LucideIcon;
};

const tabs: TabItem[] = [
  { href: "/favoritos", label: "Favoritos", Icon: Star },
  { href: "/linhas", label: "Linhas", Icon: Bus },
  { href: "/", label: "Mapa", Icon: MapPinned },
  { href: "/configuracao", label: "Mais", Icon: Settings },
];

const colors = {
  customYellow: "#FFC107",
  customBlack: "#1E1E1E",
  customGray: "#F2F4F7",
};

function routeMatches(href: TabRoute, pathname: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavBar() {
  const pathname = usePathname();
  const { width: screenWidth } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState(false);

  const openProgress = useSharedValue(1);
  const toggleScale = useSharedValue(1);

  const collapsedSize = 62;
  const expandedWidth = Math.min(screenWidth - 32, 560);
  const navHeight = 64;
  const toggleSize = 46;
  const horizontalPadding = 8;
  const openRight = Math.max((screenWidth - expandedWidth) / 2, 16);

  const tabsAreaWidth = Math.max(
    expandedWidth - toggleSize - horizontalPadding * 3,
    200,
  );
  const tabWidth = tabsAreaWidth / tabs.length;

  useEffect(() => {
    openProgress.value = withSpring(collapsed ? 0 : 1, {
      damping: 18,
      stiffness: 230,
      mass: 0.9,
    });
  }, [collapsed, openProgress]);

  const containerAnimatedStyle = useAnimatedStyle(() => {
    const width = interpolate(
      openProgress.value,
      [0, 1],
      [collapsedSize, expandedWidth],
      Extrapolation.CLAMP,
    );

    const borderRadius = interpolate(
      openProgress.value,
      [0, 1],
      [collapsedSize / 2, 28],
      Extrapolation.CLAMP,
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
      {
        translateX: interpolate(openProgress.value, [0, 1], [18, 0]),
      },
      {
        scale: interpolate(openProgress.value, [0, 1], [0.95, 1]),
      },
    ],
  }));

  const toggleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: toggleScale.value }],
  }));

  const toggleNav = () => setCollapsed((prev) => !prev);

  return (
    <Animated.View
      className="absolute bottom-6 overflow-hidden bg-customBlack shadow-sm"
      style={containerAnimatedStyle}
    >
      <Animated.View
        className="h-full flex-row items-center pl-2"
        style={tabsAnimatedStyle}
        pointerEvents={collapsed ? "none" : "auto"}
      >
        <View
          className="h-12 flex-row items-center rounded-2xl"
          style={{ width: tabsAreaWidth }}
        >
          {tabs.map((tab) => {
            const active = routeMatches(tab.href, pathname);

            return (
              <Link href={tab.href} replace asChild key={tab.href}>
                <Pressable
                  className="h-10 items-center justify-center"
                  style={{ width: tabWidth }}
                >
                  <tab.Icon
                    color={active ? colors.customYellow : colors.customGray}
                    size={20}
                    strokeWidth={active ? 2.4 : 2.1}
                  />
                  <Text
                    className={
                      "pt-0.5 text-[11px] " +
                      (active ? "text-customYellow" : "text-customGray")
                    }
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              </Link>
            );
          })}
        </View>
      </Animated.View>

      <Pressable
        className="absolute right-2 top-2 h-[46px] w-[46px] items-center justify-center rounded-full"
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
            <PanelRightOpen color={colors.customYellow} size={22} />
          ) : (
            <PanelRightClose color={colors.customGray} size={22} />
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
