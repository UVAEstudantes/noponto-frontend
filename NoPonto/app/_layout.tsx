import NavBar from "@/src/components/NavBar";
import { ProvedorTema } from "@/src/context/ProvedorTema";
import { useTema } from "@/src/hooks/useTema";
import { StatusBar } from "expo-status-bar";
import { Tabs } from "expo-router";
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

      <Tabs
        tabBar={() => null}
        backBehavior="history"
        screenOptions={{
          headerShown: false,
          animation: "fade",
          sceneStyle: { backgroundColor: cores.fundoApp },
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="favoritos" />
        <Tabs.Screen name="linhas" />
        <Tabs.Screen name="configuracao" />
      </Tabs>

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
