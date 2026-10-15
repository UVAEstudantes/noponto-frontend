import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import SplashVideoOverlay from "./SplashVideoOverlay";
import StartupLogo from "./StartupLogo";
import { startupLog } from "./startupDiagnostics";
import { useStartupTransition } from "./useStartupTransition";

type Props = { animated: boolean; appReady: boolean; onComplete: () => void };

function hideNative() {
  void SplashScreen.hideAsync()
    .then(() => startupLog("splash.hidden"))
    .catch((error) => startupLog("splash.hideError", String(error)));
}

function StaticOverlay({ appReady, onComplete }: Omit<Props, "animated">) {
  const opacity = useStartupTransition(true, appReady, onComplete);
  useEffect(() => startupLog("overlay.mounted", { mode: "static" }), []);
  return (
    <Animated.View
      style={[styles.overlay, { opacity }]}
      accessibilityViewIsModal
      onLayout={hideNative}
    >
      <StartupLogo />
    </Animated.View>
  );
}

export default function StartupOverlay(props: Props) {
  // Snapshot for this opening; settings changes apply to the next session.
  const [animated] = useState(props.animated);
  useEffect(() => startupLog("mode.selected", { animated }), [animated]);
  return animated ? (
    <SplashVideoOverlay
      appReady={props.appReady}
      onComplete={props.onComplete}
    />
  ) : (
    <StaticOverlay appReady={props.appReady} onComplete={props.onComplete} />
  );
}

export function StartupPendingOverlay() {
  return (
    <View
      style={styles.overlay}
      accessibilityViewIsModal
      onLayout={hideNative}
    >
      <StartupLogo />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    zIndex: 1000,
    alignItems: "center",
    justifyContent: "center",
  },
});
