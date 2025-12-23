import { Stack } from "expo-router";
import React from "react";
import NavBar from "@/src/components/NavBar";
import "../global.css";
import { Provider as PaperProvider } from "react-native-paper";

const _layout = () => {
  return (
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
  );
};

export default _layout;
