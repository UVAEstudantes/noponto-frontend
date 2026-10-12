import NavBar from "@/src/components/NavBar";
import { ProvedorTema } from "@/src/context/ProvedorTema";
import { useTema } from "@/src/hooks/useTema";
import { StatusBar } from "expo-status-bar";
import { Tabs } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import * as NavigationBar from "expo-navigation-bar";
import SplashVideoOverlay from "@/src/components/startup/SplashVideoOverlay";
import SplashVideoBoundary from "@/src/components/startup/SplashVideoBoundary";
import { StartupContext } from "@/src/components/startup/StartupContext";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Provider as PaperProvider } from "react-native-paper";
import "../global.css";

void SplashScreen.preventAutoHideAsync().catch(() => {});
// Keep the session flag through route remounts and Fast Refresh; no persistence.
const startupSession = globalThis as typeof globalThis & {
  noPontoStartupStarted?: boolean;
};

const ConteudoLayout = () => {
  const { temaAtual, cores, carregandoTema } = useTema();
  const [opening, setOpening] = useState(!startupSession.noPontoStartupStarted);
  const [mapReady, setMapReady] = useState(false);
  const reportMapReady = useCallback(() => setMapReady(true), []);
  const completeOpening = useCallback(() => {
    setOpening(false);
  }, []);
  useEffect(() => {
    startupSession.noPontoStartupStarted = true;
  }, []);
  useEffect(() => {
    if (!opening || Platform.OS !== "android") return;
    NavigationBar.setStyle("dark");
    return () => NavigationBar.setStyle("auto");
  }, [opening]);

  return (
    <View
      style={{ flex: 1, backgroundColor: opening ? "#000000" : cores.fundoApp }}
      onLayout={() => {
        if (!opening) void SplashScreen.hideAsync().catch(() => {});
      }}
    >
      <StatusBar
        hidden={opening}
        style={temaAtual === "escuro" ? "light" : "dark"}
      />
      <StartupContext.Provider value={reportMapReady}>
        {!carregandoTema && (
          <>
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
        )}
      </StartupContext.Provider>
      {opening && (
        <SplashVideoBoundary onComplete={completeOpening}>
          <SplashVideoOverlay
            appReady={mapReady}
            onComplete={completeOpening}
          />
        </SplashVideoBoundary>
      )}
    </View>
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
