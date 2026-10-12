import React, { useRef, useState } from "react";
import { Animated, Image, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import SplashVideoOverlay from "./SplashVideoOverlay";
import SplashVideoBoundary from "./SplashVideoBoundary";
import { useStartupTransition } from "./useStartupTransition";

type Props = { animated: boolean; appReady: boolean; onComplete: () => void };

function StaticOverlay({ appReady, onComplete }: Omit<Props, "animated">) {
  const laidOut = useRef(false);
  const imageReady = useRef(false);
  const [surfaceReady, setSurfaceReady] = useState(false);
  const complete = React.useCallback(() => {
    void SplashScreen.hideAsync().catch(() => {});
    onComplete();
  }, [onComplete]);
  const opacity = useStartupTransition(
    true,
    appReady && surfaceReady,
    complete,
  );
  const reveal = () => {
    if (!laidOut.current || !imageReady.current) return;
    setSurfaceReady(true);
    void SplashScreen.hideAsync().catch(() => {});
  };
  return (
    <Animated.View
      style={[styles.overlay, { opacity }]}
      accessibilityViewIsModal
      onLayout={() => {
        laidOut.current = true;
        reveal();
      }}
    >
      <Image
        source={require("../../../assets/images/iconeNovoSemFundo.png")}
        style={{ width: "60%", height: "40%", maxWidth: 250, maxHeight: 250 }}
        resizeMode="contain"
        accessibilityLabel="NoPonto"
        onLoad={() => {
          imageReady.current = true;
          reveal();
        }}
        onError={() => {
          imageReady.current = true;
          reveal();
        }}
      />
    </Animated.View>
  );
}

export default function StartupOverlay(props: Props) {
  // Snapshot for this opening; settings changes apply to the next session.
  const [animated] = useState(props.animated);
  return (
    <SplashVideoBoundary onComplete={props.onComplete}>
      {animated ? (
        <SplashVideoOverlay
          appReady={props.appReady}
          onComplete={props.onComplete}
        />
      ) : (
        <StaticOverlay
          appReady={props.appReady}
          onComplete={props.onComplete}
        />
      )}
    </SplashVideoBoundary>
  );
}

export function StartupPendingOverlay() {
  return <View style={styles.overlay} accessibilityViewIsModal />;
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
