import NavBar from "@/src/components/NavBar";
import { ProvedorTema } from "@/src/context/ProvedorTema";
import { useTema } from "@/src/hooks/useTema";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import React from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Provider as PaperProvider } from "react-native-paper";
import "../global.css";

const ConteudoLayout = () => {
  const { temaAtual, cores, carregandoTema } = useTema();

  if (carregandoTema) {
    return <View style={{ flex: 1, backgroundColor: cores.fundoApp }} />;
  }

  return (
    <>
      <StatusBar style={temaAtual === "escuro" ? "light" : "dark"} />

      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade_from_bottom",
          animationDuration: 280,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          contentStyle: { backgroundColor: cores.fundoApp },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="favoritos" />
        <Stack.Screen name="linhas" />
        <Stack.Screen name="configuracao" />
      </Stack>

      <NavBar />
    </>
  );
};

const _layout = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ProvedorTema>
        <PaperProvider>
          <ConteudoLayout />
        </PaperProvider>
      </ProvedorTema>
    </GestureHandlerRootView>
  );
};

export default _layout;
