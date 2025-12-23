import { Link, usePathname } from "expo-router";
import { Pressable, View, Text, Animated, Easing } from "react-native";
import React, { useEffect, useRef } from "react";
import {
  Bus,
  MapPinned,
  PanelRightClose,
  Settings,
  Star,
} from "lucide-react-native";

export default function NavBar() {
  const pathname = usePathname();

  const colors = {
    customYellow: "#FFC107",
    customBlack: "#1E1E1E",
    customGray: "#F2F4F7",
  };

  return (
    <View className="absolute bottom-6 left-0 right-0 flex-row justify-around items-center mx-4 p-4 rounded-3xl shadow-sm bg-customBlack">
      {/*btn favorito*/}
      <Link href="/favoritos" asChild>
        <Pressable className="items-center">
          <Star
            color={
              pathname === "/favoritos"
                ? colors.customYellow
                : colors.customGray
            }
            size={32}
          />
          <Text
            className={
              "pt-1 " +
              (pathname === "/favoritos"
                ? "text-customYellow"
                : "text-customGray")
            }
          >
            Favoritos
          </Text>
        </Pressable>
      </Link>

      {/*btn linhas*/}
      <Link href="/linhas" asChild>
        <Pressable className="items-center">
          <Bus
            color={
              pathname === "/linhas" ? colors.customYellow : colors.customGray
            }
            size={32}
          />
          <Text
            className={
              "pt-1 " +
              (pathname === "/linhas" ? "text-customYellow" : "text-customGray")
            }
          >
            Linhas
          </Text>
        </Pressable>
      </Link>

      {/*btn mapa*/}
      <Link href="/" asChild>
        <Pressable className="items-center">
          <MapPinned
            color={pathname === "/" ? colors.customYellow : colors.customGray}
            size={32}
          />
          <Text
            className={
              "pt-1 " +
              (pathname === "/" ? "text-customYellow" : "text-customGray")
            }
          >
            Mapa
          </Text>
        </Pressable>
      </Link>

      {/*btn config*/}
      <Link href="/configuracao" asChild>
        <Pressable className="items-center">
          <Settings
            color={
              pathname === "/configuracao"
                ? colors.customYellow
                : colors.customGray
            }
            size={32}
          />
          <Text
            className={
              "pt-1 " +
              (pathname === "/configuracao"
                ? "text-customYellow"
                : "text-customGray")
            }
          >
            Mais
          </Text>
        </Pressable>
      </Link>
      {/* se for ter um btn pra esconder a navBar
            <Pressable className ="items-center">
                <PanelRightClose  color={colors.customGray} size={32} />
                <Text className="pt-1 text-customGray">Fechar</Text> 
            </Pressable>
            */}
    </View>
  );
}
