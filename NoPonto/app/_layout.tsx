import NavBar from "@/src/components/NavBar";
import { Stack } from "expo-router";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Provider as PaperProvider } from "react-native-paper";
import "../global.css";

const _layout = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider>
        <>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="favoritos" />
            <Stack.Screen name="linhas" />
            <Stack.Screen name="configuracao" />
          </Stack>

          <NavBar />
        </>
      </PaperProvider>
    </GestureHandlerRootView>
  );
};

export default _layout;
